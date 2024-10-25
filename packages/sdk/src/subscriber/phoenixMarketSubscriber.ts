import {ProgramAccount} from '@coral-xyz/anchor';
import {DataAndSlot, ResubOpts} from '@drift-labs/sdk';
import {AccountInfo, Commitment, Connection, Context, PublicKey} from '@solana/web3.js';
import {Buffer} from 'buffer';
import StrictEventEmitter from 'strict-event-emitter-types';
import {EventEmitter} from 'events';
import {Data} from '../types';
import {deserializeMarketData, MarketState} from '@ellipsis-labs/phoenix-sdk';

export interface PhoenixAccountSubscription {
  publicKey: PublicKey;
  id?: string;
  decoded?: any;
}

export interface PhoenixAccountEvents {
  market: (payload: Data<PublicKey, MarketState>) => void;
}

export interface PhoenixAccountSubscription {
  publicKey: PublicKey;
  id?: string;
  dataAndSlot?: DataAndSlot<Buffer>;
  decoded?: any;
}

export interface PhoenixSubscriptionConfig {
  accounts?: Omit<
    PhoenixAccountSubscription,
    'id' & 'accountInfo' & 'dataAndSlot'
  >[];
}

export class PhoenixMarketSubscriber {
  _subscriptionConfig: PhoenixSubscriptionConfig;
  subscriptions: Map<string, PhoenixAccountSubscription>;
  connection: Connection;
  resubOpts?: ResubOpts;
  commitment?: Commitment;
  isUnsubscribing = false;
  timeoutId?: NodeJS.Timeout;
  receivingData: boolean;
  eventEmitter: StrictEventEmitter<EventEmitter, PhoenixAccountEvents>;

  public constructor(
    connection: Connection,
    subscriptionConfig: PhoenixSubscriptionConfig,
    eventEmitter: StrictEventEmitter<EventEmitter, PhoenixAccountEvents>,
    resubOpts?: ResubOpts,
    commitment?: Commitment
  ) {
    this.connection = connection;
    this.subscriptions = new Map();
    this._subscriptionConfig = subscriptionConfig;
    this.resubOpts = resubOpts;
    this.eventEmitter = eventEmitter;
    if (
      this.resubOpts?.resubTimeoutMs &&
      this.resubOpts?.resubTimeoutMs < 1000
    ) {
      console.log(
        'resubTimeoutMs should be at least 1000ms to avoid spamming resub'
      );
    }
    this.receivingData = false;
    this.commitment = commitment ?? "confirmed";
  }

  async fetch(): Promise<void> {
    const slot = await this.connection.getSlot();
    const accounts: ProgramAccount<AccountInfo<Buffer>>[] = [];

    const configAccounts = this._subscriptionConfig.accounts;
    if (configAccounts) {
      const keys: PublicKey[] = configAccounts.map((key) => new PublicKey(key));
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
          console.log('single chunk:', keys.length);
          chunks.push(keys);
        }

        const accountInfos: (AccountInfo<Buffer> | null)[] = (
          await Promise.all(
            chunks.map((keys) => {
              return this.connection.getMultipleAccountsInfo(
                keys
              );
            })
          )
        ).flat();
        console.debug(
          `websocket config "accounts" returned ${accountInfos.length} items`
        );
        accountInfos.forEach((accountInfo, index) => {
          if (accountInfo) {
            const value: PhoenixAccountSubscription = configAccounts[index];

            accounts.push({
              publicKey: value.publicKey,
              account: accountInfo,
            });
          }
        });
      }
    }

    this.handleRpcResponse({slot}, accounts);
  }

  async subscribe() {
    if (this.isUnsubscribing) {
      return;
    }

    const subs: PhoenixAccountSubscription[] = [];

    const accounts = this._subscriptionConfig.accounts;
    if (accounts) {
      const slot = await this.connection.getSlot();
      const keys: PublicKey[] = accounts.map((key) => new PublicKey(key));
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
          console.log('single chunk:', keys.length);
          chunks.push(keys);
        }

        const accountInfos: (AccountInfo<Buffer> | null)[] = (
          await Promise.all(
            chunks.map((keys) => {
              return this.connection.getMultipleAccountsInfo(
                keys
              );
            })
          )
        ).flat();
        console.debug(
          `websocket config "accounts" returned ${accountInfos.length} items`
        );
        accountInfos.forEach((accountInfo, index) => {
          if (accountInfo) {
            const value: PhoenixAccountSubscription = accounts[index];

            const id = this.connection.onAccountChange(
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
              this.commitment
            );

            const dataAndSlot = {
              data: accountInfo.data,
              slot,
            };
            if (accountInfo.data.length < 8) {
              console.error(
                `Invalid account data length (${accountInfo.data.length}) for account ${value.publicKey.toString()}`
              );
            }

            const buffer: Buffer = accountInfo.data;
            const marketData = deserializeMarketData(buffer);
            const decoded = new MarketState({
              address: value.publicKey,
              data: marketData,
            });

            const sub: PhoenixAccountSubscription = {
              ...value,
              dataAndSlot,
              id: id.toString(),
              decoded,
            };
            this.subscriptions.set(sub.publicKey.toString(), sub);
            subs.push(sub);
            this.eventEmitter.emit('market', {
              key: value.publicKey,
              data: decoded,
            });
          }
        });
      }
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
            `No ws data in ${this.resubOpts.resubTimeoutMs}ms, resubscribing`
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
    accounts: ProgramAccount<AccountInfo<Buffer>>[]
  ): void {
    for (const account of accounts) {
      const key = account.publicKey.toString();
      if (account.account.data.length < 8) {
        console.error(
          `Invalid account data length (${account.account.data.length}) for account ${key.toString()}`
        );
        continue;
      }
      // only update accounts that are subscribed
      // todo: define it if not defined to catch new program accounts!
      let value = this.subscriptions.get(key);
      if (value) {
        const lastSlot = value.dataAndSlot?.slot ?? 0;
        if (context.slot > lastSlot) {
          const buffer: Buffer = account.account.data;
          const marketData = deserializeMarketData(buffer);
          const decoded = new MarketState({
            address: account.publicKey,
            data: marketData,
          });
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
          this.eventEmitter.emit('market', {
            key: value.publicKey,
            data: decoded,
          });
        }
      } else {
        const buffer: Buffer = account.account.data;
        const marketData = deserializeMarketData(buffer);
        const decoded = new MarketState({
          address: account.publicKey,
          data: marketData,
        });
        const sub: PhoenixAccountSubscription = {
          publicKey: account.publicKey,
          dataAndSlot: {
            data: account.account.data,
            slot: context.slot,
          },
          decoded,
        };
        this.subscriptions.set(key, sub);
        // @ts-ignore
        this.eventEmitter.emit('market', {
          key: account.publicKey,
          data: decoded,
        });
      }
    }
  }

  getAccount(key: PublicKey): DataAndSlot<any> | undefined {
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

  getAccounts(): ProgramAccount<DataAndSlot<any>>[] {
    const decoded: ProgramAccount<DataAndSlot<any>>[] = [];
    for (const [key, _] of Array.from(this.subscriptions.entries())) {
      const entry = this.subscriptions.get(key.toString());
      if (entry && entry.decoded && entry.dataAndSlot) {
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
          this.connection.removeAccountChangeListener(
            Number(value.id)
          )
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
