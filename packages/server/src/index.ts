import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import {
  driftVaults,
  fetchDriftUserHistoricalPnl,
  PropShopClient,
  RedisClient,
} from "@cosmic-lab/prop-shop-sdk";
import { Connection, Keypair } from "@solana/web3.js";

// env in root of workspace
dotenv.config({
  path: "../../.env",
});

if (
  !process.env.REDIS_ENDPOINT ||
  !process.env.REDIS_PASSWORD ||
  !process.env.RPC_URL
) {
  throw new Error("Missing variables in root .env");
}

const signer = Keypair.generate();
const wallet = PropShopClient.keypairToWalletContextState(signer);

const connection = new Connection(process.env.RPC_URL);

const client = new PropShopClient(wallet, connection, true);

const redis = RedisClient.new({
  endpoint: process.env.REDIS_ENDPOINT,
  password: process.env.REDIS_PASSWORD,
});

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

// fetch vault PNL from Drift API and store in Redis
async function update() {
  if (!redis.connected) {
    await redis.connect();
  }
  console.log("begin cache update...");
  const start = new Date().getTime();
  const vaults = await client.fetchVaults();

  for (const vault of vaults) {
    const key = vault.account.pubkey.toString();
    const name = driftVaults.decodeName(vault.account.name);
    console.log(`cache \"${name}\" PNL`);
    const daysBack = 100;
    const pnl = await fetchDriftUserHistoricalPnl(
      vault.account.user.toString(),
      daysBack,
    );
    const value = JSON.stringify(pnl);
    await redis.set(key, value);
  }
  console.log(`finished updating cache in ${new Date().getTime() - start}ms`);
}

// update every 30 minutes
async function start() {
  await client.initialize();
  await redis.connect();

  await update();
  setInterval(
    async () => {
      await update();
    },
    30 * 60 * 1000,
  );
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
