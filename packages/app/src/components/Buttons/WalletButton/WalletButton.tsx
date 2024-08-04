import React from "react";
import { BaseWalletMultiButton } from "./BaseWalletMultiButton";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { useSnackbar } from "notistack";

const LABELS = {
  "change-wallet": "Switch",
  connecting: "Connecting",
  "copy-address": "Copy Address",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Connect",
} as const;

export function WalletButton({
  client,
}: {
  client: PropShopClient | undefined;
}) {
  const { enqueueSnackbar } = useSnackbar();

  async function airdropSol() {
    if (
      client &&
      process.env.ENV === "dev" &&
      process.env.RPC_URL === "http://localhost:8899"
    ) {
      const snack = await client.airdropSol();
      enqueueSnackbar(snack.message, {
        variant: snack.variant,
      });
    }
  }

  async function airdropUsdc() {
    if (
      client &&
      process.env.ENV === "dev" &&
      process.env.RPC_URL === "http://localhost:8899"
    ) {
      const snack = await client.airdropUsdc();
      enqueueSnackbar(snack.message, {
        variant: snack.variant,
      });
    }
  }

  return (
    <BaseWalletMultiButton
      airdropSol={airdropSol}
      airdropUsdc={airdropUsdc}
      labels={LABELS}
    />
  );
}
