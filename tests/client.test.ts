import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ConfirmOptions, Connection, Keypair } from "@solana/web3.js";
import { RPC_URL } from "../.jest/env";
import {
  getCommandPID,
  PropShopClient,
  stopProcess,
  TxClient,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, beforeAll, describe, it } from "@jest/globals";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import { assert } from "chai";

describe("TxClient", () => {
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

  const client = new PropShopClient({
    wallet,
    connection,
  });

  beforeAll(async () => {
    await client.initialize();
  });

  afterAll(async () => {
    console.log("shutting down test...");
    await client.shutdown();
    const pid = await getCommandPID("test-client");
    await stopProcess(pid);
  });

  it("Fund Overviews", async () => {
    await client.fetchFundOverviews();
    console.log("fetched fund overviews");
    assert(true);
  });
});
