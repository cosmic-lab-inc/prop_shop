import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ConfirmOptions, Connection, Keypair } from "@solana/web3.js";
import { RPC_URL } from "../.jest/env";
import {
  getCommandPID,
  PropShopClient,
  stopProcess,
  TxClient,
  VaultPnl,
  yyyymmdd,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, beforeAll, describe, it } from "@jest/globals";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import { decodeName, SettlePnlRecord } from "@drift-labs/sdk";

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
    disableCache: true,
    skipFetching: true,
  });

  beforeAll(async () => {
    await client.initialize();
  });

  afterAll(async () => {
    await client.shutdown();
    const pid = await getCommandPID("test-tx-client");
    await stopProcess(pid);
  });

  it("RPC Transactions", async () => {
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
      console.log(`RPC returned ${events.length} events`);
      const data: SettlePnlRecord[] = events.map(
        (event) => event.data as SettlePnlRecord,
      );

      const vaultPNL = VaultPnl.fromSettlePnlRecord(data);
      const start = vaultPNL.startDate()
        ? yyyymmdd(vaultPNL.startDate()!)
        : "undefined";
      const end = vaultPNL.endDate()
        ? yyyymmdd(vaultPNL.endDate()!)
        : "undefined";
      console.log(
        `$${vaultPNL.cumulativePNL()} cum pnl from RPC, ${data.length} events, from ${start} to ${end}`,
      );
    }
  });

  // it("Shyft Transactions", async () => {
  //   const vaults = await client.fetchVaults();
  //   expect(vaults.length).toBeGreaterThan(0);
  //
  //   const vault = vaults.find(
  //     (v) => decodeName(v.account.name) === "Supercharger Vault",
  //   );
  //   if (vault) {
  //     const results = await TxClient.fetch(
  //       SHYFT_API_KEY,
  //       vault.account.user,
  //       connection,
  //       5_000,
  //     );
  //
  //     let total = 0;
  //     let good = 0;
  //     const data: SettlePnlRecord[] = [];
  //     for (const res of results) {
  //       if (res.success) {
  //         good++;
  //         for (const tx of res.result) {
  //           for (const event of tx.events) {
  //             if (event.name.includes("SettlePnlRecord")) {
  //               data.push(event.data as SettlePnlRecord);
  //             }
  //           }
  //         }
  //       }
  //       total++;
  //     }
  //     const vaultPNL = VaultPNL.fromSettlePnlRecord(data);
  //     const start = yyyymmdd(vaultPNL.startDate());
  //     const end = yyyymmdd(vaultPNL.endDate());
  //     console.log(
  //       `$${vaultPNL.cumulativePNL()} cum pnl from Shyft, ${data.length} events, from ${start} to ${end}`,
  //     );
  //   }
  // });
});
