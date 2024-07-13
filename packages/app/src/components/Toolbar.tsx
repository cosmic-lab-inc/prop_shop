import * as React from "react";
import { AppBar, Box, Toolbar as MuiToolbar } from "@mui/material";
import { TOOLBAR_HEIGHT } from "../constants";
import { WalletButton } from "./Buttons";

export function Toolbar() {
  return (
    <AppBar position="fixed">
      <MuiToolbar
        sx={{
          display: "flex",
          justifyContent: "right",
          alignItems: "center",
          flexDirection: "row",
          height: TOOLBAR_HEIGHT,
          width: "70%",
          borderRadius: "3px",
          p: 1,
        }}
      >
        <Box
          sx={{
            display: "flex",
            width: "10%",
            height: "100%",
          }}
        >
          <WalletButton />
        </Box>
      </MuiToolbar>
    </AppBar>
  );
}
