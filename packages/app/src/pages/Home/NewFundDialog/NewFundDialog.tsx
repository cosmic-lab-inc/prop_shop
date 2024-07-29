import React from "react";
import { Box, Dialog } from "@mui/material";
import { InputFields } from "./InputFields";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { customTheme } from "../../../styles";

export function NewFundDialog({
  client,
  open,
  onClose,
}: {
  client: PropShopClient;
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
          <InputFields client={client} />
        </Box>
      </Dialog>
    </>
  );
}
