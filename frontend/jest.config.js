// @ts-check
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const customConfig = {
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
  verbose: true,
  testTimeout: 10000,
  forceExit: true,
};

module.exports = createJestConfig(customConfig);
