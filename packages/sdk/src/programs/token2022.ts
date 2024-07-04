import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createMintToInstruction,
  createTransferCheckedWithFeeInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  AsyncSigner,
  buildAndSignTransaction,
  InstructionReturn,
} from "@cosmic-lab/data-source";
import {
  formatExplorerMessageLink,
  ParsedTokenBalance,
  sendTransactionWithSnack,
} from "..";

export function getAssociatedToken2022Address(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = true,
  programId = TOKEN_2022_PROGRAM_ID,
) {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    programId,
  );
}

export async function createTransferFeeMintIxs(
  connection: Connection,
  mint: AsyncSigner,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  feeAuthority: PublicKey,
  feeBasisPoints: number,
  decimals: number,
): Promise<InstructionReturn> {
  const space = getMintLen([ExtensionType.TransferFeeConfig]);
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  // eslint-disable-next-line require-await
  return async (funder) => [
    {
      instruction: SystemProgram.createAccount({
        fromPubkey: funder.publicKey(),
        lamports,
        newAccountPubkey: mint.publicKey(),
        programId: TOKEN_2022_PROGRAM_ID,
        space,
      }),
      signers: [mint, funder],
    },
    {
      instruction: createInitializeTransferFeeConfigInstruction(
        mint.publicKey(), // Mint Account address
        feeAuthority, // Authority to update fees
        feeAuthority, // Authority to withdraw fees
        feeBasisPoints, // Basis points for transfer fee calculation
        BigInt(feeBasisPoints), // Maximum fee per transfer
        TOKEN_2022_PROGRAM_ID, // Token Extension Program ID
      ),
      signers: [mint, funder],
    },
    {
      instruction: createInitializeMintInstruction(
        mint.publicKey(),
        decimals,
        mintAuthority,
        freezeAuthority,
        TOKEN_2022_PROGRAM_ID,
      ),
      signers: [],
    },
  ];
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
export function createAssociatedToken2022Account(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = true,
  programId = TOKEN_2022_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): { instructions: InstructionReturn; address: PublicKey } {
  const associatedToken = getAssociatedToken2022Address(
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

export function mintToToken2022AccountIxs(
  mintAuthority: AsyncSigner,
  mint: PublicKey,
  tokenAccount: PublicKey,
  amount: number,
): InstructionReturn {
  // eslint-disable-next-line require-await
  return async () => ({
    instruction: createMintToInstruction(
      mint,
      tokenAccount,
      mintAuthority.publicKey(),
      amount,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    ),
    signers: [mintAuthority],
  });
}

/**
 *
 * @param connection
 * @param mint
 * @param funder
 * @param mintAuthority
 * @param feeAuthority
 * @param feeBasisPoints
 * @param decimals
 */
export async function createTransferFeeMint(
  connection: Connection,
  mint: AsyncSigner,
  funder: AsyncSigner,
  mintAuthority: PublicKey,
  feeAuthority: PublicKey,
  feeBasisPoints: number,
  decimals: number,
): Promise<void> {
  const ix = await createTransferFeeMintIxs(
    connection,
    mint,
    mintAuthority,
    null,
    feeAuthority,
    feeBasisPoints,
    decimals,
  );
  try {
    await sendTransactionWithSnack([ix], funder, connection);
  } catch (e: any) {
    if (e.message.includes("custom program error: 0x0")) {
      return;
    } else {
      const trx = await buildAndSignTransaction([ix], funder, {
        connection: connection,
        commitment: "confirmed",
      });
      console.log(formatExplorerMessageLink(trx.transaction, connection));
      console.error("Failed to create transfer fee mint:", e);
      throw e;
    }
  }
}

/**
 *
 * @param connection
 * @param mint
 * @param mintAuthority
 * @param recipient
 * @param funder
 * @param amount
 */
export async function mintTransferFeeToken(
  connection: Connection,
  mint: AsyncSigner,
  mintAuthority: AsyncSigner,
  recipient: PublicKey,
  funder: AsyncSigner,
  amount: number,
): Promise<{ recipientTokenAccount: PublicKey }> {
  const recipientTokenAccount = getAssociatedToken2022Address(
    mint.publicKey(),
    recipient,
    true,
  );
  const ixs: InstructionReturn[] = [];

  const tokensToAccount = await connection.getAccountInfo(
    recipientTokenAccount,
  );
  if (!tokensToAccount) {
    ixs.push(
      createAssociatedToken2022Account(mint.publicKey(), recipient, true)
        .instructions,
    );
  }

  try {
    ixs.push(
      mintToToken2022AccountIxs(
        mintAuthority,
        mint.publicKey(),
        recipientTokenAccount,
        amount,
      ),
    );
    await sendTransactionWithSnack(ixs, funder, connection);
    return {
      recipientTokenAccount,
    };
  } catch (e: any) {
    if (e.message.includes("custom program error: 0x0")) {
      return { recipientTokenAccount };
    } else {
      const trx = await buildAndSignTransaction(ixs, funder, {
        connection: connection,
        commitment: "confirmed",
      });
      console.log(formatExplorerMessageLink(trx.transaction, connection));
      console.error("Failed to mint tokens:", e);
      throw e;
    }
  }
}

export function transferTokenWithFee(
  mint: PublicKey,
  originSigner: AsyncSigner,
  originTokenAccount: PublicKey,
  destinationTokenAccount: PublicKey,
  amount: number,
  feeBasisPoints: number,
  decimals: number,
) {
  const fee = (BigInt(amount) * BigInt(feeBasisPoints)) / BigInt(10_000);

  return async () => ({
    instruction: createTransferCheckedWithFeeInstruction(
      originTokenAccount,
      mint,
      destinationTokenAccount,
      originSigner.publicKey(),
      BigInt(amount),
      decimals,
      fee,
    ),
    signers: [originSigner],
  });
}

/**
 * @param amount - Number of tokens to transfer multiplied by decimals of mint
 * @param feeBasisPoints - Basis points for transfer fee calculation (100 = 1%)
 */
export function calcTransferFee(
  amount: bigint,
  feeBasisPoints: bigint,
): bigint {
  return (BigInt(amount) * BigInt(feeBasisPoints)) / BigInt(10_000);
}

export function basisPointsToDecimal(feeBasisPoints: number): number {
  return feeBasisPoints / 10_000;
}

export function tokenAmountToDecimal(amount: number, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

export const getParsedTokenBalancesForKey = async (
  connection: Connection,
  key: PublicKey,
  tokenProgram = TOKEN_2022_PROGRAM_ID,
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
