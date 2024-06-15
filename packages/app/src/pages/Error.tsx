import * as React from "react";
import { useRouteError } from "react-router-dom";
import { Box } from "@mui/material";
import { customTheme } from "../styles";

export function Error() {
  const error = useRouteError() as any;
  console.error(error);

  return (
    <Box
      sx={{
        minWidth: "90%",
        maxWidth: "90%",
        minHeight: "900px",
        bgcolor: customTheme.dark,
        borderRadius: "2px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexDirection: "column",
        padding: "30px",
      }}
    >
      <h1>Oops!</h1>
      <p>Sorry, an unexpected error has occurred.</p>
      <p>
        <i>{error.statusText || error.message}</i>
      </p>
    </Box>
  );
}
