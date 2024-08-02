import React from "react";
import { BaseWalletMultiButton } from "./BaseWalletMultiButton";

const LABELS = {
  "change-wallet": "Switch",
  connecting: "Connecting",
  "copy-address": "Copy Address",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Connect",
} as const;

export function WalletButton() {
  return <BaseWalletMultiButton labels={LABELS} />;
}
