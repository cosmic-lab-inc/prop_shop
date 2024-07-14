import { DataAndSlot, NotSubscribedError } from "@drift-labs/sdk";
import {
  AccountNamespace,
  BorshAccountsCoder,
  Program,
  ProgramAccount,
} from "@coral-xyz/anchor";
import StrictEventEmitter from "strict-event-emitter-types";
import { EventEmitter } from "events";
import { capitalize } from "./utils";
import {
  AccountInfo,
  GetProgramAccountsConfig,
  GetProgramAccountsResponse,
  PublicKey,
} from "@solana/web3.js";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import { PropShopAccountEvents } from "./client";
import { Buffer } from "buffer";
import {
  AccountGpaFilter,
  AccountSubscription,
  AccountToPoll,
  DriftVaultsSubscriber,
  PollingSubscriptionConfig,
} from "./types";
import bs58 from "bs58";
import { AccountLoader } from "./accountLoader";

export class PollingSubscriber implements DriftVaultsSubscriber {
  isSubscribed: boolean;
  program: Program<DriftVaults>;

  eventEmitter: StrictEventEmitter<EventEmitter, PropShopAccountEvents>;

  accountLoader: AccountLoader;
  accountsToPoll = new Map<string, AccountToPoll>();
  errorCallbackId?: string;

  _subscriptionConfig: PollingSubscriptionConfig;
  subscriptions: Map<string, AccountSubscription>;

  private isSubscribing = false;

  public constructor(
    program: Program<DriftVaults>,
    accountLoader: AccountLoader,
    subscriptionConfig: PollingSubscriptionConfig,
  ) {
    this.isSubscribed = false;
    this.program = program;
    this.eventEmitter = new EventEmitter();
    this.accountLoader = accountLoader;
    this.subscriptions = new Map();
    this._subscriptionConfig = subscriptionConfig;
    // for (const sub of subscriptions) {
    //   this.subscriptions.set(sub.publicKey.toString(), sub);
    // }
  }

  // todo: vds are too many accounts for getMultiple, so we need a GPA filter as an arg to the constructor
  async subscribe(): Promise<void> {
    const subs: AccountSubscription[] = [];

    if (this._subscriptionConfig.accounts) {
      const keys: PublicKey[] = this._subscriptionConfig.accounts.map(
        (key) => new PublicKey(key),
      );
      if (keys.length > 0) {
        const chunks = [];
        const chunkSize = 99;
        if (keys.length > chunkSize) {
          // chunk keys into PublicKey[][]
          let i = 0;
          while (i < keys.length) {
            let end;
            if (i + chunkSize < keys.length) {
              end = i + chunkSize;
            } else {
              end = keys.length;
            }
            const chunk = keys.slice(i, end);
            console.log(`chunk from [${i}, ${end}), length: ${chunk.length}`);
            chunks.push(chunk);
            i += chunkSize;
          }
        } else {
          console.log("single chunk:", keys.length);
          chunks.push(keys);
        }

        const accountInfos: (AccountInfo<Buffer> | null)[] = (
          await Promise.all(
            chunks.map((keys) => {
              return this.program.provider.connection.getMultipleAccountsInfo(
                keys,
              );
            }),
          )
        ).flat();
        accountInfos.forEach((accountInfo, index) => {
          if (accountInfo) {
            const value = this._subscriptionConfig.accounts![index];
            const sub: AccountSubscription = {
              ...value,
              accountInfo,
            };
            this.subscriptions.set(value.publicKey.toString(), sub);
            subs.push(sub);
          }
        });
      }
    }

    if (this._subscriptionConfig.filters) {
      const gpaConfig: GetProgramAccountsConfig = {
        filters: this._subscriptionConfig.filters.map((filter) => {
          return {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(
                BorshAccountsCoder.accountDiscriminator(
                  capitalize(filter.accountName),
                ),
              ),
            },
          };
        }),
      };
      const gpa: GetProgramAccountsResponse =
        await this.program.provider.connection.getProgramAccounts(
          this.program.programId,
          gpaConfig,
        );
      const discrims: Map<string, AccountGpaFilter> = new Map();
      for (const filter of this._subscriptionConfig.filters) {
        const discrim = bs58.encode(
          BorshAccountsCoder.accountDiscriminator(
            capitalize(filter.accountName),
          ),
        );
        discrims.set(discrim, filter);
      }
      gpa.forEach((value) => {
        // get first 8 bytes of data
        const discrim = bs58.encode(value.account.data.subarray(0, 8));
        const filter = discrims.get(discrim);
        if (!filter) {
          throw new Error(`No filter found for discriminator: ${discrim}`);
        } else {
          const sub: AccountSubscription = {
            accountName: filter.accountName,
            eventType: filter.eventType,
            publicKey: value.pubkey,
            accountInfo: value.account,
          };
          this.subscriptions.set(sub.publicKey.toString(), sub);
          subs.push(sub);
        }
      });
    }

    if (this.isSubscribed || this.isSubscribing) {
      return;
    }
    this.isSubscribing = true;

    await this.updateAccountsToPoll(subs);
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

  /**
   * Account loader will run callback with each poll which updates `this.subscriptions`
   */
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
    const value = this.subscriptions.get(key.toString());
    if (value) {
      if (value.accountName !== accountName) {
        throw new Error(
          `Account name mismatch: expected ${accountName}, got ${value.accountName}`,
        );
      } else {
        return value.dataAndSlot;
      }
    } else {
      return undefined;
    }
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

  public updateAccountLoaderPollingFrequency(pollingFrequency: number): void {
    this.accountLoader.updatePollingFrequency(pollingFrequency);
  }
}
