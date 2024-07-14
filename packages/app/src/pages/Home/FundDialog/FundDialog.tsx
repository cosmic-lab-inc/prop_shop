import React from "react";
import { customTheme } from "../../../styles";
import { Box, Dialog } from "@mui/material";
import { InvestorStats } from "./InvestorStats";

export function FundDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const handleClose = () => {
    onClose();
  };

  return (
    <>
      <Dialog
        maxWidth="lg"
        fullWidth={true}
        fullScreen={false}
        scroll="paper"
        open={open}
        onClose={handleClose}
        PaperProps={{
          style: {
            background: customTheme.grey2,
            borderRadius: "10px",
            height: "300px",
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
          <InvestorStats />
        </Box>
      </Dialog>
    </>
  );
}
