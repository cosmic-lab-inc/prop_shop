import {ConfirmOptions, Connection, PublicKey} from '@solana/web3.js';
import {makeAutoObservable} from 'mobx';
import * as anchor from '@coral-xyz/anchor';
import {BN, Program} from '@coral-xyz/anchor';
import {calculateRealizedInvestorEquity, getTokenBalance, getTraderEquity, walletAdapterToAnchorWallet,} from './utils';
import {
  Data,
  FundOverview,
  PhoenixSubscriber,
  PhoenixVaultsAccountEvents,
  SnackInfo,
  WithdrawRequestTimer,
} from './types';
import {EventEmitter} from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import {WalletContextState} from '@solana/wallet-adapter-react';
import {PhoenixWebsocketSubscriber} from './phoenixWebsocketSubscriber';
import {Client as PhoenixClient} from '@ellipsis-labs/phoenix-sdk';
import {
  getInvestorAddressSync,
  IDL as PHOENIX_VAULTS_IDL,
  Investor,
  LOCALNET_MARKET_CONFIG,
  PHOENIX_VAULTS_PROGRAM_ID,
  PhoenixVaults,
  Vault,
} from '@cosmic-lab/phoenix-vaults-sdk';
import {decodeName, QUOTE_PRECISION} from '@drift-labs/sdk';
import {err, ok, Result} from "neverthrow";

export class PhoenixVaultsClient {
  private readonly conn: Connection;
  private wallet: WalletContextState;
  _phoenixClient: PhoenixClient | undefined;
  _program: Program<PhoenixVaults> | undefined;

  loading = false;
  private readonly disableCache: boolean = false;
  private readonly skipFetching: boolean = false;
  dummyWallet = false;

  private eventEmitter: StrictEventEmitter<
    EventEmitter,
    PhoenixVaultsAccountEvents
  > = new EventEmitter();
  private _cache: PhoenixSubscriber | undefined = undefined;

  private _vaults: Map<string, Vault> = new Map();
  private _investors: Map<string, Investor> = new Map();
  private _timers: Map<string, WithdrawRequestTimer> = new Map();
  private _equities: Map<string, number> = new Map();
  private _fundOverviews: Map<string, FundOverview> = new Map();

  constructor(config: {
    wallet: WalletContextState;
    connection: Connection;
    disableCache?: boolean;
    skipFetching?: boolean;
    dummyWallet?: boolean;
  }) {
    makeAutoObservable(this);
    this.wallet = config.wallet;
    this.conn = config.connection;
    this.disableCache = config.disableCache ?? false;
    this.skipFetching = config.skipFetching ?? false;
    this.dummyWallet = config.dummyWallet ?? false;
  }

  //
  // Initialization and getters
  //

  /**
   * Initialize the client.
   * Call this upon connecting a wallet.
   */
  public async initialize(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not connected during initialization');
    }
    const now = Date.now();
    this.loading = true;

    const provider = new anchor.AnchorProvider(
      this.conn,
      walletAdapterToAnchorWallet(this.wallet),
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
      console.log(`loaded localnet Phoenix markets in ${Date.now() - now}ms`);
    } else {
      const now = Date.now();
      this._phoenixClient = await PhoenixClient.create(this.conn);
      console.log(`loaded Phoenix markets in ${Date.now() - now}ms`);
    }

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
          // todo: fetchFundOverview
          // await this.fetchFundOverview(payload.key);
        }
      }
    );

    if (!this.disableCache) {
      const preSub = Date.now();
      await this.loadCache(this._program);
      console.log(`cache loaded in ${Date.now() - preSub}ms`);
    }

    console.log(`initialized PhoenixVaultsClient in ${Date.now() - now}ms`);
    this.loading = false;
  }

  async loadCache(program: Program<PhoenixVaults>) {
    if (this.disableCache) {
      return;
    }
    this._cache = new PhoenixWebsocketSubscriber(
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

  public async updateWallet(config: {
    wallet: WalletContextState;
    dummyWallet?: boolean;
  }) {
    const now = Date.now();
    this.dummyWallet = config.dummyWallet ?? false;
    this.wallet = config.wallet;
    console.log(`updated wallet in ${Date.now() - now}ms`);
  }

  public get phoenixClient(): PhoenixClient {
    if (!this._phoenixClient) {
      throw new Error('PhoenixVaultsClient not initialized');
    }
    return this._phoenixClient;
  }

  public get program(): Program<PhoenixVaults> {
    if (!this._program) {
      throw new Error('PhoenixVaultsClient not initialized');
    }
    return this._program;
  }

  get publicKey(): PublicKey {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    return this.wallet.publicKey;
  }

  public async isProtocol(
    vault: PublicKey
  ): Promise<Result<boolean, SnackInfo>> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found`,
      });
    }
    if (vaultAcct.protocol.equals(this.publicKey)) {
      return ok(true);
    } else {
      return ok(false);
    }
  }

  public isManager(vault: PublicKey): Result<boolean, SnackInfo> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found`,
      });
    }
    // check if wallet is manager
    if (vaultAcct.manager.equals(this.publicKey)) {
      return ok(true);
    }
    return ok(false);
  }

  //
  // State and cache
  //

  public vault(
    key: PublicKey,
    errorIfMissing = true
  ): Data<PublicKey, Vault> | undefined {
    const data = this._vaults.get(key.toString());
    if (!data) {
      if (errorIfMissing) {
        throw new Error('Vault not subscribed');
      } else {
        return undefined;
      }
    } else {
      return {
        key,
        data,
      };
    }
  }

  public managedVaults(): Data<PublicKey, Vault>[] {
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults = this.vaults();
    return vaults.filter((v) => {
      return v.data.manager === this.publicKey;
    });
  }

  public investedVaults(): PublicKey[] {
    const vds = this.investors(true);
    return vds.map((vd) => vd.data.vault);
  }

  public async fetchVault(key: PublicKey): Promise<Vault | undefined> {
    try {
      // @ts-ignore ... Vault type omits padding fields, but this is safe.
      const vault: Vault = await this.vaultProgram.account.vault.fetch(key);
      return vault;
    } catch (e: any) {
      return undefined;
    }
  }

  public async fetchInvestor(
    key: PublicKey
  ): Promise<Investor | undefined> {
    try {
      const vd: Investor =
        await this.program.account.investor.fetch(key);
      return vd;
    } catch (e: any) {
      return undefined;
    }
  }

  public vaults(filters?: {
    managed?: boolean;
    invested?: boolean;
  }): Data<PublicKey, Vault>[] {
    const vaults = Array.from(this._vaults.entries())
      .filter(([_key, value]) => {
        const managedFilter = filters?.managed
          ? value.manager.equals(this.publicKey)
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

  public investor(
    key: PublicKey,
    errorIfMissing = true
  ): Data<PublicKey, Investor> | undefined {
    const data = this._investors.get(key.toString());
    if (!data) {
      if (errorIfMissing) {
        throw new Error('Investor not subscribed');
      } else {
        return undefined;
      }
    } else {
      return {
        key,
        data,
      };
    }
  }

  public investors(filterByAuthority?: boolean): Data<PublicKey, Investor>[] {
    if (!this._cache) {
      throw new Error('Cache not initialized');
    }
    // account subscriber fetches upon subscription, so these should never be undefined
    const vds = Array.from(this._investors.entries())
      .filter(([_key, data]) => {
        if (filterByAuthority) {
          return data.authority.equals(this.publicKey);
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
    return vds;
  }

  //
  // Fetch and aggregate data
  //

  private async fetchVaultEquity(vault: Vault): Promise<number> {
    await this.phoenixClient.refreshAllMarkets(false);
    let equity = 0;
    const vaultUsdc = await getTokenBalance(this.conn, vault.usdcTokenAccount);
    equity += vaultUsdc;
    for (const marketState of Array.from(
      this.phoenixClient.marketStates.values()
    )) {
      equity += getTraderEquity(marketState, vault.pubkey);
    }
    return equity;
  }

  private async fetchInvestorEquity(
    investor: Investor,
    vault: Vault
  ): Promise<number> {
    const vaultEquity = await this.fetchVaultEquity(vault);
    const vaultEquityBN = new BN(vaultEquity * QUOTE_PRECISION.toNumber());
    const investorEquityBN = calculateRealizedInvestorEquity(
      investor,
      vaultEquityBN,
      vault
    );
    return investorEquityBN.toNumber() / QUOTE_PRECISION.toNumber();
  }

  private setFundOverview(key: PublicKey, fo: FundOverview) {
    this._fundOverviews.set(key.toString(), fo);
  }

  public async fetchFundOverview(
    vaultKey: PublicKey
  ): Promise<FundOverview | undefined> {
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return undefined;
    }
    const vaultInvestors = new Map<string, Data<PublicKey, Investor>[]>();
    for (const investor of this.investors()) {
      const key = investor.data.vault.toString();
      const value = vaultInvestors.get(key) ?? [];
      vaultInvestors.set(key, [...value, investor]);
    }

    const investors = vaultInvestors.get(vault.pubkey.toString()) ?? [];
    const title = decodeName(vault.name);

    const tvl = await this.fetchVaultEquity(vault);
    const netDeposits =
      vault.totalDeposits.sub(vault.totalWithdraws).toNumber() /
      QUOTE_PRECISION.toNumber();

    const birth = new Date(Number(vault.initTs.toNumber() * 1000));
    const fo: FundOverview = {
      vault: vault.pubkey,
      lifetimePNL: tvl - netDeposits,
      tvl,
      birth,
      title,
      investors: investors.length,
    };
    this.setFundOverview(vault.pubkey, fo);
    return fo;
  }

  public async fetchFundOverviews(): Promise<FundOverview[]> {
    const vaultInvestors = new Map<string, Data<PublicKey, Investor>[]>();
    for (const investor of this.investors()) {
      const key = investor.data.vault.toString();
      const value = vaultInvestors.get(key) ?? [];
      vaultInvestors.set(key, [...value, investor]);
    }
    const fundOverviews: FundOverview[] = [];
    for (const vault of this.vaults()) {
      const investors = vaultInvestors.get(vault.data.pubkey.toString()) ?? [];
      const title = decodeName(vault.data.name);

      const tvl = await this.fetchVaultEquity(vault.data);
      const netDeposits =
        vault.data.totalDeposits.sub(vault.data.totalWithdraws).toNumber() /
        QUOTE_PRECISION.toNumber();

      const birth = new Date(Number(vault.data.initTs.toNumber() * 1000));
      const fo: FundOverview = {
        vault: vault.data.pubkey,
        lifetimePNL: tvl - netDeposits,
        tvl,
        birth,
        title,
        investors: investors.length,
      };
      fundOverviews.push(fo);
      this.setFundOverview(vault.key, fo);
    }
    return fundOverviews;
  }

  //
  // Withdraw timers
  //

  public withdrawTimer(vault: PublicKey): WithdrawRequestTimer | undefined {
    return this._timers.get(vault.toString());
  }

  private async createInvestorWithdrawTimer(
    vault: PublicKey
  ): Promise<void> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }
    const investorKey = getInvestorAddressSync(
      vault,
      this.publicKey
    );

    // force fetch of vault and vaultDepositor accounts in case websocket is slow to update
    await this.fetchVault(vault);
    await this.fetchInvestor(investorKey);

    const investorAcct = this.investor(investorKey, false)?.data;
    if (!investorAcct) {
      this.removeWithdrawTimer(vault);
      return;
    }
    const reqTs = investorAcct.lastWithdrawRequest.ts.toNumber();

    if (investorAcct.lastWithdrawRequest.value.toNumber() === 0 || reqTs === 0) {
      this.removeWithdrawTimer(vault);
      return;
    }

    const equity =
      investorAcct.lastWithdrawRequest.value.toNumber() / QUOTE_PRECISION.toNumber();

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

    const vaultAcct = this.vault(vault)!.data;

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

    const vaultAcct = this.vault(vault)!.data;

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

  public async createWithdrawTimer(vault: PublicKey): Promise<void> {
    await this.createManagerWithdrawTimer(vault);
    await this.createProtocolWithdrawTimer(vault);
    await this.createInvestorWithdrawTimer(vault);
  }

  private removeWithdrawTimer(vault: PublicKey) {
    const result = this._timers.get(vault.toString());
    if (result) {
      clearInterval(result.timer);
    }
    this._timers.delete(vault.toString());
  }
}
