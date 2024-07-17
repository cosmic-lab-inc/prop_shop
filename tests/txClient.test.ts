import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ConfirmOptions, Connection, Keypair } from "@solana/web3.js";
import { RPC_URL, SHYFT_API_KEY } from "../.jest/env";
import { PropShopClient, TxClient } from "@cosmic-lab/prop-shop-sdk";
import { afterAll, beforeAll, describe, it } from "@jest/globals";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import { decodeName } from "@drift-labs/sdk";
import { exec } from "child_process";

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
    console.log("tx client test pid:", pid);
    await stopProcess(pid);
  });

  it("Fetch Transactions", async () => {
    const vaults = await client.fetchVaults();
    expect(vaults.length).toBeGreaterThan(0);

    const vault = vaults.find(
      (v) => decodeName(v.account.name) === "Supercharger Vault",
    );
    if (vault) {
      const res = await TxClient.fetch(SHYFT_API_KEY, {
        account: vault.account.user,
      });
      const events = [];
      for (const tx of res.result) {
        for (const event of tx.events) {
          console.log(event);
        }
      }
    }
  });
});

function getCommandPID(command: string): Promise<number> {
  return new Promise((resolve, reject) => {
    exec("ps -A", (error, stdout, stderr) => {
      if (error) {
        reject(`exec error: ${error}`);
        return;
      }
      if (stderr) {
        reject(`stderr: ${stderr}`);
        return;
      }

      const lines = stdout.split("\n");

      lines.forEach((line) => {
        // Unix 'ps -A' output, PID is the second column
        const parts = line.trim().split(/\s+/);

        for (const part of parts) {
          if (part.includes(command)) {
            const pid = parseInt(parts[0], 10);
            if (!isNaN(pid)) {
              console.log(`\"${command}\" pid: ${pid}, parts: ${parts}`);
              resolve(pid);
            }
          }
        }
      });

      reject(new Error("No process found"));
    });
  });
}

async function stopProcess(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`kill -9 ${pid}`, (killError, killStdout, killStderr) => {
      if (killStdout.length > 0) {
        console.log(`killStdout: ${killStdout}`);
      }
      if (killError || killStderr.length > 0) {
        reject(new Error(`Error killing process: ${killError || killStderr}`));
        return;
      }
      console.log(`Killed pid: ${pid}`);
      resolve();
    });
  });
}

// Graceful shutdown on SIGINT or SIGTERM
process.on("SIGINT", () => {
  console.log("SIGINT signal received");
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM signal received");
  stop();
  process.exit(0);
});
