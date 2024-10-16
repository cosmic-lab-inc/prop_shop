import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {
  AdminClient,
  BASE_PRECISION,
  BN,
  OracleSource,
  PositionDirection,
  PRICE_PRECISION,
  PublicKey,
  QUOTE_PRECISION,
  User,
  UserAccount,
} from "@drift-labs/sdk";
import {ConfirmOptions, Connection} from "@solana/web3.js";
import {DRIFT_VAULTS_PROGRAM_ID, TEST_DRIFT_INVESTOR, TEST_MANAGER, Venue,} from "@cosmic-lab/prop-shop-sdk";
import {DriftMomentumBot} from "@cosmic-lab/prop-shop-examples";
import {assert} from "chai";
import {
  DriftVaults,
  getVaultDepositorAddressSync,
  getVaultProtocolAddressSync,
  IDL as DRIFT_VAULTS_IDL,
  VaultClient
} from "@drift-labs/vaults-sdk";
import {bootstrapDevnetInvestor} from "./driftHelpers";

describe("exampleDevnetBot", () => {
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    commitment: "confirmed",
  };

  const connection = new Connection("https://api.devnet.solana.com");
  const provider = anchor.AnchorProvider.local(connection.rpcEndpoint, opts);
  anchor.setProvider(provider);

  const program = new Program(
    DRIFT_VAULTS_IDL as any as anchor.Idl,
    DRIFT_VAULTS_PROGRAM_ID,
    provider,
  ) as any as Program<DriftVaults>;

  let admin: AdminClient;
  const manager = TEST_MANAGER;
  const fundName = `DriftMomentumBot`;
  let bot: DriftMomentumBot;

  const investor = TEST_DRIFT_INVESTOR;
  let investorClient: VaultClient;
  let investorUser: User;
  let investorUsdcAta: PublicKey;

  const usdcAmount = new BN(1_000).mul(QUOTE_PRECISION);
  let usdcMint: PublicKey;

  before(async () => {
    bot = await DriftMomentumBot.fromKeypair(connection, manager, fundName);

    const mintInfoResult = await bot.usdcMintInfo();
    if (mintInfoResult.isErr()) {
      throw mintInfoResult.error;
    }
    usdcMint = mintInfoResult.value.mint;

    const marketAcct = bot.driftClient.getPerpMarketAccount(0);
    if (!marketAcct) {
      throw new Error("Perp market not found");
    }
    const perpMarketIndexes = [0];
    const spotMarketIndexes = [0];
    const oracleInfos = [
      {publicKey: marketAcct.amm.oracle, source: OracleSource.PYTH},
    ];

    admin = new AdminClient({
      connection,
      wallet: provider.wallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId: 0,
      perpMarketIndexes,
      spotMarketIndexes,
      oracleInfos,
      accountSubscription: {
        type: "websocket",
        resubTimeoutMs: 30_000,
      },
    });

    // the VaultDepositor for the vault
    const bootstrapInvestor = await bootstrapDevnetInvestor({
      signer: investor,
      payer: provider,
      programId: program.programId,
      usdcMint,
      driftClientConfig: {
        accountSubscription: {
          type: "websocket",
          resubTimeoutMs: 30_000,
        },
        opts,
        activeSubAccountId: 0,
        perpMarketIndexes,
        spotMarketIndexes,
        oracleInfos,
      },
    });
    investorClient = bootstrapInvestor.vaultClient;
    investorUser = bootstrapInvestor.user;
    investorUsdcAta = bootstrapInvestor.userUSDCAccount;
  });

  after(async () => {
    // await bot.shutdown();
    await investorClient.driftClient.unsubscribe();
    await investorUser.unsubscribe();
    await admin.unsubscribe();
  });

  // it("Fetch Prices", async () => {
  //   for (const pm of bot.driftClient.getPerpMarketAccounts()) {
  //     const name = decodeName(pm.name);
  //     const price = bot.perpMarketPrice(pm.marketIndex);
  //     console.log(`${name}: $${price}`);
  //   }
  // });

  it("Create Fund", async () => {
    if (bot.fund !== undefined) {
      return;
    }
    const snack = await bot.createFund({
      name: fundName,
      venue: Venue.Drift,
      percentProfitShare: 20,
      percentAnnualManagementFee: 2
    });
    assert(snack.variant === "success");
    assert(bot.fund !== undefined);
  });

  // assign "delegate" to trade on behalf of the vault
  it("Update Fund Delegate", async () => {
    const fundAcct = await program.account.vault.fetch(bot.fundKey);
    await bot.program.methods
      .updateDelegate(bot.key)
      .accounts({
        vault: bot.fundKey,
        driftUser: fundAcct.user,
        driftProgram: admin.program.programId,
      })
      .rpc();
    const user = (await admin.program.account.user.fetch(
      fundAcct.user,
    )) as UserAccount;
    assert(user.delegate.equals(bot.key));
  });

  it("Initialize Investor", async () => {
    await investorClient.initializeVaultDepositor(bot.fundKey, investor.publicKey);
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      bot.fundKey,
      investor.publicKey,
    );
    const investorAcct = await program.account.vaultDepositor.fetch(vaultDepositor);
    assert(investorAcct.vault.equals(bot.fundKey));
  });

  // vault depositor deposits USDC to the vault
  it("Investor Deposit", async () => {
    const vaultAccount = await program.account.vault.fetch(bot.fundKey);
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      bot.fundKey,
      investor.publicKey,
    );
    const remainingAccounts = investorClient.driftClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = getVaultProtocolAddressSync(
        bot.program.programId,
        bot.fundKey,
      );
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const driftSpotMarketVault = bot.driftClient.getSpotMarketAccount(0)?.vault;
    if (!driftSpotMarketVault) {
      throw new Error("Spot market not found");
    }
    await investorClient.program.methods
      .deposit(usdcAmount)
      .accounts({
        vault: bot.fundKey,
        vaultDepositor,
        vaultTokenAccount: vaultAccount.tokenAccount,
        driftUserStats: vaultAccount.userStats,
        driftUser: vaultAccount.user,
        driftState: await admin.getStatePublicKey(),
        userTokenAccount: investorUsdcAta,
        driftSpotMarketVault,
        driftProgram: admin.program.programId,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();

    const investorAcct = await program.account.vaultDepositor.fetch(vaultDepositor);
    assert(investorAcct.vault.equals(bot.fundKey));
    assert(investorAcct.netDeposits.eq(usdcAmount));
    console.log('fund usdc:', bot.fund?.tvl ?? 0);

    const investorUserAcct = investorClient.driftClient
      .getUserAccount(0, investor.publicKey);
    assert(investorUserAcct !== undefined);
  });

  it("Fund Long SOL-PERP", async () => {
    // fund taker order
    const snack = await bot.placeMarketPerpOrder(
      0,
      bot.fundOrErr.tvl,
      PositionDirection.LONG
    );
    assert(snack.variant === "success");

    const takerUser = bot.driftClient.getUser();
    await takerUser.fetchAccounts();
    const order = takerUser.getOpenOrders()[0];
    if (!order) {
      throw new Error("taker order not found");
    }
    const price = order.price.toNumber() / PRICE_PRECISION.toNumber();
    const baseUnits = order.baseAssetAmount.div(BASE_PRECISION).toNumber();
    const quoteUnits = order.baseAssetAmount.div(BASE_PRECISION).mul(order.price).div(PRICE_PRECISION).toNumber();
    console.log(`taker order price: $${price}`);
    console.log(`sol amount: ${baseUnits}`);
    console.log(`usdc amount: $${quoteUnits}`);
    assert(!order.postOnly);
  });
});