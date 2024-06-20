use anchor_lang::prelude::*;

use crate::{error::ErrorCode, validate};
use crate::state::{VaultTrait, VaultV1};
use crate::v1_constraints::is_manager_for_vault;

pub fn update_vault_v1<'info>(
  ctx: Context<'_, '_, '_, 'info, UpdateVaultV1<'info>>,
  params: UpdateVaultV1Params,
) -> Result<()> {
  let mut vault = ctx.accounts.vault.load_mut()?;

  validate!(!vault.in_liquidation(), ErrorCode::OngoingLiquidation)?;

  if let Some(redeem_period) = params.redeem_period {
    validate!(
            redeem_period < vault.redeem_period,
            ErrorCode::InvalidVaultUpdate,
            "new redeem period must be shorter than existing redeem period"
        )?;
    vault.redeem_period = redeem_period;
  }

  if let Some(max_tokens) = params.max_tokens {
    vault.max_tokens = max_tokens;
  }

  if let Some(min_deposit_amount) = params.min_deposit_amount {
    vault.min_deposit_amount = min_deposit_amount;
  }

  if let Some(management_fee) = params.management_fee {
    validate!(
            management_fee < vault.management_fee,
            ErrorCode::InvalidVaultUpdate,
            "new management fee must be less than existing management fee"
        )?;
    vault.management_fee = management_fee;
  }

  if let Some(protocol_fee) = params.protocol_fee {
    validate!(
            protocol_fee < vault.protocol_fee,
            ErrorCode::InvalidVaultUpdate,
            "new protocol fee must be less than existing protocol fee"
        )?;
    vault.protocol_fee = protocol_fee;
  }

  if let Some(manager_profit_share) = params.manager_profit_share {
    validate!(
            manager_profit_share < vault.manager_profit_share,
            ErrorCode::InvalidVaultUpdate,
            "new manager profit share must be less than existing manager profit share"
        )?;
    vault.manager_profit_share = manager_profit_share;
  }

  if let Some(protocol_profit_share) = params.protocol_profit_share {
    validate!(
            protocol_profit_share < vault.protocol_profit_share,
            ErrorCode::InvalidVaultUpdate,
            "new protocol profit share must be less than existing protocol profit share"
        )?;
    vault.protocol_profit_share = protocol_profit_share;
  }

  if let Some(hurdle_rate) = params.hurdle_rate {
    validate!(
            hurdle_rate < vault.hurdle_rate,
            ErrorCode::InvalidVaultUpdate,
            "new hurdle rate must be less than existing hurdle rate"
        )?;
    vault.hurdle_rate = hurdle_rate;
  }

  if let Some(permissioned) = params.permissioned {
    vault.permissioned = permissioned;
  }

  drop(vault);

  Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct UpdateVaultV1Params {
  pub redeem_period: Option<i64>,
  pub max_tokens: Option<u64>,
  pub management_fee: Option<i64>,
  pub protocol_fee: Option<u64>,
  pub min_deposit_amount: Option<u64>,
  pub manager_profit_share: Option<u32>,
  pub protocol_profit_share: Option<u32>,
  pub hurdle_rate: Option<u32>,
  pub permissioned: Option<bool>,
}

#[derive(Accounts)]
pub struct UpdateVaultV1<'info> {
  #[account(mut,
  constraint = is_manager_for_vault(& vault, & manager) ?,)]
  pub vault: AccountLoader<'info, VaultV1>,
  pub manager: Signer<'info>,
}
