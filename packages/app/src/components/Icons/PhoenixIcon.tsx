import React from 'react';
import { Box } from '@mui/material';

type IconProps = {
	size?: number | string;
};

export function PhoenixIcon({ size }: IconProps) {
	const _size = size ?? 35;
	return (
		<Box
			component="img"
			sx={{
				width: _size,
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				// pl: '2px',
			}}
			alt="Phoenix"
			src={'/src/assets/phoenix.jpg'}
		/>
	);
}
