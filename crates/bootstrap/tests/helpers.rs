use std::str::FromStr;

use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token;
use anchor_spl::token::spl_token::solana_program::program_pack::Pack;
use anchor_spl::token::spl_token::state::Account as TokenAccount;
use anchor_spl::token::spl_token::state::Mint;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_config::{
    RpcRequestAirdropConfig, RpcSendTransactionConfig, RpcSimulateTransactionAccountsConfig,
    RpcSimulateTransactionConfig,
};
use solana_program::instruction::Instruction;
use solana_program::native_token::LAMPORTS_PER_SOL;
use solana_program::rent::Rent;
use solana_sdk::account::Account;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signature;
use solana_sdk::signer::{keypair::Keypair, Signer};
use solana_sdk::transaction::Transaction;

pub fn sol(amount: f64) -> u64 {
    (amount * LAMPORTS_PER_SOL as f64) as u64
}

pub fn usdc(amount: f64) -> u64 {
    (amount * 1_000_000_f64) as u64
}

pub async fn get_account(client: &RpcClient, key: &Pubkey) -> anyhow::Result<Account> {
    client
        .get_account_with_commitment(key, CommitmentConfig::processed())
        .await
        .map_err(|e| anyhow::anyhow!("{:?}", e))?
        .value
        .ok_or(anyhow::anyhow!("Account not found: {:?}", key))
}

pub async fn get_token_account(
    client: &RpcClient,
    token_account: &Pubkey,
) -> anyhow::Result<TokenAccount> {
    let account = client
        .get_account_with_commitment(token_account, CommitmentConfig::processed())
        .await
        .map_err(|e| anyhow::anyhow!("{:?}", e))?
        .value
        .ok_or(anyhow::anyhow!(
            "Token account not found: {:?}",
            token_account
        ))?;
    TokenAccount::unpack(&account.data)
        .map_err(|err| anyhow::anyhow!("Failed to unpack token account: {:?}", err))
}

pub async fn get_token_balance(client: &RpcClient, token_account: &Pubkey) -> u64 {
    get_token_account(client, token_account)
        .await
        .unwrap()
        .amount
}

pub async fn get_lamports(client: &RpcClient, key: &Pubkey) -> anyhow::Result<u64> {
    Ok(client
        .get_balance_with_commitment(key, CommitmentConfig::processed())
        .await
        .map_err(|e| anyhow::anyhow!("{:?}", e))?
        .value)
}

pub async fn sim_tx(
    client: &RpcClient,
    payer: &Keypair,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> anyhow::Result<()> {
    let mut tx = Transaction::new_with_payer(ixs, Some(&payer.pubkey()));
    let blockhash = client
        .get_latest_blockhash_with_commitment(CommitmentConfig::processed())
        .await?
        .0;
    tx.sign(&signers.to_vec(), blockhash);

    let sim = client
        .simulate_transaction_with_config(
            &tx,
            RpcSimulateTransactionConfig {
                sig_verify: true,
                replace_recent_blockhash: false,
                commitment: Some(CommitmentConfig::processed()),
                inner_instructions: true,
                ..Default::default()
            },
        )
        .await?
        .value;
    println!(
        "simulation, err: {:?}, logs: {:#?}, ixs: {:#?}",
        sim.err, sim.logs, sim.inner_instructions
    );
    Ok(())
}

pub async fn send_tx(
    client: &RpcClient,
    payer: &Keypair,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> anyhow::Result<Signature> {
    let mut tx = Transaction::new_with_payer(ixs, Some(&payer.pubkey()));
    let blockhash = client
        .get_latest_blockhash_with_commitment(CommitmentConfig::processed())
        .await?
        .0;
    tx.sign(&signers.to_vec(), blockhash);
    let sig = match client
        .send_transaction_with_config(
            &tx,
            RpcSendTransactionConfig {
                skip_preflight: true,
                ..Default::default()
            },
        )
        .await
    {
        Ok(sig) => Ok(sig),
        Err(e) => Err(anyhow::anyhow!("Error sending transaction: {:#?}", e)),
    }?;
    Ok(sig)
}

pub async fn send_and_confirm_tx(
    client: &RpcClient,
    payer: &Keypair,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> anyhow::Result<Signature> {
    let mut tx = Transaction::new_with_payer(ixs, Some(&payer.pubkey()));
    let blockhash = client
        .get_latest_blockhash_with_commitment(CommitmentConfig::processed())
        .await?
        .0;
    tx.sign(&signers.to_vec(), blockhash);

    let sig = match client
        .send_transaction_with_config(
            &tx,
            RpcSendTransactionConfig {
                skip_preflight: true,
                ..Default::default()
            },
        )
        .await
    {
        Ok(sig) => Ok(sig),
        Err(e) => Err(anyhow::anyhow!("Error sending transaction: {:#?}", e)),
    }?;
    client
        .confirm_transaction_with_spinner(&sig, &blockhash, CommitmentConfig::processed())
        .await?;
    Ok(sig)
}

pub async fn airdrop(client: &RpcClient, key: &Pubkey, amount: f64) -> anyhow::Result<Signature> {
    let blockhash = client
        .get_latest_blockhash_with_commitment(CommitmentConfig::processed())
        .await?
        .0;
    let bh_str = solana_sdk::bs58::encode(blockhash).into_string();
    let sig = client
        .request_airdrop_with_config(
            key,
            sol(amount),
            RpcRequestAirdropConfig {
                recent_blockhash: Some(bh_str),
                commitment: Some(CommitmentConfig::processed()),
            },
        )
        .await
        .map_err(|e| anyhow::anyhow!("{:?}", e))?;
    client
        .confirm_transaction_with_spinner(&sig, &blockhash, CommitmentConfig::processed())
        .await?;
    Ok(sig)
}

pub async fn transfer(
    client: &RpcClient,
    payer: &Keypair,
    receiver: &Pubkey,
    amount: u64,
) -> anyhow::Result<Signature> {
    let ixs = vec![solana_program::system_instruction::transfer(
        &payer.pubkey(),
        receiver,
        amount,
    )];
    send_and_confirm_tx(client, payer, &ixs, &[payer]).await
}

pub fn clone_keypair(keypair: &Keypair) -> Keypair {
    Keypair::from_bytes(&keypair.to_bytes()).unwrap()
}

pub fn clone_pubkey(pubkey: &Pubkey) -> Pubkey {
    Pubkey::from_str(&pubkey.to_string()).unwrap()
}

pub async fn create_associated_token_account(
    client: &RpcClient,
    payer: &Keypair,
    token_mint: &Pubkey,
    token_program: &Pubkey,
) -> anyhow::Result<(Pubkey, Signature)> {
    let ixs = vec![
        spl_associated_token_account::instruction::create_associated_token_account(
            &payer.pubkey(),
            &payer.pubkey(),
            token_mint,
            token_program,
        ),
    ];
    let sig = send_and_confirm_tx(client, payer, &ixs, &[payer]).await?;
    Ok((
        get_associated_token_address(&payer.pubkey(), token_mint),
        sig,
    ))
}

pub async fn create_mint(
    client: &RpcClient,
    payer: &Keypair,
    authority: &Pubkey,
    freeze_authority: Option<&Pubkey>,
    decimals: u8,
    mint: &Keypair,
) -> anyhow::Result<Signature> {
    let create_acct_ix = solana_program::system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        Rent::default().minimum_balance(Mint::LEN),
        Mint::LEN as u64,
        &spl_token::id(),
    );
    let init_mint_ix = spl_token::instruction::initialize_mint(
        &spl_token::id(),
        &mint.pubkey(),
        authority,
        freeze_authority,
        decimals,
    )?;
    let ixs = vec![create_acct_ix, init_mint_ix];
    let sig = send_and_confirm_tx(client, payer, &ixs, &[payer, mint]).await?;
    Ok(sig)
}

pub async fn mint_tokens(
    client: &RpcClient,
    payer: &Keypair,
    authority: &Keypair,
    mint: &Pubkey,
    account: &Pubkey,
    amount: u64,
    additional_signer: Option<&Keypair>,
) -> anyhow::Result<Signature> {
    let mut signing_keypairs = vec![&payer, authority];
    if let Some(signer) = additional_signer {
        signing_keypairs.push(signer);
    }

    let ix = spl_token::instruction::mint_to(
        &spl_token::id(),
        mint,
        account,
        &authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();

    send_and_confirm_tx(client, payer, &[ix], &signing_keypairs).await
}

#[macro_export]
macro_rules! trunc {
    ($num:expr, $decimals:expr) => {{
        let factor = 10.0_f64.powi($decimals);
        ($num * factor).round() / factor
    }};
}

pub fn signature_link(client: &RpcClient, signature: &Signature) -> String {
    let cluster_url = client.url();
    let uri_encoded_cluster_url = urlencoding::encode(&cluster_url);
    format!(
        "https://explorer.solana.com/tx/{}?cluster=custom&customUrl={}",
        signature, uri_encoded_cluster_url
    )
}

pub async fn simulate_link(
    client: &RpcClient,
    payer: &Keypair,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> anyhow::Result<String> {
    let mut tx = Transaction::new_with_payer(ixs, Some(&payer.pubkey()));
    let blockhash = client
        .get_latest_blockhash_with_commitment(CommitmentConfig::processed())
        .await?
        .0;
    tx.sign(&signers.to_vec(), blockhash);
    let cluster_url = client.url();
    let uri_encoded_cluster_url = urlencoding::encode(&cluster_url);
    let serialized_message = tx.message.serialize();
    let base64_message = base64::encode(serialized_message);
    let uri_encoded_message = urlencoding::encode(&base64_message);
    Ok(format!(
        "https://explorer.solana.com/tx/inspector?message={}&cluster=custom&customUrl={}",
        uri_encoded_message, uri_encoded_cluster_url
    ))
}
