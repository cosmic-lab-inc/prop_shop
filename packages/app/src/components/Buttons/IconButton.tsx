import React, { useEffect } from "react";
import { customTheme } from "../../styles";
import { alpha, Button, ButtonProps } from "@mui/material";

type IconButtonProps<T extends React.ElementType> = {
  component: T;
  iconSize?: number | string;
} & ButtonProps;

interface ChildProps {
  color?: string;
  size?: number | string;
}

export const IconButton: React.FC<IconButtonProps<React.FC<ChildProps>>> = ({
  component: Component,
  disabled,
  iconSize,
  ...rest
}) => {
  const [iconColor, setIconColor] = React.useState(customTheme.grey);

  useEffect(() => {
    if (disabled) {
      setIconColor(alpha(customTheme.dark, 0.7));
    } else {
      setIconColor(customTheme.light);
    }
  }, [disabled]);

  return (
    <Button
      {...rest}
      sx={{
        borderRadius: "3px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        fontFamily: customTheme.font.titilliumBold,

        bgcolor: disabled ? customTheme.grey : customTheme.secondary,
        color: disabled ? customTheme.dark : customTheme.light,
        "&:hover": {
          bgcolor: disabled ? customTheme.grey : customTheme.light,
          color: disabled ? customTheme.light : customTheme.secondary,
        },
      }}
      onMouseEnter={() => {
        if (!disabled) {
          setIconColor(customTheme.secondary);
        }
      }}
      onMouseLeave={() => {
        if (!disabled) {
          setIconColor(customTheme.light);
        }
      }}
    >
      <Component color={iconColor} size={iconSize} />
    </Button>
  );
};
