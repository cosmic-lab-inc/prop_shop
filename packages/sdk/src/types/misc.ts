export interface Data<K, V> {
  key: K;
  data: V;
}

export interface Timer {
  timer: NodeJS.Timeout;
  secondsRemaining: number;
}
