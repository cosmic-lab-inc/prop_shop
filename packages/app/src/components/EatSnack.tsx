import React from "react";
import { Button, Typography } from "@mui/material";
import {
  formatExplorerLink,
  SnackElement,
  SnackInfo,
} from "@cosmic-lab/prop-shop-sdk";
import { Connection } from "@solana/web3.js";

export function eatSnack(
  snack: SnackInfo,
  connection: Connection,
): SnackElement {
  if (snack.variant === "success") {
    const element = (
      <Button onClick={() => window.open(formatExplorerLink(snack.message))}>
        <Typography variant="body1">Click to view transaction</Typography>
      </Button>
    );
    return {
      element,
      variant: snack.variant,
    };
  } else {
    const element = (
      <Button>
        <Typography variant="body1">{snack.message}</Typography>
      </Button>
    );
    return {
      element,
      variant: snack.variant,
    };
  }
}
