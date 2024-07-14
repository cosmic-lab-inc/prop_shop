import { DataAndSlot } from "@drift-labs/sdk";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import { AccountNamespace, ProgramAccount } from "@coral-xyz/anchor";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import { Buffer } from "buffer";
import { PropShopAccountEvents } from "../client";

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

export type AccountSubscription = AccountToPoll & {
  accountInfo?: AccountInfo<Buffer>;
  dataAndSlot?: DataAndSlot<any>;
};

export interface AccountToPoll {
  accountName: keyof AccountNamespace<DriftVaults>;
  publicKey: PublicKey;
  eventType: keyof PropShopAccountEvents;
  callbackId?: string;
}

export interface AccountGpaFilter {
  accountName: keyof AccountNamespace<DriftVaults>;
  eventType: keyof PropShopAccountEvents;
}

export interface WebSocketAccountFetchConfig {
  keys?: PublicKey[];
  filters?: AccountGpaFilter[];
}

export interface PollingSubscriptionConfig {
  accounts?: Omit<AccountToPoll, "callbackId">[];
  filters?: AccountGpaFilter[];
}
