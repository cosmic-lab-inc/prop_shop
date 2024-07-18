import {
  ConfirmedSignatureInfo,
  Connection,
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
  error?: string;
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
      await sleep(1000);

      const afterZeroth = chunks.slice(1, chunks.length);
      for (const chunk of afterZeroth) {
        try {
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
        } catch (e) {
          console.error("failed to fetch signatures:", e);
        }
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
    const unfilteredSigs = await TxClient.chunkedSignatures(
      key,
      connection,
      limit,
    );
    const sigs = unfilteredSigs.filter((sig) => sig.err === null);
    const sigChunks = chunks(sigs, 100);
    console.log(
      `${sigs.length}/${unfilteredSigs.length} sigs are valid, divided into ${sigChunks.length} chunks`,
    );

    const result: VersionedTransactionResponse[] = [];
    for (const chunk of sigChunks) {
      console.log(`this chunk has ${chunk.length} sigs`);
      try {
        const res: VersionedTransactionResponse[] = (
          await connection.getTransactions(
            chunk.map((c) => c.signature),
            {
              maxSupportedTransactionVersion: 1,
            },
          )
        ).filter((t) => t !== null) as VersionedTransactionResponse[];
        await sleep(1500);
        console.log(`pushing ${res.length} txs to ${result.length} results`);
        result.push(...res);
      } catch (e) {
        console.error("failed to fetch transactions from RPC:", e);
      }
    }
    console.log(
      `RPC returned ${result.length} transactions out of ${sigs.length} signatures`,
    );

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
    const unfilteredSigs = await TxClient.chunkedSignatures(
      key,
      connection,
      limit,
    );
    const sigs = unfilteredSigs.filter((sig) => sig.err === null);
    const sigChunks = chunks(sigs, SHYFT_TX_LIMIT);
    console.log(
      `${sigs.length}/${unfilteredSigs.length} sigs are valid, divided into ${sigChunks.length} chunks`,
    );

    const results: TxResponse[] = [];
    for (const chunk of sigChunks) {
      const transaction_signatures: string[] = chunk.map(
        (sig) => sig.signature,
      );
      const body: SelectTxParams = {
        network,
        transaction_signatures,
        enable_raw: true,
        enable_events: true,
      };
      const opts: RequestInit = {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "follow",
      };
      try {
        const response = await fetch(SHYFT_SELECT_TX_ENDPOINT, opts);
        const text = await response.text();
        const data = JSON.parse(text) as TxResponse;
        if (!data.success) {
          console.error(`failed with error: ${data.error}`);
        }
        results.push(data);
        await sleep(500);
      } catch (e) {
        console.error("failed to fetch transaction from Shyft:", e);
      }
    }

    return results;
  }
}
