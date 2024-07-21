import React, { useEffect } from "react";
import { Button, ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";
import { darken } from "@mui/system/colorManipulator";

type Props = ButtonProps & {
  header?: boolean;
  footer?: boolean;
};

export function ActionButton(props: Props) {
  const { children, disabled, header, footer } = props;

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

        borderTopLeftRadius: header ? "10px" : "0",
        borderTopRightRadius: header ? "10px" : "0",
        borderBottomLeftRadius: footer ? "10px" : "0",
        borderBottomRightRadius: footer ? "10px" : "0",
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
