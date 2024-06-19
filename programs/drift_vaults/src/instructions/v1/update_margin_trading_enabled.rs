use anchor_lang::prelude::*;
use drift::cpi::accounts::UpdateUser;
use drift::program::Drift;
use drift::state::user::User;

use crate::{declare_vault_seeds, validate};
use crate::{VaultTrait, VaultV1};
use crate::drift_cpi::UpdateUserMarginTradingEnabledCPI;
use crate::error::ErrorCode;
use crate::v1_constraints::{is_manager_for_vault, is_user_for_vault};

pub fn update_margin_trading_enabled_v1<'info>(
  ctx: Context<'_, '_, '_, 'info, UpdateMarginTradingEnabledV1<'info>>,
  enabled: bool,
) -> Result<()> {
  validate!(
        !ctx.accounts.vault.load()?.in_liquidation(),
        ErrorCode::OngoingLiquidation
    )?;

  ctx.drift_update_user_margin_trading_enabled(enabled)?;

  Ok(())
}

#[derive(Accounts)]
pub struct UpdateMarginTradingEnabledV1<'info> {
  #[account(mut,
  constraint = is_manager_for_vault(& vault, & manager) ?,)]
  pub vault: AccountLoader<'info, VaultV1>,
  pub manager: Signer<'info>,
  #[account(mut,
  constraint = is_user_for_vault(& vault, & drift_user.key()) ?)]
  /// CHECK: checked in drift cpi
  pub drift_user: AccountLoader<'info, User>,
  pub drift_program: Program<'info, Drift>,
}

impl<'info> UpdateUserMarginTradingEnabledCPI for Context<'_, '_, '_, 'info, UpdateMarginTradingEnabledV1<'info>> {
  fn drift_update_user_margin_trading_enabled(&self, enabled: bool) -> Result<()> {
    declare_vault_seeds!(self.accounts.vault, seeds);

    let cpi_accounts = UpdateUser {
      user: self.accounts.drift_user.to_account_info().clone(),
      authority: self.accounts.vault.to_account_info().clone(),
    };

    let drift_program = self.accounts.drift_program.to_account_info().clone();
    let cpi_context = CpiContext::new_with_signer(drift_program, cpi_accounts, seeds).with_remaining_accounts(self.remaining_accounts.into());
    drift::cpi::update_user_margin_trading_enabled(cpi_context, 0, enabled)?;

    Ok(())
  }
}
