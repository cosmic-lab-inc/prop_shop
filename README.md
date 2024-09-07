# Prop Shop

Invest in top-tier traders to build wealth while you sleep,
or create a fund and profit share with your investors.

## Development

See `packages/app/.env.exmaple` and next to it create a file named `.env`.
To test on localnet, run `anchor test --detach` to bootstrap the program and keep the validator running.
In a separate process, run `yarn build && yarn start:dev` to start the frontend.

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
