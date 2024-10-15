import React from 'react';
import { Box } from '@mui/material';

type IconProps = {
	size?: number | string;
};

export function StarAtlasIcon({ size }: IconProps) {
	const _size = size ?? 50;
	return (
		<Box
			component="img"
			sx={{
				height: _size,
				width: _size,
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				pl: '2px',
				borderRadius: '50%',
			}}
			alt="Drift"
			src={new URL('/src/assets/star_atlas.jpg', import.meta.url).href}
		/>
	);
}
