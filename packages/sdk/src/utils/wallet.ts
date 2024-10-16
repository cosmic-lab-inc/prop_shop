import {
	Connection,
	Keypair,
	Transaction,
	type TransactionSignature,
	TransactionVersion,
} from '@solana/web3.js';
import { Wallet, WalletContextState } from '@solana/wallet-adapter-react';
import {
	EventEmitter as WalletAdapterEventEmitter,
	SendTransactionOptions,
	WalletAdapter,
	WalletAdapterEvents,
	WalletAdapterProps,
	WalletName,
	WalletReadyState,
} from '@solana/wallet-adapter-base';
import { IWallet } from '@drift-labs/sdk';
import { Wallet as AnchorWallet } from '@coral-xyz/anchor/dist/cjs/provider';
import { AsyncSigner, keypairToAsyncSigner } from '@cosmic-lab/data-source';
import { AnyTransaction } from '../rpc';

export function keypairToWalletContextState(kp: Keypair): WalletContextState {
	const eventEmitter = new WalletAdapterEventEmitter<WalletAdapterEvents>();
	const adapterProps: WalletAdapterProps = {
		name: 'DevKeypairWallet' as WalletName<'DevKeypairWallet'>,
		url: '',
		icon: '',
		readyState: WalletReadyState.Installed,
		publicKey: kp.publicKey,
		connecting: false,
		connected: true,
		supportedTransactionVersions: new Set(['legacy' as TransactionVersion]),

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
			options?: SendTransactionOptions
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

	return {
		autoConnect: false,
		wallets: [wallet],
		wallet,
		publicKey: kp.publicKey,
		connecting: false,
		connected: true,
		disconnecting: false,

		select(_walletName: WalletName | null) {
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
			options?: SendTransactionOptions
		): Promise<TransactionSignature> {
			return connection.sendTransaction(transaction, [kp], options);
		},

		signTransaction<T = AnyTransaction>(transaction: T): Promise<T> {
			// (transaction as Transaction).partialSign(kp);
			// return Promise.resolve(transaction);
			const signer = keypairToAsyncSigner(kp);
			return signer.sign(transaction as AnyTransaction) as Promise<T>;
		},
		signAllTransactions<T = Transaction>(transactions: T[]): Promise<T[]> {
			// for (const transaction of transactions) {
			// 	(transaction as Transaction).partialSign(kp);
			// }
			// return Promise.resolve(transactions);
			const signer = keypairToAsyncSigner(kp);
			return signer.signAll(transactions as AnyTransaction[]) as Promise<T[]>;
		},

		signMessage(message: Uint8Array): Promise<Uint8Array> {
			// const tx = Transaction.from(message);
			// tx.partialSign(kp);
			// return Promise.resolve(tx.serializeMessage());
			const signer = keypairToAsyncSigner(kp);
			if (!signer.signMessage) {
				throw new Error('signMessage not implemented for keypair AsyncSigner');
			}
			return signer.signMessage(message);
		},
		signIn: undefined,
	} as WalletContextState;
}

export function asyncSignerToIWallet(signer: AsyncSigner): IWallet {
	return {
		signTransaction(tx: Transaction): Promise<Transaction> {
			return signer.sign(tx);
		},
		signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
			return signer.signAll(txs);
		},
		publicKey: signer.publicKey(),
	};
}

export function asyncSignerToAnchorWallet(signer: AsyncSigner): AnchorWallet {
	return {
		signTransaction<T extends AnyTransaction>(tx: T): Promise<T> {
			return signer.sign(tx);
		},
		signAllTransactions<T extends AnyTransaction>(txs: T[]): Promise<T[]> {
			return signer.signAll(txs);
		},
		publicKey: signer.publicKey(),
	};
}
