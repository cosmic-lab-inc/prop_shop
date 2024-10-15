import {Connection, Keypair, PublicKey} from '@solana/web3.js';
import {
  CreatePropShopClientConfig,
  CreateVaultConfig,
  DRIFT_VAULTS_PROGRAM_ID,
  DriftVaultsClient,
  FundOverview,
  signatureLink,
  SnackInfo
} from "@cosmic-lab/prop-shop-sdk";
import {AsyncSigner, keypairToAsyncSigner} from "@cosmic-lab/data-source";
import {getVaultAddressSync} from "@drift-labs/vaults-sdk";
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
    // todo: websocket sub + state management for Drift trades
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
    // todo: disconnect Drift trade state websockets
  }

  get driftClient(): DriftClient {
    return this.client.driftClient;
  }

  async createFund(config: CreateVaultConfig): Promise<SnackInfo> {
    if (this.fund() !== undefined) {
      console.warn(`Fund ${this.fundName} already exists`);
      return {
        variant: 'error',
        message: `Fund ${this.fundName} already exists`
      };
    }
    return (await this.client.createVault(config)).snack;
  }

  fundKey(): PublicKey {
    return getVaultAddressSync(DRIFT_VAULTS_PROGRAM_ID, encodeName(this.fundName));
  }

  fund(): FundOverview | undefined {
    const funds = this.client.fundOverviews;
    return funds.find(f => f.title === this.fundName);
  }

  fundOrErr(): FundOverview {
    const funds = this.client.fundOverviews;
    const fund = funds.find(f => f.title === this.fundName);
    if (!fund) {
      throw new Error(`Fund ${this.fundName} not found`);
    }
    return fund;
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

  async fundUsdcBalance(): Promise<number> {
    return this.fund()?.tvl ?? 0;
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

  async placeMarketPerpOrder(marketIndex: number, usdc: number, direction: PositionDirection) {
    const {price} = await this.fetchPerpMarket(marketIndex);

    let priceDiff50Bps;
    let priceDiff75Bps;
    if (direction === PositionDirection.LONG) {
      priceDiff50Bps = price * (1 + (0.5 / 100));
      priceDiff75Bps = price * (1 + (0.75 / 100));
    } else {
      priceDiff50Bps = price * (1 - (0.5 / 100));
      priceDiff75Bps = price * (1 - (0.75 / 100));
    }

    const baseUnits = usdc / price;

    // manager places long order and waits to be filler by the filler
    const orderParams = getMarketOrderParams({
      marketIndex,
      direction,
      baseAssetAmount: this.driftClient.convertToPerpPrecision(baseUnits),
      auctionStartPrice: this.driftClient.convertToPricePrecision(price),
      auctionEndPrice: this.driftClient.convertToPricePrecision(priceDiff50Bps),
      price: this.driftClient.convertToPricePrecision(priceDiff75Bps),
      auctionDuration: 60,
      maxTs: new BN(Date.now() + 100),
    });
    try {
      const sig = await this.driftClient.placePerpOrder(orderParams);
      console.log(signatureLink(sig, this.conn));
      return {
        variant: 'success',
        message: `Market order placed starting at ${price.toFixed(2)}`
      };
    } catch (e: any) {
      console.error(e);
      return {
        variant: 'error',
        message: JSON.stringify(e)
      };
    }
  }
}


















