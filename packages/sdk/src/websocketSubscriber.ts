import { DataAndSlot, ResubOpts } from "@drift-labs/sdk";
import {
  AccountNamespace,
  AnchorProvider,
  BorshAccountsCoder,
  Program,
  ProgramAccount,
} from "@coral-xyz/anchor";
import {
  AccountInfo,
  Commitment,
  Context,
  GetProgramAccountsConfig,
  GetProgramAccountsFilter,
  GetProgramAccountsResponse,
  PublicKey,
} from "@solana/web3.js";
import { capitalize } from "./utils";
import {
  AccountSubscription,
  DriftVaultsSubscriber,
  SubscriptionConfig,
} from "./types";
import { Buffer } from "buffer";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import bs58 from "bs58";

export class WebSocketSubscriber implements DriftVaultsSubscriber {
  _subscriptionConfig: SubscriptionConfig;
  subscriptions: Map<string, AccountSubscription>;
  program: Program<DriftVaults>;

  resubOpts?: ResubOpts;

  commitment?: Commitment;
  isUnsubscribing = false;

  timeoutId?: NodeJS.Timeout;

  receivingData: boolean;

  /**
   * "subscribedKeys" should equal the fetchConfig "keys" and accounts found via "filters"
   */
  public constructor(
    program: Program<DriftVaults>,
    subscriptionConfig: SubscriptionConfig,
    resubOpts?: ResubOpts,
    commitment?: Commitment,
  ) {
    this.program = program;
    this.subscriptions = new Map();
    this._subscriptionConfig = subscriptionConfig;
    this.resubOpts = resubOpts;
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
            const value: AccountSubscription =
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
      const gpas: GetProgramAccountsResponse[] = await Promise.all(
        this._subscriptionConfig.filters.map((filter) => {
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
          return this.program.provider.connection.getProgramAccounts(
            this.program.programId,
            gpaConfig,
          );
        }),
      );

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
            ({ accountId, accountInfo }, context) => {
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

    this.handleRpcResponse({ slot }, accounts);
  }

  async subscribe() {
    if (this.isUnsubscribing) {
      return;
    }

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
        console.log(
          `websocket config "accounts" returned ${accountInfos.length} items`,
        );
        accountInfos.forEach((accountInfo, index) => {
          if (accountInfo) {
            const value: AccountSubscription =
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

            const sub: AccountSubscription = {
              ...value,
              accountInfo,
              id: id.toString(),
            };
            this.subscriptions.set(sub.publicKey.toString(), sub);
            subs.push(sub);
          }
        });
      }
    }

    if (this._subscriptionConfig.filters) {
      const slot = await this.program.provider.connection.getSlot();

      const gpas: GetProgramAccountsResponse[] = await Promise.all(
        this._subscriptionConfig.filters.map((filter) => {
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
          return this.program.provider.connection.getProgramAccounts(
            this.program.programId,
            gpaConfig,
          );
        }),
      );

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
            ({ accountId, accountInfo }, context) => {
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
            const accountName =
              this.program.account[filter.accountName].idlAccount.name;
            const data = this.program.account[
              filter.accountName
            ].coder.accounts.decodeUnchecked(accountName, value.account.data);
            const dataAndSlot = {
              data,
              slot,
            };
            const sub: AccountSubscription = {
              accountName: filter.accountName,
              eventType: filter.eventType,
              publicKey: value.pubkey,
              accountInfo: value.account,
              dataAndSlot,
              id: id.toString(),
            };
            this.subscriptions.set(sub.publicKey.toString(), sub);
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
      // only update accounts that are subscribed
      if (!this.subscriptions.has(key)) {
        const existing = this.subscriptions.get(key)!;
        const lastSlot = existing.dataAndSlot?.slot ?? 0;
        if (context.slot > lastSlot) {
          existing.dataAndSlot = {
            data: account.account.data,
            slot: context.slot,
          };
        }
      }
    }
  }

  getAccount(
    accountName: keyof AccountNamespace<DriftVaults>,
    key: PublicKey,
  ): DataAndSlot<any> | undefined {
    const entry = this.subscriptions.get(key.toString());
    if (entry && entry.dataAndSlot) {
      return this.program.account[accountName].coder.accounts.decode(
        capitalize(accountName),
        entry.dataAndSlot.data,
      );
    } else {
      return undefined;
    }
  }

  getAccounts(
    accountName: keyof AccountNamespace<DriftVaults>,
  ): ProgramAccount<DataAndSlot<any>>[] {
    const decoded: ProgramAccount<DataAndSlot<any>>[] = [];
    for (const [key, account] of Array.from(this.subscriptions.entries())) {
      const entry = this.subscriptions.get(key.toString());
      if (entry && entry.dataAndSlot) {
        const decodedAccount = this.program.account[
          accountName
        ].coder.accounts.decode(
          capitalize(accountName),
          entry.dataAndSlot.data,
        );
        decoded.push({
          publicKey: new PublicKey(key),
          account: {
            data: decodedAccount,
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
