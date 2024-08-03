import React from "react";
import { Dialog } from "@mui/material";
import { InvestorStats } from "./InvestorStats";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { PublicKey } from "@solana/web3.js";
import { customTheme } from "../../../styles";
import Box from "@mui/material/Box";

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
  React.useEffect(() => {
    async function run() {
      await client.createWithdrawTimer(vault);
      await client.fetchVaultEquity(vault);
    }

    run();
  }, []);

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
          bgcolor: "transparent",
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
