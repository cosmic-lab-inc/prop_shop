import React from "react";
import {
  Box,
  FormControl,
  OutlinedInput,
  styled,
  Typography,
} from "@mui/material";
import { customTheme } from "../../../styles";
import { PropShopClient, shortenAddress } from "@cosmic-lab/prop-shop-sdk";
import { ActionButton } from "../../../components";
import { PublicKey } from "@solana/web3.js";
import { useSnackbar } from "notistack";
import { TransferInputAction } from "./TransferInputDialog";
import InputAdornment from "@mui/material/InputAdornment";

export function InputFields({ client }: { client: PropShopClient }) {
  const { enqueueSnackbar } = useSnackbar();

  // dialog state
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState(0);
  const [defaultValue, setDefaultValue] = React.useState<number | undefined>(
    undefined,
  );
  const [action, setAction] = React.useState<TransferInputAction>(
    TransferInputAction.UNKNOWN,
  );

  React.useEffect(() => {
    if (action !== TransferInputAction.UNKNOWN) {
      setOpen(true);
    }
  }, [defaultValue]);

  function resetDialog() {
    setOpen(false);
  }

  async function submit() {
    resetDialog();
    // todo: create vault ix
  }

  return (
    <>
      <Box
        sx={{
          width: "100%",
          borderRadius: "10px",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: 1,
          p: 1,
          bgcolor: customTheme.grey,
        }}
      >
        <Fields />

        <Box
          sx={{
            height: "100px",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 1,
            width: "100%",
          }}
        >
          <ActionButton onClick={() => submit()}>
            <Typography variant="button">CREATE</Typography>
          </ActionButton>
        </Box>
      </Box>
    </>
  );
}

function Fields() {
  return (
    <Box
      sx={{
        flexGrow: 1,
        bgcolor: customTheme.grey,
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <div style={{ width: "100%" }}>
        <NumberInput defaultValue={9879} onChange={() => {}} />

        <TableRow hover>
          <Typography variant="h4">Investor</Typography>
          <Typography variant="h4">
            {shortenAddress(PublicKey.default.toString())}
          </Typography>
        </TableRow>
      </div>
    </Box>
  );
}

const TableRow = styled("div")<{ hover?: boolean; header?: boolean }>(
  ({ theme, hover, header }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "10px",
    borderRadius: "10px",
    color: customTheme.dark,
    "&:hover": {
      backgroundColor: `${hover ? customTheme.grey2 : "transparent"}`,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.dark}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);

function TextInput({
  defaultValue,
  onChange,
}: {
  defaultValue: string | number;
  onChange: (value: string | number) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        bgcolor: customTheme.grey,
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
              bgcolor: customTheme.secondary,
            }}
            defaultValue={defaultValue}
            multiline={false}
            startAdornment={
              <InputAdornment position="start">
                <Typography
                  variant="h3"
                  sx={{ color: customTheme.light, fontWeight: 300 }}
                >
                  $
                </Typography>
              </InputAdornment>
            }
            type={"text"}
            onChange={(i: any) => {
              onChange(i.target.value as string);
            }}
          />
        </FormControl>
      </Box>
    </Box>
  );
}

function NumberInput({
  defaultValue,
  onChange,
}: {
  defaultValue: string | number;
  onChange: (value: string | number) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        bgcolor: customTheme.grey,
        alignItems: "center",
        justifyContent: "center",
        // p: 1,
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
              borderRadius: "10px",
              "&:hover": {
                backgroundColor: customTheme.grey2,
              },
            },
          }}
        >
          <OutlinedInput
            sx={{
              bgcolor: customTheme.grey,
            }}
            defaultValue={defaultValue}
            label={defaultValue}
            multiline={false}
            startAdornment={
              <InputAdornment position="start">
                <Typography
                  variant="h3"
                  sx={{ color: customTheme.light, fontWeight: 300 }}
                >
                  $
                </Typography>
              </InputAdornment>
            }
            type={"number"}
            onChange={(i: any) => {
              const num = parseInt(i.target.value, 10);
              if (isNaN(num)) return;
              onChange(num);
            }}
          />
        </FormControl>
      </Box>
    </Box>
  );
}
