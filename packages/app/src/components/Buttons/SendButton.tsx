import IconButton from "@mui/material/IconButton";
import { ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import React, { useEffect } from "react";
import { darken } from "@mui/system/colorManipulator";

type IconButtonProps = {
  iconSize?: number | string;
} & ButtonProps;

export function SendButton(props: IconButtonProps) {
  const { disabled, ...rest } = props;

  const [iconColor, setIconColor] = React.useState(customTheme.dark);

  useEffect(() => {
    if (disabled) {
      setIconColor(customTheme.grey);
    } else {
      setIconColor(customTheme.light);
    }
  }, [disabled]);

  return (
    <IconButton
      color="primary"
      sx={{
        borderRadius: "10px",
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",

        color: disabled ? customTheme.dark : customTheme.light,
        bgcolor: disabled
          ? darken(customTheme.grey2, 0.2)
          : customTheme.secondary,
        "&:hover": {
          bgcolor: disabled
            ? customTheme.grey
            : darken(customTheme.secondary, 0.2),
        },
      }}
      type="submit"
      {...rest}
    >
      <SendRoundedIcon
        fontSize="medium"
        sx={{
          color: iconColor,
        }}
      />
    </IconButton>
  );
}
