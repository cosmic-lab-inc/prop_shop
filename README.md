# Prop Shop

Invest in Solana hedge funds and traders to build wealth while you sleep.
Shop for the best funds trading on Drift and Jupiter.

## Development

See `packages/app/.env.exmaple` and next to it create a file named `.env`.

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

Display "Your Profit/Loss" alongside "Your Equity" field in FundDialog.

If manager and vault is invite-only, then display invite button and dialog.
