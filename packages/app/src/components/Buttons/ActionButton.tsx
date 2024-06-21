import React, { useEffect } from "react";
import { alpha, Button, ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";

export function ActionButton(props: ButtonProps) {
  const { children, disabled } = props;

  const [color, setColor] = React.useState(customTheme.secondary);
  useEffect(() => {
    if (disabled) {
      setColor(alpha(customTheme.secondary, 0.7));
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
        borderRadius: "3px",
        bgcolor: color,
        "&:hover": {
          bgcolor: alpha(color, 0.7),
        },
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
