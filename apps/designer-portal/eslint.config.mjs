import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// Flat config for ESLint v9. Consumes @next/eslint-plugin-next's native flat
// config directly (FlatCompat -> eslint-config-next crashes under ESLint 9 +
// @rushstack/eslint-patch, and the hoisted eslint-plugin-react-hooks@4 calls
// the removed context.getSource()). Mirrors the next/core-web-vitals ruleset
// plus the repo conventions used in apps/client-portal/.eslintrc.json.
export default [
  {
    ignores: [
      '.next/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.turbo/**',
      'e2e/**',
      'next-env.d.ts',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      // Registered (not enabled) so the codebase's inline
      // `// eslint-disable @typescript-eslint/*` directives resolve instead of
      // erroring "Definition for rule not found". We deliberately do NOT enable
      // @typescript-eslint/recommended (it would add ~180 no-explicit-any errors).
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...nextPlugin.flatConfig.recommended.rules,
      ...nextPlugin.flatConfig.coreWebVitals.rules,
      ...reactHooks.configs.recommended.rules,
      // Repo conventions (match apps/client-portal/.eslintrc.json):
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
