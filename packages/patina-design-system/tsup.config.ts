import { defineConfig } from 'tsup'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'tokens/index': 'src/tokens/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    resolve: true,
  },
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  splitting: false,
  minify: false,
  // Inject "use client" directive after build
  // esbuild strips directives during bundling, so we re-inject them
  async onSuccess() {
    // Only inject into main index files (not tokens)
    const filesToPatch = [
      'dist/index.js',
      'dist/index.cjs',
    ]

    for (const file of filesToPatch) {
      const filePath = join(process.cwd(), file)
      try {
        let content = readFileSync(filePath, 'utf-8')
        // Only add if not already present
        if (!content.startsWith('"use client"') && !content.startsWith("'use client'")) {
          content = `"use client";\n${content}`
          writeFileSync(filePath, content, 'utf-8')
          console.log(`✓ Injected "use client" into ${file}`)
        }
      } catch (error) {
        console.warn(`Warning: Could not patch ${file}:`, error)
      }
    }
  },
})
