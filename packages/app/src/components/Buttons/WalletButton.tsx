import { BaseWalletMultiButton } from "@solana/wallet-adapter-material-ui";
import React from "react";
import { customTheme } from "../../styles";
import { alpha } from "@mui/material";

const LABELS = {
  "change-wallet": "Switch Wallet",
  connecting: "Connecting",
  "copy-address": "Copy Address",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Select Wallet",
} as const;

export function WalletButton() {
  return (
    <BaseWalletMultiButton
      variant="contained"
      labels={LABELS}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        fontSize: 20,
        alignItems: "center",
        fontWeight: 600,
        bgcolor: customTheme.secondary,
        borderRadius: "2px",
        "&:hover": {
          bgcolor: alpha(customTheme.secondary, 0.7),
        },
      }}
    />
  );
}
