import React from 'react';
import {
	useConnection,
	useWallet,
	WalletContextState,
} from '@solana/wallet-adapter-react';
import { PropShopClient } from '@cosmic-lab/prop-shop-sdk';
import { Keypair } from '@solana/web3.js';

export function useClient(): PropShopClient | undefined {
	const wallet = useWallet();
	const connection = useConnection();

	const [client, setClient] = React.useState<PropShopClient | undefined>(
		undefined
	);

	React.useEffect(() => {
		const dummyWallet = !wallet.publicKey;

		const run = async () => {
			if (!client) {
				let _wallet: WalletContextState;
				if (dummyWallet) {
					_wallet = PropShopClient.keypairToWalletContextState(
						Keypair.generate()
					);
				} else {
					_wallet = wallet;
				}
				// initialize client with real wallet
				const _client = new PropShopClient({
					wallet: _wallet,
					connection: connection.connection,
					dummyWallet,
				});
				console.debug(
					`set client with wallet: ${wallet.publicKey?.toString()}`
				);
				setClient(_client);
				await _client.initialize();
			} else if (
				client &&
				client.dummyWallet &&
				!dummyWallet &&
				!client.loading
			) {
				// client was initialized with dummy wallet, so reinitialize with real wallet
				console.debug(`override dummy wallet: ${wallet.publicKey?.toString()}`);
				await client.updateWallet({ wallet });
			} else if (
				client &&
				wallet.publicKey &&
				!client.publicKey.equals(wallet.publicKey) &&
				!client.loading
			) {
				// different wallet connected than the one in client, so reinitialize
				console.debug(
					`update connected wallet: ${wallet.publicKey?.toString()}`
				);
				await client.updateWallet({ wallet });
			}
		};

		run();
	}, [client?.loading, wallet.publicKey]);

	return client?.loading ? undefined : client;
}

export function useOutsideClick(callback: () => void) {
	const [ref, _setRef] = React.useState<React.MutableRefObject<any>>(
		React.useRef(null)
	);

	React.useEffect(() => {
		/**
		 * Alert if clicked on outside of element
		 */
		function handleClickOutside(event: any) {
			if (ref.current && !ref.current.contains(event.target)) {
				callback();
			}
		}

		// Bind the event listener
		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			// Unbind the event listener on clean up
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [ref]);

	return ref;
}
