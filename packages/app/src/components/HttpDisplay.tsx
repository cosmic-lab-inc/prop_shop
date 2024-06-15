import * as React from "react";
import { observer } from "mobx-react";
import ReactJson, { ReactJsonViewProps } from "react-json-view";
import { customTheme } from "../styles";
import { Box } from "@mui/material";

export const HttpDisplay = observer((props: ReactJsonViewProps) => {
  return (
    <Box
      sx={{
        maxHeight: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        flexGrow: 1,
      }}
    >
      <ReactJson
        {...props}
        theme="mocha"
        name={false}
        displayDataTypes={false}
        displayObjectSize={false}
        indentWidth={2}
        quotesOnKeys={false}
        style={{
          padding: "10px",
          fontSize: 14,
          borderRadius: "3px",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          backgroundColor: customTheme.dark,
          maxHeight: "inherit",
        }}
      />
    </Box>
  );
});
