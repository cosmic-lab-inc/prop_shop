import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  AsyncSigner,
  keypairToAsyncSigner,
  walletAdapterToAsyncSigner,
} from "@cosmic-lab/data-source";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { makeAutoObservable } from "mobx";
import { IDL as DRIFT_VAULTS_IDL, VaultClient } from "@drift-labs/vaults-sdk";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  DRIFT_PROGRAM_ID,
  DriftClient,
  DriftClientConfig,
  IWallet,
  OracleInfo,
  PerpMarketAccount,
  QUOTE_PRECISION,
  SpotMarketAccount,
  User,
} from "@drift-labs/sdk";
import { DRIFT_VAULTS_PROGRAM_ID } from "./constants";
import { getAssociatedTokenAddress } from "./programs";
import { IDL as DRIFT_IDL } from "./idl/drift";

export class PropShopClient {
  connection: Connection;
  wallet: IWallet;
  private exists: boolean = false;
  usdcMint: PublicKey | undefined;
  usdcAta: PublicKey | undefined;
  vaultClient: VaultClient | undefined;

  constructor(wallet: IWallet, connection: Connection) {
    makeAutoObservable(this);
    this.wallet = wallet;
    this.connection = connection;
  }

  public async initialize(depositUsdc?: number): Promise<void> {
    const { vaultClient, usdcAta, usdcMint } = await this.initClient(
      {
        wallet: this.wallet,
        connection: this.connection,
        accountSubscription: {
          type: "websocket",
          resubTimeoutMs: 30_000,
        },
        opts: {
          preflightCommitment: "confirmed",
          skipPreflight: false,
          commitment: "confirmed",
        },
        activeSubAccountId: 0,
      },
      depositUsdc,
    );
    this.vaultClient = vaultClient;
    this.usdcAta = usdcAta;
    this.usdcMint = usdcMint;
    this.exists = true;
  }

  /*
    * Initialize the DriftClient and VaultClient.
    * Call this upon connecting a wallet.
   */
  private async initClient(
    config: DriftClientConfig,
    depositUsdc?: number,
  ): Promise<{
    wallet: IWallet;
    usdcMint: PublicKey;
    usdcAta: PublicKey;
    vaultClient: VaultClient;
  }> {
    const {
      wallet,
      connection,
      accountSubscription,
      opts,
      activeSubAccountId,
    } = config;

    const provider = new anchor.AnchorProvider(
      connection,
      // @ts-ignore
      wallet,
      opts,
    );
    const driftVaultsProgram = new anchor.Program(
      DRIFT_VAULTS_IDL,
      DRIFT_VAULTS_PROGRAM_ID,
      provider,
    );
    const driftProgram = new anchor.Program(
      DRIFT_IDL,
      DRIFT_PROGRAM_ID,
      provider,
    );

    // Perp/Spot market account types do not define padding so eslint errors, but it is safe.
    const perpMarkets =
      (await driftProgram.account.perpMarket.all()) as unknown as PerpMarketAccount[];
    const perpMarketIndexes = perpMarkets.map((m) => m.marketIndex);
    const spotMarkets =
      (await driftProgram.account.spotMarket.all()) as unknown as SpotMarketAccount[];
    const spotMarketIndexes = spotMarkets.map((m) => m.marketIndex);
    const oracleInfos: OracleInfo[] = perpMarkets.map((m) => {
      return {
        publicKey: m.amm.oracle,
        source: m.amm.oracleSource,
      };
    });

    const driftClient = new DriftClient({
      connection,
      wallet,
      opts: {
        commitment: "confirmed",
      },
      activeSubAccountId,
      perpMarketIndexes,
      spotMarketIndexes,
      oracleInfos,
      accountSubscription,
    });
    await driftClient.subscribe();

    const vaultClient = new VaultClient({
      // @ts-ignore
      driftClient,
      program: driftVaultsProgram,
    });

    const spotMarket = driftClient.getSpotMarketAccount(0);
    if (!spotMarket) {
      throw new Error(`USDC spot market not found in DriftClient`);
    }
    const usdcMint = spotMarket.mint;
    const usdcAta = getAssociatedTokenAddress(usdcMint, wallet.publicKey);

    if (depositUsdc) {
      await this.initUserIdempotent(depositUsdc);
    }

    return {
      wallet,
      usdcMint,
      usdcAta,
      vaultClient,
    };
  }

  /*
   * Initialize the User for the connected wallet,
   * and optionally deposit USDC as collateral.
   */
  async initUserIdempotent(depositUsdc?: number): Promise<User> {
    if (!this.exists) {
      throw new Error("PropShopClient not initialized");
    }
    const user = new User({
      // @ts-ignore
      driftClient: this.vaultClient.driftClient,
      userAccountPublicKey:
        await this.vaultClient!.driftClient.getUserAccountPublicKey(),
    });
    // only init if this is the first time (not already subscribed)
    if (!user.isSubscribed) {
      if (depositUsdc) {
        await this.vaultClient!.driftClient.initializeUserAccountAndDepositCollateral(
          QUOTE_PRECISION.mul(new BN(depositUsdc)),
          this.usdcAta!,
          0,
          this.vaultClient!.driftClient.activeSubAccountId,
        );
      } else {
        await this.vaultClient!.driftClient.initializeUserAccount(
          this.vaultClient!.driftClient.activeSubAccountId ?? 0,
        );
      }
      await user.subscribe();
    }
    return user;
  }

  public static readKeypairFromEnv(key: string): Keypair {
    try {
      const raw = process.env[key];
      if (!raw) throw new Error(`${key} not found in env`);
      const byteArray = JSON.parse(raw);
      const buffer = Buffer.from(byteArray);
      return Keypair.fromSecretKey(buffer);
    } catch (e: any) {
      console.error(`${key} not found in env`);
      throw e;
    }
  }

  /**
   * Helper method to convert a connected Solana wallet adapter to AsyncSigner.
   * For clients directly using the SDK within a React app that uses `@solana/wallet-adapter-react` to connect to a wallet.
   */
  public static walletAdapterToAsyncSigner(
    wallet: WalletContextState,
  ): AsyncSigner {
    return walletAdapterToAsyncSigner(wallet);
  }

  /**
   * Helper method to convert a Keypair to AsyncSigner.
   * For clients directly using the SDK outside of a React app (such as developers or a bot)
   * For most the Keypair would be read from a local file or environment variable.
   */
  public static keypairToAsyncSigner(key: Keypair): AsyncSigner {
    return keypairToAsyncSigner(key);
  }
}
