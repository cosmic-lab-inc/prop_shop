import React from "react";
import { Dialog } from "@mui/material";
import { InputFields } from "./InputFields";
import { CreateVaultConfig, PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { useSnackbar } from "notistack";

export function NewFundDialog({
  client,
  open,
  onClose,
}: {
  client: PropShopClient;
  open: boolean;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();

  async function submit(config: CreateVaultConfig) {
    const snack = (await client.createVault(config)).snack;
    enqueueSnackbar(snack.message, {
      variant: snack.variant,
    });
  }

  return (
    <>
      <Dialog
        maxWidth="lg"
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
        <InputFields client={client} onSubmit={submit} />
      </Dialog>
    </>
  );
}
