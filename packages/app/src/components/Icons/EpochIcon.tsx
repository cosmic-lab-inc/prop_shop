import { IconButton } from "@mui/material";
import React from "react";

type EpochLogoProps = {
  color?: string;
  size?: number | string;
};

function EpochLogo({ size }: EpochLogoProps) {
  return (
    <img
      width={size}
      src="https://cosmic-lab-inc.github.io/logo/epoch_logo.png"
    />
  );
}

export function EpochIcon({ size }: EpochLogoProps) {
  return (
    <IconButton
      sx={{
        width: size ?? "50px",
        height: size ?? "50px",
        padding: 0,
        margin: 0,
        "&:hover": {
          backgroundColor: "transparent",
        },
        display: "flex",
        justifyContent: "center",
        alignContent: "center",
      }}
    >
      <EpochLogo size={size ?? "50px"} />
    </IconButton>
  );
}
