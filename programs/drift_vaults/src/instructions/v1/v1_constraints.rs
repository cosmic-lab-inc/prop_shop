use anchor_lang::prelude::*;
use drift::state::spot_market::SpotMarket;

use crate::{VaultDepositor, VaultV1};

pub fn is_vault_for_vault_depositor(
  vault_depositor: &AccountLoader<VaultDepositor>,
  vault: &AccountLoader<VaultV1>,
) -> anchor_lang::Result<bool> {
  Ok(vault_depositor.load()?.vault.eq(&vault.key()))
}

pub fn is_authority_for_vault_depositor(
  vault_depositor: &AccountLoader<VaultDepositor>,
  signer: &Signer,
) -> anchor_lang::Result<bool> {
  Ok(vault_depositor.load()?.authority.eq(signer.key))
}

pub fn is_manager_for_vault(
  vault: &AccountLoader<VaultV1>,
  signer: &Signer,
) -> anchor_lang::Result<bool> {
  Ok(vault.load()?.manager.eq(signer.key))
}

pub fn is_delegate_for_vault(
  vault: &AccountLoader<VaultV1>,
  signer: &Signer,
) -> anchor_lang::Result<bool> {
  Ok(vault.load()?.delegate.eq(signer.key))
}

pub fn is_user_for_vault(
  vault_depositor: &AccountLoader<VaultV1>,
  user_key: &Pubkey,
) -> anchor_lang::Result<bool> {
  Ok(vault_depositor.load()?.user.eq(user_key))
}

pub fn is_user_stats_for_vault(
  vault_depositor: &AccountLoader<VaultV1>,
  user_stats: &AccountInfo,
) -> anchor_lang::Result<bool> {
  Ok(vault_depositor.load()?.user_stats.eq(user_stats.key))
}

pub fn is_spot_market_for_vault(
  vault: &AccountLoader<VaultV1>,
  drift_spot_market: &AccountLoader<SpotMarket>,
  market_index: u16,
) -> anchor_lang::Result<bool> {
  Ok(
    (vault.load()?.spot_market_index).eq(&drift_spot_market.load()?.market_index) && (vault.load()?.spot_market_index).eq(&market_index),
  )
}
