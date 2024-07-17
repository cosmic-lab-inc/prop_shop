import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";

export type TxQueryParams = {
  account: PublicKey;
  tx_num?: number;
  enable_raw?: boolean;
  enable_events?: boolean;
  network?: "mainnet-beta" | "devnet" | "testnet";
};

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

const SHYFT_TX_ENDPOINT = "https://api.shyft.to/sol/v1/transaction/history";

export abstract class TxClient {
  private static formatQuery(params: TxQueryParams) {
    const _params: {
      [key: string]: string;
    } = {
      account: params.account.toString(),
      tx_num: params.tx_num?.toString() ?? "100",
      enable_raw: params.enable_raw?.toString() ?? "true",
      enable_events: params.enable_events?.toString() ?? "true",
      network: params.network ?? "mainnet-beta",
    };
    const query = Object.keys(_params)
      .map((key) => key + "=" + _params[key].toString())
      .join("&");
    return `${SHYFT_TX_ENDPOINT}?${query}`;
  }

  public static async fetch(
    apiKey: string,
    params: TxQueryParams,
  ): Promise<TxResponse> {
    const url = TxClient.formatQuery(params);

    const requestOptions: RequestInit = {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
      redirect: "follow",
    };

    const response = await fetch(url, requestOptions);
    const str = await response.text();
    return JSON.parse(str);
  }
}
