import {DataAndSlot, ResubOpts} from "@drift-labs/sdk";
import {AccountNamespace, AnchorProvider, BorshAccountsCoder, Program, ProgramAccount,} from "@coral-xyz/anchor";
import {
  AccountInfo,
  Commitment,
  Context,
  GetProgramAccountsConfig,
  GetProgramAccountsFilter,
  GetProgramAccountsResponse,
  PublicKey,
} from "@solana/web3.js";
import {capitalize} from "./utils";
import {
  PhoenixSubscriber,
  PhoenixVaultsAccountEvents,
  PhoenixVaultsAccountEventsMap,
  PhoenixVaultsAccountSubscription,
  PhoenixVaultsSubscriptionConfig,
} from "./types";
import {Buffer} from "buffer";
import {PhoenixVaults} from "@cosmic-lab/phoenix-vaults-sdk";
import bs58 from "bs58";
import StrictEventEmitter from "strict-event-emitter-types";
import {EventEmitter} from "events";

export class PhoenixWebsocketSubscriber implements PhoenixSubscriber {
  _subscriptionConfig: PhoenixVaultsSubscriptionConfig;
  subscriptions: Map<string, PhoenixVaultsAccountSubscription>;
  program: Program<PhoenixVaults>;
  resubOpts?: ResubOpts;
  commitment?: Commitment;
  isUnsubscribing = false;
  timeoutId?: NodeJS.Timeout;
  receivingData: boolean;
  eventEmitter: StrictEventEmitter<EventEmitter, PhoenixVaultsAccountEvents>;

  public constructor(
    program: Program<PhoenixVaults>,
    subscriptionConfig: PhoenixVaultsSubscriptionConfig,
    eventEmitter: StrictEventEmitter<EventEmitter, PhoenixVaultsAccountEvents>,
    resubOpts?: ResubOpts,
    commitment?: Commitment,
  ) {
    this.program = program;
    this.subscriptions = new Map();
    this._subscriptionConfig = subscriptionConfig;
    this.resubOpts = resubOpts;
    this.eventEmitter = eventEmitter;
    if (
      this.resubOpts?.resubTimeoutMs &&
      this.resubOpts?.resubTimeoutMs < 1000
    ) {
      console.log(
        "resubTimeoutMs should be at least 1000ms to avoid spamming resub",
      );
    }
    this.receivingData = false;
    this.commitment =
      commitment ?? (this.program.provider as AnchorProvider).opts.commitment;
  }

  async fetch(): Promise<void> {
    const slot = await this.program.provider.connection.getSlot();
    const accounts: ProgramAccount<AccountInfo<Buffer>>[] = [];

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
          `websocket config "accounts" returned ${accountInfos.length} items`,
        );
        accountInfos.forEach((accountInfo, index) => {
          if (accountInfo) {
            const value: PhoenixVaultsAccountSubscription =
              this._subscriptionConfig.accounts![index];

            accounts.push({
              publicKey: value.publicKey,
              account: accountInfo,
            });
          }
        });
      }
    }

    if (this._subscriptionConfig.filters) {
      const gpas: GetProgramAccountsResponse[] = [];
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
      }

      gpas.forEach((gpa, index) => {
        if (this._subscriptionConfig.filters) {
          const filter = this._subscriptionConfig.filters[index]!;
          const gpaConfig: GetProgramAccountsFilter[] = [
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
          ];

          const id = this.program.provider.connection.onProgramAccountChange(
            this.program.programId,
            ({accountId, accountInfo}, context) => {
              if (this.resubOpts?.resubTimeoutMs) {
                this.receivingData = true;
                clearTimeout(this.timeoutId);
                this.handleRpcResponse(context, [
                  {
                    publicKey: accountId,
                    account: accountInfo,
                  },
                ]);
                this.setTimeout();
              } else {
                this.handleRpcResponse(context, [
                  {
                    publicKey: accountId,
                    account: accountInfo,
                  },
                ]);
              }
            },
            this.commitment,
            gpaConfig,
          );

          gpa.forEach((value) => {
            accounts.push({
              publicKey: value.pubkey,
              account: value.account,
            });
          });
        }
      });
    }

    this.handleRpcResponse({slot}, accounts);
  }

  async subscribe() {
    if (this.isUnsubscribing) {
      return;
    }

    const subs: PhoenixVaultsAccountSubscription[] = [];

    if (this._subscriptionConfig.accounts) {
      const slot = await this.program.provider.connection.getSlot();
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
          `websocket config "accounts" returned ${accountInfos.length} items`,
        );
        accountInfos.forEach((accountInfo, index) => {
          if (accountInfo) {
            const value: PhoenixVaultsAccountSubscription =
              this._subscriptionConfig.accounts![index];

            const id = this.program.provider.connection.onAccountChange(
              value.publicKey,
              (accountInfo, context) => {
                if (this.resubOpts?.resubTimeoutMs) {
                  this.receivingData = true;
                  clearTimeout(this.timeoutId);
                  this.handleRpcResponse(context, [
                    {
                      publicKey: value.publicKey,
                      account: accountInfo,
                    },
                  ]);
                  this.setTimeout();
                } else {
                  this.handleRpcResponse(context, [
                    {
                      publicKey: value.publicKey,
                      account: accountInfo,
                    },
                  ]);
                }
              },
              this.commitment,
            );

            const dataAndSlot = {
              data: accountInfo.data,
              slot,
            };
            if (accountInfo.data.length < 8) {
              console.error(
                `Invalid account data length (${accountInfo.data.length}) for account ${value.publicKey.toString()}`,
              );
            }

            const _accountName =
              this.program.account[value.accountName].idlAccount.name;
            const decoded = this.program.account[
              value.accountName
              ].coder.accounts.decodeUnchecked(_accountName, accountInfo.data);

            const sub: PhoenixVaultsAccountSubscription = {
              ...value,
              dataAndSlot,
              id: id.toString(),
              decoded,
            };
            this.subscriptions.set(sub.publicKey.toString(), sub);
            subs.push(sub);
            // @ts-ignore
            this.eventEmitter.emit(sub.eventType, {
              key: value.publicKey,
              data: decoded,
            });
            this.eventEmitter.emit("update");
          }
        });
      }
    }

    if (this._subscriptionConfig.filters) {
      const slot = await this.program.provider.connection.getSlot();
      const gpas: GetProgramAccountsResponse[] = [];
      for (const filter of this._subscriptionConfig.filters) {
        const _accountName =
          this.program.account[filter.accountName].idlAccount.name;
        const gpaConfig: GetProgramAccountsConfig = {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(
                  BorshAccountsCoder.accountDiscriminator(_accountName),
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
      }

      gpas.forEach((gpa, index) => {
        if (this._subscriptionConfig.filters) {
          const filter = this._subscriptionConfig.filters[index]!;
          const _accountName =
            this.program.account[filter.accountName].idlAccount.name;
          const gpaConfig: GetProgramAccountsFilter[] = [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(
                  BorshAccountsCoder.accountDiscriminator(_accountName),
                ),
              },
            },
          ];

          const id = this.program.provider.connection.onProgramAccountChange(
            this.program.programId,
            ({accountId, accountInfo}, context) => {
              if (accountInfo.data.length < 8) {
                console.error(
                  `onProgramAccountChange, empty account (${accountInfo.data.length}) for account ${accountId.toString()}`,
                );
              }
              if (this.resubOpts?.resubTimeoutMs) {
                this.receivingData = true;
                clearTimeout(this.timeoutId);
                this.handleRpcResponse(context, [
                  {
                    publicKey: accountId,
                    account: accountInfo,
                  },
                ]);
                this.setTimeout();
              } else {
                this.handleRpcResponse(context, [
                  {
                    publicKey: accountId,
                    account: accountInfo,
                  },
                ]);
              }
            },
            this.commitment,
            gpaConfig,
          );

          gpa.forEach((value) => {
            if (value.account.data.length < 8) {
              console.error(
                `Invalid account data length (${value.account.data.length}) for account ${value.pubkey.toString()}`,
              );
            }

            const _accountName =
              this.program.account[filter.accountName].idlAccount.name;
            const decoded = this.program.account[
              filter.accountName
              ].coder.accounts.decodeUnchecked(_accountName, value.account.data);

            const dataAndSlot = {
              data: value.account.data,
              slot,
            };
            const sub: PhoenixVaultsAccountSubscription = {
              accountName: filter.accountName,
              eventType: filter.eventType,
              publicKey: value.pubkey,
              dataAndSlot,
              id: id.toString(),
              decoded,
            };
            this.subscriptions.set(sub.publicKey.toString(), sub);

            // @ts-ignore
            this.eventEmitter.emit(sub.eventType, {
              key: value.pubkey,
              data: decoded,
            });
            this.eventEmitter.emit("update");

            subs.push(sub);
          });
        }
      });
      console.log(`websocket config "filters" returned ${subs.length} items`);
    }

    if (this.resubOpts?.resubTimeoutMs) {
      this.receivingData = true;
      this.setTimeout();
    }

    this.eventEmitter.emit("update");
  }

  private setTimeout(): void {
    this.timeoutId = setTimeout(async () => {
      if (this.isUnsubscribing) {
        // If we are in the process of unsubscribing, do not attempt to resubscribe
        return;
      }

      if (this.receivingData) {
        if (this.resubOpts?.logResubMessages) {
          console.log(
            `No ws data in ${this.resubOpts.resubTimeoutMs}ms, resubscribing`,
          );
        }
        await this.unsubscribe(true);
        this.receivingData = false;
        await this.subscribe();
      }
    }, this.resubOpts?.resubTimeoutMs);
  }

  handleRpcResponse(
    context: Context,
    accounts: ProgramAccount<AccountInfo<Buffer>>[],
  ): void {
    for (const account of accounts) {
      const key = account.publicKey.toString();
      if (account.account.data.length < 8) {
        console.error(
          `Invalid account data length (${account.account.data.length}) for account ${key.toString()}`,
        );
        continue;
      }
      // only update accounts that are subscribed
      // todo: define it if not defined to catch new program accounts!
      let value = this.subscriptions.get(key);
      if (value) {
        const lastSlot = value.dataAndSlot?.slot ?? 0;
        if (context.slot > lastSlot) {
          const _accountName =
            this.program.account[value.accountName].idlAccount.name;
          const decoded = this.program.account[
            value.accountName
            ].coder.accounts.decodeUnchecked(_accountName, account.account.data);
          value = {
            ...value,
            dataAndSlot: {
              data: account.account.data,
              slot: context.slot,
            },
            decoded,
          };

          this.subscriptions.set(key, value);
          // @ts-ignore
          this.eventEmitter.emit(value.eventType, {
            key: value.publicKey,
            data: decoded,
          });
          this.eventEmitter.emit("update");
        }
      } else {
        const actual = account.account.data.subarray(0, 8);
        for (const accountType in this.program.account) {
          const namespace =
            this.program.account[
              accountType as any as keyof AccountNamespace<PhoenixVaults>
              ];
          const accountName = namespace.idlAccount.name;
          const expected = BorshAccountsCoder.accountDiscriminator(accountName);
          if (actual.equals(expected)) {
            const decoded = namespace.coder.accounts.decodeUnchecked(
              accountName,
              account.account.data,
            );
            const sub: PhoenixVaultsAccountSubscription = {
              accountName,
              eventType: PhoenixVaultsAccountEventsMap[accountType],
              publicKey: account.publicKey,
              dataAndSlot: {
                data: account.account.data,
                slot: context.slot,
              },
              decoded,
            };
            this.subscriptions.set(key, sub);
            // @ts-ignore
            this.eventEmitter.emit(sub.eventType, {
              key: account.publicKey,
              data: decoded,
            });
            this.eventEmitter.emit("update");
          }
        }
      }
    }
  }

  getAccount(
    accountName: keyof AccountNamespace<PhoenixVaults>,
    key: PublicKey,
  ): DataAndSlot<any> | undefined {
    const entry = this.subscriptions.get(key.toString());
    if (entry && entry.dataAndSlot && entry.decoded) {
      return {
        data: entry.decoded,
        slot: entry.dataAndSlot.slot,
      };
    } else {
      return undefined;
    }
  }

  getAccounts(
    accountName: keyof AccountNamespace<PhoenixVaults>,
  ): ProgramAccount<DataAndSlot<any>>[] {
    const decoded: ProgramAccount<DataAndSlot<any>>[] = [];
    for (const [key, account] of Array.from(this.subscriptions.entries())) {
      const entry = this.subscriptions.get(key.toString());
      if (
        entry &&
        entry.accountName === accountName &&
        entry.decoded &&
        entry.dataAndSlot
      ) {
        decoded.push({
          publicKey: new PublicKey(key),
          account: {
            data: entry.decoded,
            slot: entry.dataAndSlot.slot,
          },
        });
      }
    }
    return decoded;
  }

  async unsubscribe(onResub = false): Promise<any> {
    if (!onResub && this.resubOpts) {
      this.resubOpts.resubTimeoutMs = undefined;
    }
    this.isUnsubscribing = true;
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;

    const keysToRemove: string[] = [];
    const promises = [];
    const seenIds = new Set<number>();
    for (const [key, value] of Array.from(this.subscriptions.entries())) {
      // program account listener has one ID for many keys, so this is a workaround
      if (!seenIds.has(Number(value.id))) {
        promises.push(
          this.program.provider.connection.removeAccountChangeListener(
            Number(value.id),
          ),
        );
        seenIds.add(Number(value.id));
      }
      keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      this.subscriptions.delete(key);
    }
    this.isUnsubscribing = false;
    return Promise.all(promises);
  }
}
