export interface Data<K, V> {
  key: K;
  data: V;
}

export interface WithdrawRequestTimer {
  timer: NodeJS.Timeout;
  secondsRemaining: number;
  equity: number;
}
