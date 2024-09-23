import { styled, Switch, SwitchProps } from '@mui/material';
import React from 'react';
import { customTheme } from '../styles';

export type ToggleProps = {
	changeInviteOnly: (value: boolean) => void;
} & SwitchProps;

export const Toggle = styled((props: ToggleProps) => {
	const { changeInviteOnly, ...rest } = props;
	return (
		<Switch
			focusVisibleClassName=".Mui-focusVisible"
			disableRipple
			onChange={(_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
				changeInviteOnly(checked);
			}}
			{...rest}
		/>
	);
})(({ theme }) => ({
	width: '82px',
	height: 34,
	padding: 0,
	'& .MuiSwitch-switchBase': {
		padding: 2,
		transitionDuration: '300ms',
		'&.Mui-checked': {
			transform: 'translateX(38px)',
			'& + .MuiSwitch-track': {
				backgroundColor: customTheme.secondary,
				opacity: 1,
				border: 0,
			},
			'&.Mui-disabled + .MuiSwitch-track': {
				opacity: 0.5,
			},
		},
		'&.Mui-disabled .MuiSwitch-thumb': {
			color:
				theme.palette.mode === 'light'
					? theme.palette.grey[100]
					: theme.palette.grey[600],
		},
		'&.Mui-disabled + .MuiSwitch-track': {
			opacity: theme.palette.mode === 'light' ? 0.7 : 0.3,
		},
	},
	'& .MuiSwitch-thumb': {
		boxSizing: 'border-box',
		borderRadius: 9,
		width: 40,
		height: 30,
	},
	'& .MuiSwitch-track': {
		borderRadius: 10,
		opacity: 1,
		transition: theme.transitions.create(['background-color'], {
			duration: 500,
		}),
	},
}));
