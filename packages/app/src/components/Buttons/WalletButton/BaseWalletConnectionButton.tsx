import React from 'react';
import { Button, ButtonProps } from '@mui/material';
import type { WalletName } from '@solana/wallet-adapter-base';

type Props = ButtonProps & {
	walletIcon?: React.ReactNode;
	walletName?: WalletName;
};

export const BaseWalletConnectionButton = React.forwardRef(
	function BaseWalletConnectionButton(
		{
			color = 'secondary',
			type = 'button',
			walletIcon,
			variant = 'contained',
			...props
		}: Props,
		forwardedRef: React.Ref<HTMLButtonElement>
	) {
		return (
			<Button
				{...props}
				color={color}
				startIcon={walletIcon}
				ref={forwardedRef}
				type={type}
				variant={variant}
			/>
		);
	}
);
