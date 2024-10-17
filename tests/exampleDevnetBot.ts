import * as anchor from '@coral-xyz/anchor';
import {Program} from '@coral-xyz/anchor';
import {AdminClient, BASE_PRECISION, BN, decodeName, DriftClient, getMarketOrderParams, PositionDirection, PublicKey, QUOTE_PRECISION, User, UserAccount, WRAPPED_SOL_MINT,} from '@drift-labs/sdk';
import {ConfirmOptions, Connection, LAMPORTS_PER_SOL, Signer, Transaction, TransactionInstruction,} from '@solana/web3.js';
import {DRIFT_VAULTS_PROGRAM_ID, signatureLink, TEST_DRIFT_INVESTOR, TEST_MANAGER, Venue,} from '@cosmic-lab/prop-shop-sdk';
import {DriftMomentumBot} from '@cosmic-lab/prop-shop-examples';
import {assert} from 'chai';
import {DriftVaults, getVaultDepositorAddressSync, IDL as DRIFT_VAULTS_IDL, VaultClient,} from '@drift-labs/vaults-sdk';
import {bootstrapDevnetInvestor, sendTx} from './driftHelpers';
import {createCloseAccountInstruction} from '@solana/spl-token';


describe('exampleDevnetBot', () => {
  const opts: ConfirmOptions = {
    preflightCommitment: 'confirmed',
    skipPreflight: false,
    commitment: 'confirmed',
  };

  const connection = new Connection('https://api.devnet.solana.com');
  const provider = anchor.AnchorProvider.local(connection.rpcEndpoint, opts);
  anchor.setProvider(provider);

  const program = new Program(
    DRIFT_VAULTS_IDL as any as anchor.Idl,
    DRIFT_VAULTS_PROGRAM_ID,
    provider
  ) as any as Program<DriftVaults>;

  let admin: AdminClient;
  const manager = TEST_MANAGER;
  console.log('manager:', manager.publicKey.toString());
  const fundName = `DriftMomentumBot`;
  let bot: DriftMomentumBot;

  const investor = TEST_DRIFT_INVESTOR;
  console.log('investor:', investor.publicKey.toString());
  let investorClient: VaultClient;
  let investorUser: User;
  let investorUsdcAta: PublicKey;

  let usdcMint: PublicKey;

  before(async () => {
    const managerSol =
      (await connection.getBalance(manager.publicKey)) / LAMPORTS_PER_SOL;
    console.log('manager SOL:', managerSol);
    const investorSol =
      (await connection.getBalance(investor.publicKey)) / LAMPORTS_PER_SOL;
    console.log('investor SOL:', investorSol);

    bot = await DriftMomentumBot.fromKeypair(connection, manager, fundName);

    const mintInfoResult = await bot.usdcMintInfo();
    if (mintInfoResult.isErr()) {
      throw mintInfoResult.error;
    }
    usdcMint = mintInfoResult.value.mint;

    const marketAcct = bot.driftClient.getPerpMarketAccount(0);
    if (!marketAcct) {
      throw new Error('Perp market not found');
    }

    admin = new AdminClient({
      connection,
      wallet: provider.wallet,
      opts: {
        commitment: 'confirmed',
      },
      activeSubAccountId: 0,
      accountSubscription: {
        type: 'websocket',
        resubTimeoutMs: 30_000,
      },
    });

    // the VaultDepositor for the vault
    const bootstrapInvestor = await bootstrapDevnetInvestor({
      signer: investor,
      payer: provider,
      programId: program.programId,
      depositCollateral: true,
      usdcMint,
      driftClientConfig: {
        accountSubscription: {
          type: 'websocket',
          resubTimeoutMs: 30_000,
        },
        opts,
        activeSubAccountId: 0,
      },
    });
    investorClient = bootstrapInvestor.vaultClient;
    investorUser = bootstrapInvestor.user;
    investorUsdcAta = bootstrapInvestor.usdcAta;
  });

  after(async () => {
    await investorClient.driftClient.unsubscribe();
    await admin.unsubscribe();
    await bot.shutdown();
  });

  it('Create Fund', async () => {
    if (bot.fund !== undefined) {
      return;
    }
    const snack = await bot.createFund({
      name: fundName,
      venue: Venue.Drift,
      percentProfitShare: 20,
      percentAnnualManagementFee: 2,
    });
    await bot.fetchFund();
    assert(snack.variant === 'success');
    assert(bot.fund !== undefined);
  });

  // assign "delegate" to trade on behalf of the vault
  it('Update Fund Delegate', async () => {
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
      fundAcct.user
    )) as UserAccount;
    assert(user.delegate.equals(bot.key));
  });

  it('Initialize Investor', async () => {
    const investorKey = getVaultDepositorAddressSync(
      program.programId,
      bot.fundKey,
      investor.publicKey
    );
    const investorAcct = await connection.getAccountInfo(investorKey);
    if (investorAcct !== null) {
      console.warn(
        `Investor account (${investorKey.toString()}) exists, skipping initialization.`
      );
      return;
    }
    await investorClient.initializeVaultDepositor(
      bot.fundKey,
      investor.publicKey
    );
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      bot.fundKey,
      investor.publicKey
    );
    const investorAcctAfter =
      await program.account.vaultDepositor.fetch(vaultDepositor);
    assert(investorAcctAfter.vault.equals(bot.fundKey));
  });

  it('Cancel Open Orders', async () => {
    const ixs: TransactionInstruction[] = [];
    const markets = investorClient.driftClient.getSpotMarketAccounts();
    for (const order of investorUser.getOpenOrders()) {
      const market = markets.find((m) => m.marketIndex === order.marketIndex);
      if (!market) {
        throw new Error(`Market ${order.marketIndex} not found`);
      }
      const base = order.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
      const name = decodeName(market.name);
      console.log(
        `${name} [${order.marketIndex}] open order before cancel: ${base}`
      );
      ixs.push(
        await investorClient.driftClient.getCancelOrderIx(order.orderId)
      );
    }

    if (ixs.length > 0) {
      const cancelOrdersTx = (await investorClient.driftClient.buildTransaction(
        ixs
      )) as Transaction;
      cancelOrdersTx.sign(
        ...[
          {
            publicKey: investor.publicKey,
            secretKey: investor.secretKey,
          } as any as Signer,
        ]
      );
      const cancelOrdersSim =
        await connection.simulateTransaction(cancelOrdersTx);
      console.log(cancelOrdersSim.value.logs);
      const cancelOrderSig = await sendTx(provider, ixs, [
        {
          publicKey: investor.publicKey,
          secretKey: investor.secretKey,
        } as any as Signer,
      ]);
      console.log(
        'cancel orders sig:',
        signatureLink(cancelOrderSig, connection)
      );
    }
    await investorUser.fetchAccounts();
    assert(!investorUser.getUserAccount().hasOpenOrder);
    console.log('cancelled all open orders');
  });

  it('Investor Sell SOL for USDC', async () => {
    const markets = investorClient.driftClient.getSpotMarketAccounts();
    for (const pos of investorUser.getActiveSpotPositions()) {
      const market = markets.find((m) => m.marketIndex === pos.marketIndex);
      if (!market) {
        throw new Error(`Market ${pos.marketIndex} not found`);
      }
      const base = pos.scaledBalance.toNumber() / Math.pow(10, market.decimals);
      const name = decodeName(market.name);
      console.log(`${name} [${pos.marketIndex}] position:`, base);
    }

    // devnet USDC faucet is not working, but SOL faucet does,
    // so we deposited SOL as collateral onto Drift SOL/USDC market in the "before" hook.
    // Now we'll swap that SOL for USDC, then we can (finally) deposit into the fund
    const solSpotMarket = investorClient.driftClient
      .getSpotMarketAccounts()
      .find((m) => m.mint.equals(WRAPPED_SOL_MINT));
    if (!solSpotMarket) {
      throw new Error('SOL spot market not found');
    }

    const {price} = bot.spotMarketBidAsk(
      solSpotMarket.marketIndex
    ).bid;
    console.log(`Best bid price: $${price}`);

    console.log(
      'Investor user:',
      investorUser.getUserAccountPublicKey().toString()
    );
    const freeUsdcCollateral = investorUser
      .getSpotMarketAssetValue(solSpotMarket.marketIndex, 'Initial', true, true)
      .div(QUOTE_PRECISION)
      .toNumber();
    const availableSolToSell = freeUsdcCollateral / price;
    console.log(
      `Investor free collateral, $${freeUsdcCollateral} (~${availableSolToSell.toFixed(2)} SOL)`
    );

    const minOrderSize =
      solSpotMarket.orderStepSize.toNumber() /
      Math.pow(10, solSpotMarket.decimals);
    if (availableSolToSell < minOrderSize) {
      console.warn(
        `Order size ${availableSolToSell} is less than the order step size ${minOrderSize}, skipping order.`
      );
    } else {
      const orderParams = getMarketOrderParams({
        marketIndex: solSpotMarket.marketIndex,
        direction: PositionDirection.SHORT,
        baseAssetAmount: investorClient.driftClient.convertToSpotPrecision(
          solSpotMarket.marketIndex,
          availableSolToSell
        ),
      });

      const simTx = (await investorClient.driftClient.buildTransaction(
        await investorClient.driftClient.getPlaceAndTakeSpotOrderIx(
          orderParams,
          undefined,
          // makerInfo,
        ),
      )) as Transaction;
      simTx.sign(
        ...[
          {
            publicKey: investor.publicKey,
            secretKey: investor.secretKey,
          } as any as Signer,
        ]
      );
      const sim = await connection.simulateTransaction(simTx);
      console.log('sell simulation:', sim.value.logs);

      const sig = await investorClient.driftClient.placeAndTakeSpotOrder(
        orderParams,
        undefined,
        // makerInfo
      );
      console.log('investor sell sig:', signatureLink(sig, connection));
    }

    // now that devnet SOL has been swapped for USDC, we need to withdraw back to the wallet,
    // so it can then be deposited into the fund
    await investorUser.fetchAccounts();
    const openOrder = investorUser
      .getOpenOrders()
      .find((o) => o.marketIndex === solSpotMarket.marketIndex);
    if (!openOrder) {
      throw new Error(`Open order for SOL market not found`);
    }
    const base =
      openOrder.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
    const name = decodeName(solSpotMarket.name);
    console.log(`${name} open order:`, base);
  });

  it('Investor Withdraw USDC', async () => {
    const solSpotMarket = investorClient.driftClient
      .getSpotMarketAccounts()
      .find((m) => m.mint.equals(WRAPPED_SOL_MINT));
    if (!solSpotMarket) {
      throw new Error('SOL spot market not found');
    }

    const markets = investorClient.driftClient.getSpotMarketAccounts();
    for (const pos of investorUser.getActiveSpotPositions()) {
      const market = markets.find((m) => m.marketIndex === pos.marketIndex);
      if (!market) {
        throw new Error(`Market ${pos.marketIndex} not found`);
      }
      const base = pos.scaledBalance.toNumber() / Math.pow(10, market.decimals);
      const name = decodeName(market.name);
      console.log(`${name} [${pos.marketIndex}] position:`, base);
    }

    for (const order of investorUser.getOpenOrders()) {
      const market = markets.find((m) => m.marketIndex === order.marketIndex);
      if (!market) {
        throw new Error(`Market ${order.marketIndex} not found`);
      }
      const base = order.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
      const name = decodeName(market.name);
      console.log(`${name} [${order.marketIndex}] open order:`, base);
    }

    const quote = investorClient.driftClient.getQuoteAssetTokenAmount();
    console.log('quote:', quote.toNumber() / QUOTE_PRECISION.toNumber());

    const usdcToWithdraw = investorUser
      .getSpotMarketAssetValue(0, 'Initial')
      .div(QUOTE_PRECISION)
      .toNumber();
    console.log(`usdc available to withdraw: $${usdcToWithdraw}`);

    // withdraw
    const withdrawIxs = await getWithdrawalIxs(
      investorClient.driftClient,
      investorClient.driftClient.convertToSpotPrecision(0, usdcToWithdraw),
      0,
      investorUsdcAta,
    );
    const tx = (await investorClient.driftClient.buildTransaction(
      withdrawIxs
    )) as Transaction;
    tx.sign(
      ...[
        {
          publicKey: investor.publicKey,
          secretKey: investor.secretKey,
        } as any as Signer,
      ]
    );
    const sim = await connection.simulateTransaction(tx);
    console.log(sim.value.logs);
    // await investorClient.driftClient.withdraw(
    //   usdcToWithdraw,
    //   solSpotMarket.marketIndex,
    //   investorUsdcAta,
    //   true
    // );
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

async function getWithdrawalIxs(
  driftClient: DriftClient,
  amount: BN,
  marketIndex: number,
  associatedTokenAddress: PublicKey,
  reduceOnly = false,
  subAccountId?: number
) {
  const withdrawIxs: anchor.web3.TransactionInstruction[] = [];

  const spotMarketAccount = driftClient.getSpotMarketAccount(marketIndex);
  if (!spotMarketAccount) {
    throw new Error(`Spot market ${marketIndex} not found`);
  }

  const isSolMarket = spotMarketAccount.mint.equals(WRAPPED_SOL_MINT);

  const authority = driftClient.wallet.publicKey;

  const createWSOLTokenAccount =
    isSolMarket && associatedTokenAddress.equals(authority);

  if (createWSOLTokenAccount) {
    const {ixs, pubkey} = await driftClient.getWrappedSolAccountCreationIxs(
      amount,
      false
    );

    associatedTokenAddress = pubkey;

    withdrawIxs.push(...ixs);
  } else {
    const accountExists = await checkIfAccountExists(
      driftClient,
      associatedTokenAddress
    );

    if (!accountExists) {
      const createAssociatedTokenAccountIx =
        driftClient.getAssociatedTokenAccountCreationIx(
          spotMarketAccount.mint,
          associatedTokenAddress,
          driftClient.getTokenProgramForSpotMarket(spotMarketAccount)
        );

      withdrawIxs.push(createAssociatedTokenAccountIx);
    }
  }

  const withdrawCollateralIx = await driftClient.getWithdrawIx(
    amount,
    spotMarketAccount.marketIndex,
    associatedTokenAddress,
    reduceOnly,
    subAccountId
  );

  withdrawIxs.push(withdrawCollateralIx);

  // Close the wrapped sol account at the end of the transaction
  if (createWSOLTokenAccount) {
    withdrawIxs.push(
      createCloseAccountInstruction(
        associatedTokenAddress,
        authority,
        authority,
        []
      )
    );
  }

  return withdrawIxs;
}

async function checkIfAccountExists(
  driftClient: DriftClient,
  account: PublicKey
): Promise<boolean> {
  try {
    const accountInfo = await driftClient.connection.getAccountInfo(account);
    return accountInfo != null;
  } catch (e) {
    // Doesn't already exist
    return false;
  }
}
