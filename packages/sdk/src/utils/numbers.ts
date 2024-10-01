import {BN} from '@coral-xyz/anchor';
import {PERCENTAGE_PRECISION} from '@drift-labs/sdk';

// add commas to numbers every 3 powers of ten
export function formatNumber(num: number): string {
  if (Math.abs(num) < 1000) {
    return num.toString();
  }
  // if greater than 1000, add a comma every 3 digits, but not for decimals after the .
  const parts = num.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] ? `.${parts[1]}` : '';
  const formattedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formattedIntegerPart}${decimalPart}`;
}

export function prettyNumber(num: number): string {
  // 519,245,978.83 to 519.24M
  if (Math.abs(num) >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toFixed(2).toString();
}

// truncate number to N decimals
export function truncateNumber(number: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}

// generate random number between min and max
export function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Example: 100_000 = 10%, so 10% / 100 = 0.1 * PERCENTAGE_PRECISION = 100_000
export function percentToPercentPrecision(percent: number): BN {
  return new BN((percent / 100) * PERCENTAGE_PRECISION.toNumber());
}

// Example: 100_000 = 10%, so 10% / 100 = 0.1 * PERCENTAGE_PRECISION = 100_000
export function percentPrecisionToPercent(value: number): number {
  return (value / PERCENTAGE_PRECISION.toNumber()) * 100;
}