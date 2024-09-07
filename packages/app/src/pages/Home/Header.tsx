import { Box, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import { ActionButton, ArrowsIcon } from "../../components";
import * as React from "react";
import { Link } from "react-router-dom";

export function Header() {
  return (
    <Box
      sx={{
        pt: 2,
        pb: 2,
        gap: 2,
        width: "100%",
        bgcolor: customTheme.light,
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
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="h2">Prop Shop</Typography>
          <Typography variant="h2">Crypto Trading Strategies</Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            width: "30%",
          }}
        >
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
                flexDirection: "row",
                justifyContent: "center",
                width: "80%",
                height: "60px",
              }}
            >
              <ActionButton>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography variant="h3">Join as a Trader</Typography>
                  <ArrowsIcon color={customTheme.dark} />
                </Box>
              </ActionButton>
            </Box>
          </Link>
        </Box>
      </Box>
    </Box>
  );
}
