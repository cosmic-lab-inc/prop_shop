// import {
//   mockData,
//   randomName,
//   randomNumber,
//   truncateString,
// } from "@cosmic-lab/prop-shop-sdk";
// import { FundOverview } from "./types";
//
// export function mockFundOverviews(quantity: number = 10): FundOverview[] {
//   const one: FundOverview = {
//     title: truncateString(randomName(4)),
//     investors: randomNumber(1000, 2000),
//     aum: randomNumber(1_500_000, 2_000_000),
//     data: mockData(1_000, 350),
//   };
//   const two: FundOverview = {
//     title: truncateString(randomName(3)),
//     investors: randomNumber(10, 30),
//     aum: randomNumber(300_000, 400_000),
//     data: mockData(100, 230),
//   };
//   const three: FundOverview = {
//     title: truncateString(randomName(1)),
//     investors: randomNumber(500, 600),
//     aum: randomNumber(100_00, 150_000),
//     data: mockData(1_000, 198),
//   };
//
//   const funds: FundOverview[] = [];
//   for (let i = 0; i < quantity; i++) {
//     if (i % 3 === 0) {
//       funds.push(one);
//     } else if (i % 3 === 1) {
//       funds.push(two);
//     } else {
//       funds.push(three);
//     }
//   }
//   return funds;
// }

export {};
