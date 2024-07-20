import React, { ReactNode } from "react";
import {
  Box,
  IconButton as MuiIconButton,
  styled,
  Typography,
} from "@mui/material";
import { customTheme } from "../../../styles";
import {
  PropShopClient,
  shortenAddress,
  WithdrawRequestTimer,
} from "@cosmic-lab/prop-shop-sdk";
import { observer } from "mobx-react";
import { ContentCopyOutlined } from "@mui/icons-material";
import {
  ActionButton,
  IconButton,
  MinusIcon,
  PlusIcon,
} from "../../../components";
import { PublicKey } from "@solana/web3.js";
import { useSnackbar } from "notistack";
import {
  TransferInputAction,
  TransferInputDialog,
} from "./TransferInputDialog";

const BUTTON_AREA_WIDTH = "30%";
const STATS_AREA_WIDTH = `calc(100% - ${BUTTON_AREA_WIDTH})`;

export const InvestorStats = observer(
  ({ client, vault }: { client: PropShopClient; vault: PublicKey }) => {
    const vd = client.clientVaultDepositor(vault);
    React.useEffect(() => {
      async function run() {
        await client.createWithdrawTimer(vault);
        await client.fetchVaultEquity(vault);
      }

      run();
    }, []);

    const { enqueueSnackbar } = useSnackbar();

    async function requestWithdraw() {
      const snack = await client.requestWithdraw(vault, input);
      enqueueSnackbar(snack.message, {
        variant: snack.variant,
      });
    }

    async function withdraw() {
      const snack = await client.withdraw(vault);
      enqueueSnackbar(snack.message, {
        variant: snack.variant,
      });
    }

    async function cancelWithdraw() {
      const snack = await client.cancelWithdrawRequest(vault);
      enqueueSnackbar(snack.message, {
        variant: snack.variant,
      });
    }

    async function deposit() {
      const snack = await client.deposit(vault, input);
      enqueueSnackbar(snack.message, {
        variant: snack.variant,
      });
    }

    // dialog state
    const [open, setOpen] = React.useState(false);
    const [input, setInput] = React.useState(0);
    const [defaultValue, setDefaultValue] = React.useState(0);
    const [action, setAction] = React.useState<TransferInputAction>(
      TransferInputAction.UNKNOWN,
    );

    React.useEffect(() => {
      if (action !== TransferInputAction.UNKNOWN) {
        setOpen(true);
      }
    }, [defaultValue]);

    async function clickDeposit() {
      setAction(TransferInputAction.DEPOSIT);
      const usdc = await client.fetchWalletUSDC();
      setInput(usdc ?? 0);
      setDefaultValue(usdc ?? 0);
    }

    async function clickRequestWithdraw() {
      setAction(TransferInputAction.WITHDRAW);
      const equity = await client.fetchVaultEquity(vault);
      setInput(equity ?? 0);
      setDefaultValue(equity ?? 0);
    }

    function resetDialog() {
      setOpen(false);
      setAction(TransferInputAction.UNKNOWN);
      setDefaultValue(0);
    }

    async function submit() {
      if (action === TransferInputAction.WITHDRAW) {
        await requestWithdraw();
      } else if (action === TransferInputAction.DEPOSIT) {
        await deposit();
      } else {
        console.error("Invalid action on submit");
      }
      resetDialog();
    }

    return (
      <>
        <TransferInputDialog
          client={client}
          vault={vault}
          defaultValue={defaultValue}
          open={open}
          onClose={() => resetDialog()}
          onChange={(value: number) => setInput(value)}
          onSubmit={async () => {
            await submit();
          }}
        />
        <Box
          sx={{
            width: "100%",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "row",
            flexGrow: 1,
            gap: 1,
            p: 1,
            bgcolor: customTheme.light,
          }}
        >
          <Stats client={client} vault={vault} />

          <Box
            sx={{
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              width: BUTTON_AREA_WIDTH,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                gap: 1,
                width: "100%",
                flexGrow: 1,
                height: "100%",
              }}
            >
              <IconButton
                component={MinusIcon}
                iconSize={60}
                disabled={!vd || !client.hasWithdrawRequest(vault)}
                onClick={withdraw}
              >
                <Typography variant="button">WITHDRAW</Typography>
              </IconButton>

              <IconButton
                component={PlusIcon}
                iconSize={60}
                disabled={client.hasWithdrawRequest(vault)}
                onClick={clickDeposit}
              >
                <Typography variant="button">DEPOSIT</Typography>
              </IconButton>
            </Box>

            {client.hasWithdrawRequest(vault) ? (
              <ActionButton
                disabled={!client.hasWithdrawRequest(vault)}
                onClick={cancelWithdraw}
              >
                <Typography variant="button">CANCEL WITHDRAW</Typography>
              </ActionButton>
            ) : (
              <ActionButton
                disabled={
                  !client.vaultEquity(vault) ||
                  !vd ||
                  client.hasWithdrawRequest(vault)
                }
                onClick={clickRequestWithdraw}
              >
                <Typography variant="button">REQUEST WITHDRAW</Typography>
              </ActionButton>
            )}
          </Box>
        </Box>
      </>
    );
  },
);

const Stats = observer(
  ({ client, vault }: { client: PropShopClient; vault: PublicKey }) => {
    const key = client.clientVaultDepositor(vault)?.key;

    const [timer, setTimer] = React.useState<WithdrawRequestTimer | undefined>(
      undefined,
    );
    const [equity, setEquity] = React.useState<number | undefined>(undefined);
    React.useEffect(() => {
      setEquity(client.vaultEquity(vault));
      setTimer(client.withdrawTimer(vault));
    }, [key, client.vaultEquity(vault), client.withdrawTimer(vault)]);

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "10px",
          width: STATS_AREA_WIDTH,
        }}
      >
        <Container>
          <div style={{ width: "100%" }}>
            <TableRow hover>
              <Text>Equity</Text>
              <TextIconWrapper text={equity ? `$${equity}` : "--"} />
            </TableRow>
            <TableRow hover>
              <Text>Vault Depositor</Text>
              <TextIconWrapper
                text={client.getVaultDepositorAddress(vault).toString()}
                shorten
              />
            </TableRow>
            <TableRow hover>
              <Text>Vault</Text>
              <TextIconWrapper text={vault.toString()} shorten />
            </TableRow>
            <TableRow hover>
              <Text>Withdraw Request Countdown</Text>
              <TextIconWrapper
                text={timer?.secondsRemaining.toString() ?? "--"}
              />
            </TableRow>
            <TableRow hover>
              <Text>Withdraw Request Equity</Text>
              <TextIconWrapper text={timer ? `$${timer.equity}` : "--"} />
            </TableRow>
          </div>
        </Container>
      </Box>
    );
  },
);

function CopyButton({ text }: { text: string }) {
  function copy() {
    navigator.clipboard.writeText(text);
  }

  return (
    <MuiIconButton
      sx={{
        p: 0,
        color: "inherit",
      }}
      onClick={() => copy()}
    >
      <ContentCopyOutlined />
    </MuiIconButton>
  );
}

function Container({ children }: { children: ReactNode }) {
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
      {children}
    </Box>
  );
}

function Text({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="body1"
      sx={{ fontFamily: customTheme.font.titilliumBold }}
    >
      {children}
    </Typography>
  );
}

function TextIconWrapper({
  text,
  shorten,
}: {
  text: string;
  shorten?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Text>{shorten ? shortenAddress(text) : text}</Text>
      <CopyButton text={text} />
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
