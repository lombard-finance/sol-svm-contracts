import { ethers } from "ethers";
import { sha256 } from "js-sha256";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as borsh from "borsh";
import nacl from "tweetnacl";
import * as anchor from "@coral-xyz/anchor";

export const MINT_SELECTOR: Buffer = Buffer.from([0x15, 0x5b, 0x6b, 0x13]);
export const REDEEM_SELECTOR: Buffer = Buffer.from([0xaa, 0x3d, 0xb8, 0x5f]);
export const REDEEM_NATIVE_FOR_BTC_SELECTOR: Buffer = Buffer.from([0x4e, 0x3e, 0x50, 0x47]);
export const DEPOSIT_SELECTOR: Buffer = Buffer.from([0x4e, 0x3e, 0x50, 0x47]);

export class MintMsg {
  selector: Buffer;
  token: Buffer;
  recipient: Buffer;
  amount: bigint;

  constructor(token: Buffer, recipient: Buffer, amount: bigint, prefix: Buffer = MINT_SELECTOR) {
    this.selector = prefix;
    this.token = token;
    this.recipient = recipient;
    this.amount = amount;
  }

  toBuffer() {
    return Buffer.concat([
      this.selector,
      Buffer.from(
        ethers.AbiCoder.defaultAbiCoder()
          .encode(["bytes32", "bytes32", "uint256"], [this.token, this.recipient, this.amount])
          .slice(2),
        "hex"
      )
    ]);
  }
}

export class RedeemMsg {
  chain: Buffer;
  token: Buffer;
  sender: Buffer;
  recipient: Buffer;
  amount: bigint;

  constructor(chain: Buffer, token: Buffer, sender: Buffer, recipient: Buffer, amount: bigint) {
    this.chain = chain;
    this.token = token;
    this.sender = sender;
    this.recipient = recipient;
    this.amount = amount;
  }

  toBuffer() {
    return Buffer.concat([
      REDEEM_SELECTOR,
      Buffer.from(
        ethers.AbiCoder.defaultAbiCoder()
          .encode(
            ["bytes32", "bytes32", "bytes32", "bytes", "uint256"],
            [this.chain, this.token, this.sender, this.recipient, this.amount]
          )
          .slice(2),
        "hex"
      )
    ]);
  }

  static from(msg: Buffer): RedeemMsg {
    const hex = msg.slice(4);
    const result = ethers.AbiCoder.defaultAbiCoder().decode(["bytes32", "bytes32", "bytes32", "bytes", "uint256"], hex);

    return new RedeemMsg(
      Buffer.from(result[0].slice(2), "hex"),
      Buffer.from(result[1].slice(2), "hex"),
      Buffer.from(result[2].slice(2), "hex"),
      Buffer.from(result[3].slice(2), "hex"),
      result[4]
    );
  }
}

export class DepositMsg {
  chain: Buffer;
  token: Buffer;
  sender: Buffer;
  recipient: Buffer;
  amount: bigint;

  constructor(chain: Buffer, token: Buffer, sender: Buffer, recipient: Buffer, amount: bigint) {
    this.chain = chain;
    this.token = token;
    this.sender = sender;
    this.recipient = recipient;
    this.amount = amount;
  }

  toBuffer() {
    return Buffer.concat([
      DEPOSIT_SELECTOR,
      Buffer.from(
        ethers.AbiCoder.defaultAbiCoder()
          .encode(
            ["bytes32", "bytes32", "bytes32", "bytes32", "uint256"],
            [this.chain, this.token, this.sender, this.recipient, this.amount]
          )
          .slice(2),
        "hex"
      )
    ]);
  }

  static from(msg: Buffer): DepositMsg {
    const hex = msg.slice(4);
    const result = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "uint256"],
      hex
    );

    return new DepositMsg(
      Buffer.from(result[0].slice(2), "hex"),
      Buffer.from(result[1].slice(2), "hex"),
      Buffer.from(result[2].slice(2), "hex"),
      Buffer.from(result[3].slice(2), "hex"),
      result[4]
    );
  }
}

export class RedeemNativeForBtcMsg {
  sender: Buffer;
  recipient: Buffer;
  amount: bigint;

  constructor(sender: Buffer, recipient: Buffer, amount: bigint) {
    this.sender = sender;
    this.recipient = recipient;
    this.amount = amount;
  }

  toBuffer() {
    return Buffer.concat([
      REDEEM_NATIVE_FOR_BTC_SELECTOR,
      Buffer.from(
        ethers.AbiCoder.defaultAbiCoder()
          .encode(["bytes32", "bytes", "uint256"], [this.sender, this.recipient, this.amount])
          .slice(2),
        "hex"
      )
    ]);
  }
}

// mainnet chain id which is default when compiled with default features
export const LCHAIN_ID = Buffer.from("02296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0", "hex");
export const LCHAIN_ID_BZ = Array.from(Uint8Array.from(LCHAIN_ID));
export const LEDGER_LCHAIN_ID = Buffer.from(sha256("ledger-lchain-id"), "hex");
export const LEDGER_LCHAIN_ID_BZ = Array.from(Uint8Array.from(LEDGER_LCHAIN_ID));
export const LEDGER_MAILBOX_ADDRESS = Buffer.from(
  "000000000000000000000000cc0bbbee7c9dd4f3f30e01c7f1fcbeb839f30c47",
  "hex"
);
export const LEDGER_MAILBOX_ADDRESS_BZ = Array.from(Uint8Array.from(LEDGER_MAILBOX_ADDRESS));
export const BITCOIN_LCHAIN_ID = Buffer.from(sha256("bitcoin-lchain-id"), "hex");
export const BITCOIN_LCHAIN_ID_BZ = Array.from(Uint8Array.from(BITCOIN_LCHAIN_ID));
export const ASSETS_MODULE_ADDRESS = Array.from(
  Uint8Array.from(Buffer.from("0000000000000000000000008bf729ffe074caee622c02928173467e658e19e2", "hex"))
);
export const BTCSTAKING_MODULE_ADDRESS = Buffer.from(
  "00000000000000000000000089e3e4e7a699d6f131d893aeef7ee143706ac23a",
  "hex"
);
export const BTCSTAKING_MODULE_ADDRESS_BZ = Array.from(Uint8Array.from(BTCSTAKING_MODULE_ADDRESS));
export const ZERO_BUFFER32 = Buffer.alloc(32, 0);

const FEE_PERMIT_PREFIX = "04acbbb2";

export class FeePermit {
  prefix: string;
  chainId: Buffer;
  programId: PublicKey;
  maxFees: number;
  expire: number;

  constructor(
    programId: PublicKey,
    chainId: Buffer,
    maxFees: number,
    expire: number,
    prefix: string = FEE_PERMIT_PREFIX
  ) {
    this.prefix = prefix;
    this.chainId = chainId;
    this.programId = programId;
    this.maxFees = maxFees;
    // Hardcode end of unix epoch so tests always pass
    this.expire = expire;
  }

  hex(): string {
    return Buffer.from(
      borsh.serialize(
        {
          struct: {
            prefix: {
              array: {
                type: "u8",
                len: this.prefix.length / 2
              }
            },
            chainId: {
              array: {
                type: "u8",
                len: 16
              }
            },
            programId: {
              array: {
                type: "u8",
                len: 16
              }
            },
            maxFees: "u64",
            expire: "u64"
          }
        },
        {
          prefix: Buffer.from(this.prefix, "hex"),
          chainId: this.chainId.slice(0, 16),
          programId: this.programId.toBuffer().slice(0, 16),
          maxFees: this.maxFees,
          expire: this.expire
        }
      )
    ).toString("hex");
  }

  bytes(): Uint8Array {
    return Uint8Array.from(Buffer.from(this.hex(), "hex"));
  }

  signature(secretKey: Uint8Array): Uint8Array {
    return nacl.sign.detached(this.bytes(), secretKey);
  }

  maxFeesBigInt(): bigint {
    return BigInt(this.maxFees);
  }
}

export async function fundWallet(account, amount) {
  const provider = anchor.AnchorProvider.env();
  const publicKey = account.publicKey ? account.publicKey : account;

  const lamportsAmount = amount * LAMPORTS_PER_SOL;
  const tx = await provider.connection.requestAirdrop(publicKey, lamportsAmount);
  const lastBlockHash = await provider.connection.getLatestBlockhash();

  await provider.connection.confirmTransaction({
    blockhash: lastBlockHash.blockhash,
    lastValidBlockHeight: lastBlockHash.lastValidBlockHeight,
    signature: tx,
    nonceAccountPubkey: publicKey
  });
}
