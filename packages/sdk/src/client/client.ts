import {
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  TransactionConfirmationStrategy,
  TransactionInstruction,
} from '@solana/web3.js';
import {autorun, makeAutoObservable} from 'mobx';
import {CreatePropShopClientConfig, UpdateWalletConfig} from './types';
import {DriftVaultsClient} from './drift';
import {PhoenixVaultsClient} from './phoenix';
import {CreateVaultConfig, FundOverview, SnackInfo, UpdateVaultConfig, Venue, WithdrawRequestTimer,} from '../types';
import {fundDollarPnl, shortenAddress} from '../utils';
import {signatureLink} from '../rpc';
import {AsyncSigner} from '@cosmic-lab/data-source';
import {TEST_USDC_MINT, TEST_USDC_MINT_AUTHORITY} from '../constants';
import * as anchor from '@coral-xyz/anchor';
import {BN} from '@coral-xyz/anchor';
import {QUOTE_PRECISION} from '@drift-labs/sdk';
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from '@solana/spl-token';

export class PropShopClient {
  private readonly conn: Connection;
  private signer: AsyncSigner;
  key: PublicKey;
  private driftVaultsClient: DriftVaultsClient;
  private phoenixVaultsClient: PhoenixVaultsClient;

  loading = false;
  dummyWallet = false;
  private _sol = 0;
  private _solSubId: number | undefined;
  private _usdc = 0;
  private _usdcSubId: number | undefined;

  constructor(config: CreatePropShopClientConfig) {
    makeAutoObservable(this);
    this.conn = config.connection;
    this.signer = config.signer;
    if (!config.signer.publicKey()) {
      throw new Error('Wallet not connected');
    }
    this.key = config.signer.publicKey();
    this.dummyWallet = config.dummyWallet ?? false;
    this.driftVaultsClient = new DriftVaultsClient(config);
    this.phoenixVaultsClient = new PhoenixVaultsClient(config);

    // autorun, react to updates to wallet
    autorun(() => {
      console.log('wallet updated');
    });
  }

  /**
   * Initialize the VaultClient.
   * Call this upon connecting a wallet.
   */
  async initialize(): Promise<void> {
    if (!this.signer) {
      throw new Error('Wallet not connected during initialization');
    }
    const now = Date.now();
    this.loading = true;
    await this.driftVaultsClient.initialize();
    await this.phoenixVaultsClient.initialize();
    await this.updateTokenBalanceListeners();
    await this.fetchWalletSol();
    await this.fetchWalletUsdc();
    console.log(`initialized PropShopClient in ${Date.now() - now}ms`);
    this.loading = false;
  }

  private async updateTokenBalanceListeners() {
    // websocket RPC subscribe to SOL balance update
    this._solSubId = this.conn.onAccountChange(this.key, (accountInfo) => {
      this._sol = accountInfo.lamports / LAMPORTS_PER_SOL;
    });
    // websocket RPC subscribe to SOL balance update
    const usdcAta = getAssociatedTokenAddressSync(
      this.phoenixVaultsClient.solUsdcMarket.usdcMint,
      this.key
    );
    this._usdcSubId = this.conn.onAccountChange(usdcAta, (accountInfo) => {
      const unpackedTokenAccount = unpackAccount(usdcAta, accountInfo);
      const usdcAmount = Number(unpackedTokenAccount.amount);
      // USDC has 6 decimals on all networks
      const decimals = 6;
      this._usdc = usdcAmount / 10 ** decimals;
    });
  }

  private setSigner(signer: AsyncSigner) {
    this.signer = signer;
    if (!signer.publicKey()) {
      throw new Error('Wallet not connected');
    }
    this.key = signer.publicKey();
  }

  async updateWallet(config: UpdateWalletConfig): Promise<void> {
    const now = Date.now();
    this.setSigner(config.signer);
    await this.driftVaultsClient.updateWallet(config);
    await this.phoenixVaultsClient.updateWallet(config);
    await this.updateTokenBalanceListeners();
    await this.fetchWalletSol();
    await this.fetchWalletUsdc();
    if (
      config.signer.publicKey() !== null &&
      this.signer.publicKey() !== null &&
      !this.signer.publicKey().equals(config.signer.publicKey())
    ) {
      console.error(
        `Wallet update failed: ${this.signer.publicKey()?.toString()}`
      );
    }
    if (
      this.signer.publicKey() === null ||
      !this.signer.publicKey().equals(this.key)
    ) {
      const walletKey = this.signer.publicKey()
        ? shortenAddress(this.signer.publicKey()?.toString())
        : null;
      console.error(
        `Wallet update failed, this.wallet: ${walletKey}, this.key: ${shortenAddress(this.key.toString())}`
      );
    }
    console.log(
      `updated wallet ${this.key.toString()} in ${Date.now() - now}ms`
    );
  }

  async shutdown(): Promise<void> {
    await this.driftVaultsClient.shutdown();
    await this.phoenixVaultsClient.shutdown();
    if (this._solSubId) {
      await this.conn.removeAccountChangeListener(this._solSubId);
    }
    if (this._usdcSubId) {
      await this.conn.removeAccountChangeListener(this._usdcSubId);
    }
  }

  isManager(fund: FundOverview): boolean {
    return this.key.equals(fund.manager);
  }

  isInvested(fund: FundOverview): boolean {
    return fund.investors.has(this.key.toString());
  }

  getInvestorAddress(config: { vault: PublicKey; venue: Venue }): PublicKey {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.getVaultDepositorAddress(config.vault);
    } else {
      return this.phoenixVaultsClient.getInvestorAddress(config.vault);
    }
  }

  get fundOverviews(): FundOverview[] {
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

  withdrawTimer(config: {
    venue: Venue;
    vault: PublicKey;
  }): WithdrawRequestTimer | undefined {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.withdrawTimer(config.vault);
    } else {
      return this.phoenixVaultsClient.withdrawTimer(config.vault);
    }
  }

  hasWithdrawRequest(config: { vault: PublicKey; venue: Venue }): boolean {
    return !!this.withdrawTimer(config);
  }

  async createWithdrawTimer(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<void> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.createWithdrawTimer(config.vault);
    } else {
      return this.phoenixVaultsClient.createWithdrawTimer(config.vault);
    }
  }

  async fetchEquityInVault(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<number | undefined> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.fetchEquityInVault(config.vault);
    } else {
      return this.phoenixVaultsClient.fetchInvestorEquity(config.vault);
    }
  }

  percentShare(config: { venue: Venue; vault: PublicKey }): number | undefined {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.percentShare(config.vault);
    } else {
      return this.phoenixVaultsClient.percentShare(config.vault);
    }
  }

  equityInVault(config: {
    vault: PublicKey;
    venue: Venue;
  }): number | undefined {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.equityInVault(config.vault);
    } else {
      return this.phoenixVaultsClient.equityInVault(config.vault);
    }
  }

  get sol(): number {
    return this._sol;
  }

  get usdc(): number {
    return this._usdc;
  }

  async fetchWalletSol(): Promise<number> {
    const sol = (await this.conn.getBalance(this.key)) / LAMPORTS_PER_SOL;
    this._sol = sol;
    return sol;
  }

  async fetchWalletUsdc(): Promise<number> {
    const usdc = (await this.driftVaultsClient.fetchWalletUsdc()) ?? 0;
    this._usdc = usdc;
    return usdc;
  }

  async airdropSol(): Promise<SnackInfo> {
    try {
      const signature = await this.conn.requestAirdrop(
        this.key,
        LAMPORTS_PER_SOL
      );
      await this.conn.confirmTransaction({
        signature,
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

  async airdropUsdc(usdc = 1000): Promise<SnackInfo> {
    const mint = TEST_USDC_MINT.publicKey;
    const mintAuthSigner = TEST_USDC_MINT_AUTHORITY;

    const ixs: TransactionInstruction[] = [];
    // USDC has 6 decimals which happens to be the same as the QUOTE_PRECISION
    const usdcAmount = new BN(usdc).mul(QUOTE_PRECISION);

    const usdcAta = getAssociatedTokenAddressSync(mint, this.key, true);
    const ataExists = await this.conn.getAccountInfo(usdcAta);
    if (ataExists === null) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          this.key,
          usdcAta,
          this.key,
          mint
        )
      );
    }

    ixs.push(
      createMintToInstruction(
        mint,
        usdcAta,
        mintAuthSigner.publicKey,
        usdcAmount.toNumber()
      )
    );

    try {
      return await this.sendTx(
        ixs,
        `Airdropped ${usdc} USDC`,
        `Failed to airdrop ${usdc} USDC`,
        [mintAuthSigner]
      );
    } catch (e: any) {
      console.error(e);
      return {
        variant: 'error',
        message: e.toString(),
      };
    }
  }

  private async sendTx(
    ixs: TransactionInstruction[],
    successMessage: string,
    errorMessage: string,
    signers: Signer[] = []
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
    tx.sign(signers);

    const sim = (
      await this.conn.simulateTransaction(tx, {
        sigVerify: false,
      })
    ).value;
    if (sim.err) {
      const msg = `${errorMessage}: ${JSON.stringify(sim.err)}}`;
      console.error(msg);
      return {
        variant: 'error',
        message: errorMessage,
      };
    }

    try {
      const sig = await this.conn.sendTransaction(tx, {
        skipPreflight: true,
      });
      console.debug(`${successMessage}: ${signatureLink(sig)}`);
      const confirm = await this.conn.confirmTransaction(sig);
      if (confirm.value.err) {
        console.error(`${errorMessage}: ${JSON.stringify(confirm.value.err)}`);
        return {
          variant: 'error',
          message: errorMessage,
        };
      } else {
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
  // Investor actions
  //

  async deposit(config: {
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

  async requestWithdraw(config: {
    venue: Venue;
    vault: PublicKey;
    usdc: number;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.requestWithdraw(config.vault, config.usdc);
    } else {
      return this.phoenixVaultsClient.requestWithdraw(
        config.vault,
        config.usdc
      );
    }
  }

  async cancelWithdrawRequest(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.cancelWithdrawRequest(config.vault);
    } else {
      return this.phoenixVaultsClient.cancelWithdrawRequest(config.vault);
    }
  }

  async withdraw(config: {
    venue: Venue;
    vault: PublicKey;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.withdraw(config.vault);
    } else {
      return this.phoenixVaultsClient.withdraw(config.vault);
    }
  }

  //
  // Manager actions
  //

  /**
   * The connected wallet will become the manager of the vault.
   */
  async createVault(config: CreateVaultConfig): Promise<{
    vault: PublicKey;
    snack: SnackInfo;
  }> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.createVault(config);
    } else {
      return this.phoenixVaultsClient.createVault(config);
    }
  }

  defaultUpdateVaultConfig(config: {
    venue: Venue;
    vault: PublicKey;
  }): UpdateVaultConfig {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.defaultUpdateVaultConfig(config.vault);
    } else {
      return this.phoenixVaultsClient.defaultUpdateVaultConfig(config.vault);
    }
  }

  /**
   * Can only reduce the profit share, management fee, or redeem period.
   * Unable to modify protocol fees.
   */
  async updateVault(config: {
    venue: Venue;
    vault: PublicKey;
    params: UpdateVaultConfig;
  }): Promise<SnackInfo> {
    if (config.venue === Venue.Drift) {
      return this.driftVaultsClient.updateVault(config.vault, config.params);
    } else {
      return this.phoenixVaultsClient.updateVault(config.vault, config.params);
    }
  }
}
