import dayjs from "dayjs";

/** @returns current unix timestamp, in seconds */
export const getNow = (): number => {
  return dayjs().unix();
};

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function yyyymmdd(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const day = date.getDate();
  const dayStr = day < 10 ? `0${day}` : `${day}`;
  return `${year}/${monthStr}/${dayStr}`;
}

export function msToMinutes(ms: number) {
  return Math.floor(ms / 60 / 1000);
}

export function msToSeconds(ms: number) {
  return Math.floor(ms / 1000);
}
