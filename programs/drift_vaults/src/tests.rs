#[cfg(test)]
mod vault_fcn {
  use anchor_lang::prelude::Pubkey;
  use drift::math::constants::{ONE_YEAR, QUOTE_PRECISION_U64};
  use drift::math::insurance::if_shares_to_vault_amount as depositor_shares_to_vault_amount;

  use crate::{Vault, VaultDepositor, WithdrawUnit};
  use crate::state::{VaultTrait, VaultVersion};

  #[test]
  fn test_manager_withdraw() {
    let now = 0;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 1000; // 10 bps
    vault_version.legacy_mut().unwrap().redeem_period = 60;

    let mut vault_equity = 0;
    let amount = 100_000_000; // $100
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;
    vault_equity -= 1;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    assert_eq!(vault_version.total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_withdraws(), 0);

    vault_version.manager_request_withdraw(amount - 1, WithdrawUnit::Token, vault_equity, now).unwrap();

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    assert_eq!(vault_version.total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_withdraws(), 0);

    let err = vault_version.manager_withdraw(vault_equity, now + 50).is_err();
    assert!(err);

    let withdraw = vault_version.manager_withdraw(vault_equity, now + 60).unwrap();
    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_withdraws(), 99999999);
    assert_eq!(withdraw, 99999999);
  }

  #[test]
  fn test_smol_management_fee() {
    let now = 0;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 1000; // 10 bps

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.last_fee_update_ts(), 0);
    vault_equity += amount;

    let user_eq_before = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(user_eq_before, 100000000);

    vault_version.apply_fee(vault_equity, now + ONE_YEAR as i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200200200);

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 99900000);

    assert_eq!(vault_version.last_fee_update_ts(), now + ONE_YEAR as i64);
  }

  #[test]
  fn test_excessive_management_fee() {
    let now = 1000;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 1000000;
    vault_version.legacy_mut().unwrap().last_fee_update_ts = 0;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.shares_base(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 1000);
    vault_equity += amount;

    vault_version.apply_fee(vault_equity, now + ONE_YEAR as i64).unwrap();
    assert_eq!(vault_version.user_shares(), 10);
    assert_eq!(vault_version.total_shares(), 2000000000);
    assert_eq!(vault_version.shares_base(), 7);

    let vd_amount_left = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(vd_amount_left, 1);
    assert_eq!(vault_version.last_fee_update_ts(), now + ONE_YEAR as i64);
  }

  #[test]
  fn test_management_fee_high_frequency() {
    // asymptotic nature of calling -100% annualized on shorter time scale
    let mut now = 0;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 1000000; // 100%
    vault_version.legacy_mut().unwrap().last_fee_update_ts = 0;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.shares_base(), 0);
    // assert_eq!(vault_version.last_fee_update_ts(, 1000);
    vault_equity += amount;

    while now < ONE_YEAR as i64 {
      vault_version.apply_fee(vault_equity, now).unwrap();
      now += 60 * 60 * 24 * 7; // every week
    }
    vault_version.apply_fee(vault_equity, now).unwrap();

    let vd_amount_left = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(vd_amount_left, 35832760); // ~$35
    assert_eq!(vault_version.last_fee_update_ts(), now);
  }

  #[test]
  fn test_manager_alone_deposit_withdraw() {
    let mut now = 123456789;
    let mut _vault = Vault::default();
    let vault_version = &mut VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 100; // .01%
    vault_version.legacy_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 100000000);

    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount, withdrew);
    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 0);

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 0);
  }

  #[test]
  fn test_negative_management_fee() {
    let now = 0;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = -2_147_483_648; // -214700% annualized (manager pays 24% hourly, .4% per minute)

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.last_fee_update_ts(), 0);
    vault_equity += amount;

    let user_eq_before = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(user_eq_before, 100000000);

    // one second since inception
    vault_version.apply_fee(vault_equity, now + 1_i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 199986200);

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 100006900); // up half a cent

    // one minute since inception
    vault_version.apply_fee(vault_equity, now + 60_i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 199185855);

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 100408736); // up 40 cents

    // one year since inception
    vault_version.apply_fee(vault_equity, now + ONE_YEAR as i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 100000000);

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 200000000); // up $100

    assert_eq!(vault_version.last_fee_update_ts(), now + ONE_YEAR as i64);
  }

  #[test]
  fn test_negative_management_fee_manager_alone() {
    let mut now = 0;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = -2_147_483_648; // -214700% annualized (manager pays 24% hourly, .4% per minute)
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    now += 100000;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), amount as u128);
    assert_eq!(vault_version.last_fee_update_ts(), now);
    vault_equity += amount;

    now += 100000;
    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();
    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(withdrew, amount);
  }

  #[test]
  fn test_manager_deposit_withdraw_with_user_flat() {
    let mut now = 123456789;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 0;
    vault_version.legacy_mut().unwrap().profit_share = 150_000; // 15%

    vault_version.legacy_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    vd.deposit(amount * 20, vault_equity, &mut vault_version, now).unwrap(); // new user deposits $2000
    now += 60 * 60;
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000 + 100000000);
    vault_equity += amount * 20;

    now += 60 * 60 * 24; // 1 day later

    vd.apply_profit_share(vault_equity, &mut vault_version).unwrap();
    vault_version.apply_fee(vault_equity, now).unwrap();

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 100000000);
    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount, withdrew);
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000);

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 0);
  }

  #[test]
  fn test_manager_deposit_withdraw_with_user_manager_fee_loss() {
    let mut now = 123456789;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 100; // .01%
    vault_version.legacy_mut().unwrap().profit_share = 150000; // 15%

    vault_version.legacy_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    vd.deposit(amount * 20, vault_equity, &mut vault_version, now).unwrap(); // new user deposits $2000
    now += 60 * 60;
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000 + 100000000);
    vault_equity += amount * 20;

    let mut cnt = 0;
    while (vault_version.total_shares() == 2000000000 + 100000000) && cnt < 400 {
      now += 60 * 60 * 24; // 1 day later

      vd.apply_profit_share(vault_equity, &mut vault_version).unwrap();
      vault_version.apply_fee(vault_equity, now).unwrap();
      // crate::msg!("vault last ts: {} vs {}", vault.last_fee_update_ts, now);
      cnt += 1;
    }

    assert_eq!(cnt, 4); // 4 days

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 100001999);
    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount, withdrew);
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000002000);
    vault_equity -= withdrew;

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 1999); // gainz

    let vd_amount = depositor_shares_to_vault_amount(
      vd.checked_vault_shares(&vault_version).unwrap(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();
    assert_eq!(vd_amount, 1999998000); // loss

    assert_eq!(vd_amount + vault_manager_amount_after, vault_equity - 1);
  }

  #[test]
  fn test_manager_deposit_withdraw_with_user_gain() {
    let mut now = 123456789;
    let mut _vault = Vault::default();
    let mut vault_version = VaultVersion::Legacy(&mut _vault);
    vault_version.legacy_mut().unwrap().management_fee = 100; // .01%
    vault_version.legacy_mut().unwrap().profit_share = 150000; // 15%

    vault_version.legacy_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    vd.deposit(amount * 20, vault_equity, &mut vault_version, now).unwrap(); // new user deposits $2000
    now += 60 * 60;
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000 + 100000000);
    vault_equity += amount * 20;

    // up 50%
    vault_equity *= 3;
    vault_equity /= 2;

    assert_eq!(vault_equity, 3_150_000_000);

    let mut cnt = 0;
    while (vault_version.total_shares() == 2000000000 + 100000000) && cnt < 400 {
      now += 60 * 60 * 24; // 1 day later

      vd.apply_profit_share(vault_equity, &mut vault_version).unwrap();
      vault_version.apply_fee(vault_equity, now).unwrap();
      // crate::msg!("vault last ts: {} vs {}", vault.last_fee_update_ts, now);
      cnt += 1;
    }

    assert_eq!(cnt, 4); // 4 days
    assert_eq!(
      vd.cumulative_profit_share_amount,
      (1000 * QUOTE_PRECISION_U64) as i64
    );
    assert_eq!(vd.net_deposits, (2000 * QUOTE_PRECISION_U64) as i64);

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 300002849); //$300??

    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();
    assert_eq!(amount, vault_version.legacy_mut().unwrap().last_manager_withdraw_request.value);

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount - 1, withdrew); // todo: slight round out of favor
    assert_eq!(vault_version.user_shares(), 1900000000);
    assert_eq!(vault_version.total_shares(), 2033335367);
    vault_equity -= withdrew;

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 200_002_850); // gainz

    let vd_amount = depositor_shares_to_vault_amount(
      vd.checked_vault_shares(&vault_version).unwrap(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();
    assert_eq!(vd_amount, 2_849_997_150); // gainz

    assert_eq!(vd_amount + vault_manager_amount_after, vault_equity - 1);
  }
}


// todo
#[cfg(test)]
mod vault_v1_fcn {
  use anchor_lang::prelude::Pubkey;
  use drift::math::constants::{ONE_YEAR, QUOTE_PRECISION_U64};
  use drift::math::insurance::if_shares_to_vault_amount as depositor_shares_to_vault_amount;

  use crate::{VaultDepositor, WithdrawUnit};
  use crate::state::{VaultTrait, VaultV1, VaultVersion};

  #[test]
  fn test_manager_withdraw_v1() {
    let now = 0;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = 1000; // 10 bps
    vault_version.v1_mut().unwrap().protocol_fee = 500; // 5 bps
    vault_version.v1_mut().unwrap().redeem_period = 60;

    let mut vault_equity = 0;
    let amount = 100_000_000; // $100
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;
    vault_equity -= 1;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    assert_eq!(vault_version.total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_withdraws(), 0);

    vault_version.manager_request_withdraw(amount - 1, WithdrawUnit::Token, vault_equity, now).unwrap();

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    assert_eq!(vault_version.total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_withdraws(), 0);

    let err = vault_version.manager_withdraw(vault_equity, now + 50).is_err();
    assert!(err);

    let withdraw = vault_version.manager_withdraw(vault_equity, now + 60).unwrap();
    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_deposits(), 100000000);
    assert_eq!(vault_version.manager_total_withdraws(), 99999999);
    assert_eq!(withdraw, 99999999);
  }

  #[test]
  fn test_smol_management_fee_v1() {
    let now = 0;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = 1000; // 10 bps
    vault_version.v1_mut().unwrap().protocol_fee = 500; // 5 bps

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.last_fee_update_ts(), 0);
    vault_equity += amount;

    let user_eq_before = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(user_eq_before, 100000000);

    vault_version.apply_fee(vault_equity, now + ONE_YEAR as i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200300400);
    println!("total shares: {}", vault_version.total_shares());
    println!("manager shares: {}", vault_version.get_manager_shares().unwrap());
    println!("protocol shares: {}", vault_version.get_protocol_shares().unwrap());

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 99850025);

    assert_eq!(vault_version.last_fee_update_ts(), now + ONE_YEAR as i64);
  }

  #[test]
  fn test_excessive_management_fee_v1() {
    let now = 1000;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    // vault_version.v1_mut().unwrap().management_fee = 600_000;
    // vault_version.v1_mut().unwrap().protocol_fee = 400_000;
    vault_version.v1_mut().unwrap().management_fee = 1_000_000;
    vault_version.v1_mut().unwrap().last_fee_update_ts = 0;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.shares_base(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 1000);
    vault_equity += amount;

    vault_version.apply_fee(vault_equity, now + ONE_YEAR as i64).unwrap();
    assert_eq!(vault_version.user_shares(), 10);
    assert_eq!(vault_version.total_shares(), 2000000000);
    assert_eq!(vault_version.shares_base(), 7);

    let vd_amount_left = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(vd_amount_left, 1);
    assert_eq!(vault_version.last_fee_update_ts(), now + ONE_YEAR as i64);
  }

  #[test]
  fn test_management_fee_high_frequency_v1() {
    // asymptotic nature of calling -100% annualized on shorter time scale
    let mut now = 0;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = 1000000; // 100%
    vault_version.v1_mut().unwrap().last_fee_update_ts = 0;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.shares_base(), 0);
    // assert_eq!(vault_version.last_fee_update_ts(, 1000);
    vault_equity += amount;

    while now < ONE_YEAR as i64 {
      vault_version.apply_fee(vault_equity, now).unwrap();
      now += 60 * 60 * 24 * 7; // every week
    }
    vault_version.apply_fee(vault_equity, now).unwrap();

    let vd_amount_left = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(vd_amount_left, 35832760); // ~$35
    assert_eq!(vault_version.last_fee_update_ts(), now);
  }

  #[test]
  fn test_manager_alone_deposit_withdraw_v1() {
    let mut now = 123456789;
    let mut _vault = VaultV1::default();
    let vault_version = &mut VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = 100; // .01%
    vault_version.v1_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 100000000);

    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount, withdrew);
    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 0);

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 0);
  }

  #[test]
  fn test_negative_management_fee_v1() {
    let now = 0;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = -2_147_483_648; // -214700% annualized (manager pays 24% hourly, .4% per minute)

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 100 * QUOTE_PRECISION_U64;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vd.deposit(amount, vault_equity, &mut vault_version, now).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 200000000);
    assert_eq!(vault_version.last_fee_update_ts(), 0);
    vault_equity += amount;

    let user_eq_before = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(user_eq_before, 100000000);

    // one second since inception
    vault_version.apply_fee(vault_equity, now + 1_i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 199986200);

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 100006900); // up half a cent

    // one minute since inception
    vault_version.apply_fee(vault_equity, now + 60_i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 199185855);

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 100408736); // up 40 cents

    // one year since inception
    vault_version.apply_fee(vault_equity, now + ONE_YEAR as i64).unwrap();
    assert_eq!(vault_version.user_shares(), 100000000);
    assert_eq!(vault_version.total_shares(), 100000000);

    let oo = depositor_shares_to_vault_amount(vault_version.user_shares(), vault_version.total_shares(), vault_equity).unwrap();
    assert_eq!(oo, 200000000); // up $100

    assert_eq!(vault_version.last_fee_update_ts(), now + ONE_YEAR as i64);
  }

  #[test]
  fn test_negative_management_fee_manager_alone_v1() {
    let mut now = 0;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = -2_147_483_648; // -214700% annualized (manager pays 24% hourly, .4% per minute)
    assert_eq!(vault_version.total_shares(), 0);
    assert_eq!(vault_version.last_fee_update_ts(), 0);

    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    now += 100000;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), amount as u128);
    assert_eq!(vault_version.last_fee_update_ts(), now);
    vault_equity += amount;

    now += 100000;
    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();
    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(withdrew, amount);
  }

  #[test]
  fn test_manager_deposit_withdraw_with_user_flat_v1() {
    let mut now = 123456789;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = 0;
    vault_version.v1_mut().unwrap().manager_profit_share = 150_000; // 15%

    vault_version.v1_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    vd.deposit(amount * 20, vault_equity, &mut vault_version, now).unwrap(); // new user deposits $2000
    now += 60 * 60;
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000 + 100000000);
    vault_equity += amount * 20;

    now += 60 * 60 * 24; // 1 day later

    vd.apply_profit_share(vault_equity, &mut vault_version).unwrap();
    vault_version.apply_fee(vault_equity, now).unwrap();

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 100000000);
    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount, withdrew);
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000);

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 0);
  }

  #[test]
  fn test_manager_deposit_withdraw_with_user_manager_fee_loss_v1() {
    let mut now = 123456789;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = 100; // .01%
    vault_version.v1_mut().unwrap().manager_profit_share = 150000; // 15%

    vault_version.v1_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    vd.deposit(amount * 20, vault_equity, &mut vault_version, now).unwrap(); // new user deposits $2000
    now += 60 * 60;
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000 + 100000000);
    vault_equity += amount * 20;

    let mut cnt = 0;
    while (vault_version.total_shares() == 2000000000 + 100000000) && cnt < 400 {
      now += 60 * 60 * 24; // 1 day later

      vd.apply_profit_share(vault_equity, &mut vault_version).unwrap();
      vault_version.apply_fee(vault_equity, now).unwrap();
      // crate::msg!("vault last ts: {} vs {}", vault.last_fee_update_ts, now);
      cnt += 1;
    }

    assert_eq!(cnt, 4); // 4 days

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 100001999);
    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount, withdrew);
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000002000);
    vault_equity -= withdrew;

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 1999); // gainz

    let vd_amount = depositor_shares_to_vault_amount(
      vd.checked_vault_shares(&vault_version).unwrap(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();
    assert_eq!(vd_amount, 1999998000); // loss

    assert_eq!(vd_amount + vault_manager_amount_after, vault_equity - 1);
  }

  #[test]
  fn test_manager_deposit_withdraw_with_user_gain_v1() {
    let mut now = 123456789;
    let mut _vault = VaultV1::default();
    let mut vault_version = VaultVersion::V1(&mut _vault);
    vault_version.v1_mut().unwrap().management_fee = 100; // .01%
    vault_version.v1_mut().unwrap().manager_profit_share = 150000; // 15%

    vault_version.v1_mut().unwrap().last_fee_update_ts = now;
    let mut vault_equity: u64 = 0;
    let amount: u64 = 100 * QUOTE_PRECISION_U64;
    vault_version.manager_deposit(amount, vault_equity, now).unwrap();
    vault_equity += amount;

    assert_eq!(vault_version.user_shares(), 0);
    assert_eq!(vault_version.total_shares(), 100000000);
    now += 60 * 60;

    let vd = &mut VaultDepositor::new(Pubkey::default(), Pubkey::default(), Pubkey::default(), now);
    vd.deposit(amount * 20, vault_equity, &mut vault_version, now).unwrap(); // new user deposits $2000
    now += 60 * 60;
    assert_eq!(vault_version.user_shares(), 2000000000);
    assert_eq!(vault_version.total_shares(), 2000000000 + 100000000);
    vault_equity += amount * 20;

    // up 50%
    vault_equity *= 3;
    vault_equity /= 2;

    assert_eq!(vault_equity, 3_150_000_000);

    let mut cnt = 0;
    while (vault_version.total_shares() == 2000000000 + 100000000) && cnt < 400 {
      now += 60 * 60 * 24; // 1 day later

      vd.apply_profit_share(vault_equity, &mut vault_version).unwrap();
      vault_version.apply_fee(vault_equity, now).unwrap();
      // crate::msg!("vault last ts: {} vs {}", vault.last_fee_update_ts, now);
      cnt += 1;
    }

    assert_eq!(cnt, 4); // 4 days
    assert_eq!(
      vd.cumulative_profit_share_amount,
      (1000 * QUOTE_PRECISION_U64) as i64
    );
    assert_eq!(vd.net_deposits, (2000 * QUOTE_PRECISION_U64) as i64);

    let vault_manager_amount = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount, 300002849); //$300??

    vault_version.manager_request_withdraw(amount, WithdrawUnit::Token, vault_equity, now).unwrap();
    assert_eq!(amount, vault_version.v1_mut().unwrap().last_manager_withdraw_request.value);

    let withdrew = vault_version.manager_withdraw(vault_equity, now).unwrap();
    assert_eq!(amount - 1, withdrew); // todo: slight round out of favor
    assert_eq!(vault_version.user_shares(), 1900000000);
    assert_eq!(vault_version.total_shares(), 2033335367);
    vault_equity -= withdrew;

    let vault_manager_amount_after = depositor_shares_to_vault_amount(
      vault_version.total_shares() - vault_version.user_shares(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();

    assert_eq!(vault_manager_amount_after, 200_002_850); // gainz

    let vd_amount = depositor_shares_to_vault_amount(
      vd.checked_vault_shares(&vault_version).unwrap(),
      vault_version.total_shares(),
      vault_equity,
    ).unwrap();
    assert_eq!(vd_amount, 2_849_997_150); // gainz

    assert_eq!(vd_amount + vault_manager_amount_after, vault_equity - 1);
  }
}
