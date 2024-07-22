import React from "react";
import { Box, Dialog } from "@mui/material";
import { InvestorStats } from "./InvestorStats";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { PublicKey } from "@solana/web3.js";
import { customTheme } from "../../../styles";

export function FundDialog({
  client,
  vault,
  open,
  onClose,
}: {
  client: PropShopClient;
  vault: PublicKey;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Dialog
        maxWidth="sm"
        fullWidth={true}
        fullScreen={false}
        scroll="paper"
        open={open}
        onClose={onClose}
        PaperProps={{
          style: {
            borderRadius: "10px",
          },
        }}
        sx={{
          backgroundColor: "transparent",
        }}
      >
        <Box
          sx={{
            width: "100%",
            height: "100%",
            flexDirection: "column",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: customTheme.grey,
          }}
        >
          <InvestorStats client={client} vault={vault} />
        </Box>
      </Dialog>
    </>
  );
}
