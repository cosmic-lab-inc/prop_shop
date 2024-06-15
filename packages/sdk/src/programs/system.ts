import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { AsyncSigner, keypairToAsyncSigner } from "@cosmic-lab/data-source";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  confirmTransactions,
  sendTransactionWithSnack,
  toInstructionReturn,
} from "..";
import { SnackInfo } from "../types";

export const airdrop = async (
  connection: Connection,
  key: PublicKey,
): Promise<SnackInfo> => {
  const txId = await connection.requestAirdrop(key, 100_000_000_000);
  await confirmTransactions(connection, [txId]);
  return {
    variant: "success",
    message: txId,
  };
};

export const initAccount = async (
  connection: Connection,
  funder: AsyncSigner,
  account: Keypair,
): Promise<SnackInfo> => {
  const rent = await connection.getMinimumBalanceForRentExemption(
    ACCOUNT_SIZE,
    "confirmed",
  );
  const ixReturn = toInstructionReturn(
    SystemProgram.createAccount({
      fromPubkey: funder.publicKey(),
      newAccountPubkey: account.publicKey,
      space: ACCOUNT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    [funder, keypairToAsyncSigner(account)],
  );
  return await sendTransactionWithSnack([ixReturn], funder, connection);
};

export const nativeTransfer = async (
  connection: Connection,
  funder: AsyncSigner,
  account: Keypair,
  lamports: number,
): Promise<SnackInfo> => {
  const accountInfo = await connection.getAccountInfo(account.publicKey);

  if (!accountInfo) {
    const rent = await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_SIZE,
      "confirmed",
    );

    const createAccountIx = toInstructionReturn(
      SystemProgram.createAccount({
        fromPubkey: funder.publicKey(),
        newAccountPubkey: account.publicKey,
        space: ACCOUNT_SIZE,
        lamports: rent,
        programId: TOKEN_PROGRAM_ID,
      }),
      [funder, keypairToAsyncSigner(account)],
    );

    const transferIx = toInstructionReturn(
      SystemProgram.transfer({
        fromPubkey: funder.publicKey(),
        toPubkey: account.publicKey,
        lamports,
      }),
      [funder],
    );
    return await sendTransactionWithSnack(
      [createAccountIx, transferIx],
      funder,
      connection,
    );
  } else {
    const transferIx = toInstructionReturn(
      SystemProgram.transfer({
        fromPubkey: funder.publicKey(),
        toPubkey: account.publicKey,
        lamports,
      }),
      [funder],
    );
    return await sendTransactionWithSnack([transferIx], funder, connection);
  }
};
