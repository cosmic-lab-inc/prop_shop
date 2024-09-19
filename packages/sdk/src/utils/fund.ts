import {FundOverview} from '../types';
import {PublicKey} from "@solana/web3.js";

export function fundPctPnl(fund: FundOverview): number {
  if (fund.tvl === 0 || fund.tvl - fund.lifetimePNL <= 0) {
    return 0;
  }
  return (fund.lifetimePNL / (fund.tvl - fund.lifetimePNL)) * 100;
}

export function fundDollarPnl(fund: FundOverview): number {
  return fund.lifetimePNL;
}

/*
  * Returns no funds unless the fund is managed by the manager or invested by the investor
 */
export function OrFilterFunds(config: {
  key: PublicKey;
  funds: FundOverview[];
  managed?: boolean;
  invested?: boolean;
}): FundOverview[] {
  return config.funds.filter((fund) => {
    let isManaged = false;
    if (config.managed) {
      isManaged = fund.manager.equals(config.key);
    }

    let isInvested = false;
    if (config.invested) {
      isInvested = fund.investors.has(config.key.toString());
    }
    return isManaged || isInvested;
  });
}