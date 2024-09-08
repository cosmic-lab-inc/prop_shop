import React from "react";
import Box from "@mui/material/Box";
import { customTheme } from "../../styles";

type IconProps = {
  size?: number | string;
  color?: string;
};

export function WalletIcon({ color, size }: IconProps) {
  const _size = size ?? 25;
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pr: 1,
      }}
    >
      <svg
        fill={color ?? customTheme.dark}
        width={_size}
        height={_size}
        viewBox="0 0 32 32"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M31.989 9.078c0.015-0.739-0.184-2.464-2.433-3.064l-22.576-4.519c-1.655 0-3 1.345-3 3v4.022l-1-0.002c-1.649 0.007-2.989 1.348-2.989 2.999v15.994c0 1.654 1.345 3 3 3h26.014c1.654 0 3-1.346 3-3zM5.981 4.494c0-0.522 0.402-0.952 0.913-0.996l22.063 4.465c0.008 0.004-0.164 0.56-0.965 0.55h-22.011zM30.008 27.507c0 0.552-0.448 1-1 1h-26.015c-0.552 0-1-0.448-1-1v-15.995c0-0.552 0.448-1 1-1h25.002c0.982 0 2.012-0.335 2.012-0.996v17.991h0zM5.995 17.516c-1.104 0-2 0.895-2 2s0.896 2 2 2 2-0.895 2-2-0.896-2-2-2z"></path>
      </svg>
    </Box>
  );
}
