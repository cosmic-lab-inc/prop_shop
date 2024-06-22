use anchor_lang::prelude::*;

use crate::state::withdraw_request::WithdrawRequest;

pub struct VaultFee {
  pub management_fee_payment: i64,
  pub management_fee_shares: i64,
  pub protocol_fee_payment: i64,
  pub protocol_fee_shares: i64,
}

#[derive(Default, Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct VaultProtocol {
  /// The protocol, company, or entity that services the product using this vault.
  /// The protocol is not allowed to deposit into the vault but can profit share and collect annual fees just like the manager.
  pub protocol: Pubkey,
  /// The shares from profit share and annual fee unclaimed by the protocol.
  pub protocol_profit_and_fee_shares: u128,
  /// The annual fee charged on deposits by the protocol (traditional hedge funds typically charge 2% per year on assets under management).
  /// Unlike the management fee this can't be negative.
  pub protocol_fee: u64,
  /// Total withdraws for the protocol
  pub protocol_total_withdraws: u64,
  /// Total fee charged by the protocol (annual management fee + profit share).
  /// Unlike the management fee this can't be negative.
  pub protocol_total_fee: u64,
  /// Total profit share charged by the protocol
  pub protocol_total_profit_share: u64,
  pub last_protocol_withdraw_request: WithdrawRequest,
  /// Percentage the protocol charges on all profits realized by depositors: PERCENTAGE_PRECISION
  pub protocol_profit_share: u32,
  pub bump: u8,
}

impl VaultProtocol {
  pub fn get_vault_protocol_seeds<'a>(&self, vault: &'a [u8]) -> [&'a [u8]; 3] {
    [b"vault".as_ref(), vault, bytemuck::bytes_of(&self.bump)]
  }
}