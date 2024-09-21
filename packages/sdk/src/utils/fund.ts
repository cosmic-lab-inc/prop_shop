import {FundOverview, Venue} from '../types';
import {PublicKey} from '@solana/web3.js';
import {getInvestorAddressSync} from "@cosmic-lab/phoenix-vaults-sdk";
import {getVaultDepositorAddressSync} from "@drift-labs/vaults-sdk";
import {DRIFT_VAULTS_PROGRAM_ID} from "../constants";

export function fundPctPnl(fund: FundOverview): number {
  if (fund.tvl === 0 || fund.tvl - fund.profit <= 0) {
    return 0;
  }
  return (fund.profit / (fund.tvl - fund.profit)) * 100;
}

export function fundDollarPnl(fund: FundOverview): number {
  return fund.profit;
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
    if (config.invested && fund.venue === Venue.Drift) {
      const vdKey = getVaultDepositorAddressSync(
        DRIFT_VAULTS_PROGRAM_ID,
        fund.vault,
        config.key
      );
      isInvested = fund.investors.has(vdKey.toString());
    }
    if (config.invested && fund.venue === Venue.Phoenix) {
      const investorKey = getInvestorAddressSync(
        fund.vault,
        config.key
      );
      isInvested = fund.investors.has(investorKey.toString());
    }
    return isManaged || isInvested;
  });
}
