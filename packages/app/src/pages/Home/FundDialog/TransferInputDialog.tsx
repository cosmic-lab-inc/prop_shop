import React from "react";
import { customTheme } from "../../../styles";
import { Box, Dialog, FormControl, OutlinedInput } from "@mui/material";
import { PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import InputAdornment from "@mui/material/InputAdornment";
import { SendButton } from "../../../components";
import { PublicKey } from "@solana/web3.js";

export enum TransferInputAction {
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw",
  UNKNOWN = "unknown",
}

export function TransferInputDialog({
  client,
  vault,
  defaultValue,
  open,
  onClose,
  onChange,
  onSubmit,
}: {
  client: PropShopClient;
  vault: PublicKey;
  defaultValue: number;
  open: boolean;
  onClose: () => void;
  onChange: (value: number) => void;
  onSubmit: () => Promise<void>;
}) {
  // const [defaultValue, setDefaultValue] = React.useState(0);
  //
  // React.useEffect(() => {
  //   async function handleAction() {
  //     console.log(`use effect action: ${action}`);
  //     if (action === TransferInputAction.DEPOSIT) {
  //       const usdc = await client.fetchWalletUSDC();
  //       console.log(`deposit: ${usdc}`);
  //       setDefaultValue(usdc ?? 0);
  //     } else if (action === TransferInputAction.WITHDRAW) {
  //       const equity = await client.fetchVaultEquity(vault);
  //       console.log(`withdraw: ${equity}`);
  //       setDefaultValue(equity ?? 0);
  //     } else {
  //       setDefaultValue(0);
  //     }
  //   }
  //
  //   handleAction();
  // }, [action]);

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
            background: customTheme.grey2,
            borderRadius: "10px",
          },
        }}
        sx={{
          bgcolor: "transparent",
        }}
      >
        <Input
          defaultValue={defaultValue}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      </Dialog>
    </>
  );
}

function Input({
  defaultValue,
  onChange,
  onSubmit,
}: {
  defaultValue: number;
  onChange: (value: number) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        bgcolor: customTheme.light,
        alignItems: "center",
        justifyContent: "center",
        p: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          width: "100%",
          gap: 1,
        }}
      >
        <FormControl
          fullWidth
          variant="outlined"
          sx={{
            "& .MuiOutlinedInput-root": {
              "& fieldset": {
                border: "none",
              },
              "&:hover fieldset": {
                border: "none",
              },
            },
          }}
        >
          <OutlinedInput
            sx={{
              bgcolor: customTheme.grey2,
            }}
            defaultValue={defaultValue}
            multiline={false}
            startAdornment={<InputAdornment position="start">$</InputAdornment>}
            type={"number"}
            onChange={(i: any) => {
              const num = parseInt(i.target.value, 10);
              if (isNaN(num)) return;
              onChange(num);
            }}
          />
        </FormControl>
        <Box
          sx={{
            width: "15%",
          }}
        >
          <SendButton onClick={onSubmit} />
        </Box>
      </Box>
    </Box>
  );
}
