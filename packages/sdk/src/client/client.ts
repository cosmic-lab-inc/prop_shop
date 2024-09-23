import {
	ComputeBudgetProgram,
	Connection,
	LAMPORTS_PER_SOL,
	PublicKey,
	Signer,
	TransactionConfirmationStrategy,
	TransactionInstruction,
} from '@solana/web3.js';
import { makeAutoObservable } from 'mobx';
import { CreatePropShopClientConfig, UpdateWalletConfig } from './types';
import { Vault } from '@drift-labs/vaults-sdk';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { DriftVaultsClient } from './drift';
import { PhoenixVaultsClient } from './phoenix';
import {
	CreateVaultConfig,
	Data,
	FundOverview,
	SnackInfo,
	UpdateVaultConfig,
	Venue,
	WithdrawRequestTimer,
} from '../types';
import { fundDollarPnl } from '../utils';
import { signatureLink } from '../rpc';
import { walletAdapterToAsyncSigner } from '@cosmic-lab/data-source';
import { TEST_USDC_MINT, TEST_USDC_MINT_AUTHORITY } from '../constants';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { QUOTE_PRECISION } from '@drift-labs/sdk';
import {
	createAssociatedTokenAccountInstruction,
	createMintToInstruction,
	getAssociatedTokenAddressSync,
} from '@solana/spl-token';

export class PropShopClient {
	private readonly conn: Connection;
	private wallet: WalletContextState;
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
		this.wallet = config.wallet;
		await this.driftVaultsClient.updateWallet(config);
		await this.phoenixVaultsClient.updateWallet(config);
		console.log(
			`updated wallet ${this.publicKey.toString()} in ${Date.now() - now}ms`
		);
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
		const { venue, ...rest } = config;
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

	public async airdropUsdc(usdc = 1000): Promise<SnackInfo> {
		const mint = TEST_USDC_MINT.publicKey;
		const mintAuthSigner = TEST_USDC_MINT_AUTHORITY;

		const ixs: TransactionInstruction[] = [];
		// USDC has 6 decimals which happens to be the same as the QUOTE_PRECISION
		const usdcAmount = new BN(usdc).mul(QUOTE_PRECISION);

		const usdcAta = getAssociatedTokenAddressSync(mint, this.publicKey, true);
		const ataExists = await this.conn.getAccountInfo(usdcAta);
		if (ataExists === null) {
			ixs.push(
				createAssociatedTokenAccountInstruction(
					this.publicKey,
					usdcAta,
					this.publicKey,
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
			payerKey: this.publicKey,
			recentBlockhash,
			instructions,
		}).compileToV0Message();
		let tx = new anchor.web3.VersionedTransaction(msg);
		const funder = walletAdapterToAsyncSigner(this.wallet);
		tx = await funder.sign(tx);
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
			return this.phoenixVaultsClient.requestWithdraw(
				config.vault,
				config.usdc
			);
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
			return this.phoenixVaultsClient.withdraw(config.vault);
		}
	}

	//
	// Manager actions
	//

	/**
	 * The connected wallet will become the manager of the vault.
	 */
	public async createVault(config: CreateVaultConfig): Promise<{
		vault: PublicKey;
		snack: SnackInfo;
	}> {
		if (config.venue === Venue.Drift) {
			return this.driftVaultsClient.createVault(config);
		} else {
			return this.phoenixVaultsClient.createVault(config);
		}
	}

	public defaultUpdateVaultConfig(config: {
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
