import React from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";

export function useClient(): PropShopClient | undefined {
  const wallet = useWallet();
  if (!wallet.connected) return;
  const connection = useConnection();

  const [client, setClient] = React.useState<PropShopClient | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const run = async () => {
      const client = new PropShopClient(wallet, connection.connection);
      if (!client.vaultClient && !client.loading) {
        await client.initialize();
      }
      setClient(client);
    };
    run();
  }, [wallet]);

  return client;
}
