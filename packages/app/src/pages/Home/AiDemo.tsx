import { Box, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import * as React from "react";

export function AiDemo() {
  return (
    <Box
      sx={{
        width: "90%",
        // bgcolor: customTheme.red,
        display: "flex",
        p: 1,
        mt: 10,
        mb: 10,
        borderRadius: "3px",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          gap: 2,
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "left",
        }}
      >
        <Typography variant="h2">
          Turn data into dollars
          <span style={{ color: customTheme.red }}>{" without code. "}</span>
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          mt: 2,
          borderRadius: "3px",
        }}
      ></Box>
      <img src={"/public/ai-demo.png"} alt="ai-demo" />
    </Box>
  );
}
