import React, {FC, ReactNode} from 'react';
import {customTheme, theme} from './theme';
import {CssBaseline, styled, StyledEngineProvider, ThemeProvider,} from '@mui/material';
import {MaterialDesignContent, SnackbarProvider} from 'notistack';

const CustomSnack = styled(MaterialDesignContent)(() => ({
  '&.notistack-MuiContent-success': {
    fontSize: 20,
    fontFamily: customTheme.font.light,
    borderRadius: '10px',
    backgroundColor: customTheme.success,
  },
  '&.notistack-MuiContent-error': {
    fontSize: 20,
    fontFamily: customTheme.font.light,
    borderRadius: '10px',
    backgroundColor: customTheme.error,
  },
}));

export const ThemeWrapper: FC<{ children: ReactNode }> = ({children}) => {
  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline/>
        <SnackbarProvider
          Components={{
            error: CustomSnack,
            success: CustomSnack,
          }}
          autoHideDuration={5000}
        >
          {children}
        </SnackbarProvider>
      </ThemeProvider>
    </StyledEngineProvider>
  );
};
