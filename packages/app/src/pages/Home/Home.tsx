import * as React from "react";
import { Box } from "@mui/material";
import { Header, TopFunds } from ".";
import { useClient } from "../../lib";

export function Home() {
  const client = useClient();
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
      {client && <TopFunds client={client} />}
    </Box>
  );
}
