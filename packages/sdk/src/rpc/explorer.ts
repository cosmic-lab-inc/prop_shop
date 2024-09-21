import {Connection, Transaction, VersionedTransaction,} from '@solana/web3.js';
import {isVersionedTransaction} from '@cosmic-lab/data-source';

export type AnyTransaction = VersionedTransaction | Transaction;

export function explorerMessageLink(
  transaction: AnyTransaction,
  connection: Connection
): string {
  const clusterUrl = encodeURIComponent(connection.rpcEndpoint);
  let serializedMessage: Buffer;
  if (isVersionedTransaction(transaction)) {
    serializedMessage = Buffer.from(transaction.message.serialize());
  } else {
    serializedMessage = transaction.serializeMessage();
  }
  const message = encodeURIComponent(serializedMessage.toString('base64'));
  return `https://explorer.solana.com/tx/inspector?message=${message}&cluster=custom&customUrl=${clusterUrl}`;
}

export function signatureLink(sig: string, connection?: Connection): string {
  let rpcEndpoint: string;
  if (!connection) {
    rpcEndpoint = 'http://localhost:8899';
  } else {
    rpcEndpoint = connection.rpcEndpoint;
  }
  const clusterUrl = encodeURIComponent(rpcEndpoint);
  return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${clusterUrl}`;
}