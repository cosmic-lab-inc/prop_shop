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
