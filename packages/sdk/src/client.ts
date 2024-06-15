import { Connection, Keypair } from "@solana/web3.js";
import {
  AsyncSigner,
  keypairToAsyncSigner,
  walletAdapterToAsyncSigner,
} from "@cosmic-lab/data-source";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { makeAutoObservable } from "mobx";

export class PropShopClient {
  private static _instance: PropShopClient | null = null;
  conn: Connection;

  constructor(conn: Connection) {
    makeAutoObservable(this);
    this.conn = conn;
  }

  static get instance(): PropShopClient {
    if (!this._instance) throw new Error("PropShopClient not initialized");
    return this._instance;
  }

  public static readKeypairFromEnv(key: string): Keypair {
    try {
      const raw = process.env[key];
      if (!raw) throw new Error(`${key} not found in env`);
      const byteArray = JSON.parse(raw);
      const buffer = Buffer.from(byteArray);
      return Keypair.fromSecretKey(buffer);
    } catch (e: any) {
      console.error(`${key} not found in env`);
      throw e;
    }
  }

  /**
   * Helper method to convert a connected Solana wallet adapter to AsyncSigner.
   * For clients directly using the SDK within a React app that uses `@solana/wallet-adapter-react` to connect to a wallet.
   */
  public static walletAdapterToAsyncSigner(
    wallet: WalletContextState,
  ): AsyncSigner {
    return walletAdapterToAsyncSigner(wallet);
  }

  /**
   * Helper method to convert a Keypair to AsyncSigner.
   * For clients directly using the SDK outside of a React app (such as developers or a bot)
   * For most the Keypair would be read from a local file or environment variable.
   */
  public static keypairToAsyncSigner(key: Keypair): AsyncSigner {
    return keypairToAsyncSigner(key);
  }
}
