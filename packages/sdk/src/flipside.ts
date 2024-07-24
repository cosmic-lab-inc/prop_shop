import { Flipside } from "@flipsidecrypto/sdk";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { SettlePnlRecord } from "@drift-labs/sdk";
import { VaultPnl } from "./types";

interface AccountKey {
  pubkey: string;
  signer: boolean;
  source: string;
  writable: boolean;
}

interface SettlePnlQueryResult {
  tx_id: string;
  // '2024-07-23T06:31:40.000Z'
  block_timestamp: Date;
  log_messages: string[];
}

export class FlipsideClient {
  private client: Flipside;

  constructor(apiKey: string) {
    this.client = new Flipside(apiKey, "https://api-v2.flipsidecrypto.xyz");
  }

  public async settlePnlData(
    user: PublicKey,
    program: anchor.Program,
    daysBack: number,
  ): Promise<VaultPnl> {
    const sql = `
    select
      distinct tx_id,
      block_timestamp,
      log_messages
    from
      solana.core.fact_transactions,
      LATERAL FLATTEN(input => solana.core.fact_transactions.account_keys) keys,
      LATERAL FLATTEN(input => log_messages) logs
    where block_timestamp > CURRENT_DATE - interval '${daysBack} day'
    and succeeded
    and keys.value:pubkey::VARCHAR = '${user.toString()}'
    and logs.value = 'Program log: Instruction: SettlePnl'
    `;

    const result = await this.client.query.run({ sql: sql });
    if (result.error) {
      throw new Error(result.error as any);
    }
    if (!result.rows) {
      console.error("no rows in Flipside query result");
      return VaultPnl.fromSettlePnlRecord([]);
    }
    console.log(`${result.rows.length ?? 0} rows returned`);

    // drift program and 0.2.84 idl
    const eventName = "SettlePnlRecord";
    const eventParser = new anchor.EventParser(
      program.programId,
      new anchor.BorshCoder(program.idl),
    );

    function msToS(date: Date): number {
      return Math.floor(date.getTime() / 1000);
    }

    const timestamps = new Set();
    const txSigs = new Set();
    const events: SettlePnlRecord[] = [];
    for (const row of result.rows) {
      const data: SettlePnlQueryResult = {
        tx_id: row[0],
        block_timestamp: new Date(row[1]),
        log_messages: row[2],
      };
      if (
        !txSigs.has(data.tx_id) &&
        Math.floor(data.block_timestamp.getTime() / 1000) <= 1721845421 &&
        Math.floor(data.block_timestamp.getTime() / 1000) > 1721088000
      ) {
        const logEvents = eventParser.parseLogs(data.log_messages);
        for (const event of logEvents) {
          if (event.name === eventName) {
            const data = event.data as SettlePnlRecord;
            if (data.user.toString() === user.toString()) {
              events.push(data);
            }
          }
        }
        txSigs.add(data.tx_id);
      }
    }
    return VaultPnl.fromSettlePnlRecord(events);
  }
}
