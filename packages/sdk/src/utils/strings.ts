import {
  animals,
  languages,
  starWars,
  uniqueNamesGenerator,
} from "unique-names-generator";

// shorten the input address to have 4 characters at start and end
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(console.error);
}

export function randomName(
  words: number = 2,
  charLimit: number = 32,
  separator: string = " ",
): string {
  let _name = uniqueNamesGenerator({
    dictionaries: [languages, starWars, animals],
    separator,
    length: words,
    style: "capital",
  });
  while (_name.length > charLimit) {
    _name = uniqueNamesGenerator({
      dictionaries: [languages, starWars, animals],
      separator,
      length: words,
      style: "capital",
    });
  }
  return _name;
}

export function truncateString(str: string, length: number = 10): string {
  return str.length > length ? `${str.slice(0, length)}...` : str;
}

export function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
