import React from "react";
import { Box, Typography } from "@mui/material";
import { FundOverview, PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { mockFundOverviews } from "../../lib";
import { ActionButton } from "../../components";

// todo: fetch vaults and sort by criteria using PropShopClient
export function NewFund({ client }: { client: PropShopClient }) {
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
        justifyContent: "center",
        flexDirection: "row",
        gap: 3,
      }}
    >
      <Typography variant="h2">Know how to trade?</Typography>
      <Box
        sx={{
          width: "20%",
          height: "100px",
        }}
      >
        <ActionButton>
          <Typography variant="h3">Create a Fund</Typography>
        </ActionButton>
      </Box>
    </Box>
  );
}
