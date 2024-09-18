import {DataAndSlot} from "@drift-labs/sdk";
import {PublicKey} from "@solana/web3.js";
import {AccountNamespace, ProgramAccount} from "@coral-xyz/anchor";
import {DriftVaults, Vault, VaultDepositor} from "@drift-labs/vaults-sdk";
import {Buffer} from "buffer";
import {Data} from "./misc";

export interface DriftSubscriber {
  getAccount(
    accountName: keyof AccountNamespace<DriftVaults>,
    key: PublicKey,
  ): DataAndSlot<any> | undefined;

  getAccounts(
    accountName: keyof AccountNamespace<DriftVaults>,
  ): ProgramAccount<DataAndSlot<any>>[];

  subscribe(): Promise<void>;

  fetch(): Promise<void>;

  unsubscribe(): Promise<any>;
}

export interface DriftVaultsAccountEvents {
  vaultUpdate: (payload: Data<PublicKey, Vault>) => void;
  vaultDepositorUpdate: (payload: Data<PublicKey, VaultDepositor>) => void;
  update: void;
  error: (e: Error) => void;
}

export const DriftVaultsAccountEventsMap: {
  [key: string]: keyof DriftVaultsAccountEvents;
} = {
  vault: "vaultUpdate",
  vaultDepositor: "vaultDepositorUpdate",
};

export interface DriftVaultsAccountSubscription {
  accountName: keyof AccountNamespace<DriftVaults>;
  publicKey: PublicKey;
  eventType: keyof DriftVaultsAccountEvents;
  id?: string;
  dataAndSlot?: DataAndSlot<Buffer>;
  decoded?: any;
}

export interface DriftVaultsAccountGpaFilter {
  accountName: keyof AccountNamespace<DriftVaults>;
  eventType: keyof DriftVaultsAccountEvents;
}

export interface DriftVaultsSubscriptionConfig {
  accounts?: Omit<DriftVaultsAccountSubscription, "id" & "accountInfo" & "dataAndSlot">[];
  filters?: DriftVaultsAccountGpaFilter[];
}
