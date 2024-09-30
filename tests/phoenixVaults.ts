import * as anchor from '@coral-xyz/anchor';
import {BN, Program} from '@coral-xyz/anchor';
import {AccountMeta, ConfirmOptions, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram,} from '@solana/web3.js';
import {assert} from 'chai';
import {
  encodeName,
  getInvestorAddressSync,
  getMarketRegistryAddressSync,
  getVaultAddressSync,
  IDL as PHOENIX_VAULTS_IDL,
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
  PHOENIX_VAULTS_PROGRAM_ID,
  PhoenixVaults,
  QUOTE_PRECISION,
  VaultParams,
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
import {TEST_PHOENIX_INVESTOR} from "@cosmic-lab/prop-shop-sdk";
import {WithdrawUnit} from "../../drift-vaults/ts/sdk";

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

  const program: anchor.Program<PhoenixVaults> = new Program(
    PHOENIX_VAULTS_IDL,
    PHOENIX_VAULTS_PROGRAM_ID,
    provider
  );

  let phoenix: PhoenixClient;

  const marketRegistry = getMarketRegistryAddressSync();

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
  const investorAuth = TEST_PHOENIX_INVESTOR;
  const investor = getInvestorAddressSync(vaultKey, investorAuth.publicKey);
  const investorUsdcAta = getAssociatedTokenAddressSync(
    usdcMint,
    investorAuth.publicKey
  );

  const marketKeys: PublicKey[] = LOCALNET_MARKET_CONFIG[
    'localhost'
    ].markets.map((m) => new PublicKey(m.market));
  const startSolUsdcPrice = 100;
  const endSolUsdcPrice = 125;
  const usdcUiAmount = 500_000;
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
    console.log('provider:', provider.publicKey.toString());
    const makerAirdropSig = await conn.requestAirdrop(maker.publicKey, LAMPORTS_PER_SOL * 10);
    const makerAirdropConfirm = (await conn.confirmTransaction(makerAirdropSig)).value;
    if (makerAirdropConfirm.err) {
      throw new Error(`maker airdrop confirm: ${makerAirdropConfirm.err}`);
    }
    const investorAirdropSig = await conn.requestAirdrop(investorAuth.publicKey, LAMPORTS_PER_SOL * 10);
    const investorAirdropConfirm = (await conn.confirmTransaction(investorAirdropSig)).value;
    if (investorAirdropConfirm.err) {
      throw new Error(`investor airdrop confirm: ${investorAirdropConfirm.err}`);
    }
    const investorSol = await conn.getBalance(investorAuth.publicKey);
    assert(investorSol > 0);
  });

  it('Initialize Market Registry', async () => {
    const params = {
      solUsdcMarket,
      usdcMint,
      solMint,
    };
    try {
      await program.methods
        .initializeMarketRegistry(params)
        .accounts({
          authority: provider.publicKey,
          marketRegistry,
        })
        .rpc();
    } catch (e: any) {
      throw new Error(e);
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
    const ix = await program.methods
      .initializeInvestor()
      .accounts({
        vault: vaultKey,
        investor,
        authority: investorAuth.publicKey,
        payer: investorAuth.publicKey
      })
      .instruction();
    await sendAndConfirm(conn, investorAuth, [ix]);
    const acct = await program.account.investor.fetch(investor);
    assert(!!acct);
  });

  it('Deposit', async () => {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      investorAuth.publicKey,
      investorUsdcAta,
      investorAuth.publicKey,
      usdcMint
    );
    const mintToIx = createMintToInstruction(
      usdcMint,
      investorUsdcAta,
      mintAuth.publicKey,
      usdcAmount.toNumber()
    );
    await sendAndConfirm(conn, investorAuth, [createAtaIx, mintToIx], [mintAuth]);

    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });
    const ix = await program.methods
      .investorDeposit(usdcAmount)
      .accounts({
        vault: vaultKey,
        investor,
        authority: investorAuth.publicKey,
        marketRegistry,
        investorQuoteTokenAccount: investorUsdcAta,
        vaultQuoteTokenAccount: vaultUsdcAta,
      })
      .remainingAccounts(markets)
      .instruction();
    try {
      await sendAndConfirm(conn, investorAuth, [ix]);
    } catch (e: any) {
      throw new Error(e);
    }

    const investorAcct = await program.account.investor.fetch(investor);
    const deposits = investorAcct.netDeposits.div(QUOTE_PRECISION).toNumber();
    const shares = investorAcct.vaultShares.div(QUOTE_PRECISION).toNumber();
    console.log(`investor after deposit, usdc: ${deposits}, shares: ${shares}`);
    assert.equal(deposits, usdcUiAmount);
    assert.equal(shares, usdcUiAmount);

    const vaultUsdc = await tokenBalance(conn, vaultUsdcAta);
    console.log(`vault after investor deposit, usdc: ${vaultUsdc}`);
    assert.equal(vaultUsdc, usdcUiAmount);
  });

  it('Vault Deposit to SOL/USDC Market', async () => {
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

    const vaultUsdcBefore = await tokenBalance(conn, vaultQuoteTokenAccount);
    const quoteLots = phoenix.quoteUnitsToQuoteLots(
      vaultUsdcBefore,
      solUsdcMarket.toString()
    );
    const params: MarketTransferParams = {
      quoteLots: new BN(quoteLots),
      baseLots: new BN(0),
    };

    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });
    const ix = await program.methods
      .marketDeposit(params)
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
      })
      .remainingAccounts(markets)
      .instruction();
    try {
      await sendAndConfirm(conn, payer, [ix]);
    } catch (e: any) {
      throw new Error(e);
    }

    const vaultSol = await tokenBalance(conn, vaultBaseTokenAccount);
    const vaultUsdc = await tokenBalance(conn, vaultQuoteTokenAccount);
    console.log(
      `vault after investor deposit, sol: ${vaultSol}, usdc: ${vaultUsdc}`
    );
    assert.equal(vaultSol, 0);
    assert.equal(vaultUsdc, 0);

    const vaultState = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    console.log(
      `vault trader state after investor deposit, sol: ${vaultState.baseUnitsFree}, usdc: ${vaultState.quoteUnitsFree}`
    );
    assert.equal(vaultState.baseUnitsFree, 0);
    assert.equal(vaultState.quoteUnitsFree, usdcUiAmount);
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
    assert.strictEqual(makerSolBefore, usdcUiAmount / startSolUsdcPrice);
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
    assert.strictEqual(vaultBefore.quoteUnitsFree, usdcUiAmount);

    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });

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
        .remainingAccounts(markets)
        .instruction();
      await sendAndConfirm(conn, payer, [ix], [manager]);
    } catch (e: any) {
      throw new Error(e);
    }

    const vaultAfter = await fetchTraderState(conn, solUsdcMarket, vaultKey);
    console.log(
      `taker deposited tokens after buy, sol: ${vaultAfter.baseUnitsFree}, usdc: ${vaultAfter.quoteUnitsFree}`
    );
    assert.strictEqual(vaultAfter.baseUnitsFree, 4_999.5);
    assert.strictEqual(vaultAfter.quoteUnitsFree, 0.005);

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
    assert.strictEqual(marketSolAfter, usdcUiAmount / startSolUsdcPrice);
    assert.strictEqual(marketUsdcAfter, usdcUiAmount);
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
    assert.strictEqual(vaultBefore.baseUnitsFree, 4_999.5);
    assert.strictEqual(vaultBefore.quoteUnitsFree, 0.005);

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

    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });

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
        .remainingAccounts(markets)
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
    // 25% gain on $500,000 minus taker fee
    assert.strictEqual(vaultAfter.quoteUnitsFree, 624_875.01125);

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
    // 25% loss on $500,000 plus maker fee
    assert.strictEqual(makerUsdcAfter, 375_012.5);

    const marketSolAfter = await tokenBalance(conn, marketBaseTokenAccount);
    const marketUsdcAfter = await tokenBalance(conn, marketQuoteTokenAccount);
    console.log(
      `market after taker sell, sol: ${marketSolAfter}, usdc: ${marketUsdcAfter}`
    );
    assert.strictEqual(marketSolAfter, 5_000);
    assert.strictEqual(marketUsdcAfter, 624_987.5);
  });

  //
  // Place pending ask at $125/SOL that never gets filled, so withdraw request can measure price as best ask on-chain.
  //

  it('Maker Bid SOL/USDC @ $125/SOL', async () => {
    // top up the maker's USDC to place a bid
    const usdcAta = getAssociatedTokenAddressSync(usdcMint, maker.publicKey);
    const mintUsdcIx = createMintToInstruction(
      usdcMint,
      usdcAta,
      mintAuth.publicKey,
      usdcAmount.toNumber()
    );
    await sendAndConfirm(conn, payer, [mintUsdcIx], [mintAuth]);

    const solAmount = usdcUiAmount / endSolUsdcPrice;
    const priceInTicks = phoenix.floatPriceToTicks(
      endSolUsdcPrice,
      solUsdcMarket.toBase58()
    );
    const numBaseLots = phoenix.rawBaseUnitsToBaseLotsRoundedDown(
      solAmount,
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
      vaultKey
    );
    console.log(
      `investor equity before withdraw request: ${investorEquityBefore}`
    );
    assert.strictEqual(investorEquityBefore, 624_875.01125);

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
          authority: investorAuth.publicKey,
          marketRegistry,
          vaultUsdcTokenAccount: vaultUsdcAta,
        })
        .remainingAccounts(markets)
        .instruction();

      await sendAndConfirm(conn, investorAuth, [ix]);
    } catch (e: any) {
      throw new Error(e);
    }

    const investorEquityAfter = await fetchInvestorEquity(
      program,
      conn,
      investor,
      vaultKey
    );
    console.log(
      `investor equity after withdraw request: ${investorEquityAfter}`
    );
    assert.strictEqual(investorEquityAfter, 599900.0090011698);

    const investorAcctAfter = await program.account.investor.fetch(investor);
    const withdrawRequestValue =
      investorAcctAfter.lastWithdrawRequest.value.toNumber() /
      QUOTE_PRECISION.toNumber();
    console.log(`investor withdraw request: ${withdrawRequestValue}`);
    // 25% profit on $500,000 is ~$125,000 profit minus 20% total profit share is ~$100,000
    // $500,000 + $100,000 = ~$600,000
    assert.strictEqual(withdrawRequestValue, 599_900.009);
  });

  it('Appoint Liquidator', async () => {
    try {
      const markets: AccountMeta[] = [
        {
          pubkey: solUsdcMarket,
          isWritable: false,
          isSigner: false,
        },
      ];
      const ix = await program.methods
        .appointLiquidator()
        .accounts({
          vault: vaultKey,
          investor,
          authority: investorAuth.publicKey,
          marketRegistry,
          vaultQuoteTokenAccount: vaultUsdcAta,
        })
        .remainingAccounts(markets)
        .instruction();
      await sendAndConfirm(conn, investorAuth, [ix]);
    } catch (e: any) {
      throw new Error(e);
    }
  });

  it('Liquidate Vault SOL/USDC Position', async () => {
    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      vaultKey,
      true
    );
    const vaultUsdcTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const marketBaseTokenAccount = phoenix.getBaseVaultKey(
      solUsdcMarket.toString()
    );
    const marketUsdcTokenAccount = phoenix.getQuoteVaultKey(
      solUsdcMarket.toString()
    );

    const vaultSolBefore = await tokenBalance(conn, vaultBaseTokenAccount);
    const vaultUsdcBefore = await tokenBalance(conn, vaultUsdcTokenAccount);
    console.log(
      `vault before liquidation, sol: ${vaultSolBefore}, usdc: ${vaultUsdcBefore}`
    );
    assert.strictEqual(vaultSolBefore, 0);
    assert.strictEqual(vaultUsdcBefore, 0);

    const vaultStateBefore = await fetchTraderState(
      conn,
      solUsdcMarket,
      vaultKey
    );
    console.log(
      `vault trader before liquidation, sol: ${vaultStateBefore.baseUnitsFree}, usdc: ${vaultStateBefore.quoteUnitsFree}`
    );
    assert.strictEqual(vaultStateBefore.baseUnitsFree, 0);
    assert.strictEqual(vaultStateBefore.quoteUnitsFree, 624_875.01125);

    const investorUsdcBefore = await tokenBalance(conn, investorUsdcAta);
    console.log(`investor usdc before liquidation: ${investorUsdcBefore}`);
    assert.strictEqual(investorUsdcBefore, 0);

    try {
      const markets: AccountMeta[] = [
        {
          pubkey: solUsdcMarket,
          isWritable: false,
          isSigner: false,
        },
      ];
      const ix = await program.methods
        .liquidateUsdcMarket()
        .accounts({
          vault: vaultKey,
          investor,
          authority: investorAuth.publicKey,
          marketRegistry,
          investorUsdcTokenAccount: investorUsdcAta,
          phoenix: PHOENIX_PROGRAM_ID,
          logAuthority: getLogAuthority(),
          market: solUsdcMarket,
          seat: getSeatAddress(solUsdcMarket, vaultKey),
          baseMint: solMint,
          usdcMint,
          vaultBaseTokenAccount,
          vaultUsdcTokenAccount,
          marketBaseTokenAccount,
          marketUsdcTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(markets)
        .instruction();
      await sendAndConfirm(conn, investorAuth, [ix]);
    } catch (e: any) {
      throw new Error(e);
    }

    const vaultSolAfter = await tokenBalance(conn, vaultBaseTokenAccount);
    const vaultUsdcAfter = await tokenBalance(conn, vaultUsdcTokenAccount);
    console.log(
      `vault after liquidation, sol: ${vaultSolAfter}, usdc: ${vaultUsdcAfter}`
    );
    assert.strictEqual(vaultSolAfter, 0);
    assert.strictEqual(vaultUsdcAfter, 599_900.009);

    const vaultStateAfter = await fetchTraderState(
      conn,
      solUsdcMarket,
      vaultKey
    );
    console.log(
      `vault trader state after liquidation, sol: ${vaultStateAfter.baseUnitsFree}, usdc: ${vaultStateAfter.quoteUnitsFree}`
    );
    assert.strictEqual(vaultStateAfter.baseUnitsFree, 0);
    // 25% profit on $500,000 is ~$125,000 profit
    // 20% total profit share on $125,000 is ~$25,000
    assert.strictEqual(vaultStateAfter.quoteUnitsFree, 24_975.00225);
  });

  it('Withdraw', async () => {
    const markets: AccountMeta[] = marketKeys.map((pubkey) => {
      return {
        pubkey,
        isWritable: false,
        isSigner: false,
      };
    });
    try {
      const withdrawIx = await program.methods
        .investorWithdraw()
        .accounts({
          vault: vaultKey,
          investor,
          authority: investorAuth.publicKey,
          marketRegistry,
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
      await sendAndConfirm(conn, investorAuth, [withdrawIx]);
    } catch (e: any) {
      throw new Error(e);
    }

    const vaultSolAfter = await tokenBalance(conn, vaultSolAta);
    const vaultUsdcAfter = await tokenBalance(conn, vaultUsdcAta);
    console.log(
      `vault after withdraw, sol: ${vaultSolAfter}, usdc: ${vaultUsdcAfter}`
    );
    assert.strictEqual(vaultSolAfter, 0);
    assert.strictEqual(vaultUsdcAfter, 0.000001);

    const investorUsdcAfter = await tokenBalance(conn, investorUsdcAta);
    console.log(`investor usdc after withdraw: ${investorUsdcAfter}`);
    assert.strictEqual(investorUsdcAfter, 599_900.008999);

    const investorAcct = await program.account.investor.fetch(investor);
    const withdrawRequest =
      investorAcct.lastWithdrawRequest.value.toNumber() /
      QUOTE_PRECISION.toNumber();
    console.log(`investor withdraw request: ${withdrawRequest}`);
    assert.strictEqual(withdrawRequest, 0);
  });

  it('Hoard of Investors', async () => {
    console.log('generating hoard of investors...');
    for (let i = 0; i < 50; i++) {
      const investorAuth = Keypair.generate();
      const investorAirdropSig = await conn.requestAirdrop(investorAuth.publicKey, LAMPORTS_PER_SOL * 1);
      const investorAirdropConfirm = (await conn.confirmTransaction(investorAirdropSig)).value;
      if (investorAirdropConfirm.err) {
        throw new Error(`investor airdrop confirm: ${investorAirdropConfirm.err}`);
      }

      const investor = getInvestorAddressSync(vaultKey, investorAuth.publicKey);
      const investorUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        investorAuth.publicKey
      );
      const ixs = [];
      const initInvestorIx = await program.methods
        .initializeInvestor()
        .accounts({
          vault: vaultKey,
          investor,
          authority: investorAuth.publicKey,
          payer: investorAuth.publicKey
        })
        .instruction();
      ixs.push(initInvestorIx);

      const createAtaIx = createAssociatedTokenAccountInstruction(
        investorAuth.publicKey,
        investorUsdcAta,
        investorAuth.publicKey,
        usdcMint
      );
      ixs.push(createAtaIx);
      const mintToIx = createMintToInstruction(
        usdcMint,
        investorUsdcAta,
        mintAuth.publicKey,
        usdcAmount.toNumber()
      );
      ixs.push(mintToIx);

      const markets: AccountMeta[] = marketKeys.map((pubkey) => {
        return {
          pubkey,
          isWritable: false,
          isSigner: false,
        };
      });
      const depositIx = await program.methods
        .investorDeposit(usdcAmount)
        .accounts({
          vault: vaultKey,
          investor,
          authority: investorAuth.publicKey,
          marketRegistry,
          investorQuoteTokenAccount: investorUsdcAta,
          vaultQuoteTokenAccount: vaultUsdcAta,
        })
        .remainingAccounts(markets)
        .instruction();
      ixs.push(depositIx);

      try {
        await sendAndConfirm(conn, investorAuth, ixs, [mintAuth]);
      } catch (e: any) {
        throw new Error(e);
      }

      const investorAcct = await program.account.investor.fetch(investor);
      const shares = investorAcct.vaultShares.div(QUOTE_PRECISION).toNumber();
      assert.equal(shares, 400_080);
    }
  }, 60_000);
});
