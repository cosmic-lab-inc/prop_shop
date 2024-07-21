import React from "react";
import { Box, styled, Typography } from "@mui/material";
import { FundOverviewCard } from "./FundOverviewCard";
import { FundOverview, PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { mockFundOverviews } from "../../lib";

// todo: fetch vaults and sort by criteria using PropShopClient
export function Funds({ client }: { client: PropShopClient }) {
  const [funds, setFunds] = React.useState<FundOverview[]>([]);

  React.useEffect(() => {
    async function fetchFunds() {
      if (
        process.env.ENV === "dev" ||
        process.env.RPC_URL === "http://localhost:8899"
      ) {
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

    fetchFunds();
  }, []);

  return (
    <Box
      sx={{
        width: "70%",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        pb: 5,
      }}
    >
      <Box
        sx={{
          width: "60%",
          height: "100%",
          display: "flex",
          p: 5,
          borderRadius: "10px",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          gap: 2,
        }}
      >
        <Typography variant="h1">Build wealth while you sleep</Typography>
        <Typography variant="h3">
          Invest in the best traders on Solana
        </Typography>
      </Box>
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

const GridContainer = styled("div")(({ theme }) => ({
  // gridTemplateColumns: "33.3% 33.3% 33.3%",
  gridTemplateColumns: "25% 25% 25% 25%",
  gap: "20px",
  width: "100%",
  height: "100%",
  display: "grid",
  gridAutoRows: "auto",
  justifyContent: "center",
  flexDirection: "column",
}));
