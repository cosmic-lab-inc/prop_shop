import React from 'react';
import Box from '@mui/material/Box';

type IconProps = {
	size?: number | string;
};

export function SolIcon({ size }: IconProps) {
	const _size = size ?? 25;
	return (
		<Box
			component="img"
			sx={{
				width: _size,
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				pl: '2px',
			}}
			src="/src/assets/sol.svg"
		/>
	);
}
