import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import {
  driftVaults,
  FlipsideClient,
  msToMinutes,
  PropShopClient,
  RedisClient,
  yyyymmdd,
} from "@cosmic-lab/prop-shop-sdk";
import { Connection, Keypair } from "@solana/web3.js";

// 24 hours
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;
const DAYS_BACK = 30;
const FORCE_UPDATE = false;

// env in root of workspace
dotenv.config({
  path: "../../.env",
});

if (
  !process.env.REDIS_ENDPOINT ||
  !process.env.REDIS_PASSWORD ||
  !process.env.RPC_URL ||
  !process.env.FLIPSIDE_API_KEY
) {
  throw new Error("Missing variables in root .env");
}

const signer = Keypair.generate();
const wallet = PropShopClient.keypairToWalletContextState(signer);

const connection = new Connection(process.env.RPC_URL);

const client = new PropShopClient({
  wallet,
  connection,
  skipFetching: true,
  useProxyPrefix: true,
});

const redis = RedisClient.new({
  endpoint: process.env.REDIS_ENDPOINT,
  password: process.env.REDIS_PASSWORD,
});

const flipside = new FlipsideClient(process.env.FLIPSIDE_API_KEY);

const app = express();
const port = 8080;

app.use(express.json());
app.use(express.raw());

// CORS configuration
const corsOptions = {
  origin: "*",
};
app.use(cors(corsOptions));

app.use(async (_req, _res, next) => {
  if (!redis.connected) {
    await redis.connect();
  }
  next();
});

// query SettlePnlRecord events from Flipside historical transactions and store in Redis
async function update() {
  if (!redis.connected) {
    await redis.connect();
  }
  if (!client.vaultClient) {
    await client.initialize();
  }
  console.log("begin cache update...");
  const pre = Date.now();
  const vaults = await client.fetchVaults();

  for (const vault of vaults) {
    const vaultPnlKey = RedisClient.vaultPnlKey(vault.account.pubkey);
    const vaultLastUpdateKey = RedisClient.vaultLastUpdateKey(
      vault.account.pubkey,
    );

    const name = driftVaults.decodeName(vault.account.name);
    const lastUpdate = await redis.get(vaultLastUpdateKey);
    if (lastUpdate && !FORCE_UPDATE) {
      const lastUpdateMs = parseInt(lastUpdate);
      const diffMs = Date.now() - lastUpdateMs;
      if (diffMs < UPDATE_INTERVAL) {
        const minutes = msToMinutes(diffMs);
        console.log(
          `\"${name}\", ${vault.account.user.toString()}: skipping, last updated ${minutes} minutes ago`,
        );
        continue;
      }
    }

    const vaultStats = await client.vaultStats(vault.publicKey);
    if (
      vaultStats &&
      (vaultStats.lifetimePNL === 0 || vaultStats.netDeposits === 0)
    ) {
      console.log(
        `\"${name}\", ${vault.account.user.toString()}: skipping, no pnl history`,
      );
      const value = JSON.stringify([]);
      await redis.set(vaultPnlKey, value);
      await redis.set(vaultLastUpdateKey, Date.now().toString());
      continue;
    }

    if (!client.vaultClient) {
      throw new Error("vaultClient not initialized");
    }
    const driftProgram = client.vaultClient.driftClient.program;

    console.log(
      `fetching pnl data for \"${name}\" with user: ${vault.account.user.toString()}`,
    );
    const preQuery = Date.now();
    const pnl = await flipside.settlePnlData(
      vault.account.user,
      driftProgram as any,
      DAYS_BACK,
    );
    const start = pnl.startDate() ? yyyymmdd(pnl.startDate()!) : "undefined";
    const end = pnl.endDate() ? yyyymmdd(pnl.endDate()!) : "undefined";
    console.log(
      `\"${name}\": $${pnl.cumulativePNL()} pnl, ${pnl.data.length} events, from ${start} to ${end}, in ${msToMinutes(Date.now() - preQuery)} minutes`,
    );

    const value = JSON.stringify(pnl.data);
    await redis.set(vaultPnlKey, value);
    await redis.set(vaultLastUpdateKey, Date.now().toString());
  }
  console.log(
    `finished updating cache in ${msToMinutes(Date.now() - pre)} minutes`,
  );
}

// update every 180 minutes
async function start() {
  await client.initialize();
  await redis.connect();

  await update();
  setInterval(async () => {
    await update();
  }, UPDATE_INTERVAL);
}

process.on("SIGINT" || "SIGTERM" || "SIGKILL", async () => {
  await redis.disconnect();
  await client.shutdown();
  process.exit();
});

app.listen(port, async () => {
  await start();
  console.log(`Server listening at http://localhost:${port}`);
});
