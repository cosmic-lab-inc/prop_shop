import {
  BulkAccountLoader,
  DataAndSlot,
  NotSubscribedError,
} from "@drift-labs/sdk";
import { AccountNamespace, Program, ProgramAccount } from "@coral-xyz/anchor";
import StrictEventEmitter from "strict-event-emitter-types";
import { EventEmitter } from "events";
import { capitalize } from "./utils";
import { PublicKey } from "@solana/web3.js";
import { DriftVaults, Vault, VaultDepositor } from "@drift-labs/vaults-sdk";
import { PropShopAccountEvents } from "./client";
import { Buffer } from "buffer";
import {
  AccountSubscription,
  AccountToPoll,
  DriftVaultsSubscriber,
} from "./types";

export class PollingSubscriber implements DriftVaultsSubscriber {
  isSubscribed: boolean;
  program: Program<DriftVaults>;

  eventEmitter: StrictEventEmitter<EventEmitter, PropShopAccountEvents>;

  accountLoader: BulkAccountLoader;
  accountsToPoll = new Map<string, AccountToPoll>();
  errorCallbackId?: string;

  subscriptions: Map<string, AccountSubscription>;

  private isSubscribing = false;

  public constructor(
    program: Program<DriftVaults>,
    accountLoader: BulkAccountLoader,
    subscriptions: Omit<AccountToPoll, "callbackId">[],
  ) {
    this.isSubscribed = false;
    this.program = program;
    this.eventEmitter = new EventEmitter();
    this.accountLoader = accountLoader;
    this.subscriptions = new Map();
    for (const sub of subscriptions) {
      this.subscriptions.set(sub.publicKey.toString(), sub);
    }
  }

  async subscribe(): Promise<void> {
    const keys: PublicKey[] = Array.from(this.subscriptions.keys()).map(
      (key) => new PublicKey(key),
    );
    const accountInfos =
      await this.program.provider.connection.getMultipleAccountsInfo(keys);
    const accounts = accountInfos
      .map((accountInfo, index) => {
        return {
          ...this.subscriptions.get(keys[index].toString()),
          accountInfo,
        };
      })
      .filter((value) => value.accountInfo !== null) as AccountSubscription[];

    if (this.isSubscribed || this.isSubscribing) {
      return;
    }
    this.isSubscribing = true;

    await this.updateAccountsToPoll(accounts);
    await this.addToAccountLoader();

    let retries = 0;
    while (!this.isSubscribed && retries < 5) {
      await this.fetch();
      this.isSubscribed = true;
      retries++;
    }
    this.eventEmitter.emit("update");
    this.isSubscribing = false;
    this.isSubscribed = true;
  }

  async updateAccountsToPoll(accounts: AccountSubscription[]): Promise<void> {
    if (this.accountsToPoll.size > 0) {
      return;
    }
    for (const account of accounts) {
      this.addAccountToPoll(account);
    }
  }

  private addAccountToPoll(account: AccountSubscription): void {
    this.accountsToPoll.set(account.publicKey.toString(), account);
  }

  private async addToAccountLoader(): Promise<void> {
    for (const [_, accountToPoll] of this.accountsToPoll) {
      await this.addAccountToAccountLoader(accountToPoll);
    }

    this.errorCallbackId = this.accountLoader.addErrorCallbacks((error) => {
      this.eventEmitter.emit("error", error);
    });
  }

  private async addAccountToAccountLoader(
    accountToPoll: AccountToPoll,
  ): Promise<void> {
    accountToPoll.callbackId = await this.accountLoader.addAccount(
      accountToPoll.publicKey,
      (buffer: Buffer, slot: number) => {
        if (!buffer) return;

        const account = this.program.account[
          accountToPoll.accountName
        ].coder.accounts.decodeUnchecked(
          capitalize(accountToPoll.accountName),
          buffer,
        );
        const dataAndSlot = {
          data: account,
          slot,
        };
        this.subscriptions.set(accountToPoll.publicKey.toString(), {
          ...accountToPoll,
          dataAndSlot,
        });
        this.subscriptions.set(accountToPoll.publicKey.toString(), {
          ...accountToPoll,
          dataAndSlot,
        });

        // @ts-ignore
        this.eventEmitter.emit(accountToPoll.eventType, account);
        this.eventEmitter.emit("update");

        if (!this.isSubscribed) {
          this.isSubscribed = true;
        }
      },
    );
  }

  public async fetch(): Promise<void> {
    await this.accountLoader.load();
    for (const [_, accountToPoll] of this.accountsToPoll) {
      const bufferAndSlot = this.accountLoader.getBufferAndSlot(
        accountToPoll.publicKey,
      );

      if (!bufferAndSlot) {
        continue;
      }

      const { buffer, slot } = bufferAndSlot;

      if (buffer) {
        const account = this.program.account[
          accountToPoll.accountName
        ].coder.accounts.decodeUnchecked(
          capitalize(accountToPoll.accountName),
          buffer,
        );
        this.subscriptions.set(accountToPoll.publicKey.toString(), {
          ...accountToPoll,
          dataAndSlot: {
            data: account,
            slot,
          },
        });
      }
    }
  }

  didSubscriptionSucceed(): boolean {
    return this.isSubscribed;
  }

  public async unsubscribe(): Promise<void> {
    for (const [_, accountToPoll] of this.accountsToPoll) {
      if (accountToPoll.callbackId) {
        this.accountLoader.removeAccount(
          accountToPoll.publicKey,
          accountToPoll.callbackId,
        );
      }
    }

    if (this.errorCallbackId) {
      this.accountLoader.removeErrorCallbacks(this.errorCallbackId);
      this.errorCallbackId = undefined;
    }

    this.accountsToPoll.clear();
    this.isSubscribed = false;
  }

  async addAccount(sub: AccountSubscription): Promise<boolean> {
    if (this.accountsToPoll.has(sub.publicKey.toString())) {
      return true;
    }
    this.addAccountToPoll(sub);
    const accountToPoll = this.accountsToPoll.get(sub.publicKey.toString());
    if (!accountToPoll) {
      throw new Error("Failed to add to account poll");
    }
    await this.addAccountToAccountLoader(accountToPoll);
    return true;
  }

  assertIsSubscribed(): void {
    if (!this.isSubscribed) {
      throw new NotSubscribedError(
        "You must call `subscribe` before using this function",
      );
    }
  }

  getAccount(
    accountName: keyof AccountNamespace<DriftVaults>,
    key: PublicKey,
  ): DataAndSlot<any> | undefined {
    this.assertIsSubscribed();
    return this.subscriptions.get(key.toString())?.dataAndSlot;
  }

  getAccounts(
    accountName: keyof AccountNamespace<DriftVaults>,
  ): ProgramAccount<DataAndSlot<any>>[] {
    this.assertIsSubscribed();
    return Array.from(this.subscriptions.values())
      .filter(
        (sub) =>
          sub.accountName === accountName && sub.dataAndSlot !== undefined,
      )
      .map((sub) => {
        const pa: ProgramAccount<DataAndSlot<any>> = {
          publicKey: sub.publicKey,
          account: sub.dataAndSlot!,
        };
        return pa;
      }) as ProgramAccount<DataAndSlot<any>>[];
  }

  public getVault(key: PublicKey): DataAndSlot<Vault> | undefined {
    const value = this.subscriptions.get(key.toString())?.dataAndSlot;
    if (value) {
      return value as DataAndSlot<Vault>;
    } else {
      return undefined;
    }
  }

  public getVaults(): DataAndSlot<Vault>[] {
    return Array.from(this.subscriptions.values())
      .filter((sub) => {
        return sub.accountName === "vault";
      })
      .map((sub) => sub.dataAndSlot as DataAndSlot<Vault>);
  }

  public getVaultDepositor(
    key: PublicKey,
  ): DataAndSlot<VaultDepositor> | undefined {
    const value = this.subscriptions.get(key.toString())?.dataAndSlot;
    if (value) {
      return value as DataAndSlot<VaultDepositor>;
    } else {
      return undefined;
    }
  }

  public getVaultDepositors(): DataAndSlot<VaultDepositor>[] {
    return Array.from(this.subscriptions.values())
      .filter((sub) => {
        return sub.accountName === "vaultDepositor";
      })
      .map((sub) => sub.dataAndSlot as DataAndSlot<VaultDepositor>);
  }

  public updateAccountLoaderPollingFrequency(pollingFrequency: number): void {
    this.accountLoader.updatePollingFrequency(pollingFrequency);
  }
}
