import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {
  AdminClient,
  BASE_PRECISION,
  BN,
  decodeName,
  getLimitOrderParams,
  OracleSource,
  PositionDirection,
  PostOnlyParams,
  PRICE_PRECISION,
  PublicKey,
  QUOTE_PRECISION,
  TakerInfo,
  User,
  UserAccount,
} from "@drift-labs/sdk";
import {ConfirmOptions, Keypair, LAMPORTS_PER_SOL} from "@solana/web3.js";
import {
  DRIFT_VAULTS_PROGRAM_ID,
  TEST_MANAGER,
  TEST_USDC_MINT,
  TEST_USDC_MINT_AUTHORITY,
  Venue,
} from "@cosmic-lab/prop-shop-sdk";
import {DriftMomentumBot} from "@cosmic-lab/prop-shop-examples";
import {assert} from "chai";
import {
  DriftVaults,
  getVaultDepositorAddressSync,
  getVaultProtocolAddressSync,
  VaultClient
} from "@drift-labs/vaults-sdk";
import {bootstrapSignerClientAndUser} from "./driftHelpers";
import {IDL as DRIFT_VAULTS_IDL} from "@drift-labs/vaults-sdk/lib/types/drift_vaults";
import {signatureLink} from "./phoenixHelpers";

describe("exampleBot", () => {
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    commitment: "confirmed",
  };

  const provider = anchor.AnchorProvider.local(undefined, opts);
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = new Program(
    DRIFT_VAULTS_IDL as any as anchor.Idl,
    DRIFT_VAULTS_PROGRAM_ID,
    provider,
  ) as any as Program<DriftVaults>;

  let admin: AdminClient;
  const manager = TEST_MANAGER;
  // create random integer from 1-40
  const version = Math.floor(Math.random() * 1000);
  const fundName = `Drift Momentum Bot V${version}`;
  console.log('fund:', fundName);
  let bot: DriftMomentumBot;

  let investor: Keypair;
  let investorClient: VaultClient;
  let investorUser: User;
  let investorUsdcAta: PublicKey;

  let maker: Keypair;
  let makerClient: VaultClient;
  let makerUser: User;
  // let makerUsdcAta: PublicKey;

  const usdcAmount = new BN(50_000).mul(QUOTE_PRECISION);
  const usdcMint = TEST_USDC_MINT;
  const usdcMintAuth = TEST_USDC_MINT_AUTHORITY;

  before(async () => {
    await connection.requestAirdrop(manager.publicKey, LAMPORTS_PER_SOL * 1);
    bot = await DriftMomentumBot.new(connection, manager, fundName);

    const marketAcct = bot.driftClient.getPerpMarketAccount(0);
    if (!marketAcct) {
      throw new Error("Perp market not found");
    }
    console.log(`SOL perp market:`, decodeName(marketAcct.name));
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
    const bootstrapInvestor = await bootstrapSignerClientAndUser({
      payer: provider,
      programId: program.programId,
      usdcMint,
      usdcMintAuth,
      usdcAmount,
      depositCollateral: false,
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
    investor = bootstrapInvestor.signer;
    investorClient = bootstrapInvestor.vaultClient;
    investorUser = bootstrapInvestor.user;
    investorUsdcAta = bootstrapInvestor.userUSDCAccount;

    // maker to fund's taker orders
    const bootstrapMaker = await bootstrapSignerClientAndUser({
      payer: provider,
      programId: program.programId,
      usdcMint,
      usdcMintAuth,
      usdcAmount,
      depositCollateral: true,
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
    maker = bootstrapMaker.signer;
    makerClient = bootstrapMaker.vaultClient;
    makerUser = bootstrapMaker.user;
    // makerUsdcAta = bootstrapMaker.userUSDCAccount;
  });

  after(async () => {
    // await bot.shutdown();
    await investorClient.driftClient.unsubscribe();
    await makerClient.driftClient.unsubscribe();
    await investorUser.unsubscribe();
    await makerUser.unsubscribe();
    await admin.unsubscribe();
  });

  it("Fetch Prices", async () => {
    for (const pm of bot.driftClient.getPerpMarketAccounts()) {
      const name = decodeName(pm.name);
      const price = (await bot.fetchPerpMarket(pm.marketIndex)).price;
      console.log(`${name}: $${price}`);
    }
  });

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
    const investorUserAcct = investorClient.driftClient
      .getUserAccount(0, investor.publicKey);
    if (!investorUserAcct) {
      throw new Error("Investor user account not found");
    }
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
  });

  it("Fund Long SOL-PERP", async () => {
    // fund taker order
    const snack = await bot.placeMarketPerpOrder(
      0,
      bot.fundOrErr.tvl * 0.5,
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

  it("Maker Short SOL-PERP", async () => {
    // maker to fill fund's taker order
    const {price} = await bot.fetchPerpMarket(0);

    const takerUser = bot.driftClient.getUser();
    const takerOrder = takerUser.getOpenOrders()[0];
    if (!takerOrder) {
      throw new Error("taker order not found");
    }
    const baseUnits = takerOrder.baseAssetAmount.div(BASE_PRECISION).toNumber();
    const quoteUnits = takerOrder.baseAssetAmount.div(BASE_PRECISION).mul(takerOrder.price).div(PRICE_PRECISION).toNumber();
    console.log(`base units to match: ${baseUnits}`);
    console.log(`quote units to match: $${quoteUnits}`);
    const baseAssetAmount = bot.driftClient.convertToPerpPrecision(baseUnits);

    const orderParams = getLimitOrderParams({
      marketIndex: 0,
      direction: PositionDirection.SHORT,
      baseAssetAmount,
      price: bot.driftClient.convertToPricePrecision(price),
      userOrderId: 1,
      postOnly: PostOnlyParams.MUST_POST_ONLY,
      immediateOrCancel: true,
    });

    const takerInfo: TakerInfo = {
      taker: takerUser.getUserAccountPublicKey(),
      takerStats: bot.driftClient.getUserStatsAccountPublicKey(),
      takerUserAccount: takerUser.getUserAccount(),
      order: takerOrder,
    };

    // const tx = await makerClient.driftClient.buildTransaction(
    //   await makerClient.driftClient.getPlaceAndMakePerpOrderIx(
    //     orderParams,
    //     takerInfo,
    //   )
    // ) as Transaction;
    // tx.sign(...[{
    //   publicKey: maker.publicKey,
    //   secretKey: maker.secretKey
    // } as any as Signer]);
    // const sim = await connection.simulateTransaction(tx);
    // console.log(sim.value.logs);

    const makerSig = await makerClient.driftClient.placeAndMakePerpOrder(
      orderParams,
      takerInfo
    );
    console.log('maker sig:', signatureLink(makerSig, connection));

    const makerUser = makerClient.driftClient.getUser();
    await makerUser.fetchAccounts();
    const makerPos = makerUser.getPerpPosition(0);
    if (!makerPos) {
      throw new Error("maker position not found");
    }
    assert(
      makerPos.baseAssetAmount.eq(baseAssetAmount.neg()),
      "maker position != baseAssetAmount",
    );
    await takerUser.fetchAccounts();
    const fundPos = takerUser.getPerpPosition(0);
    if (!fundPos) {
      throw new Error("fund position not found");
    }
    assert(
      fundPos.baseAssetAmount.eq(baseAssetAmount),
      "fund position != baseAssetAmount",
    );
  });
});