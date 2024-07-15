import { BN } from "@coral-xyz/anchor";

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

export class VaultPNL {
  data: HistoricalSettlePNL[];

  constructor(data: HistoricalSettlePNL[]) {
    if (data.length === 0) {
      throw new Error("No PNL data found");
    }
    this.data = data;
  }

  public cumulativePNL(): number {
    let cumSum: number = 0;
    for (const entry of this.data) {
      cumSum += Number(entry.pnl);
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

  public dateString(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const day = date.getDate();
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    return `${year}/${monthStr}/${dayStr}`;
  }
}
