import React from 'react';
import { Box, keyframes, styled } from '@mui/material';

const PulseAnimation = keyframes`
    0% {
        transform: scale(1);
    }
    20% {
        transform: scale(1.1);
    }
    25% {
        transform: scale(1);
    }
    95% {
        transform: scale(1.1);
    }
    100% {
        transform: scale(1);
    }
`;

const Animation = styled('div')(({ theme }) => ({
	width: '100px',
	height: '100px',
	borderRadius: '50%',
	animation: `${PulseAnimation} 1.5s linear infinite`,
}));

export function IconPulse({ children }: { children: React.ReactNode }) {
	return (
		<Box>
			<Animation>{children}</Animation>
		</Box>
	);
}
