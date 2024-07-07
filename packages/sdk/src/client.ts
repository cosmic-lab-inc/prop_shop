import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AsyncSigner,
  keypairToAsyncSigner,
  walletAdapterToAsyncSigner,
} from "@cosmic-lab/data-source";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { makeAutoObservable } from "mobx";
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
import * as anchor from "@coral-xyz/anchor";
import { BN, ProgramAccount } from "@coral-xyz/anchor";
import {
  decodeName,
  DRIFT_PROGRAM_ID,
  DriftClient,
  DriftClientConfig,
  encodeName,
  IWallet,
  OracleInfo,
  PerpMarketAccount,
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
import { IDL as DRIFT_IDL } from "./idl/drift";
import { percentToPercentPrecision } from "./utils";
import { confirmTransactions, formatExplorerLink } from "./rpc";
import { SnackInfo } from "./types";

export class PropShopClient {
  connection: Connection;
  wallet: IWallet;
  private exists: boolean = false;
  usdcMint: PublicKey | undefined;
  usdcAta: PublicKey | undefined;
  vaultClient: VaultClient | undefined;

  constructor(wallet: IWallet, connection: Connection) {
    makeAutoObservable(this);
    this.wallet = wallet;
    this.connection = connection;
  }

  /**
   * For use from a CLI or test suite.
   */
  public static keypairToIWallet(kp: Keypair): IWallet {
    return {
      signTransaction(tx: Transaction): Promise<Transaction> {
        tx.partialSign(kp);
        return Promise.resolve(tx);
      },
      signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
        txs.forEach((tx) => tx.partialSign(kp));
        return Promise.resolve(txs);
      },
      publicKey: kp.publicKey,
    };
  }

  /**
   * Helper method to convert a connected Solana wallet adapter to AsyncSigner.
   * For clients directly using the SDK within a React app that uses `@solana/wallet-adapter-react` to connect to a wallet.
   */
  public static walletAdapterToAsyncSigner(
    wallet: WalletContextState,
  ): AsyncSigner {
    return walletAdapterToAsyncSigner(wallet);
  }

  /**
   * Helper method to convert a Keypair to AsyncSigner.
   * For clients directly using the SDK outside a React app (such as developers or a bot)
   * For most the Keypair would be read from a local file or environment variable.
   */
  public static keypairToAsyncSigner(key: Keypair): AsyncSigner {
    return keypairToAsyncSigner(key);
  }

  public static readKeypairFromEnv(key: string): Keypair {
    try {
      const raw = process.env[key];
      if (!raw) throw new Error(`${key} not found in env`);
      const byteArray = JSON.parse(raw);
      const buffer = Buffer.from(byteArray);
      return Keypair.fromSecretKey(buffer);
    } catch (e: any) {
      console.error(`${key} not found in env`);
      throw e;
    }
  }

  //
  // Initialization and setup
  //

  /**
   * Initialize the DriftClient and VaultClient.
   * Call this upon connecting a wallet.
   */
  public async initialize(depositUsdc?: number): Promise<void> {
    const { vaultClient, usdcAta, usdcMint } = await this.initClient(
      {
        wallet: this.wallet,
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
      },
      depositUsdc,
    );
    this.vaultClient = vaultClient;
    this.usdcAta = usdcAta;
    this.usdcMint = usdcMint;
    this.exists = true;
  }

  private async initClient(
    config: DriftClientConfig,
    depositUsdc?: number,
  ): Promise<{
    wallet: IWallet;
    usdcMint: PublicKey;
    usdcAta: PublicKey;
    vaultClient: VaultClient;
  }> {
    const {
      wallet,
      connection,
      accountSubscription,
      opts,
      activeSubAccountId,
    } = config;

    const provider = new anchor.AnchorProvider(
      connection,
      // @ts-ignore
      wallet,
      opts,
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

    // Perp/Spot market account types do not define padding so eslint errors, but it is safe.
    const perpMarkets =
      (await driftProgram.account.perpMarket.all()) as unknown as PerpMarketAccount[];
    const perpMarketIndexes = perpMarkets.map((m) => m.marketIndex);
    const spotMarkets =
      (await driftProgram.account.spotMarket.all()) as unknown as SpotMarketAccount[];
    const spotMarketIndexes = spotMarkets.map((m) => m.marketIndex);
    const oracleInfos: OracleInfo[] = perpMarkets.map((m) => {
      return {
        publicKey: m.amm.oracle,
        source: m.amm.oracleSource,
      };
    });

    const driftClient = new DriftClient({
      connection,
      wallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId,
      perpMarketIndexes,
      spotMarketIndexes,
      oracleInfos,
      accountSubscription,
    });
    await driftClient.subscribe();

    const vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
    });

    const spotMarket = driftClient.getSpotMarketAccount(0);
    if (!spotMarket) {
      throw new Error(`USDC spot market not found in DriftClient`);
    }
    const usdcMint = spotMarket.mint;
    const usdcAta = getAssociatedTokenAddress(usdcMint, wallet.publicKey);

    if (depositUsdc) {
      await this.initUserIdempotent(depositUsdc);
    }

    return {
      wallet,
      usdcMint,
      usdcAta,
      vaultClient,
    };
  }

  /**
   * Initialize the User for the connected wallet,
   * and optionally deposit USDC as collateral.
   * Call this before joining a vault.
   */
  async initUserIdempotent(depositUsdc?: number): Promise<User> {
    if (!this.exists) {
      throw new Error("PropShopClient not initialized");
    }
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
          this.usdcAta!,
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
    return user;
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

  public async allVaults(protocolsOnly?: boolean): Promise<Vault[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    // @ts-ignore ... Vault type omits padding fields, but this is safe.
    const vaults: ProgramAccount<Vault>[] =
      await this.vaultClient.program.account.vault.all();
    if (protocolsOnly) {
      return vaults
        .filter((v) => {
          return v.account.vaultProtocol !== SystemProgram.programId;
        })
        .map((v) => v.account);
    } else {
      return vaults.map((v) => v.account);
    }
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
    const vds: ProgramAccount<VaultDepositor>[] =
      await this.vaultClient.program.account.vaultDepositor.all([
        {
          memcmp: {
            // "authority" field offset
            offset: 64,
            // this wallet must be the authority of the VaultDepositor to be the investor
            bytes: this.wallet.publicKey.toBase58(),
          },
        },
      ]);
    return vds.map((vd) => vd.account.vault);
  }

  /**
   * VaultDepositors the connected wallet is the authority of.
   */
  public async vaultDepositors(): Promise<ProgramAccount<VaultDepositor>[]> {
    if (!this.vaultClient) {
      throw new Error("PropShopClient not initialized");
    }
    const vds: ProgramAccount<VaultDepositor>[] =
      await this.vaultClient.program.account.vaultDepositor.all([
        {
          memcmp: {
            // "authority" field offset
            offset: 64,
            // this wallet must be the authority of the VaultDepositor to be the investor
            bytes: this.wallet.publicKey.toBase58(),
          },
        },
      ]);
    return vds;
  }

  /**
   * Aggregate total value locked across all vaults denominated in USDC.
   */
  public async aggregateTVL(
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
      const vault = await this.vaultClient.program.account.vault.fetch(
        vd.account.vault,
      );
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
      this.wallet.publicKey,
    );
    const amount = QUOTE_PRECISION.mul(new BN(usdc));

    const vdExists = await this.connection.getAccountInfo(vaultDepositor);
    let initVaultDepositor = undefined;
    if (!vdExists) {
      initVaultDepositor = {
        authority: this.wallet.publicKey,
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
      this.wallet.publicKey,
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
      this.wallet.publicKey,
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
