import React from "react";
import { Box, Typography } from "@mui/material";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { ActionButton } from "../../components";
import { NewFundDialog } from "./NewFundDialog";

// todo: fetch vaults and sort by criteria using PropShopClient
export function NewFund({ client }: { client: PropShopClient }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <NewFundDialog
        client={client}
        open={open}
        onClose={() => setOpen(false)}
      />
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
        <Typography variant="h2">Think you can beat the market?</Typography>
        <Box
          sx={{
            width: "20%",
            height: "100px",
          }}
        >
          <ActionButton onClick={() => setOpen(true)}>
            <Typography variant="h3">Create a Fund</Typography>
          </ActionButton>
        </Box>
      </Box>
    </>
  );
}
