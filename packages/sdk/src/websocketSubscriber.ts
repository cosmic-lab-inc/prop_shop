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
  GetProgramAccountsResponse,
  PublicKey,
} from "@solana/web3.js";
import { capitalize } from "./utils";
import { DriftVaultsSubscriber, WebSocketAccountFetchConfig } from "./types";
import { Buffer } from "buffer";
import { DriftVaults } from "@drift-labs/vaults-sdk";
import bs58 from "bs58";

interface SubscribedAccount {
  listenerId: number;
  account?: {
    buffer: Buffer;
    slot: number;
  };
}

export class WebSocketSubscriber implements DriftVaultsSubscriber {
  _fetchConfig: WebSocketAccountFetchConfig;
  subscribedKeys: PublicKey[];
  subscriptions: Map<string, SubscribedAccount>;
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
    subscribedKeys: PublicKey[],
    fetchConfig: WebSocketAccountFetchConfig,
    resubOpts?: ResubOpts,
    commitment?: Commitment,
  ) {
    this.program = program;
    this.subscribedKeys = subscribedKeys;
    this.subscriptions = new Map();
    this._fetchConfig = fetchConfig;
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

  async subscribe(): Promise<void> {
    if (this.isUnsubscribing) {
      return;
    }

    for (const key of this.subscribedKeys) {
      const listenerId = this.program.provider.connection.onAccountChange(
        key,
        (accountInfo, context) => {
          if (this.resubOpts?.resubTimeoutMs) {
            this.receivingData = true;
            clearTimeout(this.timeoutId);
            this.handleRpcResponse(context, [
              {
                publicKey: key,
                account: accountInfo,
              },
            ]);
            this.setTimeout();
          } else {
            this.handleRpcResponse(context, [
              {
                publicKey: key,
                account: accountInfo,
              },
            ]);
          }
        },
        this.commitment,
      );
      this.subscriptions.set(key.toString(), {
        listenerId,
      });
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

  async fetch(): Promise<void> {
    const accounts: ProgramAccount<AccountInfo<Buffer>>[] = [];

    if (this._fetchConfig.keys) {
      const keys: PublicKey[] = this._fetchConfig.keys.map(
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
            const key = this._fetchConfig.keys![index];
            accounts.push({
              publicKey: key,
              account: accountInfo,
            });
          }
        });
      }
    }

    if (this._fetchConfig.filters) {
      const gpaConfig: GetProgramAccountsConfig = {
        filters: this._fetchConfig.filters.map((filter) => {
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
      gpa.forEach((value) => {
        accounts.push({
          publicKey: value.pubkey,
          account: value.account,
        });
      });
    }

    const slot = await this.program.provider.connection.getSlot();
    this.handleRpcResponse({ slot }, accounts);
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
        const lastSlot = existing.account?.slot ?? 0;
        if (context.slot > lastSlot) {
          existing.account = {
            buffer: account.account.data,
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
    if (entry && entry.account) {
      return this.program.account[accountName].coder.accounts.decode(
        capitalize(accountName),
        entry.account.buffer,
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
      if (entry && entry.account) {
        const decodedAccount = this.program.account[
          accountName
        ].coder.accounts.decode(capitalize(accountName), entry.account.buffer);
        decoded.push({
          publicKey: new PublicKey(key),
          account: {
            data: decodedAccount,
            slot: entry.account.slot,
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
    for (const [key, value] of Array.from(this.subscriptions.entries())) {
      promises.push(
        this.program.provider.connection
          .removeAccountChangeListener(value.listenerId)
          .then(() => {
            keysToRemove.push(key);
          }),
      );
    }
    for (const key of keysToRemove) {
      this.subscriptions.delete(key);
    }
    this.isUnsubscribing = false;
    return Promise.all(promises);
  }
}
