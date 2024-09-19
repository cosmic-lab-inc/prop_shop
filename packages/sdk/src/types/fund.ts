import { BN } from '@coral-xyz/anchor';
import { QUOTE_PRECISION, SettlePnlRecord } from '@drift-labs/sdk';
import { PublicKey } from '@solana/web3.js';

export interface CreateVaultConfig {
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
	// Delegate with permission to trade on behalf of the vault's user
	delegate?: PublicKey;
}

export interface UpdateVaultConfig {
	// The period in seconds that investors must wait after requesting to redeem their funds
	redeemPeriod?: number;
	maxCapacityUSDC?: number;
	percentAnnualManagementFee?: number;
	minDepositUSDC?: number;
	percentProfitShare?: number;
	permissioned?: boolean;
	delegate?: PublicKey;
}

export interface FundOverview {
	vault: PublicKey;
	lifetimePNL: number;
	tvl: number;
	birth: Date;
	title: string;
	investors: number;
}

export interface HistoricalSettlePNL {
	pnl: number;
	user: string;
	base_asset_amount: number;
	quote_asset_amount_after: number;
	quote_entry_amount_before: number;
	settle_price: number;
	tx_sig: string;
	slot: BN;
	ts: BN;
	market_index: number;
	explanation: string;
	program_id: string;
}

export interface PNL {
	// USDC PNL multiplied by QUOTE_PRECISION (what is returned from RPC)
	pnl: number;
	// UNIX seconds since 1970
	ts: number;
}

export class VaultPnl {
	data: PNL[];

	constructor(data: PNL[]) {
		if (!data[0] || !data[data.length - 1]) {
			this.data = [];
		} else {
			// sort data from lowest to highest timestamp, so 0th index is oldest
			const series = data.sort((a, b) => Number(a.ts) - Number(b.ts));
			this.data = series;
		}
	}

	public static fromHistoricalSettlePNL(data: HistoricalSettlePNL[]): VaultPnl {
		const series: PNL[] = data.map((d) => {
			return {
				pnl: Number(d.pnl) / QUOTE_PRECISION.toNumber(),
				ts: Number(d.ts),
			};
		});
		return new VaultPnl(series);
	}

	public static fromSettlePnlRecord(data: SettlePnlRecord[]): VaultPnl {
		const series: PNL[] = data.map((d) => {
			return {
				pnl: Number(d.pnl.toNumber()) / QUOTE_PRECISION.toNumber(),
				ts: Number(d.ts.toNumber()),
			};
		});
		return new VaultPnl(series);
	}

	public cumulativeSeriesPNL(): number[] {
		const data: number[] = [];
		let cumSum: number = 0;
		for (const entry of this.data) {
			cumSum += Number(entry.pnl);
			data.push(cumSum);
		}
		return data;
	}

	public cumulativePNL(): number {
		let cumSum: number = 0;
		for (const entry of this.data) {
			cumSum += entry.pnl;
		}
		return cumSum;
	}

	public startDate(): Date | undefined {
		if (!this.data[0]) {
			return undefined;
		}
		const first = this.data[0];
		return new Date(Number(first.ts) * 1000);
	}

	public endDate(): Date | undefined {
		if (!this.data[this.data.length - 1]) {
			return undefined;
		}
		const last = this.data[this.data.length - 1];
		return new Date(Number(last.ts) * 1000);
	}
}
