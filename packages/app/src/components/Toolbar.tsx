import * as React from "react";
import { AppBar, Box, Toolbar as MuiToolbar, Typography } from "@mui/material";
import { TOOLBAR_HEIGHT } from "../constants";
import { WalletButton } from "./Buttons";
import { customTheme } from "../styles";
import { PropShopIcon } from "./Icons";

export function Toolbar() {
  return (
    <AppBar
      position="fixed"
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        boxShadow: "none",
        height: TOOLBAR_HEIGHT,
      }}
    >
      <MuiToolbar
        disableGutters
        sx={{
          p: 1,
          display: "flex",
          alignItems: "center",
          flexDirection: "row",
          height: TOOLBAR_HEIGHT,
          width: "70%",
          bgcolor: customTheme.dark,
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "left",
            alignItems: "center",
            flexGrow: 1,
            gap: 2,
          }}
        >
          <PropShopIcon size={70} />
          <Typography variant="h2">PROP SHOP</Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "right",
            width: "20%",
            height: "100%",
            p: 1,
          }}
        >
          <WalletButton />
        </Box>
      </MuiToolbar>
    </AppBar>
  );
}
