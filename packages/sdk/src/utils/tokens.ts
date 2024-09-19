import { Connection, PublicKey } from '@solana/web3.js';

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
