import {
	AccountMeta,
	ComputeBudgetProgram,
	ConfirmOptions,
	Connection,
	PublicKey,
	TransactionInstruction,
} from '@solana/web3.js';
import { makeAutoObservable } from 'mobx';
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import {
	calculateRealizedInvestorEquity,
	createPhoenixMarketTokenAccountIxs,
	fundDollarPnl,
	getTokenBalance,
	getTraderEquity,
	percentPrecisionToPercent,
	percentToPercentPrecision,
	walletAdapterToAnchorWallet,
} from '../utils';
import {
	CreateVaultConfig,
	Data,
	FundOverview,
	PhoenixSubscriber,
	PhoenixVaultsAccountEvents,
	SnackInfo,
	UpdateVaultConfig,
	Venue,
	WithdrawRequestTimer,
} from '../types';
import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { PhoenixWebsocketSubscriber } from '../phoenixWebsocketSubscriber';
import {
	Client as PhoenixClient,
	getLogAuthority,
	getSeatAddress,
} from '@ellipsis-labs/phoenix-sdk';
import {
	encodeName,
	getInvestorAddressSync,
	getMarketRegistryAddressSync,
	getVaultAddressSync,
	IDL as PHOENIX_VAULTS_IDL,
	Investor,
	LOCALNET_MARKET_CONFIG,
	PHOENIX_PROGRAM_ID,
	PHOENIX_VAULTS_PROGRAM_ID,
	PhoenixVaults,
	Vault,
	VaultParams,
	WithdrawUnit,
} from '@cosmic-lab/phoenix-vaults-sdk';
import { decodeName, QUOTE_PRECISION } from '@drift-labs/sdk';
import { err, ok, Result } from 'neverthrow';
import { CreatePropShopClientConfig, UpdateWalletConfig } from './types';
import {
	createAssociatedTokenAccountInstruction,
	getAssociatedTokenAddressSync,
	TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { walletAdapterToAsyncSigner } from '@cosmic-lab/data-source';
import { signatureLink } from '../rpc';
import {
	ONE_DAY,
	PROP_SHOP_PERCENT_ANNUAL_FEE,
	PROP_SHOP_PERCENT_PROFIT_SHARE,
	PROP_SHOP_PROTOCOL,
} from '../constants';

interface SolUsdcMarketConfig {
	market: PublicKey;
	solMint: PublicKey;
	usdcMint: PublicKey;
}

export class PhoenixVaultsClient {
	private readonly conn: Connection;
	private wallet: WalletContextState;
	_phoenixClient: PhoenixClient | undefined;
	_program: Program<PhoenixVaults> | undefined;
	_solUsdcMarket: SolUsdcMarketConfig | undefined;

	loading = false;
	private readonly disableCache: boolean = false;
	dummyWallet = false;

	private eventEmitter: StrictEventEmitter<
		EventEmitter,
		PhoenixVaultsAccountEvents
	> = new EventEmitter();
	private _cache: PhoenixSubscriber | undefined = undefined;

	private _vaults: Map<string, Vault> = new Map();
	private _investors: Map<string, Investor> = new Map();
	private _timers: Map<string, WithdrawRequestTimer> = new Map();
	// Equity in each vault for the connected wallet
	private _equities: Map<string, number> = new Map();
	private _fundOverviews: Map<string, FundOverview> = new Map();

	constructor(config: CreatePropShopClientConfig) {
		makeAutoObservable(this);
		this.wallet = config.wallet;
		this.conn = config.connection;
		this.disableCache = config.disableCache ?? false;
		this.dummyWallet = config.dummyWallet ?? false;
	}

	//
	// Initialization and getters
	//

	/**
	 * Initialize the client.
	 * Call this upon connecting a wallet.
	 */
	public async initialize(): Promise<void> {
		if (!this.wallet) {
			throw new Error('Wallet not connected during initialization');
		}
		const now = Date.now();
		this.loading = true;

		const provider = new anchor.AnchorProvider(
			this.conn,
			walletAdapterToAnchorWallet(this.wallet),
			{
				preflightCommitment: 'confirmed',
				skipPreflight: false,
				commitment: 'confirmed',
			} as ConfirmOptions
		);
		this._program = new Program(
			PHOENIX_VAULTS_IDL,
			PHOENIX_VAULTS_PROGRAM_ID,
			provider
		);

		if (this.conn.rpcEndpoint === 'http://localhost:8899') {
			const now = Date.now();
			this._phoenixClient = await PhoenixClient.createFromConfig(
				this.conn,
				LOCALNET_MARKET_CONFIG,
				false,
				false
			);
			console.log(`loaded localnet Phoenix markets in ${Date.now() - now}ms`);
		} else {
			const now = Date.now();
			this._phoenixClient = await PhoenixClient.create(this.conn);
			console.log(`loaded Phoenix markets in ${Date.now() - now}ms`);
		}
		const registry = await this._program.account.marketRegistry.fetch(
			getMarketRegistryAddressSync()
		);
		const solUsdcMarketKeyValue = Array.from(
			this._phoenixClient.marketConfigs.entries()
		).find(([_, market]) => {
			return (
				market.baseToken.mint === registry.solMint.toString() &&
				market.quoteToken.mint === registry.usdcMint.toString()
			);
		});
		if (!solUsdcMarketKeyValue) {
			throw new Error('SOL/USDC market not found');
		}
		const [solUsdcMarketStr, solUsdcMarketConfig] = solUsdcMarketKeyValue;
		this._solUsdcMarket = {
			market: new PublicKey(solUsdcMarketStr),
			solMint: new PublicKey(solUsdcMarketConfig.baseToken.mint),
			usdcMint: new PublicKey(solUsdcMarketConfig.quoteToken.mint),
		};

		this.eventEmitter.on(
			'investorUpdate',
			(payload: Data<PublicKey, Investor>) => {
				const update = JSON.stringify(payload.data);
				const existing = JSON.stringify(
					this._investors.get(payload.key.toString())
				);
				if (update !== existing) {
					this._investors.set(payload.key.toString(), payload.data);
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
			await this.loadCache(this._program);
			console.log(`PhoenixVaults cache loaded in ${Date.now() - preSub}ms`);
		}

		console.log(`initialized PhoenixVaultsClient in ${Date.now() - now}ms`);
		this.loading = false;
	}

	async loadCache(program: Program<PhoenixVaults>) {
		if (this.disableCache) {
			return;
		}
		this._cache = new PhoenixWebsocketSubscriber(
			program,
			{
				filters: [
					{
						accountName: 'investor',
						eventType: 'investorUpdate',
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
		const now = Date.now();
		this.dummyWallet = config.dummyWallet ?? false;
		this.wallet = config.wallet;

		// update VaultClient wallet
		const anchorWallet = walletAdapterToAnchorWallet(this.wallet);
		const newProvider = new AnchorProvider(this.conn, anchorWallet, {
			commitment: 'confirmed',
		});
		this._program = new Program(
			PHOENIX_VAULTS_IDL,
			this.program.programId,
			newProvider
		);

		console.log(`updated wallet in ${Date.now() - now}ms`);
	}

	async shutdown(): Promise<void> {
		await this._cache?.unsubscribe();
	}

	//
	// Getters and utils
	//

	public get phoenixClient(): PhoenixClient {
		if (!this._phoenixClient) {
			throw new Error('PhoenixVaultsClient not initialized');
		}
		return this._phoenixClient;
	}

	public get program(): Program<PhoenixVaults> {
		if (!this._program) {
			throw new Error('PhoenixVaultsClient not initialized');
		}
		return this._program;
	}

	get publicKey(): PublicKey {
		if (!this.wallet.publicKey) {
			throw new Error('Wallet not connected');
		}
		return this.wallet.publicKey;
	}

	get solUsdcMarket(): SolUsdcMarketConfig {
		if (!this._solUsdcMarket) {
			throw new Error('PhoenixVaultsClient not initialized');
		}
		return this._solUsdcMarket;
	}

	get marketAccountMetas(): AccountMeta[] {
		return Array.from(this.phoenixClient.marketStates.keys()).map((market) => {
			return {
				pubkey: new PublicKey(market),
				isWritable: false,
				isSigner: false,
			};
		});
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
		if (vaultAcct.protocol.equals(this.publicKey)) {
			return ok(true);
		} else {
			return ok(false);
		}
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

	public getInvestorAddress(vault: PublicKey) {
		return getInvestorAddressSync(vault, this.publicKey);
	}

	private async sendTx(
		ixs: TransactionInstruction[],
		successMessage: string,
		errorMessage: string
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

		// const ixReturns: InstructionReturn[] = instructions.map((ix) => {
		//   return () => {
		//     return Promise.resolve({
		//       instruction: ix,
		//       signers: [],
		//     });
		//   };
		// });
		// const funder = walletAdapterToAsyncSigner(this.wallet);
		// const result = await sendTransactionWithResult(ixReturns, funder, this.conn);
		// if (result.isErr()) {
		//   console.error(`${errorMessage}: ${JSON.stringify(result.error)}`);
		//   return {
		//     variant: 'error',
		//     message: errorMessage,
		//   };
		// } else {
		//   console.debug(`${successMessage}: ${signatureLink(result.value)}`);
		//   return {
		//     variant: 'success',
		//     message: successMessage,
		//   };
		// }

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
	// State and cache
	//

	public vault(key: PublicKey): Data<PublicKey, Vault> | undefined {
		const data = this._vaults.get(key.toString());
		if (!data) {
			return;
		} else {
			return {
				key,
				data,
			};
		}
	}

	public managedVaults(): Data<PublicKey, Vault>[] {
		// @ts-ignore ... Vault type omits padding fields, but this is safe.
		const vaults = this.vaults();
		return vaults.filter((v) => {
			return v.data.manager === this.publicKey;
		});
	}

	public investedVaults(): PublicKey[] {
		const investors = this.investors(true);
		return investors.map((vd) => vd.data.vault);
	}

	public async fetchVault(key: PublicKey): Promise<Vault | undefined> {
		try {
			// @ts-ignore ... Vault type omits padding fields, but this is safe.
			const vault: Vault = await this.vaultProgram.account.vault.fetch(key);
			this._vaults.set(key.toString(), vault);
			return vault;
		} catch (e: any) {
			return undefined;
		}
	}

	public async fetchInvestor(key: PublicKey): Promise<Investor | undefined> {
		try {
			const investor: Investor = await this.program.account.investor.fetch(key);
			this._investors.set(key.toString(), investor);
			return investor;
		} catch (e: any) {
			return undefined;
		}
	}

	public vaults(filters?: {
		managed?: boolean;
		invested?: boolean;
	}): Data<PublicKey, Vault>[] {
		const vaults = Array.from(this._vaults.entries())
			.filter(([_key, value]) => {
				const managedFilter = filters?.managed
					? value.manager.equals(this.publicKey)
					: true;
				const investedFilter = filters?.invested
					? this.investedVaults()
							.map((k) => k.toString())
							.includes(value.pubkey.toString())
					: true;
				return managedFilter && investedFilter;
			})
			.map(([key, data]) => {
				return {
					key: new PublicKey(key),
					data,
				};
			}) as Data<PublicKey, Vault>[];
		return vaults;
	}

	public investor(key: PublicKey): Data<PublicKey, Investor> | undefined {
		const data = this._investors.get(key.toString());
		if (!data) {
			return undefined;
		} else {
			return {
				key,
				data,
			};
		}
	}

	public async getOrFetchInvestor(key: PublicKey) {
		const investor = this.investor(key)?.data;
		if (!investor) {
			const _investor = await this.fetchInvestor(key);
			if (!_investor) {
				throw new Error(`Investor ${key.toString()} not found`);
			} else {
				return _investor;
			}
		} else {
			return investor;
		}
	}

	public investors(filterByAuthority?: boolean): Data<PublicKey, Investor>[] {
		if (!this._cache) {
			throw new Error('Cache not initialized');
		}
		// account subscriber fetches upon subscription, so these should never be undefined
		const investors = Array.from(this._investors.entries())
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
			}) as Data<PublicKey, Investor>[];
		return investors;
	}

	//
	// Fetch and aggregate data
	//

	public async fetchVaultEquity(vault: Vault): Promise<number> {
		await this.phoenixClient.refreshAllMarkets(false);
		let equity = 0;
		const vaultUsdc = await getTokenBalance(this.conn, vault.usdcTokenAccount);
		equity += vaultUsdc;
		for (const marketState of Array.from(
			this.phoenixClient.marketStates.values()
		)) {
			equity += getTraderEquity(marketState, vault.pubkey);
		}
		return equity;
	}

	public async fetchInvestorEquity(
		vaultKey: PublicKey
	): Promise<number | undefined> {
		const vault = this.vault(vaultKey)?.data;
		if (!vault) {
			throw new Error(`Vault ${vaultKey.toString()} not found`);
		}

		const investor = this.investor(
			getInvestorAddressSync(vaultKey, this.publicKey)
		)?.data;
		if (!investor) {
			return undefined;
		}
		const vaultEquity = await this.fetchVaultEquity(vault);
		const vaultEquityBN = new BN(vaultEquity * QUOTE_PRECISION.toNumber());
		const investorEquityBN = calculateRealizedInvestorEquity(
			investor,
			vaultEquityBN,
			vault
		);
		// const usdc = investorEquityBN.toNumber() / QUOTE_PRECISION.toNumber();
		const usdc = investorEquityBN.div(QUOTE_PRECISION).toNumber();
		this._equities.set(vault.pubkey.toString(), usdc);
		return usdc;
	}

	public equityInVault(vault: PublicKey): number | undefined {
		return this._equities.get(vault.toString());
	}

	private setFundOverview(key: PublicKey, fo: FundOverview) {
		this._fundOverviews.set(key.toString(), fo);
	}

	public async fetchFundOverview(
		vaultKey: PublicKey
	): Promise<FundOverview | undefined> {
		const vault = this.vault(vaultKey)?.data;
		if (!vault) {
			return undefined;
		}
		const vaultInvestors = new Map<string, Map<string, number>>();
		for (const investor of this.investors()) {
			const vaultKey = investor.data.vault.toString();
			const investors = vaultInvestors.get(vaultKey) ?? new Map();
			const totalProfit =
				investor.data.cumulativeProfitShareAmount.toNumber() /
				QUOTE_PRECISION.toNumber();
			investors.set(investor.key.toString(), totalProfit);
			vaultInvestors.set(vaultKey, investors);
		}

		const investors = vaultInvestors.get(vault.pubkey.toString()) ?? new Map();
		const investorProfit = (Array.from(investors.values()) as number[]).reduce(
			(a: number, b: number) => a + b,
			0
		);
		const managerProfit =
			vault.managerTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();
		const protocolProfit =
			vault.protocolTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();

		const fo: FundOverview = {
			vault: vault.pubkey,
			manager: vault.manager,
			venue: Venue.Phoenix,
			investorProfit,
			managerProfit,
			protocolProfit,
			profit: investorProfit,
			profitAfterFees: investorProfit - managerProfit - protocolProfit,
			tvl: await this.fetchVaultEquity(vault),
			birth: new Date(Number(vault.initTs.toNumber() * 1000)),
			title: decodeName(vault.name),
			investors,
		};
		this.setFundOverview(vault.pubkey, fo);
		return fo;
	}

	public async fetchFundOverviews(): Promise<FundOverview[]> {
		const vaultInvestors = new Map<string, Map<string, number>>();
		for (const investor of this.investors()) {
			const vaultKey = investor.data.vault.toString();
			const investors = vaultInvestors.get(vaultKey) ?? new Map();
			const totalProfit =
				investor.data.cumulativeProfitShareAmount.toNumber() /
				QUOTE_PRECISION.toNumber();
			investors.set(investor.key.toString(), totalProfit);
			vaultInvestors.set(vaultKey, investors);
		}

		const fundOverviews: FundOverview[] = [];
		for (const _vault of this.vaults()) {
			const vault = _vault.data;
			const investors =
				vaultInvestors.get(vault.pubkey.toString()) ?? new Map();
			const investorProfit = (
				Array.from(investors.values()) as number[]
			).reduce((a: number, b: number) => a + b, 0);
			const managerProfit =
				vault.managerTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();
			const protocolProfit =
				vault.protocolTotalProfitShare.toNumber() / QUOTE_PRECISION.toNumber();

			const fo: FundOverview = {
				vault: vault.pubkey,
				manager: vault.manager,
				venue: Venue.Phoenix,
				investorProfit,
				managerProfit,
				protocolProfit,
				profit: investorProfit,
				profitAfterFees: investorProfit - managerProfit - protocolProfit,
				tvl: await this.fetchVaultEquity(vault),
				birth: new Date(Number(vault.initTs.toNumber() * 1000)),
				title: decodeName(vault.name),
				investors,
			};
			fundOverviews.push(fo);
			this.setFundOverview(vault.pubkey, fo);
		}
		return fundOverviews;
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

	//
	// Withdraw timers
	//

	public withdrawTimer(vault: PublicKey): WithdrawRequestTimer | undefined {
		return this._timers.get(vault.toString());
	}

	private async createInvestorWithdrawTimer(vault: PublicKey): Promise<void> {
		const vaultAcct = this.vault(vault)?.data;
		if (!vaultAcct) {
			throw new Error(`Vault ${vault.toString()} not found`);
		}
		const investorKey = getInvestorAddressSync(vault, this.publicKey);

		// force fetch of vault and vaultDepositor accounts in case websocket is slow to update
		await this.fetchVault(vault);
		await this.fetchInvestor(investorKey);

		const investorAcct = this.investor(investorKey)?.data;
		if (!investorAcct) {
			this.removeWithdrawTimer(vault);
			return;
		}
		const reqTs = investorAcct.lastWithdrawRequest.ts.toNumber();

		if (
			investorAcct.lastWithdrawRequest.value.toNumber() === 0 ||
			reqTs === 0
		) {
			this.removeWithdrawTimer(vault);
			return;
		}

		const equity =
			investorAcct.lastWithdrawRequest.value.toNumber() /
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

		const reqTs = vaultAcct.lastProtocolWithdrawRequest.ts.toNumber();
		if (
			vaultAcct.lastProtocolWithdrawRequest.value.toNumber() === 0 ||
			reqTs === 0
		) {
			this.removeWithdrawTimer(vault);
			return;
		}

		const equity =
			vaultAcct.lastProtocolWithdrawRequest.value.toNumber() /
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
		await this.createInvestorWithdrawTimer(vault);
	}

	private removeWithdrawTimer(vault: PublicKey) {
		const result = this._timers.get(vault.toString());
		if (result) {
			clearInterval(result.timer);
		}
		this._timers.delete(vault.toString());
	}

	//
	// Investor actions
	//

	public async deposit(vaultKey: PublicKey, usdc: number): Promise<SnackInfo> {
		const vault = this.vault(vaultKey)?.data;
		if (!vault) {
			return {
				variant: 'error',
				message: `Vault ${vaultKey.toString()} not found`,
			};
		}
		const solUsdcMarket = this.solUsdcMarket;
		const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
			solUsdcMarket.solMint,
			vaultKey,
			true
		);
		const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
			solUsdcMarket.usdcMint,
			vaultKey,
			true
		);
		const marketBaseTokenAccount = this.phoenixClient.getBaseVaultKey(
			solUsdcMarket.market.toString()
		);
		const marketQuoteTokenAccount = this.phoenixClient.getQuoteVaultKey(
			solUsdcMarket.market.toString()
		);
		const investorKey = getInvestorAddressSync(vaultKey, this.publicKey);
		const marketRegistry = getMarketRegistryAddressSync();
		const registryAcct =
			await this.program.account.marketRegistry.fetch(marketRegistry);
		const investorQuoteTokenAccount = getAssociatedTokenAddressSync(
			solUsdcMarket.usdcMint,
			this.publicKey
		);

		const ixs: TransactionInstruction[] = [];
		const investorUsdcExists = await this.conn.getAccountInfo(
			investorQuoteTokenAccount
		);
		if (investorUsdcExists === null) {
			ixs.push(
				createAssociatedTokenAccountInstruction(
					this.publicKey,
					investorQuoteTokenAccount,
					this.publicKey,
					solUsdcMarket.usdcMint
				)
			);
		}

		const investor = this.investor(investorKey)?.data;
		if (!investor) {
			ixs.push(
				await this.program.methods
					.initializeInvestor()
					.accounts({
						vault: vaultKey,
						investor: investorKey,
						authority: this.publicKey,
					})
					.instruction()
			);
		}

		const usdcAmount = new BN(usdc).mul(QUOTE_PRECISION);
		ixs.push(
			await this.program.methods
				.investorDeposit(usdcAmount)
				.accounts({
					vault: vaultKey,
					investor: investorKey,
					authority: this.publicKey,
					marketRegistry,
					lut: registryAcct.lut,
					investorQuoteTokenAccount,
					phoenix: PHOENIX_PROGRAM_ID,
					logAuthority: getLogAuthority(),
					market: solUsdcMarket.market,
					seat: getSeatAddress(solUsdcMarket.market, vaultKey),
					baseMint: solUsdcMarket.solMint,
					quoteMint: solUsdcMarket.usdcMint,
					vaultBaseTokenAccount,
					vaultQuoteTokenAccount,
					marketBaseTokenAccount,
					marketQuoteTokenAccount,
				})
				.remainingAccounts(this.marketAccountMetas)
				.instruction()
		);
		const snack = await this.sendTx(
			ixs,
			`Deposited to ${decodeName(vault.name)}`,
			`Failed to deposit to ${decodeName(vault.name)}`
		);
		await this.fetchInvestorEquity(vaultKey);
		await this.fetchFundOverview(vaultKey);
		return snack;
	}

	public async requestWithdraw(
		vaultKey: PublicKey,
		usdc: number
	): Promise<SnackInfo> {
		const investorKey = getInvestorAddressSync(vaultKey, this.publicKey);
		const amount = new BN(usdc * QUOTE_PRECISION.toNumber());
		const marketRegistry = getMarketRegistryAddressSync();
		const lut = (
			await this.program.account.marketRegistry.fetch(marketRegistry)
		).lut;
		const vault = this.vault(vaultKey)?.data;
		if (!vault) {
			return {
				variant: 'error',
				message: `Vault ${vaultKey.toString()} not found`,
			};
		}
		const vaultUsdcTokenAccount = vault.usdcTokenAccount;
		const ix = await this.program.methods
			.requestWithdraw(amount, WithdrawUnit.TOKEN)
			.accounts({
				vault: vaultKey,
				investor: investorKey,
				authority: this.publicKey,
				marketRegistry,
				lut,
				vaultUsdcTokenAccount,
			})
			.remainingAccounts(this.marketAccountMetas)
			.instruction();
		const snack = await this.sendTx(
			[ix],
			`Requested withdrawal of $${usdc} from ${decodeName(vault.name)}`,
			`Failed to request withdrawal of $${usdc} from ${decodeName(vault.name)}`
		);
		await this.fetchInvestorEquity(vaultKey);
		await this.fetchFundOverviews();
		// cache timer so frontend can track withdraw request
		await this.createWithdrawTimer(vaultKey);
		return snack;
	}

	public async withdraw(vaultKey: PublicKey): Promise<SnackInfo> {
		const vault = this.vault(vaultKey)?.data;
		if (!vault) {
			return {
				variant: 'error',
				message: `Vault ${vaultKey.toString()} not found`,
			};
		}
		const investorKey = getInvestorAddressSync(vaultKey, this.publicKey);
		const marketRegistry = getMarketRegistryAddressSync();
		const lut = (
			await this.program.account.marketRegistry.fetch(marketRegistry)
		).lut;
		const investorQuoteTokenAccount = getAssociatedTokenAddressSync(
			this.solUsdcMarket.usdcMint,
			this.publicKey
		);
		const vaultBaseTokenAccount = getAssociatedTokenAddressSync(
			this.solUsdcMarket.solMint,
			vaultKey,
			true
		);
		const vaultQuoteTokenAccount = getAssociatedTokenAddressSync(
			this.solUsdcMarket.usdcMint,
			vaultKey,
			true
		);

		const ix = await this.program.methods
			.investorWithdraw()
			.accounts({
				vault: vaultKey,
				investor: investorKey,
				authority: this.publicKey,
				marketRegistry,
				lut,
				investorQuoteTokenAccount,
				phoenix: PHOENIX_PROGRAM_ID,
				logAuthority: getLogAuthority(),
				market: this.solUsdcMarket.market,
				seat: getSeatAddress(this.solUsdcMarket.market, vaultKey),
				baseMint: this.solUsdcMarket.solMint,
				quoteMint: this.solUsdcMarket.usdcMint,
				vaultBaseTokenAccount,
				vaultQuoteTokenAccount,
				marketBaseTokenAccount: this.phoenixClient.getBaseVaultKey(
					this.solUsdcMarket.market.toString()
				),
				marketQuoteTokenAccount: this.phoenixClient.getQuoteVaultKey(
					this.solUsdcMarket.market.toString()
				),
				tokenProgram: TOKEN_PROGRAM_ID,
			})
			.remainingAccounts(this.marketAccountMetas)
			.instruction();
		const snack = await this.sendTx(
			[ix],
			`Withdrew from ${decodeName(vault.name)}`,
			`Failed to withdraw from ${decodeName(vault.name)}`
		);
		this.removeWithdrawTimer(vaultKey);
		await this.fetchInvestorEquity(vaultKey);
		await this.fetchFundOverview(vaultKey);
		return snack;
	}

	public async createVault(params: CreateVaultConfig): Promise<{
		vault: PublicKey;
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

		const vaultKey = getVaultAddressSync(encodeName(params.name));
		const marketState = this.phoenixClient.marketStates.get(
			this.solUsdcMarket.market.toString()
		);
		if (marketState === undefined) {
			throw Error('SOL/USDC market not found');
		}

		const config: VaultParams = {
			name: encodeName(params.name),
			redeemPeriod,
			maxTokens,
			managementFee,
			minDepositAmount,
			profitShare,
			hurdleRate: 0,
			permissioned,
			protocol: PROP_SHOP_PROTOCOL,
			protocolFee: percentToPercentPrecision(PROP_SHOP_PERCENT_ANNUAL_FEE),
			protocolProfitShare: percentToPercentPrecision(
				PROP_SHOP_PERCENT_PROFIT_SHARE
			).toNumber(),
		};
		const createAtaIxs = await createPhoenixMarketTokenAccountIxs(
			this.conn,
			marketState,
			vaultKey,
			this.publicKey
		);
		const createVaultIx = await this.program.methods
			.initializeVault(config)
			.accounts({
				vault: vaultKey,
				usdcTokenAccount: getAssociatedTokenAddressSync(
					this.solUsdcMarket.usdcMint,
					vaultKey,
					true
				),
				usdcMint: this.solUsdcMarket.usdcMint,
				solTokenAccount: getAssociatedTokenAddressSync(
					this.solUsdcMarket.solMint,
					vaultKey,
					true
				),
				solMint: this.solUsdcMarket.solMint,
				manager: this.publicKey,
			})
			.instruction();
		const snack = await this.sendTx(
			[...createAtaIxs, createVaultIx],
			`Created vault: ${params.name}`,
			`Failed to create vault: ${params.name}`
		);
		const vault = await this.fetchVault(vaultKey);
		if (!vault) {
			return {
				vault: vaultKey,
				snack: {
					variant: 'error',
					message: `Vault ${vaultKey.toString()} not found`,
				},
			};
		}
		await this.fetchInvestorEquity(vaultKey);
		await this.fetchFundOverview(vaultKey);
		return {
			vault: vaultKey,
			snack,
		};
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
}