import React from 'react';
import {
	Box,
	FormControl,
	OutlinedInput,
	styled,
	Typography,
} from '@mui/material';
import { customTheme } from '../../../styles';
import {
	CreateVaultConfig,
	PROP_SHOP_PERCENT_ANNUAL_FEE,
	PROP_SHOP_PERCENT_PROFIT_SHARE,
	PropShopClient,
	randomName,
	Venue,
} from '@cosmic-lab/prop-shop-sdk';
import { ActionButton, Toggle, UsdcIcon } from '../../../components';
import InputAdornment from '@mui/material/InputAdornment';
import { PublicKey } from '@solana/web3.js';
import { useSnackbar } from 'notistack';
import { VenueInput } from './VenueInput';

const INPUT_WIDTH = '70%';
const SECONDS_PER_DAY = 60 * 60 * 24;

export function InputFields({
	client,
	onSubmit,
}: {
	client: PropShopClient;
	onSubmit: (params: CreateVaultConfig) => void;
}) {
	const defaultConfig: CreateVaultConfig = {
		name: randomName(2, 32),
		delegate: client.key,
		percentProfitShare: 20,
		percentAnnualManagementFee: 2,
		maxCapacityUSDC: 100_000_000,
		minDepositUSDC: 0,
		permissioned: false,
		redeemPeriod: 0,
		venue: Venue.Drift,
	};

	const [config, setConfig] = React.useState<CreateVaultConfig>(defaultConfig);

	return (
		<Box
			sx={{
				width: '100%',
				borderRadius: '10px',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				flexGrow: 1,
				gap: 1,
				p: 1,
				bgcolor: customTheme.grey,
			}}
		>
			<Fields
				defaultConfig={defaultConfig}
				config={config}
				setConfig={setConfig}
			/>

			<Box
				sx={{
					height: '80px',
					borderRadius: '10px',
					display: 'flex',
					flexDirection: 'row',
					alignItems: 'center',
					width: '20%',
				}}
			>
				<ActionButton onClick={() => onSubmit(config)}>Create</ActionButton>
			</Box>
		</Box>
	);
}

function Fields({
	defaultConfig,
	config,
	setConfig,
}: {
	defaultConfig: CreateVaultConfig;
	config: CreateVaultConfig;
	setConfig: (config: CreateVaultConfig) => void;
}) {
	const { enqueueSnackbar } = useSnackbar();

	function changeName(value: string) {
		if (value.length === 0) {
			enqueueSnackbar(`Name must not be empty`, {
				variant: 'error',
			});
			setConfig({ ...config, name: value });
		} else if (value.length > 32) {
			enqueueSnackbar(`Name must be no more than 32 characters`, {
				variant: 'error',
			});
			setConfig({ ...config, name: value });
		} else {
			setConfig({ ...config, name: value });
		}
	}

	function changeDelegate(value: string) {
		try {
			const delegate = new PublicKey(value);
			setConfig({ ...config, delegate });
		} catch (e: any) {
			enqueueSnackbar(`Delegate is not a valid public key`, {
				variant: 'error',
			});
		}
	}

	function changeProfitShare(value: number) {
		const max = 100 - PROP_SHOP_PERCENT_PROFIT_SHARE;
		if (value < 0 || value > max) {
			enqueueSnackbar(`Profit share must be 0-${max}%`, {
				variant: 'error',
			});
		} else {
			setConfig({ ...config, percentProfitShare: value });
		}
	}

	function changeAnnualFee(value: number) {
		const max = 100 - PROP_SHOP_PERCENT_ANNUAL_FEE;
		if (value < 0 || value > max) {
			enqueueSnackbar(`Annual fee must be 0-${max}%`, {
				variant: 'error',
			});
		} else {
			setConfig({ ...config, percentAnnualManagementFee: value });
		}
	}

	function changeMaxFundDeposits(value: number) {
		if (value < 0) {
			enqueueSnackbar(`Maximum fund deposits must be positive`, {
				variant: 'error',
			});
		} else {
			setConfig({ ...config, maxCapacityUSDC: value });
		}
	}

	function changeMinDepositPerUser(value: number) {
		if (value < 0) {
			enqueueSnackbar(`Minimum investment must be positive`, {
				variant: 'error',
			});
		} else {
			setConfig({ ...config, minDepositUSDC: value });
		}
	}

	function changeInviteOnly(value: boolean) {
		setConfig({ ...config, permissioned: value });
	}

	function changeRedeemPeriod(days: number) {
		const max = 7;
		if (days < 0 || days > max) {
			enqueueSnackbar(`Redeem period must be 0-${max} days`, {
				variant: 'error',
			});
		} else {
			setConfig({ ...config, redeemPeriod: days * SECONDS_PER_DAY });
		}
	}

	function changeVenue(venue: Venue) {
		setConfig({ ...config, venue });
	}

	return (
		<Box
			sx={{
				flexGrow: 1,
				bgcolor: customTheme.grey,
				borderRadius: '10px',
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
			}}
		>
			<TableRow hover>
				<Typography variant="h4">Name</Typography>
				<TextInput
					defaultValue={defaultConfig.name}
					value={config.name}
					onChange={changeName}
				/>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Delegate (Trader)</Typography>
				<TextInput
					defaultValue={defaultConfig.delegate?.toString() ?? ''}
					value={config.delegate?.toString() ?? ''}
					onChange={changeDelegate}
				/>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Profit Share</Typography>
				<PercentInput
					defaultValue={defaultConfig.percentProfitShare}
					value={config.percentProfitShare}
					onChange={changeProfitShare}
				/>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Annual Fee</Typography>
				<PercentInput
					defaultValue={defaultConfig.percentAnnualManagementFee}
					value={config.percentAnnualManagementFee}
					onChange={changeAnnualFee}
				/>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Max Fund Deposits</Typography>
				<PriceInput
					defaultValue={defaultConfig.maxCapacityUSDC ?? 0}
					value={config.maxCapacityUSDC ?? 0}
					onChange={changeMaxFundDeposits}
				/>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Minimum Investment</Typography>
				<PriceInput
					defaultValue={defaultConfig.minDepositUSDC ?? 0}
					value={config.minDepositUSDC ?? 0}
					onChange={changeMinDepositPerUser}
				/>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Invite Only</Typography>
				<Box
					sx={{
						width: INPUT_WIDTH,
						display: 'flex',
						flexDirection: 'row',
						justifyContent: 'right',
					}}
				>
					<Toggle changeInviteOnly={changeInviteOnly} />
				</Box>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Redeem Period</Typography>
				<DaysInput
					defaultValue={(defaultConfig.redeemPeriod ?? 0) / SECONDS_PER_DAY}
					value={(config.redeemPeriod ?? 0) / SECONDS_PER_DAY}
					onChange={changeRedeemPeriod}
				/>
			</TableRow>

			<TableRow hover>
				<Typography variant="h4">Venue</Typography>
				<VenueInput
					defaultValue={defaultConfig.venue}
					value={config.venue}
					onChange={changeVenue}
				/>
			</TableRow>
		</Box>
	);
}

const TableRow = styled('div')<{ hover?: boolean; header?: boolean }>(
	({ theme: _theme, hover, header }) => ({
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: '10px',
		borderRadius: '10px',
		color: customTheme.light,
		'&:hover': {
			backgroundColor: `${hover ? customTheme.grey2 : 'transparent'}`,
		},

		...(header && {
			borderBottom: `1px solid ${customTheme.light}`,
			borderBottomRightRadius: '0',
			borderBottomLeftRadius: '0',
		}),
	})
);

function TextInput({
	value,
	onChange,
}: {
	defaultValue: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<FormControl
			fullWidth
			variant="outlined"
			sx={{
				width: INPUT_WIDTH,
				'& .MuiOutlinedInput-root': {
					'& fieldset': {
						border: 'none',
					},
					'&:hover fieldset': {
						border: 'none',
					},
					borderRadius: '10px',
				},
			}}
		>
			<OutlinedInput
				sx={{
					fontSize: 20,
				}}
				slotProps={{
					input: {
						style: {
							textAlign: 'right',
						},
					},
				}}
				label={value}
				value={value}
				multiline={false}
				type={'text'}
				onChange={(i: any) => {
					// if (i.target.value === undefined || i.target.value === null) {
					//   onChange(defaultValue);
					//   return;
					// }
					onChange(i.target.value);
				}}
			/>
		</FormControl>
	);
}

function PercentInput({
	value,
	onChange,
}: {
	defaultValue: number;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<FormControl
			variant="outlined"
			sx={{
				width: INPUT_WIDTH,
				'& .MuiOutlinedInput-root': {
					'& fieldset': {
						border: 'none',
					},
					'&:hover fieldset': {
						border: 'none',
					},
					borderRadius: '10px',
				},
			}}
		>
			<OutlinedInput
				sx={{
					fontSize: 20,
				}}
				slotProps={{
					input: {
						style: {
							textAlign: 'right',
						},
					},
				}}
				label={value}
				value={value}
				multiline={false}
				endAdornment={
					<InputAdornment position="end">
						<Typography
							variant="h4"
							sx={{ color: customTheme.dark, fontWeight: 300 }}
						>
							%
						</Typography>
					</InputAdornment>
				}
				type={'tel'}
				onChange={(i: any) => {
					// if (i.target.value === undefined || i.target.value === null) {
					//   onChange(defaultValue);
					//   return;
					// }
					const num = parseInt(i.target.value, 10);
					if (isNaN(num)) {
						onChange(0);
						return;
					}
					onChange(num);
				}}
			/>
		</FormControl>
	);
}

function DaysInput({
	value,
	onChange,
}: {
	defaultValue: number;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<FormControl
			variant="outlined"
			sx={{
				textAlign: 'right',
				display: 'flex',
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'right',
				width: INPUT_WIDTH,
				'& .MuiOutlinedInput-root': {
					'& fieldset': {
						border: 'none',
					},
					'&:hover fieldset': {
						border: 'none',
					},
					borderRadius: '10px',
				},
			}}
		>
			<OutlinedInput
				slotProps={{
					input: {
						style: {
							textAlign: 'right',
						},
					},
				}}
				label={value}
				value={value}
				multiline={false}
				endAdornment={
					<InputAdornment position="end">
						<Typography variant="h4">{value === 1 ? 'day' : 'days'}</Typography>
					</InputAdornment>
				}
				type={'tel'}
				onChange={(i: any) => {
					// if (i.target.value === undefined || i.target.value === null) {
					//   onChange(defaultValue);
					//   return;
					// }
					const num = parseInt(i.target.value, 10);
					if (isNaN(num)) {
						onChange(0);
						return;
					}
					onChange(num);
				}}
			/>
		</FormControl>
	);
}

function PriceInput({
	value,
	onChange,
}: {
	defaultValue: number;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<FormControl
			variant="outlined"
			sx={{
				width: INPUT_WIDTH,
				'& .MuiOutlinedInput-root': {
					'& fieldset': {
						border: 'none',
					},
					'&:hover fieldset': {
						border: 'none',
					},
					borderRadius: '10px',
				},
			}}
		>
			<OutlinedInput
				sx={{
					fontSize: 20,
				}}
				slotProps={{
					input: {
						style: {
							textAlign: 'right',
						},
					},
				}}
				label={value}
				value={value}
				multiline={false}
				endAdornment={
					<InputAdornment position="end">
						<UsdcIcon />
					</InputAdornment>
				}
				type={'tel'}
				onChange={(i: any) => {
					// if (i.target.value === undefined || i.target.value === null) {
					//   onChange(defaultValue);
					//   return;
					// }
					const num = parseInt(i.target.value, 10);
					if (isNaN(num)) {
						// onChange(defaultValue);
						onChange(0);
						return;
					}
					onChange(num);
				}}
			/>
		</FormControl>
	);
}
