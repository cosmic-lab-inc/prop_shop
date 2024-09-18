import {
  Connection,
  Keypair,
  Transaction,
  type TransactionSignature,
  TransactionVersion,
  VersionedTransaction
} from "@solana/web3.js";
import {Wallet, WalletContextState} from "@solana/wallet-adapter-react";
import {
  EventEmitter as WalletAdapterEventEmitter,
  SendTransactionOptions,
  WalletAdapter,
  WalletAdapterEvents,
  WalletAdapterProps,
  WalletName,
  WalletReadyState
} from "@solana/wallet-adapter-base";
import {IWallet} from "@drift-labs/sdk";
import {Wallet as AnchorWallet} from "@coral-xyz/anchor/dist/cjs/provider";

export function keypairToWalletContextState(kp: Keypair): WalletContextState {
  const eventEmitter = new WalletAdapterEventEmitter<WalletAdapterEvents>();
  const adapterProps: WalletAdapterProps = {
    name: "DevKeypairWallet" as WalletName<"DevKeypairWallet">,
    url: "",
    icon: "",
    readyState: WalletReadyState.Installed,
    publicKey: kp.publicKey,
    connecting: false,
    connected: true,
    supportedTransactionVersions: new Set(["legacy" as TransactionVersion]),

    autoConnect(): Promise<void> {
      return Promise.resolve();
    },
    connect(): Promise<void> {
      return Promise.resolve();
    },
    disconnect(): Promise<void> {
      return Promise.resolve();
    },
    sendTransaction(
      transaction: Transaction,
      connection: Connection,
      options?: SendTransactionOptions,
    ): Promise<TransactionSignature> {
      return connection.sendTransaction(transaction, [kp], options);
    },
  };
  const adapter = {
    ...adapterProps,
    ...eventEmitter,
  } as unknown as WalletAdapter;

  const wallet: Wallet = {
    adapter,
    readyState: WalletReadyState.Installed,
  };

  const walletCtx: WalletContextState = {
    autoConnect: false,
    wallets: [wallet],
    wallet,
    publicKey: kp.publicKey,
    connecting: false,
    connected: true,
    disconnecting: false,

    select(walletName: WalletName | null) {
      return;
    },
    connect(): Promise<void> {
      return Promise.resolve();
    },
    disconnect(): Promise<void> {
      return Promise.resolve();
    },

    sendTransaction(
      transaction: Transaction,
      connection: Connection,
      options?: SendTransactionOptions,
    ): Promise<TransactionSignature> {
      return connection.sendTransaction(transaction, [kp], options);
    },

    signTransaction<T = Transaction>(transaction: T): Promise<T> {
      (transaction as Transaction).partialSign(kp);
      return Promise.resolve(transaction);
    },
    signAllTransactions<T = Transaction>(transactions: T[]): Promise<T[]> {
      for (const transaction of transactions) {
        (transaction as Transaction).partialSign(kp);
      }
      return Promise.resolve(transactions);
    },

    signMessage(message: Uint8Array): Promise<Uint8Array> {
      const tx = Transaction.from(message);
      tx.partialSign(kp);
      return Promise.resolve(tx.serializeMessage());
    },
    signIn: undefined,
  };
  return walletCtx;
}

export function walletAdapterToIWallet(wallet: WalletContextState): IWallet {
  if (
    !wallet.wallet ||
    !wallet.signTransaction ||
    !wallet.signAllTransactions ||
    !wallet.publicKey
  ) {
    throw new Error("Wallet not connected");
  }
  return {
    signTransaction(tx: Transaction): Promise<Transaction> {
      return wallet.signTransaction!(tx);
    },
    signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
      return wallet.signAllTransactions!(txs);
    },
    publicKey: wallet.publicKey,
  };
}

export function walletAdapterToAnchorWallet(
  wallet: WalletContextState,
): AnchorWallet {
  if (
    !wallet.wallet ||
    !wallet.signTransaction ||
    !wallet.signAllTransactions ||
    !wallet.publicKey
  ) {
    throw new Error("Wallet not connected");
  }
  return {
    signTransaction<T extends Transaction | VersionedTransaction>(
      tx: T,
    ): Promise<T> {
      return wallet.signTransaction!(tx);
    },
    signAllTransactions<T extends Transaction | VersionedTransaction>(
      txs: T[],
    ): Promise<T[]> {
      return wallet.signAllTransactions!(txs);
    },
    publicKey: wallet.publicKey,
  };
}