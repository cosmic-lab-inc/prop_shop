use anchor_lang::prelude::*;
use anchor_lang::prelude::{AccountLoader, Context};

use crate::state::Size;
use crate::state::withdraw_request::WithdrawRequest;

pub struct VaultFee {
  pub management_fee_payment: i64,
  pub management_fee_shares: i64,
  pub protocol_fee_payment: i64,
  pub protocol_fee_shares: i64,
}

#[account(zero_copy(unsafe))]
#[derive(Default, Eq, PartialEq, Debug)]
#[repr(C)]
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
  /// [`VaultProtocol`] is 117 bytes with padding to 120 bytes to make it a multiple of 8.
  pub padding: [u8; 3],
}

impl Size for VaultProtocol {
  const SIZE: usize = 120 + 8;
}
// const_assert_eq!(VaultProtocol::SIZE, std::mem::size_of::<VaultProtocol>() + 8);

impl VaultProtocol {
  pub fn get_vault_protocol_seeds<'a>(&self, vault: &'a [u8], bump: &'a u8) -> [&'a [u8]; 3] {
    [b"vault_protocol".as_ref(), vault, bytemuck::bytes_of(bump)]
  }
}

pub trait VaultProtocolProvider<'a> {
  fn vault_protocol(&self) -> Option<AccountLoader<'a, VaultProtocol>>;
}

impl<'a: 'info, 'info, T: anchor_lang::Bumps> VaultProtocolProvider<'a> for Context<'_, '_, 'a, 'info, T> {
  fn vault_protocol(&self) -> Option<AccountLoader<'a, VaultProtocol>> {
    let acct = match self.remaining_accounts.last() {
      Some(acct) => acct,
      None => return None,
    };
    let vp_loader = match AccountLoader::<'a, VaultProtocol>::try_from(acct) {
      Ok(vp_loader) => vp_loader,
      Err(_) => return None,
    };
    Some(vp_loader)
  }
}