import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";

// shorten the input address to have 4 characters at start and end
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(console.error);
}

export function randomName(words: number = 2): string {
  const id = uniqueNamesGenerator({
    dictionaries: [adjectives, animals, colors],
    length: words,
  });
  return id.replace("_", "-");
}

export function truncateString(str: string, length: number = 10): string {
  return str.length > length ? `${str.slice(0, length)}...` : str;
}

export function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
