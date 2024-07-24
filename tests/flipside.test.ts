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
  getCommandPID,
  PropShopClient,
  stopProcess,
  VaultPnl,
  yyyymmdd,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, describe, it } from "@jest/globals";
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

  afterAll(async () => {
    const pid = await getCommandPID("test-flipside-client");
    await stopProcess(pid);
  });

  it("Query Flipside", async () => {
    // const signer = new PublicKey("moNza5soXeM88rHTr913Het6q2KNdmfMMi6a7xXQLKj");
    // const user = new PublicKey("BRksHqLiq2gvQw1XxsZq6DXZjD3GB5a9J63tUBgd6QS9");

    const signer = new PublicKey("sECa46k36BxV14ErxPZYLxaQgcEHYrNW3cQ5df6MZUD");
    const user = new PublicKey("2aMcirYcF9W8aTFem6qe8QtvfQ22SLY6KUe6yUQbqfHk");
    const eventName = "SettlePnlRecord";

    const events = await flipside.settlePnlEvents(
      signer,
      user,
      eventName,
      driftProgram as any,
      7,
    );

    const vaultPNL = VaultPnl.fromSettlePnlRecord(events);
    const start = vaultPNL.startDate()
      ? yyyymmdd(vaultPNL.startDate()!)
      : "undefined";
    const end = vaultPNL.endDate()
      ? yyyymmdd(vaultPNL.endDate()!)
      : "undefined";

    // $-24082714.53058505 pnl, 1789 events, from 2024/07/16 to 2024/07/24
    console.log(
      `$${vaultPNL.cumulativePNL()} pnl, ${events.length} events, from ${start} to ${end}`,
    );
  }, 600_000);
});
