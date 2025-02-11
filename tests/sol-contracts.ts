import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolContracts } from "../target/types/sol_contracts";

describe("sol-contracts", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.SolContracts as Program<SolContracts>;

    it("is initialized", async () => {
        const tx = await program.methods.initialize().rpc();
        console.log("Your transaction signature", tx);
    });

    it("allows admin to toggle withdrawals", async () => {
      

    });

    it("should not allow anyone else to toggle withdrawals", async () => {

    });
});
