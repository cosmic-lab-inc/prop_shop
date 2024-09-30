import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {
  AdminClient,
  BASE_PRECISION,
  BN,
  BulkAccountLoader,
  calculatePositionPNL,
  getLimitOrderParams,
  getOrderParams,
  getUserAccountPublicKey,
  MarketType,
  OracleSource,
  PEG_PRECISION,
  PositionDirection,
  PostOnlyParams,
  PRICE_PRECISION,
  PublicKey,
  QUOTE_PRECISION,
  User,
  UserAccount,
  ZERO,
} from "@drift-labs/sdk";
import {bootstrapSignerClientAndUser, initializeQuoteSpotMarket, mockOracle, setFeedPrice,} from "./driftHelpers";
import {ConfirmOptions, Keypair} from "@solana/web3.js";
import {
  DriftVaults,
  encodeName,
  getVaultAddressSync,
  getVaultDepositorAddressSync,
  getVaultProtocolAddressSync,
  IDL as DRIFT_VAULTS_IDL,
  VaultClient,
  VaultProtocolParams,
  WithdrawUnit,
} from "@drift-labs/vaults-sdk";
import {assert} from "chai";
import {
  DRIFT_VAULTS_PROGRAM_ID,
  TEST_DRIFT_INVESTOR,
  TEST_MANAGER,
  TEST_USDC_MINT,
  TEST_USDC_MINT_AUTHORITY,
} from "@cosmic-lab/prop-shop-sdk";

describe("driftVaults", () => {
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

  const bulkAccountLoader = new BulkAccountLoader(connection, "confirmed", 1);

  let adminClient: AdminClient;

  const manager = TEST_MANAGER;
  let managerClient: VaultClient;
  let managerUser: User;

  let fillerClient: VaultClient;
  let fillerUser: User;

  const vd = TEST_DRIFT_INVESTOR;
  let vdClient: VaultClient;
  let vdUser: User;
  let vdUserUSDCAccount: PublicKey;

  let delegate: Keypair;
  let delegateClient: VaultClient;

  let protocol: Keypair;
  let protocolClient: VaultClient;
  let protocolVdUserUSDCAccount: PublicKey;

  const usdcMint = TEST_USDC_MINT;
  const usdcMintAuth = TEST_USDC_MINT_AUTHORITY;
  let solPerpOracle: PublicKey;

  const protocolVaultName = "Top 50 Momentum";
  const protocolVault = getVaultAddressSync(
    program.programId,
    encodeName(protocolVaultName),
  );

  const initialSolPerpPrice = 100;
  const finalSolPerpPrice = initialSolPerpPrice + 10;
  const usdcAmount = new BN(50_000).mul(QUOTE_PRECISION);
  const baseAssetAmount = new BN(50).mul(BASE_PRECISION);

  before(async () => {
    try {
      // await mockUSDCMint(provider, usdcMint, usdcMintAuth);
      solPerpOracle = await mockOracle(initialSolPerpPrice);

      const perpMarketIndexes = [0];
      const spotMarketIndexes = [0];
      const oracleInfos = [
        {publicKey: solPerpOracle, source: OracleSource.PYTH},
      ];

      adminClient = new AdminClient({
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

      await adminClient.initialize(usdcMint.publicKey, true);
      await adminClient.subscribe();
      await initializeQuoteSpotMarket(adminClient, usdcMint.publicKey);

      const mantissaSqrtScale = new BN(100_000);
      await adminClient.initializePerpMarket(
        0,
        solPerpOracle,
        new BN(5 * 10 ** 13).mul(
          mantissaSqrtScale,
        ),
        new BN(5 * 10 ** 13).mul(
          mantissaSqrtScale,
        ),
        new BN(0),
        new BN(initialSolPerpPrice).mul(PEG_PRECISION),
      );
      await adminClient.updatePerpAuctionDuration(new BN(0));
      await adminClient.updatePerpMarketCurveUpdateIntensity(0, 100);

      // init vault manager
      const bootstrapManager = await bootstrapSignerClientAndUser({
        payer: provider,
        programId: program.programId,
        usdcMint,
        usdcMintAuth,
        usdcAmount,
        signer: manager,
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
      managerClient = bootstrapManager.vaultClient;
      managerUser = bootstrapManager.user;

      // init delegate who trades with vault funds
      const bootstrapDelegate = await bootstrapSignerClientAndUser({
        payer: provider,
        programId: program.programId,
        usdcMint,
        usdcMintAuth,
        usdcAmount,
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
      delegate = bootstrapDelegate.signer;
      delegateClient = bootstrapDelegate.vaultClient;

      // init a market filler for manager to trade against
      const bootstrapFiller = await bootstrapSignerClientAndUser({
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
      fillerClient = bootstrapFiller.vaultClient;
      fillerUser = bootstrapFiller.user;

      // the VaultDepositor for the protocol vault
      const bootstrapVD = await bootstrapSignerClientAndUser({
        payer: provider,
        programId: program.programId,
        usdcMint,
        usdcMintAuth,
        usdcAmount,
        depositCollateral: false,
        signer: vd,
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
      vdClient = bootstrapVD.vaultClient;
      vdUser = bootstrapVD.user;
      vdUserUSDCAccount = bootstrapVD.userUSDCAccount;

      // init protocol
      const bootstrapProtocol = await bootstrapSignerClientAndUser({
        payer: provider,
        programId: program.programId,
        usdcMint,
        usdcMintAuth,
        usdcAmount,
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
      protocol = bootstrapProtocol.signer;
      protocolClient = bootstrapProtocol.vaultClient;
      protocolVdUserUSDCAccount = bootstrapProtocol.userUSDCAccount;

      // start account loader
      bulkAccountLoader.startPolling();
      await bulkAccountLoader.load();
    } catch (e: any) {
      throw new Error(e);
    }
  });

  after(async () => {
    await managerClient.driftClient.unsubscribe();
    await fillerClient.driftClient.unsubscribe();
    await vdClient.driftClient.unsubscribe();
    await delegateClient.driftClient.unsubscribe();
    await protocolClient.driftClient.unsubscribe();
    await adminClient.unsubscribe();

    await managerUser.unsubscribe();
    await fillerUser.unsubscribe();
    await vdUser.unsubscribe();

    bulkAccountLoader.stopPolling();

    // process.exit();
  });

  it("Initialize Vault", async () => {
    const vpParams: VaultProtocolParams = {
      protocol: protocol.publicKey,
      protocolFee: new BN(0),
      // 100_000 = 10%
      protocolProfitShare: 100_000,
    };
    await managerClient.initializeVault({
      name: encodeName(protocolVaultName),
      spotMarketIndex: 0,
      redeemPeriod: ZERO,
      maxTokens: ZERO,
      managementFee: ZERO,
      profitShare: 0,
      hurdleRate: 0,
      permissioned: false,
      minDepositAmount: ZERO,
      vaultProtocol: vpParams,
    });
    const vaultAcct = await program.account.vault.fetch(protocolVault);
    assert(vaultAcct.manager.equals(manager.publicKey));
    const vp = getVaultProtocolAddressSync(
      managerClient.program.programId,
      protocolVault,
    );
    // asserts "exit" was called on VaultProtocol to define the discriminator
    const vpAcctInfo = await connection.getAccountInfo(vp);
    assert(vpAcctInfo !== null);
    // asserts Vault and VaultProtocol fields were set properly
    assert(vaultAcct.vaultProtocol);
    const vpAcct = await program.account.vaultProtocol.fetch(vp);
    assert(vpAcct.protocol.equals(protocol.publicKey));
  });

  // assign "delegate" to trade on behalf of the vault
  it("Update Vault Delegate", async () => {
    const vaultAccount = await program.account.vault.fetch(protocolVault);
    await managerClient.program.methods
      .updateDelegate(delegate.publicKey)
      .accounts({
        vault: protocolVault,
        driftUser: vaultAccount.user,
        driftProgram: adminClient.program.programId,
      })
      .rpc();
    const user = (await adminClient.program.account.user.fetch(
      vaultAccount.user,
    )) as UserAccount;
    assert(user.delegate.equals(delegate.publicKey));
  });

  it("Initialize Investor", async () => {
    await vdClient.initializeVaultDepositor(protocolVault, vd.publicKey);
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      protocolVault,
      vd.publicKey,
    );
    const vdAcct = await program.account.vaultDepositor.fetch(vaultDepositor);
    assert(vdAcct.vault.equals(protocolVault));
  });

  // vault depositor deposits USDC to the vault
  it("Investor Deposit", async () => {
    const vaultAccount = await program.account.vault.fetch(protocolVault);
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      protocolVault,
      vd.publicKey,
    );
    const remainingAccounts = vdClient.driftClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = getVaultProtocolAddressSync(
        managerClient.program.programId,
        protocolVault,
      );
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const driftSpotMarketVault = adminClient.getSpotMarketAccount(0)?.vault;
    if (!driftSpotMarketVault) {
      throw new Error("Spot market not found");
    }
    await vdClient.program.methods
      .deposit(usdcAmount)
      .accounts({
        vault: protocolVault,
        vaultDepositor,
        vaultTokenAccount: vaultAccount.tokenAccount,
        driftUserStats: vaultAccount.userStats,
        driftUser: vaultAccount.user,
        driftState: await adminClient.getStatePublicKey(),
        userTokenAccount: vdUserUSDCAccount,
        driftSpotMarketVault,
        driftProgram: adminClient.program.programId,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();
  });

  // vault enters long
  it("Long SOL-PERP", async () => {
    // vault user account is delegated to "delegate"
    const vaultUserAcct = (
      await delegateClient.driftClient.getUserAccountsForDelegate(
        delegate.publicKey,
      )
    )[0];
    assert(vaultUserAcct.authority.equals(protocolVault));
    assert(vaultUserAcct.delegate.equals(delegate.publicKey));

    assert(vaultUserAcct.totalDeposits.eq(usdcAmount));
    const balance =
      vaultUserAcct.totalDeposits.toNumber() / QUOTE_PRECISION.toNumber();
    console.log("vault usdc balance:", balance);

    const marketIndex = 0;

    // delegate assumes control of vault user
    await delegateClient.driftClient.addUser(0, protocolVault, vaultUserAcct);
    await delegateClient.driftClient.switchActiveUser(0, protocolVault);
    console.log("delegate assumed control of protocol vault user");

    const delegateActiveUser = delegateClient.driftClient.getUser(
      0,
      protocolVault,
    );
    const vaultUserKey = await getUserAccountPublicKey(
      delegateClient.driftClient.program.programId,
      protocolVault,
      0,
    );
    assert(
      delegateActiveUser.userAccountPublicKey.equals(vaultUserKey),
      "delegate active user is not vault user",
    );

    const fillerUser = fillerClient.driftClient.getUser();

    try {
      // manager places long order and waits to be filler by the filler
      const takerOrderParams = getLimitOrderParams({
        marketIndex,
        direction: PositionDirection.SHORT,
        baseAssetAmount,
        price: new BN((initialSolPerpPrice - 1) * PRICE_PRECISION.toNumber()),
        auctionStartPrice: new BN(
          initialSolPerpPrice * PRICE_PRECISION.toNumber(),
        ),
        auctionEndPrice: new BN(
          (initialSolPerpPrice - 1) * PRICE_PRECISION.toNumber(),
        ),
        auctionDuration: 10,
        userOrderId: 1,
        postOnly: PostOnlyParams.NONE,
      });
      await fillerClient.driftClient.placePerpOrder(takerOrderParams);
    } catch (e) {
      console.log("filler failed to short:", e);
    }
    await fillerUser.fetchAccounts();
    const order = fillerUser.getOrderByUserOrderId(1);
    if (!order) {
      throw new Error("filler order not found");
    }
    assert(!order.postOnly);

    try {
      // vault trades against filler's long
      const makerOrderParams = getLimitOrderParams({
        marketIndex,
        direction: PositionDirection.LONG,
        baseAssetAmount,
        price: new BN(initialSolPerpPrice).mul(PRICE_PRECISION),
        userOrderId: 1,
        postOnly: PostOnlyParams.MUST_POST_ONLY,
        immediateOrCancel: true,
      });
      const orderParams = getOrderParams(makerOrderParams, {
        marketType: MarketType.PERP,
      });
      const userStatsPublicKey =
        delegateClient.driftClient.getUserStatsAccountPublicKey();

      const remainingAccounts = delegateClient.driftClient.getRemainingAccounts(
        {
          userAccounts: [
            delegateActiveUser.getUserAccount(),
            fillerUser.getUserAccount(),
          ],
          useMarketLastSlotCache: true,
          writablePerpMarketIndexes: [orderParams.marketIndex],
        },
      );

      const takerOrderId = order.orderId;
      const placeAndMakeOrderIx =
        await delegateClient.driftClient.program.methods
          .placeAndMakePerpOrder(orderParams, takerOrderId)
          .accounts({
            state: await delegateClient.driftClient.getStatePublicKey(),
            user: delegateActiveUser.userAccountPublicKey,
            userStats: userStatsPublicKey,
            taker: fillerUser.userAccountPublicKey,
            takerStats: fillerClient.driftClient.getUserStatsAccountPublicKey(),
            authority: delegateClient.driftClient.wallet.publicKey,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

      const {slot} = await delegateClient.driftClient.sendTransaction(
        await delegateClient.driftClient.buildTransaction(
          placeAndMakeOrderIx,
          delegateClient.driftClient.txParams,
        ),
        [],
        delegateClient.driftClient.opts,
      );

      delegateClient.driftClient.perpMarketLastSlotCache.set(
        orderParams.marketIndex,
        slot,
      );
    } catch (e) {
      throw new Error(`vault failed to long: ${e}`);
    }

    // check positions from vault and filler are accurate
    await fillerUser.fetchAccounts();
    const fillerPosition = fillerUser.getPerpPosition(0);
    if (!fillerPosition) {
      throw new Error("filler position not found");
    }
    assert(
      fillerPosition.baseAssetAmount.eq(baseAssetAmount.neg()),
      "filler position is not baseAssetAmount",
    );
    await delegateActiveUser.fetchAccounts();
    const vaultPosition = delegateActiveUser.getPerpPosition(0);
    if (!vaultPosition) {
      throw new Error("vault position not found");
    }
    assert(
      vaultPosition.baseAssetAmount.eq(baseAssetAmount),
      "vault position is not baseAssetAmount",
    );
  });

  // increase price of SOL perp by 5%
  it("Increase SOL-PERP Price", async () => {
    const preOD = adminClient.getOracleDataForPerpMarket(0);
    const priceBefore = preOD.price.toNumber() / PRICE_PRECISION.toNumber();
    console.log("price before:", priceBefore);
    assert(priceBefore === initialSolPerpPrice);

    try {
      // increase AMM
      await adminClient.moveAmmToPrice(
        0,
        new BN(finalSolPerpPrice * PRICE_PRECISION.toNumber()),
      );
    } catch (e) {
      console.log("failed to move amm price:", e);
      assert(false);
    }

    const solPerpMarket = adminClient.getPerpMarketAccount(0);
    if (!solPerpMarket) {
      throw new Error("SOL-PERP market not found");
    }

    await setFeedPrice(
      anchor.workspace.Pyth,
      finalSolPerpPrice,
      solPerpMarket.amm.oracle,
    );

    const postOD = adminClient.getOracleDataForPerpMarket(0);
    const priceAfter = postOD.price.toNumber() / PRICE_PRECISION.toNumber();
    console.log(`price after: ${priceAfter}`);
    assert(priceAfter === finalSolPerpPrice);
  });

  // vault exits long for a profit
  it("Short SOL-PERP", async () => {
    const marketIndex = 0;

    const delegateActiveUser = delegateClient.driftClient.getUser(
      0,
      protocolVault,
    );
    const fillerUser = fillerClient.driftClient.getUser();

    try {
      // manager places long order and waits to be filler by the filler
      const takerOrderParams = getLimitOrderParams({
        marketIndex,
        direction: PositionDirection.LONG,
        baseAssetAmount,
        price: new BN((finalSolPerpPrice + 1) * PRICE_PRECISION.toNumber()),
        auctionStartPrice: new BN(
          finalSolPerpPrice * PRICE_PRECISION.toNumber(),
        ),
        auctionEndPrice: new BN(
          (finalSolPerpPrice + 1) * PRICE_PRECISION.toNumber(),
        ),
        auctionDuration: 10,
        userOrderId: 1,
        postOnly: PostOnlyParams.NONE,
      });
      await fillerClient.driftClient.placePerpOrder(takerOrderParams);
    } catch (e) {
      console.log("filler failed to long:", e);
    }
    await fillerUser.fetchAccounts();
    const order = fillerUser.getOrderByUserOrderId(1);
    if (!order) {
      throw new Error("filler order not found");
    }
    assert(!order.postOnly);

    try {
      // vault trades against filler's long
      const makerOrderParams = getLimitOrderParams({
        marketIndex,
        direction: PositionDirection.SHORT,
        baseAssetAmount,
        price: new BN(finalSolPerpPrice).mul(PRICE_PRECISION),
        userOrderId: 1,
        postOnly: PostOnlyParams.MUST_POST_ONLY,
        immediateOrCancel: true,
      });
      const orderParams = getOrderParams(makerOrderParams, {
        marketType: MarketType.PERP,
      });
      const userStatsPublicKey =
        delegateClient.driftClient.getUserStatsAccountPublicKey();

      const remainingAccounts = delegateClient.driftClient.getRemainingAccounts(
        {
          userAccounts: [
            delegateActiveUser.getUserAccount(),
            fillerUser.getUserAccount(),
          ],
          useMarketLastSlotCache: true,
          writablePerpMarketIndexes: [orderParams.marketIndex],
        },
      );

      const takerOrderId = order.orderId;
      const placeAndMakeOrderIx =
        await delegateClient.driftClient.program.methods
          .placeAndMakePerpOrder(orderParams, takerOrderId)
          .accounts({
            state: await delegateClient.driftClient.getStatePublicKey(),
            user: delegateActiveUser.userAccountPublicKey,
            userStats: userStatsPublicKey,
            taker: fillerUser.userAccountPublicKey,
            takerStats: fillerClient.driftClient.getUserStatsAccountPublicKey(),
            authority: delegateClient.driftClient.wallet.publicKey,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

      const {slot} = await delegateClient.driftClient.sendTransaction(
        await delegateClient.driftClient.buildTransaction(
          placeAndMakeOrderIx,
          delegateClient.driftClient.txParams,
        ),
        [],
        delegateClient.driftClient.opts,
      );

      delegateClient.driftClient.perpMarketLastSlotCache.set(
        orderParams.marketIndex,
        slot,
      );
    } catch (e) {
      console.log("vault failed to short:", e);
    }

    // check positions from vault and filler are accurate
    await fillerUser.fetchAccounts();
    const fillerPosition = fillerUser.getPerpPosition(0);
    if (!fillerPosition) {
      throw new Error("filler position not found");
    }
    assert(fillerPosition.baseAssetAmount.eq(ZERO));
    await delegateActiveUser.fetchAccounts();
    const vaultPosition = delegateActiveUser.getPerpPosition(0);
    if (!vaultPosition) {
      throw new Error("vault position not found");
    }
    assert(vaultPosition.baseAssetAmount.eq(ZERO));
    console.log("shorted SOL-PERP");
  });

  it("Settle Pnl", async () => {
    const vaultUser = delegateClient.driftClient.getUser(0, protocolVault);
    const uA = vaultUser.getUserAccount();
    assert(!uA.idle);
    const solPerpPos = vaultUser.getPerpPosition(0);
    if (!solPerpPos) {
      throw new Error("position not found");
    }
    const solPerpQuote =
      solPerpPos.quoteAssetAmount.toNumber() / QUOTE_PRECISION.toNumber();
    console.log("sol perp quote:", solPerpQuote);
    console.log(
      "sol perp base:",
      solPerpPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber(),
    );
    assert(solPerpPos.baseAssetAmount.eq(ZERO));
    console.log(
      "free collateral:",
      vaultUser.getFreeCollateral().toNumber() / QUOTE_PRECISION.toNumber(),
    );
    assert(usdcAmount.eq(vaultUser.getFreeCollateral()));

    const solPrice = vaultUser.driftClient.getOracleDataForPerpMarket(0);
    assert(
      finalSolPerpPrice ===
      solPrice.price.toNumber() / PRICE_PRECISION.toNumber(),
    );

    const solPerpMarket = delegateClient.driftClient.getPerpMarketAccount(0);
    if (!solPerpMarket) {
      throw new Error("SOL-PERP market not found");
    }
    const pnl =
      calculatePositionPNL(
        solPerpMarket,
        solPerpPos,
        false,
        solPrice,
      ).toNumber() / QUOTE_PRECISION.toNumber();

    const upnl =
      vaultUser.getUnrealizedPNL().toNumber() / QUOTE_PRECISION.toNumber();
    assert(pnl === upnl);
    assert(
      solPerpPos.quoteAssetAmount.toNumber() / QUOTE_PRECISION.toNumber() ===
      upnl,
    );
    assert(solPerpQuote === pnl);

    await vaultUser.fetchAccounts();
    try {
      // settle market maker who lost trade and pays taker fees
      await delegateClient.driftClient.settlePNL(
        fillerUser.userAccountPublicKey,
        fillerUser.getUserAccount(),
        0,
      );
      // then settle vault who won trade and earns maker fees
      await delegateClient.driftClient.settlePNL(
        vaultUser.userAccountPublicKey,
        vaultUser.getUserAccount(),
        0,
      );
    } catch (e) {
      throw new Error(`failed to settle pnl: ${e}`);
    }

    // vault user account is delegated to "delegate"
    const vaultUserAcct = delegateClient.driftClient
      .getUser(0, protocolVault)
      .getUserAccount();
    const settledPnl =
      vaultUserAcct.settledPerpPnl.toNumber() / QUOTE_PRECISION.toNumber();
    console.log("vault settled pnl:", settledPnl);
    assert(settledPnl === pnl);
  });

  it("Withdraw", async () => {
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      protocolVault,
      vd.publicKey,
    );

    const vaultAccount = await program.account.vault.fetch(protocolVault);
    const vaultDepositorAccount =
      await program.account.vaultDepositor.fetch(vaultDepositor);

    const remainingAccounts = vdClient.driftClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = vdClient.getVaultProtocolAddress(
        vaultDepositorAccount.vault,
      );
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const withdrawAmount =
      await vdClient.calculateWithdrawableVaultDepositorEquityInDepositAsset({
        // @ts-ignore
        vaultDepositor: vaultDepositorAccount,
        // @ts-ignore
        vault: vaultAccount,
      });
    console.log(
      "withdraw amount:",
      withdrawAmount.toNumber() / QUOTE_PRECISION.toNumber(),
    );
    // $50,000 deposit + (~$502 in profit - 10% profit share = ~$451)
    assert(
      withdrawAmount.toNumber() / QUOTE_PRECISION.toNumber() === 50451.852501,
    );

    try {
      await vdClient.program.methods
        .requestWithdraw(withdrawAmount, WithdrawUnit.TOKEN)
        .accounts({
          vault: protocolVault,
          vaultDepositor,
          driftUser: vaultAccount.user,
          driftUserStats: vaultAccount.userStats,
          driftState: await adminClient.getStatePublicKey(),
        })
        .remainingAccounts(remainingAccounts)
        .rpc();
    } catch (e) {
      throw new Error(`failed to request withdraw: ${e}`);
    }

    const vaultDepositorAccountAfter =
      await program.account.vaultDepositor.fetch(vaultDepositor);
    console.log(
      "withdraw shares:",
      vaultDepositorAccountAfter.lastWithdrawRequest.shares.toNumber(),
    );
    console.log(
      "withdraw value:",
      vaultDepositorAccountAfter.lastWithdrawRequest.value.toNumber(),
    );
    assert(
      vaultDepositorAccountAfter.lastWithdrawRequest.shares.eq(
        new BN(49_950_293_280),
      ),
    );
    assert(
      vaultDepositorAccountAfter.lastWithdrawRequest.value.eq(
        new BN(50_451_852_501),
      ),
    );

    const vdAcct = await program.account.vaultDepositor.fetch(vaultDepositor);
    assert(vdAcct.vault.equals(protocolVault));

    const driftSpotMarketVault = adminClient.getSpotMarketAccount(0)?.vault;
    if (!driftSpotMarketVault) {
      throw new Error("Spot market not found");
    }
    try {
      await vdClient.program.methods
        .withdraw()
        .accounts({
          userTokenAccount: vdUserUSDCAccount,
          vault: protocolVault,
          vaultDepositor,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: vaultAccount.user,
          driftUserStats: vaultAccount.userStats,
          driftState: await adminClient.getStatePublicKey(),
          driftSpotMarketVault,
          driftSigner: adminClient.getStateAccount().signer,
          driftProgram: adminClient.program.programId,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();
    } catch (e) {
      throw new Error(`failed to withdraw: ${e}`);
    }
  });

  it("Protocol Withdraw Profit Share", async () => {
    const vaultAccount = await program.account.vault.fetch(protocolVault);

    const remainingAccounts = protocolClient.driftClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });
    const vaultProtocol = getVaultProtocolAddressSync(
      program.programId,
      protocolVault,
    );
    if (vaultAccount.vaultProtocol) {
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const withdrawAmount = await protocolClient.calculateVaultProtocolEquity({
      vault: protocolVault,
    });
    console.log(
      "protocol withdraw profit share:",
      withdrawAmount.toNumber() / QUOTE_PRECISION.toNumber(),
    );
    // 10% of protocolVault depositor's ~$502 profit
    assert.strictEqual(withdrawAmount.toNumber() / QUOTE_PRECISION.toNumber(), 50.205831);

    try {
      await protocolClient.program.methods
        .protocolRequestWithdraw(withdrawAmount, WithdrawUnit.TOKEN)
        .accounts({
          vault: protocolVault,
          vaultProtocol,
          driftUser: vaultAccount.user,
          driftUserStats: vaultAccount.userStats,
          driftState: await adminClient.getStatePublicKey(),
        })
        .remainingAccounts(remainingAccounts)
        .rpc();
    } catch (e) {
      throw new Error(`failed to request withdraw: ${e}`);
    }

    const vpAccountAfter =
      await program.account.vaultProtocol.fetch(vaultProtocol);
    console.log(
      "protocol withdraw shares:",
      vpAccountAfter.lastProtocolWithdrawRequest.shares.toNumber(),
    );
    console.log(
      "protocol withdraw value:",
      vpAccountAfter.lastProtocolWithdrawRequest.value.toNumber(),
    );
    assert(
      vpAccountAfter.lastProtocolWithdrawRequest.shares.eq(new BN(49_706_718)),
    );
    assert(
      vpAccountAfter.lastProtocolWithdrawRequest.value.eq(new BN(50_205_831)),
    );

    const driftSpotMarketVault = adminClient.getSpotMarketAccount(0);
    if (!driftSpotMarketVault) {
      throw new Error("Spot market vault not found");
    }

    try {
      await protocolClient.program.methods
        .protocolWithdraw()
        .accounts({
          userTokenAccount: protocolVdUserUSDCAccount,
          vault: protocolVault,
          vaultProtocol,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: vaultAccount.user,
          driftUserStats: vaultAccount.userStats,
          driftState: await adminClient.getStatePublicKey(),
          driftSpotMarketVault: driftSpotMarketVault.vault,
          driftSigner: adminClient.getStateAccount().signer,
          driftProgram: adminClient.program.programId,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();
    } catch (e) {
      throw new Error(`failed to withdraw: ${e}`);
    }
  });

  it('Hoard of Investors', async () => {
    const hoardSize = 13;
    console.log(`generating hoard of ${hoardSize} investors for Drift vault: ${protocolVaultName}`);
    for (let i = 0; i < hoardSize; i++) {
      // the VaultDepositor for the protocol vault
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
          perpMarketIndexes: [0],
          spotMarketIndexes: [0],
          oracleInfos: [
            {publicKey: solPerpOracle, source: OracleSource.PYTH},
          ],
        },
      });
      const investorSigner = bootstrapInvestor.signer;
      const investorClient = bootstrapInvestor.vaultClient;
      const investorUserUsdcAccount = bootstrapInvestor.userUSDCAccount;

      await investorClient.initializeVaultDepositor(protocolVault, investorSigner.publicKey);
      const investorKey = getVaultDepositorAddressSync(
        program.programId,
        protocolVault,
        investorSigner.publicKey,
      );

      const vaultAccount = await program.account.vault.fetch(protocolVault);
      const remainingAccounts = investorClient.driftClient.getRemainingAccounts({
        userAccounts: [],
        writableSpotMarketIndexes: [0],
      });
      if (vaultAccount.vaultProtocol) {
        const vaultProtocol = getVaultProtocolAddressSync(
          investorClient.program.programId,
          protocolVault,
        );
        remainingAccounts.push({
          pubkey: vaultProtocol,
          isSigner: false,
          isWritable: true,
        });
      }

      const driftSpotMarketVault = adminClient.getSpotMarketAccount(0)?.vault;
      if (!driftSpotMarketVault) {
        throw new Error("Spot market not found");
      }
      try {
        await investorClient.program.methods
          .deposit(usdcAmount)
          .accounts({
            vault: protocolVault,
            vaultDepositor: investorKey,
            vaultTokenAccount: vaultAccount.tokenAccount,
            driftUserStats: vaultAccount.userStats,
            driftUser: vaultAccount.user,
            driftState: await adminClient.getStatePublicKey(),
            userTokenAccount: investorUserUsdcAccount,
            driftSpotMarketVault,
            driftProgram: adminClient.program.programId,
          })
          .remainingAccounts(remainingAccounts)
          .rpc();
      } catch (e: any) {
        throw new Error(`failed to deposit to vault: ${e}`);
      }
    }
  }, 60_000);
});