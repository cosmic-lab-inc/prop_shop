import * as anchor from "@coral-xyz/anchor";
import { ConfirmOptions, Connection, Keypair } from "@solana/web3.js";
import { REDIS_ENDPOINT, REDIS_PASSWORD, RPC_URL } from "../.jest/env";
import {
  HistoricalSettlePNL,
  PropShopClient,
  RedisClient,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, beforeAll, describe, it } from "@jest/globals";
import { Vault } from "../../drift-vaults/ts/sdk";
import { decodeName } from "@drift-labs/sdk";

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
    process.exit();
  });

  it("Get Vault PNL", async () => {
    const key = "testKey";
    const value = "testValue";
    await redis.set(key, value);
    const res = await redis.get(key);
    expect(res).toBe(value);
    console.log("done set & get");
  });

  it("Set & Get Vault PNL", async () => {
    const vaults = await client.fetchVaults();
    console.log(`${vaults.length} vaults`);
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
    const getBefore = await redis.get(key);
    console.log(`got pnl from redis in ${new Date().getTime() - preGet}ms`);
    console.log("vault pnl exists?", !!getBefore);

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
    const hydrated: HistoricalSettlePNL[] = JSON.parse(get);
    let cumSum: number = 0;
    for (const entry of hydrated) {
      cumSum += Number(entry.pnl);
    }
    console.log(`cumulative pnl over ${hydrated.length} trades: $${cumSum}`);
    expect(get).toBe(value);
  });
});
