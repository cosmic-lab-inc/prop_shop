use anchor_lang::prelude::*;

use instructions::*;
use state::*;

mod constants;
mod drift_cpi;
mod error;
mod instructions;
pub mod macros;
mod state;
mod tests;

declare_id!("vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR");

#[program]
pub mod drift_vaults {
  use super::*;

  pub fn initialize_vault<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializeVault<'info>>,
    params: VaultParams,
  ) -> Result<()> {
    instructions::initialize_vault(ctx, params)
  }

  pub fn update_delegate<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UpdateDelegate<'info>>,
    delegate: Pubkey,
  ) -> Result<()> {
    instructions::update_delegate(ctx, delegate)
  }

  pub fn update_margin_trading_enabled<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UpdateMarginTradingEnabled<'info>>,
    enabled: bool,
  ) -> Result<()> {
    instructions::update_margin_trading_enabled(ctx, enabled)
  }

  pub fn update_vault<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UpdateVault<'info>>,
    params: UpdateVaultParams,
  ) -> Result<()> {
    instructions::update_vault(ctx, params)
  }

  pub fn initialize_vault_depositor(ctx: Context<InitializeVaultDepositor>) -> Result<()> {
    instructions::initialize_vault_depositor(ctx)
  }

  pub fn deposit<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, Deposit<'info>>,
    amount: u64,
  ) -> Result<()> {
    instructions::deposit(ctx, amount)
  }

  pub fn request_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, RequestWithdraw<'info>>,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
  ) -> Result<()> {
    instructions::request_withdraw(ctx, withdraw_amount, withdraw_unit)
  }

  pub fn cancel_request_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CancelWithdrawRequest<'info>>,
  ) -> Result<()> {
    instructions::cancel_withdraw_request(ctx)
  }

  pub fn withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, Withdraw<'info>>,
  ) -> Result<()> {
    instructions::withdraw(ctx)
  }

  pub fn liquidate<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, Liquidate<'info>>,
  ) -> Result<()> {
    instructions::liquidate(ctx)
  }

  pub fn reset_delegate<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ResetDelegate<'info>>,
  ) -> Result<()> {
    instructions::reset_delegate(ctx)
  }

  pub fn manager_deposit<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerDeposit<'info>>,
    amount: u64,
  ) -> Result<()> {
    instructions::manager_deposit(ctx, amount)
  }

  pub fn manager_request_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerRequestWithdraw<'info>>,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
  ) -> Result<()> {
    instructions::manager_request_withdraw(ctx, withdraw_amount, withdraw_unit)
  }

  pub fn manger_cancel_withdraw_request<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerCancelWithdrawRequest<'info>>,
  ) -> Result<()> {
    instructions::manager_cancel_withdraw_request(ctx)
  }

  pub fn manager_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerWithdraw<'info>>,
  ) -> Result<()> {
    instructions::manager_withdraw(ctx)
  }

  pub fn apply_profit_share<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ApplyProfitShare<'info>>,
  ) -> Result<()> {
    instructions::apply_profit_share(ctx)
  }

  pub fn force_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ForceWithdraw<'info>>,
  ) -> Result<()> {
    instructions::force_withdraw(ctx)
  }

  pub fn initialize_insurance_fund_stake<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializeInsuranceFundStake<'info>>,
    market_index: u16,
  ) -> Result<()> {
    instructions::initialize_insurance_fund_stake(ctx, market_index)
  }


  pub fn initialize_vault_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializeVaultV1<'info>>,
    params: VaultV1Params,
  ) -> Result<()> {
    instructions::initialize_vault_v1(ctx, params)
  }

  pub fn update_delegate_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UpdateDelegateV1<'info>>,
    delegate: Pubkey,
  ) -> Result<()> {
    instructions::update_delegate_v1(ctx, delegate)
  }

  pub fn update_margin_trading_enabled_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UpdateMarginTradingEnabledV1<'info>>,
    enabled: bool,
  ) -> Result<()> {
    instructions::update_margin_trading_enabled_v1(ctx, enabled)
  }

  pub fn update_vault_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UpdateVaultV1<'info>>,
    params: UpdateVaultV1Params,
  ) -> Result<()> {
    instructions::update_vault_v1(ctx, params)
  }

  pub fn initialize_vault_depositor_v1(ctx: Context<InitializeVaultDepositorV1>) -> Result<()> {
    instructions::initialize_vault_depositor_v1(ctx)
  }

  pub fn deposit_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, DepositV1<'info>>,
    amount: u64,
  ) -> Result<()> {
    instructions::deposit_v1(ctx, amount)
  }

  pub fn request_withdraw_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, RequestWithdrawV1<'info>>,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
  ) -> Result<()> {
    instructions::request_withdraw_v1(ctx, withdraw_amount, withdraw_unit)
  }

  pub fn cancel_request_withdraw_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CancelWithdrawRequestV1<'info>>,
  ) -> Result<()> {
    instructions::cancel_withdraw_request_v1(ctx)
  }

  pub fn withdraw_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, WithdrawV1<'info>>,
  ) -> Result<()> {
    instructions::withdraw_v1(ctx)
  }

  pub fn liquidate_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, LiquidateV1<'info>>,
  ) -> Result<()> {
    instructions::liquidate_v1(ctx)
  }

  pub fn reset_delegate_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ResetDelegateV1<'info>>,
  ) -> Result<()> {
    instructions::reset_delegate_v1(ctx)
  }

  pub fn manager_deposit_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerDepositV1<'info>>,
    amount: u64,
  ) -> Result<()> {
    instructions::manager_deposit_v1(ctx, amount)
  }

  pub fn manager_request_withdraw_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerRequestWithdrawV1<'info>>,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
  ) -> Result<()> {
    instructions::manager_request_withdraw_v1(ctx, withdraw_amount, withdraw_unit)
  }

  pub fn manger_cancel_withdraw_request_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerCancelWithdrawRequestV1<'info>>,
  ) -> Result<()> {
    instructions::manager_cancel_withdraw_request_v1(ctx)
  }

  pub fn manager_withdraw_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ManagerWithdrawV1<'info>>,
  ) -> Result<()> {
    instructions::manager_withdraw_v1(ctx)
  }

  pub fn apply_profit_share_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ApplyProfitShareV1<'info>>,
  ) -> Result<()> {
    instructions::apply_profit_share_v1(ctx)
  }

  pub fn force_withdraw_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ForceWithdrawV1<'info>>,
  ) -> Result<()> {
    instructions::force_withdraw_v1(ctx)
  }

  pub fn initialize_insurance_fund_stake_v1<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializeInsuranceFundStakeV1<'info>>,
    market_index: u16,
  ) -> Result<()> {
    instructions::initialize_insurance_fund_stake_v1(ctx, market_index)
  }
}
