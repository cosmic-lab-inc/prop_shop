import { PublicKey } from "@solana/web3.js";
import { OracleSource } from "@drift-labs/sdk";

export interface Data<K, V> {
  key: K;
  data: V;
}

export interface WithdrawRequestTimer {
  timer: NodeJS.Timeout;
  secondsRemaining: number;
  equity: number;
}

export interface DriftMarketInfo {
  marketIndex: number;
  oracle: PublicKey;
  oracleSource: OracleSource;
}

export interface SerializedDriftMarketInfo {
  marketIndex: number;
  oracle: string;
  oracleSource: OracleSource;
}

export interface Searchable<T> {
  title: string;
  data: T;
}
