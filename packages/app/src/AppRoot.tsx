import React from "react";
import { App } from "./App";
import { ThemeProvider } from "@mui/material";
import { theme } from "./styles";
import { observer } from "mobx-react";

export const AppRoot = observer((): JSX.Element => {
  return (
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  );
});
