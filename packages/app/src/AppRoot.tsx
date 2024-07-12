import React from "react";
import { App } from "./App";
import { ThemeProvider } from "@mui/material";
import { theme } from "./styles";
import { observer } from "mobx-react";
import CacheBuster from "react-cache-buster";
import { version } from "../package.json";

export const AppRoot = observer((): JSX.Element => {
  return (
    <CacheBuster
      currentVersion={version}
      isEnabled
      isVerboseMode={false}
      metaFileDirectory={"."}
      reloadOnDowngrade
    >
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </CacheBuster>
  );
});
