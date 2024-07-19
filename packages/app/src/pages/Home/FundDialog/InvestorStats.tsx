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
  truncateNumber,
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

export const InvestorStats = observer(
  ({ client, vault }: { client: PropShopClient; vault: PublicKey }) => {
    const { key } = client.clientVaultDepositor(vault);
    const [equity, setEquity] = React.useState<number>(0);
    React.useEffect(() => {
      async function fetch() {
        const usdc = await client.vaultDepositorEquityInDepositAsset(
          key,
          vault,
        );
        console.log(`$${usdc}`);
        setEquity(truncateNumber(usdc, 2));
      }

      fetch();
    }, []);

    const { enqueueSnackbar } = useSnackbar();

    async function requestWithdraw() {
      const snack = await client.requestWithdraw(vault, equity);
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
      // todo
      const depositAmount = 0;
      const snack = await client.deposit(vault, depositAmount);
      enqueueSnackbar(snack.message, {
        variant: snack.variant,
      });
    }

    return (
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
        <Stats client={client} vault={vault} equity={equity} />

        <Box
          sx={{
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            height: "50%",
          }}
        >
          {client.hasWithdrawRequest(vault) ? (
            <ActionButton
              disabled={!client.hasWithdrawRequest(vault)}
              onClick={cancelWithdraw}
            >
              <Typography variant="button">CANCEL WITHDRAW</Typography>
            </ActionButton>
          ) : (
            <ActionButton
              disabled={client.hasWithdrawRequest(vault)}
              onClick={requestWithdraw}
            >
              <Typography variant="button">REQUEST WITHDRAW</Typography>
            </ActionButton>
          )}

          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              gap: 1,
              width: "100%",
            }}
          >
            <IconButton
              component={MinusIcon}
              iconSize={50}
              disabled={!client.hasWithdrawRequest(vault)}
              onClick={withdraw}
            >
              <Typography variant="button">WITHDRAW</Typography>
            </IconButton>

            <IconButton
              component={PlusIcon}
              iconSize={50}
              disabled={client.hasWithdrawRequest(vault)}
              onClick={deposit}
            >
              <Typography variant="button">DEPOSIT</Typography>
            </IconButton>
          </Box>
        </Box>
      </Box>
    );
  },
);

const Stats = observer(
  ({
    client,
    vault,
    equity,
  }: {
    client: PropShopClient;
    vault: PublicKey;
    equity: number;
  }) => {
    const { key } = client.clientVaultDepositor(vault);
    const timer = client.withdrawTimer(vault);
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
              <TextIconWrapper text={`$${equity}`} />
            </TableRow>
            <TableRow hover>
              <Text>Vault Depositor</Text>
              <TextIconWrapper text={key.toString()} shorten />
            </TableRow>
            <TableRow hover>
              <Text>Vault</Text>
              <TextIconWrapper text={vault.toString()} shorten />
            </TableRow>
            <TableRow hover>
              <Text>Withdraw Request Countdown</Text>
              <TextIconWrapper
                text={timer ? timer.secondsRemaining.toString() : "--"}
              />
            </TableRow>
            <TableRow hover>
              <Text>Withdraw Request Equity</Text>
              <TextIconWrapper
                text={timer ? `$${truncateNumber(timer.equity, 2)}` : "--"}
              />
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
