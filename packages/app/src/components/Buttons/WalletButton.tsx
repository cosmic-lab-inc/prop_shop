import { BaseWalletMultiButton } from "@solana/wallet-adapter-material-ui";
import React from "react";
import { customTheme } from "../../styles";
import { darken } from "@mui/system/colorManipulator";

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
        // display: "flex",
        // flexDirection: "row",
        // justifyContent: "center",
        // alignItems: "center",
        fontSize: 20,
        fontWeight: 600,
        bgcolor: customTheme.secondary,
        borderRadius: "10px",
        "&:hover": {
          bgcolor: darken(customTheme.secondary, 0.2),
        },
      }}
    />
  );
}
