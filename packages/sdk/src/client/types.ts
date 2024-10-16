import { Connection } from '@solana/web3.js';
import { AsyncSigner } from '@cosmic-lab/data-source';

export interface CreatePropShopClientConfig {
	signer: AsyncSigner;
	connection: Connection;
	disableCache?: boolean;
	dummyWallet?: boolean;
}

export interface UpdateWalletConfig {
	signer: AsyncSigner;
	dummyWallet?: boolean;
}
