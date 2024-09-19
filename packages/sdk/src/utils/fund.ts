import {FundOverview} from '../types';

export function fundPctPnl(fund: FundOverview): number {
  if (fund.tvl === 0 || fund.tvl - fund.lifetimePNL <= 0) {
    return 0;
  }
  return (fund.lifetimePNL / (fund.tvl - fund.lifetimePNL)) * 100;
}

export function fundDollarPnl(fund: FundOverview): number {
  return fund.lifetimePNL;
}