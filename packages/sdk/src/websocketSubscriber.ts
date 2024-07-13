import { DataAndSlot, ResubOpts } from "@drift-labs/sdk";
import {
  AccountNamespace,
  AnchorProvider,
  Program,
  ProgramAccount,
} from "@coral-xyz/anchor";
import {
  AccountInfo,
  Commitment,
  Context,
  PublicKey,
  RpcResponseAndContext,
} from "@solana/web3.js";
import { capitalize } from "./utils";
import { DriftVaultsSubscriber } from "./types";
import { Buffer } from "buffer";
import { DriftVaults } from "@drift-labs/vaults-sdk";

interface SubscribedAccount {
  listenerId: number;
  account?: {
    buffer: Buffer;
    slot: number;
  };
}

export class WebSocketSubscriber implements DriftVaultsSubscriber {
  subscribedKeys: PublicKey[];
  accounts: Map<string, SubscribedAccount>;
  program: Program;

  resubOpts?: ResubOpts;

  commitment?: Commitment;
  isUnsubscribing = false;

  timeoutId?: NodeJS.Timeout;

  receivingData: boolean;

  public constructor(
    program: Program,
    subscribedKeys: PublicKey[],
    resubOpts?: ResubOpts,
    commitment?: Commitment,
  ) {
    this.program = program;
    this.accounts = new Map();
    this.subscribedKeys = subscribedKeys;
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
      this.accounts.set(key.toString(), {
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
    const rpcResponse: RpcResponseAndContext<(AccountInfo<Buffer> | null)[]> =
      await this.program.provider.connection.getMultipleAccountsInfoAndContext(
        this.subscribedKeys,
        (this.program.provider as AnchorProvider).opts.commitment,
      );
    const accounts = rpcResponse.value
      .map((accountInfo, index) => {
        return {
          publicKey: this.subscribedKeys[index],
          account: accountInfo,
        };
      })
      .filter(({ account }) => !!account) as ProgramAccount<
      AccountInfo<Buffer>
    >[];
    this.handleRpcResponse(rpcResponse.context, accounts);
  }

  handleRpcResponse(
    context: Context,
    accounts: ProgramAccount<AccountInfo<Buffer>>[],
  ): void {
    for (const account of accounts) {
      const key = account.publicKey.toString();
      // only update accounts that are subscribed
      if (!this.accounts.has(key)) {
        const existing = this.accounts.get(key)!;
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
    const entry = this.accounts.get(key.toString());
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
    for (const [key, account] of Array.from(this.accounts.entries())) {
      const entry = this.accounts.get(key.toString());
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
    for (const [key, value] of Array.from(this.accounts.entries())) {
      promises.push(
        this.program.provider.connection
          .removeAccountChangeListener(value.listenerId)
          .then(() => {
            keysToRemove.push(key);
          }),
      );
    }
    for (const key of keysToRemove) {
      this.accounts.delete(key);
    }
    this.isUnsubscribing = false;
    return Promise.all(promises);
  }
}
