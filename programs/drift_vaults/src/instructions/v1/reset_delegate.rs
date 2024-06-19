use anchor_lang::prelude::*;
use drift::cpi::accounts::UpdateUser;
use drift::program::Drift;
use drift::state::user::User;

use crate::{
  declare_vault_seeds, implement_update_user_delegate_cpi, implement_update_user_reduce_only_cpi,
};
use crate::drift_cpi::{UpdateUserDelegateCPI, UpdateUserReduceOnlyCPI};
use crate::error::ErrorCode;
use crate::state::{VaultTrait, VaultV1};
use crate::v1_constraints::is_user_for_vault;
use crate::validate;

pub fn reset_delegate_v1<'info>(ctx: Context<'_, '_, '_, 'info, ResetDelegateV1<'info>>) -> Result<()> {
  let mut vault = ctx.accounts.vault.load_mut()?;

  validate!(
        vault.in_liquidation(),
        ErrorCode::Default,
        "vault not in liquidation"
    )?;

  let now = Clock::get()?.unix_timestamp;
  vault.check_can_exit_liquidation(now)?;
  vault.reset_liquidation_delegate();

  let delegate = vault.delegate;

  drop(vault);

  ctx.drift_update_user_delegate(delegate)?;
  ctx.drift_update_user_reduce_only(false)?;

  Ok(())
}

#[derive(Accounts)]
pub struct ResetDelegateV1<'info> {
  #[account(mut)]
  pub vault: AccountLoader<'info, VaultV1>,
  pub authority: Signer<'info>,
  #[account(mut,
  constraint = is_user_for_vault(& vault, & drift_user.key()) ?)]
  /// CHECK: checked in drift cpi
  pub drift_user: AccountLoader<'info, User>,
  pub drift_program: Program<'info, Drift>,
}

impl<'info> UpdateUserDelegateCPI for Context<'_, '_, '_, 'info, ResetDelegateV1<'info>> {
  fn drift_update_user_delegate(&self, delegate: Pubkey) -> Result<()> {
    implement_update_user_delegate_cpi!(self, delegate);
    Ok(())
  }
}

impl<'info> UpdateUserReduceOnlyCPI for Context<'_, '_, '_, 'info, ResetDelegateV1<'info>> {
  fn drift_update_user_reduce_only(&self, reduce_only: bool) -> Result<()> {
    implement_update_user_reduce_only_cpi!(self, reduce_only);
    Ok(())
  }
}
