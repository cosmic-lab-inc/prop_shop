use anchor_lang::prelude::*;

use crate::{Size, validate, Vault, VaultDepositor};
use crate::error::ErrorCode;
use crate::state::VaultV1;

pub fn initialize_vault_depositor_v1(ctx: Context<InitializeVaultDepositorV1>) -> Result<()> {
  let mut vault_depositor = ctx.accounts.vault_depositor.load_init()?;
  vault_depositor.vault = ctx.accounts.vault.key();
  vault_depositor.pubkey = ctx.accounts.vault_depositor.key();
  vault_depositor.authority = *ctx.accounts.authority.key;

  let vault = ctx.accounts.vault.load()?;
  if vault.permissioned {
    validate!(
            vault.manager == *ctx.accounts.payer.key,
            ErrorCode::PermissionedVault,
            "Vault depositor can only be created by vault manager"
        )?;
  } else {
    validate!(
            vault_depositor.authority == *ctx.accounts.payer.key,
            ErrorCode::Default,
            "Vault depositor authority must pay to create account"
        )?;
  }

  Ok(())
}

#[derive(Accounts)]
pub struct InitializeVaultDepositorV1<'info> {
  pub vault: AccountLoader<'info, VaultV1>,
  #[account(init,
  seeds = [b"vault_depositor", vault.key().as_ref(), authority.key().as_ref()],
  space = VaultDepositor::SIZE,
  bump,
  payer = payer)]
  pub vault_depositor: AccountLoader<'info, VaultDepositor>,
  /// CHECK: dont need to sign if vault is permissioned
  pub authority: AccountInfo<'info>,
  #[account(mut)]
  pub payer: Signer<'info>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
}
