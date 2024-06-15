import { Box, Typography } from "@mui/material";
import * as React from "react";
import { customTheme } from "../../styles";

export function Header() {
  return (
    <Box
      sx={{
        m: 5,
        mb: 10,
        width: "70%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <Typography
        variant="h2"
        sx={{
          textAlign: "center",
          fontFamily: customTheme.font.titilliumBold,
          fontSize: 40,
        }}
      >
        Infrastructure to mine historical Solana data
      </Typography>
    </Box>
  );
}
