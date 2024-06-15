import React, { FC, ReactNode } from 'react';
import {theme} from './theme';
import {CssBaseline, StyledEngineProvider, ThemeProvider} from '@mui/material';
import { SnackbarProvider } from 'notistack';

export const ThemeWrapper: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider>{children}</SnackbarProvider>
      </ThemeProvider>
    </StyledEngineProvider>
  );
};
