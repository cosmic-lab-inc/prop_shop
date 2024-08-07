import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ConfirmOptions,
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { FLIPSIDE_API_KEY, RPC_URL } from "../.jest/env";
import {
  DRIFT_IDL,
  DRIFT_PROGRAM_ID,
  FlipsideClient,
  PropShopClient,
  yyyymmdd,
} from "@cosmic-lab/prop-shop-sdk";
import { describe, it } from "@jest/globals";
import { DriftVaults } from "@drift-labs/vaults-sdk";

describe("Flipside", () => {
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    commitment: "confirmed",
  };

  const signer = Keypair.generate();
  const wallet = PropShopClient.keypairToWalletContextState(signer);
  const anchorWallet = PropShopClient.walletAdapterToAnchorWallet(wallet);

  const connection = new Connection(RPC_URL);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, opts);
  anchor.setProvider(provider);

  const program = anchor.workspace.DriftVaults as Program<DriftVaults>;
  const driftProgram = new anchor.Program(
    DRIFT_IDL,
    DRIFT_PROGRAM_ID,
    provider,
  );

  const flipside = new FlipsideClient(FLIPSIDE_API_KEY);

  it("Query Flipside", async () => {
    // Supercharger Vault
    // const user = new PublicKey("BRksHqLiq2gvQw1XxsZq6DXZjD3GB5a9J63tUBgd6QS9");
    // Turbocharger Vault
    const user = new PublicKey("2aMcirYcF9W8aTFem6qe8QtvfQ22SLY6KUe6yUQbqfHk");

    const vaultPNL = await flipside.settlePnlData(user, driftProgram as any, 7);

    const start = vaultPNL.startDate()
      ? yyyymmdd(vaultPNL.startDate()!)
      : "undefined";
    const end = vaultPNL.endDate()
      ? yyyymmdd(vaultPNL.endDate()!)
      : "undefined";

    console.log(
      `$${vaultPNL.cumulativePNL()} pnl, ${vaultPNL.data.length} events, from ${start} to ${end}`,
    );
  }, 600_000);
});
