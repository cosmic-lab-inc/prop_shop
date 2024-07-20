import React from "react";
import { customTheme } from "../../styles";
import { Box, styled, Typography } from "@mui/material";
import { FundOverviewCard } from "./FundOverviewCard";
import { FundOverview, PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { mockFundOverviews } from "../../lib";

const GridContainer = styled("div")(({ theme }) => ({
  gridTemplateColumns: "33% 33% 33%",
  gap: "20px",
  width: "100%",
  height: "100%",
  marginTop: "30px",
  marginBottom: "30px",
  display: "grid",
  gridAutoRows: "auto",
  justifyContent: "center",
  flexDirection: "column",
}));

// todo: fetch vaults and sort by criteria using PropShopClient
export function Funds({ client }: { client: PropShopClient }) {
  const [funds, setFunds] = React.useState<FundOverview[]>([]);

  async function fetchFunds() {
    // only use mock data on mainnet dev mode
    if (
      process.env.ENV === "dev" &&
      process.env.RPC_URL !== "http://localhost:8899"
    ) {
      // dev mode but mainnet so use historical API
      setFunds(mockFundOverviews());
    } else if (
      process.env.ENV === "dev" &&
      process.env.RPC_URL === "http://localhost:8899"
    ) {
      // test prod but localnet doesn't have historical API
      const _funds = (await client.fundOverviews()).map((fund) => {
        return {
          ...fund,
          data: mockFundOverviews()[0].data,
        };
      });
      setFunds(_funds);
    } else {
      setFunds(await client.fundOverviews());
    }
  }

  React.useEffect(() => {
    console.log("render");
    fetchFunds();
  }, []);

  return (
    <Box
      sx={{
        width: "70%",
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
          borderRadius: "10px",
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
          borderRadius: "10px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <GridContainer>
          {funds.map((fund, i) => {
            return (
              <FundOverviewCard key={i} client={client} fundOverview={fund} />
            );
          })}
        </GridContainer>
      </Box>
    </Box>
  );
}
