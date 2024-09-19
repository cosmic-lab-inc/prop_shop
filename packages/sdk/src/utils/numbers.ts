import { BN } from '@coral-xyz/anchor';
import { PERCENTAGE_PRECISION } from '@drift-labs/sdk';

export const shortenNumber = (
	number: number,
	customSuffixes: string[] = ['', 'k', 'm', 'b', 't']
): string => {
	const numAbs = Math.abs(number); // Absolute value of the number
	const sign = Math.sign(number) === -1 ? '-' : ''; // Sign of the number

	// Find the appropriate suffix based on the number's magnitude
	const suffixIndex = numAbs >= 1000 ? Math.floor(Math.log10(numAbs) / 3) : 0;

	// Ensure that the suffixIndex is within the range of the customSuffixes array
	const suffixes = customSuffixes.slice(0, Math.max(suffixIndex + 1, 1));

	// Calculate the shortened number by dividing by the appropriate magnitude
	let shortNumber: string;
	if (suffixIndex >= 3) {
		shortNumber = (numAbs / Math.pow(1000, suffixIndex)).toFixed(1);
	} else {
		shortNumber = Math.floor(numAbs / Math.pow(1000, suffixIndex)).toString();
	}

	// Return the formatted number with the suffix
	return `${sign}${shortNumber}${suffixes[suffixIndex]}`;
};

// add commas to numbers every 3 powers of ten
export function formatNumber(num: number): string {
	if (Math.abs(num) < 1000) {
		return num.toString();
	}
	return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function prettyNumber(num: number) {
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

// random set of numbers that go from 0 to end_value, in N steps
export function mockData(startingBalance: number, N: number): number[] {
	let balance = startingBalance;
	const data = [];
	for (let i = 0; i < N; i++) {
		const newBalance =
			balance +
			Math.floor(
				Math.random() *
					(Math.random() * 300) *
					(Math.random() < 0.5 ? -1 : 1) *
					-1
			);
		data.push(newBalance);
		balance = newBalance;
	}
	return data;
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
