import {
  FundOverview,
  mockData,
  randomName,
  randomNumber,
} from "@cosmic-lab/prop-shop-sdk";
import { PublicKey } from "@solana/web3.js";

export function mockFundOverviews(quantity: number = 10): FundOverview[] {
  const one: FundOverview = {
    vault: PublicKey.unique(),
    title: randomName(2),
    investors: randomNumber(3_000, 5_000),
    tvl: randomNumber(1_500_000, 3_000_000),
    data: mockData(100, 3050),
    lifetimePNL: randomNumber(3_000, 5_000),
    volume30d: randomNumber(3_000, 5_000),
    birth: new Date(),
  };
  const two: FundOverview = {
    vault: PublicKey.unique(),
    title: randomName(3),
    investors: randomNumber(10, 30),
    tvl: randomNumber(300_000, 400_000),
    data: mockData(100, 230),
    lifetimePNL: randomNumber(300_000, 400_000),
    volume30d: randomNumber(300_000, 400_000),
    birth: new Date(),
  };
  const three: FundOverview = {
    vault: PublicKey.unique(),
    title: randomName(1),
    investors: randomNumber(500, 600),
    tvl: randomNumber(100_00, 150_000),
    data: mockData(1_000, 198),
    lifetimePNL: randomNumber(300_000, 400_000),
    volume30d: randomNumber(300_000, 400_000),
    birth: new Date(),
  };

  const funds: FundOverview[] = [];
  for (let i = 0; i < quantity; i++) {
    if (i % 3 === 0) {
      funds.push(one);
    } else if (i % 3 === 1) {
      funds.push(two);
    } else {
      funds.push(three);
    }
  }
  return funds;
}
