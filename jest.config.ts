import { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["<rootDir>/dist"],
  setupFilesAfterEnv: ["jest-expect-message"],
  testTimeout: 3 * 60 * 1000,
  openHandlesTimeout: 0,
};

export default config;
