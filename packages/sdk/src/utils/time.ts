import dayjs from 'dayjs';

/** @returns current unix timestamp, in seconds */
export const getNow = (): number => {
  return dayjs().unix();
};

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
