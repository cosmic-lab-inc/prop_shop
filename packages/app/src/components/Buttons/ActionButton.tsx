import React, { useEffect } from "react";
import { Button, ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";
import { darken } from "@mui/system/colorManipulator";

export function ActionButton(props: ButtonProps) {
  const { children, disabled } = props;

  const [color, setColor] = React.useState(customTheme.secondary);
  useEffect(() => {
    if (disabled) {
      setColor(customTheme.grey);
    } else {
      setColor(customTheme.light);
    }
  }, [disabled]);

  return (
    <Button
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: "10px",

        bgcolor: disabled
          ? darken(customTheme.secondary, 0.4)
          : customTheme.secondary,
        color,

        "&:hover": {
          bgcolor: disabled
            ? customTheme.grey
            : darken(customTheme.secondary, 0.2),
        },
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
