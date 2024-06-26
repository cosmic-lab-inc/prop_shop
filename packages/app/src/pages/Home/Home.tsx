import * as React from "react";
import { Box } from "@mui/material";
import { Header, TopFunds } from ".";

export function Home() {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Header />
      <TopFunds />
    </Box>
  );
}
