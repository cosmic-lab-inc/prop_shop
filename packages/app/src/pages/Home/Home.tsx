import * as React from "react";
import { Box } from "@mui/material";
import { ApiDemo, Header, Pricing } from ".";

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
      <ApiDemo />
      {/*<AiDemo />*/}
      <Pricing />
    </Box>
  );
}
