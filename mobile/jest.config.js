/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
  verbose: true,
  testTimeout: 10000,
  forceExit: true,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
