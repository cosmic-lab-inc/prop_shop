import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import { DriftVaults, IDL } from "../src";
import {
  AdminClient,
  BN,
  BulkAccountLoader,
  DriftClient,
  getInsuranceFundStakeAccountPublicKey,
  InsuranceFundStake,
  UserAccount,
  ZERO,
} from "@drift-labs/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
// import { assert } from "chai";
import {
  encodeName,
  getVaultAddressSync,
  getVaultDepositorAddressSync,
  VaultClient,
  WithdrawUnit,
} from "@drift-labs/vaults-sdk";
import {
  CompetitionsClient,
  getCompetitionAddressSync,
  getCompetitorAddressSync,
} from "@drift-labs/competitions-sdk/lib";
import {
  createUserWithUSDCAccount,
  initializeQuoteSpotMarket,
  mockUSDCMint,
  mockUserUSDCAccount,
  printTxLogs,
} from "./helpers";
import { describe } from "@jest/globals";
import { assert } from "chai";

describe("Drift Vaults", () => {
  // Configure the client to use the local cluster.
  const provider = AnchorProvider.local(undefined, {
    preflightCommitment: "confirmed",
    skipPreflight: false,
    commitment: "confirmed",
  });

  const connection = provider.connection;
  const bulkAccountLoader = new BulkAccountLoader(connection, "confirmed", 1);
  setProvider(provider);

  const program = new Program<DriftVaults>(
    IDL,
    new PublicKey("vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR"),
    provider,
  );
  const adminClient = new AdminClient({
    connection,
    wallet: provider.wallet,
    accountSubscription: {
      // type: "websocket",
      // resubTimeoutMs: 30_000,
      type: "polling",
      accountLoader: bulkAccountLoader,
    },
  });

  const vaultClient = new VaultClient({
    driftClient: adminClient,
    // @ts-ignore
    program: program,
    cliMode: true,
  });

  let usdcMint: Keypair;
  let userUSDCAccount: Keypair;

  const vaultName = "PropShop Vault";
  const vault = getVaultAddressSync(program.programId, encodeName(vaultName));

  const usdcAmount = new BN(1000 * 10 ** 6);

  beforeAll(async () => {
    console.log("BEFORE");
    usdcMint = await mockUSDCMint(provider);
    userUSDCAccount = await mockUserUSDCAccount(usdcMint, usdcAmount, provider);
    await adminClient.initialize(usdcMint.publicKey, false);
    await adminClient.subscribe();
    await initializeQuoteSpotMarket(adminClient, usdcMint.publicKey);
    bulkAccountLoader.startPolling();
    await bulkAccountLoader.load();
    console.log("FINISH BEFORE");
  });

  afterAll(async () => {
    await adminClient.unsubscribe();
    bulkAccountLoader.stopPolling();
  });

  it("Initialize Vault", async () => {
    await vaultClient.initializeVault({
      name: encodeName(vaultName),
      spotMarketIndex: 0,
      redeemPeriod: ZERO,
      maxTokens: ZERO,
      managementFee: ZERO,
      profitShare: 0,
      hurdleRate: 0,
      permissioned: false,
      minDepositAmount: ZERO,
    });

    await adminClient.fetchAccounts();
    assert(adminClient.getStateAccount().numberOfAuthorities.eq(new BN(1)));
    assert(adminClient.getStateAccount().numberOfSubAccounts.eq(new BN(1)));
  });

  it("Initialize Vault Depositor", async () => {
    await vaultClient.initializeVaultDepositor(
      vault,
      provider.wallet.publicKey,
    );
  });

  it("Deposit", async () => {
    const vaultAccount = await program.account.vault.fetch(vault);
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      vault,
      provider.wallet.publicKey,
    );
    const remainingAccounts = adminClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });

    const txSig = await program.methods
      .deposit(usdcAmount)
      .accounts({
        userTokenAccount: userUSDCAccount.publicKey,
        vault,
        vaultDepositor,
        vaultTokenAccount: vaultAccount.tokenAccount,
        driftUser: vaultAccount.user,
        driftUserStats: vaultAccount.userStats,
        driftState: await adminClient.getStatePublicKey(),
        driftSpotMarketVault: adminClient.getSpotMarketAccount(0)?.vault,
        driftProgram: adminClient.program.programId,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();

    await printTxLogs(provider.connection, txSig);
  });

  it("Withdraw", async () => {
    const vaultAccount = await program.account.vault.fetch(vault);
    const vaultDepositor = getVaultDepositorAddressSync(
      program.programId,
      vault,
      provider.wallet.publicKey,
    );
    const remainingAccounts = adminClient.getRemainingAccounts({
      userAccounts: [],
      writableSpotMarketIndexes: [0],
    });

    const vaultDepositorAccount =
      await program.account.vaultDepositor.fetch(vaultDepositor);
    assert(vaultDepositorAccount.lastWithdrawRequest.value.eq(new BN(0)));
    console.log(
      "vaultDepositorAccount.vaultShares:",
      vaultDepositorAccount.vaultShares.toString(),
    );
    assert(vaultDepositorAccount.vaultShares.eq(new BN(1_000_000_000)));

    // request withdraw
    console.log("request withdraw");
    const requestTxSig = await program.methods
      .requestWithdraw(usdcAmount, WithdrawUnit.TOKEN)
      .accounts({
        // userTokenAccount: userUSDCAccount.publicKey,
        vault,
        vaultDepositor,
        driftUser: vaultAccount.user,
        driftUserStats: vaultAccount.userStats,
        driftState: await adminClient.getStatePublicKey(),
        // driftSpotMarketVault: adminClient.getSpotMarketAccount(0).vault,
        // driftSigner: adminClient.getStateAccount().signer,
        // driftProgram: adminClient.program.programId,
        // tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();

    await printTxLogs(provider.connection, requestTxSig);

    const vaultDepositorAccountAfter =
      await program.account.vaultDepositor.fetch(vaultDepositor);
    assert(vaultDepositorAccountAfter.vaultShares.eq(new BN(1_000_000_000)));
    console.log(
      "vaultDepositorAccountAfter.lastWithdrawRequestShares:",
      vaultDepositorAccountAfter.lastWithdrawRequest.shares.toString(),
    );
    assert(
      !vaultDepositorAccountAfter.lastWithdrawRequest.shares.eq(new BN(0)),
    );
    assert(!vaultDepositorAccountAfter.lastWithdrawRequest.value.eq(new BN(0)));

    // do withdraw
    console.log("do withdraw");
    try {
      const txSig = await program.methods
        .withdraw()
        .accounts({
          userTokenAccount: userUSDCAccount.publicKey,
          vault,
          vaultDepositor,
          vaultTokenAccount: vaultAccount.tokenAccount,
          driftUser: vaultAccount.user,
          driftUserStats: vaultAccount.userStats,
          driftState: await adminClient.getStatePublicKey(),
          driftSpotMarketVault: adminClient.getSpotMarketAccount(0)?.vault,
          driftSigner: adminClient.getStateAccount().signer,
          driftProgram: adminClient.program.programId,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

      await printTxLogs(provider.connection, txSig);
    } catch (e) {
      console.error(e);
      assert(false);
    }
  });

  it("Update Delegate", async () => {
    const vaultAccount = await program.account.vault.fetch(vault);
    const delegateKeyPair = Keypair.generate();
    const txSig = await program.methods
      .updateDelegate(delegateKeyPair.publicKey)
      .accounts({
        vault,
        driftUser: vaultAccount.user,
        driftProgram: adminClient.program.programId,
      })
      .rpc();

    const user = (await adminClient.program.account.user.fetch(
      vaultAccount.user,
    )) as UserAccount;
    assert(user.delegate.equals(delegateKeyPair.publicKey));

    await printTxLogs(provider.connection, txSig);
  });

  it("Test initializeInsuranceFundStake", async () => {
    const spotMarket = adminClient.getSpotMarketAccount(0);
    const [driftClient, _user, _kp] = await createUserWithUSDCAccount(
      adminClient.provider,
      usdcMint,
      new Program(
        // @ts-ignore
        adminClient.program.idl,
        adminClient.program.programId,
        adminClient.provider,
      ),
      new BN(1000 * 10 ** 6),
      [],
      [0],
      [
        {
          publicKey: spotMarket!.oracle,
          source: spotMarket!.oracleSource,
        },
      ],
      bulkAccountLoader,
    );
    const vaultClient = new VaultClient({
      driftClient: driftClient,
      // @ts-ignore
      program: program,
    });
    const vaultName = "if stake vault";
    const vault = getVaultAddressSync(program.programId, encodeName(vaultName));
    await vaultClient.initializeVault({
      name: encodeName(vaultName),
      spotMarketIndex: 0,
      redeemPeriod: ZERO,
      maxTokens: ZERO,
      managementFee: ZERO,
      profitShare: 0,
      hurdleRate: 0,
      permissioned: false,
      minDepositAmount: ZERO,
    });

    const testInitIFStakeAccount = async (marketIndex: number) => {
      const ifStakeTx0 = await vaultClient.initializeInsuranceFundStake(
        vault,
        marketIndex,
      );
      await printTxLogs(provider.connection, ifStakeTx0);

      try {
        const ifStakeAccountPublicKey = getInsuranceFundStakeAccountPublicKey(
          driftClient.program.programId,
          vault,
          marketIndex,
        );
        const ifStakeAccount =
          (await driftClient.program.account.insuranceFundStake.fetch(
            ifStakeAccountPublicKey,
          )) as InsuranceFundStake;

        assert(ifStakeAccount, "Couldn't fetch IF stake account");
        assert(
          ifStakeAccount.marketIndex === marketIndex,
          "Market index is incorrect",
        );
        assert(
          ifStakeAccount.authority.equals(vault),
          "Vault is not the authority",
        );
        assert(ifStakeAccount.ifShares.eq(new BN(0)), "Doesnt have 0 shares");
      } catch (err) {
        console.log(err);
        assert(false, "Couldn't fetch IF stake account");
      }
    };

    await testInitIFStakeAccount(0);
  });

  it("Test initializeCompetitor", async () => {
    const spotMarket = adminClient.getSpotMarketAccount(0);
    const [driftClient, _user, _kp] = await createUserWithUSDCAccount(
      adminClient.provider,
      usdcMint,
      new Program(
        // @ts-ignore
        adminClient.program.idl,
        adminClient.program.programId,
        adminClient.provider,
      ),
      new BN(1000 * 10 ** 6),
      [],
      [0],
      [
        {
          publicKey: spotMarket!.oracle,
          source: spotMarket!.oracleSource,
        },
      ],
      bulkAccountLoader,
    );
    const vaultClient = new VaultClient({
      driftClient: driftClient,
      // @ts-ignore
      program: program,
    });
    const vaultName = "competition vault";
    const vault = getVaultAddressSync(program.programId, encodeName(vaultName));
    await vaultClient.initializeVault({
      name: encodeName(vaultName),
      spotMarketIndex: 0,
      redeemPeriod: ZERO,
      maxTokens: ZERO,
      managementFee: ZERO,
      profitShare: 0,
      hurdleRate: 0,
      permissioned: false,
      minDepositAmount: ZERO,
    });

    try {
      const competitionsClient = new CompetitionsClient({
        // @ts-ignore
        driftClient: driftClient as DriftClient,
      });
      const competitionName = "sweepstakes";
      const encodedName = encodeName(competitionName);
      const competitionAddress = getCompetitionAddressSync(
        competitionsClient.program.programId,
        encodedName,
      );
      const competitorAddress = getCompetitorAddressSync(
        competitionsClient.program.programId,
        competitionAddress,
        vault,
      );
      const initCompTx = await competitionsClient.initializeCompetition({
        name: competitionName,
        nextRoundExpiryTs: ZERO,
        competitionExpiryTs: ZERO,
        roundDuration: ZERO,
        maxEntriesPerCompetitor: ZERO,
        minSponsorAmount: ZERO,
        maxSponsorFraction: ZERO,
        numberOfWinners: 1,
      });
      await printTxLogs(provider.connection, initCompTx);

      const initCompetitorTx = await vaultClient.initializeCompetitor(
        vault,
        // @ts-ignore
        competitionsClient,
        competitionName,
      );
      await printTxLogs(provider.connection, initCompetitorTx);

      const competitorAccount =
        await competitionsClient.program.account.competitor.fetch(
          competitorAddress,
        );
      assert(
        competitorAccount.competition.equals(competitionAddress),
        "Competition address is incorrect",
      );
      assert(
        competitorAccount.authority.equals(vault),
        "Vault is not the competitor authority",
      );
    } catch (err) {
      console.log(err);
      assert(false, "Failed to initialize competitor");
    }
  });
});
