import {Connection, LAMPORTS_PER_SOL, PublicKey, TransactionConfirmationStrategy} from '@solana/web3.js';
import {makeAutoObservable} from 'mobx';
import {CreatePropShopClientConfig, UpdateWalletConfig} from './types';
import {Vault} from '@drift-labs/vaults-sdk';
import {WalletContextState} from '@solana/wallet-adapter-react';
import {DriftVaultsClient} from './drift';
import {PhoenixVaultsClient} from './phoenix';
import {
  CreateVaultConfig,
  Data,
  FundOverview,
  SnackInfo,
  UpdateVaultConfig,
  Venue,
  WithdrawRequestTimer,
} from '../types';
import {fundDollarPnl} from '../utils';
import {sendTransactionWithResult, signatureLink} from '../rpc';
import {InstructionReturn, keypairToAsyncSigner, walletAdapterToAsyncSigner,} from '@cosmic-lab/data-source';
import {TEST_USDC_MINT, TEST_USDC_MINT_AUTHORITY} from '../constants';
import {BN} from '@coral-xyz/anchor';
import {QUOTE_PRECISION} from '@drift-labs/sdk';
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

export class PropShopClient {
  private readonly conn: Connection;
  private readonly wallet: WalletContextState;
  private driftVaultsClient: DriftVaultsClient;
  private phoenixVaultsClient: PhoenixVaultsClient;

  loading = false;
  dummyWallet = false;

  constructor(config: CreatePropShopClientConfig) {
    makeAutoObservable(this);
    this.conn = config.connection;
    this.wallet = config.wallet;
    this.dummyWallet = config.dummyWallet ?? false;
    this.driftVaultsClient = new DriftVaultsClient(config);
    this.phoenixVaultsClient = new PhoenixVaultsClient(config);
  }

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
    await this.driftVaultsClient.initialize();
    await this.phoenixVaultsClient.initialize();
    console.log(`initialized PropShopClient in ${Date.now() - now}ms`);
    this.loading = false;
  }

  public async updateWallet(config: UpdateWalletConfig): Promise<void> {
    const now = Date.now();
    await this.driftVaultsClient.updateWallet(config);
    await this.phoenixVaultsClient.updateWallet(config);
    console.log(`updated wallet in ${Date.now() - now}ms`);
  }

  async shutdown(): Promise<void> {
    await this.driftVaultsClient.shutdown();
    await this.phoenixVaultsClient.shutdown();
  }

  get publicKey(): PublicKey {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    return this.wallet.publicKey;
  }

  public isManager(fund: FundOverview): boolean {
    return this.publicKey.equals(fund.manager);
  }

  public isInvested(fund: FundOverview): boolean {
    return fund.investors.has(this.publicKey.toString());
  }

  public getInvestorAddress(config: {
    vault: PublicKey;
    venue: Venue;
  }): PublicKey {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.getVaultDepositorAddress(config.vault);
    } else {
      return this.phoenixVaultsClient.getInvestorAddress(config.vault);
    }
  }

  public vaults(config: {
    venue: Venue;
    hasProtocol?: boolean;
    managed?: boolean;
    invested?: boolean;
  }): Data<PublicKey, Vault>[] {
    const {venue, ...rest} = config;
    if (venue === Venue.Drift) {
      return this.driftVaultsClient.vaults(rest);
    } else {
      // todo
      return [];
    }
  }

  public get fundOverviews(): FundOverview[] {
    const driftFunds = this.driftVaultsClient.fundOverviews;
    const phoenixFunds = this.phoenixVaultsClient.fundOverviews;
    const funds = [...driftFunds, ...phoenixFunds];
    funds.sort((a, b) => {
      const _a = fundDollarPnl(a);
      const _b = fundDollarPnl(b);
      return _b - _a;
    });
    return funds;
  }

  //
  // Tokens and timers
  //

  public withdrawTimer(config: {
    venue: Venue;
    vault: PublicKey;
  }): WithdrawRequestTimer | undefined {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.withdrawTimer(config.vault);
    } else {
      return this.phoenixVaultsClient.withdrawTimer(config.vault);
    }
  }

  public hasWithdrawRequest(config: {
    vault: PublicKey;
    venue: Venue;
  }): boolean {
    return !!this.withdrawTimer(config);
  }

  public async createWithdrawTimer(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<void> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.createWithdrawTimer(config.vault);
    } else {
      return this.phoenixVaultsClient.createWithdrawTimer(config.vault);
    }
  }

  public async fetchEquityInVault(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<number | undefined> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.fetchEquityInVault(config.vault);
    } else {
      return this.phoenixVaultsClient.fetchInvestorEquity(config.vault);
    }
  }

  public equityInVault(config: {
    vault: PublicKey;
    venue: Venue;
  }): number | undefined {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.equityInVault(config.vault);
    } else {
      return this.phoenixVaultsClient.equityInVault(config.vault);
    }
  }

  public async fetchWalletUsdc(): Promise<number | undefined> {
    return this.driftVaultsClient.fetchWalletUsdc();
  }

  public async airdropSol(): Promise<SnackInfo> {
    try {
      const signature = await this.conn.requestAirdrop(
        this.publicKey,
        LAMPORTS_PER_SOL
      );
      await this.conn.confirmTransaction({
        signature
      } as TransactionConfirmationStrategy);
      console.debug(`airdrop sol: ${signatureLink(signature)}`);
      return {
        variant: 'success',
        message: 'Airdropped 1 SOL',
      };
    } catch (e: any) {
      console.error(e);
      return {
        variant: 'error',
        message: e.toString(),
      };
    }
  }

  public async airdropUsdc(usdc = 1000): Promise<SnackInfo> {
    const mintSigner = keypairToAsyncSigner(TEST_USDC_MINT);
    const mintAuthSigner = keypairToAsyncSigner(TEST_USDC_MINT_AUTHORITY);
    const funderSigner = walletAdapterToAsyncSigner(this.wallet);

    const ixs: InstructionReturn[] = [];
    // USDC has 6 decimals which happens to be the same as the QUOTE_PRECISION
    const usdcAmount = new BN(usdc).mul(QUOTE_PRECISION);

    const usdcAta = getAssociatedTokenAddressSync(
      mintSigner.publicKey(),
      this.publicKey,
      true
    );
    const ataExists = await this.conn.getAccountInfo(usdcAta);
    if (ataExists === null) {
      const createAtaIx: InstructionReturn = () => {
        return Promise.resolve({
          instruction: createAssociatedTokenAccountInstruction(
            this.publicKey,
            usdcAta,
            this.publicKey,
            mintSigner.publicKey()
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
          usdcAta,
          mintAuthSigner.publicKey(),
          usdcAmount.toNumber()
        ),
        signers: [mintAuthSigner],
      });
    };
    ixs.push(mintToUserAccountIx);

    try {
      const sig = await sendTransactionWithResult(ixs, funderSigner, this.conn);
      if (sig.isErr()) {
        console.error(sig.error);
        return {
          variant: 'error',
          message: 'Failed to airdrop USDC',
        };
      }
      console.debug(`airdrop usdc: ${signatureLink(sig.value)}`);
      return {
        variant: 'success',
        message: `Airdropped ${usdc} USDC`,
      };
    } catch (e: any) {
      console.error(e);
      return {
        variant: 'error',
        message: e.toString(),
      };
    }
  }

  //
  // Investor actions
  //

  public async deposit(config: {
    venue: Venue;
    vault: PublicKey;
    usdc: number;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.deposit(config.vault, config.usdc);
    } else {
      return this.phoenixVaultsClient.deposit(config.vault, config.usdc);
    }
  }

  public async requestWithdraw(config: {
    venue: Venue;
    vault: PublicKey;
    usdc: number;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.requestWithdraw(config.vault, config.usdc);
    } else {
      // todo
      return {
        variant: 'error',
        message: `todo`,
      };
    }
  }

  public async cancelWithdrawRequest(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.cancelWithdrawRequest(config.vault);
    } else {
      // todo
      return {
        variant: 'error',
        message: `todo`,
      };
    }
  }

  public async withdraw(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.withdraw(config.vault);
    } else {
      // todo
      return {
        variant: 'error',
        message: `todo`,
      };
    }
  }

  //
  // Manager actions
  //

  /**
   * The connected wallet will become the manager of the vault.
   */
  public async createVault(config: {
    venue: Venue;
    params: CreateVaultConfig;
  }): Promise<{
    vault: PublicKey;
    snack: SnackInfo;
  }> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.createVault(config.params);
    } else {
      // todo
      return {
        vault: PublicKey.default,
        snack: {
          variant: 'error',
          message: `todo`,
        },
      };
    }
  }

  public defaultUpdateVaultConfig(config: {
    venue: Venue;
    vault: PublicKey;
  }): UpdateVaultConfig {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.defaultUpdateVaultConfig(config.vault);
    } else {
      // todo
      return {
        redeemPeriod: 0,
        maxCapacityUSDC: 0,
        percentAnnualManagementFee: 0,
        minDepositUSDC: 0,
        percentProfitShare: 0,
        permissioned: false,
        delegate: PublicKey.default,
      } as UpdateVaultConfig;
    }
  }

  /**
   * Can only reduce the profit share, management fee, or redeem period.
   * Unable to modify protocol fees.
   */
  public async updateVault(config: {
    venue: Venue;
    vault: PublicKey;
    params: UpdateVaultConfig;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.updateVault(config.vault, config.params);
    } else {
      // todo
      return {
        variant: 'error',
        message: `todo`,
      };
    }
  }
}
