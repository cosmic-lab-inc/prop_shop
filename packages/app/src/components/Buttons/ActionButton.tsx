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
        // flex: "1 0 auto",
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",

        bgcolor: disabled
          ? darken(customTheme.secondary, 0.4)
          : customTheme.secondary,
        color,

        "&:hover": {
          bgcolor: disabled
            ? customTheme.grey
            : darken(customTheme.secondary, 0.2),
        },

        borderBottomLeftRadius: header ? "0" : "10px",
        borderBottomRightRadius: header ? "0" : "10px",
        borderTopLeftRadius: footer ? "0" : "10px",
        borderTopRightRadius: footer ? "0" : "10px",
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
