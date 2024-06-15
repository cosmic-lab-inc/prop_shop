import { TransactionInstruction } from "@solana/web3.js";
import { AsyncSigner, InstructionReturn } from "@cosmic-lab/data-source";

export const toInstructionReturn = (
  instruction: TransactionInstruction,
  signers: AsyncSigner[],
): InstructionReturn => {
  return async () => ({
    instruction,
    signers,
  });
};
