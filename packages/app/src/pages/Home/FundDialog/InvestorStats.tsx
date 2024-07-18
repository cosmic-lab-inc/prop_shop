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
  Timer,
  truncateNumber,
} from "@cosmic-lab/prop-shop-sdk";
import { observer } from "mobx-react";
import { ContentCopyOutlined } from "@mui/icons-material";
import {
  AirdropIcon,
  IconButton,
  MinusIcon,
  PlusIcon,
} from "../../../components";
import { PublicKey } from "@solana/web3.js";
import { useSnackbar } from "notistack";

export const InvestorStats = observer(
  ({ client, vault }: { client: PropShopClient; vault: PublicKey }) => {
    const { key, data } = client.clientVaultDepositor(vault);
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

    const [countdown, setCountdown] = React.useState<Timer | undefined>(
      undefined,
    );

    const { enqueueSnackbar } = useSnackbar();

    async function handleWithdraw() {
      const reqSnack = await client.requestWithdraw(vault, equity);
      enqueueSnackbar(reqSnack.message, {
        variant: reqSnack.variant,
      });

      const timer = client.withdrawTimer(vault);
      console.log(`timer with ${timer?.secondsRemaining} seconds remaining`);
      setCountdown(client.withdrawTimer(vault));

      const withdrawSnack = await client.withdraw(vault);
      enqueueSnackbar(withdrawSnack.message, {
        variant: withdrawSnack.variant,
      });
    }

    async function cancelWithdraw() {
      const snack = await client.cancelWithdrawRequest(vault);
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
        <Stats
          client={client}
          vault={vault}
          equity={equity}
          countdown={countdown}
        />

        <Box
          sx={{
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
          }}
        >
          <IconButton component={PlusIcon} iconSize={50} disabled={true} />
          <IconButton
            component={MinusIcon}
            iconSize={50}
            disabled={false}
            onClick={handleWithdraw}
          />
          <IconButton
            component={AirdropIcon}
            iconSize={50}
            disabled={!client.hasWithdrawRequest(vault)}
            onClick={cancelWithdraw}
          />
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
    countdown,
  }: {
    client: PropShopClient;
    vault: PublicKey;
    equity: number;
    countdown: Timer | undefined;
  }) => {
    const { key } = client.clientVaultDepositor(vault);
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
                text={countdown ? countdown.secondsRemaining.toString() : "--"}
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
