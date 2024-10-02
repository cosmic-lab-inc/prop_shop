import React, { ReactNode } from 'react';
import { Box, styled, Typography } from '@mui/material';
import { customTheme } from '../../styles';
import {
	formatNumber,
	FundOverview,
	prettyNumber,
	PropShopClient,
	truncateString,
	Venue,
	yyyymmdd,
} from '@cosmic-lab/prop-shop-sdk';
import { FundDialog } from './FundDialog';
import {
	ActionButton,
	CakeIcon,
	DriftIcon,
	PhoenixIcon,
	StackIcon,
} from '../../components';
import MovingIcon from '@mui/icons-material/Moving';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';

function formatPnl(fund: FundOverview): {
	pnl: number;
	displayPnl: string;
	displayPnlColor: string;
} {
	// dollar pnl
	// const pnl = fund.profit;
	// const displayPnl = `$${prettyNumber(pnl)}`;
	// pct pnl
	let pnl;
	if (fund.tvl === 0) {
		pnl = 0;
	} else {
		pnl = (fund.profit / fund.tvl) * 100;
	}
	const displayPnl = `${prettyNumber(pnl)}%`;
	const displayPnlColor =
		displayPnl !== '--'
			? pnl < 0
				? customTheme.error
				: customTheme.success
			: customTheme.dark;
	return {
		pnl,
		displayPnl,
		displayPnlColor,
	};
}

export function FundOverviewCard({
	client,
	fund,
}: {
	client: PropShopClient;
	fund: FundOverview;
}) {
	const { tvl, investors, birth } = fund;
	// const pnl = fundPctPnl(fund);
	// const pnl = fundPctPnl(fund);
	const { pnl, displayPnl, displayPnlColor } = formatPnl(fund);

	const [open, setOpen] = React.useState(false);

	return (
		<>
			<FundDialog
				client={client}
				fund={fund}
				open={open}
				onClose={() => setOpen(false)}
			/>
			<Container onClick={() => setOpen(true)}>
				<Header fund={fund} />
				<Box
					sx={{
						width: '100%',
						flexDirection: 'column',
						display: 'flex',
					}}
				>
					<TableRow hover divider footer square>
						<PnlIcon invert={pnl < 0 && displayPnl !== '--'} />
						<Typography
							variant="h3"
							sx={{
								color: displayPnlColor,
							}}
						>
							{displayPnl}
						</Typography>
					</TableRow>

					<TableRow hover square>
						<StackIcon />
						<Typography variant="h4">${prettyNumber(tvl)}</Typography>
					</TableRow>

					<TableRow hover square>
						<PeopleAltIcon htmlColor={customTheme.dark} fontSize={'medium'} />
						<Typography variant="h4">{formatNumber(investors.size)}</Typography>
					</TableRow>

					<TableRow hover footer narrow>
						<CakeIcon />
						<Typography
							variant="h4"
							sx={{
								display: 'flex',
								alignItems: 'center',
							}}
						>
							{yyyymmdd(birth)}
						</Typography>
					</TableRow>
				</Box>
			</Container>
		</>
	);
}

function PnlIcon({ invert }: { invert?: boolean }) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<MovingIcon
				htmlColor={invert ? customTheme.error : customTheme.success}
				fontSize={'medium'}
				sx={{
					transform: invert ? 'rotate(90deg)' : 'none',
				}}
			/>
		</Box>
	);
}

function Container({
	onClick,
	children,
}: {
	onClick: () => void;
	children: ReactNode;
}) {
	const [isHovered, setIsHovered] = React.useState(false);

	return (
		<Box
			sx={{
				width: '100%',
				cursor: 'pointer',
				position: 'relative',
				minWidth: 0,
				borderRadius: '10px',
				flex: `0 0 var(calc(100% / 4))`,
				paddingLeft: `var(calc(100% / 4))`,
			}}
		>
			<Box
				sx={{
					bgcolor: customTheme.grey,
					borderRadius: '10px',
					display: 'flex',
					flexDirection: 'column',
					cursor: 'pointer',
					ml: 1,
					mr: 1,
					boxShadow: isHovered
						? 'none'
						: `0px 0px 5px 0px ${customTheme.shadow}`,
				}}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<Box
					sx={{
						content: '""',
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						zIndex: isHovered ? 0 : -1,
						backdropFilter: 'blur(4px)',
						transition: 'backdrop-filter 0.2s linear',
						borderRadius: '10px',
					}}
				/>
				{children}
				<Box
					sx={{
						opacity: isHovered ? 1 : 0,
						transition: 'opacity 0.2s ease-in-out',
						position: 'absolute',
						height: '70px',
						width: '50%',
						left: '50%',
						top: '50%',
						ml: 1,
						mr: 1,
						transform: 'translate(-50%, -50%)',
					}}
				>
					<ActionButton onClick={onClick}>Invest</ActionButton>
				</Box>
			</Box>
		</Box>
	);
}

function Header({ fund }: { fund: FundOverview }) {
	return (
		<Box>
			<TableRow header>
				<Typography
					sx={{
						whiteSpace: 'nowrap',
					}}
					variant="h3"
				>
					{fund.venue === Venue.Drift
						? truncateString(fund.title, 11)
						: truncateString(fund.title, 13)}
				</Typography>
				{fund.venue === Venue.Drift ? <DriftIcon /> : <PhoenixIcon />}
			</TableRow>
		</Box>
	);
}

const TableRow = styled('div')<{
	// darken on hover
	hover?: boolean;
	// top border radius is rounded
	header?: boolean;
	// bottom border radius is rounded
	footer?: boolean;
	// if header divider on bottom, if footer divider on top
	divider?: boolean;
	// no border radius anywhere
	square?: boolean;
	narrow?: boolean;
	color?: string;
}>(
	({
		theme: _theme,
		hover,
		header,
		footer,
		divider,
		square,
		narrow,
		color,
	}) => ({
		display: 'flex',
		flexDirection: 'row',
		justifyContent: 'space-between',

		...(color && {
			backgroundColor: color,
		}),

		paddingLeft: 15,
		paddingRight: 15,

		...(narrow
			? {
					paddingTop: 0,
					paddingBottom: 0,
				}
			: {
					paddingTop: 10,
					paddingBottom: 10,
				}),

		'&:hover': {
			backgroundColor: `${hover ? customTheme.grey2 : 'transparent'}`,
		},

		borderRadius: '10px',
		...(square && {
			borderRadius: '0',
		}),

		...(header && {
			borderBottomRightRadius: '0',
			borderBottomLeftRadius: '0',
			...(divider && {
				borderBottom: `1px solid ${customTheme.grey2}`,
			}),
		}),

		...(footer && {
			borderTopRightRadius: '0',
			borderTopLeftRadius: '0',
			...(divider && {
				borderTop: `1px solid ${customTheme.grey2}`,
			}),
		}),
	})
);
