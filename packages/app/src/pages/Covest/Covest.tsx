import * as React from "react";
import { Box } from "@mui/material";
import { observer } from "mobx-react";

export const Covest = observer(() => {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        flexDirection: "column",
      }}
    ></Box>
  );
});
