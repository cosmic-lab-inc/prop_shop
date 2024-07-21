import React from "react";
import { customTheme } from "../../../styles";
import { darken } from "@mui/system/colorManipulator";
import { BaseWalletMultiButton } from "./BaseWalletMultiButton";
// import { BaseWalletMultiButton } from "@solana/wallet-adapter-material-ui";

const LABELS = {
  "change-wallet": "Switch",
  connecting: "Connecting",
  "copy-address": "Copy Address",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Connect",
} as const;

export function WalletButton() {
  return (
    <BaseWalletMultiButton
      fullWidth
      variant="contained"
      labels={LABELS}
      sx={{
        bgcolor: customTheme.secondary,
        borderRadius: "10px",
        "&:hover": {
          bgcolor: darken(customTheme.secondary, 0.2),
        },
      }}
    />
  );
}
