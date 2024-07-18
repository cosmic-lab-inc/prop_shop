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
export const SHYFT_API_KEY = "api-key";
```

## TODO

Make PropShopClient subscribed accounts observable to allow UI to react to changes.