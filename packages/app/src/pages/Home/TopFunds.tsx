import React from "react";
import { customTheme } from "../../styles";
import { Box, styled, Typography } from "@mui/material";
import { FundOverviewCard } from "../../components";
import { FundOverview, PropShopClient } from "@cosmic-lab/prop-shop-sdk";

const GridContainer = styled("div")(({ theme }) => ({
  gridTemplateColumns: "33% 33% 33%",
  gap: "10px",
  width: "100%",
  height: "100%",
  marginTop: "30px",
  display: "grid",
  gridAutoRows: "auto",
  justifyContent: "center",
  flexDirection: "column",
}));

export function TopFunds({ client }: { client: PropShopClient }) {
  // todo: fetch vaults and sort by criteria using PropShopClient
  // const vaults = mockFundOverviews();

  const [vaults, setVaults] = React.useState<FundOverview[]>([]);
  React.useEffect(() => {
    async function fetchVaults() {
      const vaults = await client!.fundOverviews();
      setVaults(vaults);
    }

    fetchVaults();
  }, []);

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
        <GridContainer>
          {vaults.map((vault, i) => {
            return (
              <FundOverviewCard
                key={i}
                title={vault.title}
                investors={vault.investors}
                aum={vault.aum}
                data={vault.data}
              />
            );
          })}
        </GridContainer>
      </Box>
    </Box>
  );
}
