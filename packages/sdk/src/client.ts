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
  decodeName,
  DRIFT_PROGRAM_ID,
  DriftClient,
  DriftClientConfig,
  encodeName,
  IWallet,
  QUOTE_PRECISION,
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
import { IDL as DRIFT_IDL } from "./idl/drift";
import { percentToPercentPrecision } from "./utils";
import { confirmTransactions, formatExplorerLink } from "./rpc";
import { FundOverview, SnackInfo } from "./types";
import {
  getVaultAddressSync,
  getVaultDepositorAddressSync,
  IDL as DRIFT_VAULTS_IDL,
  Vault,
  VaultClient,
  VaultDepositor,
  VaultProtocolParams,
  WithdrawUnit,
} from "@drift-labs/vaults-sdk";

export class PropShopClient {
  connection: Connection;
  wallet: WalletContextState;
  vaultClient: VaultClient | undefined;
  loading: boolean;

  constructor(wallet: WalletContextState, connection: Connection) {
    makeObservable(this);
    this.allVaults = this.allVaults.bind(this);
    this.managedVaults = this.managedVaults.bind(this);
    this.investedVaults = this.investedVaults.bind(this);
    this.aggregateTVL = this.aggregateTVL.bind(this);
    this.aggregateDeposits = this.aggregateDeposits.bind(this);
    this.aggregatePNL = this.aggregatePNL.bind(this);
    this.initUser = this.initUser.bind(this);
    this.userInitialized = this.userInitialized.bind(this);
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

    // // Perp/Spot market account types do not define padding so eslint errors, but it is safe.
    // const perpMarkets =
    //   (await driftProgram.account.perpMarket.all()) as unknown as ProgramAccount<PerpMarketAccount>[];
    // const perpMarketIndexes = perpMarkets.map((m) => m.account.marketIndex);
    // const spotMarkets =
    //   (await driftProgram.account.spotMarket.all()) as unknown as ProgramAccount<SpotMarketAccount>[];
    // const spotMarketIndexes = spotMarkets.map((m) => m.account.marketIndex);
    // const oracleInfos: OracleInfo[] = perpMarkets.map((m) => {
    //   return {
    //     publicKey: m.account.amm.oracle,
    //     source: m.account.amm.oracleSource,
    //   };
    // });

    const driftClient = new DriftClient({
      connection,
      wallet: iWallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId,
      accountSubscription,
      // perpMarketIndexes,
      // spotMarketIndexes,
      // oracleInfos,
    });
    await driftClient.subscribe();

    const vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
    });

    this.vaultClient = vaultClient;
    this.loading = false;
    console.log(`loaded client in ${new Date().getTime() - now}ms`);
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
  // Read only methods to aggregate data
  //

  public async allVaults(
    protocolsOnly?: boolean,
  ): Promise<ProgramAccount<Vault>[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults: ProgramAccount<Vault>[] =
      await this.vaultClient.program.account.vault.all();
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
  public async vaultDepositors(
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
    const vds: ProgramAccount<VaultDepositor>[] =
      await this.vaultClient.program.account.vaultDepositor.all(filters);
    return vds;
  }

  public async fundOverviews(protocolsOnly?: boolean): Promise<FundOverview[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let now = new Date().getTime();
    const vaults = await this.allVaults(protocolsOnly);
    console.log(
      `fetched ${vaults.length} vaults in ${new Date().getTime() - now}ms`,
    );
    now = new Date().getTime();
    const vds = await this.vaultDepositors();
    console.log(`fetched ${vds.length} vds in ${new Date().getTime() - now}ms`);
    // get count of vds per vault
    const vaultVds = new Map<string, ProgramAccount<VaultDepositor>[]>();
    for (const vd of vds) {
      if (
        !vaults.find(
          (v) => v.account.pubkey.toString() === vd.account.vault.toString(),
        )
      ) {
        console.warn("vault not found for vd");
        console.log("vd vault:", vd.account.vault.toString());
      }
      if (vaultVds.has(vd.account.vault.toString())) {
        vaultVds.set(vd.account.vault.toString(), [
          ...vaultVds.get(vd.account.vault.toString())!,
          vd,
        ]);
      } else {
        vaultVds.set(vd.account.vault.toString(), [vd]);
      }
    }
    const fundOverviews: FundOverview[] = [];
    for (const vault of vaults) {
      const investors = vaultVds.get(vault.account.pubkey.toString()) ?? [];
      const aum = await this.aggregateTVL(investors, vaults);
      fundOverviews.push({
        title: decodeName(vault.account.name),
        investors: investors.length,
        aum,
        // todo: get vault pnl history from API
        data: [],
      });
    }
    return fundOverviews;
  }

  /**
   * Vaults the connected wallet manages.
   */
  public async managedVaults(): Promise<ProgramAccount<Vault>[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults: ProgramAccount<Vault>[] =
      await this.vaultClient.program.account.vault.all();
    return vaults.filter((v) => {
      return v.account.manager === this.wallet.publicKey;
    });
  }

  /**
   * Vaults the connected wallet is invested in.
   */
  public async investedVaults(): Promise<PublicKey[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vds = await this.vaultDepositors(true);
    return vds.map((vd) => vd.account.vault);
  }

  /**
   * Aggregate total value locked across all vaults denominated in USDC.
   */
  public async aggregateTVL(
    vaultDepositors?: ProgramAccount<VaultDepositor>[],
    preFetchedVaults?: ProgramAccount<Vault>[],
  ): Promise<number> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let vds: ProgramAccount<VaultDepositor>[];
    if (!vaultDepositors) {
      vds = await this.vaultDepositors();
    } else {
      vds = vaultDepositors;
    }
    let usdc = 0;
    for (const vd of vds) {
      let vault: Vault;
      if (preFetchedVaults) {
        const match = preFetchedVaults.find((v) =>
          v.account.pubkey.equals(vd.account.vault),
        );
        if (match) {
          vault = match.account;
        } else {
          vault = await this.vaultClient.program.account.vault.fetch(
            vd.account.vault,
          );
        }
      } else {
        vault = await this.vaultClient.program.account.vault.fetch(
          vd.account.vault,
        );
      }
      const amount =
        await this.vaultClient.calculateWithdrawableVaultDepositorEquityInDepositAsset(
          {
            vaultDepositor: vd.account,
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
  public async aggregateDeposits(
    vaultDepositors?: ProgramAccount<VaultDepositor>[],
  ): Promise<number> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    let vds: ProgramAccount<VaultDepositor>[];
    if (!vaultDepositors) {
      vds = await this.vaultDepositors();
    } else {
      vds = vaultDepositors;
    }
    let usdc = 0;
    for (const vd of vds) {
      const netDeposits =
        vd.account.netDeposits.toNumber() / QUOTE_PRECISION.toNumber();
      usdc += netDeposits;
    }
    return usdc;
  }

  /**
   * Aggregate PNL across all vaults denominated in USDC.
   */
  public async aggregatePNL(
    vaultDepositors?: ProgramAccount<VaultDepositor>[],
  ): Promise<number> {
    let vds: ProgramAccount<VaultDepositor>[];
    if (!vaultDepositors) {
      vds = await this.vaultDepositors();
    } else {
      vds = vaultDepositors;
    }
    const tvl = await this.aggregateTVL(vds);
    const deposits = await this.aggregateDeposits(vds);
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
