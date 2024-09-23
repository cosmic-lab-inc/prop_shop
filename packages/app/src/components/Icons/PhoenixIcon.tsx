import React from 'react';
import Box from '@mui/material/Box';

type IconProps = {
	size?: number;
	color?: string;
};

export function PhoenixIcon({ size }: IconProps) {
	const _size = size ?? 35;
	const _color = 'orange';
	return (
		<Box
			sx={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
			}}
		>
			<PhoenixSvg size={_size} color={_color} />
		</Box>
	);
}

function PhoenixSvg({ size, color }: IconProps) {
	return (
		<svg
			aria-labelledby="phoenix-logo"
			fill="none"
			width={size}
			height={size}
			viewBox="0 0 17 20"
			xmlns="http://www.w3.org/2000/svg"
			className="h-6 sm:h-auto"
		>
			<path
				d="M-0.0065918 0.0493593L8.20191 9.49098L16.4575 -0.000164032L12.2009 3.17676C9.84113 4.93731 6.60726 4.94474 4.24004 3.19162L-0.0065918 0.0493593Z"
				fill={color}
			></path>
			<path
				d="M-0.0065918 19.9503L8.20191 10.5087L16.455 19.9973L12.1984 16.8204C9.83866 15.0599 6.60478 15.0524 4.23756 16.8056L-0.0065918 19.9503Z"
				fill={color}
			></path>
		</svg>
	);
}
