import IconButton from "@mui/material/IconButton";
import { alpha, ButtonProps } from "@mui/material";
import { customTheme } from "../../styles";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import React, { useEffect } from "react";

type IconButtonProps = {
  iconSize?: number | string;
} & ButtonProps;

export function SendButton(props: IconButtonProps) {
  const { disabled, ...rest } = props;

  const [iconColor, setIconColor] = React.useState(customTheme.light);

  useEffect(() => {
    if (disabled) {
      setIconColor(alpha(customTheme.dark, 0.6));
    } else {
      setIconColor(customTheme.light);
    }
  }, [disabled]);

  return (
    <IconButton
      color="primary"
      sx={{
        borderRadius: "3px",
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        minWidth: "40px",
        minHeight: "40px",

        bgcolor: disabled ? customTheme.grey : customTheme.rust,
        color: disabled ? customTheme.dark : customTheme.light,
        "&:hover": {
          bgcolor: disabled ? customTheme.grey : customTheme.light,
          color: disabled ? customTheme.light : customTheme.rust,
        },
      }}
      type="submit"
      aria-label="directions"
      onMouseEnter={() => {
        if (!disabled) {
          setIconColor(customTheme.rust);
        }
      }}
      onMouseLeave={() => {
        if (!disabled) {
          setIconColor(customTheme.light);
        }
      }}
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
