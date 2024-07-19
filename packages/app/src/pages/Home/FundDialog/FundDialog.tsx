import React from "react";
import { customTheme } from "../../../styles";
import { Box, Dialog } from "@mui/material";
import { InvestorStats } from "./InvestorStats";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { PublicKey } from "@solana/web3.js";

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
        maxWidth="md"
        fullWidth={true}
        fullScreen={false}
        scroll="paper"
        open={open}
        onClose={onClose}
        PaperProps={{
          style: {
            background: customTheme.grey2,
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
          }}
        >
          <InvestorStats client={client} vault={vault} />
        </Box>
      </Dialog>
    </>
  );
}
