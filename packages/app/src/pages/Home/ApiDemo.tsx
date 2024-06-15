import { Box, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import { ActionButton, HttpDisplay } from "../../components";
import * as React from "react";
import { Link } from "react-router-dom";

export function ApiDemo() {
  const reqDemo: Record<string, any> = {
    key: "BM5Kvgpz2XLez2XhfNNeZaXWtHH6NASYw1P74NwEB4sL",
    owner: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    discriminant: "User",
    slot: 219546079,
    limit: 1,
  };

  return (
    <Box
      sx={{
        p: 2,
        gap: 2,
        width: "70%",
        bgcolor: customTheme.grey,
        borderRadius: "3px",
        display: "flex",
        justifyContent: "space-around",
        flexDirection: "row",
      }}
    >
      <Box
        sx={{
          width: "70%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <HttpDisplay src={reqDemo} />
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          width: "30%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            width: "100%",
            gap: 1,
          }}
        >
          <Typography variant="h3">Every program.</Typography>
          <Typography variant="h3">Every account.</Typography>
          <Typography variant="h3">Every point in time.</Typography>
          <Typography variant="h3">Everything decoded.</Typography>
        </Box>
        <Link
          to="/demo"
          style={{
            display: "flex",
            width: "100%",
            textDecoration: "none",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              pt: 2,
              width: "100%",
              height: "80px",
            }}
          >
            <ActionButton>Start for free</ActionButton>
          </Box>
        </Link>
      </Box>
    </Box>
  );
}
