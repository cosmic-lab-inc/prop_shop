import {PublicKey} from '@solana/web3.js';

export type UiL3Level = {
  price: number;
  size: number;
  maker: PublicKey;
  orderId: number;
};

export type UiL3BidAsk = {
  bid: UiL3Level;
  ask: UiL3Level;
};

export type UiL2Level = {
  price: number;
  size: number;
};

export type UiL2BidAsk = {
  bid: UiL2Level;
  ask: UiL2Level;
};
