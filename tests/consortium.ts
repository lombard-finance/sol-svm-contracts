import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Consortium } from "../target/types/consortium";
import { sha256 } from "js-sha256";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { withBlockhashRetry } from "./utils/utils";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Consortium", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Consortium as Program<Consortium>;

  let payer: Keypair;
  let user: Keypair;
  let admin: Keypair;
  let configPDA: PublicKey;

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

  payer = Keypair.generate();
  user = Keypair.generate();
  admin = Keypair.generate();
  const t = Keypair.generate();

  before(async () => {
    await fundWallet(payer, 25 * LAMPORTS_PER_SOL);
    await fundWallet(user, 25 * LAMPORTS_PER_SOL);
    await fundWallet(admin, 25 * LAMPORTS_PER_SOL);

    await fundWallet(t, 25 * LAMPORTS_PER_SOL);

    [configPDA] = PublicKey.findProgramAddressSync([Buffer.from("consortium_config")], program.programId);

  });

  describe("Initialize and set roles", function () {
    it("initialize: fails when payer is not deployer", async () => {
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
          withBlockhashRetry(() =>
            program.methods
          .initialize(admin.publicKey)
          .accounts({
            deployer: payer.publicKey,
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
          )
        ).to.be.rejectedWith("Unauthorized function call");
    });

    it("initialize: successful", async () => {
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await withBlockhashRetry(() =>
        program.methods
        .initialize(admin.publicKey)
        .accounts({
          deployer: provider.wallet.publicKey,
        })
        .signers([Keypair.fromSecretKey(provider.wallet.payer.secretKey)])
        .rpc({ commitment: "confirmed" })
      );
      
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.eq(admin.publicKey.toBase58());
    });

    it("transferOwnership: failure from unauthorized party", async () => {
      await expect(
          withBlockhashRetry(() =>
            program.methods
          .transferOwnership(payer.publicKey)
          .accounts({ payer: payer.publicKey})
          .signers([payer])
          .rpc({ commitment: "confirmed" })
          )
        ).to.be.rejectedWith("Unauthorized function call");
    });

    it("transferOwnership: successful by admin", async () => {
      await withBlockhashRetry(() =>
        program.methods
        .transferOwnership(payer.publicKey)
        .accounts({ payer: admin.publicKey})
        .signers([admin])
        .rpc({ commitment: "confirmed" })
      );
      
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(admin.publicKey.toBase58());
      expect(cfg.pendingAdmin.toBase58()).to.be.equal(payer.publicKey.toBase58());
    });

    it("acceptOwnership: failure from unauthorized party", async () => {
      await expect(
          withBlockhashRetry(() =>
            program.methods.acceptOwnership().accounts({ payer: user.publicKey}).signers([user]).rpc({ commitment: "confirmed" })
          )
        ).to.be.rejectedWith("Unauthorized function call");
    });

    it("acceptOwnership: successful by pending admin", async () => {
      await withBlockhashRetry(() =>
        program.methods
        .acceptOwnership()
        .accounts({ payer: payer.publicKey})
        .signers([payer])
        .rpc({ commitment: "confirmed" })
      );
      
      const cfg = await program.account.config.fetch(configPDA);
      expect(cfg.admin.toBase58()).to.be.equal(payer.publicKey.toBase58());

      // Reverse it for remainder of test.
      const tx2 = await withBlockhashRetry(() =>
        program.methods
        .transferOwnership(admin.publicKey)
        .accounts({ payer: payer.publicKey})
        .signers([payer])
        .rpc({ commitment: "confirmed" })
      );
      await provider.connection.confirmTransaction(tx2);
      const tx3 = await withBlockhashRetry(() =>
        program.methods
        .acceptOwnership()
        .accounts({ payer: admin.publicKey})
        .signers([admin])
        .rpc({ commitment: "confirmed" })
      );
      await provider.connection.confirmTransaction(tx3);
      const cfg2 = await program.account.config.fetch(configPDA);
      expect(cfg2.admin.toBase58()).to.be.equal(admin.publicKey.toBase58());
    });

  });

  describe("Consortium actions", () => {
    const initialValset = Buffer.from(
      "4aab1d6f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000004104ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001",
      "hex"
    );
    const nextValset = Buffer.from(
      "4aab1d6f000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000002a0000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000004104ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000041049d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000410420b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001",
      "hex"
    );

    const nextValsetHash = sha256(nextValset);
    console.log("valsetPayloadHash", nextValsetHash);
    const nextValsetHashBz = Array.from(Uint8Array.from(Buffer.from(nextValsetHash, "hex")));

    const initialValidators = [
      Buffer.from(
        "ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4",
        "hex"
      ),
      Buffer.from(
        "9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb",
        "hex"
      )
    ];
    const nextValidators = [
      Buffer.from(
        "ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4",
        "hex"
      ),
      Buffer.from(
        "9d9031e97dd78ff8c15aa86939de9b1e791066a0224e331bc962a2099a7b1f0464b8bbafe1535f2301c72c2cb3535b172da30b02686ab0393d348614f157fbdb",
        "hex"
      ),
      Buffer.from(
        "20b871f3ced029e14472ec4ebc3c0448164942b123aa6af91a3386c1c403e0ebd3b4a5752a2b6c49e574619e6aa0549eb9ccd036b9bbc507e1f7f9712a236092",
        "hex"
      )
    ];
    const initialWeights = [new BN(1), new BN(1)];
    const nextWeights = [new BN(1), new BN(1), new BN(1)];

    const sigs = [
      Array.from(Uint8Array.from(Buffer.from(
        "dd9cbefb2570d94d82095766a142e7f3eb115313f364db7c0fa01ac246aca5ff3654b5f6dbcdbfe086c86e5e7ae8e5178986944dafb077303a99e2bd75663c86",
        "hex"
      ))),
      Array.from(Uint8Array.from(Buffer.from(
        "7474df436d805d9bce1ae640e7802c88e655496f008f428fd953f623a054d7782841f70a5c4ffa6da53ea661762967eb628b81ad6a8d6321f83fb66884855e3a",
        "hex"
      ))),
    ];

    // todo: add test with wrong sigs
    const wrongSigs = [
      Buffer.from(
        "ad9cbefb2570d94d82095766a142e7f3eb115313f364db7c0fa01ac246aca5ff3654b5f6dbcdbfe086c86e5e7ae8e5178986944dafb077303a99e2bd75663c86",
        "hex"
      ),
      Buffer.from(
        "a474df436d805d9bce1ae640e7802c88e655496f008f428fd953f623a054d7782841f70a5c4ffa6da53ea661762967eb628b81ad6a8d6321f83fb66884855e3a",
        "hex"
      )
    ];

    //Only admin can set initial valset
    describe("Initial valset by admin", function () {
      it("setInitialValset: rejects when called by not admin", async () => {
        await expect(
            withBlockhashRetry(() =>
              program.methods
            .setInitialValset(initialValset)
            .accounts({
              admin: payer.publicKey,
            })
            .signers([payer])
            .rpc({ commitment: "confirmed" })
            )
          ).to.be.rejectedWith("An address constraint was violated");
      });

      it("setInitialValset: successful by admin", async () => {
        await withBlockhashRetry(() =>
          program.methods
            .setInitialValset(initialValset)
            .accounts({
                admin: admin.publicKey,
            })
          .signers([admin])
          .rpc({ commitment: "confirmed" })
        );
        

        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.currentEpoch.toString()).to.be.eq("1");
        expect(cfg.currentWeights.map(w => w.toString())).to.have.deep.members(initialWeights.map(w => w.toString()));
        expect(cfg.currentWeightThreshold.toString()).to.be.eq("1");
        expect(cfg.currentValidators.map(v => Buffer.from(v))).to.have.deep.members(initialValidators);
      });

      it("setInitialValset: rejects when already set", async () => {
        await expect(
            withBlockhashRetry(() =>
              program.methods
            .setInitialValset(initialValset)
            .accounts({ admin: admin.publicKey})
            .signers([admin])
            .rpc({ commitment: "confirmed" })
            )
          ).to.be.rejectedWith("Validator set already set");
      });
    });

    //Any other account can set next valset with valid signatures
    describe("Next valset by anyone with valid signatures", function () {

      let sessionPDA: PublicKey;
      const sessionPayloadPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("session_payload"), payer.publicKey.toBuffer(), Buffer.from(nextValsetHash, "hex")],
        program.programId
      )[0];

      const validatedPayloadPDA = PublicKey.findProgramAddressSync(
        [Buffer.from("validated_payload"), Buffer.from(nextValsetHash, "hex")],
        program.programId
      )[0];


      before(async function () {
        const cfg = await program.account.config.fetch(configPDA);
        const currentEpoch = cfg.currentEpoch
        sessionPDA = PublicKey.findProgramAddressSync(
          [Buffer.from("session"), currentEpoch.toBuffer("be", 8), payer.publicKey.toBuffer(), Buffer.from(nextValsetHash, "hex")],
          program.programId
        )[0];
      });

      it("create session", async () => {
        await withBlockhashRetry(() =>
          program.methods
            .createSession(nextValsetHashBz)
            .accounts({
              payer: payer.publicKey,
              session: sessionPDA,
            })
            .signers([payer])
            .rpc({ commitment: "confirmed" })
        );
        
        // TODO: check session is created
      });

      it("post session signatures", async () => {
        await withBlockhashRetry(() =>
          program.methods
          .postSessionSignatures(nextValsetHashBz, sigs, [new BN(0), new BN(1)])
          .accounts({
            payer: payer.publicKey,
            session: sessionPDA
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
        );
        

        // TODO: check session is signed
      });

      it("finalize session", async () => {
        await withBlockhashRetry(() =>
          program.methods
          .finalizeSession(nextValsetHashBz)
          .accounts({
            payer: payer.publicKey,
            session: sessionPDA,
            validatedPayload: validatedPayloadPDA,
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
        );
        
      
        // TODO: check session account is closed
        // TODO: check validated payload account is created
      });

      it("post session payload", async () => {
        // split it in two chunks to test chunked submission
        let nextValsetFirstChunk = Buffer.from(nextValset.subarray(0, nextValset.length / 2));
        let nextValsetSecondChunk = Buffer.from(nextValset.subarray(nextValset.length / 2, nextValset.length));
        await withBlockhashRetry(() =>
          program.methods
          .postSessionPayload(nextValsetHashBz, nextValsetFirstChunk, nextValset.length)
          .accounts({
            payer: payer.publicKey,
            sessionPayload: sessionPayloadPDA,
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
        );
        
        await withBlockhashRetry(() =>
          program.methods
          .postSessionPayload(nextValsetHashBz, nextValsetSecondChunk, nextValset.length)
          .accounts({
            payer: payer.publicKey,
            sessionPayload: sessionPayloadPDA,
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
        );
      });

      it("update valset", async () => {
        await withBlockhashRetry(() =>
          program.methods
          .updateValset(nextValsetHashBz)
          .accounts({
            payer: payer.publicKey,
            validatedPayload: validatedPayloadPDA,
            sessionPayload: sessionPayloadPDA,
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" })
        );
        
        const cfg = await program.account.config.fetch(configPDA);
        expect(cfg.currentEpoch.toString()).to.be.eq("2");
        expect(cfg.currentWeights.map(w => w.toString())).to.have.deep.members(nextWeights.map(w => w.toString()));
        expect(cfg.currentWeightThreshold.toString()).to.be.eq("2");
        expect(cfg.currentValidators.map(v => Buffer.from(v))).to.have.deep.members(nextValidators);

        // TODO: check session payload account is closed
        const sessionPayloadInfo = await provider.connection.getAccountInfo(sessionPayloadPDA);
        expect(sessionPayloadInfo).to.be.null;
      });
    });
  });
});
