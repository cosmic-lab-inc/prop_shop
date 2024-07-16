import axios, {
  AxiosError,
  AxiosResponseHeaders,
  RawAxiosResponseHeaders,
} from "axios";
import { Readable } from "stream";
import { parse } from "csv-parse";
import { sleep } from "../utils";
import { DRIFT_API_PREFIX } from "../constants";
import { HistoricalSettlePNL } from "../types";

export async function fetchDriftUserHistoricalPnl(
  user: string,
  daysBack: number,
  msPause?: number,
): Promise<HistoricalSettlePNL[]> {
  const date = new Date();
  const data: HistoricalSettlePNL[] = [];
  for (let i = 0; i <= daysBack; i++) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const day = date.getDate();
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const url = `${DRIFT_API_PREFIX}user/${user}/settlePnlRecords/${year}/${year}${monthStr}${dayStr}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "Accept-Encoding": "gzip",
        },
        responseType: "arraybuffer", // If you expect a binary response like a gzip file
      });
      const bytes = res.data;

      const validHeaders: RawAxiosResponseHeaders | AxiosResponseHeaders = {
        "accept-ranges": "bytes",
        "content-type": "text/csv",
        // axios already decoded gzip data and repackaged the response,
        // so this header is removed, and we don't need to use zlib to decode the data
        // "content-encoding": "gzip",
      };
      const resHeadersValid = (
        resHeaders: RawAxiosResponseHeaders | AxiosResponseHeaders,
      ) => {
        for (const key in validHeaders) {
          if (resHeaders[key] !== validHeaders[key]) {
            return false;
          }
        }
        return true;
      };

      if (resHeadersValid(res.headers)) {
        // Assuming `bytes` is a Buffer containing your GZIP compressed data
        const decoder = Readable.from(bytes);

        // Create a CSV parser stream
        const parser = decoder.pipe(
          parse({
            columns: true,
          }),
        );

        // Usage example: Log each parsed record
        parser.on("data", (record) => {
          // deserialize record into HistoricalSettlePNL
          const pnlRecord: HistoricalSettlePNL = record as HistoricalSettlePNL;
          data.push(pnlRecord);
        });
      }
    } catch (e: any) {
      const error: AxiosError = e as any;
      console.warn(
        `Historical PNL missing for ${year}/${monthStr}/${dayStr} and user ${user}: ${e}`,
      );
      const is403 = error.message.includes("403");
      const notFound = error.message.includes("ENOTFOUND");
      if (!is403 && !notFound) {
        console.error("Fetch historical PNL error:", e);
        throw new Error(e);
      }
    }
    await sleep(msPause ?? 500);
    date.setDate(date.getDate() - 1);
  }
  return data;
}
