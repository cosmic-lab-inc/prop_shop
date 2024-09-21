use phoenix::program::status::MarketStatus;
use phoenix::program::*;
use phoenix_seat_manager::get_seat_manager_address;
use phoenix_seat_manager::instruction_builders::create_claim_market_authority_instruction;
use phoenix_seat_manager::seat_manager::SeatManager;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use spl_associated_token_account::get_associated_token_address;

use crate::helpers::*;

mod helpers;

const BOOK_SIZE: usize = 4096;
const NUM_SEATS: usize = 8321;

const MOCK_MARKET_AUTHORITY_KEYPAIR: [u8; 64] = [
    66, 123, 76, 224, 250, 46, 45, 185, 92, 44, 26, 59, 177, 162, 57, 152, 152, 168, 214, 27, 185,
    110, 97, 62, 226, 94, 214, 190, 206, 253, 83, 234, 143, 207, 63, 171, 250, 160, 85, 171, 204,
    57, 11, 146, 117, 118, 22, 155, 104, 251, 84, 131, 255, 168, 226, 187, 237, 120, 54, 43, 103,
    65, 121, 161,
];

const MOCK_USDC_MINT: [u8; 64] = [
    87, 198, 89, 198, 67, 63, 51, 219, 219, 205, 135, 80, 234, 56, 140, 16, 89, 50, 81, 229, 158,
    31, 99, 65, 96, 2, 245, 44, 73, 148, 172, 223, 207, 221, 139, 122, 3, 190, 18, 238, 58, 168,
    238, 122, 70, 81, 217, 218, 189, 29, 109, 94, 252, 95, 110, 157, 33, 107, 20, 14, 201, 83, 184,
    122,
];
const MOCK_USDC_DECIMALS: u8 = 6;

const MOCK_SOL_MINT: [u8; 64] = [
    168, 35, 20, 1, 139, 84, 3, 188, 183, 74, 164, 142, 249, 104, 144, 203, 18, 74, 246, 121, 144,
    17, 17, 220, 68, 183, 73, 72, 98, 138, 227, 243, 236, 2, 190, 43, 13, 5, 202, 115, 113, 27,
    211, 68, 74, 123, 176, 95, 132, 166, 213, 212, 17, 228, 204, 134, 113, 149, 209, 227, 99, 7,
    170, 237,
];
const MOCK_SOL_DECIMALS: u8 = 9;

const MOCK_JUP_MINT: [u8; 64] = [
    239, 37, 196, 242, 130, 217, 89, 30, 157, 246, 22, 44, 213, 30, 154, 9, 107, 91, 87, 56, 32,
    44, 132, 214, 205, 160, 235, 21, 193, 82, 156, 27, 0, 52, 31, 170, 133, 18, 164, 125, 228, 81,
    137, 2, 18, 235, 65, 106, 203, 192, 88, 222, 174, 198, 7, 131, 115, 181, 13, 17, 236, 173, 207,
    77,
];
const MOCK_JUP_DECIMALS: u8 = 9;

const MOCK_SOL_USDC_MARKET: [u8; 64] = [
    93, 15, 240, 33, 150, 60, 211, 167, 231, 22, 41, 204, 200, 97, 206, 142, 26, 4, 165, 42, 10,
    250, 122, 223, 206, 1, 229, 158, 165, 59, 223, 236, 43, 187, 177, 182, 105, 104, 42, 76, 105,
    0, 63, 206, 168, 171, 153, 177, 92, 111, 205, 70, 213, 77, 79, 158, 212, 90, 50, 22, 37, 161,
    233, 161,
];

const MOCK_JUP_SOL_MARKET: [u8; 64] = [
    15, 151, 240, 120, 77, 168, 237, 143, 234, 212, 68, 61, 31, 86, 52, 247, 1, 94, 88, 16, 218,
    194, 238, 146, 159, 57, 164, 139, 27, 8, 199, 208, 149, 224, 247, 248, 83, 62, 63, 218, 7, 175,
    97, 67, 149, 214, 103, 186, 179, 0, 75, 42, 193, 199, 229, 89, 59, 238, 67, 228, 155, 206, 166,
    232,
];

const MOCK_JUP_USDC_MARKET: [u8; 64] = [
    136, 1, 116, 112, 92, 96, 18, 218, 159, 171, 129, 153, 142, 137, 45, 170, 71, 12, 207, 146, 4,
    42, 43, 220, 224, 11, 240, 249, 154, 169, 93, 114, 97, 155, 77, 41, 195, 245, 43, 240, 189,
    119, 112, 171, 181, 73, 151, 234, 158, 154, 244, 252, 42, 218, 124, 117, 43, 55, 204, 36, 167,
    160, 42, 233,
];

struct BootstrapMarketConfig<'a> {
    pub client: &'a RpcClient,
    pub payer: &'a Keypair,
    pub authority: &'a Keypair,
    pub market: &'a Keypair,
    pub quote_mint: &'a Keypair,
    pub base_mint: &'a Keypair,
    pub base_decimals: u8,
    pub quote_decimals: u8,
    pub num_quote_lots_per_quote_unit: Option<u64>,
    pub num_base_lots_per_base_unit: Option<u64>,
    pub tick_size_in_quote_lots_per_base_unit: Option<u64>,
    pub fee_bps: Option<u16>,
    pub raw_base_units_per_base_unit: Option<u32>,
}

async fn bootstrap_market(cfg: BootstrapMarketConfig<'_>) -> anyhow::Result<()> {
    let BootstrapMarketConfig {
        client,
        payer,
        authority,
        market,
        quote_mint,
        base_mint,
        base_decimals,
        quote_decimals,
        num_quote_lots_per_quote_unit: _num_quote_lots_per_quote_unit,
        num_base_lots_per_base_unit: _num_base_lots_per_base_unit,
        tick_size_in_quote_lots_per_base_unit: _tick_size_in_quote_lots_per_base_unit,
        fee_bps: _fee_bps,
        raw_base_units_per_base_unit,
    } = cfg;
    let num_quote_lots_per_quote_unit = _num_quote_lots_per_quote_unit.unwrap_or(100_000);
    let num_base_lots_per_base_unit = _num_base_lots_per_base_unit.unwrap_or(1_000);
    let tick_size_in_quote_lots_per_base_unit =
        _tick_size_in_quote_lots_per_base_unit.unwrap_or(1_000);
    let fee_bps = _fee_bps.unwrap_or(1);

    let params = MarketSizeParams {
        bids_size: BOOK_SIZE as u64,
        asks_size: BOOK_SIZE as u64,
        num_seats: NUM_SEATS as u64,
    };

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // create quote token mint
    let quote_mint_acct = get_account(client, &quote_mint.pubkey()).await;
    if quote_mint_acct.is_err() {
        println!("making quote mint...");
        let create_quote_mint_sig = create_mint(
            client,
            payer,
            &authority.pubkey(),
            None,
            quote_decimals,
            quote_mint,
        )
        .await?;
        println!("create_quote_mint_sig: {:?}", create_quote_mint_sig);
    } else {
        println!("quote mint already exists");
    }

    // create base token mint
    let base_mint_acct = get_account(client, &base_mint.pubkey()).await;
    if base_mint_acct.is_err() {
        let create_base_mint_sig = create_mint(
            client,
            payer,
            &authority.pubkey(),
            None,
            base_decimals,
            base_mint,
        )
        .await?;
        println!("create_base_mint_sig: {:?}", create_base_mint_sig);
    } else {
        println!("base mint already exists");
    }

    // create quote associated token account for payer
    let quote_ata = get_associated_token_address(&payer.pubkey(), &quote_mint.pubkey());
    let quote_ata_acct = get_account(client, &quote_ata).await;
    if quote_ata_acct.is_err() {
        let (_, create_quote_ata_sig) = create_associated_token_account(
            client,
            payer,
            &quote_mint.pubkey(),
            &anchor_spl::token::spl_token::id(),
        )
        .await?;
        println!("create_quote_ata_sig: {:?}", create_quote_ata_sig);
    } else {
        println!("quote ata already exists");
    }

    // create market
    let mut init_instructions = vec![];
    init_instructions.extend(
        create_initialize_market_instructions_default(
            &market.pubkey(),
            &base_mint.pubkey(),
            &quote_mint.pubkey(),
            &payer.pubkey(),
            params,
            num_quote_lots_per_quote_unit,
            num_base_lots_per_base_unit,
            tick_size_in_quote_lots_per_base_unit,
            fee_bps,
            raw_base_units_per_base_unit,
        )
        .unwrap(),
    );

    let seat_manager_key = get_seat_manager_address(&market.pubkey()).0;
    init_instructions.push(create_name_successor_instruction(
        &payer.pubkey(),
        &market.pubkey(),
        &seat_manager_key,
    ));

    init_instructions.push(create_change_market_status_instruction(
        &payer.pubkey(),
        &market.pubkey(),
        MarketStatus::Active,
    ));

    let create_market_sig =
        send_and_confirm_tx(client, payer, &init_instructions, &[&payer, &market]).await?;
    println!(
        "create market: {}",
        signature_link(client, &create_market_sig)
    );

    //
    // claim seat manager
    //

    let market_ai = client.get_account(&market.pubkey()).await?;
    let market_bytes = market_ai.data;
    let (header_bytes, _) = market_bytes.split_at(std::mem::size_of::<MarketHeader>());
    let header = bytemuck::try_from_bytes::<MarketHeader>(header_bytes).unwrap();
    println!("market auth: {:?}", header.authority);
    println!("seat manager: {:?}", seat_manager_key);

    // this creates SeatManager: https://github.com/Ellipsis-Labs/phoenix-seat-manager-v1/blob/31ad32a186d7e0e5aa747dcaa9463b7e27089b47/src/processor/claim_market_authority.rs#L98
    let claim_auth_ix =
        create_claim_market_authority_instruction(&market.pubkey(), &payer.pubkey());

    let claim_auth_sig = send_and_confirm_tx(client, payer, &[claim_auth_ix], &[payer]).await?;

    let (seat_manager_address, _) = get_seat_manager_address(&market.pubkey());
    let seat_manager_data = client
        .get_account_data(&seat_manager_address)
        .await
        .unwrap();
    bytemuck::try_from_bytes::<SeatManager>(&seat_manager_data)
        .map_err(|e| anyhow::anyhow!("failed to deserialize seat manager data: {:?}", e))?;

    Ok(())
}

#[tokio::test]
async fn bootstrap_markets() -> anyhow::Result<()> {
    let payer = Keypair::from_bytes(&MOCK_MARKET_AUTHORITY_KEYPAIR).unwrap();
    let authority = Keypair::from_bytes(&MOCK_MARKET_AUTHORITY_KEYPAIR).unwrap();
    let usdc_mint = Keypair::from_bytes(&MOCK_USDC_MINT).unwrap();
    let sol_mint = Keypair::from_bytes(&MOCK_SOL_MINT).unwrap();
    let jup_mint = Keypair::from_bytes(&MOCK_JUP_MINT).unwrap();
    let sol_usdc_market = Keypair::from_bytes(&MOCK_SOL_USDC_MARKET).unwrap();
    let jup_sol_market = Keypair::from_bytes(&MOCK_JUP_SOL_MARKET).unwrap();
    let jup_usdc_market = Keypair::from_bytes(&MOCK_JUP_USDC_MARKET).unwrap();

    let client = RpcClient::new_with_timeouts_and_commitment(
        "http://localhost:8899".to_string(),
        std::time::Duration::from_secs(5),
        CommitmentConfig::processed(),
        std::time::Duration::from_secs(5),
    );
    airdrop(&client, &payer.pubkey(), 10.0).await?;
    airdrop(&client, &authority.pubkey(), 10.0).await?;

    // SOL/USDC market
    let pre_balance = get_lamports(&client, &payer.pubkey()).await?;
    println!("pre SOL/USDC balance: {}", pre_balance);
    bootstrap_market(BootstrapMarketConfig {
        client: &client,
        payer: &payer,
        authority: &authority,
        market: &sol_usdc_market,
        quote_mint: &usdc_mint,
        quote_decimals: MOCK_USDC_DECIMALS,
        base_mint: &sol_mint,
        base_decimals: MOCK_SOL_DECIMALS,

        num_quote_lots_per_quote_unit: None,
        num_base_lots_per_base_unit: None,
        tick_size_in_quote_lots_per_base_unit: None,
        fee_bps: None,
        raw_base_units_per_base_unit: None,
    })
    .await?;
    let post_balance = get_lamports(&client, &payer.pubkey()).await?;
    println!("post SOL/USDC balance: {}", post_balance);
    println!("==================================================================");

    // // JUP/SOL market
    // airdrop(&client, &payer.pubkey(), 10.0).await?;
    // airdrop(&client, &authority.pubkey(), 10.0).await?;
    // let pre_balance = get_lamports(&client, &payer.pubkey()).await?;
    // println!("pre JUP/SOL balance: {}", pre_balance);
    // bootstrap_market(BootstrapMarketConfig {
    //     client: &client,
    //     payer: &payer,
    //     authority: &authority,
    //     market: &jup_sol_market,
    //     quote_mint: &sol_mint,
    //     quote_decimals: MOCK_SOL_DECIMALS,
    //     base_mint: &jup_mint,
    //     base_decimals: MOCK_JUP_DECIMALS,
    //
    //     num_quote_lots_per_quote_unit: None,
    //     num_base_lots_per_base_unit: None,
    //     tick_size_in_quote_lots_per_base_unit: None,
    //     fee_bps: None,
    //     raw_base_units_per_base_unit: None,
    // })
    // .await?;
    // let post_balance = get_lamports(&client, &payer.pubkey()).await?;
    // println!("post JUP/SOL balance: {}", post_balance);
    // println!("==================================================================");
    //
    // // JUP/USDC market
    // airdrop(&client, &payer.pubkey(), 10.0).await?;
    // airdrop(&client, &authority.pubkey(), 10.0).await?;
    // let pre_balance = get_lamports(&client, &payer.pubkey()).await?;
    // println!("pre JUP/USDC balance: {}", pre_balance);
    // bootstrap_market(BootstrapMarketConfig {
    //     client: &client,
    //     payer: &payer,
    //     authority: &authority,
    //     market: &jup_usdc_market,
    //     quote_mint: &usdc_mint,
    //     quote_decimals: MOCK_USDC_DECIMALS,
    //     base_mint: &jup_mint,
    //     base_decimals: MOCK_JUP_DECIMALS,
    //
    //     num_quote_lots_per_quote_unit: None,
    //     num_base_lots_per_base_unit: None,
    //     tick_size_in_quote_lots_per_base_unit: None,
    //     fee_bps: None,
    //     raw_base_units_per_base_unit: None,
    // })
    // .await?;
    // let post_balance = get_lamports(&client, &payer.pubkey()).await?;
    // println!("post JUP/USDC balance: {}", post_balance);
    // println!("==================================================================");

    Ok(())
}
