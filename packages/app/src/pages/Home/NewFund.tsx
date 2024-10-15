import React from 'react';
import { Box, Typography } from '@mui/material';
import { PropShopClient } from '@cosmic-lab/prop-shop-sdk';
import { ActionButton } from '../../components';
import { NewFundDialog } from './NewFundDialog';
import { customTheme } from '../../styles';

// todo: fetch vaults and sort by criteria using PropShopClient
export function NewFund({ client }: { client: PropShopClient }) {
	const [open, setOpen] = React.useState(false);

	return (
		<>
			<NewFundDialog
				client={client}
				open={open}
				onClose={() => setOpen(false)}
			/>
			<Box
				sx={{
					width: '60%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexDirection: 'row',
					gap: 0,
				}}
			>
				<Box
					sx={{
						width: '80%',
						display: 'flex',
						alignItems: 'left',
						justifyContent: 'center',
						flexDirection: 'column',
						gap: 2,
					}}
				>
					<Typography variant="h2">
						Crowdsourced capital for rapid growth.
					</Typography>
					<Typography variant="h2">
						Earn up to 40% of investor profits.
					</Typography>
				</Box>
				<Box
					sx={{
						width: '30%',
						height: '120px',
					}}
				>
					<ActionButton onClick={() => setOpen(true)}>
						<Typography variant="h3" sx={{ color: customTheme.light }}>
							Create a Fund
						</Typography>
					</ActionButton>
				</Box>
			</Box>
		</>
	);
}
