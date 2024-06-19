use anchor_lang::prelude::*;
use drift::cpi::accounts::UpdateUser;
use drift::instructions::optional_accounts::AccountMaps;
use drift::program::Drift;
use drift::state::user::User;

use crate::{declare_vault_seeds, implement_update_user_delegate_cpi};
use crate::{AccountMapProvider, implement_update_user_reduce_only_cpi};
use crate::drift_cpi::{UpdateUserDelegateCPI, UpdateUserReduceOnlyCPI};
use crate::state::{VaultDepositor, VaultTrait, VaultV1, VaultVersion};
use crate::v1_constraints::{
  is_authority_for_vault_depositor, is_user_for_vault, is_user_stats_for_vault,
};

pub fn liquidate_v1<'c: 'info, 'info>(
  ctx: Context<'_, '_, 'c, 'info, LiquidateV1<'info>>,
) -> Result<()> {
  let clock = &Clock::get()?;
  let now = Clock::get()?.unix_timestamp;

  let mut user = ctx.accounts.drift_user.load_mut()?;
  let mut vault = ctx.accounts.vault.load_mut()?;
  let vault_depositor = ctx.accounts.vault_depositor.load()?;

  let AccountMaps {
    perp_market_map,
    spot_market_map,
    mut oracle_map,
  } = ctx.load_maps(clock.slot, Some(vault.spot_market_index))?;

  // 1. Check the vault depositor has waited the redeem period
  let vault_version = &mut VaultVersion::V1(&mut vault);
  vault_depositor.last_withdraw_request.check_redeem_period_finished(vault_version, now)?;
  // 2. Check that the depositor is unable to withdraw
  let _vault = vault_version.v1()?;
  let vault_equity = _vault.calculate_equity(&user, &perp_market_map, &spot_market_map, &mut oracle_map)?;
  vault_depositor.check_cant_withdraw(
    vault_version,
    vault_equity,
    &mut user,
    &perp_market_map,
    &spot_market_map,
    &mut oracle_map,
  )?;
  let vault = vault_version.v1_mut()?;
  // 3. Check that the vault is not already in liquidation for another depositor
  vault.check_delegate_available_for_liquidation(&vault_depositor, now)?;

  vault.set_liquidation_delegate(vault_depositor.authority, now);

  drop(user);
  drop(vault);

  ctx.drift_update_user_delegate(vault_depositor.authority)?;
  ctx.drift_update_user_reduce_only(true)?;

  Ok(())
}

#[derive(Accounts)]
pub struct LiquidateV1<'info> {
  #[account(mut)]
  pub vault: AccountLoader<'info, VaultV1>,
  #[account(mut,
  seeds = [b"vault_depositor", vault.key().as_ref(), authority.key().as_ref()],
  bump,
  constraint = is_authority_for_vault_depositor(& vault_depositor, & authority) ?,)]
  pub vault_depositor: AccountLoader<'info, VaultDepositor>,
  pub authority: Signer<'info>,
  #[account(mut,
  constraint = is_user_stats_for_vault(& vault, & drift_user_stats) ?)]
  /// CHECK: checked in drift cpi
  pub drift_user_stats: AccountInfo<'info>,
  #[account(mut,
  constraint = is_user_for_vault(& vault, & drift_user.key()) ?)]
  /// CHECK: checked in drift cpi
  pub drift_user: AccountLoader<'info, User>,
  /// CHECK: checked in drift cpi
  pub drift_state: AccountInfo<'info>,
  pub drift_program: Program<'info, Drift>,
}

impl<'info> UpdateUserDelegateCPI for Context<'_, '_, '_, 'info, LiquidateV1<'info>> {
  fn drift_update_user_delegate(&self, delegate: Pubkey) -> Result<()> {
    implement_update_user_delegate_cpi!(self, delegate);
    Ok(())
  }
}

impl<'info> UpdateUserReduceOnlyCPI for Context<'_, '_, '_, 'info, LiquidateV1<'info>> {
  fn drift_update_user_reduce_only(&self, reduce_only: bool) -> Result<()> {
    implement_update_user_reduce_only_cpi!(self, reduce_only);
    Ok(())
  }
}
