import * as React from "react";
import { AppBar, Box, Toolbar as MuiToolbar } from "@mui/material";
import { TOOLBAR_HEIGHT } from "../constants";
import { WalletButton } from "./Buttons";
import { customTheme } from "../styles";

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
          display: "flex",
          justifyContent: "right",
          alignItems: "center",
          flexDirection: "row",
          height: TOOLBAR_HEIGHT,
          width: "70%",
          mt: 2,
          mb: 2,
          bgcolor: customTheme.grey,
          borderRadius: "10px",
          border: `2px solid ${customTheme.light}`,
        }}
      >
        <Box
          sx={{
            display: "flex",
            width: "15%",
            height: "100%",
            p: 2,
          }}
        >
          <WalletButton />
        </Box>
      </MuiToolbar>
    </AppBar>
  );
}
