import {Commitment, ComputeBudgetProgram, Connection, Keypair, PublicKey, Signer, TransactionInstruction,} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {CreatePropShopClientConfig, CreateVaultConfig, DriftVaultsClient, FundOverview, signatureLink, SnackInfo, UiBidAsk,} from '@cosmic-lab/prop-shop-sdk';
import {AsyncSigner, keypairToAsyncSigner, walletAdapterToAsyncSigner,} from '@cosmic-lab/data-source';
import {DriftVaults, getVaultAddressSync, Vault,} from '@drift-labs/vaults-sdk';
import {
  BN,
  DepositRecord,
  DLOBSubscriber,
  DriftClient,
  encodeName,
  EventSubscriber,
  getMarketOrderParams,
  isVariant,
  MarketType,
  OrderActionRecord,
  OrderSubscriber,
  PositionDirection,
  PRICE_PRECISION,
  User,
} from '@drift-labs/sdk';
import * as splToken from '@solana/spl-token';
import {WalletContextState} from '@solana/wallet-adapter-react';
import {err, ok, Result} from 'neverthrow';
import {EventSubscriptionOptions} from '@drift-labs/sdk/src/events/types';

export class DriftMomentumBot {
  private readonly conn: Connection;
  private signer: AsyncSigner;
  key: PublicKey;
  private client: DriftVaultsClient;
  readonly fundName: string;
  private _eventSubscriber: EventSubscriber | undefined;
  private _orderSubscriber: OrderSubscriber | undefined;
  private _dlobSubscriber: DLOBSubscriber | undefined;

  /**
   * Create a new DriftMomentumBot from a keypair (bot) and initialize in one step
   * @param connection - Solana RPC connection
   * @param keypair - Transaction payer and authority of the Prop Shop fund
   * @param fundName - Name of the Prop Shop fund to manage
   */
  static async fromKeypair(
    connection: Connection,
    keypair: Keypair,
    fundName: string
  ): Promise<DriftMomentumBot> {
    const config: CreatePropShopClientConfig = {
      signer: keypairToAsyncSigner(keypair),
      connection,
    };
    const self = new DriftMomentumBot(config, fundName);
    await self.initialize();
    return self;
  }

  /**
   * Create a new DriftMomentumBot from a wallet (UI) and initialize in one step
   * @param connection - Solana RPC connection
   * @param wallet - Transaction payer and authority of the Prop Shop fund
   * @param fundName - Name of the Prop Shop fund to manage
   */
  static async fromWallet(
    connection: Connection,
    wallet: WalletContextState,
    fundName: string
  ): Promise<DriftMomentumBot> {
    const config: CreatePropShopClientConfig = {
      signer: walletAdapterToAsyncSigner(wallet),
      connection,
    };
    const self = new DriftMomentumBot(config, fundName);
    await self.initialize();
    return self;
  }

  constructor(config: CreatePropShopClientConfig, fundName: string) {
    this.conn = config.connection;
    this.signer = config.signer;
    this.key = config.signer.publicKey();
    this.fundName = fundName;
    this.client = new DriftVaultsClient(config);
  }

  async initialize(): Promise<void> {
    await this.client.initialize();
    await this.switchToFundUser();

    //
    // event subscriber
    //
    const options: EventSubscriptionOptions = {
      eventTypes: ['DepositRecord', 'OrderRecord', 'OrderActionRecord'],
      maxTx: 4096,
      maxEventsPerType: 4096,
      orderBy: 'blockchain',
      orderDir: 'asc',
      commitment: 'confirmed',
      logProviderConfig: {
        type: 'websocket',
      },
    };
    this._eventSubscriber = new EventSubscriber(
      this.conn,
      this.driftProgram,
      options
    );
    await this.eventSubscriber.subscribe();
    this.eventSubscriber.eventEmitter.on('newEvent', (event) => {
      if (event.eventType === 'OrderActionRecord') {
        const _event = event as OrderActionRecord;
        if (!isVariant(_event.action, 'fill')) {
          if (!isVariant(_event.marketType, 'spot')) {
            const sm = this.driftClient.getSpotMarketAccount(_event.marketIndex);
            if (!sm) {
              return;
            }
            const info = {
              baseFilled: (_event.baseAssetAmountFilled ?? new BN(0)).div(new BN(Math.pow(10, sm.decimals))).toNumber(),
              quoteFilled: (_event.quoteAssetAmountFilled ?? new BN(0)).div(new BN(Math.pow(10, sm.decimals))).toNumber(),
              marketIndex: _event.marketIndex,
              price: _event.oraclePrice.toNumber() / PRICE_PRECISION.toNumber(),
            };
            console.log('FILL:', info);
          }
        }
      }

      if (event.eventType === 'DepositRecord') {
        const _event = event as DepositRecord;
        const sm = this.driftClient.getSpotMarketAccount(_event.marketIndex);
        if (!sm) {
          return;
        }
        const info = {
          direction: _event.direction,
          marketIndex: _event.marketIndex,
          amount: _event.amount.toNumber(),
          marketDepositBalance: _event.marketDepositBalance.div(new BN(Math.pow(10, sm.decimals))).toNumber(),
          marketWithdrawBalance: _event.marketWithdrawBalance.div(new BN(Math.pow(10, sm.decimals))).toNumber(),
          price: _event.oraclePrice.toNumber() / PRICE_PRECISION.toNumber(),
        };
        console.log('WITHDRAW:', info);
      }
    });

    //
    // orderbook subscriber
    //
    const subscriptionConfig:
      | {
      type: 'polling';
      frequency: number;
      commitment?: Commitment;
    }
      | {
      type: 'websocket';
      skipInitialLoad?: boolean;
      resubTimeoutMs?: number;
      logResubMessages?: boolean;
      resyncIntervalMs?: number;
      commitment?: Commitment;
    } = {
      type: 'websocket',
      commitment: 'confirmed',
      resyncIntervalMs: 30_000,
    };
    this._orderSubscriber = new OrderSubscriber({
      driftClient: this.driftClient,
      subscriptionConfig,
    });
    await this.orderSubscriber.subscribe();
    this._dlobSubscriber = new DLOBSubscriber({
      driftClient: this.driftClient,
      dlobSource: this.orderSubscriber, // or UserMap
      slotSource: this.orderSubscriber, // or UserMap
      updateFrequency: 1000,
    });
    await this.dlobSubscriber.subscribe();
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
    await this.eventSubscriber.unsubscribe();
    await this.orderSubscriber.unsubscribe();
    await this.dlobSubscriber.unsubscribe();
  }

  async switchToFundUser(): Promise<void> {
    const fund = await this.fetchFund();
    if (fund !== undefined) {
      await this.driftClient.addUser(0, this.fundKey);
      await this.driftClient.switchActiveUser(0, this.fundKey);
      console.log('switched active user');
    }
  }

  get driftClient(): DriftClient {
    return this.client.driftClient;
  }

  get eventSubscriber(): EventSubscriber {
    if (!this._eventSubscriber) {
      throw new Error('Event subscriber not initialized');
    }
    return this._eventSubscriber;
  }

  get orderSubscriber(): OrderSubscriber {
    if (!this._orderSubscriber) {
      throw new Error('Order subscriber not initialized');
    }
    return this._orderSubscriber;
  }

  get dlobSubscriber(): DLOBSubscriber {
    if (!this._dlobSubscriber) {
      throw new Error('DLOB subscriber not initialized');
    }
    return this._dlobSubscriber;
  }

  get program(): anchor.Program<DriftVaults> {
    return this.client.vaultProgram;
  }

  get driftProgram(): anchor.Program<anchor.Idl> {
    return this.driftClient.program;
  }

  get fundKey(): PublicKey {
    return getVaultAddressSync(
      this.program.programId,
      encodeName(this.fundName)
    );
  }

  get fund(): FundOverview | undefined {
    const funds = this.client.fundOverviews;
    return funds.find((f) => f.title === this.fundName);
  }

  async fundUser(): Promise<User> {
    const vault = this.client.vault(this.fundKey)?.data;
    if (!vault) {
      throw new Error(`Vault ${this.fundKey} not found`);
    }
    const user = new User({
      driftClient: this.driftClient,
      userAccountPublicKey: vault.user
    });
    await user.subscribe();
    return user;
  }

  get fundOrErr(): FundOverview {
    const funds = this.client.fundOverviews;
    const fund = funds.find((f) => f.title === this.fundName);
    if (!fund) {
      throw new Error(`Fund ${this.fundName} not found`);
    }
    return fund;
  }

  async fetchFund(): Promise<FundOverview | undefined> {
    await this.client.fetchFundOverviews();
    return this.fund;
  }

  async createFund(config: CreateVaultConfig): Promise<SnackInfo> {
    if (this.fund !== undefined) {
      console.warn(`Fund ${this.fundName} already exists`);
      return {
        variant: 'error',
        message: `Fund ${this.fundName} already exists`,
      };
    }
    const snack = (await this.client.createVault(config)).snack;
    // delegate assumes control of vault user
    await this.switchToFundUser();
    return snack;
  }

  async usdcMintInfo(): Promise<
    Result<
      {
        mint: PublicKey;
        authority: PublicKey;
        decimals: number;
      },
      string
    >
  > {
    const sm = this.driftClient.getSpotMarketAccount(0);
    if (!sm) {
      return err('USDC spot market not found');
    }
    const usdcMint = sm.mint;
    const usdcMintData = await splToken.getMint(this.conn, usdcMint);
    if (usdcMintData.mintAuthority === null) {
      return err('Mint authority not found');
    }
    return ok({
      mint: usdcMint,
      authority: usdcMintData.mintAuthority,
      decimals: usdcMintData.decimals,
    });
  }

  private async sendTx(
    ixs: TransactionInstruction[],
    successMessage: string,
    errorMessage: string,
    signers: Signer[] = []
  ): Promise<SnackInfo> {
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 10_000,
      }),
      ...ixs,
    ];

    const recentBlockhash = await this.conn
      .getLatestBlockhash()
      .then((res) => res.blockhash);
    const msg = new anchor.web3.TransactionMessage({
      payerKey: this.key,
      recentBlockhash,
      instructions,
    }).compileToV0Message();
    let tx = new anchor.web3.VersionedTransaction(msg);
    tx = await this.signer.sign(tx);
    tx.sign(signers);

    const sim = (
      await this.conn.simulateTransaction(tx, {
        sigVerify: false,
      })
    ).value;
    if (sim.err) {
      const msg = `${errorMessage}: ${JSON.stringify(sim.err)}}`;
      console.log(sim.logs);
      console.error(msg);
      return {
        variant: 'error',
        message: errorMessage,
      };
    }

    try {
      const sig = await this.conn.sendTransaction(tx, {
        skipPreflight: true,
      });
      console.debug(`${successMessage}: ${signatureLink(sig, this.conn)}`);
      const confirm = await this.conn.confirmTransaction(sig);
      if (confirm.value.err) {
        console.error(`${errorMessage}: ${JSON.stringify(confirm.value.err)}`);
        return {
          variant: 'error',
          message: errorMessage,
        };
      } else {
        return {
          variant: 'success',
          message: successMessage,
        };
      }
    } catch (e: any) {
      return {
        variant: 'error',
        message: errorMessage,
      };
    }
  }

  perpMarketPrice(marketIndex: number): number {
    const pm = this.driftClient.getPerpMarketAccount(marketIndex);
    if (!pm) {
      throw new Error(`Perp market ${marketIndex} not found`);
    }
    const oracle = this.driftClient.getOracleDataForPerpMarket(pm.marketIndex);
    return oracle.price.toNumber() / PRICE_PRECISION.toNumber();
  }

  spotMarketPrice(marketIndex: number): number {
    const sm = this.driftClient.getSpotMarketAccount(marketIndex);
    if (!sm) {
      throw new Error(`Spot market ${marketIndex} not found`);
    }
    const oracle = this.driftClient.getOracleDataForSpotMarket(sm.marketIndex);
    return oracle.price.toNumber() / PRICE_PRECISION.toNumber();
  }

  spotMarketBidAsk(marketIndex: number): UiBidAsk {
    const sm = this.driftClient
      .getSpotMarketAccounts()
      .find((m) => m.marketIndex === marketIndex);
    if (!sm) {
      throw new Error(`Spot market [${marketIndex}] not found`);
    }
    const l3 = this.dlobSubscriber.getL3({
      marketIndex: sm.marketIndex,
      marketType: MarketType.SPOT,
    });
    const bestAsk = l3.asks[0];
    if (!bestAsk) {
      throw new Error('No best ask');
    }
    const bestBid = l3.bids[0];
    if (!bestBid) {
      throw new Error('No best bid');
    }
    return {
      ask: {
        price: bestAsk.price.toNumber() / PRICE_PRECISION.toNumber(),
        size: bestAsk.size.toNumber() / Math.pow(10, sm.decimals),
        maker: bestAsk.maker,
        orderId: bestAsk.orderId,
      },
      bid: {
        price: bestBid.price.toNumber() / PRICE_PRECISION.toNumber(),
        size: bestBid.size.toNumber() / Math.pow(10, sm.decimals),
        maker: bestBid.maker,
        orderId: bestBid.orderId,
      },
    };
  }

  async placeMarketPerpOrder(
    marketIndex: number,
    usdc: number,
    direction: PositionDirection,
    slippagePct = 0.5
  ): Promise<SnackInfo> {
    const price = this.perpMarketPrice(marketIndex);

    let priceDiffBps;
    if (direction === PositionDirection.LONG) {
      priceDiffBps = price * (1 + slippagePct / 100);
    } else {
      priceDiffBps = price * (1 - slippagePct / 100);
    }

    const baseUnits = usdc / price;

    const activeUser = this.driftClient.getUser(0, this.fundKey);
    const fundAcct = (await this.program.account.vault.fetch(
      this.fundKey
    )) as Vault;
    console.log(
      'fund user correct:',
      fundAcct.user.equals(activeUser.getUserAccountPublicKey())
    );
    console.log('fund delegate correct:', fundAcct.delegate.equals(this.key));

    const orderParams = getMarketOrderParams({
      marketIndex,
      direction,
      baseAssetAmount: this.driftClient.convertToPerpPrecision(baseUnits),
      auctionStartPrice: this.driftClient.convertToPricePrecision(price),
      auctionEndPrice: this.driftClient.convertToPricePrecision(priceDiffBps),
      price: this.driftClient.convertToPricePrecision(priceDiffBps),
      auctionDuration: 60,
      maxTs: new BN(Date.now() + 100),
    });

    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [activeUser.getUserAccount()],
      useMarketLastSlotCache: true,
      writablePerpMarketIndexes: [marketIndex],
    });

    try {
      const ix = await this.driftClient.program.methods
        .placePerpOrder(orderParams)
        .accounts({
          state: await this.driftClient.getStatePublicKey(),
          user: activeUser.userAccountPublicKey,
          authority: this.key,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
      return await this.sendTx(
        [ix],
        `Market order placed starting at $${price.toFixed(2)}`,
        'Failed to place market order'
      );
    } catch (e: any) {
      console.error(e);
      return {
        variant: 'error',
        message: JSON.stringify(e),
      };
    }
  }
}
