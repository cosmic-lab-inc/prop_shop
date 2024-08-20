import {
  DataAndSlot,
  PerpMarketAccount,
  SpotMarketAccount,
  UserAccount,
} from "@drift-labs/sdk";
import { PublicKey } from "@solana/web3.js";
import { AccountNamespace, ProgramAccount } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import { Data } from "./misc";
import { Drift } from "../idl/drift";

export interface DriftSubscriber {
  getAccount(
    accountName: keyof AccountNamespace<Drift>,
    key: PublicKey,
  ): DataAndSlot<any> | undefined;

  getAccounts(
    accountName: keyof AccountNamespace<Drift>,
  ): ProgramAccount<DataAndSlot<any>>[];

  subscribe(): Promise<void>;

  fetch(): Promise<void>;

  unsubscribe(): Promise<any>;
}

export interface DriftAccountEvents {
  userUpdate: (payload: Data<PublicKey, UserAccount>) => void;
  spotMarketUpdate: (payload: Data<PublicKey, SpotMarketAccount>) => void;
  perpMarketUpdate: (payload: Data<PublicKey, PerpMarketAccount>) => void;
  update: void;
  error: (e: Error) => void;
}

export const DriftAccountEventsMap: {
  [key: string]: keyof DriftAccountEvents;
} = {
  user: "userUpdate",
  spotMarket: "spotMarketUpdate",
  perpMarket: "perpMarketUpdate",
};

export interface DriftAccountSubscription {
  accountName: keyof AccountNamespace<Drift>;
  publicKey: PublicKey;
  eventType: keyof DriftAccountEvents;
  id?: string;
  dataAndSlot?: DataAndSlot<Buffer>;
  decoded?: any;
}

export interface DriftAccountGpaFilter {
  accountName: keyof AccountNamespace<Drift>;
  eventType: keyof DriftAccountEvents;
}

export interface DriftSubscriptionConfig {
  accounts?: Omit<
    DriftAccountSubscription,
    "id" & "accountInfo" & "dataAndSlot"
  >[];
  filters?: DriftAccountGpaFilter[];
}
