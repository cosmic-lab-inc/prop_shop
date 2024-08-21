import {
  adjectives,
  animals,
  colors,
  countries,
  languages,
  names,
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
      `Cannot generate a name with more than ${dictionaries.length} words`,
    );
    words = dictionaries.length;
  }

  let _name = uniqueNamesGenerator({
    dictionaries,
    separator,
    length: words,
    style: "capital",
  });
  while (_name.length > charLimit) {
    _name = uniqueNamesGenerator({
      dictionaries,
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
