import React from "react";
import { Button, ButtonProps } from "@mui/material";
import type { WalletName } from "@solana/wallet-adapter-base";
import { WalletIcon } from "./WalletIcon";

type Props = ButtonProps & {
  walletIcon?: string;
  walletName?: WalletName;
};

export const BaseWalletConnectionButton = React.forwardRef(
  function BaseWalletConnectionButton(
    {
      color = "primary",
      type = "button",
      walletIcon,
      walletName,
      variant = "contained",
      ...props
    }: Props,
    forwardedRef: React.Ref<HTMLButtonElement>,
  ) {
    return (
      <Button
        {...props}
        color={color}
        startIcon={
          walletIcon && walletName ? (
            <WalletIcon
              wallet={{ adapter: { icon: walletIcon, name: walletName } }}
            />
          ) : undefined
        }
        ref={forwardedRef}
        type={type}
        variant={variant}
      />
    );
  },
);
