import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ConfirmOptions, Connection, Keypair } from "@solana/web3.js";
import { RPC_URL } from "../.jest/env";
import {
  AccountLoader,
  PollingSubscriber,
  PropShopClient,
} from "@cosmic-lab/prop-shop-sdk";
import { afterAll, describe, it } from "@jest/globals";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import { EventEmitter } from "events";

describe("Polling Subscriber", () => {
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    commitment: "confirmed",
  };

  const signer = Keypair.generate();
  const wallet = PropShopClient.keypairToWalletContextState(signer);
  const anchorWallet = PropShopClient.walletAdapterToAnchorWallet(wallet);

  const connection = new Connection(RPC_URL);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, opts);
  anchor.setProvider(provider);

  const program = anchor.workspace.DriftVaults as Program<DriftVaults>;

  const loader = new AccountLoader(
    program.provider.connection,
    "confirmed",
    30_000,
  );
  const cache = new PollingSubscriber(
    program,
    loader,
    {
      filters: [
        {
          accountName: "vault",
          eventType: "vaultUpdate",
        },
        {
          accountName: "vaultDepositor",
          eventType: "vaultDepositorUpdate",
        },
      ],
    },
    new EventEmitter(),
  );

  afterAll(async () => {
    await cache.unsubscribe();
  });

  it("Subscribe", async () => {
    await cache.subscribe();
    const vaults = cache.getAccounts("vault");
    console.log(`cached ${vaults.length} vaults`);

    const vds = cache.getAccounts("vaultDepositor");
    console.log(`cached ${vds.length} vaults`);
  });
});
