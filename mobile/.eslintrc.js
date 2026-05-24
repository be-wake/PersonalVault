// O2 — ESLint config for Expo / React Native (SDK 54).
// eslint-config-expo provides React, React Native, TypeScript, and hooks rules.
module.exports = {
  extends: 'expo',
  rules: {
    // Allow unused vars prefixed with _ (convention used in the codebase)
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
