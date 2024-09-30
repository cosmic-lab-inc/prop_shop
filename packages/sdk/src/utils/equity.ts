import {BN} from '@coral-xyz/anchor';
import {Investor, MarketPosition, PERCENTAGE_PRECISION, Vault, ZERO,} from '@cosmic-lab/phoenix-vaults-sdk';
import {MarketState} from '@ellipsis-labs/phoenix-sdk';
import {UiTraderState} from '../types';
import {PublicKey} from '@solana/web3.js';

export function amountToShares(
  amount: BN,
  totalShares: BN,
  totalEquity: BN
): BN {
  let nShares: BN;
  if (totalEquity.gt(ZERO)) {
    nShares = amount.mul(totalShares).div(totalEquity);
  } else {
    nShares = amount;
  }

  return nShares;
}

export function sharesToAmount(
  nShares: BN,
  totalShares: BN,
  totalEquity: BN
): BN {
  let amount: BN;
  if (totalShares.gt(ZERO)) {
    amount = BN.max(ZERO, nShares.mul(totalEquity).div(totalShares));
  } else {
    amount = ZERO;
  }

  return amount;
}

// function calculateApplyProfitShare(
// 	investor: Investor,
// 	vaultEquity: BN,
// 	vault: Vault
// ): {
// 	profitShareAmount: BN;
// 	profitShareShares: BN;
// } {
// 	const amount = sharesToAmount(
// 		investor.vaultShares,
// 		vault.totalShares,
// 		vaultEquity
// 	);
// 	const profitShareAmount = calculateProfitShare(investor, amount, vault);
// 	const profitShareShares = amountToShares(
// 		profitShareAmount,
// 		vault.totalShares,
// 		vaultEquity
// 	);
// 	return {
// 		profitShareAmount,
// 		profitShareShares,
// 	};
// }

function calculateProfitShare(
  investor: Investor,
  totalAmount: BN,
  vault: Vault
) {
  const profit = totalAmount.sub(
    investor.netDeposits.add(investor.cumulativeProfitShareAmount)
  );
  const profitShare = vault.profitShare + vault.protocolProfitShare;
  if (profit.gt(ZERO)) {
    const profitShareAmount = profit
      .mul(new BN(profitShare))
      .div(PERCENTAGE_PRECISION);
    return profitShareAmount;
  }
  return ZERO;
}

export function calculateRealizedInvestorEquity(
  investor: Investor,
  vaultEquity: BN,
  vault: Vault
): BN {
  const investorAmount = sharesToAmount(
    investor.vaultShares,
    vault.totalShares,
    vaultEquity
  );
  const profitShareAmount = calculateProfitShare(
    investor,
    investorAmount,
    vault
  );
  return investorAmount.sub(profitShareAmount);
}

export function getTraderState(
  marketState: MarketState,
  trader: PublicKey
): UiTraderState | undefined {
  const traderState = marketState.data.traders.get(trader.toString());
  if (!traderState) {
    return undefined;
  }

  const quoteLotsFreeBigNum = traderState.quoteLotsFree;
  let quoteLotsFree: number;
  if (quoteLotsFreeBigNum instanceof BN) {
    quoteLotsFree = quoteLotsFreeBigNum.toNumber();
  } else {
    quoteLotsFree = quoteLotsFreeBigNum as number;
  }

  const quoteLotsLockedBigNum = traderState.quoteLotsLocked;
  let quoteLotsLocked: number;
  if (quoteLotsLockedBigNum instanceof BN) {
    quoteLotsLocked = quoteLotsLockedBigNum.toNumber();
  } else {
    quoteLotsLocked = quoteLotsLockedBigNum as number;
  }

  const baseLotsFreeBigNum = traderState.baseLotsFree;
  let baseLotsFree: number;
  if (baseLotsFreeBigNum instanceof BN) {
    baseLotsFree = baseLotsFreeBigNum.toNumber();
  } else {
    baseLotsFree = baseLotsFreeBigNum as number;
  }

  const baseLotsLockedBigNum = traderState.baseLotsLocked;
  let baseLotsLocked: number;
  if (baseLotsLockedBigNum instanceof BN) {
    baseLotsLocked = baseLotsLockedBigNum.toNumber();
  } else {
    baseLotsLocked = baseLotsLockedBigNum as number;
  }

  const quoteUnitsFree = marketState.quoteLotsToQuoteUnits(quoteLotsFree);
  const quoteUnitsLocked = marketState.quoteLotsToQuoteUnits(quoteLotsLocked);
  const baseUnitsFree = marketState.baseLotsToRawBaseUnits(baseLotsFree);
  const baseUnitsLocked = marketState.baseLotsToRawBaseUnits(baseLotsLocked);
  return {
    quoteUnitsFree,
    quoteUnitsLocked,
    baseUnitsFree,
    baseUnitsLocked,
  };
}

export function getMarketPrice(marketState: MarketState): number | undefined {
  const ladder = marketState.getUiLadder(1, 0, 0);
  const bestBid = ladder.bids[0];
  if (!bestBid) {
    return undefined;
  }
  return bestBid.price;
}

export function traderStateEquity(
  traderState: UiTraderState,
  price: number
): number {
  const baseEquity =
    (traderState.baseUnitsFree + traderState.baseUnitsLocked) * price;
  const quoteEquity = traderState.quoteUnitsFree + traderState.quoteUnitsLocked;
  return baseEquity + quoteEquity;
}

export function getTraderEquity(
  marketState: MarketState,
  trader: PublicKey
): number | undefined {
  const traderState = getTraderState(marketState, trader);
  const price = getMarketPrice(marketState);
  if (!traderState || !price) {
    return undefined;
  }
  return traderStateEquity(traderState, price);
}

export function isAvailable(position: MarketPosition) {
  return (
    position.baseLotsFree.eq(ZERO) &&
    position.baseLotsLocked.eq(ZERO) &&
    position.quoteLotsFree.eq(ZERO) &&
    position.quoteLotsLocked.eq(ZERO)
  );
}

export function marketsByEquity(
  marketStates: Map<string, MarketState>,
  trader: PublicKey
): MarketState[] {
  const markets = Array.from(marketStates.values());
  markets
    .filter((state) => getTraderEquity(state, trader) !== undefined)
    .sort((a, b) => {
      const equityA = getTraderEquity(a, trader);
      const equityB = getTraderEquity(b, trader);
      if (equityA === undefined || equityB === undefined) {
        throw new Error('Equity should be defined');
      }
      return equityB - equityA;
    });
  return markets;
}
