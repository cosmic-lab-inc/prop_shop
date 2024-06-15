import { Buffer } from "buffer";
import { AccountInfo, PublicKey } from "@solana/web3.js";

export type ParsedTokenBalance = {
  /** Decimal adjusted balance */
  uiAmount: number | null;

  /** The token account for this balance */
  tokenAccount: string;

  /** The SPL token mint */
  mint: string;

  /** The account which owns this token account */
  owner: string;
};

export type ProgramAccount = {
  account: AccountInfo<Buffer>;
  pubkey: PublicKey;
};
