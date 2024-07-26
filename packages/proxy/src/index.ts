import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { RedisClient } from "@cosmic-lab/prop-shop-sdk";

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

app.use(async (_req, _res, next) => {
  if (!redis.connected) {
    await redis.connect();
  }
  next();
});

app.post("/api/performance", async (req, res) => {
  try {
    const { vaultKey } = req.body;
    const data = await redis.get(vaultKey);
    if (!data) {
      console.log(`vault ${vaultKey.toString()} PNL not cached`);
      res.send(JSON.stringify([]));
    } else {
      res.send(data);
    }
  } catch (e: any) {
    console.error(`error in proxy: ${e}`);
    throw new Error(`error in proxy: ${e}`);
  }
});

app.post("/api/set", async (req, res) => {
  try {
    const { key, value } = req.body;
    const response = await redis.set(key, value);
    res.send(response);
  } catch (e: any) {
    console.error(`error in proxy: ${e}`);
    throw new Error(`error in proxy: ${e}`);
  }
});

app.post("/api/get", async (req, res) => {
  try {
    const { key } = req.body;
    const response = await redis.get(key);
    res.send(response);
  } catch (e: any) {
    console.error(`error in proxy: ${e}`);
    throw new Error(`error in proxy: ${e}`);
  }
});

process.on("SIGINT" || "SIGTERM" || "SIGKILL", async () => {
  await redis.disconnect();
  process.exit();
});

app.listen(port, async () => {
  await redis.connect();
  console.log(`Proxy server listening at http://localhost:${port}`);
});
