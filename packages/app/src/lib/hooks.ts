import React from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";

export function useClient(): PropShopClient | undefined {
  const wallet = useWallet();
  const connection = useConnection();

  const [client, setClient] = React.useState<PropShopClient | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const run = async () => {
      if (!client && wallet.publicKey) {
        const _client = new PropShopClient(wallet, connection.connection);
        if (!_client.vaultClient && !_client.loading) {
          await _client.initialize();
          setClient(_client);
        }
      }
    };
    run();
  }, [wallet.publicKey]);

  return client;
}
