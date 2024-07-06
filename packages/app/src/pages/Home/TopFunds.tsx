import React from "react";
import { customTheme } from "../../styles";
import { Box, Typography } from "@mui/material";
import { FundOverviewCard } from "../../components";
import { mockData, randomNumber } from "@cosmic-lab/prop-shop-sdk";

export function TopFunds() {
  return (
    <Box
      sx={{
        width: "70%",
        bgcolor: customTheme.light,
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <Typography variant="h2" sx={{ color: customTheme.dark }}>
          Top Funds by ROI
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          gap: 2,
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <FundOverviewCard
          title={"W.D. Gann"}
          investors={randomNumber(1000, 2000)}
          aum={randomNumber(1_500_000, 2_000_000)}
          data={mockData(1_000, 350)}
        />
        <FundOverviewCard
          title={"W.D. Gann"}
          investors={randomNumber(10, 30)}
          aum={randomNumber(300_000, 400_000)}
          data={mockData(100, 230)}
        />
        <FundOverviewCard
          title={"W.D. Gann"}
          investors={randomNumber(500, 600)}
          aum={randomNumber(100_000, 150_000)}
          data={mockData(1_000, 198)}
        />
      </Box>
    </Box>
  );
}
