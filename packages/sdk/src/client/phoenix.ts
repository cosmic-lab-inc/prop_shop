import {
  AccountMeta,
  BaseTransactionConfirmationStrategy,
  ComputeBudgetProgram,
  ConfirmOptions,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionConfirmationStrategy,
  TransactionInstruction,
} from '@solana/web3.js';
import {makeAutoObservable} from 'mobx';
import * as anchor from '@coral-xyz/anchor';
import {AnchorProvider, BN, Program} from '@coral-xyz/anchor';
import {
  asyncSignerToAnchorWallet,
  calculateRealizedInvestorEquity,
  createPhoenixMarketTokenAccountIxs,
  fundDollarPnl,
  getTokenBalance,
  getTraderEquity,
  isAvailable,
  marketsByEquity,
  percentPrecisionToPercent,
  percentToPercentPrecision,
} from '../utils';
import {
  CreateVaultConfig,
  Data,
  FundOverview,
  PhoenixVaultsAccountEvents,
  PhoenixVaultsSubscriber,
  SnackInfo,
  UiL2BidAsk,
  UiTraderState,
  UpdateVaultConfig,
  Venue,
  WithdrawRequestTimer,
} from '../types';
import {EventEmitter} from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import {PhoenixVaultsWebsocketSubscriber} from '../subscriber';
import {
  Client as PhoenixClient,
  deserializeMarketData,
  getLimitOrderPacket,
  getLogAuthority,
  getSeatAddress,
  getSeatDepositCollectorAddress,
  getSeatManagerAddress,
  MarketState,
  OrderPacket,
  PlaceLimitOrderWithFreeFundsInstructionArgs,
  placeLimitOrderWithFreeFundsInstructionDiscriminator,
  PlaceLimitOrderWithFreeFundsStruct,
  RawMarketConfig,
  Side,
  toNum,
} from '@ellipsis-labs/phoenix-sdk';
import {
  CancelMultipleOrdersParams,
  CancelOrderParams,
  encodeName,
  getInvestorAddressSync,
  getMarketRegistryAddressSync,
  getVaultAddressSync,
  IDL as PHOENIX_VAULTS_IDL,
  Investor,
  LOCALNET_MARKET_CONFIG,
  MarketPosition,
  OrderSide,
  PHOENIX_PROGRAM_ID,
  PHOENIX_SEAT_MANAGER_PROGRAM_ID,
  PHOENIX_VAULTS_PROGRAM_ID,
  PhoenixVaults,
  UpdateVaultParams,
  Vault,
  VaultParams,
  WithdrawUnit,
} from '@cosmic-lab/phoenix-vaults-sdk';
import {decodeName, QUOTE_PRECISION} from '@drift-labs/sdk';
import {err, ok, Result} from 'neverthrow';
import {CreatePropShopClientConfig, UpdateWalletConfig} from './types';
import {createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID,} from '@solana/spl-token';
import {AsyncSigner} from '@cosmic-lab/data-source';
import {signatureLink} from '../rpc';
import {ONE_DAY, PROP_SHOP_PERCENT_ANNUAL_FEE, PROP_SHOP_PERCENT_PROFIT_SHARE, PROP_SHOP_PROTOCOL,} from '../constants';
import {Buffer} from "buffer";

interface SolUsdcMarketConfig {
  market: PublicKey;
  solMint: PublicKey;
  usdcMint: PublicKey;
}

export class PhoenixVaultsClient {
  private readonly conn: Connection;
  private signer: AsyncSigner;
  key: PublicKey;
  _phoenixClient: PhoenixClient | undefined;
  _program: Program<PhoenixVaults> | undefined;
  _solUsdcMarket: SolUsdcMarketConfig | undefined;

  loading = false;
  private readonly disableCache: boolean = false;
  dummyWallet = false;

  private eventEmitter: StrictEventEmitter<
    EventEmitter,
    PhoenixVaultsAccountEvents
  > = new EventEmitter();
  private _cache: PhoenixVaultsSubscriber | undefined = undefined;

  private _vaults: Map<string, Vault> = new Map();
  private _investors: Map<string, Investor> = new Map();
  private _timers: Map<string, WithdrawRequestTimer> = new Map();
  // Equity in each vault for the connected wallet
  private _equities: Map<string, number> = new Map();
  private _fundOverviews: Map<string, FundOverview> = new Map();

  constructor(config: CreatePropShopClientConfig) {
    makeAutoObservable(this);
    if (!config.signer.publicKey()) {
      throw new Error('Wallet not connected');
    }
    this.signer = config.signer;
    this.key = config.signer.publicKey();
    this.conn = config.connection;
    this.disableCache = config.disableCache ?? false;
    this.dummyWallet = config.dummyWallet ?? false;
  }

  //
  // Initialization and getters
  //

  /**
   * Initialize the client.
   * Call this upon connecting a wallet.
   */
  async initialize(): Promise<void> {
    if (!this.signer) {
      throw new Error('Wallet not connected during initialization');
    }
    const now = Date.now();
    this.loading = true;

    const provider = new anchor.AnchorProvider(
      this.conn,
      asyncSignerToAnchorWallet(this.signer),
      {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
      } as ConfirmOptions
    );
    this._program = new Program(
      PHOENIX_VAULTS_IDL,
      PHOENIX_VAULTS_PROGRAM_ID,
      provider
    );

    if (this.conn.rpcEndpoint === 'http://localhost:8899') {
      const now = Date.now();
      this._phoenixClient = await PhoenixClient.createFromConfig(
        this.conn,
        LOCALNET_MARKET_CONFIG,
        false,
        false
      );
      console.debug(`loaded localnet Phoenix markets in ${Date.now() - now}ms`);
    } else {
      const now = Date.now();
      const DEFAULT_CONFIG_URL =
        'https://raw.githubusercontent.com/Ellipsis-Labs/phoenix-sdk/master/master_config.json';
      const rawMarketConfigs: RawMarketConfig = await fetch(
        DEFAULT_CONFIG_URL
      ).then((response) => {
        return response.json();
      });
      this._phoenixClient = await PhoenixClient.createFromConfig(
        this.conn,
        rawMarketConfigs,
        false,
        false
      );
      console.debug(`loaded Phoenix markets in ${Date.now() - now}ms`);
    }
    const registry = await this._program.account.marketRegistry.fetch(
      getMarketRegistryAddressSync()
    );
    const solUsdcMarketKeyValue = Array.from(
      this._phoenixClient.marketConfigs.entries()
    ).find(([_, market]) => {
      return (
        market.baseToken.mint === registry.solMint.toString() &&
        market.quoteToken.mint === registry.usdcMint.toString()
      );
    });
    if (!solUsdcMarketKeyValue) {
      throw new Error('SOL/USDC market not found');
    }
    const [solUsdcMarketStr, solUsdcMarketConfig] = solUsdcMarketKeyValue;
    this._solUsdcMarket = {
      market: new PublicKey(solUsdcMarketStr),
      solMint: new PublicKey(solUsdcMarketConfig.baseToken.mint),
      usdcMint: new PublicKey(solUsdcMarketConfig.quoteToken.mint),
    };

    this.eventEmitter.on(
      'investorUpdate',
      (payload: Data<PublicKey, Investor>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._investors.get(payload.key.toString())
        );
        if (update !== existing) {
          this._investors.set(payload.key.toString(), payload.data);
        }
      }
    );
    this.eventEmitter.on(
      'vaultUpdate',
      async (payload: Data<PublicKey, Vault>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._vaults.get(payload.key.toString())
        );
        if (update !== existing) {
          this._vaults.set(payload.key.toString(), payload.data);
          await this.fetchFundOverview(payload.key);
        }
      }
    );

    if (!this.disableCache) {
      const preSub = Date.now();
      await this.loadCache(this._program);
      console.debug(`PhoenixVaults cache loaded in ${Date.now() - preSub}ms`);
    }

    console.debug(`initialized PhoenixVaultsClient in ${Date.now() - now}ms`);
    this.loading = false;
  }

  async loadCache(program: Program<PhoenixVaults>) {
    if (this.disableCache) {
      return;
    }
    this._cache = new PhoenixVaultsWebsocketSubscriber(
      program,
      {
        filters: [
          {
            accountName: 'investor',
            eventType: 'investorUpdate',
          },
          {
            accountName: 'vault',
            eventType: 'vaultUpdate',
          },
        ],
      },
      this.eventEmitter
    );
    await this._cache.subscribe();
  }

  private setSigner(signer: AsyncSigner) {
    this.signer = signer;
    if (!signer.publicKey()) {
      throw new Error('Wallet not connected');
    }
    this.key = signer.publicKey();
  }

  async updateWallet(config: UpdateWalletConfig) {
    this.dummyWallet = config.dummyWallet ?? false;
    this.setSigner(config.signer);

    // update VaultClient wallet
    const anchorWallet = asyncSignerToAnchorWallet(this.signer);
    const newProvider = new AnchorProvider(this.conn, anchorWallet, {
      commitment: 'confirmed',
    });
    this._program = new Program(
      PHOENIX_VAULTS_IDL,
      this.program.programId,
      newProvider
    );
  }

  async shutdown(): Promise<void> {
    await this._cache?.unsubscribe();
  }

  //
  // Getters and utils
  //

  get phoenixClient(): PhoenixClient {
    if (!this._phoenixClient) {
      throw new Error('PhoenixVaultsClient not initialized');
    }
    return this._phoenixClient;
  }

  get program(): Program<PhoenixVaults> {
    if (!this._program) {
      throw new Error('PhoenixVaultsClient not initialized');
    }
    return this._program;
  }

  get solUsdcMarket(): SolUsdcMarketConfig {
    if (!this._solUsdcMarket) {
      throw new Error('PhoenixVaultsClient not initialized');
    }
    return this._solUsdcMarket;
  }

  get marketAccountMetas(): AccountMeta[] {
    return Array.from(this.phoenixClient.marketStates.keys()).map((market) => {
      return {
        pubkey: new PublicKey(market),
        isWritable: false,
        isSigner: false,
      };
    });
  }

  private async isProtocol(
    vault: PublicKey
  ): Promise<Result<boolean, SnackInfo>> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found`,
      });
    }
    if (vaultAcct.protocol.equals(this.key)) {
      return ok(true);
    } else {
      return ok(false);
    }
  }

  private isManager(vault: PublicKey): Result<boolean, SnackInfo> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found`,
      });
    }
    // check if wallet is manager
    if (vaultAcct.manager.equals(this.key)) {
      return ok(true);
    }
    return ok(false);
  }

  getInvestorAddress(vault: PublicKey) {
    return getInvestorAddressSync(vault, this.key);
  }

  private async sendTx(
    ixs: TransactionInstruction[],
    successMessage: string,
    errorMessage: string,
    successCallback?: (...args: any[]) => Promise<void>
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

    const sim = (
      await this.conn.simulateTransaction(tx, {
        sigVerify: false,
      })
    ).value;
    if (sim.err) {
      const msg = `${errorMessage}: ${JSON.stringify(sim.err)}}`;
      console.error(msg);
      console.log('simulation:', sim.logs);
      return {
        variant: 'error',
        message: errorMessage,
      };
    }

    try {
      const signature = await this.conn.sendTransaction(tx, {
        skipPreflight: true,
      });
      console.debug(`${successMessage}: ${signatureLink(signature)}`);
      const confirmStrategy: Readonly<BaseTransactionConfirmationStrategy> = {
        signature,
      };
      const confirm = await this.conn.confirmTransaction(
        confirmStrategy as TransactionConfirmationStrategy
      );
      if (confirm.value.err) {
        console.error(`${errorMessage}: ${JSON.stringify(confirm.value.err)}`);
        return {
          variant: 'error',
          message: errorMessage,
        };
      } else {
        if (successCallback) {
          await successCallback();
        }
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

  //
  // State and cache
  //

  vault(key: PublicKey): Data<PublicKey, Vault> | undefined {
    const data = this._vaults.get(key.toString());
    if (!data) {
      return;
    } else {
      return {
        key,
        data,
      };
    }
  }

  managedVaults(): Data<PublicKey, Vault>[] {
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults = this.vaults();
    return vaults.filter((v) => {
      return v.data.manager === this.key;
    });
  }

  investedVaults(): PublicKey[] {
    const investors = this.investors(true);
    return investors.map((vd) => vd.data.vault);
  }

  async fetchVault(key: PublicKey): Promise<Vault | undefined> {
    try {
      const vault: Vault = await this.program.account.vault.fetch(key);
      this._vaults.set(key.toString(), vault);
      return vault;
    } catch (e: any) {
      return undefined;
    }
  }

  async fetchInvestor(key: PublicKey): Promise<Investor | undefined> {
    try {
      const investor: Investor = await this.program.account.investor.fetch(key);
      this._investors.set(key.toString(), investor);
      return investor;
    } catch (e: any) {
      return undefined;
    }
  }

  vaults(filters?: {
    managed?: boolean;
    invested?: boolean;
  }): Data<PublicKey, Vault>[] {
    const vaults = Array.from(this._vaults.entries())
      .filter(([_key, value]) => {
        const managedFilter = filters?.managed
          ? value.manager.equals(this.key)
          : true;
        const investedFilter = filters?.invested
          ? this.investedVaults()
            .map((k) => k.toString())
            .includes(value.pubkey.toString())
          : true;
        return managedFilter && investedFilter;
      })
      .map(([key, data]) => {
        return {
          key: new PublicKey(key),
          data,
        };
      }) as Data<PublicKey, Vault>[];
    return vaults;
  }

  investor(key: PublicKey): Data<PublicKey, Investor> | undefined {
    const data = this._investors.get(key.toString());
    if (!data) {
      return undefined;
    } else {
      return {
        key,
        data,
      };
    }
  }

  async getOrFetchInvestor(key: PublicKey) {
    const investor = this.investor(key)?.data;
    if (!investor) {
      const _investor = await this.fetchInvestor(key);
      if (!_investor) {
        throw new Error(`Investor ${key.toString()} not found`);
      } else {
        return _investor;
      }
    } else {
      return investor;
    }
  }

  investors(filterByAuthority?: boolean): Data<PublicKey, Investor>[] {
    if (!this._cache) {
      throw new Error('Cache not initialized');
    }
    // account subscriber fetches upon subscription, so these should never be undefined
    const investors = Array.from(this._investors.entries())
      .filter(([_key, data]) => {
        if (filterByAuthority) {
          return data.authority.equals(this.key);
        } else {
          return true;
        }
      })
      .map(([key, data]) => {
        return {
          key: new PublicKey(key),
          data,
        };
      }) as Data<PublicKey, Investor>[];
    return investors;
  }

  //
  // Fetch and aggregate data
  //

  async fetchVaultEquity(vault: Vault): Promise<number> {
    await this.phoenixClient.refreshAllMarkets(false);
    let equity = 0;
    equity += await getTokenBalance(this.conn, vault.usdcTokenAccount);
    for (const position of vault.positions) {
      if (isAvailable(position as MarketPosition)) {
        continue;
      }
      const marketState = this.phoenixClient.marketStates.get(
        position.market.toString()
      );
      if (!marketState) {
        throw new Error(`Market ${position.market.toString()} not found`);
      }
      equity += getTraderEquity(marketState, vault.pubkey) ?? 0;
    }
    return equity;
  }

  async fetchInvestorEquity(vaultKey: PublicKey): Promise<number | undefined> {
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      throw new Error(`Vault ${vaultKey.toString()} not found`);
    }

    const investorKey = getInvestorAddressSync(vaultKey, this.key);
    const investor = this.investor(investorKey)?.data;
    if (!investor) {
      console.debug(`Investor ${investorKey.toString()} not found for vault`);
      return undefined;
    }
    const vaultEquity = await this.fetchVaultEquity(vault);
    const vaultEquityBN = new BN(vaultEquity * QUOTE_PRECISION.toNumber());
    const investorEquityBN = calculateRealizedInvestorEquity(
      investor,
      vaultEquityBN,
      vault
    );
    const usdc = investorEquityBN.toNumber() / QUOTE_PRECISION.toNumber();
    this._equities.set(vault.pubkey.toString(), usdc);
    return usdc;
  }

  percentShare(vaultKey: PublicKey): number | undefined {
    const investorKey = getInvestorAddressSync(vaultKey, this.key);
    const investor = this.investor(investorKey)?.data;
    if (!investor) {
      return undefined;
    }
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return undefined;
    }
    return (
      (investor.vaultShares.toNumber() / vault.totalShares.toNumber()) * 100
    );
  }

  equityInVault(vault: PublicKey): number | undefined {
    return this._equities.get(vault.toString());
  }

  private setFundOverview(key: PublicKey, fo: FundOverview) {
    this._fundOverviews.set(key.toString(), fo);
  }

  async fetchFundOverview(
    vaultKey: PublicKey
  ): Promise<FundOverview | undefined> {
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return undefined;
    }
    const vaultInvestors = new Map<string, Map<string, number>>();
    for (const investor of this.investors()) {
      const vaultKey = investor.data.vault.toString();
      const investors = vaultInvestors.get(vaultKey) ?? new Map();
      const totalProfit =
        investor.data.cumulativeProfitShareAmount.toNumber() /
        QUOTE_PRECISION.toNumber();
      investors.set(investor.key.toString(), totalProfit);
      vaultInvestors.set(vaultKey, investors);
    }

    const investors = vaultInvestors.get(vault.pubkey.toString()) ?? new Map();
    const investorProfit = (Array.from(investors.values()) as number[]).reduce(
      (a: number, b: number) => a + b,
      0
    );
    const managerProfit =
      vault.managerTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();
    const protocolProfit =
      vault.protocolTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();

    const fo: FundOverview = {
      vault: vault.pubkey,
      manager: vault.manager,
      venue: Venue.Phoenix,
      investorProfit,
      managerProfit,
      protocolProfit,
      profit: investorProfit,
      profitAfterFees: investorProfit - managerProfit - protocolProfit,
      tvl: await this.fetchVaultEquity(vault),
      birth: new Date(Number(vault.initTs.toNumber() * 1000)),
      title: decodeName(vault.name),
      investors,
    };
    this.setFundOverview(vault.pubkey, fo);
    return fo;
  }

  async fetchFundOverviews(): Promise<FundOverview[]> {
    const vaultInvestors = new Map<string, Map<string, number>>();
    for (const investor of this.investors()) {
      const vaultKey = investor.data.vault.toString();
      const investors = vaultInvestors.get(vaultKey) ?? new Map();
      const totalProfit =
        investor.data.cumulativeProfitShareAmount.toNumber() /
        QUOTE_PRECISION.toNumber();
      investors.set(investor.key.toString(), totalProfit);
      vaultInvestors.set(vaultKey, investors);
    }

    const fundOverviews: FundOverview[] = [];
    for (const _vault of this.vaults()) {
      const vault = _vault.data;
      const investors =
        vaultInvestors.get(vault.pubkey.toString()) ?? new Map();
      const investorProfit = (
        Array.from(investors.values()) as number[]
      ).reduce((a: number, b: number) => a + b, 0);
      const managerProfit =
        vault.managerTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();
      const protocolProfit =
        vault.protocolTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();

      const fo: FundOverview = {
        vault: vault.pubkey,
        manager: vault.manager,
        venue: Venue.Phoenix,
        investorProfit,
        managerProfit,
        protocolProfit,
        profit: investorProfit,
        profitAfterFees: investorProfit - managerProfit - protocolProfit,
        tvl: await this.fetchVaultEquity(vault),
        birth: new Date(Number(vault.initTs.toNumber() * 1000)),
        title: decodeName(vault.name),
        investors,
      };
      fundOverviews.push(fo);
      this.setFundOverview(vault.pubkey, fo);
    }
    return fundOverviews;
  }

  get fundOverviews(): FundOverview[] {
    const values = Array.from(this._fundOverviews.values());
    values.sort((a, b) => {
      const _a = fundDollarPnl(a);
      const _b = fundDollarPnl(b);
      return _b - _a;
    });
    return values;
  }

  //
  // Withdraw timers
  //

  withdrawTimer(vault: PublicKey): WithdrawRequestTimer | undefined {
    return this._timers.get(vault.toString());
  }

  private async createInvestorWithdrawTimer(vault: PublicKey): Promise<void> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }
    const investorKey = getInvestorAddressSync(vault, this.key);

    // force fetch of vault and vaultDepositor accounts in case websocket is slow to update
    await this.fetchVault(vault);
    await this.fetchInvestor(investorKey);

    const investorAcct = this.investor(investorKey)?.data;
    if (!investorAcct) {
      this.removeWithdrawTimer(vault);
      return;
    }
    const reqTs = investorAcct.lastWithdrawRequest.ts.toNumber();

    if (
      investorAcct.lastWithdrawRequest.value.toNumber() === 0 ||
      reqTs === 0
    ) {
      this.removeWithdrawTimer(vault);
      return;
    }

    const equity =
      investorAcct.lastWithdrawRequest.value.toNumber() /
      QUOTE_PRECISION.toNumber();

    const checkTime = () => {
      const now = Math.floor(Date.now() / 1000);
      const timeSinceReq = now - reqTs;
      const redeemPeriod = vaultAcct.redeemPeriod.toNumber();
      return Math.max(redeemPeriod - timeSinceReq, 0);
    };

    const timer = setInterval(() => {
      this._timers.set(vault.toString(), {
        timer,
        secondsRemaining: checkTime(),
        equity,
      });
    }, 1000);
  }

  private async createManagerWithdrawTimer(vault: PublicKey): Promise<void> {
    const isManager = this.isManager(vault).unwrapOr(false);
    if (!isManager) {
      return;
    }
    // force fetch of vault and vaultDepositor accounts in case websocket is slow to update
    // await this._cache?.fetch();
    await this.fetchVault(vault);

    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault not found: ${vault.toString()}`);
    }

    const reqTs = vaultAcct.lastManagerWithdrawRequest.ts.toNumber();

    if (
      vaultAcct.lastManagerWithdrawRequest.value.toNumber() === 0 ||
      reqTs === 0
    ) {
      this.removeWithdrawTimer(vault);
      return;
    }

    const equity =
      vaultAcct.lastManagerWithdrawRequest.value.toNumber() /
      QUOTE_PRECISION.toNumber();

    const checkTime = () => {
      const now = Math.floor(Date.now() / 1000);
      const timeSinceReq = now - reqTs;
      const redeemPeriod = vaultAcct.redeemPeriod.toNumber();
      return Math.max(redeemPeriod - timeSinceReq, 0);
    };

    const timer = setInterval(() => {
      this._timers.set(vault.toString(), {
        timer,
        secondsRemaining: checkTime(),
        equity,
      });
    }, 1000);
  }

  private async createProtocolWithdrawTimer(vault: PublicKey): Promise<void> {
    const isProtocol = (await this.isProtocol(vault)).unwrapOr(false);
    if (!isProtocol) {
      return;
    }
    // force fetch of vault and vaultDepositor accounts in case websocket is slow to update
    // await this._cache?.fetch();
    await this.fetchVault(vault);

    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault not found: ${vault.toString()}`);
    }

    const reqTs = vaultAcct.lastProtocolWithdrawRequest.ts.toNumber();
    if (
      vaultAcct.lastProtocolWithdrawRequest.value.toNumber() === 0 ||
      reqTs === 0
    ) {
      this.removeWithdrawTimer(vault);
      return;
    }

    const equity =
      vaultAcct.lastProtocolWithdrawRequest.value.toNumber() /
      QUOTE_PRECISION.toNumber();

    const checkTime = () => {
      const now = Math.floor(Date.now() / 1000);
      const timeSinceReq = now - reqTs;
      const redeemPeriod = vaultAcct.redeemPeriod.toNumber();
      return Math.max(redeemPeriod - timeSinceReq, 0);
    };

    const timer = setInterval(() => {
      this._timers.set(vault.toString(), {
        timer,
        secondsRemaining: checkTime(),
        equity,
      });
    }, 1000);
  }

  async createWithdrawTimer(vault: PublicKey): Promise<void> {
    await this.createManagerWithdrawTimer(vault);
    await this.createProtocolWithdrawTimer(vault);
    await this.createInvestorWithdrawTimer(vault);
  }

  private removeWithdrawTimer(vault: PublicKey) {
    const result = this._timers.get(vault.toString());
    console.log('timer:', result?.equity);
    if (result) {
      clearInterval(result.timer);
    }
    this._timers.delete(vault.toString());
  }

  //
  // Investor actions
  //

  async deposit(vaultKey: PublicKey, usdc: number): Promise<SnackInfo> {
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return {
        variant: 'error',
        message: `Vault ${vaultKey.toString()} not found`,
      };
    }
    const solUsdcMarket = this.solUsdcMarket;
    const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
      solUsdcMarket.usdcMint,
      vaultKey,
      true
    );
    const investorKey = getInvestorAddressSync(vaultKey, this.key);
    const investorQuoteTokenAccount = getAssociatedTokenAddressSync(
      solUsdcMarket.usdcMint,
      this.key
    );

    const ixs: TransactionInstruction[] = [];
    const investorUsdcExists = await this.conn.getAccountInfo(
      investorQuoteTokenAccount
    );
    if (investorUsdcExists === null) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          this.key,
          investorQuoteTokenAccount,
          this.key,
          solUsdcMarket.usdcMint
        )
      );
    }

    const investor = this.investor(investorKey)?.data;
    if (!investor) {
      ixs.push(
        await this.program.methods
          .initializeInvestor()
          .accounts({
            vault: vaultKey,
            investor: investorKey,
            authority: this.key,
          })
          .instruction()
      );
    }

    const usdcAmount = new BN(usdc * QUOTE_PRECISION.toNumber());
    console.log('deposit BN:', usdcAmount.toNumber());
    ixs.push(
      await this.program.methods
        .investorDeposit(usdcAmount)
        .accounts({
          vault: vaultKey,
          investor: investorKey,
          authority: this.key,
          marketRegistry: getMarketRegistryAddressSync(),
          investorQuoteTokenAccount,
          vaultQuoteTokenAccount,
        })
        .remainingAccounts(this.marketAccountMetas)
        .instruction()
    );
    return this.sendTx(
      ixs,
      `Deposited to ${decodeName(vault.name)}`,
      `Failed to deposit to ${decodeName(vault.name)}`,
      async () => {
        await this.fetchInvestorEquity(vaultKey);
        await this.fetchFundOverview(vaultKey);
      }
    );
  }

  async requestWithdraw(vaultKey: PublicKey, usdc: number): Promise<SnackInfo> {
    const investorKey = getInvestorAddressSync(vaultKey, this.key);
    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return {
        variant: 'error',
        message: `Vault ${vaultKey.toString()} not found`,
      };
    }
    const vaultUsdcTokenAccount = vault.usdcTokenAccount;
    const ix = await this.program.methods
      .investorRequestWithdraw(amount, WithdrawUnit.TOKEN)
      .accounts({
        vault: vaultKey,
        investor: investorKey,
        authority: this.key,
        marketRegistry: getMarketRegistryAddressSync(),
        vaultUsdcTokenAccount,
      })
      .remainingAccounts(this.marketAccountMetas)
      .instruction();
    return this.sendTx(
      [ix],
      `Requested withdrawal of $${usdc} from ${decodeName(vault.name)}`,
      `Failed to request withdrawal of $${usdc} from ${decodeName(vault.name)}`,
      async () => {
        await this.fetchInvestorEquity(vaultKey);
        await this.fetchFundOverviews();
        await this.createWithdrawTimer(vaultKey);
      }
    );
  }

  async cancelWithdrawRequest(vaultKey: PublicKey): Promise<SnackInfo> {
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return {
        variant: 'error',
        message: `Vault ${vaultKey.toString()} not found`,
      };
    }

    const ix = await this.program.methods
      .cancelWithdrawRequest()
      .accounts({
        vault: vaultKey,
        investor: getInvestorAddressSync(vaultKey, this.key),
        marketRegistry: getMarketRegistryAddressSync(),
        authority: this.key,
        vaultUsdcTokenAccount: vault.usdcTokenAccount,
      })
      .remainingAccounts(this.marketAccountMetas)
      .instruction();
    return this.sendTx(
      [ix],
      `Cancelled withdraw from ${decodeName(vault.name)}`,
      `Failed to cancel withdraw from ${decodeName(vault.name)}`,
      async () => {
        this.removeWithdrawTimer(vaultKey);
        await this.fetchInvestorEquity(vaultKey);
        await this.fetchFundOverview(vaultKey);
      }
    );
  }

  async withdraw(vaultKey: PublicKey): Promise<SnackInfo> {
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return {
        variant: 'error',
        message: `Vault ${vaultKey.toString()} not found`,
      };
    }
    const investorKey = getInvestorAddressSync(vaultKey, this.key);
    const {market: solUsdcMarket, usdcMint, solMint} = this.solUsdcMarket;
    const marketRegistry = getMarketRegistryAddressSync();
    const investorUsdcTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      this.key
    );
    const vaultSolTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      vaultKey,
      true
    );
    const vaultUsdcTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const logAuthority = getLogAuthority();

    const ixs: TransactionInstruction[] = [];

    // check if liquidation required
    const investorAcct = this.investor(investorKey)?.data;
    if (!investorAcct) {
      throw new Error(`Investor ${investorKey.toString()} not found`);
    }
    const withdrawRequest =
      investorAcct.lastWithdrawRequest.value.toNumber() /
      QUOTE_PRECISION.toNumber();
    const vaultUsdc = await getTokenBalance(this.conn, vaultUsdcTokenAccount);
    if (vaultUsdc < withdrawRequest) {
      // appoint investor as liquidator
      const appointLiquidatorIx = await this.program.methods
        .appointInvestorLiquidator()
        .accounts({
          vault: vaultKey,
          investor: investorKey,
          authority: this.key,
          marketRegistry,
          vaultQuoteTokenAccount: vaultUsdcTokenAccount,
        })
        .remainingAccounts(this.marketAccountMetas)
        .instruction();
      ixs.push(appointLiquidatorIx);

      let equityToLiquidate = withdrawRequest - vaultUsdc;
      for (const state of marketsByEquity(
        this.phoenixClient.marketStates,
        vaultKey
      )) {
        const marketEquity = getTraderEquity(state, vaultKey) ?? 0;
        if (marketEquity === undefined) {
          continue;
        }
        const quoteMint = state.data.header.quoteParams.mintKey;
        let liquidateIxsResult: Result<TransactionInstruction[], string>;
        if (quoteMint.equals(usdcMint)) {
          liquidateIxsResult = await this.liquidateUsdcMarketIxs(vault, state);
        } else if (quoteMint.equals(solMint)) {
          liquidateIxsResult = await this.liquidateSolMarketIxs(vault, state);
        } else {
          return {
            variant: 'error',
            message: `Unsupported market denomination: ${quoteMint.toString()}`,
          };
        }
        if (liquidateIxsResult.isErr()) {
          return {
            variant: 'error',
            message: liquidateIxsResult.error,
          };
        }
        ixs.push(...liquidateIxsResult.value);

        equityToLiquidate -= marketEquity;
        if (equityToLiquidate <= 0) {
          break;
        }
      }
    }

    const withdrawIx = await this.program.methods
      .investorWithdraw()
      .accounts({
        vault: vaultKey,
        investor: investorKey,
        authority: this.key,
        marketRegistry,
        investorQuoteTokenAccount: investorUsdcTokenAccount,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority,
        market: solUsdcMarket,
        seat: getSeatAddress(solUsdcMarket, vaultKey),
        baseMint: solMint,
        quoteMint: usdcMint,
        vaultBaseTokenAccount: vaultSolTokenAccount,
        vaultQuoteTokenAccount: vaultUsdcTokenAccount,
        marketBaseTokenAccount: this.phoenixClient.getBaseVaultKey(
          solUsdcMarket.toString()
        ),
        marketQuoteTokenAccount: this.phoenixClient.getQuoteVaultKey(
          solUsdcMarket.toString()
        ),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(this.marketAccountMetas)
      .instruction();
    ixs.push(withdrawIx);

    return await this.sendTx(
      ixs,
      `Withdrew from ${decodeName(vault.name)}`,
      `Failed to withdraw from ${decodeName(vault.name)}`,
      async () => {
        this.removeWithdrawTimer(vaultKey);
        await this.fetchInvestorEquity(vaultKey);
        await this.fetchFundOverview(vaultKey);
      }
    );
  }

  private async liquidateSolMarketIxs(
    vault: Vault,
    state: MarketState
  ): Promise<Result<TransactionInstruction[], string>> {
    const vaultKey = vault.pubkey;
    const {market: solUsdcMarket, solMint, usdcMint} = this.solUsdcMarket;
    const investorKey = getInvestorAddressSync(vaultKey, this.key);
    const marketRegistry = getMarketRegistryAddressSync();
    const investorUsdcTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      this.key
    );
    const vaultSolTokenAccount = getAssociatedTokenAddressSync(
      solMint,
      vaultKey,
      true
    );
    const vaultUsdcTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const logAuthority = getLogAuthority();

    const market = state.address;
    const baseMint = state.data.header.baseParams.mintKey;
    const quoteMint = state.data.header.quoteParams.mintKey;
    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      baseMint,
      vaultKey,
      true
    );

    if (!quoteMint.equals(solMint)) {
      return err(`Market not SOL denominated: ${quoteMint.toString()}`);
    }

    const seatManager = getSeatManagerAddress(market);
    const seatDepositCollector = getSeatDepositCollectorAddress(market);
    const seat = getSeatAddress(market, vaultKey);
    const claimSeatIx = await this.program.methods
      .claimSeat()
      .accounts({
        vault: vaultKey,
        delegate: this.key,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority,
        market,
        seatManager,
        seatDepositCollector,
        payer: this.key,
        seat,
        systemProgram: SystemProgram.programId,
        phoenixSeatManager: PHOENIX_SEAT_MANAGER_PROGRAM_ID,
      })
      .instruction();

    // if liquidation required, it needs to sell on SOL/USDC market.
    // Claim a seat on SOL/USDC market, just in case.
    const solUsdcMarketSeat = getSeatAddress(solUsdcMarket, vaultKey);
    const claimSolUsdcSeatIx = await this.program.methods
      .claimSeat()
      .accounts({
        vault: vaultKey,
        delegate: this.key,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority,
        market: solUsdcMarket,
        seatManager: getSeatManagerAddress(solUsdcMarket),
        seatDepositCollector: getSeatDepositCollectorAddress(solUsdcMarket),
        payer: this.key,
        seat: solUsdcMarketSeat,
        systemProgram: SystemProgram.programId,
        phoenixSeatManager: PHOENIX_SEAT_MANAGER_PROGRAM_ID,
      })
      .instruction();

    // liquidate SOL denominated market
    const liquidateIx = await this.program.methods
      .investorLiquidateSolMarket()
      .accounts({
        vault: vaultKey,
        investor: investorKey,
        authority: this.key,
        marketRegistry,
        investorUsdcTokenAccount,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority,
        market,
        seat,
        baseMint,
        solMint,
        usdcMint,
        vaultBaseTokenAccount,
        vaultSolTokenAccount,
        vaultUsdcTokenAccount,
        marketBaseTokenAccount: this.phoenixClient.getBaseVaultKey(
          market.toString()
        ),
        marketSolTokenAccount: this.phoenixClient.getQuoteVaultKey(
          market.toString()
        ),
        solUsdcMarket,
        solUsdcMarketSeat,
        solUsdcMarketSolTokenAccount: this.phoenixClient.getBaseVaultKey(
          solUsdcMarket.toString()
        ),
        solUsdcMarketUsdcTokenAccount: this.phoenixClient.getQuoteVaultKey(
          solUsdcMarket.toString()
        ),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(this.marketAccountMetas)
      .instruction();
    return ok([claimSeatIx, claimSolUsdcSeatIx, liquidateIx]);
  }

  private async liquidateUsdcMarketIxs(
    vault: Vault,
    state: MarketState
  ): Promise<Result<TransactionInstruction[], string>> {
    const vaultKey = vault.pubkey;
    const {usdcMint} = this.solUsdcMarket;
    const investorKey = getInvestorAddressSync(vaultKey, this.key);
    const marketRegistry = getMarketRegistryAddressSync();
    const investorUsdcTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      this.key
    );
    const vaultUsdcTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      vaultKey,
      true
    );
    const logAuthority = getLogAuthority();

    const market = state.address;
    const baseMint = state.data.header.baseParams.mintKey;
    const quoteMint = state.data.header.quoteParams.mintKey;
    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      baseMint,
      vaultKey,
      true
    );

    if (!quoteMint.equals(usdcMint)) {
      return err(`Market not USDC denominated: ${quoteMint.toString()}`);
    }

    const seatManager = getSeatManagerAddress(market);
    const seatDepositCollector = getSeatDepositCollectorAddress(market);
    const seat = getSeatAddress(market, vaultKey);
    const claimSeatIx = await this.program.methods
      .claimSeat()
      .accounts({
        vault: vaultKey,
        delegate: this.key,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority,
        market,
        seatManager,
        seatDepositCollector,
        payer: this.key,
        seat,
        systemProgram: SystemProgram.programId,
        phoenixSeatManager: PHOENIX_SEAT_MANAGER_PROGRAM_ID,
      })
      .instruction();

    // liquidate USDC denominated market
    const liquidateIx = await this.program.methods
      .investorLiquidateUsdcMarket()
      .accounts({
        vault: vaultKey,
        investor: investorKey,
        authority: this.key,
        marketRegistry,
        investorUsdcTokenAccount,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority,
        market,
        seat,
        baseMint,
        usdcMint,
        vaultBaseTokenAccount,
        vaultUsdcTokenAccount,
        marketBaseTokenAccount: this.phoenixClient.getBaseVaultKey(
          market.toString()
        ),
        marketUsdcTokenAccount: this.phoenixClient.getQuoteVaultKey(
          market.toString()
        ),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(this.marketAccountMetas)
      .instruction();

    return ok([claimSeatIx, liquidateIx]);
  }

  async createVault(params: CreateVaultConfig): Promise<{
    vault: PublicKey;
    snack: SnackInfo;
  }> {
    if (params.redeemPeriod && params.redeemPeriod > ONE_DAY * 90) {
      throw new Error('Redeem period must be less than 90 days');
    }

    const profitShare = percentToPercentPrecision(
      params.percentProfitShare ?? 0
    ).toNumber();
    const managementFee = percentToPercentPrecision(
      params.percentAnnualManagementFee ?? 0
    );
    const minDepositAmount = new BN(
      (params.minDepositUSDC ?? 0) * QUOTE_PRECISION.toNumber()
    );
    const permissioned = params.permissioned ?? false;
    const redeemPeriod = new BN(params.redeemPeriod ?? ONE_DAY);
    const maxTokens = new BN(
      (params.maxCapacityUSDC ?? 0) * QUOTE_PRECISION.toNumber()
    );

    const vaultKey = getVaultAddressSync(encodeName(params.name));
    const marketState = this.phoenixClient.marketStates.get(
      this.solUsdcMarket.market.toString()
    );
    if (marketState === undefined) {
      throw Error('SOL/USDC market not found');
    }

    const config: VaultParams = {
      name: encodeName(params.name),
      redeemPeriod,
      maxTokens,
      managementFee,
      minDepositAmount,
      profitShare,
      hurdleRate: 0,
      permissioned,
      protocol: PROP_SHOP_PROTOCOL,
      protocolFee: percentToPercentPrecision(PROP_SHOP_PERCENT_ANNUAL_FEE),
      protocolProfitShare: percentToPercentPrecision(
        PROP_SHOP_PERCENT_PROFIT_SHARE
      ).toNumber(),
    };
    const ixs: TransactionInstruction[] = [];
    ixs.push(
      ...(await createPhoenixMarketTokenAccountIxs(
        this.conn,
        marketState,
        vaultKey,
        this.key
      ))
    );
    ixs.push(
      await this.program.methods
        .initializeVault(config)
        .accounts({
          vault: vaultKey,
          usdcTokenAccount: getAssociatedTokenAddressSync(
            this.solUsdcMarket.usdcMint,
            vaultKey,
            true
          ),
          usdcMint: this.solUsdcMarket.usdcMint,
          solTokenAccount: getAssociatedTokenAddressSync(
            this.solUsdcMarket.solMint,
            vaultKey,
            true
          ),
          solMint: this.solUsdcMarket.solMint,
          manager: this.key,
        })
        .instruction()
    );
    if (params.delegate) {
      const updateParams: UpdateVaultParams = {
        redeemPeriod: null,
        maxTokens: null,
        managementFee: null,
        minDepositAmount: null,
        profitShare: null,
        hurdleRate: null,
        permissioned: null,
        delegate: params.delegate,
      };
      ixs.push(
        await this.program.methods
          .updateVault(updateParams)
          .accounts({
            vault: vaultKey,
            manager: this.key,
          })
          .instruction()
      );
    }
    const snack = await this.sendTx(
      ixs,
      `Created vault: ${params.name}`,
      `Failed to create vault: ${params.name}`,
      async (): Promise<void> => {
        const vault = await this.fetchVault(vaultKey);
        if (!vault) {
          throw new Error(`Vault ${vaultKey.toString()} not found`);
        }
        await this.fetchInvestorEquity(vaultKey);
        await this.fetchFundOverview(vaultKey);
      }
    );
    return {
      vault: vaultKey,
      snack,
    };
  }

  defaultUpdateVaultConfig(vault: PublicKey): UpdateVaultConfig {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }
    const percentProfitShare = percentPrecisionToPercent(vaultAcct.profitShare);
    const percentAnnualManagementFee = percentPrecisionToPercent(
      vaultAcct.managementFee.toNumber()
    );
    const minDepositUSDC =
      vaultAcct.minDepositAmount.toNumber() / QUOTE_PRECISION.toNumber();
    const maxCapacityUSDC =
      vaultAcct.maxTokens.toNumber() / QUOTE_PRECISION.toNumber();
    const config: UpdateVaultConfig = {
      redeemPeriod: vaultAcct.redeemPeriod.toNumber(),
      maxCapacityUSDC,
      percentAnnualManagementFee,
      minDepositUSDC,
      percentProfitShare,
      permissioned: vaultAcct.permissioned,
      delegate: vaultAcct.delegate,
    };
    return config;
  }

  async updateVault(vaultKey: PublicKey, config: UpdateVaultConfig) {
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      throw new Error(`Vault ${vaultKey.toString()} not found`);
    }
    let profitShare: number | null = percentToPercentPrecision(
      config.percentProfitShare ?? 0
    ).toNumber();
    if (profitShare >= vault.profitShare) {
      profitShare = null;
    }
    let managementFee: BN | null = percentToPercentPrecision(
      config.percentAnnualManagementFee ?? 0
    );
    if (managementFee.gte(vault.managementFee)) {
      managementFee = null;
    }
    let minDepositAmount: BN | null = new BN(
      (config.minDepositUSDC ?? 0) * QUOTE_PRECISION.toNumber()
    );
    if (minDepositAmount.gte(vault.minDepositAmount)) {
      minDepositAmount = null;
    }
    let permissioned: boolean | null = config.permissioned ?? false;
    if (permissioned === vault.permissioned) {
      permissioned = null;
    }
    let redeemPeriod: BN | null = new BN(config.redeemPeriod ?? ONE_DAY);
    if (redeemPeriod.gte(vault.redeemPeriod)) {
      redeemPeriod = null;
    }
    let maxTokens: BN | null = new BN(
      (config.maxCapacityUSDC ?? 0) * QUOTE_PRECISION.toNumber()
    );
    if (maxTokens.gte(vault.maxTokens)) {
      maxTokens = null;
    }

    const params: UpdateVaultParams = {
      redeemPeriod,
      maxTokens,
      minDepositAmount,
      managementFee,
      profitShare,
      hurdleRate: null,
      permissioned,
      delegate: config.delegate ?? null,
    };
    const ix = await this.program.methods
      .updateVault(params)
      .accounts({
        vault: vaultKey,
        manager: this.key,
      })
      .instruction();
    return await this.sendTx(
      [ix],
      `Updated vault: ${decodeName(vault.name)}`,
      `Failed to update vault: ${decodeName(vault.name)}`
    );
  }

  async fetchMarketState(market: PublicKey): Promise<MarketState | undefined> {
    const acct = await this.conn.getAccountInfo(market);
    if (!acct) {
      return undefined;
    }
    const buffer: Buffer = acct.data;
    const marketData = deserializeMarketData(buffer);
    return new MarketState({
      address: market,
      data: marketData,
    });
  }

  marketBidAsk(marketState: MarketState): UiL2BidAsk {
    const ladder = marketState.getUiLadder(1, 0, 0);
    return {
      bid: {
        price: ladder.asks[0].price,
        size: ladder.asks[0].quantity
      },
      ask: {
        price: ladder.bids[0].price,
        size: ladder.bids[0].quantity
      }
    };
  }

  traderState(
    marketState: MarketState,
    trader: PublicKey
  ): UiTraderState {
    const traderState = marketState.data.traders.get(trader.toString());
    if (!traderState) {
      throw new Error(`Trader ${trader.toString()} not found`);
    }

    const quoteLotsFreeBigNum = traderState.quoteLotsFree;
    let quoteLotsFree: number;
    if (quoteLotsFreeBigNum instanceof BN) {
      quoteLotsFree = quoteLotsFreeBigNum.toNumber();
    } else {
      quoteLotsFree = quoteLotsFreeBigNum as number;
    }

    const quoteLotsLockedBigNum = traderState.quoteLotsLocked;
    let quoteLotsLocked: number;
    if (quoteLotsLockedBigNum instanceof BN) {
      quoteLotsLocked = quoteLotsLockedBigNum.toNumber();
    } else {
      quoteLotsLocked = quoteLotsLockedBigNum as number;
    }

    const baseLotsFreeBigNum = traderState.baseLotsFree;
    let baseLotsFree: number;
    if (baseLotsFreeBigNum instanceof BN) {
      baseLotsFree = baseLotsFreeBigNum.toNumber();
    } else {
      baseLotsFree = baseLotsFreeBigNum as number;
    }

    const baseLotsLockedBigNum = traderState.baseLotsLocked;
    let baseLotsLocked: number;
    if (baseLotsLockedBigNum instanceof BN) {
      baseLotsLocked = baseLotsLockedBigNum.toNumber();
    } else {
      baseLotsLocked = baseLotsLockedBigNum as number;
    }

    const quoteUnitsFree = marketState.quoteLotsToQuoteUnits(quoteLotsFree);
    const quoteUnitsLocked = marketState.quoteLotsToQuoteUnits(quoteLotsLocked);
    const baseUnitsFree = marketState.baseLotsToRawBaseUnits(baseLotsFree);
    const baseUnitsLocked = marketState.baseLotsToRawBaseUnits(baseLotsLocked);
    return {
      quoteUnitsFree,
      quoteUnitsLocked,
      baseUnitsFree,
      baseUnitsLocked,
    };
  }

  encodeLimitOrderPacketWithFreeFunds(
    packet: OrderPacket
  ): Buffer {
    const args: PlaceLimitOrderWithFreeFundsInstructionArgs = {
      orderPacket: packet,
    };
    const [buffer] = PlaceLimitOrderWithFreeFundsStruct.serialize({
      instructionDiscriminator:
      placeLimitOrderWithFreeFundsInstructionDiscriminator,
      ...args,
    });
    const order: Buffer = Buffer.from(buffer);
    return order;
  }

  async placeLimitOrderIx(params: {
    vaultKey: PublicKey;
    marketState: MarketState;
    price?: number;
    side: OrderSide;
  }): Promise<TransactionInstruction> {
    let price: number;
    if (!params.price) {
      if (params.side === OrderSide.BID) {
        // use ask price since bid is buying at that price
        price = this.marketBidAsk(params.marketState).ask.price;
      } else {
        // use bid price since ask is selling at that price
        price = this.marketBidAsk(params.marketState).bid.price;
      }
    } else {
      price = params.price;
    }
    const priceInTicks = this.phoenixClient.floatPriceToTicks(
      price,
      params.marketState.address.toString()
    );
    const traderState = this.traderState(params.marketState, params.vaultKey);

    let orderPacket: OrderPacket;
    if (params.side === OrderSide.BID) {
      // use quote asset to buy base asset
      const baseUnits = traderState.quoteUnitsFree / price;
      const numBaseLots = this.phoenixClient.rawBaseUnitsToBaseLotsRoundedDown(
        baseUnits,
        params.marketState.address.toBase58()
      );
      orderPacket = getLimitOrderPacket({
        side: Side.Bid,
        priceInTicks,
        numBaseLots,
        useOnlyDepositedFunds: true,
      });
    } else {
      // sell base asset into quote asset
      const baseUnits = traderState.baseUnitsFree;
      const numBaseLots = this.phoenixClient.rawBaseUnitsToBaseLotsRoundedDown(
        baseUnits,
        params.marketState.address.toBase58()
      );
      orderPacket = getLimitOrderPacket({
        side: Side.Bid,
        priceInTicks,
        numBaseLots,
        useOnlyDepositedFunds: true,
      });
    }

    const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
      params.marketState.data.header.baseParams.mintKey,
      params.vaultKey,
      true
    );
    const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
      params.marketState.data.header.quoteParams.mintKey,
      params.vaultKey,
      true
    );
    const marketBaseTokenAccount = this.phoenixClient.getBaseVaultKey(
      params.marketState.address.toString()
    );
    const marketQuoteTokenAccount = this.phoenixClient.getQuoteVaultKey(
      params.marketState.address.toString()
    );

    const order = this.encodeLimitOrderPacketWithFreeFunds(orderPacket);
    return await this.program.methods
      .placeLimitOrder({
        order,
      })
      .accounts({
        vault: params.vaultKey,
        delegate: this.key,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority: getLogAuthority(),
        market: params.marketState.address,
        seat: getSeatAddress(params.marketState.address, params.vaultKey),
        baseMint: params.marketState.data.header.baseParams.mintKey,
        quoteMint: params.marketState.data.header.quoteParams.mintKey,
        vaultBaseTokenAccount,
        vaultQuoteTokenAccount,
        marketBaseTokenAccount,
        marketQuoteTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(this.marketAccountMetas)
      .instruction();
  }

  /*
   * If no price is given, it buys at the best ask price to try and fill immediately.
   */
  async placeLimitOrder(params: {
    vaultKey: PublicKey;
    marketState: MarketState;
    price?: number;
    side: OrderSide;
  }): Promise<SnackInfo> {
    const ix = await this.placeLimitOrderIx(params);
    return await this.sendTx(
      [ix],
      `Placed order on ${params.marketState.address.toString()}`,
      `Failed to place order on ${params.marketState.address.toString()}`
    );
  }

  openOrders(vaultKey: PublicKey, marketState: MarketState): {
    side: OrderSide;
    orderSequenceNumber: BN;
    priceInTicks: BN;
    baseLots: BN;
  }[] {
    const traderState = marketState.data.traders.get(vaultKey.toString());
    if (!traderState) {
      throw Error(`TraderState not found for fund ${vaultKey.toString()}`);
    }
    const traderIndex = marketState.data.traderPubkeyToTraderIndex.get(vaultKey.toString());
    const orders = [];

    for (const [orderId, order] of marketState.data.bids) {
      if (toNum(order.traderIndex) === traderIndex) {
        let orderSequenceNumber: BN;
        if (orderId.orderSequenceNumber instanceof BN) {
          orderSequenceNumber = orderId.orderSequenceNumber;
        } else {
          orderSequenceNumber = new BN(orderId.orderSequenceNumber as number);
        }

        let priceInTicks: BN;
        if (orderId.priceInTicks instanceof BN) {
          priceInTicks = orderId.priceInTicks;
        } else {
          priceInTicks = new BN(orderId.priceInTicks as number);
        }

        let baseLots: BN;
        if (order.numBaseLots instanceof BN) {
          baseLots = order.numBaseLots;
        } else {
          baseLots = new BN(order.numBaseLots as number);
        }

        const bid = {
          side: OrderSide.BID,
          orderSequenceNumber,
          priceInTicks,
          baseLots,
        };
        orders.push(bid);
      }
    }

    for (const [orderId, order] of marketState.data.asks) {
      if (toNum(order.traderIndex) === traderIndex) {
        let orderSequenceNumber: BN;
        if (orderId.orderSequenceNumber instanceof BN) {
          orderSequenceNumber = orderId.orderSequenceNumber;
        } else {
          orderSequenceNumber = new BN(orderId.orderSequenceNumber as number);
        }

        let priceInTicks: BN;
        if (orderId.priceInTicks instanceof BN) {
          priceInTicks = orderId.priceInTicks;
        } else {
          priceInTicks = new BN(orderId.priceInTicks as number);
        }

        let baseLots: BN;
        if (order.numBaseLots instanceof BN) {
          baseLots = order.numBaseLots;
        } else {
          baseLots = new BN(order.numBaseLots as number);
        }

        const ask = {
          side: OrderSide.ASK,
          orderSequenceNumber,
          priceInTicks,
          baseLots,
        };
        orders.push(ask);
      }
    }
    return orders;
  }

  async cancelOrdersIx(
    vaultKey: PublicKey,
    marketState: MarketState,
    ordersToCancel?: CancelOrderParams[]
  ): Promise<TransactionInstruction> {
    let orders: CancelOrderParams[];
    if (!ordersToCancel) {
      orders = this.openOrders(vaultKey, marketState).map((o) => {
        return {
          side: o.side,
          priceInTicks: o.priceInTicks,
          orderSequenceNumber: o.orderSequenceNumber,
        };
      });
    } else {
      orders = ordersToCancel;
    }
    const params: CancelMultipleOrdersParams = {
      orders,
    };
    return await this.program.methods
      // @ts-ignore
      .cancelMultipleOrdersById(params)
      .accounts({
        vault: vaultKey,
        delegate: this.key,
        phoenix: PHOENIX_PROGRAM_ID,
        logAuthority: getLogAuthority(),
        market: marketState.address,
      })
      .remainingAccounts(this.marketAccountMetas)
      .instruction();
  }

  /*
   * By default this cancels every open order.
   * If you want to specify specific orders, then provide the `ordersToCancel` parameter
   */
  async cancelOrders(
    vaultKey: PublicKey,
    marketState: MarketState,
    ordersToCancel?: CancelOrderParams[]
  ): Promise<SnackInfo> {
    const ix = await this.cancelOrdersIx(vaultKey, marketState, ordersToCancel);
    return await this.sendTx(
      [ix],
      'Cancelled open orders',
      'Failed to cancel open orders',
    );
  }
}
