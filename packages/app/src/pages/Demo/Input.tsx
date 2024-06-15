import * as React from "react";
import { Button, ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";
import { observer } from "mobx-react";

export const Input = observer((props: ButtonProps) => {
  return (
    <Button
      sx={{
        borderRadius: "3px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        m: 1,

        bgcolor: customTheme.rust,
        color: customTheme.light,
        width: "100%",
        height: "100%",
        border: `1px solid ${customTheme.rust}`,
        "&:hover": {
          bgcolor: customTheme.light,
          color: customTheme.rust,
          border: `1px solid ${customTheme.rust}`,
        },
        fontFamily: customTheme.font.titilliumBold,
      }}
      {...props}
    >
      {props.children}
    </Button>
  );
});
