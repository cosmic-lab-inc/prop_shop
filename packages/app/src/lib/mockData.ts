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
    aum: randomNumber(1_500_000, 3_000_000),
    data: mockData(100, 3050),
  };
  const two: FundOverview = {
    vault: PublicKey.unique(),
    title: randomName(3),
    investors: randomNumber(10, 30),
    aum: randomNumber(300_000, 400_000),
    data: mockData(100, 230),
  };
  const three: FundOverview = {
    vault: PublicKey.unique(),
    title: randomName(1),
    investors: randomNumber(500, 600),
    aum: randomNumber(100_00, 150_000),
    data: mockData(1_000, 198),
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
