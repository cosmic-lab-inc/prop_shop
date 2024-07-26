import * as anchor from "@coral-xyz/anchor";
import { ConfirmOptions, Connection, Keypair } from "@solana/web3.js";
import { REDIS_ENDPOINT, REDIS_PASSWORD, RPC_URL } from "../.jest/env";
import {
  DriftMarketInfo,
  PropShopClient,
  RedisClient,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, beforeAll, describe, it } from "@jest/globals";

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

  const client = new PropShopClient({
    wallet,
    connection,
    disableCache: true,
    skipFetching: true,
  });

  const redis = RedisClient.new({
    endpoint: REDIS_ENDPOINT,
    password: REDIS_PASSWORD,
  });

  beforeAll(async () => {
    await client.initialize();
    await redis.connect();
  });

  afterAll(async () => {
    await client.shutdown();
    await redis.disconnect();
  });

  it("Drift Markets", async () => {
    if (!client.vaultClient) {
      throw new Error("Vault client not initialized");
    }
    const spotMarkets: DriftMarketInfo[] = client.vaultClient.driftClient
      .getSpotMarketAccounts()
      .map((m) => {
        return {
          marketIndex: m.marketIndex,
          oracle: m.oracle,
          oracleSource: m.oracleSource,
        };
      });
    await redis.set("spotMarkets", JSON.stringify(spotMarkets));

    const spotMarketsValue = await redis.get("spotMarkets");
    if (!spotMarketsValue) {
      throw new Error("spotMarkets not found in redis");
    }
    const hydratedSpotMarkets = JSON.parse(
      spotMarketsValue,
    ) as DriftMarketInfo[];
    for (let i = 0; i < spotMarkets.length; i++) {
      expect(hydratedSpotMarkets[i].marketIndex).toEqual(
        spotMarkets[i].marketIndex,
      );
      expect(hydratedSpotMarkets[i].oracle.toString()).toEqual(
        spotMarkets[i].oracle.toString(),
      );
      expect(hydratedSpotMarkets[i].oracleSource).toEqual(
        spotMarkets[i].oracleSource,
      );
    }

    const perpMarkets: DriftMarketInfo[] = client.vaultClient.driftClient
      .getPerpMarketAccounts()
      .map((m) => {
        return {
          marketIndex: m.marketIndex,
          oracle: m.amm.oracle,
          oracleSource: m.amm.oracleSource,
        };
      });
    await redis.set("perpMarkets", JSON.stringify(perpMarkets));

    const perpMarketsValue = await redis.get("perpMarkets");
    if (!perpMarketsValue) {
      throw new Error("perpMarkets not found in redis");
    }
    const hydratedPerpMarkets = JSON.parse(
      perpMarketsValue,
    ) as DriftMarketInfo[];
    for (let i = 0; i < perpMarkets.length; i++) {
      expect(hydratedPerpMarkets[i].marketIndex).toEqual(
        perpMarkets[i].marketIndex,
      );
      expect(hydratedPerpMarkets[i].oracle.toString()).toEqual(
        perpMarkets[i].oracle.toString(),
      );
      expect(hydratedPerpMarkets[i].oracleSource).toEqual(
        perpMarkets[i].oracleSource,
      );
    }
  });
});
