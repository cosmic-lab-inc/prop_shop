import {
  AccountMeta,
  Connection,
  GetProgramAccountsFilter,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionError,
  TransactionInstruction,
  type TransactionSignature,
  TransactionVersion,
  VersionedTransaction,
} from "@solana/web3.js";
import { makeAutoObservable } from "mobx";
import * as anchor from "@coral-xyz/anchor";
import { BN, ProgramAccount } from "@coral-xyz/anchor";
import { Wallet as AnchorWallet } from "@coral-xyz/anchor/dist/cjs/provider";
import {
  decodeName,
  DriftClient,
  DriftClientConfig,
  encodeName,
  getUserAccountPublicKey,
  getUserAccountPublicKeySync,
  getUserStatsAccountPublicKey,
  IWallet,
  OracleInfo,
  PerpMarketAccount,
  QUOTE_PRECISION,
  SpotMarketAccount,
  TEN,
  unstakeSharesToAmount as depositSharesToVaultAmount,
  UserStatsAccount,
} from "@drift-labs/sdk";
import {
  DRIFT_PROGRAM_ID,
  DRIFT_VAULTS_PROGRAM_ID,
  ONE_DAY,
  PROP_SHOP_PERCENT_ANNUAL_FEE,
  PROP_SHOP_PERCENT_PROFIT_SHARE,
  PROP_SHOP_PROTOCOL,
  TEST_USDC_MINT,
  TEST_USDC_MINT_AUTHORITY,
} from "./constants";
import { getAssociatedTokenAddress } from "./programs";
// import { DRIFT_IDL } from "./idl";
import DRIFT_IDL from "./idl/drift.json";
import {
  percentPrecisionToPercent,
  percentToPercentPrecision,
  shortenAddress,
} from "./utils";
import {
  confirmTransactions,
  formatExplorerLink,
  sendTransactionWithResult,
} from "./rpc";
import {
  CreateVaultConfig,
  Data,
  DriftVaultsSubscriber,
  FundOverview,
  PropShopAccountEvents,
  SnackInfo,
  UpdateVaultConfig,
  WithdrawRequestTimer,
} from "./types";
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
  WithdrawUnit,
} from "@drift-labs/vaults-sdk";
import { EventEmitter } from "events";
import bs58 from "bs58";
import StrictEventEmitter from "strict-event-emitter-types";
import {
  EventEmitter as WalletAdapterEventEmitter,
  SendTransactionOptions,
  WalletAdapter,
  WalletAdapterEvents,
  WalletAdapterProps,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { Wallet, WalletContextState } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { err, ok, Result } from "neverthrow";
import {
  InstructionReturn,
  keypairToAsyncSigner,
  walletAdapterToAsyncSigner,
} from "@cosmic-lab/data-source";
import { WebSocketSubscriber } from "./websocketSubscriber";

interface DriftMarkets {
  spotMarkets: SpotMarketAccount[];
  perpMarkets: PerpMarketAccount[];
  oracleInfos: Map<string, OracleInfo>;
}

export class PropShopClient {
  private readonly connection: Connection;
  private wallet: WalletContextState;
  vaultClient: VaultClient | undefined;

  loading: boolean = false;
  private readonly disableCache: boolean = false;
  private readonly skipFetching: boolean = false;
  private readonly useProxyPrefix: boolean = false;
  dummyWallet: boolean = false;

  private eventEmitter: StrictEventEmitter<
    EventEmitter,
    PropShopAccountEvents
  > = new EventEmitter();
  private _cache: DriftVaultsSubscriber | undefined = undefined;

  private _vaults: Map<string, Vault> = new Map();
  private _vaultDepositors: Map<string, VaultDepositor> = new Map();
  private _timers: Map<string, WithdrawRequestTimer> = new Map();
  private _equities: Map<string, number> = new Map();
  private _fundOverviews: Map<string, FundOverview> = new Map();

  constructor(config: {
    wallet: WalletContextState;
    connection: Connection;
    disableCache?: boolean;
    skipFetching?: boolean;
    useProxyPrefix?: boolean;
    dummyWallet?: boolean;
  }) {
    makeAutoObservable(this);
    this.wallet = config.wallet;
    this.connection = config.connection;
    this.disableCache = config.disableCache ?? false;
    this.skipFetching = config.skipFetching ?? false;
    this.useProxyPrefix = config.useProxyPrefix ?? false;
    this.dummyWallet = config.dummyWallet ?? false;
  }

  //
  // Initialization and setup
  //

  public async updateWallet(config: {
    wallet: WalletContextState;
    dummyWallet?: boolean;
  }) {
    this.loading = true;
    console.log("updating wallet...");
    this.dummyWallet = config.dummyWallet ?? false;
    this.wallet = config.wallet;
    const now = Date.now();
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const iWallet = PropShopClient.walletAdapterToIWallet(this.wallet);
    await this.vaultClient.driftClient.updateWallet(iWallet, undefined, 0);
    console.log(`updated PropShopClient wallet in ${Date.now() - now}ms`);
    this.loading = false;
  }

  /**
   * Initialize the VaultClient.
   * Call this upon connecting a wallet.
   */
  public async initialize(): Promise<void> {
    if (!this.wallet) {
      throw new Error("Wallet not connected during initialization");
    }
    const now = Date.now();
    this.loading = true;
    const config: Omit<DriftClientConfig, "wallet"> = {
      connection: this.connection,
      accountSubscription: {
        type: "websocket",
        resubTimeoutMs: 30_000,
      },
      opts: {
        preflightCommitment: "confirmed",
        skipPreflight: false,
        commitment: "confirmed",
      },
      activeSubAccountId: 0,
      // if dummy wallet, we don't care about the user accounts
      skipLoadUsers: this.dummyWallet,
    };

    const { connection, accountSubscription, opts, activeSubAccountId } =
      config;
    const iWallet = PropShopClient.walletAdapterToIWallet(this.wallet);
    const anchorWallet = PropShopClient.walletAdapterToAnchorWallet(
      this.wallet,
    );

    const provider = new anchor.AnchorProvider(
      connection,
      anchorWallet,
      opts ?? {
        commitment: "confirmed",
      },
    );
    const driftVaultsProgram = new anchor.Program(
      DRIFT_VAULTS_IDL,
      DRIFT_VAULTS_PROGRAM_ID,
      provider,
    );
    const driftProgram = new anchor.Program(
      DRIFT_IDL as any as anchor.Idl,
      DRIFT_PROGRAM_ID,
      provider,
    );

    const preMarkets = Date.now();
    const markets = await this.driftMarkets(
      driftProgram as any as anchor.Program,
    );
    const slot = await connection.getSlot();
    // 3s
    console.log(`fetched Drift markets in ${Date.now() - preMarkets}ms`);

    const driftClient = new DriftClient({
      connection,
      wallet: iWallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId,
      accountSubscription,
      spotMarketIndexes: markets.spotMarkets.map((m) => m.marketIndex),
      perpMarketIndexes: markets.perpMarkets.map((m) => m.marketIndex),
      oracleInfos: Array.from(markets.oracleInfos.values()),
    });
    const preDriftSub = Date.now();
    // await driftClient.subscribe();
    await this.driftClientSubscribe(driftClient);
    console.log(`DriftClient subscribed in ${Date.now() - preDriftSub}ms`);

    this.vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
      cliMode: true,
    });

    this.eventEmitter.on(
      "vaultUpdate",
      async (payload: Data<PublicKey, Vault>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._vaults.get(payload.key.toString()),
        );
        if (update !== existing) {
          this._vaults.set(payload.key.toString(), payload.data);
          await this.fetchFundOverview(payload.key);
        }
      },
    );
    this.eventEmitter.on(
      "vaultDepositorUpdate",
      (payload: Data<PublicKey, VaultDepositor>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._vaultDepositors.get(payload.key.toString()),
        );
        if (update !== existing) {
          this._vaultDepositors.set(payload.key.toString(), payload.data);
        }
      },
    );

    if (!this.disableCache) {
      const preSub = Date.now();
      await this.loadCache(driftVaultsProgram);
      // 2500ms websocket, 1500ms polling
      console.log(`cache loaded in ${Date.now() - preSub}ms`);
    }

    console.log(`initialized PropShopClient in ${Date.now() - now}ms`);
    this.loading = false;
  }

  async loadCache(program: anchor.Program<DriftVaults>) {
    if (this.disableCache) {
      return;
    }
    this._cache = new WebSocketSubscriber(
      program,
      {
        filters: [
          {
            accountName: "vault",
            eventType: "vaultUpdate",
          },
          {
            accountName: "vaultDepositor",
            eventType: "vaultDepositorUpdate",
          },
        ],
      },
      this.eventEmitter,
    );
    await this._cache.subscribe();
  }

  private async driftMarkets(
    driftProgram: anchor.Program,
  ): Promise<DriftMarkets> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }

    const perpMarkets: PerpMarketAccount[] = [];
    const spotMarkets: SpotMarketAccount[] = [];
    const oracleInfos: Map<string, OracleInfo> = new Map();

    const perpMarketProgramAccounts =
      (await driftProgram.account.perpMarket.all()) as ProgramAccount<PerpMarketAccount>[];
    const spotMarketProgramAccounts =
      (await driftProgram.account.spotMarket.all()) as ProgramAccount<SpotMarketAccount>[];

    for (const perpMarketProgramAccount of perpMarketProgramAccounts) {
      const perpMarket = perpMarketProgramAccount.account as PerpMarketAccount;
      perpMarkets.push(perpMarket);
      oracleInfos.set(perpMarket.amm.oracle.toString(), {
        publicKey: perpMarket.amm.oracle,
        source: perpMarket.amm.oracleSource,
      });
    }

    for (const spotMarketProgramAccount of spotMarketProgramAccounts) {
      const spotMarket = spotMarketProgramAccount.account as SpotMarketAccount;
      spotMarkets.push(spotMarket);
      oracleInfos.set(spotMarket.oracle.toString(), {
        publicKey: spotMarket.oracle,
        source: spotMarket.oracleSource,
      });
    }

    return {
      spotMarkets,
      perpMarkets,
      oracleInfos,
    };
  }

  async shutdown(): Promise<void> {
    await this._cache?.unsubscribe();
  }

  private async driftClientSubscribe(driftClient: DriftClient) {
    const preUserSub = Date.now();
    const subUsers = await driftClient.addAndSubscribeToUsers();
    // 1.2s
    console.log(
      `DriftClient subscribed to users in ${Date.now() - preUserSub}ms`,
    );

    const preAcctSub = Date.now();
    const subAcctSub = await driftClient.accountSubscriber.subscribe();
    console.log(
      `DriftClient subscribed to accounts in ${Date.now() - preAcctSub}ms`,
    );

    let subUserStats: boolean = false;
    if (driftClient.userStats !== undefined) {
      const preStatsSub = Date.now();
      subUserStats = await driftClient.userStats.subscribe();
      console.log(
        `DriftClient subscribed to user stats in ${Date.now() - preStatsSub}ms`,
      );
    }
    driftClient.isSubscribed = subUsers && subAcctSub && subUserStats;
  }

  get publicKey(): PublicKey {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }
    return this.wallet.publicKey;
  }

  getVaultDepositorAddress(vault: PublicKey): PublicKey {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    return getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );
  }

  private async checkIfAccountExists(account: PublicKey): Promise<boolean> {
    try {
      const accountInfo = await this.connection.getAccountInfo(account);
      return accountInfo != null;
    } catch (e) {
      // Doesn't already exist
      return false;
    }
  }

  private async initUserIxs(
    subAccountId = 0,
  ): Promise<TransactionInstruction[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialize");
    }
    const ixs = [];
    const userKey = getUserAccountPublicKeySync(
      this.vaultClient.driftClient.program.programId,
      this.publicKey,
      subAccountId,
    );

    if (subAccountId === 0) {
      if (
        !(await this.checkIfAccountExists(
          this.vaultClient.driftClient.getUserStatsAccountPublicKey(),
        ))
      ) {
        ixs.push(await this.vaultClient.driftClient.getInitializeUserStatsIx());
      }
    }

    if (!(await this.checkIfAccountExists(userKey))) {
      const [_, ix] =
        await this.vaultClient.driftClient.getInitializeUserInstructions(
          subAccountId,
        );
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
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialize");
    }
    const ixs = [];
    const userKey = getUserAccountPublicKeySync(
      this.vaultClient.driftClient.program.programId,
      this.publicKey,
      subAccountId,
    );

    if (subAccountId === 0) {
      if (
        !(await this.checkIfAccountExists(
          this.vaultClient.driftClient.getUserStatsAccountPublicKey(),
        ))
      ) {
        ixs.push(await this.vaultClient.driftClient.getInitializeUserStatsIx());
      }
    }

    if (!(await this.checkIfAccountExists(userKey))) {
      const [_, ix] =
        await this.vaultClient.driftClient.getInitializeUserInstructions(
          subAccountId,
        );
      ixs.push(ix);
    }
    const sig = await this.sendTx(ixs);
    if (sig.isErr()) {
      throw new Error("Failed to initialize user");
    }
    console.debug("init user:", formatExplorerLink(sig.value));
  }

  // async initUser(): Promise<{
  //   user: User;
  //   usdcMint: PublicKey;
  //   usdcAta: PublicKey;
  // }> {
  //   if (!this.vaultClient) {
  //     throw new Error("PropShopClient not initialized");
  //   }
  //   const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(0);
  //   if (!spotMarket) {
  //     throw new Error("USDC spot market not found in DriftClient");
  //   }
  //   const usdcMint = spotMarket.mint;
  //   const usdcAta = getAssociatedTokenAddress(usdcMint, this.publicKey);
  //   const user = new User({
  //     // @ts-ignore
  //     driftClient: this.vaultClient.driftClient,
  //     userAccountPublicKey:
  //       await this.vaultClient.driftClient.getUserAccountPublicKey(),
  //   });
  //   // only init if this is the first time (not already subscribed)
  //   if (!user.isSubscribed) {
  //     await this.vaultClient.driftClient.initializeUserAccount(
  //       this.vaultClient!.driftClient.activeSubAccountId ?? 0,
  //     );
  //
  //     await user.subscribe();
  //   }
  //   return {
  //     user,
  //     usdcMint,
  //     usdcAta,
  //   };
  // }

  /**
   * Uses the active subAccountId and connected wallet as the authority.
   */
  public userInitialized(): boolean {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const user = this.vaultClient.driftClient.getUserAccount();
    return !!user;
  }

  //
  // Account cache and fetching
  //

  async spotMarketByIndex(
    driftProgram: anchor.Program,
    index: number,
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

  public vault(
    key: PublicKey,
    errorIfMissing: boolean = true,
  ): Data<PublicKey, Vault> | undefined {
    const data = this._vaults.get(key.toString());
    if (!data) {
      if (errorIfMissing) {
        throw new Error("Vault not subscribed");
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

  public vaults(filters?: {
    hasProtocol?: boolean;
    managed?: boolean;
    invested?: boolean;
  }): Data<PublicKey, Vault>[] {
    const vaults = Array.from(this._vaults.entries())
      .filter(([_key, value]) => {
        const protocolFilter = filters?.hasProtocol
          ? value.vaultProtocol !== SystemProgram.programId
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
    errorIfMissing: boolean = true,
  ): Data<PublicKey, VaultDepositor> | undefined {
    const data = this._vaultDepositors.get(key.toString());
    if (!data) {
      if (errorIfMissing) {
        throw new Error("VaultDepositor not subscribed");
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
    filterByAuthority?: boolean,
  ): Data<PublicKey, VaultDepositor>[] {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }
    const preFetch = Date.now();
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

  public async fundOverview(key: PublicKey): Promise<FundOverview | undefined> {
    return this._fundOverviews.get(key.toString());
  }

  public get fundOverviews(): FundOverview[] {
    return Array.from(this._fundOverviews.values()).sort(
      (a, b) => a.lifetimePNL / a.tvl - b.lifetimePNL / b.tvl,
    );
  }

  public async fetchVault(key: PublicKey): Promise<Vault | undefined> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    try {
      // @ts-ignore ... Vault type omits padding fields, but this is safe.
      const vault: Vault =
        await this.vaultClient.program.account.vault.fetch(key);
      return vault;
    } catch (e: any) {
      return undefined;
    }
  }

  public async fetchVaults(
    protocolsOnly?: boolean,
  ): Promise<ProgramAccount<Vault>[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const preFetch = Date.now();
    const vaults: ProgramAccount<Vault>[] =
      await this.vaultClient.program.account.vault.all();
    console.log(
      `fetched ${vaults.length} vaults from RPC in ${Date.now() - preFetch}ms`,
    );
    if (protocolsOnly) {
      return vaults.filter((v) => {
        return v.account.vaultProtocol !== SystemProgram.programId;
      });
    } else {
      return vaults;
    }
  }

  /**
   * VaultDepositors the connected wallet is the authority of.
   */
  public async fetchVaultDepositor(
    key: PublicKey,
  ): Promise<VaultDepositor | undefined> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    try {
      const vd: VaultDepositor =
        await this.vaultClient.program.account.vaultDepositor.fetch(key);
      return vd;
    } catch (e: any) {
      return undefined;
    }
  }

  /**
   * VaultDepositors the connected wallet is the authority of.
   */
  public async fetchVaultDepositors(
    filterByAuthority?: boolean,
  ): Promise<ProgramAccount<VaultDepositor>[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
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
      await this.vaultClient.program.account.vaultDepositor.all(filters);
    console.log(
      `fetched ${vds.length} vds from RPC in ${Date.now() - preFetch}ms`,
    );
    return vds;
  }

  //
  // Read only methods to aggregate data
  //

  public async vaultStats(vault: PublicKey): Promise<
    | {
        equity: number;
        netDeposits: number;
        lifetimePNL: number;
        volume30d: number;
        birth: Date;
      }
    | undefined
  > {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const acct = this.vault(vault)?.data;
    if (!acct) {
      return undefined;
    }
    const equity =
      (
        await this.vaultClient.calculateVaultEquity({
          vault: acct,
          factorUnrealizedPNL: false,
        })
      ).toNumber() / QUOTE_PRECISION.toNumber();
    const user = await this.vaultClient.getSubscribedVaultUser(acct.user);
    const userAcct = user.getUserAccount();
    const netDeposits =
      userAcct.totalDeposits.sub(userAcct.totalWithdraws).toNumber() /
      QUOTE_PRECISION.toNumber();

    const userStatsKey = getUserStatsAccountPublicKey(
      this.vaultClient.driftClient.program.programId,
      vault,
    );

    const driftProgram = this.vaultClient.driftClient.program;
    const _userStats = await driftProgram.account.userStats.fetch(userStatsKey);
    if (!_userStats) {
      throw new Error(`UserStats not found for: ${decodeName(acct.name)}`);
    }
    const userStats = _userStats as any as UserStatsAccount;
    // const total30dVolume = getUser30dRollingVolumeEstimate(userStats);
    const total30dVolume = userStats.takerVolume30D.add(
      userStats.makerVolume30D,
    );
    const volume30d = total30dVolume.toNumber() / QUOTE_PRECISION.toNumber();
    const birth = new Date(Number(acct.initTs.toNumber() * 1000));
    return {
      equity,
      netDeposits,
      lifetimePNL: equity - netDeposits,
      volume30d,
      birth,
    };
  }

  private setFundOverview(key: PublicKey, fo: FundOverview) {
    this._fundOverviews.set(key.toString(), fo);
  }

  public async fetchFundOverview(vaultKey: PublicKey): Promise<FundOverview> {
    const vault = this.vault(vaultKey)!;
    const vds = this.vaultDepositors();
    // get count of vds per vault
    const vaultVds = new Map<string, Data<PublicKey, VaultDepositor>[]>();
    for (const vd of vds) {
      const key = vd.data.vault.toString();
      const value = vaultVds.get(key);
      if (value) {
        vaultVds.set(key, [...value, vd]);
      } else {
        vaultVds.set(key, [vd]);
      }
    }

    const investors = vaultVds.get(vault.data.pubkey.toString()) ?? [];
    // const key = RedisClient.vaultPnlFromDriftKey(vault.data.pubkey);
    // const vaultPNL = await ProxyClient.performance({
    //   key,
    //   usePrefix: this.useProxyPrefix,
    // });
    // const data = vaultPNL.cumulativeSeriesPNL();
    const data: number[] = [];
    const title = decodeName(vault.data.name);
    const stats = await this.vaultStats(vault.key);
    if (!stats) {
      throw new Error(`Stats not found for vault: ${title}`);
    }
    const fo: FundOverview = {
      vault: vault.data.pubkey,
      lifetimePNL: stats.lifetimePNL,
      volume30d: stats.volume30d,
      tvl: stats.equity,
      birth: stats.birth,
      title,
      investors: investors.length,
      data,
    };
    this.setFundOverview(vault.key, fo);
    return fo;
  }

  public async fetchFundOverviews(
    protocolsOnly?: boolean,
  ): Promise<FundOverview[]> {
    const vaults = this.vaults({
      hasProtocol: protocolsOnly,
    });
    const vds = this.vaultDepositors();
    // get count of vds per vault
    const vaultVds = new Map<string, Data<PublicKey, VaultDepositor>[]>();
    for (const vd of vds) {
      const key = vd.data.vault.toString();
      const value = vaultVds.get(key);
      if (value) {
        vaultVds.set(key, [...value, vd]);
      } else {
        vaultVds.set(key, [vd]);
      }
    }
    const fundOverviews: FundOverview[] = [];
    for (const vault of vaults) {
      const investors = vaultVds.get(vault.data.pubkey.toString()) ?? [];
      // const key = RedisClient.vaultPnlFromDriftKey(vault.data.pubkey);
      // const vaultPNL = await ProxyClient.performance({
      //   key,
      //   usePrefix: this.useProxyPrefix,
      // });
      // const data = vaultPNL.cumulativeSeriesPNL();
      const data: number[] = [];
      const title = decodeName(vault.data.name);
      const stats = await this.vaultStats(vault.key);
      if (!stats) {
        throw new Error(`Stats not found for vault: ${title}`);
      }
      const fo: FundOverview = {
        vault: vault.data.pubkey,
        lifetimePNL: stats.lifetimePNL,
        volume30d: stats.volume30d,
        tvl: stats.equity,
        birth: stats.birth,
        title: decodeName(vault.data.name),
        investors: investors.length,
        data,
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
    vaultDepositors?: Data<PublicKey, VaultDepositor>[],
  ): Promise<number> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let _vaults: Data<PublicKey, Vault>[];
    if (vaults) {
      _vaults = vaults;
    } else {
      if (!this._cache) {
        throw new Error("Cache not initialized");
      }
      _vaults = this.vaults();
    }

    let _vds: Data<PublicKey, VaultDepositor>[];
    if (vaultDepositors) {
      _vds = vaultDepositors;
    } else {
      if (!this._cache) {
        throw new Error("Cache not initialized");
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
        vault = this.vault(vd.data.vault)!.data;
      }
      const amount =
        await this.vaultClient.calculateWithdrawableVaultDepositorEquityInDepositAsset(
          {
            vaultDepositor: vd.data,
            vault: vault,
          },
        );
      const balance = amount.toNumber() / QUOTE_PRECISION.toNumber();
      usdc += balance;
    }
    return usdc;
  }

  public async managerEquityInDepositAsset(
    vault: PublicKey,
  ): Promise<number | undefined> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return undefined;
    }
    const vaultTotalEquity = await this.vaultClient.calculateVaultEquity({
      vault: vaultAccount,
    });
    let vpShares = new BN(0);
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      const vpAccount =
        await this.vaultClient.program.account.vaultProtocol.fetch(
          vaultProtocol,
        );
      vpShares = vpAccount.protocolProfitAndFeeShares;
    }
    const managerShares = vaultAccount.totalShares
      .sub(vpShares)
      .sub(vaultAccount.userShares);
    const managerEquity = depositSharesToVaultAmount(
      managerShares,
      vaultAccount.totalShares,
      vaultTotalEquity,
    );

    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex,
    );
    const spotOracle = this.vaultClient.driftClient.getOracleDataForSpotMarket(
      vaultAccount.spotMarketIndex,
    );
    const spotPrecision = TEN.pow(new BN(spotMarket!.decimals));

    const usdcBN = managerEquity.mul(spotPrecision).div(spotOracle.price);
    return usdcBN.toNumber() / QUOTE_PRECISION.toNumber();
  }

  public async protocolEquityInDepositAsset(
    vault: PublicKey,
  ): Promise<number | undefined> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return undefined;
    }
    if (vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      return undefined;
    }
    const vaultTotalEquity = await this.vaultClient.calculateVaultEquity({
      vault: vaultAccount,
    });
    const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
    const vpAccount =
      await this.vaultClient.program.account.vaultProtocol.fetch(vaultProtocol);
    const equity = depositSharesToVaultAmount(
      vpAccount.protocolProfitAndFeeShares,
      vaultAccount.totalShares,
      vaultTotalEquity,
    );
    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex,
    );
    const spotOracle = this.vaultClient.driftClient.getOracleDataForSpotMarket(
      vaultAccount.spotMarketIndex,
    );
    const spotPrecision = TEN.pow(new BN(spotMarket!.decimals));

    const usdcBN = equity.mul(spotPrecision).div(spotOracle.price);
    return usdcBN.toNumber() / QUOTE_PRECISION.toNumber();
  }

  public async vaultDepositorEquityInDepositAsset(
    vdKey: PublicKey,
    vaultKey: PublicKey,
    forceFetch: boolean = false,
  ): Promise<number | undefined> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let vault: Vault | undefined = undefined;
    if (forceFetch) {
      vault = await this.fetchVault(vaultKey);
    } else {
      vault = this.vault(vaultKey)?.data;
    }
    if (!vault) {
      throw new Error(
        `Vault ${vaultKey.toString()} not found in equity calculation`,
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
        },
      );
    return amount.toNumber() / QUOTE_PRECISION.toNumber();
  }

  /**
   * Aggregate deposits (not including profits) across all vaults denominated in USDC.
   */
  public aggregateDeposits(
    vaultDepositors?: Data<PublicKey, VaultDepositor>[],
  ): number {
    let vds: Data<PublicKey, VaultDepositor>[];
    if (!vaultDepositors) {
      if (!this._cache) {
        throw new Error("Cache not initialized");
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
    vaultDepositors?: Data<PublicKey, VaultDepositor>[],
  ): Promise<number> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let vds: Data<PublicKey, VaultDepositor>[];
    if (!vaultDepositors) {
      if (!this._cache) {
        throw new Error("Cache not initialized");
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
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (!this.userInitialized()) {
      throw new Error("User not initialized");
    }
    const sig = await this.vaultClient.initializeVaultDepositor(vault);
    console.debug("join vault:", formatExplorerLink(sig));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Joined ${vaultName}`,
    };
  }

  private async createUsdcAtaIx(
    mint: PublicKey,
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
            mint,
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
    usdc: number,
  ): Promise<Result<TransactionInstruction[], SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: "error",
        message: "Vault not found in deposit instruction",
      });
    }
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [],
        writableSpotMarketIndexes: [0],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const ixs: TransactionInstruction[] = [];

    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex,
    );
    if (!spotMarket) {
      return err({
        variant: "error",
        message: "Spot market not found",
      });
    }

    const userAta = getAssociatedTokenAddressSync(
      spotMarket.mint,
      this.publicKey,
      true,
    );
    const userAtaExists = await this.connection.getAccountInfo(userAta);
    if (userAtaExists === null) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          this.publicKey,
          userAta,
          this.publicKey,
          spotMarket.mint,
        ),
      );
    }

    const vaultDepositor = this.getVaultDepositorAddress(vault);
    const vdExists = this.vaultDepositor(vaultDepositor, false)?.data;
    if (!vdExists) {
      ixs.push(
        await this.vaultClient.program.methods
          .initializeVaultDepositor()
          .accounts({
            vaultDepositor,
            vault,
            authority: this.publicKey,
          })
          .instruction(),
      );
    }

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const depositIx = await this.vaultClient.program.methods
      .deposit(amount)
      .accounts({
        vault,
        vaultDepositor,
        vaultTokenAccount: vaultAccount.tokenAccount,
        driftUserStats: vaultAccount.userStats,
        driftUser: vaultAccount.user,
        driftState: await this.vaultClient.driftClient.getStatePublicKey(),
        userTokenAccount: userAta,
        driftSpotMarketVault: spotMarket.vault,
        driftProgram: this.vaultClient.driftClient.program.programId,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();
    ixs.push(depositIx);
    return ok(ixs);
  }

  public async isProtocol(
    vault: PublicKey,
  ): Promise<Result<boolean, SnackInfo>> {
    if (!this.vaultClient) {
      return err({
        variant: "error",
        message: "PropShopClient not initialized",
      });
    }
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return err({
        variant: "error",
        message: `Vault ${vault.toString()} not found`,
      });
    }

    // check if wallet is protocol
    if (!vaultAcct.vaultProtocol.equals(SystemProgram.programId)) {
      const vpAcct =
        (await this.vaultClient.program.account.vaultProtocol.fetch(
          vaultAcct.vaultProtocol,
        )) as VaultProtocol;
      if (vpAcct.protocol.equals(this.publicKey)) {
        return ok(true);
      }
    }
    return ok(false);
  }

  public isManager(vault: PublicKey): Result<boolean, SnackInfo> {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return err({
        variant: "error",
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
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }

    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      return {
        variant: "error",
        message: "Vault not found in deposit instruction",
      };
    }

    const ixs = [];

    const userKey = getUserAccountPublicKeySync(
      this.vaultClient.driftClient.program.programId,
      this.publicKey,
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
        variant: "error",
        message: "Protocol not allowed to deposit to vault",
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
        variant: "error",
        message: "Failed to deposit",
      };
    }
    const sig = res.value;
    console.debug("deposit:", formatExplorerLink(sig));
    const vaultName = decodeName(this.vault(vault)!.data.name);
    await this.fetchVaultEquity(vault);
    await this.fetchFundOverview(vault);
    if (addUserAfter) {
      await this.vaultClient.driftClient.addUser(0, this.publicKey);
    }

    return {
      variant: "success",
      message: `Deposited to ${vaultName}`,
    };
  }

  public async requestWithdraw(
    vault: PublicKey,
    usdc: number,
  ): Promise<SnackInfo> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (!this.userInitialized()) {
      throw new Error("User not initialized");
    }
    const vaultDepositor = this.getVaultDepositorAddress(vault);
    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());

    // check if wallet is protocol
    const isProtocolResult = await this.isProtocol(vault);
    if (isProtocolResult.isErr()) {
      return isProtocolResult.error;
    }
    if (isProtocolResult.value) {
      const ix = await this.protocolRequestWithdrawIx(vault, usdc);
      if (ix.isErr()) {
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: "error",
          message: "Protocol failed to request withdraw",
        };
      }
      const sig = res.value;
      await this.fetchVaultEquity(vault);
      await this.fetchFundOverviews();

      // cache timer so frontend can track withdraw request
      await this.createWithdrawTimer(vault);

      console.debug("protocol request withdraw:", formatExplorerLink(sig));
      const vaultName = decodeName(this.vault(vault)!.data.name);
      return {
        variant: "success",
        message: `Protocol requested withdraw from ${vaultName}`,
      };
    }

    const isManagerResult = this.isManager(vault);
    if (isManagerResult.isErr()) {
      return isManagerResult.error;
    }
    if (isManagerResult.value) {
      const ix = await this.managerRequestWithdrawIx(vault, usdc);
      if (ix.isErr()) {
        return ix.error;
      }
      const res = await this.sendTx([ix.value]);
      if (res.isErr()) {
        console.error(res.error);
        return {
          variant: "error",
          message: "Manager failed to request withdraw",
        };
      }
      const sig = res.value;
      await this.fetchVaultEquity(vault);
      await this.fetchFundOverviews();

      // cache timer so frontend can track withdraw request
      await this.createWithdrawTimer(vault);

      console.debug("manager request withdraw:", formatExplorerLink(sig));
      const vaultName = decodeName(this.vault(vault)!.data.name);
      return {
        variant: "success",
        message: `Manager requested withdraw from ${vaultName}`,
      };
    }

    const sig = await this.vaultClient.requestWithdraw(
      vaultDepositor,
      amount,
      WithdrawUnit.TOKEN,
    );
    await this.fetchVaultEquity(vault);
    await this.fetchFundOverviews();

    // cache timer so frontend can track withdraw request
    await this.createWithdrawTimer(vault);

    console.debug("request withdraw:", formatExplorerLink(sig));
    const vaultName = decodeName(this.vault(vault)!.data.name);
    return {
      variant: "success",
      message: `Requested withdraw from ${vaultName}`,
    };
  }

  public async cancelWithdrawRequest(vault: PublicKey): Promise<SnackInfo> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (!this.userInitialized()) {
      throw new Error("User not initialized");
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
          variant: "error",
          message: "Protocol failed to cancel withdraw request",
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchVaultEquity(vault);
      await this.fetchFundOverviews();
      console.debug("cancel withdraw request:", formatExplorerLink(res.value));
      const vaultName = decodeName(this.vault(vault)!.data.name);
      return {
        variant: "success",
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
          variant: "error",
          message: "Manager failed to cancel withdraw request",
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchVaultEquity(vault);
      await this.fetchFundOverviews();
      console.debug(
        "manager cancel withdraw request:",
        formatExplorerLink(res.value),
      );
      const vaultName = decodeName(this.vault(vault)!.data.name);
      return {
        variant: "success",
        message: `Manager canceled withdraw request for ${vaultName}`,
      };
    }

    const sig = await this.vaultClient.cancelRequestWithdraw(vaultDepositor);
    // successful withdraw means no more withdraw request
    this.removeWithdrawTimer(vault);
    await this.fetchVaultEquity(vault);
    await this.fetchFundOverviews();
    console.debug("cancel withdraw request:", formatExplorerLink(sig));
    const vaultName = decodeName(this.vault(vault)!.data.name);
    return {
      variant: "success",
      message: `Canceled withdraw request for ${vaultName}`,
    };
  }

  public async withdraw(vault: PublicKey): Promise<SnackInfo> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (!this.userInitialized()) {
      throw new Error("User not initialized");
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
          variant: "error",
          message: "Protocol failed to withdraw",
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchVaultEquity(vault);
      await this.fetchFundOverview(vault);

      console.debug("protocol withdraw:", formatExplorerLink(res.value));
      const vaultName = decodeName(this.vault(vault)!.data.name);
      return {
        variant: "success",
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
          variant: "error",
          message: "Manager failed to withdraw",
        };
      }
      this.removeWithdrawTimer(vault);
      await this.fetchVaultEquity(vault);
      await this.fetchFundOverviews();

      console.debug("manager withdraw:", formatExplorerLink(res.value));
      const vaultName = decodeName(this.vault(vault)!.data.name);
      return {
        variant: "success",
        message: `Manager withdrew from ${vaultName}`,
      };
    }

    const sig = await this.vaultClient.withdraw(vaultDepositor);
    this.removeWithdrawTimer(vault);
    await this.fetchVaultEquity(vault);
    await this.fetchFundOverviews();

    console.debug("withdraw:", formatExplorerLink(sig));
    const vaultName = decodeName(this.vault(vault)!.data.name);
    return {
      variant: "success",
      message: `Withdrew from ${vaultName}`,
    };
  }

  //
  // Manager actions
  //

  public async createVaultWithDelegate(
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
    delegate: PublicKey,
  ): Promise<string> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // This is a workaround to make client backwards compatible.
    // VaultProtocol is optionally undefined, but the anchor type is optionally null.
    // Old clients will default to undefined which prevents old clients from having to pass in a null value.
    // Instead, we can cast to null internally.
    const _params: VaultParams = {
      ...params,
      vaultProtocol: params.vaultProtocol ? params.vaultProtocol : null,
    };

    const vault = getVaultAddressSync(
      this.vaultClient.program.programId,
      params.name,
    );
    const tokenAccount = getTokenVaultAddressSync(
      this.vaultClient.program.programId,
      vault,
    );

    const driftState = await this.vaultClient.driftClient.getStatePublicKey();
    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      params.spotMarketIndex,
    );
    if (!spotMarket) {
      throw new Error(
        `Spot market ${params.spotMarketIndex} not found on driftClient`,
      );
    }

    const userStatsKey = getUserStatsAccountPublicKey(
      this.vaultClient.driftClient.program.programId,
      vault,
    );
    const userKey = getUserAccountPublicKeySync(
      this.vaultClient.driftClient.program.programId,
      vault,
    );

    const accounts = {
      driftSpotMarket: spotMarket.pubkey,
      driftSpotMarketMint: spotMarket.mint,
      driftUserStats: userStatsKey,
      driftUser: userKey,
      driftState,
      vault,
      tokenAccount,
      driftProgram: this.vaultClient.driftClient.program.programId,
    };

    const updateDelegateIx = await this.delegateVaultIx(vault, delegate);

    if (params.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(
        getVaultAddressSync(this.vaultClient.program.programId, params.name),
      );
      const remainingAccounts: AccountMeta[] = [
        {
          pubkey: vaultProtocol,
          isSigner: false,
          isWritable: true,
        },
      ];
      return await this.vaultClient.program.methods
        .initializeVault(_params)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .postInstructions([updateDelegateIx])
        .rpc();
    } else {
      return await this.vaultClient.program.methods
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
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (params.redeemPeriod && params.redeemPeriod > ONE_DAY * 90) {
      throw new Error("Redeem period must be less than 90 days");
    }

    const profitShare = percentToPercentPrecision(
      params.percentProfitShare ?? 0,
    ).toNumber();
    const managementFee = percentToPercentPrecision(
      params.percentAnnualManagementFee ?? 0,
    );
    const minDepositAmount = new BN(
      (params.minDepositUSDC ?? 0) * QUOTE_PRECISION.toNumber(),
    );
    const permissioned = params.permissioned ?? false;
    const redeemPeriod = new BN(params.redeemPeriod ?? ONE_DAY);
    const maxTokens = new BN(
      (params.maxCapacityUSDC ?? 0) * QUOTE_PRECISION.toNumber(),
    );
    const vaultProtocolParams: VaultProtocolParams = {
      protocol: PROP_SHOP_PROTOCOL,
      // 0.5% annual fee
      protocolFee: percentToPercentPrecision(PROP_SHOP_PERCENT_ANNUAL_FEE),
      // 5% profit share
      protocolProfitShare: percentToPercentPrecision(
        PROP_SHOP_PERCENT_PROFIT_SHARE,
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

    console.debug("initialize vault:", formatExplorerLink(sig));
    const vault = getVaultAddressSync(
      this.vaultClient.program.programId,
      encodeName(params.name),
    );
    const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);

    console.log(`created vault: ${vault.toString()}`);
    await this.fetchFundOverview(vault);

    return {
      vault,
      vaultProtocol,
      snack: {
        variant: "success",
        message: `Created \"${params.name}\"`,
      },
    };
  }

  public async delegateVaultIx(
    vault: PublicKey,
    delegate: PublicKey,
  ): Promise<TransactionInstruction> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultUser = getUserAccountPublicKeySync(
      this.vaultClient.driftClient.program.programId,
      vault,
    );

    return this.vaultClient.program.methods
      .updateDelegate(delegate)
      .accounts({
        vault,
        driftUser: vaultUser,
        driftProgram: this.vaultClient.driftClient.program.programId,
      })
      .instruction();
  }

  public async delegateVault(
    vault: PublicKey,
    delegate: PublicKey,
  ): Promise<SnackInfo> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (!this.userInitialized()) {
      throw new Error("User not initialized");
    }
    const sig = await this.vaultClient.updateDelegate(vault, delegate);
    console.debug("delegate vault:", formatExplorerLink(sig));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Delegated ${vaultName} vault to ${delegate.toString()}`,
    };
  }

  public async updateVaultIx(vault: PublicKey, config: UpdateVaultConfig) {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (config.redeemPeriod && config.redeemPeriod > ONE_DAY * 90) {
      throw new Error("Redeem period must be less than 90 days");
    }

    const profitShare = percentToPercentPrecision(
      config.percentProfitShare ?? 0,
    ).toNumber();
    const managementFee = percentToPercentPrecision(
      config.percentAnnualManagementFee ?? 0,
    );
    const minDepositAmount = new BN(
      (config.minDepositUSDC ?? 0) * QUOTE_PRECISION.toNumber(),
    );
    const permissioned = config.permissioned ?? false;
    const redeemPeriod = new BN(config.redeemPeriod ?? ONE_DAY);
    const maxTokens = new BN(
      (config.maxCapacityUSDC ?? 0) * QUOTE_PRECISION.toNumber(),
    );
    const params: UpdateVaultParams = {
      redeemPeriod,
      maxTokens,
      minDepositAmount,
      managementFee,
      profitShare,
      hurdleRate: null,
      permissioned,
    };
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }

    let ix: TransactionInstruction;
    if (!vaultAcct.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      const remainingAccounts: AccountMeta[] = [
        {
          pubkey: vaultProtocol,
          isSigner: false,
          isWritable: true,
        },
      ];
      ix = await this.vaultClient.program.methods
        .updateVault(params)
        .accounts({
          vault,
          manager: this.publicKey,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
    } else {
      ix = await this.vaultClient.program.methods
        .updateVault(params)
        .accounts({
          vault,
          manager: this.publicKey,
        })
        .instruction();
    }
    return ix;
  }

  public defaultUpdateVaultConfig(vault: PublicKey) {
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }
    const percentProfitShare = percentPrecisionToPercent(vaultAcct.profitShare);
    const percentAnnualManagementFee = percentPrecisionToPercent(
      vaultAcct.managementFee.toNumber(),
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
    params: UpdateVaultConfig,
  ): Promise<SnackInfo> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }

    const ixs: TransactionInstruction[] = [];
    if (params.delegate) {
      ixs.push(await this.delegateVaultIx(vault, params.delegate));
    }
    ixs.push(await this.updateVaultIx(vault, params));

    const result = await this.sendTx(ixs);
    if (result.isErr()) {
      return {
        variant: "error",
        message: "Failed to update vault",
      };
    }
    console.debug("update vault:", formatExplorerLink(result.value));
    await this.fetchFundOverview(vault);
    const vaultAcct = this.vault(vault)?.data;
    if (!vaultAcct) {
      throw new Error(`Vault ${vault.toString()} not found`);
    }
    return {
      variant: "success",
      message: `Updated \"${decodeName(vaultAcct.name)}\"`,
    };
  }

  private async managerDepositIx(
    vault: PublicKey,
    usdc: number,
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault, true)!.data;
    if (!vaultAccount) {
      throw new Error(
        `Vault ${vault.toString()} not found during manager deposit`,
      );
    }
    const driftSpotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex,
    );
    if (!driftSpotMarket) {
      return err({
        variant: "error",
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user,
    );
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [user.getUserAccount()],
        writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    return ok(
      await this.vaultClient.program.methods
        .managerDeposit(amount)
        .accounts({
          vault,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.vaultClient.driftClient.program.programId,
            vault,
          ),
          driftProgram: this.vaultClient.driftClient.program.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.vaultClient.driftClient.program.programId,
            vault,
          ),
          driftState: await this.vaultClient.driftClient.getStatePublicKey(),
          driftSpotMarketVault: driftSpotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            driftSpotMarket.mint,
            this.publicKey,
          ),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction(),
    );
  }

  private async managerRequestWithdrawIx(
    vault: PublicKey,
    usdc: number,
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault, true)!.data;

    if (!this.publicKey.equals(vaultAccount.manager)) {
      return err({
        variant: "error",
        message: "Only the manager can request a manager withdraw",
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user,
    );
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [user.getUserAccount()],
        writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
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
        this.vaultClient.driftClient.program.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.vaultClient.driftClient.getStatePublicKey(),
    };

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const withdrawUnit = WithdrawUnit.TOKEN;
    return ok(
      await this.vaultClient.program.methods
        // @ts-ignore, 0.29.0 anchor issues..
        .managerRequestWithdraw(amount, withdrawUnit)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction(),
    );
  }

  private async managerCancelWithdrawRequestIx(
    vault: PublicKey,
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: "error",
        message: `Vault ${vault.toString()} not found during manager withdraw`,
      });
    }

    if (!this.publicKey.equals(vaultAccount.manager)) {
      return err({
        variant: "error",
        message: "Only the manager can cancel a manager withdraw request",
      });
    }

    const accounts = {
      manager: this.publicKey,
      vault,
      driftUserStats: getUserStatsAccountPublicKey(
        this.vaultClient.driftClient.program.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.vaultClient.driftClient.getStatePublicKey(),
    };

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user,
    );
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [user.getUserAccount()],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    return ok(
      await this.vaultClient.program.methods
        .mangerCancelWithdrawRequest()
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction(),
    );
  }

  private async managerWithdrawIx(
    vault: PublicKey,
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: "error",
        message: `Vault ${vault.toString()} not found during manager withdraw`,
      });
    }

    if (!this.publicKey.equals(vaultAccount.manager)) {
      return err({
        variant: "error",
        message: "Only the manager can manager withdraw",
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user,
    );
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [user.getUserAccount()],
        writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex,
    );
    if (!spotMarket) {
      return err({
        variant: "error",
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    return ok(
      await this.vaultClient.program.methods
        .managerWithdraw()
        .accounts({
          vault,
          manager: this.publicKey,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.vaultClient.driftClient.program.programId,
            vault,
          ),
          driftProgram: this.vaultClient.driftClient.program.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.vaultClient.driftClient.program.programId,
            vault,
          ),
          driftState: await this.vaultClient.driftClient.getStatePublicKey(),
          driftSpotMarketVault: spotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            spotMarket.mint,
            this.publicKey,
          ),
          driftSigner: this.vaultClient.driftClient.getStateAccount().signer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction(),
    );
  }

  //
  // Protocol actions
  //

  private async protocolRequestWithdrawIx(
    vault: PublicKey,
    usdc: number,
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: "error",
        message: `Vault ${vault.toString()} not found during protocol withdraw request`,
      });
    }

    if (vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      return err({
        variant: "error",
        message: `Protocol unable to request withdraw from non-protocol vault ${vault.toString()}`,
      });
    }

    const vpAccount =
      (await this.vaultClient.program.account.vaultProtocol.fetch(
        vaultAccount.vaultProtocol,
      )) as VaultProtocol;
    if (!this.publicKey.equals(vpAccount.protocol)) {
      return err({
        variant: "error",
        message: "Only the protocol can request a protocol withdraw",
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user,
    );
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [user.getUserAccount()],
        writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
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
        this.vaultClient.driftClient.program.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.vaultClient.driftClient.getStatePublicKey(),
    };

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const withdrawUnit = WithdrawUnit.TOKEN;
    return ok(
      await this.vaultClient.program.methods
        // @ts-ignore, 0.29.0 anchor issues..
        .managerRequestWithdraw(amount, withdrawUnit)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction(),
    );
  }

  private async protocolCancelWithdrawRequestIx(
    vault: PublicKey,
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: "error",
        message: `Vault ${vault.toString()} not found during protocol withdraw request`,
      });
    }

    if (vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      return err({
        variant: "error",
        message: `Protocol unable to cancel withdraw request from non-protocol vault ${vault.toString()}`,
      });
    }

    const accounts = {
      manager: this.publicKey,
      vault,
      driftUserStats: getUserStatsAccountPublicKey(
        this.vaultClient.driftClient.program.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.vaultClient.driftClient.getStatePublicKey(),
    };

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user,
    );
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [user.getUserAccount()],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    return ok(
      await this.vaultClient.program.methods
        .mangerCancelWithdrawRequest()
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .instruction(),
    );
  }

  private async protocolWithdrawIx(
    vault: PublicKey,
  ): Promise<Result<TransactionInstruction, SnackInfo>> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      return err({
        variant: "error",
        message: `Vault ${vault.toString()} not found during protocol withdraw request`,
      });
    }

    if (vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      return err({
        variant: "error",
        message: `Protocol unable to withdraw from non-protocol vault ${vault.toString()}`,
      });
    }

    const user = await this.vaultClient.getSubscribedVaultUser(
      vaultAccount.user,
    );
    const remainingAccounts = this.vaultClient.driftClient.getRemainingAccounts(
      {
        userAccounts: [user.getUserAccount()],
        writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
      },
    );
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex,
    );
    if (!spotMarket) {
      return err({
        variant: "error",
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    return ok(
      await this.vaultClient.program.methods
        .managerWithdraw()
        .accounts({
          vault,
          manager: this.vaultClient.driftClient.wallet.publicKey,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.vaultClient.driftClient.program.programId,
            vault,
          ),
          driftProgram: this.vaultClient.driftClient.program.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.vaultClient.driftClient.program.programId,
            vault,
          ),
          driftState: await this.vaultClient.driftClient.getStatePublicKey(),
          driftSpotMarketVault: spotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            spotMarket.mint,
            this.vaultClient.driftClient.wallet.publicKey,
          ),
          driftSigner: this.vaultClient.driftClient.getStateAccount().signer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction(),
    );
  }

  //
  // Static utils
  //

  public static keypairToWalletContextState(kp: Keypair): WalletContextState {
    const eventEmitter = new WalletAdapterEventEmitter<WalletAdapterEvents>();
    const adapterProps: WalletAdapterProps = {
      name: "DevKeypairWallet" as WalletName<"DevKeypairWallet">,
      url: "",
      icon: "",
      readyState: WalletReadyState.Installed,
      publicKey: kp.publicKey,
      connecting: false,
      connected: true,
      supportedTransactionVersions: new Set(["legacy" as TransactionVersion]),

      autoConnect(): Promise<void> {
        return Promise.resolve();
      },
      connect(): Promise<void> {
        return Promise.resolve();
      },
      disconnect(): Promise<void> {
        return Promise.resolve();
      },
      sendTransaction(
        transaction: Transaction,
        connection: Connection,
        options?: SendTransactionOptions,
      ): Promise<TransactionSignature> {
        return connection.sendTransaction(transaction, [kp], options);
      },
    };
    const adapter = {
      ...adapterProps,
      ...eventEmitter,
    } as unknown as WalletAdapter;

    const wallet: Wallet = {
      adapter,
      readyState: WalletReadyState.Installed,
    };

    const walletCtx: WalletContextState = {
      autoConnect: false,
      wallets: [wallet],
      wallet,
      publicKey: kp.publicKey,
      connecting: false,
      connected: true,
      disconnecting: false,

      select(walletName: WalletName | null) {
        return;
      },
      connect(): Promise<void> {
        return Promise.resolve();
      },
      disconnect(): Promise<void> {
        return Promise.resolve();
      },

      sendTransaction(
        transaction: Transaction,
        connection: Connection,
        options?: SendTransactionOptions,
      ): Promise<TransactionSignature> {
        return connection.sendTransaction(transaction, [kp], options);
      },

      signTransaction<T = Transaction>(transaction: T): Promise<T> {
        (transaction as Transaction).partialSign(kp);
        return Promise.resolve(transaction);
      },
      signAllTransactions<T = Transaction>(transactions: T[]): Promise<T[]> {
        for (const transaction of transactions) {
          (transaction as Transaction).partialSign(kp);
        }
        return Promise.resolve(transactions);
      },

      signMessage(message: Uint8Array): Promise<Uint8Array> {
        const tx = Transaction.from(message);
        tx.partialSign(kp);
        return Promise.resolve(tx.serializeMessage());
      },
      signIn: undefined,
    };
    return walletCtx;
  }

  public static walletAdapterToIWallet(wallet: WalletContextState): IWallet {
    if (
      !wallet.wallet ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions ||
      !wallet.publicKey
    ) {
      throw new Error("Wallet not connected");
    }
    return {
      signTransaction(tx: Transaction): Promise<Transaction> {
        return wallet.signTransaction!(tx);
      },
      signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
        return wallet.signAllTransactions!(txs);
      },
      publicKey: wallet.publicKey,
    };
  }

  public static walletAdapterToAnchorWallet(
    wallet: WalletContextState,
  ): AnchorWallet {
    if (
      !wallet.wallet ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions ||
      !wallet.publicKey
    ) {
      throw new Error("Wallet not connected");
    }
    return {
      signTransaction<T extends Transaction | VersionedTransaction>(
        tx: T,
      ): Promise<T> {
        return wallet.signTransaction!(tx);
      },
      signAllTransactions<T extends Transaction | VersionedTransaction>(
        txs: T[],
      ): Promise<T[]> {
        return wallet.signAllTransactions!(txs);
      },
      publicKey: wallet.publicKey,
    };
  }

  //
  // Utils
  //

  public clientVaultDepositor(
    vault: PublicKey,
  ): Data<PublicKey, VaultDepositor> | undefined {
    const key = this.getVaultDepositorAddress(vault);
    return this.vaultDepositor(key, false);
  }

  public withdrawTimer(vault: PublicKey): WithdrawRequestTimer | undefined {
    return this._timers.get(vault.toString());
  }

  private async createVaultDepositorWithdrawTimer(
    vault: PublicKey,
  ): Promise<void> {
    const vaultAcct = this.vault(vault)!.data;
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
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const isProtocol = (await this.isProtocol(vault)).unwrapOr(false);
    if (!isProtocol) {
      return;
    }
    // force fetch of vault and vaultDepositor accounts in case websocket is slow to update
    // await this._cache?.fetch();
    await this.fetchVault(vault);

    const vaultAcct = this.vault(vault)!.data;
    if (vaultAcct.vaultProtocol.equals(SystemProgram.programId)) {
      return;
    }
    const vpAcct = (await this.vaultClient.program.account.vaultProtocol.fetch(
      vaultAcct.vaultProtocol,
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

  public hasWithdrawRequest(vault: PublicKey): boolean {
    return !!this.withdrawTimer(vault);
  }

  printProgramLogs(error: any) {
    if (error.logs) {
      const logs = error.logs as string[];
      console.error(`Program error: ${logs}`);
    } else {
      console.error(`Program error: ${error}`);
    }
  }

  public async fetchVaultEquity(vault: PublicKey): Promise<number | undefined> {
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
      true,
    );
    if (!usdc) {
      return undefined;
    }
    console.log(`vd: ${shortenAddress(key.toString())}, equity: ${usdc}`);
    this._equities.set(vault.toString(), usdc);
    return usdc;
  }

  public vaultEquity(vault: PublicKey): number | undefined {
    return this._equities.get(vault.toString());
  }

  public async fetchWalletUSDC(): Promise<number | undefined> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(0);
    if (!spotMarket) {
      throw new Error("USDC spot market not found in DriftClient");
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
    ixs: TransactionInstruction[],
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

  public async airdropSol(): Promise<SnackInfo> {
    try {
      const sig = await this.connection.requestAirdrop(
        this.publicKey,
        LAMPORTS_PER_SOL,
      );
      await this.connection.confirmTransaction(sig);
      console.debug(`airdrop sol: ${formatExplorerLink(sig)}`);
      return {
        variant: "success",
        message: "Airdropped 1 SOL",
      };
    } catch (e: any) {
      console.error(e);
      return {
        variant: "error",
        message: e.toString(),
      };
    }
  }

  public async airdropUsdc(): Promise<SnackInfo> {
    const mintSigner = keypairToAsyncSigner(TEST_USDC_MINT);
    const mintAuthSigner = keypairToAsyncSigner(TEST_USDC_MINT_AUTHORITY);
    const funderSigner = walletAdapterToAsyncSigner(this.wallet);

    const ixs: InstructionReturn[] = [];
    // USDC has 6 decimals which happens to be the same as the QUOTE_PRECISION
    const usdcAmount = new BN(1_000).mul(QUOTE_PRECISION);

    const userUSDCAccount = getAssociatedTokenAddressSync(
      mintSigner.publicKey(),
      this.publicKey,
      true,
    );
    const userAtaExists = await this.connection.getAccountInfo(userUSDCAccount);
    if (userAtaExists === null) {
      const createAtaIx: InstructionReturn = () => {
        return Promise.resolve({
          instruction: createAssociatedTokenAccountInstruction(
            this.publicKey,
            userUSDCAccount,
            this.publicKey,
            mintSigner.publicKey(),
          ),
          signers: [funderSigner],
        });
      };
      ixs.push(createAtaIx);
    }

    const mintToUserAccountIx: InstructionReturn = () => {
      return Promise.resolve({
        instruction: createMintToInstruction(
          mintSigner.publicKey(),
          userUSDCAccount,
          mintAuthSigner.publicKey(),
          usdcAmount.toNumber(),
        ),
        signers: [mintAuthSigner],
      });
    };
    ixs.push(mintToUserAccountIx);

    try {
      const sig = await sendTransactionWithResult(
        ixs,
        funderSigner,
        this.connection,
      );
      if (sig.isErr()) {
        console.error(sig.error);
        return {
          variant: "error",
          message: "Failed to airdrop USDC",
        };
      }
      console.debug(`airdrop usdc: ${formatExplorerLink(sig.value)}`);
      return {
        variant: "success",
        message: "Airdropped 1000 USDC",
      };
    } catch (e: any) {
      console.error(e);
      return {
        variant: "error",
        message: e.toString(),
      };
    }
  }
}
