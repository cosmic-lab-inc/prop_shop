import * as React from "react";
import { Box } from "@mui/material";
import { Header, TopFunds } from ".";

export function Home() {
  return (
    <Box
      sx={{
        width: "100%",
        minHeight: "800px",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <Header />
      <TopFunds />
    </Box>
  );
}
