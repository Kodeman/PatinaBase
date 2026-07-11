import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// Flat config for ESLint v9, built directly on eslint-config-next@16's
// native flat export (`eslint-config-next/core-web-vitals` — the base
// recommended ruleset plus @next/eslint-plugin-next's core-web-vitals
// preset, pre-composed). apps/designer-portal/eslint.config.mjs was written
// against eslint-config-next@15, where the package's FlatCompat-wrapped
// output crashed under ESLint 9 + @rushstack/eslint-patch, so it hand-rolls
// the plugin wiring instead. eslint-config-next@16 ships pre-built flat
// arrays with no FlatCompat step, so consuming it directly here is safe and
// simpler. Scope-boxed: lint must run without config errors; fixing
// findings is out of scope for this upgrade (see next-16.2 upgrade notes).
export default [
  ...nextCoreWebVitals,
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.turbo/**',
    ],
  },
];
