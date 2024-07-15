import * as anchor from "@coral-xyz/anchor";
import { ConfirmOptions, Connection, Keypair } from "@solana/web3.js";
import { REDIS_ENDPOINT, REDIS_PASSWORD, RPC_URL } from "../.jest/env";
import {
  HistoricalSettlePNL,
  PropShopClient,
  RedisClient,
  VaultPNL,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, beforeAll, describe, it } from "@jest/globals";
import { Vault } from "../../drift-vaults/ts/sdk";
import { decodeName } from "@drift-labs/sdk";
import { exec } from "child_process";
import os from "os";

// Function to get all active PIDs
function getAllActivePIDs(): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "tasklist" : "ps -A";

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`exec error: ${error}`);
        return;
      }
      if (stderr) {
        reject(`stderr: ${stderr}`);
        return;
      }

      const lines = stdout.split("\n");
      const pids: number[] = [];

      lines.forEach((line) => {
        if (isWindows) {
          // Windows 'tasklist' output, PID is at fixed position
          const match = line.match(/\d+/);
          if (match) pids.push(parseInt(match[0], 10));
        } else {
          // Unix 'ps -A' output, PID is the second column
          const parts = line.trim().split(/\s+/);
          for (const part of parts) {
            if (part.includes("concurrently")) {
              console.log(`pid: ${parts[0]}, part: ${part}`);
            }
          }
          const pid = parseInt(parts[0], 10);
          if (!isNaN(pid)) pids.push(pid);
        }
      });
      resolve(pids);
    });
  });
}

describe("Redis", () => {
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

  const client = new PropShopClient(wallet, connection);
  let redis: RedisClient;

  beforeAll(async () => {
    redis = await RedisClient.new(REDIS_ENDPOINT, REDIS_PASSWORD);
    await client.initialize();
  });

  afterAll(async () => {
    process.kill(process.pid, "SIGINT");
  });

  it("PIDs", async () => {
    const pids = await getAllActivePIDs();
    // for (const pid of pids) {
    //   console.log(pid);
    // }
  });

  it("Set & Get Vault PNL", async () => {
    const vaults = await client.fetchVaults();
    expect(vaults.length).toBeGreaterThan(0);

    let vault: Vault | undefined;
    for (const v of vaults) {
      if (decodeName(v.account.name) === "Supercharger Vault") {
        vault = v.account;
      }
    }
    if (!vault) {
      throw new Error("No Supercharger Vault found");
    }

    const key = vault.pubkey.toString();
    const preGet = new Date().getTime();
    await redis.get(key);
    // takes about 250ms
    console.log(`got pnl from redis in ${new Date().getTime() - preGet}ms`);

    const daysBack = 30;
    const pnl = await client.fetchHistoricalPNL(vault, daysBack, true);
    console.log(`${pnl.length} pnl entries`);
    const value = JSON.stringify(pnl);
    await redis.set(key, value);
    const get = await redis.get(key);
    if (!get) {
      throw new Error("Failed to get pnl from redis");
    }
    expect(get).not.toBeNull();
    expect(get).toBe(value);

    const data: HistoricalSettlePNL[] = JSON.parse(get);
    if (data.length > 0) {
      const hydrated = new VaultPNL(data);
      console.log("pnl start date:", hydrated.dateString(hydrated.startDate()));
      console.log("pnl end date:", hydrated.dateString(hydrated.endDate()));
      console.log(
        `cumulative pnl over ${data.length} trades: $${hydrated.cumulativePNL()}`,
      );
    }
  });
});
