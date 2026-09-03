# Why the bridge `gmp_receive` recipient check is safe

This note documents the reasoning behind the recipient check in
`programs/bridge/src/instructions/gmp_receive.rs`, in particular why it is safe
under permissionless message delivery and what constraints it places on remote
senders.

**Scope:** this note is only about bridge (token transfer) transactions. The
bridge is just one of the possible GMP message recipients: the mailbox delivers
messages to whatever program `message.recipient` points at, and each recipient
program validates its own accounts. `mint_message.recipient` discussed here is
a field inside the bridge's token-mint payload (the token recipient), not the
GMP message recipient.

## The check

```rust
require!(
    mint_message.recipient == ctx.accounts.recipient.key().to_bytes()
        || (ctx.accounts.recipient.key() == recipient_derived_token_account?
            && ctx.accounts.recipient.owner.key().to_bytes() == mint_message.recipient),
    BridgeError::RecipientMismatch
);
```

The `recipient` token account passed by the deliverer is accepted if either:

- **Branch A (exact match):** its address equals `mint_message.recipient`, i.e.
  the message recipient is itself a token account and tokens are minted directly
  to it; or
- **Branch B (ATA):** it is the canonical ATA derived for
  `mint_message.recipient` as owner (for this mint and token program), **and**
  its current authority is `mint_message.recipient`.

## Threat model

Message delivery is permissionless: unless the message sets
`destination_caller`, anyone can call the mailbox's `handle_message` and choose
the accounts forwarded to `gmp_receive` — including which `recipient` token
account is used. So the check must guarantee a safe outcome for *any*
deliverer, not just an honest one.

## Case 1: message recipient is a wallet address (the supported flow)

This is the only form the existing bridge flow produces: the token sender on
the EVM side sets the user's Solana account (a wallet, NOT a token account) as
the recipient.

- Branch A cannot be satisfied by an attacker: it would require a valid token
  account of this mint to exist *at the wallet's own address*, which cannot be
  created without the wallet's private key.
- Branch B pins the one canonical ATA of that wallet and additionally requires
  that the wallet is still its authority (protecting against an ATA whose
  authority was later reassigned).

Therefore, whoever delivers the message, tokens can only land in an account
controlled by the intended recipient. Front-running delivery achieves nothing
beyond paying the recipient's rent. **There is no vulnerability in this flow.**

## Case 2: message recipient is a token account address

Branch A allows a message to name a token account (TA) directly: honest
delivery mints straight to that account. No current sender uses this form; it
is kept for possible future bridge clients, and it can be used — with the
limitation and the requirements described below.

### The front-run limitation

Because delivery is permissionless, an attacker can deliver the message first
through Branch B instead of Branch A: they create the ATA derived for the *TA
address as owner* (the ATA program allows creating ATAs for arbitrary,
including off-curve, owners) and pass it as `recipient`. The tokens are then
minted to that *nested* ATA, whose authority is the TA address itself. Whether
they can be retrieved from there depends on what the TA is:

- **The TA is an ATA of some wallet.** The wallet can reclaim the tokens from
  the nested ATA with the ATA program's `RecoverNested` instruction. The funds
  remain recoverable; the front-run only costs the user an extra transaction.
- **The TA is NOT an ATA** (e.g. created from a keypair). `RecoverNested` does
  not apply, and only someone still holding the account's original keypair
  (typically discarded after creation) could sign as the nested ATA's
  authority. The tokens are effectively lost.

### Requirements for future bridge clients

A client that sets a token account as the recipient MUST satisfy at least one
of the following:

- the token account is an ATA, so that in the worst case the tokens can be
  reclaimed via `RecoverNested`;
- the message sets `destination_caller`, so that no third party can deliver it.
  Note that this alone is not enough: `destination_caller` only restricts *who*
  may deliver the message, it does not validate which `recipient` account that
  caller passes, so the designated caller could still (mistakenly or
  maliciously) deliver into the nested ATA. A non-ATA token account recipient
  is therefore tolerable only when the `destination_caller` is trusted to pass
  the correct account — e.g. it is the recipient themselves (who can only harm
  themselves), or a program whose PDA signs the delivery and which verifies the
  recipient account before calling the mailbox.

## Conclusion

For wallet recipients — the only form the existing flow produces, since the EVM
side always sets the user's wallet address — the check guarantees the tokens
land in an account the recipient controls, whoever delivers the message, so no
current sender is affected. Token account recipients are reserved for future
bridge clients and are safe under the requirements above: an ATA recipient
keeps the funds recoverable in the worst case, and a trusted
`destination_caller` removes third-party front-running (though the caller
itself must still pass the correct recipient account).
