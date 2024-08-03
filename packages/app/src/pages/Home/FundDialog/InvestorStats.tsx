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
import { ActionButton } from "../../../components";
import { PublicKey } from "@solana/web3.js";
import { useSnackbar } from "notistack";
import {
  TransferInputAction,
  TransferInputDialog,
} from "./TransferInputDialog";
import { UpdateFundDialog } from "../UpdateFundDialog";

// todo: useState for timer and equity, and rerender on changes
export const InvestorStats = observer(
  ({ client, vault }: { client: PropShopClient; vault: PublicKey }) => {
    // DIALOG STATE
    const { enqueueSnackbar } = useSnackbar();
    const [openTransferDialog, setOpenTransferDialog] = React.useState(false);
    const [input, setInput] = React.useState(0);
    const [defaultValue, setDefaultValue] = React.useState<number | undefined>(
      undefined,
    );
    const [action, setAction] = React.useState<TransferInputAction>(
      TransferInputAction.UNKNOWN,
    );
    const [openSettingsDialog, setOpenSettingsDialog] =
      React.useState<boolean>(false);

    React.useEffect(() => {
      if (action !== TransferInputAction.UNKNOWN) {
        setOpenTransferDialog(true);
      }
    }, [defaultValue]);

    const [isManager, setIsManager] = React.useState<boolean>(false);
    React.useEffect(() => {
      const result = client.isManager(vault);
      if (!result.isErr()) {
        setIsManager(result.value);
      }
    });

    // CLIENT ACTIONS
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

    // ON CLICK
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

    async function clickManageSettings() {
      setOpenSettingsDialog(true);
    }

    function resetTransferDialog() {
      setOpenTransferDialog(false);
      setAction(TransferInputAction.UNKNOWN);
      setDefaultValue(undefined);
    }

    async function submit() {
      if (action === TransferInputAction.WITHDRAW) {
        await requestWithdraw();
      } else if (action === TransferInputAction.DEPOSIT) {
        await deposit();
      } else {
        console.error("Invalid action on submit");
      }
      resetTransferDialog();
    }

    return (
      <>
        <UpdateFundDialog
          client={client}
          vault={vault}
          open={openSettingsDialog}
          onClose={() => setOpenSettingsDialog(false)}
        />
        <TransferInputDialog
          defaultValue={defaultValue!}
          open={openTransferDialog}
          onClose={() => resetTransferDialog()}
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
            flexDirection: "column",
            flexGrow: 1,
            gap: 1,
            p: 1,
            bgcolor: customTheme.grey,
          }}
        >
          <Stats client={client} vault={vault} />

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
            {client.hasWithdrawRequest(vault) ? (
              <>
                <ActionButton
                  disabled={
                    (client.withdrawTimer(vault)?.secondsRemaining ?? 0) > 0
                  }
                  onClick={withdraw}
                >
                  Withdraw
                </ActionButton>
                <ActionButton onClick={cancelWithdraw}>
                  Cancel Withdraw
                </ActionButton>
              </>
            ) : (
              <>
                <ActionButton onClick={clickDeposit}>Deposit</ActionButton>
                <ActionButton
                  disabled={!client.vaultEquity(vault)}
                  onClick={clickRequestWithdraw}
                >
                  Request Withdraw
                </ActionButton>
              </>
            )}
          </Box>

          {isManager && (
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
              <ActionButton onClick={clickManageSettings}>
                Manage Settings
              </ActionButton>
            </Box>
          )}
        </Box>
      </>
    );
  },
);

// todo: remove useEffect and react mobx computed state
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
    }, [client.vaultEquity(vault), client.withdrawTimer(vault)]);

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "10px",
          width: "100%",
        }}
      >
        <Container>
          <div style={{ width: "100%" }}>
            <TableRow hover>
              <Text>Equity</Text>
              <TextIconWrapper text={equity ? `$${equity}` : "--"} />
            </TableRow>
            <TableRow hover>
              <Text>Investor</Text>
              <TextIconWrapper
                text={client.getVaultDepositorAddress(vault).toString()}
                shorten
              />
            </TableRow>
            <TableRow hover>
              <Text>Fund</Text>
              <TextIconWrapper text={vault.toString()} shorten />
            </TableRow>

            {timer && (
              <>
                {timer.secondsRemaining > 0 && (
                  <TableRow hover>
                    <Text>Withdraw Countdown</Text>
                    <TextIconWrapper text={timer.secondsRemaining.toString()} />
                  </TableRow>
                )}
                <TableRow hover>
                  <Text>Withdraw Request Equity</Text>
                  <TextIconWrapper text={`$${timer.equity}`} />
                </TableRow>
              </>
            )}
          </div>
        </Container>
      </Box>
    );
  },
);

function CopyButton({ text }: { text: string }) {
  async function copy() {
    await navigator.clipboard.writeText(text);
  }

  return (
    <MuiIconButton
      size="small"
      sx={{
        p: 0,
        color: customTheme.light,
      }}
      onClick={() => copy()}
    >
      <ContentCopyOutlined
        sx={{
          width: "20px",
        }}
      />
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
    <Typography variant="h4" sx={{ color: customTheme.light }}>
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
