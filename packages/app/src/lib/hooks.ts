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
    const env = process.env.ENV ?? "dev";
    const skipFetching = env === "dev";

    const run = async () => {
      if (!client && wallet.publicKey) {
        const _client = new PropShopClient({
          wallet,
          connection: connection.connection,
          skipFetching,
        });
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

export function useOutsideClick(callback: () => void) {
  const [ref, _setRef] = React.useState<React.MutableRefObject<any>>(
    React.useRef(null),
  );

  React.useEffect(() => {
    /**
     * Alert if clicked on outside of element
     */
    function handleClickOutside(event: any) {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    }

    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref]);

  return ref;
}
