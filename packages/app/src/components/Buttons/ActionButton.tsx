import React, { useEffect } from "react";
import { alpha, Button, ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";

export function ActionButton(props: ButtonProps) {
  const { children, disabled } = props;

  const [color, setColor] = React.useState(customTheme.red);
  useEffect(() => {
    if (disabled) {
      setColor(alpha(customTheme.rust, 0.6));
    } else {
      setColor(customTheme.rust);
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
        color: customTheme.light,
        bgcolor: color,
        border: `1px solid ${color}`,
        "&:hover": {
          bgcolor: customTheme.light,
          color: customTheme.rust,
          border: `1px solid ${customTheme.rust}`,
        },
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
