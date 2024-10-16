import {ComputeBudgetProgram, Connection, Keypair, PublicKey, Signer, TransactionInstruction} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  CreatePropShopClientConfig,
  CreateVaultConfig,
  DriftVaultsClient,
  FundOverview,
  signatureLink,
  SnackInfo
} from "@cosmic-lab/prop-shop-sdk";
import {AsyncSigner, keypairToAsyncSigner} from "@cosmic-lab/data-source";
import {DriftVaults, getVaultAddressSync, Vault} from "@drift-labs/vaults-sdk";
import {
  BN,
  DriftClient,
  encodeName,
  getMarketOrderParams,
  PerpMarketAccount,
  PositionDirection,
  PRICE_PRECISION,
  QUOTE_PRECISION,
  SpotMarketAccount
} from "@drift-labs/sdk";


export class DriftMomentumBot {
  private readonly conn: Connection;
  private signer: AsyncSigner;
  key: PublicKey;
  private client: DriftVaultsClient;
  readonly fundName: string;

  /**
   * Create a new DriftMomentumBot and initialize in one step
   * @param connection - Solana RPC connection
   * @param keypair - Transaction payer and authority of the Prop Shop fund
   * @param fundName - Name of the Prop Shop fund to manage
   */
  static async new(
    connection: Connection,
    keypair: Keypair,
    fundName: string
  ): Promise<DriftMomentumBot> {
    const config: CreatePropShopClientConfig = {
      signer: keypairToAsyncSigner(keypair),
      connection
    };
    const self = new DriftMomentumBot(config, fundName);
    await self.initialize();
    return self;
  }

  constructor(config: CreatePropShopClientConfig, fundName: string) {
    this.conn = config.connection;
    this.signer = config.signer;
    this.key = config.signer.publicKey();
    this.fundName = fundName;
    this.client = new DriftVaultsClient(config);
  }

  async initialize(): Promise<void> {
    await this.client.initialize();

    if (this.fund !== undefined) {
      await this.driftClient.addUser(0, this.fundKey);
      await this.driftClient.switchActiveUser(0, this.fundKey);
    }

    // todo: websocket sub + state management for Drift trades
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
    // todo: disconnect Drift trade state websockets
  }

  get driftClient(): DriftClient {
    return this.client.driftClient;
  }

  get program(): anchor.Program<DriftVaults> {
    return this.client.vaultProgram;
  }

  get driftProgram(): anchor.Program<anchor.Idl> {
    return this.driftClient.program;
  }

  get fundKey(): PublicKey {
    return getVaultAddressSync(this.program.programId, encodeName(this.fundName));
  }

  get fund(): FundOverview | undefined {
    const funds = this.client.fundOverviews;
    return funds.find(f => f.title === this.fundName);
  }

  get fundOrErr(): FundOverview {
    const funds = this.client.fundOverviews;
    const fund = funds.find(f => f.title === this.fundName);
    if (!fund) {
      throw new Error(`Fund ${this.fundName} not found`);
    }
    return fund;
  }

  async createFund(config: CreateVaultConfig): Promise<SnackInfo> {
    if (this.fund !== undefined) {
      console.warn(`Fund ${this.fundName} already exists`);
      return {
        variant: 'error',
        message: `Fund ${this.fundName} already exists`
      };
    }
    const snack = (await this.client.createVault(config)).snack;

    // delegate assumes control of vault user
    await this.driftClient.addUser(0, this.fundKey);
    await this.driftClient.switchActiveUser(0, this.fundKey);

    return snack;
  }

  async driftUsdcBalance(): Promise<number> {
    await this.driftClient.fetchAccounts();
    const user = this.driftClient.getUser(0, this.key);
    const usdcBN = user.getUserAccount()
      .spotPositions.find(p => p.marketIndex === 0)?.scaledBalance;
    if (!usdcBN) {
      return 0;
    } else {
      return usdcBN.toNumber() / QUOTE_PRECISION.toNumber();
    }
  }

  private async sendTx(
    ixs: TransactionInstruction[],
    successMessage: string,
    errorMessage: string,
    signers: Signer[] = []
  ): Promise<SnackInfo> {
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 10_000,
      }),
      ...ixs,
    ];

    const recentBlockhash = await this.conn
      .getLatestBlockhash()
      .then((res) => res.blockhash);
    const msg = new anchor.web3.TransactionMessage({
      payerKey: this.key,
      recentBlockhash,
      instructions,
    }).compileToV0Message();
    let tx = new anchor.web3.VersionedTransaction(msg);
    tx = await this.signer.sign(tx);
    tx.sign(signers);

    const sim = (
      await this.conn.simulateTransaction(tx, {
        sigVerify: false,
      })
    ).value;
    if (sim.err) {
      const msg = `${errorMessage}: ${JSON.stringify(sim.err)}}`;
      console.log(sim.logs);
      console.error(msg);
      return {
        variant: 'error',
        message: errorMessage,
      };
    }

    try {
      const sig = await this.conn.sendTransaction(tx, {
        skipPreflight: true,
      });
      console.debug(`${successMessage}: ${signatureLink(sig)}`);
      const confirm = await this.conn.confirmTransaction(sig);
      if (confirm.value.err) {
        console.error(`${errorMessage}: ${JSON.stringify(confirm.value.err)}`);
        return {
          variant: 'error',
          message: errorMessage,
        };
      } else {
        return {
          variant: 'success',
          message: successMessage,
        };
      }
    } catch (e: any) {
      return {
        variant: 'error',
        message: errorMessage,
      };
    }
  }

  async fetchPerpMarket(marketIndex: number): Promise<{
    price: number;
    perpMarket: PerpMarketAccount;
    spotMarket: SpotMarketAccount;
  }> {
    const pm = this.driftClient.getPerpMarketAccount(marketIndex);
    if (!pm) {
      throw new Error(`Market ${marketIndex} not found`);
    }
    const sm = this.driftClient.getSpotMarketAccount(pm.quoteSpotMarketIndex);
    if (!sm) {
      throw new Error(`Market ${marketIndex} not found`);
    }
    const spotOracle = this.driftClient.getOracleDataForPerpMarket(pm.marketIndex);
    const price = spotOracle.price.toNumber() / PRICE_PRECISION.toNumber();
    return {
      price,
      perpMarket: pm,
      spotMarket: sm
    };
  }

  async placeMarketPerpOrder(marketIndex: number, usdc: number, direction: PositionDirection, slippagePct = 0.5): Promise<SnackInfo> {
    const {price} = await this.fetchPerpMarket(marketIndex);

    let priceDiffBps;
    if (direction === PositionDirection.LONG) {
      priceDiffBps = price * (1 + (slippagePct / 100));
    } else {
      priceDiffBps = price * (1 - (slippagePct / 100));
    }

    const baseUnits = usdc / price;

    const activeUser = this.driftClient.getUser(
      0,
      this.fundKey,
    );
    const fundAcct = (await this.program.account.vault.fetch(this.fundKey)) as Vault;
    console.log('fund user correct:', fundAcct.user.equals(activeUser.getUserAccountPublicKey()));
    console.log('fund delegate correct:', fundAcct.delegate.equals(this.key));

    const orderParams = getMarketOrderParams({
      marketIndex,
      direction,
      baseAssetAmount: this.driftClient.convertToPerpPrecision(baseUnits),
      auctionStartPrice: this.driftClient.convertToPricePrecision(price),
      auctionEndPrice: this.driftClient.convertToPricePrecision(priceDiffBps),
      price: this.driftClient.convertToPricePrecision(priceDiffBps),
      auctionDuration: 60,
      maxTs: new BN(Date.now() + 100),
    });

    const remainingAccounts = this.driftClient.getRemainingAccounts(
      {
        userAccounts: [activeUser.getUserAccount()],
        useMarketLastSlotCache: true,
        writablePerpMarketIndexes: [marketIndex],
      },
    );

    try {
      const ix = await this.driftClient.program.methods
        .placePerpOrder(orderParams)
        .accounts({
          state: await this.driftClient.getStatePublicKey(),
          user: activeUser.userAccountPublicKey,
          authority: this.key,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
      return await this.sendTx(
        [ix],
        `Market order placed starting at $${price.toFixed(2)}`,
        'Failed to place market order'
      );
    } catch (e: any) {
      console.error(e);
      return {
        variant: 'error',
        message: JSON.stringify(e)
      };
    }
  }
}


















