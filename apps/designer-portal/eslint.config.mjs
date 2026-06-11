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

  // ── The Document: D4 shadow ban (CI-blocking), scoped per ruling R3 ──
  // Zero shadows on Document surfaces — depth comes from value contrast and
  // flat stacked edges (spec v1.1 §10). Scope widens app-wide at the
  // dissolve step (D7); old zones are untouched until then.
  {
    files: [
      'src/app/(document)/**/*.{ts,tsx}',
      'src/components/document/**/*.{ts,tsx}',
      'src/lib/document/**/*.{ts,tsx}',
      'src/hooks/use-desk-engagements.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: String.raw`Literal[value=/(^|[\s'":])(drop-)?shadow-(?!none)/]`,
          message:
            'D4/R3: no shadow-* utilities on Document surfaces. Depth = value contrast + flat stacked edges (spec v1.1 §10). shadow-none is allowed to neutralize primitives.',
        },
        {
          selector: String.raw`TemplateElement[value.raw=/(^|[\s'":])(drop-)?shadow-(?!none)/]`,
          message:
            'D4/R3: no shadow-* utilities on Document surfaces (template literal). Depth = value contrast + flat stacked edges (spec v1.1 §10).',
        },
        {
          selector: String.raw`Literal[value=/box-shadow|drop-shadow\(/]`,
          message: 'D4/R3: no box-shadow/drop-shadow CSS on Document surfaces (spec v1.1 §10).',
        },
        {
          selector: String.raw`TemplateElement[value.raw=/box-shadow|drop-shadow\(/]`,
          message: 'D4/R3: no box-shadow/drop-shadow CSS on Document surfaces (spec v1.1 §10).',
        },
        {
          selector: "Property[key.name='boxShadow'], Property[key.name='WebkitBoxShadow']",
          message:
            'D4/R3: no boxShadow in inline styles on Document surfaces (spec v1.1 §10).',
        },
      ],
      // Overlay primitives ship shadows; they enter Document surfaces only
      // through Doc* wrappers (components/document/overlays). When a wrapper
      // legitimately needs one of these, exempt that file here explicitly.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@patina/design-system',
              importNames: [
                'Dialog',
                'DialogContent',
                'Popover',
                'PopoverContent',
                'Command',
                'CommandDialog',
                'Tooltip',
                'TooltipContent',
                'Sheet',
                'SheetContent',
                'Drawer',
                'DrawerContent',
                'DropdownMenu',
                'DropdownMenuContent',
              ],
              message:
                'R3: design-system overlay primitives carry shadows — mount them only via Doc* wrappers in components/document/overlays/.',
            },
          ],
        },
      ],
    },
  },
];
