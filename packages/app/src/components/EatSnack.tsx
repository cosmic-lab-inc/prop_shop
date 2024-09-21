import React from 'react';
import { Button, Typography } from '@mui/material';
import {
	explorerLink,
	SnackElement,
	SnackInfo,
} from '@cosmic-lab/prop-shop-sdk';
import { Connection } from '@solana/web3.js';

export function eatSnack(
	snack: SnackInfo,
	connection: Connection
): SnackElement {
	if (snack.variant === 'success') {
		const element = (
			<Button onClick={() => window.open(explorerLink(snack.message))}>
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
