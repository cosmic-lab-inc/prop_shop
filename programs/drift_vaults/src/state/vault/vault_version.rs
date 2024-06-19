use anchor_lang::prelude::{Pubkey, Result};
use drift::state::oracle_map::OracleMap;
use drift::state::perp_market_map::PerpMarketMap;
use drift::state::spot_market_map::SpotMarketMap;
use drift::state::user::User;

use crate::error::{ErrorCode, VaultResult};
use crate::state::{Vault, VaultDepositor, VaultV1, WithdrawUnit};

pub enum VaultVersion<'a> {
  Legacy(&'a mut Vault),
  V1(&'a mut VaultV1),
}

impl<'a> VaultVersion<'a> {
  pub fn legacy(&self) -> VaultResult<&Vault> {
    match self {
      VaultVersion::Legacy(vault) => Ok(vault),
      VaultVersion::V1(_) => Err(ErrorCode::InvalidVaultVersion),
    }
  }

  pub fn legacy_mut(&mut self) -> VaultResult<&mut Vault> {
    match self {
      VaultVersion::Legacy(vault) => Ok(vault),
      VaultVersion::V1(_) => Err(ErrorCode::InvalidVaultVersion),
    }
  }

  pub fn v1(&self) -> VaultResult<&VaultV1> {
    match self {
      VaultVersion::Legacy(_) => Err(ErrorCode::InvalidVaultVersion),
      VaultVersion::V1(vault) => Ok(vault),
    }
  }

  pub fn v1_mut(&mut self) -> VaultResult<&mut VaultV1> {
    match self {
      VaultVersion::Legacy(_) => Err(ErrorCode::InvalidVaultVersion),
      VaultVersion::V1(vault) => Ok(vault),
    }
  }
}

pub struct VaultFee {
  pub management_fee_payment: i64,
  pub management_fee_shares: i64,
  pub protocol_fee_payment: i64,
  pub protocol_fee_shares: i64,
}

pub trait VaultTrait {
  fn shares_base(&self) -> u32;
  fn user_shares(&self) -> u128;
  fn total_shares(&self) -> u128;
  fn redeem_period(&self) -> i64;
  fn max_tokens(&self) -> u64;
  fn min_deposit_amount(&self) -> u64;
  fn total_deposits(&self) -> u64;
  fn net_deposits(&self) -> i64;
  fn liquidation_delegate(&self) -> Pubkey;
  fn spot_market_index(&self) -> u16;
  fn last_fee_update_ts(&self) -> i64;
  fn manager_total_deposits(&self) -> u64;
  fn manager_total_withdraws(&self) -> u64;

  fn get_vault_signer_seeds<'b>(&self, name: &'b [u8], bump: &'b u8) -> [&'b [u8]; 3];

  fn apply_fee(&mut self, vault_equity: u64, now: i64) -> Result<VaultFee>;

  fn get_manager_shares(&self) -> VaultResult<u128>;

  fn get_protocol_shares(&self) -> VaultResult<u128>;

  fn get_profit_share(&self) -> VaultResult<u32>;

  fn apply_rebase(&mut self, vault_equity: u64) -> Result<()>;

  fn calculate_equity(
    &self,
    user: &User,
    perp_market_map: &PerpMarketMap,
    spot_market_map: &SpotMarketMap,
    oracle_map: &mut OracleMap,
  ) -> VaultResult<u64>;

  fn manager_deposit(&mut self, amount: u64, vault_equity: u64, now: i64) -> Result<()>;

  fn check_delegate_available_for_liquidation(
    &self,
    vault_depositor: &VaultDepositor,
    now: i64,
  ) -> VaultResult;

  fn manager_request_withdraw(
    &mut self,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
    vault_equity: u64,
    now: i64,
  ) -> Result<()>;

  fn manager_cancel_withdraw_request(
    &mut self,
    vault_equity: u64,
    now: i64,
  ) -> Result<()>;

  fn manager_withdraw(&mut self, vault_equity: u64, now: i64) -> Result<u64>;

  fn in_liquidation(&self) -> bool;

  fn check_can_exit_liquidation(&self, now: i64) -> VaultResult;

  fn set_liquidation_delegate(&mut self, liquidation_delegate: Pubkey, now: i64);

  fn reset_liquidation_delegate(&mut self);

  fn protocol_request_withdraw(
    &mut self,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
    vault_equity: u64,
    now: i64,
  ) -> Result<()>;

  fn protocol_cancel_withdraw_request(
    &mut self,
    vault_equity: u64,
    now: i64,
  ) -> Result<()>;

  fn protocol_withdraw(&mut self, vault_equity: u64, now: i64) -> Result<u64>;

  fn profit_share(&self) -> u32;
}

impl<'a> VaultTrait for VaultVersion<'a> {
  fn shares_base(&self) -> u32 {
    match self {
      VaultVersion::Legacy(vault) => vault.shares_base,
      VaultVersion::V1(vault) => vault.shares_base,
    }
  }

  fn user_shares(&self) -> u128 {
    match self {
      VaultVersion::Legacy(vault) => vault.user_shares,
      VaultVersion::V1(vault) => vault.user_shares,
    }
  }

  fn total_shares(&self) -> u128 {
    match self {
      VaultVersion::Legacy(vault) => vault.total_shares,
      VaultVersion::V1(vault) => vault.total_shares,
    }
  }

  fn redeem_period(&self) -> i64 {
    match self {
      VaultVersion::Legacy(vault) => vault.redeem_period,
      VaultVersion::V1(vault) => vault.redeem_period,
    }
  }

  fn max_tokens(&self) -> u64 {
    match self {
      VaultVersion::Legacy(vault) => vault.max_tokens,
      VaultVersion::V1(vault) => vault.max_tokens,
    }
  }

  fn min_deposit_amount(&self) -> u64 {
    match self {
      VaultVersion::Legacy(vault) => vault.min_deposit_amount,
      VaultVersion::V1(vault) => vault.min_deposit_amount,
    }
  }

  fn total_deposits(&self) -> u64 {
    match self {
      VaultVersion::Legacy(vault) => vault.total_deposits,
      VaultVersion::V1(vault) => vault.total_deposits,
    }
  }

  fn net_deposits(&self) -> i64 {
    match self {
      VaultVersion::Legacy(vault) => vault.net_deposits,
      VaultVersion::V1(vault) => vault.net_deposits,
    }
  }

  fn liquidation_delegate(&self) -> Pubkey {
    match self {
      VaultVersion::Legacy(vault) => vault.liquidation_delegate,
      VaultVersion::V1(vault) => vault.liquidation_delegate,
    }
  }

  fn spot_market_index(&self) -> u16 {
    match self {
      VaultVersion::Legacy(vault) => vault.spot_market_index,
      VaultVersion::V1(vault) => vault.spot_market_index,
    }
  }

  fn last_fee_update_ts(&self) -> i64 {
    match self {
      VaultVersion::Legacy(vault) => vault.last_fee_update_ts,
      VaultVersion::V1(vault) => vault.last_fee_update_ts,
    }
  }

  fn manager_total_deposits(&self) -> u64 {
    match self {
      VaultVersion::Legacy(vault) => vault.manager_total_deposits,
      VaultVersion::V1(vault) => vault.manager_total_deposits,
    }
  }

  fn manager_total_withdraws(&self) -> u64 {
    match self {
      VaultVersion::Legacy(vault) => vault.manager_total_withdraws,
      VaultVersion::V1(vault) => vault.manager_total_withdraws,
    }
  }

  fn get_vault_signer_seeds<'b>(&self, name: &'b [u8], bump: &'b u8) -> [&'b [u8]; 3] {
    match self {
      VaultVersion::Legacy(_) => self.get_vault_signer_seeds(name, bump),
      VaultVersion::V1(_) => self.get_vault_signer_seeds(name, bump)
    }
  }

  fn apply_fee(&mut self, vault_equity: u64, now: i64) -> Result<VaultFee> {
    match self {
      VaultVersion::Legacy(vault) => vault.apply_fee(vault_equity, now),
      VaultVersion::V1(vault) => vault.apply_fee(vault_equity, now),
    }
  }

  fn get_manager_shares(&self) -> VaultResult<u128> {
    match self {
      VaultVersion::Legacy(vault) => vault.get_manager_shares(),
      VaultVersion::V1(vault) => vault.get_manager_shares(),
    }
  }

  fn get_protocol_shares(&self) -> VaultResult<u128> {
    match self {
      VaultVersion::Legacy(vault) => vault.get_protocol_shares(),
      VaultVersion::V1(vault) => vault.get_protocol_shares(),
    }
  }

  fn get_profit_share(&self) -> VaultResult<u32> {
    match self {
      VaultVersion::Legacy(vault) => vault.get_profit_share(),
      VaultVersion::V1(vault) => vault.get_profit_share(),
    }
  }

  fn apply_rebase(&mut self, vault_equity: u64) -> Result<()> {
    match self {
      VaultVersion::Legacy(vault) => vault.apply_rebase(vault_equity),
      VaultVersion::V1(vault) => vault.apply_rebase(vault_equity),
    }
  }

  fn calculate_equity(
    &self,
    user: &User,
    perp_market_map: &PerpMarketMap,
    spot_market_map: &SpotMarketMap,
    oracle_map: &mut OracleMap,
  ) -> VaultResult<u64> {
    match self {
      VaultVersion::Legacy(vault) => vault.calculate_equity(user, perp_market_map, spot_market_map, oracle_map),
      VaultVersion::V1(vault) => vault.calculate_equity(user, perp_market_map, spot_market_map, oracle_map),
    }
  }

  fn manager_deposit(&mut self, amount: u64, vault_equity: u64, now: i64) -> Result<()> {
    match self {
      VaultVersion::Legacy(vault) => vault.manager_deposit(amount, vault_equity, now),
      VaultVersion::V1(vault) => vault.manager_deposit(amount, vault_equity, now),
    }
  }

  fn check_delegate_available_for_liquidation(
    &self,
    vault_depositor: &VaultDepositor,
    now: i64,
  ) -> VaultResult {
    match self {
      VaultVersion::Legacy(vault) => vault.check_delegate_available_for_liquidation(vault_depositor, now),
      VaultVersion::V1(vault) => vault.check_delegate_available_for_liquidation(vault_depositor, now),
    }
  }

  fn manager_request_withdraw(
    &mut self,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
    vault_equity: u64,
    now: i64,
  ) -> Result<()> {
    match self {
      VaultVersion::Legacy(vault) => vault.manager_request_withdraw(withdraw_amount, withdraw_unit, vault_equity, now),
      VaultVersion::V1(vault) => vault.manager_request_withdraw(withdraw_amount, withdraw_unit, vault_equity, now),
    }
  }

  fn manager_cancel_withdraw_request(
    &mut self,
    vault_equity: u64,
    now: i64,
  ) -> Result<()> {
    match self {
      VaultVersion::Legacy(vault) => vault.manager_cancel_withdraw_request(vault_equity, now),
      VaultVersion::V1(vault) => vault.manager_cancel_withdraw_request(vault_equity, now),
    }
  }

  fn manager_withdraw(&mut self, vault_equity: u64, now: i64) -> Result<u64> {
    match self {
      VaultVersion::Legacy(vault) => vault.manager_withdraw(vault_equity, now),
      VaultVersion::V1(vault) => vault.manager_withdraw(vault_equity, now),
    }
  }

  fn in_liquidation(&self) -> bool {
    match self {
      VaultVersion::Legacy(vault) => vault.in_liquidation(),
      VaultVersion::V1(vault) => vault.in_liquidation(),
    }
  }

  fn check_can_exit_liquidation(&self, now: i64) -> VaultResult {
    match self {
      VaultVersion::Legacy(vault) => vault.check_can_exit_liquidation(now),
      VaultVersion::V1(vault) => vault.check_can_exit_liquidation(now),
    }
  }

  fn set_liquidation_delegate(&mut self, liquidation_delegate: Pubkey, now: i64) {
    match self {
      VaultVersion::Legacy(vault) => vault.set_liquidation_delegate(liquidation_delegate, now),
      VaultVersion::V1(vault) => vault.set_liquidation_delegate(liquidation_delegate, now),
    }
  }

  fn reset_liquidation_delegate(&mut self) {
    match self {
      VaultVersion::Legacy(vault) => vault.reset_liquidation_delegate(),
      VaultVersion::V1(vault) => vault.reset_liquidation_delegate(),
    }
  }

  fn protocol_request_withdraw(
    &mut self,
    withdraw_amount: u64,
    withdraw_unit: WithdrawUnit,
    vault_equity: u64,
    now: i64,
  ) -> Result<()> {
    match self {
      VaultVersion::Legacy(vault) => vault.protocol_request_withdraw(withdraw_amount, withdraw_unit, vault_equity, now),
      VaultVersion::V1(vault) => vault.protocol_request_withdraw(withdraw_amount, withdraw_unit, vault_equity, now),
    }
  }

  fn protocol_cancel_withdraw_request(
    &mut self,
    vault_equity: u64,
    now: i64,
  ) -> Result<()> {
    match self {
      VaultVersion::Legacy(vault) => vault.protocol_cancel_withdraw_request(vault_equity, now),
      VaultVersion::V1(vault) => vault.protocol_cancel_withdraw_request(vault_equity, now),
    }
  }

  fn protocol_withdraw(&mut self, vault_equity: u64, now: i64) -> Result<u64> {
    match self {
      VaultVersion::Legacy(vault) => vault.protocol_withdraw(vault_equity, now),
      VaultVersion::V1(vault) => vault.protocol_withdraw(vault_equity, now),
    }
  }

  fn profit_share(&self) -> u32 {
    match self {
      VaultVersion::Legacy(vault) => vault.profit_share(),
      VaultVersion::V1(vault) => vault.profit_share(),
    }
  }
}