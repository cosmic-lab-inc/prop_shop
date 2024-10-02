import React, { useMemo, useState } from 'react';
import {
	FileCopy as CopyIcon,
	LinkOff as DisconnectIcon,
	SwapHoriz as SwitchIcon,
} from '@mui/icons-material';
import {
	ButtonProps,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	styled,
	Typography,
} from '@mui/material';
import { useWalletMultiButton } from '@solana/wallet-adapter-base-ui';
import { BaseWalletConnectionButton } from './BaseWalletConnectionButton';
import { useWalletDialog } from '@solana/wallet-adapter-material-ui';
import { customTheme } from '../../../styles';
import Box from '@mui/material/Box';
import { darken } from '@mui/system/colorManipulator';
import { useOutsideClick } from '../../../lib';
import { SolIcon, UsdcIcon, WalletIcon } from '../../Icons';
import { prettyNumber, PropShopClient } from '@cosmic-lab/prop-shop-sdk';
import { observer } from 'mobx-react';

const List = styled('ul')(({ theme: _theme }) => ({
	marginTop: 85,
	padding: 0,
	backgroundColor: customTheme.grey,
	borderRadius: '10px',
	overflow: 'auto',
	verticalAlign: 'center',
	zIndex: 1,
	position: 'absolute',
	width: '100%',
}));

function ListEntry({
	onClick,
	icon,
	text,
}: {
	onClick?: () => void;
	icon: React.ReactNode;
	text: string | React.ReactNode;
}) {
	return (
		<ListItem
			sx={{
				p: 0,
				m: 0,
			}}
		>
			<ListItemButton
				sx={{
					p: 1,
					m: 0,
					'&:hover': {
						bgcolor: customTheme.grey2,
					},
				}}
				onClick={onClick}
			>
				<ListItemIcon sx={{ color: customTheme.dark }}>{icon}</ListItemIcon>
				<ListItemText
					primary={text}
					disableTypography
					sx={{
						m: 0,
						fontFamily: customTheme.font.light,
						fontWeight: 300,
						fontSize: 16,
					}}
				/>
			</ListItemButton>
		</ListItem>
	);
}

type Props = ButtonProps & {
	client?: PropShopClient;
	airdropSol?: () => Promise<void>;
	airdropUsdc?: () => Promise<void>;
	initUser?: () => Promise<void>;
	labels: Omit<
		{
			[TButtonState in ReturnType<
				typeof useWalletMultiButton
			>['buttonState']]: string;
		},
		'connected' | 'disconnecting'
	> & {
		'copy-address': string;
		'change-wallet': string;
		disconnect: string;
	};
};

export const BaseWalletMultiButton = observer(
	({ children, labels, airdropSol, airdropUsdc, client }: Props) => {
		const { setOpen: setModalVisible } = useWalletDialog();
		const anchorRef = React.createRef<HTMLButtonElement>();
		const [menuOpen, setMenuOpen] = useState(false);
		const { buttonState, onConnect, onDisconnect, publicKey } =
			useWalletMultiButton({
				onSelectWallet() {
					setModalVisible(true);
				},
			});
		const content = useMemo(() => {
			if (children) {
				return children;
			} else if (publicKey) {
				const base58 = publicKey.toBase58();
				return base58.slice(0, 4) + '..' + base58.slice(-4);
			} else if (buttonState === 'connecting' || buttonState === 'has-wallet') {
				return labels[buttonState];
			} else {
				return labels['no-wallet'];
			}
		}, [buttonState, children, labels, publicKey]);

		const ref = useOutsideClick(() => {
			setMenuOpen(false);
			setModalVisible(false);
		});

		return (
			<Box
				ref={ref}
				sx={{
					position: 'relative',
					display: 'flex',
					width: '100%',
				}}
			>
				<BaseWalletConnectionButton
					fullWidth
					aria-controls="wallet-menu"
					aria-haspopup="true"
					onClick={() => {
						switch (buttonState) {
							case 'no-wallet':
								setModalVisible(true);
								break;
							case 'has-wallet':
								if (onConnect) {
									onConnect();
								}
								break;
							case 'connected':
								setMenuOpen(true);
								break;
						}
					}}
					ref={anchorRef}
					walletIcon={<WalletIcon size={30} color={customTheme.light} />}
					sx={{
						bgcolor: customTheme.secondary,
						borderRadius: '10px',
						'&:hover': {
							bgcolor: darken(customTheme.secondary, 0.2),
						},
					}}
				>
					{content}
				</BaseWalletConnectionButton>
				{menuOpen && (
					<List>
						{publicKey && (
							<ListEntry
								onClick={async () => {
									setMenuOpen(false);
									await navigator.clipboard.writeText(publicKey.toBase58());
								}}
								icon={<CopyIcon fontSize="small" />}
								text={
									<Typography variant="body1">
										{labels['copy-address']}
									</Typography>
								}
							/>
						)}

						<ListEntry
							onClick={() => {
								setMenuOpen(false);
								setModalVisible(true);
							}}
							icon={<SwitchIcon />}
							text={
								<Typography variant="body1">
									{labels['change-wallet']}
								</Typography>
							}
						/>

						{onDisconnect && (
							<ListEntry
								onClick={() => {
									setMenuOpen(false);
									onDisconnect();
								}}
								icon={<DisconnectIcon />}
								text={
									<Typography variant="body1">
										{labels['disconnect']}
									</Typography>
								}
							/>
						)}

						<ListEntry
							icon={<SolIcon size={30} />}
							text={
								<Typography variant="body1">
									{prettyNumber(client?.sol ?? 0)}
								</Typography>
							}
						/>

						<ListEntry
							icon={<UsdcIcon size={30} />}
							text={
								<Typography variant="body1">
									${prettyNumber(client?.usdc ?? 0)}
								</Typography>
							}
						/>

						{airdropSol && (
							<ListEntry
								onClick={airdropSol}
								icon={<SolIcon size={30} />}
								text={<Typography variant="body1">Airdrop SOL</Typography>}
							/>
						)}

						{airdropUsdc && (
							<ListEntry
								onClick={airdropUsdc}
								icon={<UsdcIcon size={30} />}
								text={<Typography variant="body1">Airdrop USDC</Typography>}
							/>
						)}
					</List>
				)}
			</Box>
		);
	}
);
