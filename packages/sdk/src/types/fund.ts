import { BN } from "@coral-xyz/anchor";
import { QUOTE_PRECISION, SettlePnlRecord } from "@drift-labs/sdk";

export interface FundOverview {
  title: string;
  investors: number;
  aum: number;
  data: number[];
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

export class VaultPNL {
  data: PNL[];

  constructor(data: PNL[]) {
    if (data.length === 0) {
      throw new Error("No PNL data found");
    }
    const startTs = Number(data[0].ts);
    const endTs = Number(data[data.length - 1].ts);
    let series = data;
    if (endTs < startTs) {
      // sort data from lowest ts to highest so 0th index is oldest
      series = data.sort((a, b) => Number(a.ts) - Number(b.ts));
    }
    this.data = series;
  }

  public static fromHistoricalSettlePNL(data: HistoricalSettlePNL[]): VaultPNL {
    const series: PNL[] = data.map((d) => {
      return {
        pnl: Number(d.pnl) / QUOTE_PRECISION.toNumber(),
        ts: Number(d.ts),
      };
    });
    return new VaultPNL(series);
  }

  public static fromSettlePnlRecord(data: SettlePnlRecord[]): VaultPNL {
    const series: PNL[] = data.map((d) => {
      return {
        pnl: Number(d.pnl) / QUOTE_PRECISION.toNumber(),
        ts: Number(d.ts),
      };
    });
    return new VaultPNL(series);
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

  public startDate(): Date {
    const first = this.data[0];
    return new Date(Number(first.ts) * 1000);
  }

  public endDate(): Date {
    const last = this.data[this.data.length - 1];
    return new Date(Number(last.ts) * 1000);
  }
}
