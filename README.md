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
export const RPC_URL = "https://your-solana-rpc"
```

## TODO

Liquidate Phoenix vault
Create Phoenix vault