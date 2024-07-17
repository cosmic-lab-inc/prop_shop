import {
  ConfirmedSignatureInfo,
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  SignaturesForAddressOptions,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { chunks, sleep } from "./utils";
import * as anchor from "@coral-xyz/anchor";

export interface TxEvent {
  name: string;
  data: any;
}

interface SelectTxParams {
  transaction_signatures: string[];
  enable_raw: boolean;
  enable_events: boolean;
  network: "mainnet-beta" | "devnet" | "testnet";
}

interface TxQueryParams {
  account: PublicKey;
  tx_num?: number;
  enable_raw?: boolean;
  enable_events?: boolean;
  network?: "mainnet-beta" | "devnet" | "testnet";
  before_tx_signature?: string;
  until_tx_signature?: string;
}

export interface TxData {
  // ex: "2023-02-17T05:59:59.000Z",
  timestamp: string;
  // ex: 0.000005
  fee: number;
  fee_payer: string;
  signers: string[];
  signatures: string[];
  protocol: {
    address: string;
    name: string;
  };
  type: string;
  actions: {
    info: {
      sender: string;
      receiver: string;
      amount: number;
    };
    source_protocol: string;
    type: string;
  }[];
  events: {
    data: any;
    name: string;
  }[];
  raw: VersionedTransactionResponse;
}

export interface TxResponse {
  success: boolean;
  message: string;
  result: TxData[];
}

interface Chunk {
  start: number;
  end: number;
}

const SHYFT_SELECT_TX_ENDPOINT =
  "https://api.shyft.to/sol/v1/transaction/parse_selected";
const SHYFT_TX_ENDPOINT = "https://api.shyft.to/sol/v1/transaction/history";
const SHYFT_TX_LIMIT = 100;

export abstract class TxClient {
  private static formatQuery(params: TxQueryParams) {
    let _params: {
      [key: string]: string;
    } = {
      account: params.account.toString(),
      tx_num: params.tx_num?.toString() ?? SHYFT_TX_LIMIT.toString(),
      enable_raw: params.enable_raw?.toString() ?? "true",
      enable_events: params.enable_events?.toString() ?? "true",
      network: params.network ?? "mainnet-beta",
    };
    if (params.before_tx_signature) {
      _params = {
        ..._params,
        before_tx_signature: params.before_tx_signature,
      };
    }
    if (params.until_tx_signature) {
      _params = {
        ..._params,
        until_tx_signature: params.until_tx_signature,
      };
    }

    const query = Object.keys(_params)
      .map((key) => key + "=" + _params[key].toString())
      .join("&");
    return `${SHYFT_TX_ENDPOINT}?${query}`;
  }

  private static async chunkedSignatures(
    key: PublicKey,
    connection: Connection,
    limit: number = 1000,
  ): Promise<ConfirmedSignatureInfo[]> {
    const CHUNK_SIZE = 1000;
    if (limit <= CHUNK_SIZE) {
      return await connection.getSignaturesForAddress(key, {
        limit,
      });
    } else {
      const chunks: Chunk[] = [];
      let eatLimit = limit;
      while (eatLimit > 0) {
        const start = limit - eatLimit;
        const end = Math.min(start + CHUNK_SIZE, limit);
        eatLimit -= CHUNK_SIZE;
        chunks.push({
          start,
          end,
        });
      }

      const signatures: ConfirmedSignatureInfo[] = [];

      const zeroth = chunks[0];
      const zerothConfig: SignaturesForAddressOptions = {
        limit: zeroth.end - zeroth.start,
      };
      const zerothChunkSigs = await connection.getSignaturesForAddress(
        key,
        zerothConfig,
      );
      let borderSig: ConfirmedSignatureInfo =
        zerothChunkSigs[zerothChunkSigs.length - 1];
      signatures.push(...zerothChunkSigs);

      const afterZeroth = chunks.slice(1, chunks.length);
      for (const chunk of afterZeroth) {
        const config: SignaturesForAddressOptions = {
          limit: chunk.end - chunk.start,
          before: borderSig.signature,
        };
        const sigsForChunk = await connection.getSignaturesForAddress(
          key,
          config,
        );
        await sleep(1000);
        borderSig = sigsForChunk[sigsForChunk.length - 1];
        signatures.push(...sigsForChunk);
      }

      return signatures;
    }
  }

  public static async txEvents(
    key: PublicKey,
    eventName: string,
    program: anchor.Program,
    connection: Connection,
    limit: number = 1000,
  ): Promise<TxEvent[]> {
    const sigs = await TxClient.chunkedSignatures(key, connection, limit);
    console.log(`fetch ${sigs.length} signatures`);
    const sigChunks = chunks(sigs, 1000);

    const result: ParsedTransactionWithMeta[] = [];
    for (const chunk of sigChunks) {
      const res = (
        await connection.getParsedTransactions(
          chunk.map((c) => c.signature),
          {
            maxSupportedTransactionVersion: 0,
          },
        )
      ).filter((t) => !!t) as ParsedTransactionWithMeta[];
      await sleep(2000);
      result.push(...res);
    }

    const eventParser = new anchor.EventParser(
      program.programId,
      new anchor.BorshCoder(program.idl),
    );
    const events: TxEvent[] = result
      .map((tx) => {
        if (tx.meta?.logMessages) {
          const events = eventParser.parseLogs(tx.meta.logMessages);
          const filter: TxEvent[] = [];
          for (let event of events) {
            if (event.name.includes(eventName)) {
              filter.push(event);
            }
          }
          return filter;
        } else {
          return [];
        }
      })
      .flat();

    return events;
  }

  public static async fetch(
    apiKey: string,
    key: PublicKey,
    connection: Connection,
    limit: number = 1000,
    network: "mainnet-beta" | "devnet" | "testnet" = "mainnet-beta",
  ): Promise<TxResponse[]> {
    const sigs = await TxClient.chunkedSignatures(key, connection, limit);
    const sigChunks = chunks(sigs, SHYFT_TX_LIMIT);

    const result: TxResponse[] = (
      await Promise.all(
        sigChunks.map(async (chunk) => {
          const newestSig = chunk[0];
          const oldestSig = chunk[chunk.length - 1];
          const body: SelectTxParams = {
            network,
            transaction_signatures: chunk.map((c) => c.signature),
            enable_raw: true,
            enable_events: true,
          };
          const opts: RequestInit = {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
            },
            body: JSON.stringify(body),
            redirect: "follow",
          };

          return fetch(SHYFT_SELECT_TX_ENDPOINT, opts)
            .then(async (response) => response.text())
            .then((result) => JSON.parse(result) as TxResponse);
        }),
      )
    ).flat();
    return result;
  }

  // public static async _fetch(
  //   apiKey: string,
  //   key: PublicKey,
  //   connection: Connection,
  //   limit: number = 1000,
  //   network: "mainnet-beta" | "devnet" | "testnet" = "mainnet-beta",
  // ): Promise<TxResponse[]> {
  //   const opts: RequestInit = {
  //     method: "GET",
  //     headers: {
  //       "x-api-key": apiKey,
  //     },
  //     redirect: "follow",
  //   };
  //
  //   const sigs = await TxClient.chunkedSignatures(key, connection, limit);
  //   const sigChunks = chunks(sigs, SHYFT_TX_LIMIT);
  //
  //   const result: TxResponse[] = (
  //     await Promise.all(
  //       sigChunks.map(async (chunk) => {
  //         const newestSig = chunk[0];
  //         const oldestSig = chunk[chunk.length - 1];
  //         const params: TxQueryParams = {
  //           account: key,
  //           tx_num: SHYFT_TX_LIMIT,
  //           network,
  //           // before_tx_signature: oldestSig.signature,
  //           until_tx_signature: oldestSig.signature,
  //         };
  //         const url = TxClient.formatQuery(params);
  //
  //         return fetch(url, opts)
  //           .then(async (response) => response.text())
  //           .then((result) => JSON.parse(result) as TxResponse);
  //       }),
  //     )
  //   ).flat();
  //   return result;
  // }
}
