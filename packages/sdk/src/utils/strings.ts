import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator';

// shorten the input address to have 4 characters at start and end
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(console.error);
}

export function randomId(): string {
  const id = uniqueNamesGenerator({
    dictionaries: [adjectives, animals, colors],
    length: 2,
  });
  // replace _ with -
  return id.replace('_', '-');
}
