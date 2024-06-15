export interface ChainClockData {
  epoch: number;
  epochStartTimestamp: number;
  leaderScheduleEpoch: number;
  slot: number;
  unixTimestamp: number;
}

export interface ChainClockAccountInfo {
  parsed: {
    info: ChainClockData;
  };
}
