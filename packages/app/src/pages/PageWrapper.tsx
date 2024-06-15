import type { Adapter, WalletError } from "@solana/wallet-adapter-base";
import { WalletDialogProvider } from "@solana/wallet-adapter-material-ui";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { SnackbarProvider, useSnackbar } from "notistack";
import type { ReactNode } from "react";
import React, { useCallback, useMemo } from "react";
import { ThemeWrapper } from "../styles";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { CssBaseline } from "@mui/material";
import Box from "@mui/material/Box";
import { Drawer, Toolbar } from "../components";
import { TOOLBAR_HEIGHT } from "../constants";

export function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeWrapper>
      <Context>
        <Content>{children}</Content>
      </Context>
    </ThemeWrapper>
  );
}

function Context({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => "http://localhost:8899", []);

  const wallets = useMemo(
    () => [new SolflareWalletAdapter()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { enqueueSnackbar } = useSnackbar();
  const onError = useCallback(
    (error: WalletError, adapter?: Adapter) => {
      enqueueSnackbar(
        error.message ? `${error.name}: ${error.message}` : error.name,
        {
          variant: "error",
        },
      );
      console.error(error, adapter);
    },
    [enqueueSnackbar],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SnackbarProvider>
        <WalletProvider wallets={wallets} onError={onError}>
          <WalletDialogProvider>{children}</WalletDialogProvider>
        </WalletProvider>
      </SnackbarProvider>
    </ConnectionProvider>
  );
}

function Content({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <Toolbar />
      <Drawer />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          marginTop: `${TOOLBAR_HEIGHT}px`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
