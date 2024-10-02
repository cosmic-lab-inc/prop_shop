import type {ReactNode} from 'react';
import React, {useCallback, useMemo} from 'react';
import './styles/globals.css';
import {BrowserRouter, Route, Routes} from 'react-router-dom';
import {Error, Home} from './pages';
import {observer} from 'mobx-react';
import type {Adapter, WalletError} from '@solana/wallet-adapter-base';
import {ConnectionProvider, WalletProvider,} from '@solana/wallet-adapter-react';
import {useSnackbar} from 'notistack';
import {BackpackWalletAdapter, PhantomWalletAdapter, SolflareWalletAdapter,} from '@solana/wallet-adapter-wallets';
import {CssBaseline} from '@mui/material';
import Box from '@mui/material/Box';
import {LoadScreen, Toolbar, WalletDialogProvider} from './components';
import {TOOLBAR_HEIGHT} from './constants';
import {ThemeWrapper} from './styles';
import {useClient} from './lib';

export const App = observer(() => {
  return (
    // <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          index
          element={
            <Context>
              <Content/>
            </Context>
          }
          errorElement={<Error/>}
        />
      </Routes>
    </BrowserRouter>
    // </React.StrictMode>
  );
});

const Context = observer(({children}: { children: ReactNode }) => {
  const endpoint = useMemo(
    () => process.env.RPC_URL ?? "http://localhost:8899",
    []
  );

  const wallets = useMemo(
    () => [
      new SolflareWalletAdapter(),
      new PhantomWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  const {enqueueSnackbar} = useSnackbar();
  const onError = useCallback(
    (error: WalletError, adapter?: Adapter) => {
      enqueueSnackbar(
        error.message ? `${error.name}: ${error.message}` : error.name,
        {
          variant: 'error',
        }
      );
      console.error(error, adapter);
    },
    [enqueueSnackbar]
  );

  return (
    <ThemeWrapper>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} onError={onError} autoConnect>
          <WalletDialogProvider>{children}</WalletDialogProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeWrapper>
  );
});

const Content = observer(() => {
  const client = useClient();

  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (client && !client.loading) {
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [client, client?.loading]);

  return (
    <Box sx={{display: 'flex'}}>
      <CssBaseline/>
      <Toolbar client={client}/>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: '100%',
          marginTop: `${TOOLBAR_HEIGHT}px`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {client ? (
          <Home client={client}/>
        ) : (
          <>
            <LoadScreen open={loading}/>
          </>
        )}
      </Box>
    </Box>
  );
});
