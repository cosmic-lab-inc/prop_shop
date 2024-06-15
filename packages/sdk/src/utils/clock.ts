import { Connection, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { ChainClockAccountInfo, ChainClockData } from '..';

async function getSolanaClock(connection: Connection): Promise<ChainClockData | null> {
  const clockResult = await connection.getParsedAccountInfo(SYSVAR_CLOCK_PUBKEY, {
    commitment: 'processed',
  });
  if (!clockResult.value) {
    // todo: Result error type
    console.error('Error fetching Solana clock');
    return null;
  }
  const clockData = clockResult.value.data as ChainClockAccountInfo;
  return clockData.parsed?.info;
}
