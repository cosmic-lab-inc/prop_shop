import {
  Connection,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";
import { isVersionedTransaction } from "@cosmic-lab/data-source";

export type AnyTransaction = VersionedTransaction | Transaction;

export function formatExplorerMessageLink(
  transaction: AnyTransaction,
  connection: Connection,
): string {
  const clusterUrl = encodeURIComponent(connection.rpcEndpoint);
  let serializedMessage: Buffer;
  if (isVersionedTransaction(transaction)) {
    serializedMessage = Buffer.from(transaction.message.serialize());
  } else {
    serializedMessage = transaction.serializeMessage();
  }
  const message = encodeURIComponent(serializedMessage.toString("base64"));
  return `https://explorer.solana.com/tx/inspector?message=${message}&cluster=custom&customUrl=${clusterUrl}`;
}

export function formatExplorerLink(
  signature: TransactionSignature | string,
  connection: Connection,
): string {
  const clusterUrl = encodeURIComponent(connection.rpcEndpoint);
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${clusterUrl}`;
}
