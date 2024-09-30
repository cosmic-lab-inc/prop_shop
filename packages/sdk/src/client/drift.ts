import {
	AccountMeta,
	Connection,
	GetProgramAccountsFilter,
	PublicKey,
	SystemProgram,
	SYSVAR_RENT_PUBKEY,
	TransactionError,
	TransactionInstruction,
} from '@solana/web3.js';
import {makeAutoObservable} from 'mobx';
import * as anchor from '@coral-xyz/anchor';
import {AnchorProvider, BN, Program, ProgramAccount} from '@coral-xyz/anchor';
import {
	decodeName,
	DriftClient,
	DriftClientConfig,
	encodeName,
	getUserAccountPublicKey,
	getUserAccountPublicKeySync,
	getUserStatsAccountPublicKey,
	QUOTE_PRECISION,
	SpotMarketAccount,
	TEN,
	unstakeSharesToAmount as depositSharesToVaultAmount,
} from '@drift-labs/sdk';
import {
	DRIFT_VAULTS_PROGRAM_ID,
	ONE_DAY,
	PROP_SHOP_PERCENT_ANNUAL_FEE,
	PROP_SHOP_PERCENT_PROFIT_SHARE,
	PROP_SHOP_PROTOCOL,
} from '../constants';
import {getAssociatedTokenAddress} from '../programs';
import {
	fundDollarPnl,
	percentPrecisionToPercent,
	percentToPercentPrecision,
	walletAdapterToAnchorWallet,
	walletAdapterToIWallet,
} from '../utils';
import {confirmTransactions, sendTransactionWithResult, signatureLink,} from '../rpc';
import {
	CreateVaultConfig,
	Data,
	DriftSubscriber,
	DriftVaultsAccountEvents,
	FundOverview,
	SnackInfo,
	UpdateVaultConfig,
	Venue,
	WithdrawRequestTimer,
} from '../types';
import {
	DriftVaults,
	getTokenVaultAddressSync,
	getVaultAddressSync,
	getVaultDepositorAddressSync,
	IDL as DRIFT_VAULTS_IDL,
	UpdateVaultParams,
	Vault,
	VaultClient,
	VaultDepositor,
	VaultParams,
	VaultProtocol,
	VaultProtocolParams,
	VaultWithProtocolParams,
	WithdrawUnit,
} from '@drift-labs/vaults-sdk';
import {EventEmitter} from 'events';
import bs58 from 'bs58';
import StrictEventEmitter from 'strict-event-emitter-types';
import {WalletContextState} from '@solana/wallet-adapter-react';
import {
	createAssociatedTokenAccountInstruction,
	getAssociatedTokenAddressSync,
	TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {err, ok, Result} from 'neverthrow';
import {InstructionReturn, walletAdapterToAsyncSigner,} from '@cosmic-lab/data-source';
import {DriftWebsocketSubscriber} from '../subscriber';
import {CreatePropShopClientConfig, UpdateWalletConfig} from './types';

export class DriftVaultsClient {
  private readonly connection: Connection;
  private wallet: WalletContextState;
  _vaultClient: VaultClient | undefined;

  loading = false;
  private readonly disableCache: boolean = false;
  dummyWallet = false;

  private eventEmitter: StrictEventEmitter<
    EventEmitter,
    DriftVaultsAccountEvents
  > = new EventEmitter();
  private _cache: DriftSubscriber | undefined = undefined;

  private _vaults: Map<string, Vault> = new Map();
  private _vaultDepositors: Map<string, VaultDepositor> = new Map();
  private _timers: Map<string, WithdrawRequestTimer> = new Map();
  // Equity in each vault for the connected wallet
  private _equities: Map<string, number> = new Map();
  private _fundOverviews: Map<string, FundOverview> = new Map();

  constructor(config: CreatePropShopClientConfig) {
    makeAutoObservable(this);
    this.wallet = config.wallet;
    this.connection = config.connection;
    this.disableCache = config.disableCache ?? false;
    this.dummyWallet = config.dummyWallet ?? false;
  }

  //
  // Initialization and setup
  //

  /**
   * Initialize the VaultClient.
   * Call this upon connecting a wallet.
   */
  public async initialize(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not connected during initialization');
    }
    const now = Date.now();
    this.loading = true;
    const config: Omit<DriftClientConfig, 'wallet'> = {
      connection: this.connection,
      accountSubscription: {
        type: 'websocket',
        resubTimeoutMs: 30_000,
      },
      opts: {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
      },
      activeSubAccountId: 0,
      // if dummy wallet, we don't care about the user accounts
      skipLoadUsers: this.dummyWallet,
    };

    const {connection, accountSubscription, opts, activeSubAccountId} =
      config;
    const iWallet = walletAdapterToIWallet(this.wallet);
    const anchorWallet = walletAdapterToAnchorWallet(this.wallet);

    const provider = new anchor.AnchorProvider(
      connection,
      anchorWallet,
      opts ?? {
        commitment: 'confirmed',
      }
    );
    const driftVaultsProgram = new anchor.Program(
      DRIFT_VAULTS_IDL,
      DRIFT_VAULTS_PROGRAM_ID,
      provider
    );

    const driftClient = new DriftClient({
      connection,
      wallet: iWallet,
      opts: {
        commitment: 'confirmed',
      },
      activeSubAccountId,
      accountSubscription,
    });
    const preDriftSub = Date.now();
    await driftClient.subscribe();
    console.log(`DriftClient subscribed in ${Date.now() - preDriftSub}ms`);

    this._vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
      cliMode: true,
    });

    this.eventEmitter.on(
      'vaultDepositorUpdate',
      (payload: Data<PublicKey, VaultDepositor>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._vaultDepositors.get(payload.key.toString())
        );
        if (update !== existing) {
          this._vaultDepositors.set(payload.key.toString(), payload.data);
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
      await this.loadCache(driftVaultsProgram);
      console.log(`DriftVaults cache loaded in ${Date.now() - preSub}ms`);
    }

    console.log(`initialized DriftVaultsClient in ${Date.now() - now}ms`);
    this.loading = false;
  }

  async loadCache(program: anchor.Program<DriftVaults>) {
    if (this.disableCache) {
      return;
    }
    this._cache = new DriftWebsocketSubscriber(
      program,
      {
        filters: [
          {
            accountName: 'vaultDepositor',
            eventType: 'vaultDepositorUpdate',
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

  public async updateWallet(config: UpdateWalletConfig) {
    this.dummyWallet = config.dummyWallet ?? false;
    this.wallet = config.wallet;

    // update VaultClient wallet
    const anchorWallet = walletAdapterToAnchorWallet(this.wallet);
    const newProvider = new AnchorProvider(this.connection, anchorWallet, {
      commitment: 'confirmed',
    });
    this.vaultClient.program = new Program(
      DRIFT_VAULTS_IDL,
      this.vaultProgram.programId,
      newProvider
    );

    // update DriftClient wallet
    const iWallet = walletAdapterToIWallet(this.wallet);
    await this.driftClient.updateWallet(iWallet, undefined, 0);
  }

  async shutdown(): Promise<void> {
    await this._cache?.unsubscribe();
  }

  private async driftClientSubscribe(driftClient: DriftClient) {
    const preUserSub = Date.now();
    const subUsers = await driftClient.addAndSubscribeToUsers();
    // 1.2s
    console.log(
      `DriftClient subscribed to users in ${Date.now() - preUserSub}ms`
    );

    const preAcctSub = Date.now();
    const subAcctSub = await driftClient.accountSubscriber.subscribe();
    console.log(
      `DriftClient subscribed to accounts in ${Date.now() - preAcctSub}ms`
    );

    let subUserStats = false;
    if (driftClient.userStats !== undefined) {
      const preStatsSub = Date.now();
      subUserStats = await driftClient.userStats.subscribe();
      console.log(
        `DriftClient subscribed to user stats in ${Date.now() - preStatsSub}ms`
      );
    }
    driftClient.isSubscribed = subUsers && subAcctSub && subUserStats;
  }

  get publicKey(): PublicKey {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    return this.wallet.publicKey;
  }

  getVaultDepositorAddress(vault: PublicKey): PublicKey {
    return getVaultDepositorAddressSync(
      this.vaultProgram.programId,
      vault,
      this.publicKey
    );
  }

  private async checkIfAccountExists(account: PublicKey): Promise<boolean> {
    try {
      const accountInfo = await this.connection.getAccountInfo(account);
      return accountInfo != null;
    } catch (e) {
      return false;
    }
  }

  private async initUserIxs(
    subAccountId = 0
  ): Promise<TransactionInstruction[]> {
    const ixs = [];
    const userKey = getUserAccountPublicKeySync(
      this.driftProgram.programId,
      this.publicKey,
      subAccountId
    );

    if (subAccountId === 0) {
      if (
        !(await this.checkIfAccountExists(
          this.driftClient.getUserStatsAccountPublicKey()
        ))
      ) {
        ixs.push(await this.driftClient.getInitializeUserStatsIx());
      }
    }

    if (!(await this.checkIfAccountExists(userKey))) {
      const [_, ix] =
        await this.driftClient.getInitializeUserInstructions(subAccountId);
      ixs.push(ix);
    }
    return ixs;
  }

  /**
   * Initialize the User for the connected wallet,
   * and optionally deposit USDC as collateral.
   * Call this before joining or depositing to a vault.
   */
  public async initUser(subAccountId = 0): Promise<void> {
    const ixs = [];
    const userKey = getUserAccountPublicKeySync(
      this.driftProgram.programId,
      this.publicKey,
      subAccountId
    );

    if (subAccountId === 0) {
      if (
        !(await this.checkIfAccountExists(
          this.driftClient.getUserStatsAccountPublicKey()
        ))
      ) {
        ixs.push(await this.driftClient.getInitializeUserStatsIx());
      }
    }

    if (!(await this.checkIfAccountExists(userKey))) {
      const [_, ix] =
        await this.driftClient.getInitializeUserInstructions(subAccountId);
      ixs.push(ix);
    }
    const sig = await this.sendTx(ixs);
    if (sig.isErr()) {
      throw new Error('Failed to initialize user');
    }
    console.debug('init user:', signatureLink(sig.value));
  }

  /**
   * Uses the active subAccountId and connected wallet as the authority.
   */
  public userInitialized(): boolean {
    const user = this.driftClient.getUserAccount();
    return !!user;
  }

  //
  // Account cache and fetching
  //

  async spotMarketByIndex(
    driftProgram: anchor.Program,
    index: number
  ): Promise<ProgramAccount<SpotMarketAccount>> {
    const filters: GetProgramAccountsFilter[] = [
      {
        memcmp: {
          // offset of "market_index" field in "SpotMarket" account
          offset: 684,
          bytes: bs58.encode(Uint8Array.from([index])),
        },
      },
    ];
    // @ts-ignore
    const res: ProgramAccount<SpotMarketAccount>[] =
      await driftProgram.account.spotMarket.all(filters);
    if (res.length > 0) {
      return res[0];
    } else {
      throw new Error(`Spot market not found for index ${index}`);
    }
  }

  public vault(key: PublicKey): Data<PublicKey, Vault> | undefined {
    const data = this._vaults.get(key.toString());
    if (!data) {
      return undefined;
    } else {
      return {
        key,
        data,
      };
    }
  }

  public vaults(filters?: {
    hasProtocol?: boolean;
    managed?: boolean;
    invested?: boolean;
  }): Data<PublicKey, Vault>[] {
    const vaults = Array.from(this._vaults.entries())
      .filter(([_key, value]) => {
        const protocolFilter = filters?.hasProtocol
          ? value.vaultProtocol
          : true;
        const managedFilter = filters?.managed
          ? value.manager.equals(this.publicKey)
          : true;
        const investedFilter = filters?.invested
          ? this.investedVaults()
            .map((k) => k.toString())
            .includes(value.pubkey.toString())
          : true;
        return protocolFilter && managedFilter && investedFilter;
      })
      .map(([key, data]) => {
        return {
          key: new PublicKey(key),
          data,
        };
      }) as Data<PublicKey, Vault>[];
    return vaults;
  }

  public vaultDepositor(
    key: PublicKey,
    errorIfMissing = true
  ): Data<PublicKey, VaultDepositor> | undefined {
    const data = this._vaultDepositors.get(key.toString());
    if (!data) {
      if (errorIfMissing) {
        throw new Error('VaultDepositor not subscribed');
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

  public vaultDepositors(
    filterByAuthority?: boolean
  ): Data<PublicKey, VaultDepositor>[] {
    if (!this._cache) {
      throw new Error('Cache not initialized');
    }
    // account subscriber fetches upon subscription, so these should never be undefined
    const vds = Array.from(this._vaultDepositors.entries())
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
      }) as Data<PublicKey, VaultDepositor>[];
    return vds;
  }

  public get fundOverviews(): FundOverview[] {
    const values = Array.from(this._fundOverviews.values());
    values.sort((a, b) => {
      const _a = fundDollarPnl(a);
      const _b = fundDollarPnl(b);
      return _b - _a;
    });
    return values;
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

  public async fetchVaults(
    protocolsOnly?: boolean
  ): Promise<ProgramAccount<Vault>[]> {
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const preFetch = Date.now();
    const vaults: ProgramAccount<Vault>[] =
      await this.vaultProgram.account.vault.all();
    console.log(
      `fetched ${vaults.length} vaults from RPC in ${Date.now() - preFetch}ms`
    );
    if (protocolsOnly) {
      return vaults.filter((v) => {
        return v.account.vaultProtocol;
      });
    } else {
      return vaults;
    }
  }

  /**
   * VaultDepositors the connected wallet is the authority of.
   */
  public async fetchVaultDepositor(
    key: PublicKey
  ): Promise<VaultDepositor | undefined> {
    try {
      const vd: VaultDepositor =
        await this.vaultProgram.account.vaultDepositor.fetch(key);
      return vd;
    } catch (e: any) {
      return undefined;
    }
  }

  /**
   * VaultDepositors the connected wallet is the authority of.
   */
  public async fetchVaultDepositors(
    filterByAuthority?: boolean
  ): Promise<ProgramAccount<VaultDepositor>[]> {
    let filters: GetProgramAccountsFilter[] | undefined = undefined;
    if (filterByAuthority) {
      filters = [
        {
          memcmp: {
            // "authority" field offset
            offset: 64,
            // this wallet must be the authority of the VaultDepositor to be the investor
            bytes: this.publicKey.toBase58(),
          },
        },
      ];
    }
    const preFetch = Date.now();
    const vds: ProgramAccount<VaultDepositor>[] =
      await this.vaultProgram.account.vaultDepositor.all(filters);
    console.log(
      `fetched ${vds.length} vds from RPC in ${Date.now() - preFetch}ms`
    );
    return vds;
  }

  //
  // Read only methods to aggregate data
  //

  private setFundOverview(key: PublicKey, fo: FundOverview) {
    this._fundOverviews.set(key.toString(), fo);
  }

  public async fetchFundOverview(vaultKey: PublicKey): Promise<FundOverview> {
    const vault = this.vault(vaultKey);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultKey.toString()}`);
    }
    const vds = this.vaultDepositors();
    // get count of vds per vault
    const vaultVds = new Map<string, Map<string, number>>();
    for (const investor of vds) {
      const vaultKey = investor.data.vault.toString();
      const investors = vaultVds.get(vaultKey) ?? new Map();
      const totalProfit =
        investor.data.cumulativeProfitShareAmount.toNumber() /
        QUOTE_PRECISION.toNumber();
      investors.set(investor.key.toString(), totalProfit);
      vaultVds.set(vaultKey, investors);
    }

    const investors = vaultVds.get(vault.data.pubkey.toString()) ?? new Map();
    const investorProfit = (Array.from(investors.values()) as number[]).reduce(
      (a: number, b: number) => a + b,
      0
    );
    const managerProfit =
      vault.data.managerTotalProfitShare.toNumber() /
      QUOTE_PRECISION.toNumber();
    let protocolProfit = 0;
    if (vault.data.vaultProtocol) {
      const vpKey = this.vaultClient.getVaultProtocolAddress(vault.data.pubkey);
      const vpAcct = await this.vaultProgram.account.vaultProtocol.fetch(vpKey);
      protocolProfit =
        vpAcct.protocolTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();
    }

    const tvl =
      (
        await this.vaultClient.calculateVaultEquity({
          vault: vault.data,
          factorUnrealizedPNL: false,
        })
      ).toNumber() / QUOTE_PRECISION.toNumber();

    const fo: FundOverview = {
      vault: vault.data.pubkey,
      manager: vault.data.manager,
      venue: Venue.Drift,
      investorProfit,
      managerProfit,
      protocolProfit,
      profit: investorProfit,
      profitAfterFees: investorProfit - managerProfit - protocolProfit,
      tvl,
      birth: new Date(Number(vault.data.initTs.toNumber() * 1000)),
      title: decodeName(vault.data.name),
      investors,
    };
    this.setFundOverview(vault.key, fo);
    return fo;
  }

  public async fetchFundOverviews(
    protocolsOnly?: boolean
  ): Promise<FundOverview[]> {
    const vaults = this.vaults({
      hasProtocol: protocolsOnly,
    });
    const vds = this.vaultDepositors();
    // get count of vds per vault
    const vaultVds = new Map<string, Map<string, number>>();
    for (const investor of vds) {
      const vaultKey = investor.data.vault.toString();
      const investors = vaultVds.get(vaultKey) ?? new Map();
      const totalProfit =
        investor.data.cumulativeProfitShareAmount.toNumber() /
        QUOTE_PRECISION.toNumber();
      investors.set(investor.key.toString(), totalProfit);
      vaultVds.set(vaultKey, investors);
    }

    const fundOverviews: FundOverview[] = [];
    for (const vault of vaults) {
      const investors = vaultVds.get(vault.data.pubkey.toString()) ?? new Map();
      const investorProfit = (
        Array.from(investors.values()) as number[]
      ).reduce((a: number, b: number) => a + b, 0);
      const managerProfit =
        vault.data.managerTotalProfitShare.toNumber() /
        QUOTE_PRECISION.toNumber();
      let protocolProfit = 0;
      if (vault.data.vaultProtocol) {
        const vpKey = this.vaultClient.getVaultProtocolAddress(
          vault.data.pubkey
        );
        const vpAcct =
          await this.vaultProgram.account.vaultProtocol.fetch(vpKey);
        protocolProfit =
          vpAcct.protocolTotalProfitShare.toNumber() /
          QUOTE_PRECISION.toNumber();
      }

      const tvl =
        (
          await this.vaultClient.calculateVaultEquity({
            vault: vault.data,
            factorUnrealizedPNL: false,
          })
        ).toNumber() / QUOTE_PRECISION.toNumber();

      const fo: FundOverview = {
        vault: vault.data.pubkey,
        manager: vault.data.manager,
        venue: Venue.Drift,
        investorProfit,
        managerProfit,
        protocolProfit,
        profit: investorProfit,
        profitAfterFees: investorProfit - managerProfit - protocolProfit,
        tvl,
        birth: new Date(Number(vault.data.initTs.toNumber() * 1000)),
        title: decodeName(vault.data.name),
        investors,
      };
      fundOverviews.push(fo);
      this.setFundOverview(vault.key, fo);
    }
    return fundOverviews;
  }

  /**
   * Vaults the connected wallet manages.
   */
  public managedVaults(protocolsOnly?: boolean): Data<PublicKey, Vault>[] {
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults = this.vaults({
      hasProtocol: protocolsOnly,
    });
    return vaults.filter((v) => {
      return v.data.manager === this.publicKey;
    });
  }

  /**
   * Vaults the connected wallet is invested in.
   */
  public investedVaults(): PublicKey[] {
    const vds = this.vaultDepositors(true);
    return vds.map((vd) => vd.data.vault);
  }

  /**
   * Aggregate total value locked across all vaults denominated in USDC.
   */
  public async aggregateTVL(
    vaults?: Data<PublicKey, Vault>[],
    vaultDepositors?: Data<PublicKey, VaultDepositor>[]
  ): Promise<number> {
    let _vaults: Data<PublicKey, Vault>[];
    if (vaults) {
      _vaults = vaults;
    } else {
      if (!this._cache) {
        throw new Error('Cache not initialized');
      }
      _vaults = this.vaults();
    }

    let _vds: Data<PublicKey, VaultDepositor>[];
    if (vaultDepositors) {
      _vds = vaultDepositors;
    } else {
      if (!this._cache) {
        throw new Error('Cache not initialized');
      }
      _vds = this.vaultDepositors();
    }

    let usdc = 0;
    for (const vd of _vds) {
      let vault: Vault;
      const match = _vaults.find((v) => v.data.pubkey.equals(vd.data.vault));
      if (match) {
        vault = match.data;
      } else {
        const _vault = this.vault(vd.data.vault)?.data;
        if (!_vault) {
          throw new Error(`Vault not found: ${vd.data.vault.toString()}`);
        }
        vault = _vault;
      }
      const amount =
        await this.vaultClient.calculateWithdrawableVaultDepositorEquityInDepositAsset(
          {
            vaultDepositor: vd.data,
            vault: vault,
          }
        );
      const balance = amount.toNumber() / QUOTE_PRECISION.toNumber();
      usdc += balance;
    }
    return usdc;
  }

  public async managerEquityInDepositAsset(
    vault: PublicKey
  ): Promise<number | undefined> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return undefined;
    }
    const vaultTotalEquity = await this.vaultClient.calculateVaultEquity({
      vault: vaultAccount,
    });
    let vpShares = new BN(0);
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      const vpAccount =
        await this.vaultProgram.account.vaultProtocol.fetch(vaultProtocol);
      vpShares = vpAccount.protocolProfitAndFeeShares;
    }
    const managerShares = vaultAccount.totalShares
      .sub(vpShares)
      .sub(vaultAccount.userShares);
    const managerEquity = depositSharesToVaultAmount(
      managerShares,
      vaultAccount.totalShares,
      vaultTotalEquity
    );

    const spotMarket = this.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex
    );
    const spotOracle = this.driftClient.getOracleDataForSpotMarket(
      vaultAccount.spotMarketIndex
    );
    const spotPrecision = TEN.pow(new BN(spotMarket!.decimals));

    const usdcBN = managerEquity.mul(spotPrecision).div(spotOracle.price);
    return usdcBN.toNumber() / QUOTE_PRECISION.toNumber();
  }

  public async protocolEquityInDepositAsset(
    vault: PublicKey
  ): Promise<number | undefined> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return undefined;
    }
    if (!vaultAccount.vaultProtocol) {
      return undefined;
    }
    const vaultTotalEquity = await this.vaultClient.calculateVaultEquity({
      vault: vaultAccount,
    });
    const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
    const vpAccount =
      await this.vaultProgram.account.vaultProtocol.fetch(vaultProtocol);
    const equity = depositSharesToVaultAmount(
      vpAccount.protocolProfitAndFeeShares,
      vaultAccount.totalShares,
      vaultTotalEquity
    );
    const spotMarket = this.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex
    );
    const spotOracle = this.driftClient.getOracleDataForSpotMarket(
      vaultAccount.spotMarketIndex
    );
    const spotPrecision = TEN.pow(new BN(spotMarket!.decimals));

    const usdcBN = equity.mul(spotPrecision).div(spotOracle.price);
    return usdcBN.toNumber() / QUOTE_PRECISION.toNumber();
  }

  public async vaultDepositorEquityInDepositAsset(
    vdKey: PublicKey,
    vaultKey: PublicKey,
    forceFetch = false
  ): Promise<number | undefined> {
    let vault: Vault | undefined = undefined;
    if (forceFetch) {
      vault = await this.fetchVault(vaultKey);
    } else {
      vault = this.vault(vaultKey)?.data;
    }
    if (!vault) {
      throw new Error(
        `Vault ${vaultKey.toString()} not found in equity calculation`
      );
    }
    let vaultDepositor: VaultDepositor | undefined = undefined;
    if (forceFetch) {
      const data = await this.fetchVaultDepositor(vdKey);
      if (!data) {
        return undefined;
      }
      vaultDepositor = data;
    } else {
      vaultDepositor = this.vaultDepositor(vdKey, false)?.data;
    }
    if (!vaultDepositor) {
      return undefined;
    }
    const amount =
      await this.vaultClient.calculateWithdrawableVaultDepositorEquityInDepositAsset(
        {
          vaultDepositor,
          vault,
        }
      );
    return amount.toNumber() / QUOTE_PRECISION.toNumber();
  }

  /**
   * Aggregate deposits (not including profits) across all vaults denominated in USDC.
   */
  public aggregateDeposits(
    vaultDepositors?: Data<PublicKey, VaultDepositor>[]
  ): number {
    let vds: Data<PublicKey, VaultDepositor>[];
    if (!vaultDepositors) {
      if (!this._cache) {
        throw new Error('Cache not initialized');
      }
      vds = this.vaultDepositors();
    } else {
      vds = vaultDepositors;
    }
    let usdc = 0;
    for (const vd of vds) {
      const netDeposits =
        vd.data.netDeposits.toNumber() / QUOTE_PRECISION.toNumber();
      usdc += netDeposits;
    }
    return usdc;
  }

  /**
   * Aggregate PNL across all vaults denominated in USDC.
   */
  public async aggregatePNL(
    vaultDepositors?: Data<PublicKey, VaultDepositor>[]
  ): Promise<number> {
    let vds: Data<PublicKey, VaultDepositor>[];
    if (!vaultDepositors) {
      if (!this._cache) {
        throw new Error('Cache not initialized');
      }
      vds = this.vaultDepositors();
    } else {
      vds = vaultDepositors;
    }
    const tvl = await this.aggregateTVL(undefined, vds);
    const deposits = this.aggregateDeposits(vds);
    return tvl - deposits;
  }

  //
  // Investor actions
  //

  public async joinVault(vault: PublicKey): Promise<SnackInfo> {
    if (!this.userInitialized()) {
      throw new Error('User not initialized');
    }
    const sig = await this.vaultClient.initializeVaultDepositor(vault);
    console.debug('join vault:', signatureLink(sig));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount = await this.vaultProgram.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: 'success',
      message: `Joined ${vaultName}`,
    };
  }

  private async createUsdcAtaIx(
    mint: PublicKey
  ): Promise<InstructionReturn | undefined> {
    const userAta = getAssociatedTokenAddressSync(mint, this.publicKey, true);
    const userAtaExists = await this.connection.getAccountInfo(userAta);
    if (userAtaExists === null) {
      const funder = walletAdapterToAsyncSigner(this.wallet);
      const ix: InstructionReturn = () => {
        return Promise.resolve({
          instruction: createAssociatedTokenAccountInstruction(
            this.publicKey,
            userAta,
            this.publicKey,
            mint
          ),
          signers: [funder],
        });
      };
      return ix;
    }
    return undefined;
  }

  private async depositIx(
    vault: PublicKey,
    usdc: number
  ): Promise<Result<TransactionInstruction[], SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: 'error',
        message: 'Vault not found in deposit instruction',
      });
    }
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const ixs: TransactionInstruction[] = [];

    const spotMarket = this.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex
    );
    if (!spotMarket) {
      return err({
        variant: 'error',
        message: 'Spot market not found',
      });
    }

    const userAta = getAssociatedTokenAddressSync(
      spotMarket.mint,
      this.publicKey,
      true
    );
    const userAtaExists = await this.connection.getAccountInfo(userAta);
    if (userAtaExists === null) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          this.publicKey,
          userAta,
          this.publicKey,
          spotMarket.mint
        )
      );
    }

    const vaultDepositor = this.getVaultDepositorAddress(vault);
    const vdExists = this.vaultDepositor(vaultDepositor, false)?.data;
    if (!vdExists) {
      ixs.push(
        await this.vaultProgram.methods
          .initializeVaultDepositor()
          .accounts({
            vaultDepositor,
            vault,
            authority: this.publicKey,
            payer: this.publicKey,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
          })
          .instruction()
      );
    }

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const depositIx = await this.vaultProgram.methods
      .deposit(amount)
      .accounts({
        vault,
        vaultDepositor,
        vaultTokenAccount: vaultAccount.tokenAccount,
        driftUserStats: vaultAccount.userStats,
        driftUser: vaultAccount.user,
        driftState: await this.driftClient.getStatePublicKey(),
        userTokenAccount: userAta,
        driftSpotMarketVault: spotMarket.vault,
        driftProgram: this.driftProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();
    ixs.push(depositIx);
    return ok(ixs);
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

    // check if wallet is protocol
    if (vaultAcct.vaultProtocol) {
      const vp = this.vaultClient.getVaultProtocolAddress(vault);
      const vpAcct = (await this.vaultProgram.account.vaultProtocol.fetch(
        vp
      )) as VaultProtocol;
      if (vpAcct.protocol.equals(this.publicKey)) {
        return ok(true);
      }
    }
    return ok(false);
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
    if (vaultAcct.manager.equals(this.publicKey)) {
      return ok(true);
    }
    return ok(false);
  }

  public async deposit(vault: PublicKey, usdc: number): Promise<SnackInfo> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return {
        variant: 'error',
        message: 'Vault not found in deposit instruction',
      };
    }

    const ixs = [];

    const userKey = getUserAccountPublicKeySync(
      this.driftProgram.programId,
      this.publicKey
    );
    let addUserAfter = false;
    if (!(await this.checkIfAccountExists(userKey))) {
      const initUserIxs = await this.initUserIxs();
      ixs.push(...initUserIxs);
      addUserAfter = true;
    }

    // check if wallet is protocol
    const isProtocolResult = await this.isProtocol(vault);
    if (isProtocolResult.isErr()) {
      return isProtocolResult.error;
    }
    if (isProtocolResult.value) {
      return {
        variant: 'error',
        message: 'Protocol not allowed to deposit to vault',
      };
    }

    const isManager = this.isManager(vault).unwrapOr(false);
    if (isManager) {
      const result = await this.managerDepositIx(vault, usdc);
      if (result.isErr()) {
        return result.error;
      }
      ixs.push(result.value);
    } else {
      const result = await this.depositIx(vault, usdc);
      if (result.isErr()) {
        return result.error;
      }
      ixs.push(...result.value);
    }

    const res = await this.sendTx(ixs);
    if (res.isErr()) {
      console.error(res.error);
      return {
        variant: 'error',
        message: 'Failed to deposit',
      };
    }
    const sig = res.value;
    console.debug('deposit:', signatureLink(sig));
    const _vault = this.vault(vault)?.data;
    if (!_vault) {
      throw new Error(`Vault not found: ${vault.toString()}`);
    }
    const vaultName = decodeName(_vault.name);
    await this.fetchEquityInVault(vault);
    await this.fetchFundOverview(vault);
    if (addUserAfter) {
      await this.driftClient.addUser(0, this.publicKey);
    }

    return {
      variant: 'success',
      message: `Deposited to ${vaultName}`,
    };
  }

  private async requestWithdrawIx(
    vaultDepositor: PublicKey,
    amount: BN,
    withdrawUnit: WithdrawUnit
  ): Promise<Result<TransactionInstruction[], SnackInfo>> {
    const vaultDepositorAccount =
      await this.vaultProgram.account.vaultDepositor.fetch(vaultDepositor);
    const vaultAccount = await this.vaultProgram.account.vault.fetch(
      vaultDepositorAccount.vault
    );

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(
        vaultDepositorAccount.vault
      );
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const userStatsKey = getUserStatsAccountPublicKey(
      this.driftClient.program.programId,
      vaultDepositorAccount.vault
    );

    const driftStateKey = await this.driftClient.getStatePublicKey();

    const accounts = {
      vault: vaultDepositorAccount.vault,
      vaultDepositor,
      driftUserStats: userStatsKey,
      driftUser: vaultAccount.user,
      driftState: driftStateKey,
    };

    const ix = await this.vaultProgram.methods
      // @ts-ignore
      .requestWithdraw(amount, withdrawUnit)
      .accounts(accounts)
      .remainingAccounts(remainingAccounts)
      .instruction();
    return ok([ix]);
  }

  public async requestWithdraw(
    vault: PublicKey,
    usdc: number
  ): Promise<SnackInfo> {
    if (!this.userInitialized()) {
      throw new Error('User not initialized');
    }
    const vaultDepositor = this.getVaultDepositorAddress(vault);
    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());

    // check if wallet is protocol
    const isProtocolResult = await this.isProtocol(vault);
    if (isProtocolResult.isErr()) {
      console.error(isProtocolResult.error);
      return isProtocolResult.error;
    }
    if (isProtocolResult.value) {
      const ix = await this.protocolRequestWithdrawIx(vault, usdc);
      if (ix.isErr()) {
        console.error(ix.error);
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: 'error',
          message: 'Protocol failed to request withdraw',
        };
      }
      const sig = res.value;
      await this.fetchEquityInVault(vault);
      await this.fetchFundOverviews();

      // cache timer so frontend can track withdraw request
      await this.createWithdrawTimer(vault);

      console.debug('protocol request withdraw:', signatureLink(sig));
      const _vault = this.vault(vault)?.data;
      if (!_vault) {
        throw new Error(`Vault not found: ${vault.toString()}`);
      }
      const vaultName = decodeName(_vault.name);
      return {
        variant: 'success',
        message: `Protocol requested withdraw from ${vaultName}`,
      };
    }

    const isManagerResult = this.isManager(vault);
    if (isManagerResult.isErr()) {
      console.error(isManagerResult.error);
      return isManagerResult.error;
    }
    if (isManagerResult.value) {
      const ix = await this.managerRequestWithdrawIx(vault, usdc);
      if (ix.isErr()) {
        console.error(ix.error);
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: 'error',
          message: 'Manager failed to request withdraw',
        };
      }
      const sig = res.value;
      await this.fetchEquityInVault(vault);
      await this.fetchFundOverviews();

      // cache timer so frontend can track withdraw request
      await this.createWithdrawTimer(vault);

      console.debug('manager request withdraw:', signatureLink(sig));
      const _vault = this.vault(vault)?.data;
      if (!_vault) {
        throw new Error(`Vault not found: ${vault.toString()}`);
      }
      const vaultName = decodeName(_vault.name);
      return {
        variant: 'success',
        message: `Manager requested withdraw from ${vaultName}`,
      };
    }

    try {
      const ix = await this.requestWithdrawIx(
        vaultDepositor,
        amount,
        WithdrawUnit.TOKEN
      );
      if (ix.isErr()) {
        console.error(ix.error);
        return ix.error;
      }
      const res = await this.sendTx(ix.value);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: 'error',
          message: 'Failed to request withdraw',
        };
      }
      console.debug('request withdraw:', signatureLink(res.value));
      await this.fetchEquityInVault(vault);
      await this.fetchFundOverviews();

      // cache timer so frontend can track withdraw request
      await this.createWithdrawTimer(vault);

      const _vault = this.vault(vault)?.data;
      if (!_vault) {
        throw new Error(`Vault not found: ${vault.toString()}`);
      }
      const vaultName = decodeName(_vault.name);
      return {
        variant: 'success',
        message: `Requested withdraw from ${vaultName}`,
      };
    } catch (e: any) {
      console.error(e);
      return {
        variant: 'error',
        message: `Failed to request withdraw`,
      };
    }
  }

  public async cancelWithdrawRequest(vault: PublicKey): Promise<SnackInfo> {
    if (!this.userInitialized()) {
      throw new Error('User not initialized');
    }
    const vaultDepositor = this.getVaultDepositorAddress(vault);

    const isProtocolResult = await this.isProtocol(vault);
    if (isProtocolResult.isErr()) {
      return isProtocolResult.error;
    }
    if (isProtocolResult.value) {
      const ix = await this.protocolCancelWithdrawRequestIx(vault);
      if (ix.isErr()) {
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: 'error',
          message: 'Protocol failed to cancel withdraw request',
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchEquityInVault(vault);
      await this.fetchFundOverviews();
      console.debug('cancel withdraw request:', signatureLink(res.value));
      const _vault = this.vault(vault)?.data;
      if (!_vault) {
        throw new Error(`Vault not found: ${vault.toString()}`);
      }
      const vaultName = decodeName(_vault.name);
      return {
        variant: 'success',
        message: `Protocol canceled withdraw request for ${vaultName}`,
      };
    }

    const isManagerResult = this.isManager(vault);
    if (isManagerResult.isErr()) {
      return isManagerResult.error;
    }
    if (isManagerResult.value) {
      const ix = await this.managerCancelWithdrawRequestIx(vault);
      if (ix.isErr()) {
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: 'error',
          message: 'Manager failed to cancel withdraw request',
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchEquityInVault(vault);
      await this.fetchFundOverviews();
      console.debug(
        'manager cancel withdraw request:',
        signatureLink(res.value)
      );
      const _vault = this.vault(vault)?.data;
      if (!_vault) {
        throw new Error(`Vault not found: ${vault.toString()}`);
      }
      const vaultName = decodeName(_vault.name);
      return {
        variant: 'success',
        message: `Manager canceled withdraw request for ${vaultName}`,
      };
    }

    const sig = await this.vaultClient.cancelRequestWithdraw(vaultDepositor);
    // successful withdraw means no more withdraw request
    this.removeWithdrawTimer(vault);
    await this.fetchEquityInVault(vault);
    await this.fetchFundOverviews();
    console.debug('cancel withdraw request:', signatureLink(sig));
    const _vault = this.vault(vault)?.data;
    if (!_vault) {
      throw new Error(`Vault not found: ${vault.toString()}`);
    }
    const vaultName = decodeName(_vault.name);
    return {
      variant: 'success',
      message: `Canceled withdraw request for ${vaultName}`,
    };
  }

  public async withdraw(vault: PublicKey): Promise<SnackInfo> {
    if (!this.userInitialized()) {
      throw new Error('User not initialized');
    }
    const vaultDepositor = this.getVaultDepositorAddress(vault);

    const isProtocolResult = await this.isProtocol(vault);
    if (isProtocolResult.isErr()) {
      return isProtocolResult.error;
    }
    if (isProtocolResult.value) {
      const ix = await this.protocolWithdrawIx(vault);
      if (ix.isErr()) {
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: 'error',
          message: 'Protocol failed to withdraw',
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchEquityInVault(vault);
      await this.fetchFundOverview(vault);

      console.debug('protocol withdraw:', signatureLink(res.value));
      const _vault = this.vault(vault)?.data;
      if (!_vault) {
        throw new Error(`Vault not found: ${vault.toString()}`);
      }
      const vaultName = decodeName(_vault.name);
      return {
        variant: 'success',
        message: `Protocol withdrew from ${vaultName}`,
      };
    }

    const isManagerResult = this.isManager(vault);
    if (isManagerResult.isErr()) {
      return isManagerResult.error;
    }
    if (isManagerResult.value) {
      const ix = await this.managerWithdrawIx(vault);
      if (ix.isErr()) {
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: 'error',
          message: 'Manager failed to withdraw',
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchEquityInVault(vault);
      await this.fetchFundOverviews();

      console.debug('manager withdraw:', signatureLink(res.value));
      const _vault = this.vault(vault)?.data;
      if (!_vault) {
        throw new Error(`Vault not found: ${vault.toString()}`);
      }
      const vaultName = decodeName(_vault.name);
      return {
        variant: 'success',
        message: `Manager withdrew from ${vaultName}`,
      };
    }

    const sig = await this.vaultClient.withdraw(vaultDepositor);
    this.removeWithdrawTimer(vault);
    await this.fetchEquityInVault(vault);
    await this.fetchFundOverviews();

    console.debug('withdraw:', signatureLink(sig));
    const _vault = this.vault(vault)?.data;
    if (!_vault) {
      throw new Error(`Vault not found: ${vault.toString()}`);
    }
    const vaultName = decodeName(_vault.name);
    return {
      variant: 'success',
      message: `Withdrew from ${vaultName}`,
    };
  }

  //
  // Manager actions
  //

  private async createVaultWithDelegate(
    params: {
      name: number[];
      spotMarketIndex: number;
      redeemPeriod: BN;
      maxTokens: BN;
      minDepositAmount: BN;
      managementFee: BN;
      profitShare: number;
      hurdleRate: number;
      permissioned: boolean;
      vaultProtocol?: VaultProtocolParams;
    },
    delegate: PublicKey
  ): Promise<string> {
    const {vaultProtocol: vaultProtocolParams, ...vaultParams} = params;

    const vault = getVaultAddressSync(this.vaultProgram.programId, params.name);
    const tokenAccount = getTokenVaultAddressSync(
      this.vaultProgram.programId,
      vault
    );

    const driftState = await this.driftClient.getStatePublicKey();
    const spotMarket = this.driftClient.getSpotMarketAccount(
      params.spotMarketIndex
    );
    if (!spotMarket) {
      throw new Error(
        `Spot market ${params.spotMarketIndex} not found on driftClient`
      );
    }

    const userStatsKey = getUserStatsAccountPublicKey(
      this.driftProgram.programId,
      vault
    );
    const userKey = getUserAccountPublicKeySync(
      this.driftProgram.programId,
      vault
    );

    const accounts = {
      driftSpotMarket: spotMarket.pubkey,
      driftSpotMarketMint: spotMarket.mint,
      driftUserStats: userStatsKey,
      driftUser: userKey,
      driftState,
      vault,
      tokenAccount,
      driftProgram: this.driftProgram.programId,
    };

    const updateDelegateIx = await this.delegateVaultIx(vault, delegate);

    if (vaultProtocolParams) {
      const _params: VaultWithProtocolParams = {
        ...vaultParams,
        vaultProtocol: vaultProtocolParams,
      };
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(
        getVaultAddressSync(this.vaultProgram.programId, params.name)
      );
      return await this.vaultProgram.methods
        .initializeVaultWithProtocol(_params)
        .accounts({
          ...accounts,
          vaultProtocol,
        })
        .postInstructions([updateDelegateIx])
        .rpc();
    } else {
      const _params: VaultParams = vaultParams;
      return await this.vaultProgram.methods
        .initializeVault(_params)
        .accounts(accounts)
        .postInstructions([updateDelegateIx])
        .rpc();
    }
  }

  /**
   * The connected wallet will become the manager of the vault.
   */
  public async createVault(params: CreateVaultConfig): Promise<{
    vault: PublicKey;
    vaultProtocol: PublicKey;
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
    const vaultProtocolParams: VaultProtocolParams = {
      protocol: PROP_SHOP_PROTOCOL,
      // 0.5% annual fee
      protocolFee: percentToPercentPrecision(PROP_SHOP_PERCENT_ANNUAL_FEE),
      // 5% profit share
      protocolProfitShare: percentToPercentPrecision(
        PROP_SHOP_PERCENT_PROFIT_SHARE
      ).toNumber(),
    };
    const vaultParams = {
      name: encodeName(params.name),
      // USDC spot market is 0 on all networks
      spotMarketIndex: 0,
      redeemPeriod,
      maxTokens,
      minDepositAmount,
      managementFee,
      profitShare,
      // currently not implemented within the program
      hurdleRate: 0,
      permissioned,
      vaultProtocol: vaultProtocolParams,
    };

    let sig: string;
    if (params.delegate) {
      sig = await this.createVaultWithDelegate(vaultParams, params.delegate);
    } else {
      sig = await this.vaultClient.initializeVault(vaultParams);
    }

    console.debug('initialize vault:', signatureLink(sig));
    const vault = getVaultAddressSync(
      this.vaultProgram.programId,
      encodeName(params.name)
    );
    const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);

    console.log(`created vault: ${vault.toString()}`);
    await this.fetchFundOverview(vault);

    return {
      vault,
      vaultProtocol,
      snack: {
        variant: 'success',
        message: `Created "${params.name}"`,
      },
    };
  }

  public async delegateVaultIx(
    vault: PublicKey,
    delegate: PublicKey
  ): Promise<TransactionInstruction> {
    const vaultUser = getUserAccountPublicKeySync(
      this.driftProgram.programId,
      vault
    );

    return this.vaultProgram.methods
      .updateDelegate(delegate)
      .accounts({
        vault,
        driftUser: vaultUser,
        driftProgram: this.driftProgram.programId,
      })
      .instruction();
  }

  private async delegateVault(
    vault: PublicKey,
    delegate: PublicKey
  ): Promise<SnackInfo> {
    if (!this.userInitialized()) {
      throw new Error('User not initialized');
    }
    const sig = await this.vaultClient.updateDelegate(vault, delegate);
    console.debug('delegate vault:', signatureLink(sig));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount = await this.vaultProgram.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: 'success',
      message: `Delegated ${vaultName} vault to ${delegate.toString()}`,
    };
  }

  public async updateVaultIx(vault: PublicKey, config: UpdateVaultConfig) {
    if (config.redeemPeriod && config.redeemPeriod > ONE_DAY * 90) {
      throw new Error('Redeem period must be less than 90 days');
    }

    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }

    let profitShare: number | null = percentToPercentPrecision(
      config.percentProfitShare ?? 0
    ).toNumber();
    if (profitShare >= vaultAcct.profitShare) {
      profitShare = null;
    }
    let managementFee: BN | null = percentToPercentPrecision(
      config.percentAnnualManagementFee ?? 0
    );
    if (managementFee.gte(vaultAcct.managementFee)) {
      managementFee = null;
    }
    let minDepositAmount: BN | null = new BN(
      (config.minDepositUSDC ?? 0) * QUOTE_PRECISION.toNumber()
    );
    if (minDepositAmount.gte(vaultAcct.minDepositAmount)) {
      minDepositAmount = null;
    }
    let permissioned: boolean | null = config.permissioned ?? false;
    if (permissioned === vaultAcct.permissioned) {
      permissioned = null;
    }
    let redeemPeriod: BN | null = new BN(config.redeemPeriod ?? ONE_DAY);
    if (redeemPeriod.gte(vaultAcct.redeemPeriod)) {
      redeemPeriod = null;
    }
    let maxTokens: BN | null = new BN(
      (config.maxCapacityUSDC ?? 0) * QUOTE_PRECISION.toNumber()
    );
    if (maxTokens.gte(vaultAcct.maxTokens)) {
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
    };

    let ix: TransactionInstruction;
    if (vaultAcct.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      const remainingAccounts: AccountMeta[] = [
        {
          pubkey: vaultProtocol,
          isSigner: false,
          isWritable: true,
        },
      ];
      ix = await this.vaultProgram.methods
        .updateVault(params)
        .accounts({
          vault,
          manager: this.publicKey,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
    } else {
      ix = await this.vaultProgram.methods
        .updateVault(params)
        .accounts({
          vault,
          manager: this.publicKey,
        })
        .instruction();
    }
    return ix;
  }

  public defaultUpdateVaultConfig(vault: PublicKey): UpdateVaultConfig {
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

  /**
   * Can only reduce the profit share, management fee, or redeem period.
   * Unable to modify protocol fees.
   */
  public async updateVault(
    vault: PublicKey,
    params: UpdateVaultConfig
  ): Promise<SnackInfo> {
    const ixs: TransactionInstruction[] = [];
    if (params.delegate) {
      ixs.push(await this.delegateVaultIx(vault, params.delegate));
    }
    ixs.push(await this.updateVaultIx(vault, params));

    const result = await this.sendTx(ixs);
    if (result.isErr()) {
      return {
        variant: 'error',
        message: 'Failed to update vault',
      };
    }
    console.debug('update vault:', signatureLink(result.value));
    await this.fetchFundOverview(vault);
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }
    return {
      variant: 'success',
      message: `Updated "${decodeName(vaultAcct.name)}"`,
    };
  }

  private async managerDepositIx(
    vault: PublicKey,
    usdc: number
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      throw new Error(
        `Vault ${vault.toString()} not found during manager deposit`
      );
    }
    const driftSpotMarket = this.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex
    );
    if (!driftSpotMarket) {
      return err({
        variant: 'error',
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    return ok(
      await this.vaultProgram.methods
        .managerDeposit(amount)
        .accounts({
          vault,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.driftProgram.programId,
            vault
          ),
          driftProgram: this.driftProgram.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.driftProgram.programId,
            vault
          ),
          driftState: await this.driftClient.getStatePublicKey(),
          driftSpotMarketVault: driftSpotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            driftSpotMarket.mint,
            this.publicKey
          ),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction()
    );
  }

  private async managerRequestWithdrawIx(
    vault: PublicKey,
    usdc: number
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      throw new Error(`Vault not found: ${vault.toString()}`);
    }

    if (!this.publicKey.equals(vaultAccount.manager)) {
      return err({
        variant: 'error',
        message: 'Only the manager can request a manager withdraw',
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const accounts = {
      vault,
      driftUserStats: getUserStatsAccountPublicKey(
        this.driftProgram.programId,
        vault
      ),
      driftUser: vaultAccount.user,
      driftState: await this.driftClient.getStatePublicKey(),
    };

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const withdrawUnit = WithdrawUnit.TOKEN;
    return ok(
      await this.vaultProgram.methods
        // @ts-ignore, 0.29.0 anchor issues..
        .managerRequestWithdraw(amount, withdrawUnit)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction()
    );
  }

  private async managerCancelWithdrawRequestIx(
    vault: PublicKey
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found during manager withdraw`,
      });
    }

    if (!this.publicKey.equals(vaultAccount.manager)) {
      return err({
        variant: 'error',
        message: 'Only the manager can cancel a manager withdraw request',
      });
    }

    const accounts = {
      manager: this.publicKey,
      vault,
      driftUserStats: getUserStatsAccountPublicKey(
        this.driftProgram.programId,
        vault
      ),
      driftUser: vaultAccount.user,
      driftState: await this.driftClient.getStatePublicKey(),
    };

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    return ok(
      await this.vaultProgram.methods
        .mangerCancelWithdrawRequest()
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction()
    );
  }

  private async managerWithdrawIx(
    vault: PublicKey
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found during manager withdraw`,
      });
    }

    if (!this.publicKey.equals(vaultAccount.manager)) {
      return err({
        variant: 'error',
        message: 'Only the manager can manager withdraw',
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const spotMarket = this.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex
    );
    if (!spotMarket) {
      return err({
        variant: 'error',
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    return ok(
      await this.vaultProgram.methods
        .managerWithdraw()
        .accounts({
          vault,
          manager: this.publicKey,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.driftProgram.programId,
            vault
          ),
          driftProgram: this.driftProgram.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.driftProgram.programId,
            vault
          ),
          driftState: await this.driftClient.getStatePublicKey(),
          driftSpotMarketVault: spotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            spotMarket.mint,
            this.publicKey
          ),
          driftSigner: this.driftClient.getStateAccount().signer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction()
    );
  }

  //
  // Protocol actions
  //

  private async protocolRequestWithdrawIx(
    vault: PublicKey,
    usdc: number
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found during protocol withdraw request`,
      });
    }

    if (!vaultAccount.vaultProtocol) {
      return err({
        variant: 'error',
        message: `Protocol unable to request withdraw from non-protocol vault ${vault.toString()}`,
      });
    }

    const vp = this.vaultClient.getVaultProtocolAddress(vault);
    const vpAccount = (await this.vaultProgram.account.vaultProtocol.fetch(
      vp
    )) as VaultProtocol;
    if (!this.publicKey.equals(vpAccount.protocol)) {
      return err({
        variant: 'error',
        message: 'Only the protocol can request a protocol withdraw',
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const accounts = {
      vault,
      driftUserStats: getUserStatsAccountPublicKey(
        this.driftProgram.programId,
        vault
      ),
      driftUser: vaultAccount.user,
      driftState: await this.driftClient.getStatePublicKey(),
    };

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const withdrawUnit = WithdrawUnit.TOKEN;
    return ok(
      await this.vaultProgram.methods
        // @ts-ignore, 0.29.0 anchor issues..
        .managerRequestWithdraw(amount, withdrawUnit)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction()
    );
  }

  private async protocolCancelWithdrawRequestIx(
    vault: PublicKey
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found during protocol withdraw request`,
      });
    }

    if (!vaultAccount.vaultProtocol) {
      return err({
        variant: 'error',
        message: `Protocol unable to cancel withdraw request from non-protocol vault ${vault.toString()}`,
      });
    }

    const accounts = {
      manager: this.publicKey,
      vault,
      driftUserStats: getUserStatsAccountPublicKey(
        this.driftProgram.programId,
        vault
      ),
      driftUser: vaultAccount.user,
      driftState: await this.driftClient.getStatePublicKey(),
    };

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    return ok(
      await this.vaultProgram.methods
        .mangerCancelWithdrawRequest()
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction()
    );
  }

  private async protocolWithdrawIx(
    vault: PublicKey
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: 'error',
        message: `Vault ${vault.toString()} not found during protocol withdraw request`,
      });
    }

    if (!vaultAccount.vaultProtocol) {
      return err({
        variant: 'error',
        message: `Protocol unable to withdraw from non-protocol vault ${vault.toString()}`,
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user
    );
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [user.getUserAccount()],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
    if (vaultAccount.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const spotMarket = this.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex
    );
    if (!spotMarket) {
      return err({
        variant: 'error',
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    return ok(
      await this.vaultProgram.methods
        .managerWithdraw()
        .accounts({
          vault,
          manager: this.publicKey,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.driftProgram.programId,
            vault
          ),
          driftProgram: this.driftProgram.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.driftProgram.programId,
            vault
          ),
          driftState: await this.driftClient.getStatePublicKey(),
          driftSpotMarketVault: spotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            spotMarket.mint,
            this.publicKey
          ),
          driftSigner: this.driftClient.getStateAccount().signer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction()
    );
  }

  //
  // Utils
  //

  public clientVaultDepositor(
    vault: PublicKey
  ): Data<PublicKey, VaultDepositor> | undefined {
    const key = this.getVaultDepositorAddress(vault);
    return this.vaultDepositor(key, false);
  }

  public withdrawTimer(vault: PublicKey): WithdrawRequestTimer | undefined {
    return this._timers.get(vault.toString());
  }

  private async createVaultDepositorWithdrawTimer(
    vault: PublicKey
  ): Promise<void> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault not found: ${vault.toString()}`);
    }
    const vdKey = this.getVaultDepositorAddress(vault);

    // force fetch of vault and vaultDepositor accounts in case websocket is slow to update
    await this.fetchVault(vault);
    await this.fetchVaultDepositor(vdKey);

    const vdAcct = this.vaultDepositor(vdKey, false)?.data;
    if (!vdAcct) {
      this.removeWithdrawTimer(vault);
      return;
    }
    const reqTs = vdAcct.lastWithdrawRequest.ts.toNumber();

    if (vdAcct.lastWithdrawRequest.value.toNumber() === 0 || reqTs === 0) {
      this.removeWithdrawTimer(vault);
      return;
    }

    const equity =
      vdAcct.lastWithdrawRequest.value.toNumber() / QUOTE_PRECISION.toNumber();

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
    if (!vaultAcct.vaultProtocol) {
      return;
    }
    const vp = this.vaultClient.getVaultProtocolAddress(vault);
    const vpAcct = (await this.vaultProgram.account.vaultProtocol.fetch(
      vp
    )) as VaultProtocol;

    const reqTs = vpAcct.lastProtocolWithdrawRequest.ts.toNumber();
    if (
      vpAcct.lastProtocolWithdrawRequest.value.toNumber() === 0 ||
      reqTs === 0
    ) {
      this.removeWithdrawTimer(vault);
      return;
    }

    const equity =
      vpAcct.lastProtocolWithdrawRequest.value.toNumber() /
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
    await this.createVaultDepositorWithdrawTimer(vault);
  }

  private removeWithdrawTimer(vault: PublicKey) {
    const result = this._timers.get(vault.toString());
    if (result) {
      clearInterval(result.timer);
    }
    this._timers.delete(vault.toString());
  }

  public percentShare(vaultKey: PublicKey): number | undefined {
    const investorKey = this.getVaultDepositorAddress(vaultKey);
    const investor = this.vaultDepositor(investorKey)?.data;
    if (!investor) {
      return undefined;
    }
    const vault = this.vault(vaultKey)?.data;
    if (!vault) {
      return undefined;
    }
    return investor.vaultShares.toNumber() / vault.totalShares.toNumber() * 100;
  }

  public async fetchEquityInVault(
    vault: PublicKey
  ): Promise<number | undefined> {
    const isManager = this.isManager(vault).unwrapOr(false);
    if (isManager) {
      const usdc = await this.managerEquityInDepositAsset(vault);
      if (!usdc) {
        return undefined;
      }
      this._equities.set(vault.toString(), usdc);
      return usdc;
    }

    const isProtocol = (await this.isProtocol(vault)).unwrapOr(false);
    if (isProtocol) {
      const usdc = await this.protocolEquityInDepositAsset(vault);
      if (!usdc) {
        return undefined;
      }
      this._equities.set(vault.toString(), usdc);
      return usdc;
    }

    const key = this.getVaultDepositorAddress(vault);
    const usdc = await this.vaultDepositorEquityInDepositAsset(
      key,
      vault,
      true
    );
    if (!usdc) {
      return undefined;
    }
    this._equities.set(vault.toString(), usdc);
    return usdc;
  }

  public equityInVault(vault: PublicKey): number | undefined {
    return this._equities.get(vault.toString());
  }

  public async fetchWalletUsdc(): Promise<number | undefined> {
    const spotMarket = this.driftClient.getSpotMarketAccount(0);
    if (!spotMarket) {
      throw new Error('USDC spot market not found in DriftClient');
    }
    const usdcMint = spotMarket.mint;
    const usdcAta = getAssociatedTokenAddress(usdcMint, this.publicKey);
    try {
      const acct = await this.connection.getTokenAccountBalance(usdcAta);
      return acct.value.uiAmount ?? undefined;
    } catch (e) {
      // this error occurs because RPC failed to fetch an account that does not exist
      // so return undefined instead of throwing an error
      return undefined;
    }
  }

  private async sendTx(
    ixs: TransactionInstruction[]
  ): Promise<Result<string, TransactionError>> {
    const _ixs: InstructionReturn[] = ixs.map((ix) => {
      return () => {
        return Promise.resolve({
          instruction: ix,
          signers: [],
        });
      };
    });
    const funder = walletAdapterToAsyncSigner(this.wallet);
    return sendTransactionWithResult(_ixs, funder, this.connection);
  }

  public get vaultClient(): VaultClient {
    if (!this._vaultClient) {
      throw new Error('Drift VaultClient not initialized');
    }
    return this._vaultClient;
  }

  public get driftClient(): DriftClient {
    return this.vaultClient.driftClient;
  }

  public get driftProgram(): anchor.Program {
    return this.driftClient.program;
  }

  public get vaultProgram(): anchor.Program<DriftVaults> {
    return this.vaultClient.program;
  }
}
