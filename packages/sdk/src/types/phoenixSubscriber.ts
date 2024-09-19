import { DataAndSlot } from '@drift-labs/sdk';
import { PublicKey } from '@solana/web3.js';
import { AccountNamespace, ProgramAccount } from '@coral-xyz/anchor';
import { Investor, PhoenixVaults, Vault } from '@cosmic-lab/phoenix-vaults-sdk';
import { Buffer } from 'buffer';
import { Data } from './misc';

export interface PhoenixSubscriber {
	getAccount(
		accountName: keyof AccountNamespace<PhoenixVaults>,
		key: PublicKey
	): DataAndSlot<any> | undefined;

	getAccounts(
		accountName: keyof AccountNamespace<PhoenixVaults>
	): ProgramAccount<DataAndSlot<any>>[];

	subscribe(): Promise<void>;

	fetch(): Promise<void>;

	unsubscribe(): Promise<any>;
}

export interface PhoenixVaultsAccountEvents {
	vaultUpdate: (payload: Data<PublicKey, Vault>) => void;
	investorUpdate: (payload: Data<PublicKey, Investor>) => void;
	update: void;
	error: (e: Error) => void;
}

export const PhoenixVaultsAccountEventsMap: {
	[key: string]: keyof PhoenixVaultsAccountEvents;
} = {
	vault: 'vaultUpdate',
	investor: 'investorUpdate',
};

export interface PhoenixVaultsAccountSubscription {
	accountName: keyof AccountNamespace<PhoenixVaults>;
	publicKey: PublicKey;
	eventType: keyof PhoenixVaultsAccountEvents;
	id?: string;
	dataAndSlot?: DataAndSlot<Buffer>;
	decoded?: any;
}

export interface PhoenixVaultsAccountGpaFilter {
	accountName: keyof AccountNamespace<PhoenixVaults>;
	eventType: keyof PhoenixVaultsAccountEvents;
}

export interface PhoenixVaultsSubscriptionConfig {
	accounts?: Omit<
		PhoenixVaultsAccountSubscription,
		'id' & 'accountInfo' & 'dataAndSlot'
	>[];
	filters?: PhoenixVaultsAccountGpaFilter[];
}
