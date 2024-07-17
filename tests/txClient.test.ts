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
import { decodeName, QUOTE_PRECISION, SettlePnlRecord } from "@drift-labs/sdk";

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

  const client = new PropShopClient(wallet, connection, true);

  beforeAll(async () => {
    await client.initialize();
  });

  afterAll(async () => {
    await client.shutdown();
    const pid = await getCommandPID("test-tx-client");
    await stopProcess(pid);
  });

  it("Fetch Transactions", async () => {
    const vaults = await client.fetchVaults();
    expect(vaults.length).toBeGreaterThan(0);

    const vault = vaults.find(
      (v) => decodeName(v.account.name) === "Supercharger Vault",
    );
    if (vault) {
      const events = await TxClient.txEvents(
        vault.account.user,
        "SettlePnlRecord",
        program as any,
        connection,
        5_000,
      );
      const pnls: {
        pnl: number;
        date: Date;
      }[] = [];
      let cum = 0;
      for (const event of events) {
        const data = event.data as SettlePnlRecord;
        const pnl = Number(data.pnl) / QUOTE_PRECISION.toNumber();
        const date = new Date(Number(data.ts) * 1000);
        pnls.push({ pnl, date });
        cum += pnl;
      }
      console.log(`cum pnl: $${cum}`);

      // const results = await TxClient.fetch(
      //   SHYFT_API_KEY,
      //   vault.account.user,
      //   connection,
      //   2000,
      // );
      // const events = [];
      // let total = 0;
      // let good = 0;
      // for (const res of results) {
      //   if (res.success) {
      //     good++;
      //     for (const tx of res.result) {
      //       for (const event of tx.events) {
      //         if (event.name.includes("SettlePnlRecord")) {
      //           console.log(event);
      //           events.push(event);
      //         }
      //       }
      //     }
      //   }
      //   total++;
      // }
      // console.log(`${good}/${total} tx responses succeeded`);
      // console.log(`${events.length} SettlePnlRecord events`);
    }
  });
});