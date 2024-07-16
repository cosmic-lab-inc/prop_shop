import express from "express";
import cors from "cors";
import { handleHistoricalPnl } from "./pnl";
import { RedisClient } from "@cosmic-lab/prop-shop-sdk";
import dotenv from "dotenv";

// env in root of workspace
dotenv.config({
  path: "../../.env",
});

const app = express();
const port = 5173;

app.use(express.json());
app.use(express.raw());

if (!process.env.REDIS_ENDPOINT || !process.env.REDIS_PASSWORD) {
  throw new Error("Missing REDIS_ENDPOINT or REDIS_PASSWORD in root .env");
}

const redis = RedisClient.new({
  endpoint: process.env.REDIS_ENDPOINT!,
  password: process.env.REDIS_PASSWORD!,
});

// CORS configuration
const corsOptions = {
  origin: "*",
};
app.use(cors(corsOptions));

app.use(async (req, res, next) => {
  if (!redis.connected) {
    await redis.connect();
  }
  next();
});

app.post("/api/performance", async (req, res) => {
  try {
    const { vaultKey, vaultUser, daysBack } = req.body;
    let data = await redis.get(vaultKey);
    // let data;
    if (!data) {
      data = JSON.stringify(await handleHistoricalPnl(vaultUser, daysBack));
    }
    res.send(data);
  } catch (e: any) {
    console.error(e);
    throw new Error(e);
  }
});

app.post("/api/set", async (req, res) => {
  try {
    const { key, value } = req.body;
    const response = await redis.set(key, value);
    res.send(response);
  } catch (e: any) {
    console.error(e);
    throw new Error(e);
  }
});

app.post("/api/get", async (req, res) => {
  try {
    const { key } = req.body;
    const response = await redis.get(key);
    res.send(response);
  } catch (e: any) {
    console.error(e);
    throw new Error(e);
  }
});

app.listen(port, async () => {
  // await redis.connect();
  console.log(`Proxy server listening at http://localhost:${port}`);
});
