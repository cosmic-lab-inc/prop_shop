import React from 'react';
import { customTheme } from '../../styles';

type IconProps = {
	size?: number | string;
	color?: string;
};

export function CakeIcon({ size, color }: IconProps) {
	const _size = size ?? 60;
	return (
		<svg
			fill={color ?? customTheme.dark}
			width={_size}
			viewBox="0 0 36 36"
			version="1.1"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M16.32 14.12c-1.56-0.44-3.56-0.72-5.72-0.76v-0.96c0-0.48-0.36-0.84-0.84-0.84s-0.84 0.36-0.84 0.84v0.96c-2.12 0.040-4.12 0.28-5.68 0.76-2.16 0.6-3.24 1.48-3.24 2.6v7.72c0 1.12 1.080 2 3.24 2.64 1.76 0.52 4.080 0.8 6.56 0.8s4.8-0.28 6.56-0.8c2.12-0.6 3.24-1.52 3.24-2.64v-7.72c-0.040-1.12-1.080-2-3.28-2.6zM8.92 15v1.72c0 0.48 0.36 0.84 0.84 0.84s0.84-0.36 0.84-0.84v-1.72c4.36 0.12 7.040 1.16 7.24 1.72-0.080 0.12-0.32 0.32-1.24 0.8-1.2 0.6-1.56 1.6-1.8 2.24-0.040 0.12-0.12 0.32-0.16 0.4-0.080-0.080-0.16-0.24-0.24-0.32-0.36-0.56-1-1.52-2.36-1.44-1.4 0.080-1.8 1.56-2.080 2.6-0.12 0.4-0.32 1.16-0.48 1.24-0.36 0-0.44-0.080-0.72-0.6-0.36-0.6-0.92-1.56-2.44-1.6-0.44-0.040-0.44-0.040-0.6-0.44-0.24-0.56-0.6-1.44-2.12-1.88-1.4-0.4-1.84-0.88-1.88-0.96 0.16-0.56 2.84-1.64 7.2-1.76zM9.76 26.2c-4.92 0-7.92-1.16-8.080-1.76v-5.68c0.36 0.2 0.84 0.36 1.4 0.52 0.76 0.24 0.88 0.52 1.040 0.92 0.24 0.56 0.6 1.4 2.080 1.44 0.64 0.040 0.8 0.28 1.080 0.8 0.36 0.56 0.84 1.44 2.16 1.44 1.44 0 1.8-1.44 2.080-2.52 0.12-0.44 0.36-1.36 0.56-1.36 0.36-0.040 0.48 0.12 0.88 0.68 0.32 0.48 0.8 1.24 1.8 1.16 1-0.12 1.36-0.96 1.56-1.56 0.2-0.56 0.4-1.040 1-1.36 0.16-0.080 0.32-0.16 0.48-0.24v5.72c-0.080 0.64-3.12 1.8-8.040 1.8zM9.76 10.36c1.28 0 2.28-1.040 2.28-2.28 0-0.72-0.6-3.96-2.28-3.96s-2.28 3.28-2.28 3.96c0 1.24 1.040 2.28 2.28 2.28zM9.76 5.96c0.28 0.48 0.6 1.56 0.6 2.12 0 0.32-0.28 0.6-0.6 0.6s-0.6-0.28-0.6-0.6c0-0.56 0.32-1.6 0.6-2.12z"></path>
		</svg>
	);
}
