use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use anchor_spl::token::{Token, TokenAccount};
use drift::cpi::accounts::Withdraw as DriftWithdraw;
use drift::instructions::optional_accounts::AccountMaps;
use drift::program::Drift;
use drift::state::user::User;

use crate::{AccountMapProvider, declare_vault_seeds};
use crate::constraints::{is_manager_for_vault, is_user_for_vault, is_user_stats_for_vault, is_vault_protocol_for_vault};
use crate::drift_cpi::{TokenTransferCPI, WithdrawCPI};
use crate::state::{Vault, VaultProtocol, VaultProtocolProvider};

pub fn protocol_withdraw<'c: 'info, 'info>(
  ctx: Context<'_, '_, 'c, 'info, ProtocolWithdraw<'info>>,
) -> Result<()> {
  let clock = &Clock::get()?;
  let mut vault = ctx.accounts.vault.load_mut()?;
  let now = clock.unix_timestamp;

  let user = ctx.accounts.drift_user.load()?;
  let spot_market_index = vault.spot_market_index;

  // backwards compatible: if last rem acct does not deserialize into [`VaultProtocol`] then it's a legacy vault.
  let vp = ctx.vault_protocol();

  let AccountMaps {
    perp_market_map,
    spot_market_map,
    mut oracle_map,
  } = ctx.load_maps(clock.slot, Some(spot_market_index), vp.is_some())?;

  let vault_equity = vault.calculate_equity(&user, &perp_market_map, &spot_market_map, &mut oracle_map)?;

  let protocol_withdraw_amount = match vp {
    None => vault.protocol_withdraw(&mut None, vault_equity, now)?,
    Some(vp) => vault.protocol_withdraw(&mut Some(vp.load_mut()?), vault_equity, now)?
  };

  drop(vault);
  drop(user);

  ctx.drift_withdraw(protocol_withdraw_amount)?;

  ctx.token_transfer(protocol_withdraw_amount)?;

  Ok(())
}

#[derive(Accounts)]
pub struct ProtocolWithdraw<'info> {
  #[account(mut,
  constraint = is_manager_for_vault(& vault, & manager) ?)]
  pub vault: AccountLoader<'info, Vault>,
  #[account(mut,
  constraint = is_vault_protocol_for_vault(& vault_protocol, & vault) ?)]
  pub vault_protocol: AccountLoader<'info, VaultProtocol>,
  pub manager: Signer<'info>,
  #[account(mut,
  seeds = [b"vault_token_account".as_ref(), vault.key().as_ref()],
  bump,)]
  pub vault_token_account: Box<Account<'info, TokenAccount>>,
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
  #[account(mut,
  token::mint = vault_token_account.mint)]
  pub drift_spot_market_vault: Box<Account<'info, TokenAccount>>,
  /// CHECK: checked in drift cpi
  pub drift_signer: AccountInfo<'info>,
  #[account(mut,
  token::authority = manager,
  token::mint = vault_token_account.mint)]
  pub user_token_account: Box<Account<'info, TokenAccount>>,
  pub drift_program: Program<'info, Drift>,
  pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawCPI for Context<'_, '_, '_, 'info, ProtocolWithdraw<'info>> {
  fn drift_withdraw(&self, amount: u64) -> Result<()> {
    declare_vault_seeds!(self.accounts.vault, seeds);
    let spot_market_index = self.accounts.vault.load()?.spot_market_index;

    let cpi_accounts = DriftWithdraw {
      state: self.accounts.drift_state.to_account_info().clone(),
      user: self.accounts.drift_user.to_account_info().clone(),
      user_stats: self.accounts.drift_user_stats.to_account_info().clone(),
      authority: self.accounts.vault.to_account_info().clone(),
      spot_market_vault: self.accounts.drift_spot_market_vault.to_account_info().clone(),
      drift_signer: self.accounts.drift_signer.to_account_info().clone(),
      user_token_account: self.accounts.vault_token_account.to_account_info().clone(),
      token_program: self.accounts.token_program.to_account_info().clone(),
    };

    let drift_program = self.accounts.drift_program.to_account_info().clone();
    let cpi_context = CpiContext::new_with_signer(drift_program, cpi_accounts, seeds).with_remaining_accounts(self.remaining_accounts.into());
    drift::cpi::withdraw(cpi_context, spot_market_index, amount, false)?;

    Ok(())
  }
}

impl<'info> TokenTransferCPI for Context<'_, '_, '_, 'info, ProtocolWithdraw<'info>> {
  fn token_transfer(&self, amount: u64) -> Result<()> {
    declare_vault_seeds!(self.accounts.vault, seeds);

    let cpi_accounts = Transfer {
      from: self.accounts.vault_token_account.to_account_info().clone(),
      to: self.accounts.user_token_account.to_account_info().clone(),
      authority: self.accounts.vault.to_account_info().clone(),
    };
    let token_program = self.accounts.token_program.to_account_info().clone();
    let cpi_context = CpiContext::new_with_signer(token_program, cpi_accounts, seeds);

    token::transfer(cpi_context, amount)?;

    Ok(())
  }
}
