import React, { useEffect } from "react";
import { customTheme } from "../../styles";
import { alpha, ButtonProps, IconButton } from "@mui/material";

type IconButtonProps = {
  iconSize?: number | string;
} & ButtonProps;

type IconProps = {
  color?: string;
  size?: number | string;
};

export function ResetButton(props: IconButtonProps) {
  const { disabled, iconSize, ...rest } = props;
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
      <ResetIcon size={iconSize} color={iconColor} />
    </IconButton>
  );
}

function ResetIcon({ color, size }: IconProps) {
  return (
    <svg
      width={size ?? 30}
      height={size ?? 30}
      viewBox="0 0 21 21"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        fill="none"
        fillRule="evenodd"
        stroke={color ?? "#000000"}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="matrix(0 1 1 0 2.5 2.5)"
      >
        <path d="m3.98652376 1.07807068c-2.38377179 1.38514556-3.98652376 3.96636605-3.98652376 6.92192932 0 4.418278 3.581722 8 8 8s8-3.581722 8-8-3.581722-8-8-8" />

        <path d="m4 1v4h-4" transform="matrix(1 0 0 -1 0 6)" />
      </g>
    </svg>
  );
}
