import * as anchor from '@coral-xyz/anchor';
import {BN} from '@coral-xyz/anchor';
import {
  AccountMeta,
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  ConfirmOptions,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import {assert} from 'chai';
import {
  encodeName,
  getInvestorAddressSync,
  getMarketRegistryAddressSync,
  getVaultAddressSync,
  LOCALNET_MARKET_CONFIG,
  MarketTransferParams,
  MOCK_MARKET_AUTHORITY,
  MOCK_SOL_MINT,
  MOCK_SOL_PRECISION,
  MOCK_SOL_USDC_MARKET,
  MOCK_USDC_MINT,
  MOCK_USDC_PRECISION,
  PHOENIX_PROGRAM_ID,
  PHOENIX_SEAT_MANAGER_PROGRAM_ID,
  PhoenixVaults,
  QUOTE_PRECISION,
  VaultParams,
  WithdrawUnit,
} from '@cosmic-lab/phoenix-vaults-sdk';
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  calculateRealizedInvestorEquity,
  createMarketTokenAccountIxs,
  encodeLimitOrderPacketWithFreeFunds,
  fetchInvestorEquity,
  fetchMarketState,
  fetchTraderState,
  outAmount,
  sendAndConfirm,
  simulate,
  tokenBalance,
} from './phoenixHelpers';
import {
  Client as PhoenixClient,
  confirmOrCreateClaimSeatIxs,
  deserializeSeatManagerData,
  getLimitOrderPacket,
  getLogAuthority,
  getSeatAddress,
  getSeatDepositCollectorAddress,
  getSeatManagerAddress,
  Side,
} from '@ellipsis-labs/phoenix-sdk';

describe('phoenixVaults', () => {
  const opts: ConfirmOptions = {
    preflightCommitment: 'confirmed',
    skipPreflight: false,
    commitment: 'confirmed',
  };

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.local(undefined, opts);
  anchor.setProvider(provider);
  const conn = provider.connection;
  // @ts-ignore
  const payer: Keypair = provider.wallet.payer as any as Keypair;
  // const payer = _payer as Keypair;
  const program = anchor.workspace
    .PhoenixVaults as anchor.Program<PhoenixVaults>;

  let phoenix: PhoenixClient;

  const marketRegistry = getMarketRegistryAddressSync();
  let lutSlot: number;
  let lut: PublicKey;

  const mintAuth = MOCK_MARKET_AUTHORITY;
  const usdcMint = MOCK_USDC_MINT.publicKey;
  const solMint = MOCK_SOL_MINT.publicKey;
  // const _jupMint = MOCK_JUP_MINT;
  const solUsdcMarket = MOCK_SOL_USDC_MARKET.publicKey;
  // const jupSolMarket = MOCK_JUP_SOL_MARKET.publicKey;
  // const jupUsdcMarket = MOCK_JUP_USDC_MARKET.publicKey;
  // const manager = Keypair.generate();
  const manager = payer;
  const protocol = Keypair.generate();
  const maker = Keypair.generate();

  const name = 'Test Vault';
  const vaultKey = getVaultAddressSync(encodeName(name));
  const vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vaultKey, true);
  const vaultSolAta = getAssociatedTokenAddressSync(solMint, vaultKey, true);
  const investor = getInvestorAddressSync(vaultKey, provider.publicKey);
  const investorUsdcAta = getAssociatedTokenAddressSync(
    usdcMint,
    provider.publicKey
  );

  const marketKeys: PublicKey[] = LOCALNET_MARKET_CONFIG[
    'localhost'
    ].markets.map((m) => new PublicKey(m.market));
  const startSolUsdcPrice = 100;
  const endSolUsdcPrice = 125;
  const usdcUiAmount = 1_000;
  const usdcAmount = new BN(usdcUiAmount).mul(MOCK_USDC_PRECISION);
  const solUiAmount = usdcUiAmount / startSolUsdcPrice; // 10 SOL
  const solAmount = new BN(solUiAmount).mul(MOCK_SOL_PRECISION);

  before(async () => {
    phoenix = await PhoenixClient.createFromConfig(
      conn,
      LOCALNET_MARKET_CONFIG,
      false,
      false
    );
    // await phoenix.addMarket(solUsdcMarket.toBase58(), true, false);

    await conn.requestAirdrop(maker.publicKey, LAMPORTS_PER_SOL * 10);

    lutSlot = await conn.getSlot('finalized');
    const slotBuffer = Buffer.alloc(8);
    slotBuffer.writeBigInt64LE(BigInt(lutSlot), 0);
    const lutSeeds = [provider.publicKey.toBuffer(), slotBuffer];
    lut = PublicKey.findProgramAddressSync(
      lutSeeds,
      AddressLookupTableProgram.programId
    )[0];
  });

  it('Create Address Lookup Table', async () => {
    const [ix, lutKey] = AddressLookupTableProgram.createLookupTable({
      authority: provider.publicKey,
      payer: provider.publicKey,
      recentSlot: lutSlot,
    });
    assert(lutKey.toString() === lut.toString());

    await sendAndConfirm(conn, payer, [ix]);

    const lutAcctInfo = await conn.getAccountInfo(lut, 'processed');
    assert(lutAcctInfo !== null);
    const lutAcct = AddressLookupTableAccount.deserialize(lutAcctInfo.data);
    assert(lutAcct.authority?.toString() === provider.publicKey.toString());
  });

  it('Fill Address Lookup Table', async () => {
    const ix = AddressLookupTableProgram.extendLookupTable({
      lookupTable: lut,
      authority: provider.publicKey,
      payer: provider.publicKey,
      addresses: marketKeys,
    });

    await sendAndConfirm(conn, payer, [ix]);

    const lutAcctInfo = await conn.getAccountInfo(lut, 'processed');
    assert(lutAcctInfo !== null);
    const lutAcct = AddressLookupTableAccount.deserialize(lutAcctInfo.data);
    assert(lutAcct.addresses.length === marketKeys.length);
  });

  it('Initialize Market Registry', async () => {
    const accounts = {
      authority: provider.publicKey,
      lut,
      marketRegistry,
      lutProgram: AddressLookupTableProgram.programId,
    };

    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });
    const params = {
      usdcMint,
      solMint,
    };

    try {
      await program.methods
        .initializeMarketRegistry(params)
        .accounts(accounts)
        .remainingAccounts(markets)
        .rpc();
    } catch (e) {
      console.error(e);
      assert(false);
    }
  });

  it('Initialize Vault', async () => {
    const marketState = phoenix.marketStates.get(solUsdcMarket.toString());
    if (marketState === undefined) {
      throw Error('SOL/USDC market not found');
    }
    const createAtaIxs = await createMarketTokenAccountIxs(
      conn,
      marketState,
      vaultKey,
      payer
    );
    await sendAndConfirm(conn, payer, createAtaIxs);

    const config: VaultParams = {
      name: encodeName(name),
      redeemPeriod: new BN(0),
      maxTokens: new BN(0),
      managementFee: new BN(0),
      minDepositAmount: new BN(0),
      profitShare: 100_000,
      hurdleRate: 0,
      permissioned: false,
      protocol: protocol.publicKey,
      protocolFee: new BN(0),
      protocolProfitShare: 100_000,
    };
    await program.methods
      .initializeVault(config)
      .accounts({
        vault: vaultKey,
        usdcTokenAccount: vaultUsdcAta,
        usdcMint: usdcMint,
        solTokenAccount: vaultSolAta,
        solMint: solMint,
        manager: manager.publicKey,
      })
      .rpc();
    const acct = await program.account.vault.fetch(vaultKey);
    assert(!!acct);
  });

  it('Check SOL/USDC Seat Manager', async () => {
    const smKey = getSeatManagerAddress(solUsdcMarket);
    const smAcct = await conn.getAccountInfo(smKey);
    if (!smAcct) {
      throw new Error(
        `Seat manager ${smKey.toString()} not found for market ${solUsdcMarket.toString()}`
      );
    }

    // Deserialize the data inside the Seat Manager Account
    const sm = deserializeSeatManagerData(smAcct.data);

    // For the purposes of this example, assert that the authority for the above market is the same as the devnetSeatManagerAuthority.
    // You can remove or replace the below logic with the conditions you want to verify.
    assert.equal(sm.market.toBase58(), solUsdcMarket.toBase58());
  });

  it('Claim Taker Seat', async () => {
    try {
      const seatManager = getSeatManagerAddress(solUsdcMarket);
      const seatDepositCollector =
        getSeatDepositCollectorAddress(solUsdcMarket);
      const seat = getSeatAddress(solUsdcMarket, vaultKey);
      const logAuthority = getLogAuthority();
      const claimSeatIx = await program.methods
        .claimSeat()
        .accounts({
          vault: vaultKey,
          delegate: manager.publicKey,
          phoenix: PHOENIX_PROGRAM_ID,
          logAuthority,
          market: solUsdcMarket,
          seatManager,
          seatDepositCollector,
          payer: payer.publicKey,
          seat,
          systemProgram: SystemProgram.programId,
          phoenixSeatManager: PHOENIX_SEAT_MANAGER_PROGRAM_ID,
        })
        .instruction();
      await sendAndConfirm(conn, payer, [claimSeatIx], [manager]);
    } catch (e: any) {
      throw new Error(e);
    }
  });

  it('Initialize Investor', async () => {
    const accounts = {
      vault: vaultKey,
      investor,
      authority: provider.publicKey,
    };
    await program.methods.initializeInvestor().accounts(accounts).rpc();
    const acct = await program.account.investor.fetch(investor);
    assert(!!acct);
  });

  it('Deposit', async () => {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      provider.publicKey,
      investorUsdcAta,
      provider.publicKey,
      usdcMint
    );
    const mintToIx = createMintToInstruction(
      usdcMint,
      investorUsdcAta,
      mintAuth.publicKey,
      usdcAmount.toNumber()
    );
    await sendAndConfirm(conn, payer, [createAtaIx, mintToIx], [mintAuth]);

    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      vaultKey,
      true
    );
    const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const marketBaseTokenAccount = phoenix.getBaseVaultKey(
      solUsdcMarket.toString()
    );
    const marketQuoteTokenAccount = phoenix.getQuoteVaultKey(
      solUsdcMarket.toString()
    );

    const accounts = {
      vault: vaultKey,
      investor,
      authority: provider.publicKey,
      marketRegistry,
      lut,
      investorQuoteTokenAccount: investorUsdcAta,
      phoenix: PHOENIX_PROGRAM_ID,
      logAuthority: getLogAuthority(),
      market: solUsdcMarket,
      seat: getSeatAddress(solUsdcMarket, vaultKey),
      baseMint: solMint,
      quoteMint: usdcMint,
      vaultBaseTokenAccount,
      vaultQuoteTokenAccount,
      marketBaseTokenAccount,
      marketQuoteTokenAccount,
    };
    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });
    const ix = await program.methods
      .investorDeposit(usdcAmount)
      .accounts(accounts)
      .remainingAccounts(markets)
      .instruction();
    try {
      await sendAndConfirm(conn, payer, [ix]);
    } catch (e: any) {
      throw new Error(e);
    }

    const investorAcct = await program.account.investor.fetch(investor);
    const deposits = investorAcct.netDeposits.div(QUOTE_PRECISION).toNumber();
    const shares = investorAcct.vaultShares.div(QUOTE_PRECISION).toNumber();
    assert.equal(deposits, 1000);
    assert.equal(shares, 1000);

    const vaultSol = await tokenBalance(conn, vaultQuoteTokenAccount);
    const vaultUsdc = await tokenBalance(conn, vaultQuoteTokenAccount);
    console.log(
      `vault atas after investor deposit, sol: ${vaultSol}, usdc: ${vaultUsdc}`
    );
    assert.equal(vaultSol, 0);
    assert.equal(vaultUsdc, 0);

    const vaultState = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    console.log(
      `vault trader state after investor deposit, sol: ${vaultState.baseUnitsFree}, usdc: ${vaultState.quoteUnitsFree}`
    );
    assert.equal(vaultState.baseUnitsFree, 0);
    assert.equal(vaultState.quoteUnitsFree, 1000);
  });

  //
  // Simulate profitable trade by vault for 25% gain
  //

  it('Maker Sell SOL/USDC', async () => {
    const marketState = await fetchMarketState(conn, solUsdcMarket);

    const createAtaIxs = await createMarketTokenAccountIxs(
      conn,
      marketState,
      maker.publicKey,
      payer
    );
    const solAta = getAssociatedTokenAddressSync(
      solMint,
      maker.publicKey,
      true
    );
    const mintSolIx = createMintToInstruction(
      solMint,
      solAta,
      mintAuth.publicKey,
      solAmount.toNumber()
    );
    await sendAndConfirm(conn, payer, [...createAtaIxs, mintSolIx], [mintAuth]);

    try {
      const claimMakerSeatIxs = await confirmOrCreateClaimSeatIxs(
        conn,
        marketState,
        maker.publicKey
      );
      await sendAndConfirm(conn, payer, claimMakerSeatIxs, [maker]);
    } catch (e: any) {
      throw new Error(e);
    }

    const makerBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      maker.publicKey
    );
    const makerQuoteTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      maker.publicKey
    );
    const makerSolBefore = await tokenBalance(conn, makerBaseTokenAccount);
    const makerUsdcBefore = await tokenBalance(conn, makerQuoteTokenAccount);
    console.log(
      `maker before sell, sol: ${makerSolBefore}, usdc: ${makerUsdcBefore}`
    );
    assert.strictEqual(makerSolBefore, 10);
    assert.strictEqual(makerUsdcBefore, 0);

    const priceInTicks = phoenix.floatPriceToTicks(
      startSolUsdcPrice,
      solUsdcMarket.toBase58()
    );
    const numBaseLots = phoenix.rawBaseUnitsToBaseLotsRoundedDown(
      solUiAmount,
      solUsdcMarket.toBase58()
    );
    const makerOrderPacket = getLimitOrderPacket({
      side: Side.Ask,
      priceInTicks,
      numBaseLots,
    });
    const makerOrderIx = phoenix.createPlaceLimitOrderInstruction(
      makerOrderPacket,
      solUsdcMarket.toString(),
      maker.publicKey
    );
    await sendAndConfirm(conn, payer, [makerOrderIx], [maker]);
  });

  it('Taker Buy SOL/USDC', async () => {
    const priceInTicks = phoenix.floatPriceToTicks(
      startSolUsdcPrice,
      solUsdcMarket.toBase58()
    );
    const solAmountAfterFee = await outAmount(
      conn,
      solUsdcMarket,
      Side.Bid,
      usdcUiAmount
    );
    const numBaseLots = phoenix.rawBaseUnitsToBaseLotsRoundedDown(
      solAmountAfterFee,
      solUsdcMarket.toBase58()
    );
    const takerOrderPacket = getLimitOrderPacket({
      side: Side.Bid,
      priceInTicks,
      numBaseLots,
      useOnlyDepositedFunds: true,
    });
    const order = encodeLimitOrderPacketWithFreeFunds(takerOrderPacket);

    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      vaultKey,
      true
    );
    const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const marketBaseTokenAccount = phoenix.getBaseVaultKey(
      solUsdcMarket.toString()
    );
    const marketQuoteTokenAccount = phoenix.getQuoteVaultKey(
      solUsdcMarket.toString()
    );

    const vaultBefore = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    console.log(
      `taker deposited tokens before buy, sol: ${vaultBefore.baseUnitsFree}, usdc: ${vaultBefore.quoteUnitsFree}`
    );
    assert.strictEqual(vaultBefore.baseUnitsFree, 0);
    assert.strictEqual(vaultBefore.quoteUnitsFree, 1000);

    try {
      const ix = await program.methods
        .placeLimitOrder({
          order,
        })
        .accounts({
          vault: vaultKey,
          delegate: manager.publicKey,
          phoenix: PHOENIX_PROGRAM_ID,
          logAuthority: getLogAuthority(),
          market: solUsdcMarket,
          seat: getSeatAddress(solUsdcMarket, vaultKey),
          baseMint: solMint,
          quoteMint: usdcMint,
          vaultBaseTokenAccount,
          vaultQuoteTokenAccount,
          marketBaseTokenAccount,
          marketQuoteTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      await sendAndConfirm(conn, payer, [ix], [manager]);
    } catch (e: any) {
      throw new Error(e);
    }

    const vaultAfter = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    console.log(
      `taker deposited tokens after buy, sol: ${vaultAfter.baseUnitsFree}, usdc: ${vaultAfter.quoteUnitsFree}`
    );
    assert.strictEqual(vaultAfter.baseUnitsFree, 9.999);
    assert.strictEqual(vaultAfter.quoteUnitsFree, 0.00001);

    const makerBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      maker.publicKey
    );
    const makerQuoteTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      maker.publicKey
    );
    const makerSolAfter = await tokenBalance(conn, makerBaseTokenAccount);
    const makerUsdcAfter = await tokenBalance(conn, makerQuoteTokenAccount);
    console.log(
      `maker after taker buy, sol: ${makerSolAfter}, usdc: ${makerUsdcAfter}`
    );
    assert.strictEqual(makerSolAfter, 0);
    assert.strictEqual(makerUsdcAfter, 0);

    const marketSolAfter = await tokenBalance(conn, marketBaseTokenAccount);
    const marketUsdcAfter = await tokenBalance(conn, marketQuoteTokenAccount);
    console.log(
      `market after taker buy, sol: ${marketSolAfter}, usdc: ${marketUsdcAfter}`
    );
    assert.strictEqual(marketSolAfter, 10);
    assert.strictEqual(marketUsdcAfter, 1000);
  });

  it('Maker Buy SOL/USDC @ $125', async () => {
    // after a 25% loss, the vault needs more USDC to match the vault's sell order
    const usdcAta = getAssociatedTokenAddressSync(usdcMint, maker.publicKey);
    const mintUsdcIx = createMintToInstruction(
      usdcMint,
      usdcAta,
      mintAuth.publicKey,
      usdcAmount.toNumber()
    );
    await sendAndConfirm(conn, payer, [mintUsdcIx], [mintAuth]);

    // maker buys 100% of what vault can sell, so we use the vault balance
    const vaultState = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    const solAmount = vaultState.baseUnitsFree;
    console.log(`maker to buy ${solAmount} SOL @ $125/SOL`);
    const numBaseLots = phoenix.rawBaseUnitsToBaseLotsRoundedDown(
      solAmount,
      solUsdcMarket.toBase58()
    );
    const priceInTicks = phoenix.floatPriceToTicks(
      endSolUsdcPrice,
      solUsdcMarket.toBase58()
    );
    const makerOrderPacket = getLimitOrderPacket({
      side: Side.Bid,
      priceInTicks,
      numBaseLots,
    });
    const makerOrderIx = phoenix.createPlaceLimitOrderInstruction(
      makerOrderPacket,
      solUsdcMarket.toString(),
      maker.publicKey
    );
    await sendAndConfirm(conn, payer, [makerOrderIx], [maker]);
  });

  it('Taker Sell SOL/USDC @ $125', async () => {
    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      vaultKey,
      true
    );
    const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const marketBaseTokenAccount = phoenix.getBaseVaultKey(
      solUsdcMarket.toString()
    );
    const marketQuoteTokenAccount = phoenix.getQuoteVaultKey(
      solUsdcMarket.toString()
    );

    const priceInTicks = phoenix.floatPriceToTicks(
      endSolUsdcPrice,
      solUsdcMarket.toBase58()
    );

    const vaultBefore = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    console.log(
      `taker deposited tokens before sell, sol: ${vaultBefore.baseUnitsFree}, usdc: ${vaultBefore.quoteUnitsFree}`
    );
    assert.strictEqual(vaultBefore.baseUnitsFree, 9.999);
    assert.strictEqual(vaultBefore.quoteUnitsFree, 0.00001);

    const solAmountAfterFee = vaultBefore.baseUnitsFree;
    console.log(`taker to sell ${solAmountAfterFee} SOL @ $125/SOL`);
    const numBaseLots = phoenix.rawBaseUnitsToBaseLotsRoundedDown(
      solAmountAfterFee,
      solUsdcMarket.toBase58()
    );
    const takerOrderPacket = getLimitOrderPacket({
      side: Side.Ask,
      priceInTicks,
      numBaseLots,
      useOnlyDepositedFunds: true,
    });
    const order = encodeLimitOrderPacketWithFreeFunds(takerOrderPacket);

    try {
      const ix = await program.methods
        .placeLimitOrder({
          order,
        })
        .accounts({
          vault: vaultKey,
          delegate: manager.publicKey,
          phoenix: PHOENIX_PROGRAM_ID,
          logAuthority: getLogAuthority(),
          market: solUsdcMarket,
          seat: getSeatAddress(solUsdcMarket, vaultKey),
          baseMint: solMint,
          quoteMint: usdcMint,
          vaultBaseTokenAccount,
          vaultQuoteTokenAccount,
          marketBaseTokenAccount,
          marketQuoteTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      await sendAndConfirm(conn, payer, [ix], [manager]);
    } catch (e: any) {
      throw new Error(e);
    }

    const vaultAfter = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    console.log(
      `taker deposited tokens after sell, sol: ${vaultAfter.baseUnitsFree}, usdc: ${vaultAfter.quoteUnitsFree}`
    );
    assert.strictEqual(vaultAfter.baseUnitsFree, 0);
    // 25% gain on $1000 minus fees
    assert.strictEqual(vaultAfter.quoteUnitsFree, 1249.75002);

    const makerBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      maker.publicKey
    );
    const makerQuoteTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      maker.publicKey
    );
    const makerSolAfter = await tokenBalance(conn, makerBaseTokenAccount);
    const makerUsdcAfter = await tokenBalance(conn, makerQuoteTokenAccount);
    console.log(
      `maker after taker sell, sol: ${makerSolAfter}, usdc: ${makerUsdcAfter}`
    );
    assert.strictEqual(makerSolAfter, 0);
    assert.strictEqual(makerUsdcAfter, 750.025);

    const marketSolAfter = await tokenBalance(conn, marketBaseTokenAccount);
    const marketUsdcAfter = await tokenBalance(conn, marketQuoteTokenAccount);
    console.log(
      `market after taker sell, sol: ${marketSolAfter}, usdc: ${marketUsdcAfter}`
    );
    assert.strictEqual(marketSolAfter, 10);
    // entry USDC fee: $999.9 * 0.01% fee = $0.09999
    // exit SOL fee: 9.999 SOL @ $125/SOL * 0.01% fee = $0.1249875
    // total fee = $0.09999 + $0.1249875 = $0.2249775 rounded to $0.22498
    // vault balance of $1249.75002 + $0.22498 = $1249.975
    assert.strictEqual(marketUsdcAfter, 1249.975);
  });

  //
  // Place pending ask at $125/SOL that never gets filled, so withdraw request can measure price as best ask on-chain.
  //

  it('Maker Ask SOL/USDC @ $125/SOL', async () => {
    const makerTraderState = await fetchTraderState(
      conn,
      solUsdcMarket,
      maker.publicKey
    );
    const solAmount = makerTraderState.baseUnitsFree;
    console.log(`maker sol on market to sell: ${solAmount}`);

    const priceInTicks = phoenix.floatPriceToTicks(
      endSolUsdcPrice,
      solUsdcMarket.toBase58()
    );
    const numBaseLots = phoenix.rawBaseUnitsToBaseLotsRoundedDown(
      solAmount,
      solUsdcMarket.toBase58()
    );
    const makerOrderPacket = getLimitOrderPacket({
      side: Side.Ask,
      priceInTicks,
      numBaseLots,
    });
    const makerOrderIx = phoenix.createPlaceLimitOrderInstruction(
      makerOrderPacket,
      solUsdcMarket.toString(),
      maker.publicKey
    );
    await sendAndConfirm(conn, payer, [makerOrderIx], [maker]);
  });

  //
  // Remove investor equity from market back to vault token accounts,
  // so that the investor may withdraw their funds without forcefully liquidating the vault.
  //

  //
  // Now that an ask at $125/SOL is on the book, we can use that price on-chain to measure vault equity
  //

  it('Request Withdraw', async () => {
    const investorEquityBefore = await fetchInvestorEquity(
      program,
      conn,
      investor,
      vaultKey,
      marketRegistry
    );
    console.log(
      `investor equity before withdraw request: ${investorEquityBefore}`
    );
    assert.strictEqual(investorEquityBefore, 1249.75002);

    // todo: vaultEquity function that replicates MarketMapProvider::equity()

    const vaultEquity = new BN(
      investorEquityBefore * QUOTE_PRECISION.toNumber()
    );
    const investorAcct = await program.account.investor.fetch(investor);
    const vaultAcct = await program.account.vault.fetch(vaultKey);
    const withdrawRequestEquity = calculateRealizedInvestorEquity(
      investorAcct,
      vaultEquity,
      vaultAcct
    );
    console.log(
      `withdraw request equity: ${
        withdrawRequestEquity.toNumber() / QUOTE_PRECISION.toNumber()
      }`
    );

    try {
      const markets: AccountMeta[] = marketKeys.map((pubkey) => {
        return {
          pubkey,
          isWritable: false,
          isSigner: false,
        };
      });
      const ix = await program.methods
        .requestWithdraw(withdrawRequestEquity, WithdrawUnit.TOKEN)
        .accounts({
          vault: vaultKey,
          investor,
          authority: provider.publicKey,
          marketRegistry,
          lut,
          vaultUsdcTokenAccount: vaultUsdcAta,
        })
        .remainingAccounts(markets)
        .instruction();

      await simulate(conn, payer, [ix], [payer]);
      await sendAndConfirm(conn, payer, [ix], [payer]);
    } catch (e: any) {
      throw new Error(e);
    }

    // amount before 20% total profit share = $1249.75002
    // profit is $249.75002
    // $249.75002 - 20% = $199.80001619964
    // withdrawal amount = $1199.80001619964

    const investorEquityAfter = await fetchInvestorEquity(
      program,
      conn,
      investor,
      vaultKey,
      marketRegistry
    );
    console.log(
      `investor equity after withdraw request: ${investorEquityAfter}`
    );
    assert.strictEqual(investorEquityAfter, 1199.80001619964);

    const investorAcctAfter = await program.account.investor.fetch(investor);
    const withdrawRequestValue =
      investorAcctAfter.lastWithdrawRequest.value.toNumber() /
      QUOTE_PRECISION.toNumber();
    console.log(`investor withdraw request: ${withdrawRequestValue}`);
    assert.strictEqual(withdrawRequestValue, 1199.800016);
  });

  it('Vault Withdraw from SOL/USDC Market', async () => {
    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      vaultKey,
      true
    );
    const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const marketBaseTokenAccount = phoenix.getBaseVaultKey(
      solUsdcMarket.toString()
    );
    const marketQuoteTokenAccount = phoenix.getQuoteVaultKey(
      solUsdcMarket.toString()
    );

    const vaultSolBefore = await tokenBalance(conn, vaultBaseTokenAccount);
    const vaultUsdcBefore = await tokenBalance(conn, vaultQuoteTokenAccount);
    console.log(
      `vault atas before market withdraw, sol: ${vaultSolBefore}, usdc: ${vaultUsdcBefore}`
    );
    assert.strictEqual(vaultSolBefore, 0);
    assert.strictEqual(vaultUsdcBefore, 0);

    const vaultStateBefore = await fetchTraderState(
      conn,
      solUsdcMarket,
      vaultKey
    );
    console.log(
      `vault trader before market withdraw, sol: ${vaultStateBefore.baseUnitsFree}, usdc: ${vaultStateBefore.quoteUnitsFree}`
    );
    assert.strictEqual(vaultStateBefore.baseUnitsFree, 0);
    assert.strictEqual(vaultStateBefore.quoteUnitsFree, 1249.75002);

    const investorEquity = await fetchInvestorEquity(
      program,
      conn,
      investor,
      vaultKey,
      marketRegistry
    );
    console.log(`investor equity before market withdraw: ${investorEquity}`);
    assert.strictEqual(investorEquity, 1199.80001619964);

    const investorEquityLots = phoenix.quoteUnitsToQuoteLots(
      investorEquity,
      solUsdcMarket.toString()
    );

    const quoteLots = new BN(investorEquityLots);
    const baseLots = new BN(0);
    const params: MarketTransferParams = {
      quoteLots,
      baseLots,
    };

    try {
      const ix = await program.methods
        .marketWithdraw(params)
        .accounts({
          vault: vaultKey,
          delegate: manager.publicKey,
          phoenix: PHOENIX_PROGRAM_ID,
          logAuthority: getLogAuthority(),
          market: solUsdcMarket,
          baseMint: solMint,
          quoteMint: usdcMint,
          vaultBaseTokenAccount,
          vaultQuoteTokenAccount,
          marketBaseTokenAccount,
          marketQuoteTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      await sendAndConfirm(conn, payer, [ix], [manager]);
    } catch (e: any) {
      throw new Error(e);
    }

    const vaultSolAfter = await tokenBalance(conn, vaultBaseTokenAccount);
    const vaultUsdcAfter = await tokenBalance(conn, vaultQuoteTokenAccount);
    console.log(
      `vault atas after market withdraw, sol: ${vaultSolAfter}, usdc: ${vaultUsdcAfter}`
    );
    assert.strictEqual(vaultSolAfter, 0);
    assert.strictEqual(vaultUsdcAfter, 1199.80002);

    const vaultStateAfter = await fetchTraderState(
      conn,
      solUsdcMarket,
      vaultKey
    );
    console.log(
      `vault trader state after market withdraw, sol: ${vaultStateAfter.baseUnitsFree}, usdc: ${vaultStateAfter.quoteUnitsFree}`
    );
    assert.strictEqual(vaultStateAfter.baseUnitsFree, 0);
    // $249.75002 in profit, ~$199.8 can be withdrawn after 20% profit share,
    // leaving $49.95 in the vault to be claimed by the manager and protocol
    assert.strictEqual(vaultStateAfter.quoteUnitsFree, 49.95);
  });

  it('Withdraw', async () => {
    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });

    const ix = await program.methods
      .investorWithdraw()
      .accounts({
        vault: vaultKey,
        investor,
        authority: provider.publicKey,
        marketRegistry,
        lut,
        investorQuoteTokenAccount: investorUsdcAta,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority: getLogAuthority(),
        market: solUsdcMarket,
        seat: getSeatAddress(solUsdcMarket, vaultKey),
        baseMint: solMint,
        quoteMint: usdcMint,
        vaultBaseTokenAccount: vaultSolAta,
        vaultQuoteTokenAccount: vaultUsdcAta,
        marketBaseTokenAccount: phoenix.getBaseVaultKey(
          solUsdcMarket.toString()
        ),
        marketQuoteTokenAccount: phoenix.getQuoteVaultKey(
          solUsdcMarket.toString()
        ),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(markets)
      .instruction();
    try {
      // await simulate(conn, payer, [ix]);
      await sendAndConfirm(conn, payer, [ix]);
    } catch (e: any) {
      throw new Error(e);
    }
  });
});
