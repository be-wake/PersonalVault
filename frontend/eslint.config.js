// ESLint 9 flat config — uses eslint-config-next (Next.js 16 / ESLint 9).
// "core-web-vitals" extends the base config with stricter Next.js rules.
const nextConfig = require('eslint-config-next/core-web-vitals');

module.exports = [
  ...nextConfig,
  {
    rules: {
      // Allow unused vars/params prefixed with _ (codebase convention)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
