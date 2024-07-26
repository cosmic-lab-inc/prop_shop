import { Flipside, QueryResultSet } from "@flipsidecrypto/sdk";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { SettlePnlRecord } from "@drift-labs/sdk";
import { VaultPnl } from "./types";
import { Drift } from "./idl/drift";
import { msToSeconds } from "./utils";

const FLIPSIDE_API_ENDPOINT = "https://api-v2.flipsidecrypto.xyz";

const DAYS_BACK_DECREMENT_INTERVAL = 5;

interface SettlePnlQueryResult {
  tx_id: string;
  // '2024-07-23T06:31:40.000Z'
  block_timestamp: Date;
  log_messages: string[];
}

export class FlipsideClient {
  private client: Flipside;

  constructor(apiKey: string) {
    this.client = new Flipside(apiKey, FLIPSIDE_API_ENDPOINT);
  }

  public async settlePnlData(
    user: PublicKey,
    program: anchor.Program<Drift>,
    daysBack: number,
  ): Promise<VaultPnl> {
    const eventName = "SettlePnlRecord";
    const eventParser = new anchor.EventParser(
      program.programId,
      new anchor.BorshCoder(program.idl),
    );

    const events: SettlePnlRecord[] = [];
    const txSigs = new Set();

    let _daysBack = daysBack;

    while (_daysBack > 0) {
      // fetch one day of transactions at a time to stay below query row/time limits
      let sql: string;
      if (_daysBack > DAYS_BACK_DECREMENT_INTERVAL) {
        sql = `
          select
            distinct tx_id,
            block_timestamp,
            log_messages
          from
            solana.core.fact_transactions,
            LATERAL FLATTEN(input => solana.core.fact_transactions.account_keys) keys,
            LATERAL FLATTEN(input => log_messages) logs
          where block_timestamp > CURRENT_DATE - interval '${_daysBack} day'
          and block_timestamp < CURRENT_DATE - interval '${_daysBack - DAYS_BACK_DECREMENT_INTERVAL} day'
          and succeeded
          and keys.value:pubkey::VARCHAR = '${user.toString()}'
          and logs.value = 'Program log: Instruction: SettlePnl'
          order by block_timestamp asc
        `;
      } else {
        sql = `
          select
            distinct tx_id,
            block_timestamp,
            log_messages
          from
            solana.core.fact_transactions,
            LATERAL FLATTEN(input => solana.core.fact_transactions.account_keys) keys,
            LATERAL FLATTEN(input => log_messages) logs
          where block_timestamp > CURRENT_DATE - interval '${_daysBack} day'
          and succeeded
          and keys.value:pubkey::VARCHAR = '${user.toString()}'
          and logs.value = 'Program log: Instruction: SettlePnl'
          order by block_timestamp asc
        `;
      }

      const preQuery = Date.now();
      let result: QueryResultSet;
      try {
        result = await this.client.query.run({
          sql: sql,
        });
      } catch (error: any) {
        console.error(
          `failed query ${_daysBack - DAYS_BACK_DECREMENT_INTERVAL}-${_daysBack} days back in ${msToSeconds(Date.now() - preQuery)}s, with error: ${error} and sql: ${sql}`,
        );
        _daysBack -= DAYS_BACK_DECREMENT_INTERVAL;
        // check if error is a ServerError
        const e = error as Error;
        if (e.message.includes("502")) {
          console.warn(
            `No data for user, ${user.toString()}, returning empty array`,
          );
          return VaultPnl.fromSettlePnlRecord([]);
        } else {
          throw new Error(`failed query with error: ${e} and sql: ${sql}`);
        }
      }

      if (result.error) {
        _daysBack -= DAYS_BACK_DECREMENT_INTERVAL;
        throw new Error(
          `failed to query Flipside with error: ${result.error} and sql: ${sql}`,
        );
      }

      if (!result.rows || result.rows.length === 0) {
        console.log(
          `query returned empty rows for ${_daysBack - DAYS_BACK_DECREMENT_INTERVAL}-${_daysBack} days back`,
        );
      } else {
        for (const row of result.rows) {
          const data: SettlePnlQueryResult = {
            tx_id: row[0],
            block_timestamp: new Date(row[1]),
            log_messages: row[2],
          };
          if (!txSigs.has(data.tx_id)) {
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
        console.log(
          `queried ${result.rows?.length ?? 0} rows, ${_daysBack - DAYS_BACK_DECREMENT_INTERVAL}-${_daysBack} days back, in ${msToSeconds(
            Date.now() - preQuery,
          )}s`,
        );
      }
      _daysBack -= DAYS_BACK_DECREMENT_INTERVAL;
    }
    return VaultPnl.fromSettlePnlRecord(events);
  }
}
