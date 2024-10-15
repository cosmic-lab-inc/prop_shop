import {Connection, Keypair, PublicKey} from '@solana/web3.js';
import {CreatePropShopClientConfig, DriftVaultsClient, keypairToWalletContextState} from "@cosmic-lab/prop-shop-sdk";
import {WalletContextState} from "@solana/wallet-adapter-react";

// import {DriftVaultsClient} from '@cosmic-lab/prop-shop-sdk';

export class DriftMomentumBot {
  private readonly conn: Connection;
  private wallet: WalletContextState;
  key: PublicKey;
  private driftVaultsClient: DriftVaultsClient;

  static new(connection: Connection, keypair: Keypair): DriftMomentumBot {
    const config: CreatePropShopClientConfig = {
      wallet: keypairToWalletContextState(keypair),
      connection
    };
    return new DriftMomentumBot(config);
  }

  constructor(config: CreatePropShopClientConfig) {
    this.conn = config.connection;
    this.wallet = config.wallet;
    if (!config.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    this.key = config.wallet.publicKey;
    this.driftVaultsClient = new DriftVaultsClient(config);
  }
}