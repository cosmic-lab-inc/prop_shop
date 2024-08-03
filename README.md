# Prop Shop

A decentralized marketplace for investment funds. Shop across multiple funds interacting with the Drift exchange.
Choose funds based on highest returns, lowest risk, assets under management, and more.
Invest in winning traders and earn passively, while they take a small profit share in return.

## Development

See `packages/app/.env.exmaple` and create a `.env` next to it.

## Testing

To run tests, create a directory and file `.jest/env.ts`.
In it put:

```typescript
export const REDIS_ENDPOINT = "redis://your-redis-server"
export const REDIS_PASSWORD = "your-redis-password"
export const RPC_URL = "https://your-solana-rpc"
export const SHYFT_API_KEY = "shyft-api-key";
export const FLIPSIDE_API_KEY = "flipside-api-key";
```

## TODO

FundOverviewCard reads observable state of fund overviews rather than static prop

Sort funds by criteria: lifetime PNL, TVL, num investors, APY

Manage Vaults tab:

- pending redemptions (countdown, equity, investor key)
- dialog to invite investor
- FundOverviewCard for managed funds, shows manager equity and button to deposit/withdraw
- settings (UpdateVaultParams, including delegate!)

All client instructions check if user DNE and add ix to tx if needed