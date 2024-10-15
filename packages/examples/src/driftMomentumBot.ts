import {Connection, Keypair, PublicKey} from '@solana/web3.js';
import {AsyncSigner, keypairToAsyncSigner} from '@cosmic-lab/data-source';

// import {DriftVaultsClient} from '@cosmic-lab/prop-shop-sdk';

export class DriftMomentumBot {
  private readonly conn: Connection;
  private signer: AsyncSigner;
  key: PublicKey;

  // private driftVaultsClient: DriftVaultsClient;

  constructor(conn: Connection, keypair: Keypair) {
    this.conn = conn;
    this.signer = keypairToAsyncSigner(keypair);
    this.key = keypair.publicKey;
    // this.driftVaultsClient = new DriftVaultsClient(config);
    console.log('DriftMomentumBot created');
  }
}