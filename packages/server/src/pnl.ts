import { BN } from "@coral-xyz/anchor";
import axios, {
  AxiosError,
  AxiosResponseHeaders,
  RawAxiosResponseHeaders,
} from "axios";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import { parse } from "csv-parse";
import { DRIFT_API_PREFIX } from "./constants";

export interface HistoricalSettlePNL {
  pnl: number;
  user: string;
  base_asset_amount: number;
  quote_asset_amount_after: number;
  quote_entry_amount_before: number;
  settle_price: number;
  tx_sig: string;
  slot: BN;
  ts: BN;
  market_index: number;
  explanation: string;
  program_id: string;
}

export async function handleHistoricalPnl(
  user: string,
  daysBack: number,
): Promise<HistoricalSettlePNL[]> {
  const today = new Date();
  const data: HistoricalSettlePNL[] = [];
  for (let i = 0; i <= daysBack; i++) {
    const pastDate = today;
    const date = new Date(pastDate.setDate(pastDate.getDate() - i));
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

      console.log("headers:", res.headers);
      const validHeaders: RawAxiosResponseHeaders | AxiosResponseHeaders = {
        "Accept-Ranges": "bytes",
        "Content-Type": "text/csv",
        "Content-Encoding": "gzip",
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
        const gunzip = createGunzip();
        const decoder = Readable.from(bytes).pipe(gunzip);

        const onRecord = (record: any) => {
          console.log("onRecord:", record);
        };
        // Create a CSV parser stream
        const parser = decoder.pipe(
          parse({
            columns: true,
            // onRecord: onRecord,
          }),
        );

        // Usage example: Log each parsed record
        parser.on("data", (record) => {
          console.log("data:", record);
          // deserialize record into HistoricalSettlePNL
          const pnlRecord: HistoricalSettlePNL = record as HistoricalSettlePNL;
          console.log("pnlRecord:", pnlRecord);
          data.push(pnlRecord);
        });
      }
    } catch (e: any) {
      const error: AxiosError = e as any;
      console.warn(
        `Error for date ${year}/${monthStr}/${dayStr} and user ${user}: ${e}`,
      );
      if (!error.message.includes("403")) {
        throw new Error(e);
      }
    }
  }
  return data;
}
