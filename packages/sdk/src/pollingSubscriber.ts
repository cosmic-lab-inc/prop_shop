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
import {
  DriftVaultsAccountEvents,
  DriftVaultsAccountGpaFilter,
  DriftVaultsAccountSubscription,
  DriftVaultsSubscriber,
  DriftVaultsSubscriptionConfig,
} from "./types";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { AccountLoader } from "./accountLoader";

export class PollingSubscriber implements DriftVaultsSubscriber {
  isSubscribed: boolean;
  program: Program<DriftVaults>;
  eventEmitter: StrictEventEmitter<EventEmitter, DriftVaultsAccountEvents>;
  accountLoader: AccountLoader;
  accountsToPoll = new Map<string, DriftVaultsAccountSubscription>();
  errorCallbackId?: string;
  _subscriptionConfig: DriftVaultsSubscriptionConfig;
  subscriptions: Map<string, DriftVaultsAccountSubscription>;

  private isSubscribing = false;

  public constructor(
    program: Program<DriftVaults>,
    accountLoader: AccountLoader,
    subscriptionConfig: DriftVaultsSubscriptionConfig,
    eventEmitter: StrictEventEmitter<EventEmitter, DriftVaultsAccountEvents>,
  ) {
    this.isSubscribed = false;
    this.program = program;
    this.eventEmitter = eventEmitter;
    this.accountLoader = accountLoader;
    this.subscriptions = new Map();
    this._subscriptionConfig = subscriptionConfig;
  }

  async subscribe(): Promise<void> {
    const subs: DriftVaultsAccountSubscription[] = [];
    const slot = await this.program.provider.connection.getSlot();

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
        console.log(
          `polling config "accounts" returned ${accountInfos.length} items`,
        );
        accountInfos.forEach((accountInfo, index) => {
          if (accountInfo) {
            const value: DriftVaultsAccountSubscription =
              this._subscriptionConfig.accounts![index];
            const sub: DriftVaultsAccountSubscription = {
              ...value,
              dataAndSlot: {
                data: accountInfo.data,
                slot,
              },
            };
            this.subscriptions.set(value.publicKey.toString(), sub);
            subs.push(sub);
          }
        });
      }
    }

    if (this._subscriptionConfig.filters) {
      const gpas: GetProgramAccountsResponse[] = [];
      const discrims: Map<string, DriftVaultsAccountGpaFilter> = new Map();
      for (const filter of this._subscriptionConfig.filters) {
        const gpaConfig: GetProgramAccountsConfig = {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(
                  BorshAccountsCoder.accountDiscriminator(
                    capitalize(filter.accountName),
                  ),
                ),
              },
            },
          ],
        };
        gpas.push(
          await this.program.provider.connection.getProgramAccounts(
            this.program.programId,
            gpaConfig,
          ),
        );
        const _accountName =
          this.program.account[filter.accountName].idlAccount.name;
        const discrim = bs58.encode(
          BorshAccountsCoder.accountDiscriminator(_accountName),
        );
        discrims.set(discrim, filter);
      }

      gpas.forEach((gpa, index) => {
        if (this._subscriptionConfig.filters) {
          const filter = this._subscriptionConfig.filters[index];
          try {
            for (const value of gpa) {
              const accountName =
                this.program.account[filter.accountName].idlAccount.name;
              const decoded = this.program.account[
                filter.accountName
              ].coder.accounts.decodeUnchecked(accountName, value.account.data);
              const dataAndSlot = {
                data: value.account.data,
                slot,
              };
              const sub: DriftVaultsAccountSubscription = {
                accountName: filter.accountName,
                eventType: filter.eventType,
                publicKey: value.pubkey,
                decoded,
                dataAndSlot,
              };
              this.subscriptions.set(sub.publicKey.toString(), sub);
              subs.push(sub);
            }
          } catch (e: any) {
            throw new Error(e);
          }
        }
      });
      console.log(`polling config "filters" returned ${subs.length} items`);
    }

    if (this.isSubscribed || this.isSubscribing) {
      return;
    }
    this.isSubscribing = true;

    await this.updateAccountsToPoll(subs);
    await this.addToAccountLoader();

    this.eventEmitter.emit("update");
    this.accountLoader.startPolling();
    this.isSubscribing = false;
    this.isSubscribed = true;
  }

  async updateAccountsToPoll(
    accounts: DriftVaultsAccountSubscription[],
  ): Promise<void> {
    if (this.accountsToPoll.size > 0) {
      return;
    }
    for (const account of accounts) {
      this.accountsToPoll.set(account.publicKey.toString(), account);
    }
  }

  private async addToAccountLoader(): Promise<void> {
    for (const [_, accountToPoll] of this.accountsToPoll) {
      accountToPoll.id = await this.accountLoader.addAccount(
        accountToPoll.publicKey,
        (buffer: Buffer, slot: number) => {
          if (!buffer) return;

          const accountName =
            this.program.account[accountToPoll.accountName].idlAccount.name;
          const decoded = this.program.account[
            accountToPoll.accountName
          ].coder.accounts.decodeUnchecked(accountName, buffer);
          const dataAndSlot = {
            data: buffer,
            slot,
          };
          this.subscriptions.set(accountToPoll.publicKey.toString(), {
            ...accountToPoll,
            dataAndSlot,
            decoded,
          });

          // @ts-ignore
          this.eventEmitter.emit(accountToPoll.eventType, {
            key: accountToPoll.publicKey,
            data: decoded,
          });
          this.eventEmitter.emit("update");

          if (!this.isSubscribed) {
            this.isSubscribed = true;
          }
        },
      );
    }

    this.errorCallbackId = this.accountLoader.addErrorCallbacks((error) => {
      this.eventEmitter.emit("error", error);
    });
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
        const accountName =
          this.program.account[accountToPoll.accountName].idlAccount.name;
        const decoded = this.program.account[
          accountToPoll.accountName
        ].coder.accounts.decodeUnchecked(accountName, buffer);
        this.subscriptions.set(accountToPoll.publicKey.toString(), {
          ...accountToPoll,
          dataAndSlot: {
            data: buffer,
            slot,
          },
          decoded,
        });
      }
    }
  }

  public async unsubscribe(): Promise<void> {
    for (const [_, accountToPoll] of this.accountsToPoll) {
      if (accountToPoll.id) {
        this.accountLoader.removeAccount(
          accountToPoll.publicKey,
          accountToPoll.id,
        );
      }
    }

    if (this.errorCallbackId) {
      this.accountLoader.removeErrorCallbacks(this.errorCallbackId);
      this.errorCallbackId = undefined;
    }

    this.accountLoader.stopPolling();
    this.accountsToPoll.clear();
    this.isSubscribed = false;
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
    if (value && value.dataAndSlot) {
      if (value.accountName !== accountName) {
        throw new Error(
          `Account name mismatch: expected ${accountName}, got ${value.accountName}`,
        );
      } else {
        const _accountName = this.program.account[accountName].idlAccount.name;
        const data = this.program.account[
          accountName
        ].coder.accounts.decodeUnchecked(_accountName, value.dataAndSlot.data);
        return {
          data,
          slot: value.dataAndSlot.slot,
        };
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
      .filter((sub) => sub.dataAndSlot !== undefined)
      .map((sub) => {
        const _accountName = this.program.account[accountName].idlAccount.name;
        const data = this.program.account[
          accountName
        ].coder.accounts.decodeUnchecked(_accountName, sub.dataAndSlot!.data);
        const pa: ProgramAccount<DataAndSlot<any>> = {
          publicKey: sub.publicKey,
          account: {
            data,
            slot: sub.dataAndSlot!.slot,
          },
        };
        return pa;
      }) as ProgramAccount<DataAndSlot<any>>[];
  }

  public updateAccountLoaderPollingFrequency(pollingFrequency: number): void {
    this.accountLoader.updatePollingFrequency(pollingFrequency);
  }
}
