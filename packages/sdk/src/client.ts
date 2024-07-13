import {
  Connection,
  GetProgramAccountsFilter,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { makeObservable } from "mobx";
import * as anchor from "@coral-xyz/anchor";
import { BN, ProgramAccount } from "@coral-xyz/anchor";
import { Wallet as AnchorWallet } from "@coral-xyz/anchor/dist/cjs/provider";
import {
  BulkAccountLoader,
  DataAndSlot,
  decodeName,
  DRIFT_PROGRAM_ID,
  DriftClient,
  DriftClientConfig,
  encodeName,
  IWallet,
  OracleInfo,
  QUOTE_PRECISION,
  SpotMarketAccount,
  User,
} from "@drift-labs/sdk";
import {
  DRIFT_VAULTS_PROGRAM_ID,
  ONE_DAY,
  PROP_SHOP_PERCENT_ANNUAL_FEE,
  PROP_SHOP_PERCENT_PROFIT_SHARE,
  PROP_SHOP_PROTOCOL,
} from "./constants";
import { getAssociatedTokenAddress } from "./programs";
import { Drift, IDL as DRIFT_IDL } from "./idl/drift";
import { percentToPercentPrecision } from "./utils";
import { confirmTransactions, formatExplorerLink } from "./rpc";
import {
  AccountSubscription,
  DriftVaultsSubscriber,
  FundOverview,
  HistoricalSettlePNL,
  SnackInfo,
} from "./types";
import {
  DriftVaults,
  getVaultAddressSync,
  getVaultDepositorAddressSync,
  IDL as DRIFT_VAULTS_IDL,
  Vault,
  VaultClient,
  VaultDepositor,
  VaultProtocolParams,
  WithdrawUnit,
} from "@drift-labs/vaults-sdk";
import { EventEmitter } from "events";
import bs58 from "bs58";
import StrictEventEmitter from "strict-event-emitter-types";
import { PollingSubscriber } from "./pollingSubscriber";

export interface PropShopAccountEvents {
  vaultUpdate: (payload: Vault) => void;
  vaultDepositorUpdate: (payload: VaultDepositor) => void;
  update: void;
  error: (e: Error) => void;
}

export class PropShopClient {
  connection: Connection;
  wallet: WalletContextState;
  vaultClient: VaultClient | undefined;
  loading: boolean;
  eventEmitter: StrictEventEmitter<EventEmitter, PropShopAccountEvents>;

  _fundOverviews: Map<string, FundOverview>;
  _cache: DriftVaultsSubscriber | undefined = undefined;

  constructor(wallet: WalletContextState, connection: Connection) {
    makeObservable(this);

    // init
    this.initialize = this.initialize.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.unsubscribe = this.unsubscribe.bind(this);
    this.initUser = this.initUser.bind(this);
    this.userInitialized = this.userInitialized.bind(this);

    // read, fetch, and aggregate data
    this.spotMarketByIndex = this.spotMarketByIndex.bind(this);
    this.aggregateTVL = this.aggregateTVL.bind(this);
    this.aggregateDeposits = this.aggregateDeposits.bind(this);
    this.aggregatePNL = this.aggregatePNL.bind(this);
    //
    this.fetchVaults = this.fetchVaults.bind(this);
    this.vault = this.vault.bind(this);
    this.vaults = this.vaults.bind(this);
    this.managedVaults = this.managedVaults.bind(this);
    this.investedVaults = this.investedVaults.bind(this);
    //
    this.fetchVaultDepositors = this.fetchVaultDepositors.bind(this);
    this.vaultDepositor = this.vaultDepositor.bind(this);
    this.vaultDepositors = this.vaultDepositors.bind(this);
    //
    this.fetchHistoricalPNL = this.fetchHistoricalPNL.bind(this);
    this.fundOverview = this.fundOverview.bind(this);
    this.fetchFundOverview = this.fetchFundOverview.bind(this);
    this.fetchFundOverviews = this.fetchFundOverviews.bind(this);

    // actions
    this.joinVault = this.joinVault.bind(this);
    this.deposit = this.deposit.bind(this);
    this.requestWithdraw = this.requestWithdraw.bind(this);
    this.withdraw = this.withdraw.bind(this);
    this.createVault = this.createVault.bind(this);
    this.delegateVault = this.delegateVault.bind(this);
    this.updateVault = this.updateVault.bind(this);
    this.managerDeposit = this.managerDeposit.bind(this);
    this.managerRequestWithdraw = this.managerRequestWithdraw.bind(this);
    this.managerWithdraw = this.managerWithdraw.bind(this);
    this.protocolRequestWithdraw = this.protocolRequestWithdraw.bind(this);
    this.protocolWithdraw = this.protocolWithdraw.bind(this);

    this.wallet = wallet;
    this.connection = connection;
    this.loading = false;
    this._fundOverviews = new Map();
    this.eventEmitter = new EventEmitter();
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
    const now = new Date().getTime();
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

    const usdcMarketIndex = 0;
    const usdcSpotMarket = await this.spotMarketByIndex(
      driftProgram,
      usdcMarketIndex,
    );
    const oracleInfos: OracleInfo[] = [
      {
        publicKey: usdcSpotMarket.account.oracle,
        source: usdcSpotMarket.account.oracleSource,
      },
    ];

    const driftClient = new DriftClient({
      connection,
      wallet: iWallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId,
      accountSubscription,
      spotMarketIndexes: [usdcMarketIndex],
      oracleInfos,
    });
    const preDriftSub = new Date().getTime();
    await driftClient.subscribe();
    // this takes about 1.2s which can't be reduced much more
    console.log(
      `DriftClient subscribed in ${new Date().getTime() - preDriftSub}ms`,
    );

    this.vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
    });

    const preSub = new Date().getTime();
    await this.subscribe(driftVaultsProgram as any);
    // todo: reduce this, it takes about 4s
    console.log(
      `Subscribed to DriftVaults accounts in ${new Date().getTime() - preSub}ms`,
    );

    this.loading = false;
    // todo: reduce this, it takes about 7s
    console.log(`initialized client in ${new Date().getTime() - now}ms`);
  }

  async subscribe(program: anchor.Program<DriftVaults>) {
    const slot = await this.connection.getSlot();
    const vaults = await this.fetchVaults();
    const vds = await this.fetchVaultDepositors();
    const loader = new BulkAccountLoader(
      program.provider.connection,
      "confirmed",
      10_000,
    );
    const vaultSubs = vaults.map((v) => {
      const sub: AccountSubscription = {
        accountName: "vault",
        publicKey: v.publicKey,
        eventType: "vaultUpdate",
        dataAndSlot: {
          data: v.account,
          slot,
        },
      };
      return sub;
    });
    const vdSubs = vds.map((v) => {
      const sub: AccountSubscription = {
        accountName: "vaultDepositor",
        publicKey: v.publicKey,
        eventType: "vaultDepositorUpdate",
        dataAndSlot: {
          data: v.account,
          slot,
        },
      };
      return sub;
    });
    this._cache = new PollingSubscriber(program, loader, [
      ...vaultSubs,
      ...vdSubs,
    ]);
    await this._cache.subscribe();
  }

  async unsubscribe(): Promise<void> {
    await this._cache?.unsubscribe();
  }

  get publicKey(): PublicKey {
    if (!this.wallet.publicKey) {
      throw new Error("Wallet not connected");
    }
    return this.wallet.publicKey;
  }

  /**
   * Initialize the User for the connected wallet,
   * and optionally deposit USDC as collateral.
   * Call this before joining or depositing to a vault.
   */
  async initUser(depositUsdc?: number): Promise<{
    user: User;
    usdcMint: PublicKey;
    usdcAta: PublicKey;
  }> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(0);
    if (!spotMarket) {
      throw new Error("USDC spot market not found in DriftClient");
    }
    const usdcMint = spotMarket.mint;
    const usdcAta = getAssociatedTokenAddress(usdcMint, this.publicKey);
    const user = new User({
      // @ts-ignore
      driftClient: this.vaultClient.driftClient,
      userAccountPublicKey:
        await this.vaultClient!.driftClient.getUserAccountPublicKey(),
    });
    // only init if this is the first time (not already subscribed)
    if (!user.isSubscribed) {
      if (depositUsdc) {
        await this.vaultClient!.driftClient.initializeUserAccountAndDepositCollateral(
          QUOTE_PRECISION.mul(new BN(depositUsdc)),
          usdcAta,
          0,
          this.vaultClient!.driftClient.activeSubAccountId,
        );
      } else {
        await this.vaultClient!.driftClient.initializeUserAccount(
          this.vaultClient!.driftClient.activeSubAccountId ?? 0,
        );
      }
      await user.subscribe();
    }
    return {
      user,
      usdcMint,
      usdcAta,
    };
  }

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
    program: anchor.Program<Drift>,
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
      await program.account.spotMarket.all(filters);
    if (res.length > 0) {
      return res[0];
    } else {
      throw new Error(`Spot market not found for index ${index}`);
    }
  }

  public vault(key: PublicKey): ProgramAccount<DataAndSlot<Vault>> {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }
    const v = this._cache.getAccount("vault", key);
    if (!v) {
      throw new Error("Vault not subscribed");
    } else {
      return {
        publicKey: key,
        account: v,
      };
    }
  }

  public vaults(protocolsOnly?: boolean): ProgramAccount<DataAndSlot<Vault>>[] {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }
    // account subscriber fetches upon subscription, so these should never be undefined
    const vaults: ProgramAccount<DataAndSlot<Vault>>[] = this._cache
      .getAccounts("vault")
      .filter((pa) => {
        const dataAndSlot = pa.account as DataAndSlot<Vault>;
        if (dataAndSlot) {
          if (protocolsOnly) {
            return dataAndSlot.data.vaultProtocol !== SystemProgram.programId;
          } else {
            return true;
          }
        } else {
          return false;
        }
      });
    return vaults;
  }

  public vaultDepositor(
    key: PublicKey,
  ): ProgramAccount<DataAndSlot<VaultDepositor>> {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }
    const vd = this._cache.getAccount("vaultDepositor", key);
    if (!vd) {
      throw new Error("VaultDepositor not subscribed");
    } else {
      return {
        publicKey: key,
        account: vd,
      };
    }
  }

  public vaultDepositors(
    filterByAuthority?: boolean,
  ): ProgramAccount<DataAndSlot<VaultDepositor>>[] {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }
    // account subscriber fetches upon subscription, so these should never be undefined
    const vds: ProgramAccount<DataAndSlot<VaultDepositor>>[] = this._cache
      .getAccounts("vaultDepositor")
      .filter((pa) => {
        const dataAndSlot = pa.account as DataAndSlot<VaultDepositor>;
        if (dataAndSlot) {
          if (filterByAuthority) {
            return dataAndSlot.data.authority.equals(this.publicKey);
          } else {
            return true;
          }
        } else {
          return false;
        }
      });
    return vds;
  }

  public async fundOverview(key: PublicKey): Promise<FundOverview> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let v = this._fundOverviews.get(key.toString());
    if (!v) {
      v = await this.fetchFundOverview(key);
    }
    return v!;
  }

  public async fundOverviews(protocolsOnly?: boolean): Promise<FundOverview[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let res = Array.from(this._fundOverviews.values());
    if (res.length === 0) {
      res = await this.fetchFundOverviews(protocolsOnly);
    }
    return res;
  }

  public async fetchVaults(
    protocolsOnly?: boolean,
  ): Promise<ProgramAccount<Vault>[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const preFetch = new Date().getTime();
    const vaults: ProgramAccount<Vault>[] =
      await this.vaultClient.program.account.vault.all();
    console.log(
      `fetched ${vaults.length} vds in ${new Date().getTime() - preFetch}ms`,
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
    const preFetch = new Date().getTime();
    const vds: ProgramAccount<VaultDepositor>[] =
      await this.vaultClient.program.account.vaultDepositor.all(filters);
    console.log(
      `fetched ${vds.length} vds in ${new Date().getTime() - preFetch}ms`,
    );
    return vds;
  }

  //
  // Read only methods to aggregate data
  //

  /**
   * Returns historical pnl data from most recent to oldest
   * @param vault
   * @param daysBack
   */
  async fetchHistoricalPNL(
    vault: Vault,
    daysBack: number,
  ): Promise<HistoricalSettlePNL[]> {
    try {
      const name = decodeName(vault.name);
      console.log(`fetch pnl for ${name} and user: ${vault.user}`);
      const url = "/api/performance";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vaultName: name,
          vaultUser: vault.user.toString(),
          daysBack,
        }),
      });
      const data: HistoricalSettlePNL[] = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching data:", error);
      throw new Error("Error fetching data");
    }
  }

  // todo: fetch from server to speed up load time
  public async fetchFundOverview(vaultKey: PublicKey): Promise<FundOverview> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vault = this.vault(vaultKey);
    const vds = this.vaultDepositors();
    // get count of vds per vault
    const vaultVds = new Map<
      string,
      ProgramAccount<DataAndSlot<VaultDepositor>>[]
    >();
    for (const vd of vds) {
      const key = vd.account.data.vault.toString();
      const value = vaultVds.get(key);
      if (value) {
        vaultVds.set(key, [...value, vd]);
      } else {
        vaultVds.set(key, [vd]);
      }
    }

    const investors = vaultVds.get(vault.account.data.pubkey.toString()) ?? [];
    const aum = await this.aggregateTVL([vault], investors);
    const pnlData = await this.fetchHistoricalPNL(vault.account.data, 100);
    // cum sum the "pnl" field
    let cumSum: number = 0;
    const data: number[] = [];
    for (const entry of pnlData.reverse()) {
      cumSum += Number(entry.pnl);
      data.push(cumSum);
    }
    console.log("first:", data[0]);
    console.log("last:", data[data.length - 1]);
    const fo: FundOverview = {
      title: decodeName(vault.account.data.name),
      investors: investors.length,
      aum,
      data,
    };
    this._fundOverviews.set(vault.publicKey.toString(), fo);
    return fo;
  }

  // todo: fetch from server to speed up load time
  public async fetchFundOverviews(
    protocolsOnly?: boolean,
  ): Promise<FundOverview[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const preVaults = new Date().getTime();
    const vaults = await this.vaults(protocolsOnly);
    console.log(
      `fetched ${vaults.length} vaults in ${new Date().getTime() - preVaults}ms`,
    );
    const preVd = new Date().getTime();
    const vds = await this.vaultDepositors();
    console.log(
      `fetched ${vds.length} vds in ${new Date().getTime() - preVd}ms`,
    );
    // get count of vds per vault
    const vaultVds = new Map<
      string,
      ProgramAccount<DataAndSlot<VaultDepositor>>[]
    >();
    for (const vd of vds) {
      const key = vd.account.data.vault.toString();
      const value = vaultVds.get(key);
      if (value) {
        vaultVds.set(key, [...value, vd]);
      } else {
        vaultVds.set(key, [vd]);
      }
    }
    const fundOverviews: FundOverview[] = [];
    for (const vault of vaults) {
      const investors =
        vaultVds.get(vault.account.data.pubkey.toString()) ?? [];
      const aum = await this.aggregateTVL(vaults, investors);
      const pnlData = await this.fetchHistoricalPNL(vault.account.data, 100);
      // cum sum the "pnl" field
      let cumSum: number = 0;
      const data: number[] = [];
      for (const entry of pnlData.reverse()) {
        cumSum += Number(entry.pnl);
        data.push(cumSum);
      }
      console.log("first:", data[0]);
      console.log("last:", data[data.length - 1]);
      const fo: FundOverview = {
        title: decodeName(vault.account.data.name),
        investors: investors.length,
        aum,
        data,
      };
      fundOverviews.push(fo);
      this._fundOverviews.set(vault.publicKey.toString(), fo);
    }
    return fundOverviews;
  }

  /**
   * Vaults the connected wallet manages.
   */
  public managedVaults(
    protocolsOnly?: boolean,
  ): ProgramAccount<DataAndSlot<Vault>>[] {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults = this.vaults(protocolsOnly);
    return vaults.filter((v) => {
      return v.account.data.manager === this.wallet.publicKey;
    });
  }

  /**
   * Vaults the connected wallet is invested in.
   */
  public investedVaults(): PublicKey[] {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vds = this.vaultDepositors(true);
    return vds.map((vd) => vd.account.data.vault);
  }

  /**
   * Aggregate total value locked across all vaults denominated in USDC.
   */
  public async aggregateTVL(
    vaults?: ProgramAccount<DataAndSlot<Vault>>[],
    vaultDepositors?: ProgramAccount<DataAndSlot<VaultDepositor>>[],
  ): Promise<number> {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }

    let _vaults: ProgramAccount<DataAndSlot<Vault>>[];
    if (vaults) {
      _vaults = vaults;
    } else {
      _vaults = this.vaults();
    }

    let _vds: ProgramAccount<DataAndSlot<VaultDepositor>>[];
    if (vaultDepositors) {
      _vds = vaultDepositors;
    } else {
      _vds = this.vaultDepositors();
    }

    let usdc = 0;
    for (const vd of _vds) {
      let vault: Vault;
      const match = _vaults.find((v) =>
        v.account.data.pubkey.equals(vd.account.data.vault),
      );
      if (match) {
        vault = match.account.data;
      } else {
        vault = this.vault(vd.account.data.vault).account.data;
      }
      const amount =
        await this.vaultClient.calculateWithdrawableVaultDepositorEquityInDepositAsset(
          {
            vaultDepositor: vd.account.data,
            vault: vault,
          },
        );
      const balance = amount.toNumber() / QUOTE_PRECISION.toNumber();
      usdc += balance;
    }
    return usdc;
  }

  /**
   * Aggregate deposits (not including profits) across all vaults denominated in USDC.
   */
  public aggregateDeposits(
    vaultDepositors?: ProgramAccount<DataAndSlot<VaultDepositor>>[],
  ): number {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let vds: ProgramAccount<DataAndSlot<VaultDepositor>>[];
    if (!vaultDepositors) {
      vds = this.vaultDepositors();
    } else {
      vds = vaultDepositors;
    }
    let usdc = 0;
    for (const vd of vds) {
      const netDeposits =
        vd.account.data.netDeposits.toNumber() / QUOTE_PRECISION.toNumber();
      usdc += netDeposits;
    }
    return usdc;
  }

  /**
   * Aggregate PNL across all vaults denominated in USDC.
   */
  public async aggregatePNL(
    vaultDepositors?: ProgramAccount<DataAndSlot<VaultDepositor>>[],
  ): Promise<number> {
    let vds: ProgramAccount<DataAndSlot<VaultDepositor>>[];
    if (!vaultDepositors) {
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
    console.debug("join vault:", formatExplorerLink(sig, this.connection));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Joined ${vaultName} vault`,
    };
  }

  public async deposit(vault: PublicKey, usdc: number): Promise<SnackInfo> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (!this.userInitialized()) {
      throw new Error("User not initialized");
    }
    const vaultDepositor = getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );
    const amount = QUOTE_PRECISION.mul(new BN(usdc));

    const vdExists = await this.connection.getAccountInfo(vaultDepositor);
    let initVaultDepositor = undefined;
    if (!vdExists) {
      initVaultDepositor = {
        authority: this.publicKey,
        vault,
      };
    }
    const sig = await this.vaultClient.deposit(
      vaultDepositor,
      amount,
      initVaultDepositor,
    );
    console.debug("deposit:", formatExplorerLink(sig, this.connection));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Deposited to ${vaultName} vault`,
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
    const vaultDepositor = getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );
    const amount = QUOTE_PRECISION.mul(new BN(usdc));
    const sig = await this.vaultClient.requestWithdraw(
      vaultDepositor,
      amount,
      WithdrawUnit.TOKEN,
    );
    console.debug(
      "request withdraw:",
      formatExplorerLink(sig, this.connection),
    );
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Request withdraw from ${vaultName} vault`,
    };
  }

  public async withdraw(vault: PublicKey): Promise<SnackInfo> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    if (!this.userInitialized()) {
      throw new Error("User not initialized");
    }
    const vaultDepositor = getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );
    const sig = await this.vaultClient.withdraw(vaultDepositor);
    console.debug("withdraw:", formatExplorerLink(sig, this.connection));
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Withdraw from ${vaultName} vault`,
    };
  }

  //
  // Manager actions
  //

  /**
   * The connected wallet will become the manager of the vault.
   */
  public async createVault(params: {
    // The name of the vault
    name: string;
    // The percent of profits to share with the vault manager
    percentProfitShare: number;
    // The percent annual fee on assets under management
    percentAnnualManagementFee: number;
    // The minimum deposit in USDC required to join a vault as an investor
    minDepositUSDC?: number;
    // Whether the vault is invite only
    permissioned?: boolean;
    // The period in seconds that investors must wait after requesting to redeem their funds
    redeemPeriod?: number;
    // Maximum vault capacity in USDC
    maxCapacityUSDC?: number;
  }): Promise<{
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
    const minDepositAmount = QUOTE_PRECISION.mul(
      new BN(params.minDepositUSDC ?? 0),
    );
    const permissioned = params.permissioned ?? false;
    const redeemPeriod = new BN(params.redeemPeriod ?? ONE_DAY);
    const maxTokens = QUOTE_PRECISION.mul(new BN(params.maxCapacityUSDC ?? 0));
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
    const sig = await this.vaultClient.initializeVault(vaultParams);
    console.debug(
      "initialize vault:",
      formatExplorerLink(sig, this.connection),
    );
    const vault = getVaultAddressSync(
      this.vaultClient.program.programId,
      encodeName(params.name),
    );
    const vaultProtocol = this.vaultClient.getVaultProtocolAddress(vault);
    return {
      vault,
      vaultProtocol,
      snack: {
        variant: "success",
        message: `Created ${params.name} vault`,
      },
    };
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
    console.debug("delegate vault:", formatExplorerLink(sig, this.connection));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Delegated ${vaultName} vault to ${delegate.toString()}`,
    };
  }

  /**
   * Can only reduce the profit share, management fee, or redeem period.
   * Unable to modify protocol fees.
   */
  public async updateVault(): Promise<void> {}

  public async managerDeposit(usdc: number): Promise<void> {}

  public async managerRequestWithdraw(usdc: number): Promise<void> {}

  public async managerWithdraw(usdc: number): Promise<void> {}

  //
  // Protocol actions
  //

  public async protocolRequestWithdraw(usdc: number): Promise<void> {}

  public async protocolWithdraw(): Promise<void> {}
}
