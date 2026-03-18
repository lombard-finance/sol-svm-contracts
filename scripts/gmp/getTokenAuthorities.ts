import { PublicKey } from "@solana/web3.js";

const TOKEN_AUTHORITY_SEED = Buffer.from("token_authority");

// Provide instructions.
if (process.argv.indexOf("--help") > -1) {
  console.log(`Usage:
    ASSET_ROUTER_PROGRAM_ID=<asset_router_program_id> BRIDGE_PROGRAM_ID=<bridge_program_id> yarn gmp_getTokenAuthorities

  Optional fallbacks:
    - If either program id is missing, script falls back to the address in the corresponding IDL.`);
  process.exit(0);
}

const assetRouterIdl = require("../../target/idl/asset_router.json");
const bridgeIdl = require("../../target/idl/bridge.json");

const assetRouterProgramId = new PublicKey(
  process.env.ASSET_ROUTER_PROGRAM_ID || assetRouterIdl.address,
);
const bridgeProgramId = new PublicKey(process.env.BRIDGE_PROGRAM_ID || bridgeIdl.address);

const assetRouterTokenAuthority = PublicKey.findProgramAddressSync(
  [TOKEN_AUTHORITY_SEED],
  assetRouterProgramId,
)[0];
const bridgeTokenAuthority = PublicKey.findProgramAddressSync([TOKEN_AUTHORITY_SEED], bridgeProgramId)[0];

console.log("AssetRouter program id:", assetRouterProgramId.toBase58());
console.log("AssetRouter token authority:", assetRouterTokenAuthority.toBase58());
console.log("Bridge program id:", bridgeProgramId.toBase58());
console.log("Bridge token authority:", bridgeTokenAuthority.toBase58());
