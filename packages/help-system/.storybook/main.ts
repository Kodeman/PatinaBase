import type { StorybookConfig } from '@storybook/react-vite'
import path from 'path'
import fs from 'fs'

// Resolve the @patina/design-system source CSS via workspace symlink.
// node_modules/@patina/design-system is a symlink → ../../../patina-design-system
// We walk up to find it so we don't depend on dist/styles.css being built.
function resolveDesignSystemGlobalsCss(): string {
  const candidates = [
    // Via local node_modules workspace symlink (pnpm)
    path.resolve(__dirname, '../node_modules/@patina/design-system/src/styles/globals.css'),
    // Via root node_modules (hoisted)
    path.resolve(__dirname, '../../../../node_modules/@patina/design-system/src/styles/globals.css'),
    // Direct monorepo path (worktree)
    path.resolve(__dirname, '../../../../patina-design-system/src/styles/globals.css'),
    // Fallback: dist (if built)
    path.resolve(__dirname, '../node_modules/@patina/design-system/dist/styles.css'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(
    `[help-system/.storybook] Cannot locate @patina/design-system globals.css.\nTried:\n${candidates.join('\n')}`,
  )
}

const designSystemGlobalsCss = resolveDesignSystemGlobalsCss()

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (config) => {
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          '@': path.resolve(__dirname, '../src'),
          // Map @patina/design-system/styles.css → resolved source globals.css
          // so preview.ts can import it without a pre-built dist/styles.css.
          '@patina/design-system/styles.css': designSystemGlobalsCss,
        },
      },
    }
  },
}

export default config
