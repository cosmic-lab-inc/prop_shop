use anchor_lang::prelude::*;
use drift::instructions::optional_accounts::AccountMaps;
use drift::math::casting::Cast;
use drift::state::user::User;

use crate::{VaultDepositor, WithdrawUnit};
use crate::state::{VaultTrait, VaultV1, VaultVersion};
use crate::state::account_maps::AccountMapProvider;
use crate::v1_constraints::{
  is_authority_for_vault_depositor, is_user_for_vault, is_user_stats_for_vault,
};

pub fn request_withdraw_v1<'c: 'info, 'info>(
  ctx: Context<'_, '_, 'c, 'info, RequestWithdrawV1<'info>>,
  withdraw_amount: u64,
  withdraw_unit: WithdrawUnit,
) -> Result<()> {
  let clock = &Clock::get()?;
  let vault = &mut ctx.accounts.vault.load_mut()?;
  let mut vault_depositor = ctx.accounts.vault_depositor.load_mut()?;

  let user = ctx.accounts.drift_user.load()?;

  let AccountMaps {
    perp_market_map,
    spot_market_map,
    mut oracle_map,
  } = ctx.load_maps(clock.slot, None)?;

  let vault_equity = vault.calculate_equity(&user, &perp_market_map, &spot_market_map, &mut oracle_map)?;

  let vault_version = &mut VaultVersion::V1(vault);
  vault_depositor.request_withdraw(
    withdraw_amount.cast()?,
    withdraw_unit,
    vault_equity,
    vault_version,
    clock.unix_timestamp,
  )?;

  Ok(())
}

#[derive(Accounts)]
pub struct RequestWithdrawV1<'info> {
  #[account(mut)]
  pub vault: AccountLoader<'info, VaultV1>,
  #[account(mut,
  seeds = [b"vault_depositor", vault.key().as_ref(), authority.key().as_ref()],
  bump,
  constraint = is_authority_for_vault_depositor(& vault_depositor, & authority) ?,)]
  pub vault_depositor: AccountLoader<'info, VaultDepositor>,
  pub authority: Signer<'info>,
  #[account(constraint = is_user_stats_for_vault(& vault, & drift_user_stats) ?)]
  /// CHECK: checked in drift cpi
  pub drift_user_stats: AccountInfo<'info>,
  #[account(constraint = is_user_for_vault(& vault, & drift_user.key()) ?)]
  /// CHECK: checked in drift cpi
  pub drift_user: AccountLoader<'info, User>,
  /// CHECK: checked in drift cpi
  pub drift_state: AccountInfo<'info>,
}
