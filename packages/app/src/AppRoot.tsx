import React from "react";
import { App } from "./App";
import { ThemeProvider } from "@mui/material";
import { theme } from "./styles";
import { observer } from "mobx-react";
import CacheBuster from "react-cache-buster";
import { version } from "../package.json";

export const AppRoot = observer((): JSX.Element => {
  let _version = version;
  if (process.env.ENV === "dev") {
    // random patch version between 0 and 100 to bust cache on every dev update
    _version = `0.0.${Math.floor(Math.random() * 100)}`;
    console.log("dev app version:", _version);
  }
  return (
    <CacheBuster
      currentVersion={_version}
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
