import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { InstructionReturn } from "@cosmic-lab/data-source";
import { ParsedTokenBalance } from "..";

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = true,
  programId = TOKEN_PROGRAM_ID,
) {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    programId,
  );
}

/**
 * Create and initialize a new associated token account with allowOwnerOffCurve
 *
 * @param mint                     Mint for the account
 * @param owner                    Owner of the new account
 * @param allowOwnerOffCurve       Allow the owner account to be a PDA (Program Derived Address)
 * @param programId                SPL Token program 2022 account
 * @param associatedTokenProgramId SPL Associated Token program account
 *
 * @return Address of the new associated token account
 */
export function createAssociatedTokenAccount(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = true,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): { instructions: InstructionReturn; address: PublicKey } {
  const associatedToken = getAssociatedTokenAddress(
    mint,
    owner,
    allowOwnerOffCurve,
  );
  return {
    // eslint-disable-next-line require-await
    instructions: async (funder) => ({
      instruction: createAssociatedTokenAccountIdempotentInstruction(
        funder.publicKey(),
        associatedToken,
        owner,
        mint,
        programId,
        associatedTokenProgramId,
      ),
      signers: [funder],
    }),
    address: associatedToken,
  };
}

export const getParsedTokenBalancesForKey = async (
  connection: Connection,
  key: PublicKey,
  tokenProgram = TOKEN_PROGRAM_ID,
): Promise<ParsedTokenBalance[]> => {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(key, {
      programId: tokenProgram,
    });
    const result: ParsedTokenBalance[] = [];
    for (const tokenAccount of tokenAccounts.value) {
      const accountKey = tokenAccount.pubkey.toBase58();
      const { info } = tokenAccount.account.data.parsed;
      result.push({
        // amount: new BN(info.tokenAmount.amount),
        uiAmount: info.tokenAmount.uiAmount,
        tokenAccount: accountKey,
        mint: info.mint,
        owner: key.toString(),
        // decimals: info.tokenAmount.decimals,
      });
    }
    return result;
  } catch (e) {
    console.error("Failed to fetch token accounts: " + e);
    return [];
  }
};
