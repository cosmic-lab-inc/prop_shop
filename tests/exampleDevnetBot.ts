import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {AdminClient, BN, PublicKey, QUOTE_PRECISION, UserAccount,} from "@drift-labs/sdk";
import {ConfirmOptions, Connection} from "@solana/web3.js";
import {DRIFT_VAULTS_PROGRAM_ID, TEST_DRIFT_INVESTOR, TEST_MANAGER, Venue,} from "@cosmic-lab/prop-shop-sdk";
import {DriftMomentumBot} from "@cosmic-lab/prop-shop-examples";
import {assert} from "chai";
import {DriftVaults, getVaultDepositorAddressSync, IDL as DRIFT_VAULTS_IDL, VaultClient} from "@drift-labs/vaults-sdk";
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
  console.log('manager:', manager.publicKey.toString());
  const fundName = `DriftMomentumBot`;
  let bot: DriftMomentumBot;

  const investor = TEST_DRIFT_INVESTOR;
  console.log('investor:', investor.publicKey.toString());
  let investorClient: VaultClient;
  let investorUsdcAta: PublicKey;

  const usdc = 100;
  const usdcAmount = new BN(usdc).mul(QUOTE_PRECISION);
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

    admin = new AdminClient({
      connection,
      wallet: provider.wallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId: 0,
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
      usdc,
      driftClientConfig: {
        accountSubscription: {
          type: "websocket",
          resubTimeoutMs: 30_000,
        },
        opts,
        activeSubAccountId: 0,
      },
    });
    investorClient = bootstrapInvestor.vaultClient;
    investorUsdcAta = bootstrapInvestor.usdcAta;
  });

  after(async () => {
    // await bot.shutdown();
    await investorClient.driftClient.unsubscribe();
    await admin.unsubscribe();
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
    await bot.fetchFund();
    assert(snack.variant === "success");
    assert(bot.fund !== undefined);
  });

  // assign "delegate" to trade on behalf of the vault
  it("Update Fund Delegate", async () => {
    await bot.fetchFund();
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

  // // vault depositor deposits USDC to the vault
  // it("Investor Deposit", async () => {
  //   const vaultAccount = await program.account.vault.fetch(bot.fundKey);
  //   const vaultDepositor = getVaultDepositorAddressSync(
  //     program.programId,
  //     bot.fundKey,
  //     investor.publicKey,
  //   );
  //   const remainingAccounts = investorClient.driftClient.getRemainingAccounts({
  //     userAccounts: [],
  //     writableSpotMarketIndexes: [0],
  //   });
  //   if (vaultAccount.vaultProtocol) {
  //     const vaultProtocol = getVaultProtocolAddressSync(
  //       bot.program.programId,
  //       bot.fundKey,
  //     );
  //     remainingAccounts.push({
  //       pubkey: vaultProtocol,
  //       isSigner: false,
  //       isWritable: true,
  //     });
  //   }
  //
  //   const driftSpotMarketVault = bot.driftClient.getSpotMarketAccount(0)?.vault;
  //   if (!driftSpotMarketVault) {
  //     throw new Error("Spot market not found");
  //   }
  //   await investorClient.program.methods
  //     .deposit(usdcAmount)
  //     .accounts({
  //       vault: bot.fundKey,
  //       vaultDepositor,
  //       vaultTokenAccount: vaultAccount.tokenAccount,
  //       driftUserStats: vaultAccount.userStats,
  //       driftUser: vaultAccount.user,
  //       driftState: await admin.getStatePublicKey(),
  //       userTokenAccount: investorUsdcAta,
  //       driftSpotMarketVault,
  //       driftProgram: admin.program.programId,
  //     })
  //     .remainingAccounts(remainingAccounts)
  //     .rpc();
  //
  //   const investorAcct = await program.account.vaultDepositor.fetch(vaultDepositor);
  //   assert(investorAcct.vault.equals(bot.fundKey));
  //   assert(investorAcct.netDeposits.eq(usdcAmount));
  //   console.log('fund usdc:', bot.fund?.tvl ?? 0);
  //
  //   const investorUserAcct = investorClient.driftClient
  //     .getUserAccount(0, investor.publicKey);
  //   assert(investorUserAcct !== undefined);
  // });
  //
  // it("Fund Long SOL-PERP", async () => {
  //   // fund taker order
  //   const snack = await bot.placeMarketPerpOrder(
  //     0,
  //     bot.fundOrErr.tvl,
  //     PositionDirection.LONG
  //   );
  //   assert(snack.variant === "success");
  //
  //   const takerUser = bot.driftClient.getUser();
  //   await takerUser.fetchAccounts();
  //   const order = takerUser.getOpenOrders()[0];
  //   if (!order) {
  //     throw new Error("taker order not found");
  //   }
  //   const price = order.price.toNumber() / PRICE_PRECISION.toNumber();
  //   const baseUnits = order.baseAssetAmount.div(BASE_PRECISION).toNumber();
  //   const quoteUnits = order.baseAssetAmount.div(BASE_PRECISION).mul(order.price).div(PRICE_PRECISION).toNumber();
  //   console.log(`taker order price: $${price}`);
  //   console.log(`sol amount: ${baseUnits}`);
  //   console.log(`usdc amount: $${quoteUnits}`);
  //   assert(!order.postOnly);
  // });
});