import React from 'react';
import { BaseWalletMultiButton } from './BaseWalletMultiButton';
import { PropShopClient } from '@cosmic-lab/prop-shop-sdk';
import { useSnackbar } from 'notistack';

const LABELS = {
	'change-wallet': 'Switch',
	connecting: 'Connecting',
	'copy-address': 'Copy Address',
	disconnect: 'Disconnect',
	'has-wallet': 'Connect',
	'no-wallet': 'Connect',
} as const;

export function WalletButton({
	client,
}: {
	client: PropShopClient | undefined;
}) {
	const { enqueueSnackbar } = useSnackbar();

	let airdropSol: (() => Promise<void>) | undefined;
	let airdropUsdc: (() => Promise<void>) | undefined;
	if (process.env.RPC_URL === 'http://localhost:8899' && client !== undefined) {
		airdropSol = async () => {
			const snack = await client.airdropSol();
			enqueueSnackbar(snack.message, {
				variant: snack.variant,
			});
		};

		airdropUsdc = async () => {
			const snack = await client.airdropUsdc();
			enqueueSnackbar(snack.message, {
				variant: snack.variant,
			});
		};
	}

	return (
		<BaseWalletMultiButton
			airdropSol={airdropSol}
			airdropUsdc={airdropUsdc}
			labels={LABELS}
			client={client}
		/>
	);
}
