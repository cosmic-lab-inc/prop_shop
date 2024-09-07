import React, { useEffect } from "react";
import { customTheme } from "../../styles";
import { Button, ButtonProps } from "@mui/material";
import { darken } from "@mui/system/colorManipulator";

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
      setIconColor(customTheme.grey);
    } else {
      setIconColor(customTheme.dark);
    }
  }, [disabled]);

  return (
    <Button
      {...{
        ...rest,
        disabled,
      }}
      sx={{
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        fontFamily: customTheme.font.light,

        bgcolor: disabled
          ? darken(customTheme.secondary, 0.4)
          : customTheme.secondary,

        "&:hover": {
          bgcolor: disabled
            ? customTheme.grey
            : darken(customTheme.secondary, 0.2),
        },
      }}
    >
      <Component color={iconColor} size={iconSize} />
    </Button>
  );
};
