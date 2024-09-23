import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { MarketState } from '@ellipsis-labs/phoenix-sdk';
import {
	createAssociatedTokenAccountInstruction,
	getAssociatedTokenAddress,
} from '@solana/spl-token';

export async function getTokenBalance(
	conn: Connection,
	tokenAccount: PublicKey
): Promise<number> {
	const result = await conn.getTokenAccountBalance(tokenAccount);
	if (!result) {
		return 0;
	}
	const value: number | null = result.value.uiAmount;
	if (value) {
		return Number(value);
	} else {
		return 0;
	}
}

export async function createAtaIdempotent(
	connection: Connection,
	owner: PublicKey,
	payer: PublicKey,
	tokenMintAddress: PublicKey
): Promise<TransactionInstruction[]> {
	const associatedTokenAccountAddress = await getAssociatedTokenAddress(
		tokenMintAddress,
		owner,
		true
	);

	const ata = await connection.getAccountInfo(
		associatedTokenAccountAddress,
		'confirmed'
	);
	const ixs: TransactionInstruction[] = [];
	if (ata === null || ata.data.length === 0) {
		ixs.push(
			createAssociatedTokenAccountInstruction(
				payer,
				associatedTokenAccountAddress,
				owner,
				tokenMintAddress
			)
		);
	}
	return ixs;
}

export async function createPhoenixMarketTokenAccountIxs(
	connection: Connection,
	market: MarketState,
	trader: PublicKey,
	payer: PublicKey
): Promise<TransactionInstruction[]> {
	const baseAtaIxs = await createAtaIdempotent(
		connection,
		trader,
		payer,
		market.data.header.baseParams.mintKey
	);
	const quoteAtaIxs = await createAtaIdempotent(
		connection,
		trader,
		payer,
		market.data.header.quoteParams.mintKey
	);
	return [...baseAtaIxs, ...quoteAtaIxs];
}
