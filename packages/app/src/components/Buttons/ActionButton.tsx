import React, { useEffect } from "react";
import { Button, ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";
import { darken } from "@mui/system/colorManipulator";

export function ActionButton(props: ButtonProps) {
  const { children, disabled } = props;

  const [color, setColor] = React.useState(customTheme.secondary);
  useEffect(() => {
    if (disabled) {
      setColor(darken(customTheme.grey2, 0.2));
    } else {
      setColor(customTheme.secondary);
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
        bgcolor: color,
        "&:hover": {
          bgcolor: darken(color, 0.2),
        },
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
