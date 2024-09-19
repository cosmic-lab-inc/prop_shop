import React from 'react';
import { customTheme } from '../../../styles';
import {
	Box,
	Dialog,
	FormControl,
	OutlinedInput,
	Typography,
} from '@mui/material';
import InputAdornment from '@mui/material/InputAdornment';
import { SendButton } from '../../../components';

export enum TransferInputAction {
	DEPOSIT = 'deposit',
	WITHDRAW = 'withdraw',
	UNKNOWN = 'unknown',
}

export function TransferInputDialog({
	defaultValue,
	open,
	onClose,
	onChange,
	onSubmit,
}: {
	defaultValue: number;
	open: boolean;
	onClose: () => void;
	onChange: (value: number) => void;
	onSubmit: () => Promise<void>;
}) {
	return (
		<>
			<Dialog
				maxWidth="xs"
				fullWidth={true}
				fullScreen={false}
				scroll="paper"
				open={open}
				onClose={onClose}
				PaperProps={{
					style: {
						background: customTheme.grey,
						borderRadius: '10px',
					},
				}}
				sx={{
					bgcolor: 'transparent',
				}}
			>
				<Input
					defaultValue={defaultValue}
					onChange={onChange}
					onSubmit={onSubmit}
				/>
			</Dialog>
		</>
	);
}

function Input({
	defaultValue,
	onChange,
	onSubmit,
}: {
	defaultValue: number;
	onChange: (value: number) => void;
	onSubmit: () => Promise<void>;
}) {
	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'row',
				width: '100%',
				bgcolor: customTheme.grey,
				alignItems: 'center',
				justifyContent: 'center',
				p: 1,
			}}
		>
			<Box
				sx={{
					display: 'flex',
					width: '100%',
					gap: 1,
				}}
			>
				<FormControl
					fullWidth
					variant="outlined"
					sx={{
						'& .MuiOutlinedInput-root': {
							'& fieldset': {
								border: 'none',
							},
							'&:hover fieldset': {
								border: 'none',
							},
						},
					}}
				>
					<OutlinedInput
						sx={{
							bgcolor: customTheme.grey,
						}}
						defaultValue={defaultValue}
						multiline={false}
						startAdornment={
							<InputAdornment position="start">
								<Typography
									variant="h3"
									sx={{ color: customTheme.dark, fontWeight: 300 }}
								>
									$
								</Typography>
							</InputAdornment>
						}
						type={'number'}
						onChange={(i: any) => {
							const num = parseInt(i.target.value, 10);
							if (isNaN(num)) return;
							onChange(num);
						}}
					/>
				</FormControl>
				<Box
					sx={{
						width: '20%',
					}}
				>
					<SendButton onClick={onSubmit} />
				</Box>
			</Box>
		</Box>
	);
}
