import React from 'react';
import { Dialog } from '@mui/material';
import { InputFields } from './InputFields';
import {
	FundOverview,
	PropShopClient,
	UpdateVaultConfig,
} from '@cosmic-lab/prop-shop-sdk';
import { useSnackbar } from 'notistack';
import { observer } from 'mobx-react';

export const UpdateFundDialog = observer(
	({
		client,
		fund,
		open,
		onClose,
	}: {
		client: PropShopClient;
		fund: FundOverview;
		open: boolean;
		onClose: () => void;
	}) => {
		const { enqueueSnackbar } = useSnackbar();

		async function submit(params: UpdateVaultConfig) {
			const snack = await client.updateVault({
				venue: fund.venue,
				vault: fund.vault,
				params,
			});
			enqueueSnackbar(snack.message, {
				variant: snack.variant,
			});
			onClose();
		}

		return (
			<>
				<Dialog
					maxWidth="lg"
					fullWidth={true}
					fullScreen={false}
					scroll="paper"
					open={open}
					onClose={onClose}
					PaperProps={{
						style: {
							borderRadius: '10px',
						},
					}}
					sx={{
						backgroundColor: 'transparent',
					}}
				>
					<InputFields client={client} fund={fund} onSubmit={submit} />
				</Dialog>
			</>
		);
	}
);
