import { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["<rootDir>/dist"],
  setupFilesAfterEnv: ["jest-expect-message"],
  testTimeout: 120_000,
  openHandlesTimeout: 0,
  moduleNameMapper: {
    "@cosmic-lab/prop-shop-sdk": "<rootDir>/packages/sdk/src",
  },
};

export default config;
