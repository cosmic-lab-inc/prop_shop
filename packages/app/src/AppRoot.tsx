import React from "react";
import { App } from "./App";
import { observer } from "mobx-react";
import CacheBuster from "react-cache-buster";
import { version } from "../package.json";

export const AppRoot = observer((): JSX.Element => {
  let _version = version;
  if (process.env.ENV === "dev") {
    // random patch version between 0 and 100 to bust cache on every update
    _version = `0.0.${Math.floor(Math.random() * 100)}`;
  }
  return (
    <CacheBuster
      currentVersion={_version}
      isEnabled
      isVerboseMode={false}
      metaFileDirectory={"."}
      reloadOnDowngrade
      onCacheClear={() => {
        console.debug("cache busted");
      }}
    >
      <App />
    </CacheBuster>
  );
});
