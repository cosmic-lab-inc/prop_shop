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
