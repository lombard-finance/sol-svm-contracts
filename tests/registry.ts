import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { Registry } from "../target/types/registry";
import { withBlockhashRetry } from "./utils/utils";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Ratio Oracle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Registry as Program<Registry>;

  let payer: Keypair = Keypair.generate();

  // Utility function for airdrops
  async function fundWallet(account, amount) {
    const publicKey = account.publicKey ? account.publicKey : account;

    const tx = await provider.connection.requestAirdrop(publicKey, amount);
    const lastBlockHash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: lastBlockHash.blockhash,
      lastValidBlockHeight: lastBlockHash.lastValidBlockHeight,
      signature: tx,
      nonceAccountPubkey: publicKey
    });
  }

  before(async () => {
    await fundWallet(payer, 25 * LAMPORTS_PER_SOL);
  });

  describe("Post message", function () {

    it("post JSON-serialized mnessage", async () => {
      const nonce: number = 5;
      const message = JSON.stringify({
        to: "0x312D22f2cC490B8511b1984D777433eaDd3376EC",
        tos_ack: "accepted"
      });
      const msgBytes = Buffer.from(message);
      const messagePDA = PublicKey.findProgramAddressSync(
          [Buffer.from("user_message"), payer.publicKey.toBuffer(), new BN(nonce).toBuffer("be", 4)],
          program.programId
        )[0];
      await withBlockhashRetry(() =>
        program.methods.postMessage(
          msgBytes, nonce
        )
        .accounts({
          payer: payer.publicKey,
          message: messagePDA,
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" })
      );
      const storedMessage = await provider.connection.getAccountInfo(messagePDA);
      expect(storedMessage.data).to.be.deep.eq(msgBytes);
    });
  });
});