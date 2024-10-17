import { PublicKey } from '@solana/web3.js';

export type UiL3Level = {
	price: number;
	size: number;
	maker: PublicKey;
	orderId: number;
};

export type UiBidAsk = {
	bid: UiL3Level;
	ask: UiL3Level;
};
