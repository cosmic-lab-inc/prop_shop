import { Flipside } from "@flipsidecrypto/sdk";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { SettlePnlRecord } from "@drift-labs/sdk";

interface AccountKey {
  pubkey: string;
  signer: boolean;
  source: string;
  writable: boolean;
}

interface SettlePnlQueryResult {
  // '2024-07-23T06:31:40.000Z'
  // block_timestamp: string;
  // signer: string;
  // account_keys: AccountKey[];
  log_messages: string[];
}

export class FlipsideClient {
  private client: Flipside;

  constructor(apiKey: string) {
    this.client = new Flipside(apiKey, "https://api-v2.flipsidecrypto.xyz");
  }

  public async settlePnlEvents(
    user: PublicKey,
    program: anchor.Program,
    daysBack: number,
  ): Promise<SettlePnlRecord[]> {
    const sql = `
    select
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
      return [];
    }
    console.log(`${result.rows.length ?? 0} rows returned`);
    const queryRows: SettlePnlQueryResult[] = [];
    for (const row of result.rows) {
      // this is an array of program logs that would look like:
      // Program dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH invoke [1]`
      // Program logged: "Instruction: SettlePnl"
      // Program data: OURpGnfG1Vk/96BmAAAAABdnKgGb9/VjbEywZreBEusvhrkFri+0W0tw5TWlZNPjAADVAqgcAwAAAAAAAAAAAAAAAJXHd5PP//+utAa5kwgAAGeurvVVCAAAcLKOCgAAAAAA
      const data: SettlePnlQueryResult = {
        log_messages: row[0],
      };
      queryRows.push(data);
    }

    // drift program and 0.2.84 idl
    const eventName = "SettlePnlRecord";
    const eventParser = new anchor.EventParser(
      program.programId,
      new anchor.BorshCoder(program.idl),
    );
    const logs = queryRows.map((r) => r.log_messages).flat();
    console.log(`${logs.length} logs`);

    const logEvents = eventParser.parseLogs(logs);
    const events: SettlePnlRecord[] = [];
    for (const event of logEvents) {
      if (event.name.includes(eventName)) {
        const data = event.data as SettlePnlRecord;
        if (data.user.toString() === user.toString()) {
          events.push(data);
        }
      }
    }
    return events;
  }
}
