import * as React from "react";
import AppBar from "@mui/material/AppBar";
import { Toolbar as MuiToolbar } from "@mui/material";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import { customTheme } from "../styles";
import { DRAWER_WIDTH, TOOLBAR_HEIGHT } from "../constants";

export function Toolbar() {
  return (
    <AppBar
      position="fixed"
      sx={{
        width: `calc(100% - ${DRAWER_WIDTH}px)`,
      }}
    >
      <MuiToolbar
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "row",
          height: TOOLBAR_HEIGHT,
          width: "100%",
        }}
      >
        <Typography
          variant="h1"
          noWrap
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            "&:hover": {
              color: customTheme.dark,
              textShadow: `0 0 10px ${customTheme.light}`,
            },
          }}
        >
          EPOCH
        </Typography>
      </MuiToolbar>
      <Divider
        sx={{
          bgcolor: customTheme.dark,
        }}
      />
    </AppBar>
  );
}
