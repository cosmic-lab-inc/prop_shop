<p align="center">
  <a href="https://epoch.fm">
    <img alt="Epoch" src="https://cosmic-lab-inc.github.io/logo/epoch_logo.png" width="250px" style="border-radius: 50%;"/>
  </a>
</p>

<h1 align="center" style="font-size: 50px">
    Epoch Typescript SDK ⏳
</h1>

### Installation

```shell
yarn add @cosmic-lab/sdk
# or
npm install @cosmic-lab/sdk
```

### Env

To get started check out `.env.example`.
Most likely you are targeting the production environment and not running the server locally:

```shell
# devnet is used for the demo, once Epoch launches the only usable RPC is mainnet
# this URL configurable so that private RPCs can be used with better latency and rate limits
RPC_URL=https://api.devnet.solana.com
# dev or prod
# dev is for local development, which applies to very few individuals
# prod is for the production server (api.epoch.fm), which likely applies to you
ENV=prod
```

### Usage

```typescript
// automatically constructued from the `.env` file if it isn't initialized already
// EpochClient is a singleton, so it's safe to import it from anywhere without explicit construction (new EpochClient(...))
// and use directly as EpochClient.instance rather than storing in a variable, such as this line below:
const client = EpochClient.instance;

// If using during the demo period when everything is on devnet, you can airdrop yourself Epoch tokens!
await client.airdrop(connectedWallet);

// sign up or log in if already registered
const epochUser: EpochUser | null = await client.connect(walletContext);
```