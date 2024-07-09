import React from "react";
import { customTheme } from "../../styles";
import { Box, Typography } from "@mui/material";
import { FundOverviewCard } from "../../components";
import { mockFundOverviews, useClient } from "../../lib";

export function TopFunds() {
  const client = useClient();
  // todo: fetch vaults and sort by criteria using PropShopClient
  const funds = mockFundOverviews();
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
        {funds.map((fund) => {
          return (
            <FundOverviewCard
              title={fund.title}
              investors={fund.investors}
              aum={fund.aum}
              data={fund.data}
            />
          );
        })}
      </Box>
    </Box>
  );
}
