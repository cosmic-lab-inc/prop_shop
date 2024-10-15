import * as anchor from "@coral-xyz/anchor";
import {decodeName,} from "@drift-labs/sdk";
import {ConfirmOptions} from "@solana/web3.js";
import {TEST_MANAGER,} from "@cosmic-lab/prop-shop-sdk";
import {DriftMomentumBot} from "@cosmic-lab/prop-shop-examples";

describe("exampleBot", () => {
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    commitment: "confirmed",
  };

  const provider = anchor.AnchorProvider.local(undefined, opts);
  anchor.setProvider(provider);
  const connection = provider.connection;

  const manager = TEST_MANAGER;
  let bot: DriftMomentumBot;

  const fundName = "Drift Momentum Bot";

  before(async () => {
    bot = await DriftMomentumBot.new(connection, manager, fundName);
  });

  after(async () => {
    await bot.shutdown();
  });

  it("Fetch Prices", async () => {
    for (const pm of bot.driftClient.getPerpMarketAccounts()) {
      const name = decodeName(pm.name);
      const price = (await bot.fetchPerpMarket(pm.marketIndex)).price;
      console.log(`${name}: $${price}`);
    }
  });
});