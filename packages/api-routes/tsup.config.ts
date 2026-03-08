import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'middleware/index': 'src/middleware/index.ts',
    'utils/index': 'src/utils/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: false, // Disabled due to tsconfig conflicts
  sourcemap: true,
  clean: true,
  external: ['next', 'next-auth', 'zod', '@patina/types'],
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'node18',
  platform: 'node',
});
