import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ConfirmOptions } from "@solana/web3.js";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import { RedisClient } from "../packages/sdk/src/redisClient";
import { REDIS_ENDPOINT, REDIS_PASSWORD } from "../.jest/env";

describe("Redis", () => {
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    commitment: "confirmed",
  };

  const provider = anchor.AnchorProvider.local(undefined, opts);
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace.DriftVaults as Program<DriftVaults>;

  // const signer = Keypair.generate();
  // const wallet = PropShopClient.keypairToWalletContextState(signer, connection);
  // const client = new PropShopClient(wallet, connection);
  let redis: RedisClient;

  beforeAll(async () => {
    redis = await RedisClient.new(REDIS_ENDPOINT, REDIS_PASSWORD);
  });

  afterAll(async () => {
    process.exit();
  });

  it("Set & Get", async () => {
    const key = "testKey";
    const value = "testValue";
    await redis.set(key, value);
    await redis.get(key);
  });
});
