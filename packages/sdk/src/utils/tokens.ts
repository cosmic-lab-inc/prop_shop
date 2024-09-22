import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { MarketState } from '@ellipsis-labs/phoenix-sdk';
import { createAtaIdempotent } from '../../../../tests/phoenixHelpers';

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
