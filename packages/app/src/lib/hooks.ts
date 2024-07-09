import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";

export function useClient() {
  const wallet = useWallet();
  const connection = useConnection();

  return useMemo(() => {
    const client = new PropShopClient(wallet, connection);
    client.initialize();
    return client;
  }, []);
}
