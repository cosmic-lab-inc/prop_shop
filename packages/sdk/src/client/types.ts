import {WalletContextState} from '@solana/wallet-adapter-react';
import {Connection} from '@solana/web3.js';

export interface CreatePropShopClientConfig {
  wallet: WalletContextState;
  connection: Connection;
  disableCache?: boolean;
  dummyWallet?: boolean;
}

export interface UpdateWalletConfig {
  wallet: WalletContextState;
  dummyWallet?: boolean;
}
