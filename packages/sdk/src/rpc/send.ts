import { Connection, TransactionError } from '@solana/web3.js';
import {
	AsyncSigner,
	buildAndSignTransaction,
	buildDynamicTransactions,
	InstructionReturn,
	sendTransaction,
} from '@cosmic-lab/data-source';
import { signatureLink } from '.';
import { sleep } from '..';
import { SnackInfo } from '../types';
import { err, ok, Result } from 'neverthrow';

/**
 * Send a large batch of instructions at once
 * @param connection Solana connection
 * @param feePayer The wallet paying gas for these transactions
 * @param instructions A list of InstructionReturn to send
 * @param options.slow If true, will impose a 50ms delay between each instruction or group of
 *   instructions
 * @param options.skipPreflight Skip preflight checks before sending the transaction
 */
export const sendManyInstructions = async (
	connection: Connection,
	feePayer: AsyncSigner,
	instructions: InstructionReturn[],
	sequential = false
): Promise<void> => {
	const sendOptions = { skipPreflight: true };
	const transactions = await buildDynamicTransactions(instructions, feePayer, {
		connection,
	});

	if (transactions.isErr()) throw new Error('wtf');

	if (sequential) {
		for (const tx of transactions.value) {
			const result = await sendTransaction(tx, connection, {
				sendOptions,
			});

			if (result.value.isErr()) {
				console.error(result.value.error);
			} else {
				console.log('Signature:', result.value.value);
			}
		}
	} else {
		await Promise.all(
			transactions.value.map((tx) => sendTransaction(tx, connection), {
				sendOptions,
			})
		);
	}
};

export const confirmTransactions = async (
	connection: Connection,
	transactionIds: string[]
) => {
	let listeners = 0;

	for (const txId of transactionIds) {
		listeners += 1;

		connection.onSignature(
			txId,
			(result) => {
				if (result.err) {
					throw new Error(`Transaction failed: ${txId}`);
				}

				listeners -= 1;
			},
			'confirmed'
		);
	}

	while (listeners > 0) {
		console.log(`Waiting for ${listeners} transactions to confirm...`);
		await sleep(1000);
	}
};

export async function sendTransactionWithResult(
	instructions: InstructionReturn[],
	funder: AsyncSigner,
	connection: Connection
): Promise<Result<string, TransactionError>> {
	try {
		const tx = await buildAndSignTransaction(instructions, funder, {
			connection,
			commitment: 'confirmed',
		});
		const res = await sendTransaction(tx, connection, {
			sendOptions: {
				skipPreflight: false,
			},
		});
		if (res.value.isErr()) {
			return err(res.value.error);
		} else {
			return ok(res.value.value);
		}
	} catch (e: any) {
		throw new Error(e);
	}
}

export async function sendTransactionWithSnack(
	instructions: InstructionReturn[],
	funder: AsyncSigner,
	connection: Connection
): Promise<SnackInfo> {
	const tx = await buildAndSignTransaction(instructions, funder, {
		connection,
		commitment: 'confirmed',
	});
	const res = await sendTransaction(tx, connection, {
		sendOptions: {
			skipPreflight: true,
		},
	});
	if (res.value.isErr()) {
		console.error('Transaction failed', res.value.error);
		return {
			variant: 'error',
			message: res.value.error.toString(),
		};
	} else {
		console.debug('Transaction:', signatureLink(res.value.value));
		return {
			variant: 'success',
			message: res.value.value,
		};
	}
}
