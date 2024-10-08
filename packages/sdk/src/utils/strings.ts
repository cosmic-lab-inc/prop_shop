import {
	adjectives,
	animals,
	colors,
	countries,
	languages,
	names,
	starWars,
	uniqueNamesGenerator,
} from 'unique-names-generator';

export const MAX_NAME_LENGTH = 32;

// shorten the input address to have 4 characters at start and end
export function shortenAddress(address: string, chars = 4): string {
	return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function copyToClipboard(text: string): void {
	navigator.clipboard.writeText(text).catch(console.error);
}

export function randomName(
	words = 2,
	charLimit = MAX_NAME_LENGTH,
	separator = ' '
): string {
	const dictionaries = [
		languages,
		starWars,
		animals,
		adjectives,
		colors,
		countries,
		names,
	];
	if (words > dictionaries.length) {
		console.warn(
			`Cannot generate a name with more than ${dictionaries.length} words`
		);
		words = dictionaries.length;
	}

	let _name = uniqueNamesGenerator({
		dictionaries,
		separator,
		length: words,
		style: 'capital',
	});
	while (_name.length > charLimit) {
		_name = uniqueNamesGenerator({
			dictionaries,
			separator,
			length: words,
			style: 'capital',
		});
	}
	return _name;
}

export function truncateString(str: string, length = 10): string {
	return str.length > length ? `${str.slice(0, length)}...` : str;
}

export function capitalize(value: string): string {
	return value[0].toUpperCase() + value.slice(1);
}

export function encodeName(name: string): number[] {
	if (name.length > MAX_NAME_LENGTH) {
		throw Error(`Name (${name}) longer than 32 characters`);
	}

	const buffer = Buffer.alloc(32);
	buffer.fill(name);
	buffer.fill(' ', name.length);

	return Array(...buffer);
}

export function decodeName(bytes: number[]): string {
	const buffer = Buffer.from(bytes);
	return buffer.toString('utf8').trim();
}
