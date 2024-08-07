import * as anchor from "@coral-xyz/anchor";
import {
  ConfirmOptions,
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { REDIS_ENDPOINT, REDIS_PASSWORD, RPC_URL } from "../.jest/env";
import {
  DriftMarketInfo,
  PropShopClient,
  ProxyClient,
  RedisClient,
  SerializedDriftMarketInfo,
  truncateNumber,
  yyyymmdd,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, beforeAll, describe, it } from "@jest/globals";
import { exec } from "child_process";
import { decodeName } from "@drift-labs/sdk";

function killProxy(): Promise<void> {
  // proxy runs on port 5173
  return new Promise((resolve, reject) => {
    exec("lsof -i:5173", (error, stdout, stderr) => {
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
        const regexForComma = /,/;
        const regexForWhitespace = /\s+/;
        const parts = line.trim().split(regexForComma);

        if (parts.length > 0 && !!parts[0]) {
          const spaceDelimited = parts[0].trim().split(regexForWhitespace);
          for (const spaceDe of spaceDelimited) {
            if (spaceDe.includes("*:5173")) {
              const pid = parseInt(spaceDelimited[1], 10);
              if (!isNaN(pid)) {
                console.log(`kill proxy pid: ${pid}, parts: ${spaceDelimited}`);
                resolve(stopProcess(pid));
                return;
              }
            }
          }
        }
      });

      resolve();
    });
  });
}

// Function to get all active PIDs
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
      console.log("Killed redis test pid");
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

  const redis = RedisClient.new({
    endpoint: REDIS_ENDPOINT,
    password: REDIS_PASSWORD,
  });

  const client = new PropShopClient({
    wallet,
    connection,
    skipFetching: true,
  });

  beforeAll(async () => {
    await client.initialize();
    await redis.connect();
  });

  afterAll(async () => {
    await client.shutdown();
    await redis.disconnect();
    await killProxy();
    const pid = await getCommandPID("test-redis");
    console.log("redis test pid:", pid);
    await stopProcess(pid);
  });

  it("Get Spot Markets", async () => {
    const raw = await ProxyClient.get("spotMarkets", true);
    const _spotMarkets: SerializedDriftMarketInfo[] | null = raw;
    const spotMarkets: DriftMarketInfo[] | undefined = _spotMarkets?.map(
      (m) => {
        return {
          marketIndex: m.marketIndex,
          oracle: new PublicKey(m.oracle),
          oracleSource: m.oracleSource,
        };
      },
    );
    console.log(spotMarkets);
  });

  it("Set & Get Vault PNLs", async () => {
    const vaults = await client.fetchVaults();
    expect(vaults.length).toBeGreaterThan(0);

    for (const vault of vaults) {
      const key = vault.account.pubkey.toString();
      // await redis.delete(key);
      const name = decodeName(vault.account.name);
      const daysBack = 30;
      const pnl = await ProxyClient.performance({
        key: RedisClient.vaultPnlFromDriftKey(vault.publicKey),
        usePrefix: true,
      });

      if (pnl.data.length > 0) {
        const start = pnl.startDate()
          ? yyyymmdd(pnl.startDate()!)
          : "undefined";
        const end = pnl.endDate() ? yyyymmdd(pnl.endDate()!) : "undefined";
        console.log(
          `${name} pnl from ${start} to ${end} amd ${pnl.data.length} trades: $${truncateNumber(pnl.cumulativePNL(), 2)}`,
        );
      }
    }
  });
});
