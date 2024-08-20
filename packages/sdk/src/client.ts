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
  DEFAULT_USER_NAME,
  DriftClient,
  DriftClientConfig,
  encodeName,
  getDriftStateAccountPublicKey,
  getPerpMarketPublicKey,
  getSpotMarketPublicKey,
  getTokenAmount,
  getUserAccountPublicKey,
  getUserAccountPublicKeySync,
  getUserStatsAccountPublicKey,
  IWallet,
  OracleInfo,
  PerpMarketAccount,
  PerpPosition,
  QUOTE_PRECISION,
  ReferrerInfo,
  SpotMarketAccount,
  StateAccount,
  TEN,
  unstakeSharesToAmount as depositSharesToVaultAmount,
  UserAccount,
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
import { Drift, IDL as DRIFT_IDL } from "./idl/drift";
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
  DriftAccountEvents,
  DriftSubscriber,
  DriftVaultsAccountEvents,
  DriftVaultsSubscriber,
  FundOverview,
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
import { WebsocketDriftVaultsSubscriber } from "./websocketDriftVaultsSubscriber";
import { WebsocketDriftSubscriber } from "./websocketDriftSubscriber";
import { isVariant, MarginCategory } from "@drift-labs/sdk/src/types";
import {
  AMM_RESERVE_PRECISION,
  AMM_RESERVE_PRECISION_EXP,
  FIVE_MINUTE,
  ONE,
  OPEN_ORDER_MARGIN_REQUIREMENT,
  PRICE_PRECISION,
  QUOTE_SPOT_MARKET_INDEX,
  SPOT_MARKET_WEIGHT_PRECISION,
  ZERO,
} from "@drift-labs/sdk/src/constants/numericConstants";
import {
  getWorstCaseTokenAmounts,
  isSpotPositionAvailable,
} from "@drift-labs/sdk/src/math/spotPosition";
import { calculateLiveOracleTwap } from "@drift-labs/sdk/src/math/oracles";
import { StrictOraclePrice } from "@drift-labs/sdk/src/oracles/strictOraclePrice";
import {
  calculatePositionFundingPNL,
  calculatePositionPNL,
  calculateUnrealizedAssetWeight,
  getSignedTokenAmount,
  getStrictTokenValue,
  SpotBalanceType,
} from "@drift-labs/sdk/src";
import {
  calculateAssetWeight,
  calculateLiabilityWeight,
} from "@drift-labs/sdk/src/math/spotBalance";
import { OracleClientCache } from "@drift-labs/sdk/src/oracles/oracleClientCache";
import { calculateMarketOpenBidAsk } from "@drift-labs/sdk/src/math/amm";

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

  oracleClientCache = new OracleClientCache();

  private driftVaultsEventEmitter: StrictEventEmitter<
    EventEmitter,
    DriftVaultsAccountEvents
  > = new EventEmitter();
  private driftVaultsCache: DriftVaultsSubscriber | undefined = undefined;

  private driftEventEmitter: StrictEventEmitter<
    EventEmitter,
    DriftAccountEvents
  > = new EventEmitter();
  private driftCache: DriftSubscriber | undefined = undefined;

  private _vaults: Map<string, Vault> = new Map();
  private _vaultDepositors: Map<string, VaultDepositor> = new Map();
  private _timers: Map<string, WithdrawRequestTimer> = new Map();
  private _equities: Map<string, number> = new Map();
  private _fundOverviews: Map<string, FundOverview> = new Map();
  private _users: Map<string, UserAccount> = new Map();
  private _spotMarkets: Map<string, SpotMarketAccount> = new Map();
  private _perpMarkets: Map<string, PerpMarketAccount> = new Map();

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
      DRIFT_IDL,
      DRIFT_PROGRAM_ID,
      provider,
    );

    const driftClient = new DriftClient({
      connection,
      wallet: iWallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId,
      accountSubscription,
    });

    this.vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
      cliMode: true,
    });

    if (!this.disableCache) {
      const preSub = Date.now();
      await this.loadCache(driftVaultsProgram, driftProgram);
      // 2500ms websocket, 1500ms polling
      console.log(`cache loaded in ${Date.now() - preSub}ms`);
    }

    console.log(`initialized PropShopClient in ${Date.now() - now}ms`);
    this.loading = false;
  }

  async loadCache(
    driftVaultsProgram: anchor.Program<DriftVaults>,
    driftProgram: anchor.Program<Drift>,
  ) {
    if (this.disableCache) {
      return;
    }
    //
    // DRIFT VAULTS
    //
    this.driftVaultsEventEmitter.on(
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
    this.driftVaultsEventEmitter.on(
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

    this.driftVaultsCache = new WebsocketDriftVaultsSubscriber(
      driftVaultsProgram,
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
      this.driftVaultsEventEmitter,
    );
    await this.driftVaultsCache.subscribe();

    //
    // DRIFT
    //
    this.driftEventEmitter.on(
      "userUpdate",
      async (payload: Data<PublicKey, UserAccount>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._users.get(payload.key.toString()),
        );
        if (update !== existing) {
          this._users.set(payload.key.toString(), payload.data);
          await this.fetchFundOverview(payload.key);
        }
      },
    );
    this.driftEventEmitter.on(
      "spotMarketUpdate",
      (payload: Data<PublicKey, SpotMarketAccount>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._spotMarkets.get(payload.key.toString()),
        );
        if (update !== existing) {
          this._spotMarkets.set(payload.key.toString(), payload.data);
        }
      },
    );
    this.driftEventEmitter.on(
      "perpMarketUpdate",
      (payload: Data<PublicKey, PerpMarketAccount>) => {
        const update = JSON.stringify(payload.data);
        const existing = JSON.stringify(
          this._perpMarkets.get(payload.key.toString()),
        );
        if (update !== existing) {
          this._perpMarkets.set(payload.key.toString(), payload.data);
        }
      },
    );

    this.driftCache = new WebsocketDriftSubscriber(
      driftProgram,
      {
        filters: [
          {
            accountName: "User",
            eventType: "userUpdate",
          },
          {
            accountName: "SpotMarket",
            eventType: "spotMarketUpdate",
          },
          {
            accountName: "PerpMarket",
            eventType: "perpMarketUpdate",
          },
        ],
      },
      this.driftEventEmitter,
    );
    await this.driftCache.subscribe();
  }

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
    await this.driftClient.updateWallet(iWallet, undefined, 0);
    console.log(`updated PropShopClient wallet in ${Date.now() - now}ms`);
    this.loading = false;
  }

  private async driftMarkets(
    driftProgram: anchor.Program,
  ): Promise<DriftMarkets> {
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
    await this.driftVaultsCache?.unsubscribe();
    await this.driftCache?.unsubscribe();
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
      this.driftVaultsProgram.programId,
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

  private async getInitializeUserInstructions(
    subAccountId = 0,
    name?: string,
    referrerInfo?: ReferrerInfo,
  ): Promise<[PublicKey, TransactionInstruction]> {
    const userAccountPublicKey = await getUserAccountPublicKey(
      this.driftProgram.programId,
      this.publicKey,
      subAccountId,
    );

    const remainingAccounts = new Array<AccountMeta>();
    if (referrerInfo !== undefined) {
      remainingAccounts.push({
        pubkey: referrerInfo.referrer,
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({
        pubkey: referrerInfo.referrerStats,
        isWritable: true,
        isSigner: false,
      });
    }

    const state = await this.getStateAccount();
    if (!state.whitelistMint.equals(PublicKey.default)) {
      const associatedTokenPublicKey = getAssociatedTokenAddress(
        state.whitelistMint,
        this.publicKey,
      );
      remainingAccounts.push({
        pubkey: associatedTokenPublicKey,
        isWritable: false,
        isSigner: false,
      });
    }

    if (name === undefined) {
      if (subAccountId === 0) {
        name = DEFAULT_USER_NAME;
      } else {
        name = `Subaccount ${subAccountId + 1}`;
      }
    }

    const nameBuffer = encodeName(name);
    const initializeUserAccountIx =
      this.driftProgram.instruction.initializeUser(subAccountId, nameBuffer, {
        accounts: {
          user: userAccountPublicKey,
          userStats: this.getUserStatsKey(this.publicKey),
          authority: this.publicKey,
          payer: this.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
          state: await this.getStateKey(),
        },
        remainingAccounts,
      });

    return [userAccountPublicKey, initializeUserAccountIx];
  }

  private async initUserIxs(
    subAccountId = 0,
  ): Promise<TransactionInstruction[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialize");
    }
    const ixs = [];
    const userKey = getUserAccountPublicKeySync(
      this.driftProgram.programId,
      this.publicKey,
      subAccountId,
    );

    if (subAccountId === 0) {
      if (
        !(await this.checkIfAccountExists(this.getUserStatsKey(this.publicKey)))
      ) {
        ixs.push(await this.driftClient.getInitializeUserStatsIx());
      }
    }

    if (!(await this.checkIfAccountExists(userKey))) {
      const [_, ix] = await this.getInitializeUserInstructions(subAccountId);
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
      this.driftProgram.programId,
      this.publicKey,
      subAccountId,
    );

    if (subAccountId === 0) {
      if (
        !(await this.checkIfAccountExists(this.getUserStatsKey(this.publicKey)))
      ) {
        ixs.push(await this.driftClient.getInitializeUserStatsIx());
      }
    }

    if (!(await this.checkIfAccountExists(userKey))) {
      const [_, ix] = await this.getInitializeUserInstructions(subAccountId);
      ixs.push(ix);
    }
    const sig = await this.sendTx(ixs);
    if (sig.isErr()) {
      throw new Error("Failed to initialize user");
    }
    console.debug("init user:", formatExplorerLink(sig.value));
  }

  /**
   * Uses the active subAccountId and connected wallet as the authority.
   */
  public userInitialized(): boolean {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const user = this.getUserAccount(this.publicKey, 0);
    return !!user;
  }

  //
  // Account cache and fetching
  //

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
    if (!this.vaultClient || !this.driftVaultsCache) {
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
        await this.driftVaultsProgram.account.vault.fetch(key);
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
      await this.driftVaultsProgram.account.vault.all();
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
        await this.driftVaultsProgram.account.vaultDepositor.fetch(key);
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
      await this.driftVaultsProgram.account.vaultDepositor.all(filters);
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
    const userAccount = await this.getUserAccountByKey(acct.user);
    const netDeposits =
      userAccount.totalDeposits.sub(userAccount.totalWithdraws).toNumber() /
      QUOTE_PRECISION.toNumber();

    const userStatsKey = getUserStatsAccountPublicKey(
      this.driftProgram.programId,
      vault,
    );

    const _userStats =
      await this.driftProgram.account.UserStats.fetch(userStatsKey);
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
      if (!this.driftVaultsCache) {
        throw new Error("Cache not initialized");
      }
      _vaults = this.vaults();
    }

    let _vds: Data<PublicKey, VaultDepositor>[];
    if (vaultDepositors) {
      _vds = vaultDepositors;
    } else {
      if (!this.driftVaultsCache) {
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
        await this.driftVaultsProgram.account.vaultProtocol.fetch(
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

    const spotMarket = await this.getSpotMarket(vaultAccount.spotMarketIndex);
    await this.addSpotMarketToDriftClient(spotMarket);
    const spotOracle = this.driftClient.getOracleDataForSpotMarket(
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
      await this.driftVaultsProgram.account.vaultProtocol.fetch(vaultProtocol);
    const equity = depositSharesToVaultAmount(
      vpAccount.protocolProfitAndFeeShares,
      vaultAccount.totalShares,
      vaultTotalEquity,
    );
    const spotMarket = await this.getSpotMarket(vaultAccount.spotMarketIndex);
    await this.addSpotMarketToDriftClient(spotMarket);
    const spotOracle = this.driftClient.getOracleDataForSpotMarket(
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
    let vault: Vault | undefined;
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
      if (!this.driftVaultsCache) {
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
      if (!this.driftVaultsCache) {
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
      await this.driftVaultsProgram.account.vault.fetch(vault);
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
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const ixs: TransactionInstruction[] = [];

    const spotMarket = await this.getSpotMarket(vaultAccount.spotMarketIndex);
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
        await this.driftVaultsProgram.methods
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
    const depositIx = await this.driftVaultsProgram.methods
      .deposit(amount)
      .accounts({
        vault,
        vaultDepositor,
        vaultTokenAccount: vaultAccount.tokenAccount,
        driftUserStats: vaultAccount.userStats,
        driftUser: vaultAccount.user,
        driftState: await this.getStateKey(),
        userTokenAccount: userAta,
        driftSpotMarketVault: spotMarket.vault,
        driftProgram: this.driftProgram.programId,
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
      const vpAcct = (await this.driftVaultsProgram.account.vaultProtocol.fetch(
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
      this.driftProgram.programId,
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
      await this.driftClient.addUser(0, this.publicKey);
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
      this.driftVaultsProgram.programId,
      params.name,
    );
    const tokenAccount = getTokenVaultAddressSync(
      this.driftVaultsProgram.programId,
      vault,
    );

    const driftState = await this.getStateKey();
    const spotMarket = await this.getSpotMarket(params.spotMarketIndex);
    if (!spotMarket) {
      throw new Error(
        `Spot market ${params.spotMarketIndex} not found on driftClient`,
      );
    }

    const userStatsKey = getUserStatsAccountPublicKey(
      this.driftProgram.programId,
      vault,
    );
    const userKey = getUserAccountPublicKeySync(
      this.driftProgram.programId,
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
      driftProgram: this.driftProgram.programId,
    };

    const updateDelegateIx = await this.delegateVaultIx(vault, delegate);

    if (params.vaultProtocol) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(
        getVaultAddressSync(this.driftVaultsProgram.programId, params.name),
      );
      const remainingAccounts: AccountMeta[] = [
        {
          pubkey: vaultProtocol,
          isSigner: false,
          isWritable: true,
        },
      ];
      return await this.driftVaultsProgram.methods
        .initializeVault(_params)
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .postInstructions([updateDelegateIx])
        .rpc();
    } else {
      return await this.driftVaultsProgram.methods
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
      this.driftVaultsProgram.programId,
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
      this.driftProgram.programId,
      vault,
    );

    return this.driftVaultsProgram.methods
      .updateDelegate(delegate)
      .accounts({
        vault,
        driftUser: vaultUser,
        driftProgram: this.driftProgram.programId,
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
      await this.driftVaultsProgram.account.vault.fetch(vault);
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
      ix = await this.driftVaultsProgram.methods
        .updateVault(params)
        .accounts({
          vault,
          manager: this.publicKey,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
    } else {
      ix = await this.driftVaultsProgram.methods
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
    const driftSpotMarket = await this.getSpotMarket(
      vaultAccount.spotMarketIndex,
    );
    if (!driftSpotMarket) {
      return err({
        variant: "error",
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    const userAccount = await this.getUserAccountByKey(vaultAccount.user);
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [userAccount],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
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
      await this.driftVaultsProgram.methods
        .managerDeposit(amount)
        .accounts({
          vault,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.driftProgram.programId,
            vault,
          ),
          driftProgram: this.driftProgram.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.driftProgram.programId,
            vault,
          ),
          driftState: await this.getStateKey(),
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

    const userAccount = await this.getUserAccountByKey(vaultAccount.user);
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [userAccount],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
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
        this.driftProgram.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.getStateKey(),
    };

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const withdrawUnit = WithdrawUnit.TOKEN;
    return ok(
      await this.driftVaultsProgram.methods
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
        this.driftProgram.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.getStateKey(),
    };

    const userAccount = await this.getUserAccountByKey(vaultAccount.user);
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [userAccount],
    });
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    return ok(
      await this.driftVaultsProgram.methods
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

    const userAccount = await this.getUserAccountByKey(vaultAccount.user);
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [userAccount],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    const spotMarket = await this.getSpotMarket(vaultAccount.spotMarketIndex);
    if (!spotMarket) {
      return err({
        variant: "error",
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    return ok(
      await this.driftVaultsProgram.methods
        .managerWithdraw()
        .accounts({
          vault,
          manager: this.publicKey,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.driftProgram.programId,
            vault,
          ),
          driftProgram: this.driftProgram.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.driftProgram.programId,
            vault,
          ),
          driftState: await this.getStateKey(),
          driftSpotMarketVault: spotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            spotMarket.mint,
            this.publicKey,
          ),
          driftSigner: (await this.getStateAccount()).signer,
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
      (await this.driftVaultsProgram.account.vaultProtocol.fetch(
        vaultAccount.vaultProtocol,
      )) as VaultProtocol;
    if (!this.publicKey.equals(vpAccount.protocol)) {
      return err({
        variant: "error",
        message: "Only the protocol can request a protocol withdraw",
      });
    }

    const userAccount = await this.getUserAccountByKey(vaultAccount.user);
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [userAccount],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
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
        this.driftProgram.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.getStateKey(),
    };

    const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
    const withdrawUnit = WithdrawUnit.TOKEN;
    return ok(
      await this.driftVaultsProgram.methods
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
        this.driftProgram.programId,
        vault,
      ),
      driftUser: vaultAccount.user,
      driftState: await this.getStateKey(),
    };

    const userAccount = await this.getUserAccountByKey(vaultAccount.user);
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [userAccount],
    });
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    return ok(
      await this.driftVaultsProgram.methods
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

    const spotMarket = await this.getSpotMarket(vaultAccount.spotMarketIndex);
    await this.addSpotMarketToDriftClient(spotMarket);
    const userAccount = await this.getUserAccountByKey(vaultAccount.user);
    // todo: maybe this needs to be manual
    const remainingAccounts = this.driftClient.getRemainingAccounts({
      userAccounts: [userAccount],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex],
    });
    if (!vaultAccount.vaultProtocol.equals(SystemProgram.programId)) {
      const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
      remainingAccounts.push({
        pubkey: vaultProtocol,
        isSigner: false,
        isWritable: true,
      });
    }

    if (!spotMarket) {
      return err({
        variant: "error",
        message: `Spot market ${vaultAccount.spotMarketIndex} not found`,
      });
    }

    return ok(
      await this.driftVaultsProgram.methods
        .managerWithdraw()
        .accounts({
          vault,
          manager: this.publicKey,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: await getUserAccountPublicKey(
            this.driftProgram.programId,
            vault,
          ),
          driftProgram: this.driftProgram.programId,
          driftUserStats: getUserStatsAccountPublicKey(
            this.driftProgram.programId,
            vault,
          ),
          driftState: await this.getStateKey(),
          driftSpotMarketVault: spotMarket.vault,
          userTokenAccount: getAssociatedTokenAddressSync(
            spotMarket.mint,
            this.publicKey,
          ),
          driftSigner: (await this.getStateAccount()).signer,
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

    return {
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
    } as WalletContextState;
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
    // await this.driftVaultsCache?.fetch();
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
    await this.fetchVault(vault);

    const vaultAcct = this.vault(vault)!.data;
    if (vaultAcct.vaultProtocol.equals(SystemProgram.programId)) {
      return;
    }
    const vpAcct = (await this.driftVaultsProgram.account.vaultProtocol.fetch(
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
    const spotMarket = await this.getSpotMarket(0);
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

  public get driftVaultsProgram(): anchor.Program<DriftVaults> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    return this.vaultClient.program as any as anchor.Program<DriftVaults>;
  }

  public get driftProgram(): anchor.Program<Drift> {
    return this.driftClient.program as any as anchor.Program<Drift>;
  }

  public get driftClient(): DriftClient {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore
    return this.vaultClient.driftClient;
  }

  public async getStateKey(): Promise<PublicKey> {
    return await getDriftStateAccountPublicKey(this.driftProgram.programId);
  }

  public async getStateAccount(): Promise<StateAccount> {
    const key = await getDriftStateAccountPublicKey(
      this.driftProgram.programId,
    );
    return (await this.driftProgram.account.State.fetch(
      key,
    )) as any as StateAccount;
  }

  public async getUserAccountByKey(key: PublicKey): Promise<UserAccount> {
    return (await this.driftProgram.account.User.fetch(
      key,
    )) as any as UserAccount;
  }

  public async getUserAccount(
    authority: PublicKey,
    subAccountId = 0,
  ): Promise<UserAccount> {
    const key = await getUserAccountPublicKey(
      this.driftProgram.programId,
      authority,
      subAccountId,
    );
    return (await this.driftProgram.account.User.fetch(
      key,
    )) as any as UserAccount;
  }

  public async getUserStatsAccount(
    authority: PublicKey,
  ): Promise<UserStatsAccount> {
    const key = getUserStatsAccountPublicKey(
      this.driftProgram.programId,
      authority,
    );
    return (await this.driftProgram.account.UserStats.fetch(
      key,
    )) as any as UserStatsAccount;
  }

  public getUserStatsKey(authority: PublicKey): PublicKey {
    return getUserStatsAccountPublicKey(this.driftProgram.programId, authority);
  }

  public async getSpotMarket(marketIndex: number): Promise<SpotMarketAccount> {
    const key = await getSpotMarketPublicKey(
      this.driftProgram.programId,
      marketIndex,
    );
    return (await this.driftProgram.account.SpotMarket.fetch(
      key,
    )) as any as SpotMarketAccount;
  }

  private async addSpotMarketToDriftClient(spotMarket: SpotMarketAccount) {
    await this.driftClient.accountSubscriber.addSpotMarket(
      spotMarket.marketIndex,
    );
    await this.driftClient.accountSubscriber.addOracle({
      publicKey: spotMarket.oracle,
      source: spotMarket.oracleSource,
    });
  }

  public async getPerpMarket(marketIndex: number): Promise<PerpMarketAccount> {
    const key = await getPerpMarketPublicKey(
      this.driftProgram.programId,
      marketIndex,
    );
    return (await this.driftProgram.account.PerpMarket.fetch(
      key,
    )) as any as PerpMarketAccount;
  }

  private async addPerpMarketToDriftClient(perpMarket: PerpMarketAccount) {
    await this.driftClient.accountSubscriber.addPerpMarket(
      perpMarket.marketIndex,
    );
    await this.driftClient.accountSubscriber.addOracle({
      publicKey: perpMarket.amm.oracle,
      source: perpMarket.amm.oracleSource,
    });
  }

  private async calculateVaultEquity(params: {
    address?: PublicKey;
    vault?: Vault;
    factorUnrealizedPNL?: boolean;
  }): Promise<BN> {
    try {
      if (!this.vaultClient) {
        throw new Error("PropShopClient not initialized");
      }
      // defaults to true if undefined
      let factorUnrealizedPNL = true;
      if (params.factorUnrealizedPNL !== undefined) {
        factorUnrealizedPNL = params.factorUnrealizedPNL;
      }

      let vaultAccount: Vault;
      if (params.address !== undefined) {
        // @ts-ignore
        vaultAccount = await this.program.account.vault.fetch(params.address);
      } else if (params.vault !== undefined) {
        vaultAccount = params.vault;
      } else {
        throw new Error("Must supply address or vault");
      }

      const user = await this.vaultClient.getSubscribedVaultUser(
        vaultAccount.user,
      );

      // @ts-ignore
      const userAccount: UserAccount = user.getUserAccount();
      const netSpotValue = await this.getNetSpotMarketValue(userAccount);

      if (factorUnrealizedPNL) {
        const unrealizedPnl = user.getUnrealizedPNL(true, undefined, undefined);
        return netSpotValue.add(unrealizedPnl);
      } else {
        return netSpotValue;
      }
    } catch (err) {
      console.error("VaultClient ~ err:", err);
      return ZERO;
    }
  }

  private getActivePerpPositions(userKey: PublicKey): PerpPosition[] {
    const user = this._users.get(userKey.toString());
    if (!user) {
      throw new Error("User not cached");
    }
    return user.perpPositions.filter(
      (pos) =>
        !pos.baseAssetAmount.eq(ZERO) ||
        !pos.quoteAssetAmount.eq(ZERO) ||
        !(pos.openOrders == 0) ||
        !pos.lpShares.eq(ZERO),
    );
  }

  private async getOraclePriceData(oracle: OracleInfo) {
    const oracleClient = this.oracleClientCache.get(
      oracle.source,
      this.connection,
      this.driftProgram as any as anchor.Program,
    );
    if (!oracleClient) {
      throw new Error("OracleClient not initialized");
    }
    const acct = await this.connection.getAccountInfo(oracle.publicKey);
    if (!acct) {
      throw new Error(
        `Oracle account not found for ${oracle.publicKey.toString()}`,
      );
    }
    return oracleClient.getOraclePriceDataFromBuffer(acct.data);
  }

  private async getUnrealizedPNL(
    userKey: PublicKey,
    withFunding?: boolean,
    marketIndex?: number,
    withWeightMarginCategory?: MarginCategory,
    strict = false,
  ): BN {
    return this.getActivePerpPositions(userKey)
      .filter((pos) =>
        marketIndex !== undefined ? pos.marketIndex === marketIndex : true,
      )
      .reduce(async (unrealizedPnl, perpPosition) => {
        const market = (await this.getPerpMarket(perpPosition.marketIndex))!;
        const oraclePriceData = await this.getOraclePriceData({
          publicKey: market.amm.oracle,
          source: market.amm.oracleSource,
        });

        const quoteSpotMarket = (await this.getSpotMarket(
          market.quoteSpotMarketIndex,
        ))!;
        const quoteOraclePriceData = await this.getOraclePriceData({
          publicKey: quoteSpotMarket.oracle,
          source: quoteSpotMarket.oracleSource,
        });

        if (perpPosition.lpShares.gt(ZERO)) {
          perpPosition = this.getPerpPositionWithLPSettle(
            perpPosition.marketIndex,
            undefined,
            !!withWeightMarginCategory,
          )[0];
        }

        let positionUnrealizedPnl = calculatePositionPNL(
          market,
          perpPosition,
          withFunding,
          oraclePriceData,
        );

        let quotePrice;
        if (strict && positionUnrealizedPnl.gt(ZERO)) {
          quotePrice = BN.min(
            quoteOraclePriceData.price,
            quoteSpotMarket.historicalOracleData.lastOraclePriceTwap5Min,
          );
        } else if (strict && positionUnrealizedPnl.lt(ZERO)) {
          quotePrice = BN.max(
            quoteOraclePriceData.price,
            quoteSpotMarket.historicalOracleData.lastOraclePriceTwap5Min,
          );
        } else {
          quotePrice = quoteOraclePriceData.price;
        }

        positionUnrealizedPnl = positionUnrealizedPnl
          .mul(quotePrice)
          .div(PRICE_PRECISION);

        if (withWeightMarginCategory !== undefined) {
          if (positionUnrealizedPnl.gt(ZERO)) {
            positionUnrealizedPnl = positionUnrealizedPnl
              .mul(
                calculateUnrealizedAssetWeight(
                  market,
                  quoteSpotMarket,
                  positionUnrealizedPnl,
                  withWeightMarginCategory,
                  oraclePriceData,
                ),
              )
              .div(new BN(SPOT_MARKET_WEIGHT_PRECISION));
          }
        }

        return unrealizedPnl.add(positionUnrealizedPnl);
      }, ZERO);
  }

  private async getNetSpotMarketValue(
    userAccount: UserAccount,
    marketIndex?: number,
    marginCategory?: MarginCategory,
    liquidationBuffer?: BN,
    includeOpenOrders?: boolean,
    strict = false,
    now?: BN,
  ): Promise<BN> {
    marginCategory = marginCategory || "Initial";
    now = now || new BN(new Date().getTime() / 1000);
    let netQuoteValue = ZERO;
    let totalAssetValue = ZERO;
    let totalLiabilityValue = ZERO;
    for (const spotPosition of userAccount.spotPositions) {
      const countForBase =
        marketIndex === undefined || spotPosition.marketIndex === marketIndex;

      const countForQuote =
        marketIndex === undefined ||
        marketIndex === QUOTE_SPOT_MARKET_INDEX ||
        (includeOpenOrders && spotPosition.openOrders !== 0);
      if (
        isSpotPositionAvailable(spotPosition) ||
        (!countForBase && !countForQuote)
      ) {
        continue;
      }

      const spotMarketAccount = await this.getSpotMarket(
        spotPosition.marketIndex,
      );
      await this.addSpotMarketToDriftClient(spotMarketAccount);
      const oraclePriceData = this.driftClient.getOracleDataForSpotMarket(
        spotPosition.marketIndex,
      );

      let twap5min;
      if (strict) {
        twap5min = calculateLiveOracleTwap(
          spotMarketAccount.historicalOracleData,
          oraclePriceData,
          now,
          FIVE_MINUTE, // 5MIN
        );
      }
      const strictOraclePrice = new StrictOraclePrice(
        oraclePriceData.price,
        twap5min,
      );

      if (
        spotPosition.marketIndex === QUOTE_SPOT_MARKET_INDEX &&
        countForQuote
      ) {
        const tokenAmount = getSignedTokenAmount(
          getTokenAmount(
            spotPosition.scaledBalance,
            spotMarketAccount,
            spotPosition.balanceType,
          ),
          spotPosition.balanceType,
        );

        if (isVariant(spotPosition.balanceType, "borrow")) {
          const weightedTokenValue = this.getSpotLiabilityValue(
            tokenAmount,
            strictOraclePrice,
            spotMarketAccount,
            userAccount,
            marginCategory,
            liquidationBuffer,
          ).abs();

          netQuoteValue = netQuoteValue.sub(weightedTokenValue);
        } else {
          const weightedTokenValue = this.getSpotAssetValue(
            tokenAmount,
            strictOraclePrice,
            spotMarketAccount,
            userAccount,
            marginCategory,
          );

          netQuoteValue = netQuoteValue.add(weightedTokenValue);
        }

        continue;
      }

      if (!includeOpenOrders && countForBase) {
        if (isVariant(spotPosition.balanceType, "borrow")) {
          const tokenAmount = getSignedTokenAmount(
            getTokenAmount(
              spotPosition.scaledBalance,
              spotMarketAccount,
              spotPosition.balanceType,
            ),
            SpotBalanceType.BORROW,
          );
          const liabilityValue = this.getSpotLiabilityValue(
            tokenAmount,
            strictOraclePrice,
            spotMarketAccount,
            userAccount,
            marginCategory,
            liquidationBuffer,
          ).abs();
          totalLiabilityValue = totalLiabilityValue.add(liabilityValue);

          continue;
        } else {
          const tokenAmount = getTokenAmount(
            spotPosition.scaledBalance,
            spotMarketAccount,
            spotPosition.balanceType,
          );
          const assetValue = this.getSpotAssetValue(
            tokenAmount,
            strictOraclePrice,
            spotMarketAccount,
            userAccount,
            marginCategory,
          );
          totalAssetValue = totalAssetValue.add(assetValue);

          continue;
        }
      }

      const {
        tokenAmount: worstCaseTokenAmount,
        ordersValue: worstCaseQuoteTokenAmount,
      } = getWorstCaseTokenAmounts(
        spotPosition,
        spotMarketAccount,
        strictOraclePrice,
        marginCategory,
        userAccount.maxMarginRatio,
      );

      if (worstCaseTokenAmount.gt(ZERO) && countForBase) {
        const baseAssetValue = this.getSpotAssetValue(
          worstCaseTokenAmount,
          strictOraclePrice,
          spotMarketAccount,
          userAccount,
          marginCategory,
        );

        totalAssetValue = totalAssetValue.add(baseAssetValue);
      }

      if (worstCaseTokenAmount.lt(ZERO) && countForBase) {
        const baseLiabilityValue = this.getSpotLiabilityValue(
          worstCaseTokenAmount,
          strictOraclePrice,
          spotMarketAccount,
          userAccount,
          marginCategory,
          liquidationBuffer,
        ).abs();

        totalLiabilityValue = totalLiabilityValue.add(baseLiabilityValue);
      }

      if (worstCaseQuoteTokenAmount.gt(ZERO) && countForQuote) {
        netQuoteValue = netQuoteValue.add(worstCaseQuoteTokenAmount);
      }

      if (worstCaseQuoteTokenAmount.lt(ZERO) && countForQuote) {
        let weight = SPOT_MARKET_WEIGHT_PRECISION;
        if (marginCategory === "Initial") {
          weight = BN.max(weight, new BN(userAccount.maxMarginRatio));
        }

        const weightedTokenValue = worstCaseQuoteTokenAmount
          .abs()
          .mul(weight)
          .div(SPOT_MARKET_WEIGHT_PRECISION);

        netQuoteValue = netQuoteValue.sub(weightedTokenValue);
      }

      totalLiabilityValue = totalLiabilityValue.add(
        new BN(spotPosition.openOrders).mul(OPEN_ORDER_MARGIN_REQUIREMENT),
      );
    }

    if (marketIndex === undefined || marketIndex === QUOTE_SPOT_MARKET_INDEX) {
      if (netQuoteValue.gt(ZERO)) {
        totalAssetValue = totalAssetValue.add(netQuoteValue);
      } else {
        totalLiabilityValue = totalLiabilityValue.add(netQuoteValue.abs());
      }
    }

    return totalAssetValue.sub(totalLiabilityValue);
  }

  private getSpotLiabilityValue(
    tokenAmount: BN,
    strictOraclePrice: StrictOraclePrice,
    spotMarketAccount: SpotMarketAccount,
    userAccount: UserAccount,
    marginCategory?: MarginCategory,
    liquidationBuffer?: BN,
  ): BN {
    let liabilityValue = getStrictTokenValue(
      tokenAmount,
      spotMarketAccount.decimals,
      strictOraclePrice,
    );

    if (marginCategory !== undefined) {
      let weight = calculateLiabilityWeight(
        tokenAmount,
        spotMarketAccount,
        marginCategory,
      );

      if (
        marginCategory === "Initial" &&
        spotMarketAccount.marketIndex !== QUOTE_SPOT_MARKET_INDEX
      ) {
        weight = BN.max(
          weight,
          SPOT_MARKET_WEIGHT_PRECISION.addn(userAccount.maxMarginRatio),
        );
      }

      if (liquidationBuffer !== undefined) {
        weight = weight.add(liquidationBuffer);
      }

      liabilityValue = liabilityValue
        .mul(weight)
        .div(SPOT_MARKET_WEIGHT_PRECISION);
    }

    return liabilityValue;
  }

  private getSpotAssetValue(
    tokenAmount: BN,
    strictOraclePrice: StrictOraclePrice,
    spotMarketAccount: SpotMarketAccount,
    userAccount: UserAccount,
    marginCategory?: MarginCategory,
  ): BN {
    let assetValue = getStrictTokenValue(
      tokenAmount,
      spotMarketAccount.decimals,
      strictOraclePrice,
    );

    if (marginCategory !== undefined) {
      let weight = calculateAssetWeight(
        tokenAmount,
        strictOraclePrice.current,
        spotMarketAccount,
        marginCategory,
      );

      if (
        marginCategory === "Initial" &&
        spotMarketAccount.marketIndex !== QUOTE_SPOT_MARKET_INDEX
      ) {
        const userCustomAssetWeight = BN.max(
          ZERO,
          SPOT_MARKET_WEIGHT_PRECISION.subn(userAccount.maxMarginRatio),
        );
        weight = BN.min(weight, userCustomAssetWeight);
      }

      assetValue = assetValue.mul(weight).div(SPOT_MARKET_WEIGHT_PRECISION);
    }

    return assetValue;
  }

  private async getPerpPositionWithLPSettle(
    marketIndex: number,
    originalPosition?: PerpPosition,
    burnLpShares = false,
    includeRemainderInBaseAmount = false,
  ): [PerpPosition, BN, BN] {
    originalPosition =
      originalPosition ??
      this.getPerpPosition(marketIndex) ??
      this.getEmptyPosition(marketIndex);

    if (originalPosition.lpShares.eq(ZERO)) {
      return [originalPosition, ZERO, ZERO];
    }

    const position = this.getClonedPosition(originalPosition);
    const market = this.driftClient.getPerpMarketAccount(position.marketIndex);

    if (market.amm.perLpBase != position.perLpBase) {
      // perLpBase = 1 => per 10 LP shares, perLpBase = -1 => per 0.1 LP shares
      const expoDiff = market.amm.perLpBase - position.perLpBase;
      const marketPerLpRebaseScalar = new BN(10 ** Math.abs(expoDiff));

      if (expoDiff > 0) {
        position.lastBaseAssetAmountPerLp =
          position.lastBaseAssetAmountPerLp.mul(marketPerLpRebaseScalar);
        position.lastQuoteAssetAmountPerLp =
          position.lastQuoteAssetAmountPerLp.mul(marketPerLpRebaseScalar);
      } else {
        position.lastBaseAssetAmountPerLp =
          position.lastBaseAssetAmountPerLp.div(marketPerLpRebaseScalar);
        position.lastQuoteAssetAmountPerLp =
          position.lastQuoteAssetAmountPerLp.div(marketPerLpRebaseScalar);
      }

      position.perLpBase = position.perLpBase + expoDiff;
    }

    const nShares = position.lpShares;

    // incorp unsettled funding on pre settled position
    const quoteFundingPnl = calculatePositionFundingPNL(market, position);

    let baseUnit = AMM_RESERVE_PRECISION;
    if (market.amm.perLpBase == position.perLpBase) {
      if (
        position.perLpBase >= 0 &&
        position.perLpBase <= AMM_RESERVE_PRECISION_EXP.toNumber()
      ) {
        const marketPerLpRebase = new BN(10 ** market.amm.perLpBase);
        baseUnit = baseUnit.mul(marketPerLpRebase);
      } else if (
        position.perLpBase < 0 &&
        position.perLpBase >= -AMM_RESERVE_PRECISION_EXP.toNumber()
      ) {
        const marketPerLpRebase = new BN(10 ** Math.abs(market.amm.perLpBase));
        baseUnit = baseUnit.div(marketPerLpRebase);
      } else {
        throw "cannot calc";
      }
    } else {
      throw "market.amm.perLpBase != position.perLpBase";
    }

    const deltaBaa = market.amm.baseAssetAmountPerLp
      .sub(position.lastBaseAssetAmountPerLp)
      .mul(nShares)
      .div(baseUnit);
    const deltaQaa = market.amm.quoteAssetAmountPerLp
      .sub(position.lastQuoteAssetAmountPerLp)
      .mul(nShares)
      .div(baseUnit);

    function sign(v: BN) {
      return v.isNeg() ? new BN(-1) : new BN(1);
    }

    function standardize(amount: BN, stepSize: BN) {
      const remainder = amount.abs().mod(stepSize).mul(sign(amount));
      const standardizedAmount = amount.sub(remainder);
      return [standardizedAmount, remainder];
    }

    const [standardizedBaa, remainderBaa] = standardize(
      deltaBaa,
      market.amm.orderStepSize,
    );

    position.remainderBaseAssetAmount += remainderBaa.toNumber();

    if (
      Math.abs(position.remainderBaseAssetAmount) >
      market.amm.orderStepSize.toNumber()
    ) {
      const [newStandardizedBaa, newRemainderBaa] = standardize(
        new BN(position.remainderBaseAssetAmount),
        market.amm.orderStepSize,
      );
      position.baseAssetAmount =
        position.baseAssetAmount.add(newStandardizedBaa);
      position.remainderBaseAssetAmount = newRemainderBaa.toNumber();
    }

    let dustBaseAssetValue = ZERO;
    if (burnLpShares && position.remainderBaseAssetAmount != 0) {
      const oraclePriceData = this.driftClient.getOracleDataForPerpMarket(
        position.marketIndex,
      );
      dustBaseAssetValue = new BN(Math.abs(position.remainderBaseAssetAmount))
        .mul(oraclePriceData.price)
        .div(AMM_RESERVE_PRECISION)
        .add(ONE);
    }

    let updateType;
    if (position.baseAssetAmount.eq(ZERO)) {
      updateType = "open";
    } else if (sign(position.baseAssetAmount).eq(sign(deltaBaa))) {
      updateType = "increase";
    } else if (position.baseAssetAmount.abs().gt(deltaBaa.abs())) {
      updateType = "reduce";
    } else if (position.baseAssetAmount.abs().eq(deltaBaa.abs())) {
      updateType = "close";
    } else {
      updateType = "flip";
    }

    let newQuoteEntry;
    let pnl;
    if (updateType == "open" || updateType == "increase") {
      newQuoteEntry = position.quoteEntryAmount.add(deltaQaa);
      pnl = ZERO;
    } else if (updateType == "reduce" || updateType == "close") {
      newQuoteEntry = position.quoteEntryAmount.sub(
        position.quoteEntryAmount
          .mul(deltaBaa.abs())
          .div(position.baseAssetAmount.abs()),
      );
      pnl = position.quoteEntryAmount.sub(newQuoteEntry).add(deltaQaa);
    } else {
      newQuoteEntry = deltaQaa.sub(
        deltaQaa.mul(position.baseAssetAmount.abs()).div(deltaBaa.abs()),
      );
      pnl = position.quoteEntryAmount.add(deltaQaa.sub(newQuoteEntry));
    }
    position.quoteEntryAmount = newQuoteEntry;
    position.baseAssetAmount = position.baseAssetAmount.add(standardizedBaa);
    position.quoteAssetAmount = position.quoteAssetAmount
      .add(deltaQaa)
      .add(quoteFundingPnl)
      .sub(dustBaseAssetValue);
    position.quoteBreakEvenAmount = position.quoteBreakEvenAmount
      .add(deltaQaa)
      .add(quoteFundingPnl)
      .sub(dustBaseAssetValue);

    // update open bids/asks
    const [marketOpenBids, marketOpenAsks] = calculateMarketOpenBidAsk(
      market.amm.baseAssetReserve,
      market.amm.minBaseAssetReserve,
      market.amm.maxBaseAssetReserve,
      market.amm.orderStepSize,
    );
    const lpOpenBids = marketOpenBids
      .mul(position.lpShares)
      .div(market.amm.sqrtK);
    const lpOpenAsks = marketOpenAsks
      .mul(position.lpShares)
      .div(market.amm.sqrtK);
    position.openBids = lpOpenBids.add(position.openBids);
    position.openAsks = lpOpenAsks.add(position.openAsks);

    // eliminate counting funding on settled position
    if (position.baseAssetAmount.gt(ZERO)) {
      position.lastCumulativeFundingRate = market.amm.cumulativeFundingRateLong;
    } else if (position.baseAssetAmount.lt(ZERO)) {
      position.lastCumulativeFundingRate =
        market.amm.cumulativeFundingRateShort;
    } else {
      position.lastCumulativeFundingRate = ZERO;
    }

    const remainderBeforeRemoval = new BN(position.remainderBaseAssetAmount);

    if (includeRemainderInBaseAmount) {
      position.baseAssetAmount = position.baseAssetAmount.add(
        remainderBeforeRemoval,
      );
      position.remainderBaseAssetAmount = 0;
    }

    return [position, remainderBeforeRemoval, pnl];
  }
}
