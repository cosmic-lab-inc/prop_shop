import {
  Connection,
  GetProgramAccountsFilter,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
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
  Data,
  DriftVaultsSubscriber,
  FundOverview,
  PropShopAccountEvents,
  SnackInfo,
  VaultPnl,
  WithdrawRequestTimer,
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
import { ProxyClient } from "./proxyClient";
import { WebSocketSubscriber } from "./websocketSubscriber";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export class PropShopClient {
  connection: Connection;
  wallet: WalletContextState;
  vaultClient: VaultClient | undefined;
  loading: boolean = false;
  eventEmitter: StrictEventEmitter<EventEmitter, PropShopAccountEvents> =
    new EventEmitter();

  _fundOverviews: Map<string, FundOverview> = new Map();
  _cache: DriftVaultsSubscriber | undefined = undefined;

  private readonly disableCache: boolean = false;
  private readonly skipFetching: boolean = false;
  private _vaults: Map<string, Vault> = new Map();
  private _vaultDepositors: Map<string, VaultDepositor> = new Map();
  private _timers: Map<string, WithdrawRequestTimer> = new Map();

  constructor(
    wallet: WalletContextState,
    connection: Connection,
    disableCache: boolean = false,
    skipFetching: boolean = false,
  ) {
    makeAutoObservable(this);

    this.wallet = wallet;
    this.connection = connection;
    this.disableCache = disableCache;
    this.skipFetching = skipFetching;

    this.eventEmitter.on("vaultUpdate", (payload: Data<PublicKey, Vault>) => {
      this._vaults.set(payload.key.toString(), payload.data);
    });
    this.eventEmitter.on(
      "vaultDepositorUpdate",
      (payload: Data<PublicKey, VaultDepositor>) => {
        this._vaultDepositors.set(payload.key.toString(), payload.data);
      },
    );
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
    console.log("USDC spot market:", usdcSpotMarket.account.mint.toString());
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
    const preDriftSub = Date.now();
    await driftClient.subscribe();
    // this takes about 1.2s which can't be reduced much more
    console.log(`DriftClient subscribed in ${Date.now() - preDriftSub}ms`);

    this.vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
      cliMode: true,
    });

    if (!this.disableCache) {
      const preSub = Date.now();
      await this.subscribe(driftVaultsProgram);
      // takes about 2s for websocket and 4s for polling
      console.log(`subscribed in ${Date.now() - preSub}ms`);
    }

    this.loading = false;
    // 3-6s
    console.log(`initialized PropShopClient in ${Date.now() - now}ms`);
  }

  async subscribe(program: anchor.Program<DriftVaults>) {
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
    // const loader = new AccountLoader(
    //   program.provider.connection,
    //   "confirmed",
    //   30_000,
    // );
    // this._cache = new PollingSubscriber(program, loader, {
    //     filters: [
    //       {
    //         accountName: "vault",
    //         eventType: "vaultUpdate",
    //       },
    //       {
    //         accountName: "vaultDepositor",
    //         eventType: "vaultDepositorUpdate",
    //       },
    //     ],
    //   },
    //   this.eventEmitter
    // );
    await this._cache.subscribe();
  }

  async shutdown(): Promise<void> {
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

  public vault(
    key: PublicKey,
    errorIfMissing: boolean = true,
  ): Data<PublicKey, Vault> | undefined {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }
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

  public vaults(protocolsOnly?: boolean): Data<PublicKey, Vault>[] {
    if (!this.vaultClient || !this._cache) {
      throw new Error("PropShopClient not initialized");
    }
    const preFetch = Date.now();
    // account subscriber fetches upon subscription, so these should never be undefined
    const vaults = Array.from(this._vaults.entries())
      .filter(([_key, value]) => {
        if (protocolsOnly) {
          return value.vaultProtocol !== SystemProgram.programId;
        } else {
          return true;
        }
      })
      .map(([key, data]) => {
        return {
          key: new PublicKey(key),
          data,
        };
      }) as Data<PublicKey, Vault>[];
    console.log(
      `fetched ${vaults.length} cached vaults in ${Date.now() - preFetch}ms`,
    );
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
    console.log(
      `fetched ${vds.length} cached vds in ${Date.now() - preFetch}ms`,
    );
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

  public async fetchFundOverview(vaultKey: PublicKey): Promise<FundOverview> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
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
    const aum = await this.aggregateTVL([vault], investors);
    const pnlData = await ProxyClient.performance({
      vault: vault.data,
      daysBack: 100,
      skipFetching: this.skipFetching,
    });
    const vaultPNL = VaultPnl.fromHistoricalSettlePNL(pnlData);
    const data = vaultPNL.cumulativeSeriesPNL();
    const fo: FundOverview = {
      vault: vault.data.pubkey,
      title: decodeName(vault.data.name),
      investors: investors.length,
      aum,
      data,
    };
    this._fundOverviews.set(vault.key.toString(), fo);
    return fo;
  }

  public async fetchFundOverviews(
    protocolsOnly?: boolean,
  ): Promise<FundOverview[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaults = this.vaults(protocolsOnly);
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
      const aum = await this.aggregateTVL(vaults, investors);
      const pnlData = await ProxyClient.performance({
        vault: vault.data,
        daysBack: 100,
        skipFetching: this.skipFetching,
      });
      const vaultPNL = VaultPnl.fromHistoricalSettlePNL(pnlData);
      const data = vaultPNL.cumulativeSeriesPNL();
      const fo: FundOverview = {
        vault: vault.data.pubkey,
        title: decodeName(vault.data.name),
        investors: investors.length,
        aum,
        data,
      };
      fundOverviews.push(fo);
      this._fundOverviews.set(vault.key.toString(), fo);
    }
    return fundOverviews;
  }

  /**
   * Vaults the connected wallet manages.
   */
  public managedVaults(protocolsOnly?: boolean): Data<PublicKey, Vault>[] {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults = this.vaults(protocolsOnly);
    return vaults.filter((v) => {
      return v.data.manager === this.publicKey;
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

  public async vaultDepositorEquityInDepositAsset(
    vdKey: PublicKey,
    vaultKey: PublicKey,
  ): Promise<number> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vault = this.vault(vaultKey)!;
    const vd = this.vaultDepositor(vdKey)!;
    const amount =
      await this.vaultClient.calculateWithdrawableVaultDepositorEquityInDepositAsset(
        {
          vaultDepositor: vd.data,
          vault: vault.data,
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
    console.debug("join vault:", formatExplorerLink(sig, this.connection));
    await confirmTransactions(this.connection, [sig]);
    const vaultAccount =
      await this.vaultClient.program.account.vault.fetch(vault);
    const vaultName = decodeName(vaultAccount.name);
    return {
      variant: "success",
      message: `Joined ${vaultName}`,
    };
  }

  public async deposit(vault: PublicKey, usdc: number): Promise<SnackInfo> {
    console.log("inside deposit...");
    if (!this.vaultClient) {
      console.error("PropShopClient not initialized");
      return {
        variant: "error",
        message: "Client not initialized",
      };
    }
    if (!this.userInitialized()) {
      console.error("User not initialized");
      // todo: init user ix
    }
    const vaultDepositor = getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );
    const vaultAccount = this.vault(vault)?.data;
    if (!vaultAccount) {
      console.error("Vault not found in deposit instruction");
      return {
        variant: "error",
        message: "Vault not found",
      };
    }
    const amount = QUOTE_PRECISION.mul(new BN(usdc));

    let preIxs: TransactionInstruction[] = [];

    const vdExists = this.vaultDepositor(vaultDepositor)?.data;
    if (!vdExists) {
      console.log("create vault depositor");
      const createVdIx = await this.vaultClient.program.methods
        .initializeVaultDepositor()
        .accounts({
          vaultDepositor,
          vault,
          authority: this.publicKey,
        })
        .instruction();
      preIxs.push(createVdIx);
    }

    const spotMarket = this.vaultClient.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex,
    );
    if (!spotMarket) {
      console.error("Spot market not found in deposit instruction");
      return {
        variant: "error",
        message: "Spot market not found",
      };
    }

    const userAta = getAssociatedTokenAddressSync(
      spotMarket.mint,
      this.publicKey,
      true,
    );
    const userAtaExists = await this.connection.getAccountInfo(userAta);
    if (userAtaExists === null) {
      console.log("user ata DNE");
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          this.publicKey,
          userAta,
          this.publicKey,
          spotMarket.mint,
        ),
      );
    }

    const { accounts, remainingAccounts } =
      await this.vaultClient.prepDepositTx(vaultDepositor, amount);

    let obj = this.vaultClient.program.methods
      .deposit(amount)
      .accounts(accounts)
      .remainingAccounts(remainingAccounts);

    if (preIxs.length > 0) {
      obj = obj.preInstructions(preIxs);
    }

    try {
      // let initVaultDepositor = undefined;
      // if (!vdExists) {
      //   initVaultDepositor = {
      //     authority: this.publicKey,
      //     vault,
      //   };
      // }
      // const sig = await this.vaultClient.deposit(
      //   vaultDepositor,
      //   amount,
      //   initVaultDepositor,
      // );

      const sig = await obj.rpc();

      console.debug("deposit:", formatExplorerLink(sig, this.connection));
      const vaultName = decodeName(this.vault(vault)!.data.name);
      return {
        variant: "success",
        message: `Deposited to ${vaultName}`,
      };
    } catch (e: any) {
      console.error("deposit error:", e);
      this.printProgramLogs(e);
      return {
        variant: "error",
        message: `Deposit failed: ${e}`,
      };
    }
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

    // cache timer so frontend can track withdraw request
    await this.createWithdrawTimer(vault);

    console.debug(
      "request withdraw:",
      formatExplorerLink(sig, this.connection),
    );
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
    const vaultDepositor = getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );

    const sig = await this.vaultClient.cancelRequestWithdraw(vaultDepositor);

    // successful withdraw means no more withdraw request
    this.removeWithdrawTimer(vault);

    console.debug(
      "cancel withdraw request:",
      formatExplorerLink(sig, this.connection),
    );
    const vaultName = decodeName(this.vault(vault)!.data.name);
    return {
      variant: "success",
      message: `Cancel withdraw request for ${vaultName}`,
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

    // successful withdraw means no more withdraw request
    this.removeWithdrawTimer(vault);

    console.debug("withdraw:", formatExplorerLink(sig, this.connection));
    const vaultName = decodeName(this.vault(vault)!.data.name);
    return {
      variant: "success",
      message: `Withdraw from ${vaultName}`,
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
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const key = getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );
    return this.vaultDepositor(key, false);
  }

  public withdrawTimer(vault: PublicKey): WithdrawRequestTimer | undefined {
    return this._timers.get(vault.toString());
  }

  public async createWithdrawTimer(vault: PublicKey): Promise<void> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vaultAcct = this.vault(vault)!.data;
    const vdKey = getVaultDepositorAddressSync(
      this.vaultClient.program.programId,
      vault,
      this.publicKey,
    );

    // force fetch of vault and vaultDepositor accounts in case websocket is slow to update
    await this._cache?.fetch();

    const vdAcct = this.vaultDepositor(vdKey)?.data;
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

  removeWithdrawTimer(vault: PublicKey) {
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
      for (const log of logs) {
        console.log(log);
      }
    }
  }
}
