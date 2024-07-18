import { DataAndSlot } from "@drift-labs/sdk";
import { PublicKey } from "@solana/web3.js";
import { AccountNamespace, ProgramAccount } from "@coral-xyz/anchor";
import { DriftVaults, Vault, VaultDepositor } from "@drift-labs/vaults-sdk";
import { Buffer } from "buffer";
import { Data } from "./misc";

export interface DriftVaultsSubscriber {
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

export interface PropShopAccountEvents {
  vaultUpdate: (payload: Data<PublicKey, Vault>) => void;
  vaultDepositorUpdate: (payload: Data<PublicKey, VaultDepositor>) => void;
  update: void;
  error: (e: Error) => void;
}

export interface AccountSubscription {
  accountName: keyof AccountNamespace<DriftVaults>;
  publicKey: PublicKey;
  eventType: keyof PropShopAccountEvents;
  id?: string;
  dataAndSlot?: DataAndSlot<Buffer>;
  decoded?: any;
}

export interface AccountGpaFilter {
  accountName: keyof AccountNamespace<DriftVaults>;
  eventType: keyof PropShopAccountEvents;
}

export interface SubscriptionConfig {
  accounts?: Omit<AccountSubscription, "id" & "accountInfo" & "dataAndSlot">[];
  filters?: AccountGpaFilter[];
}
