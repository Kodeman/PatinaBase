# Designer portal client bundle (SQ-952)

Measured from `main @ 515263fcc`, built in this ticket's worktree with
`pnpm --filter @patina/designer-portal analyze` (= `ANALYZE=true next build --webpack`, Next 16, 1 m 22 s).
Raw numbers: `data/bundle.json` (webpack-bundle-analyzer report parsed by `harness/bundle.mjs`) and
`data/local-jsweight.json` (what a signed-in hard load actually fetched, `harness/lab.mjs jsweight`).
Chunk hashes are from this local build; prod hashes differ.

"Parsed" = minified bytes, "gzip" = analyzer gzip size (cross-checked with `zlib.gzipSync` of the file:
within 0.5 KB for every top chunk).

## Totals

- 269 client chunks, 4.90 MB gzip in total (including async chunks most routes never load).
- Shared root files on every route (`build-manifest.json` rootMainFiles + polyfills): 5 files, 162.9 KB gzip / 528.5 KB raw.

## Per-route client JS (signed-in hard load, gzip as transferred)

| Route (hard load) | JS files | Gzip transferred | Decoded |
|---|---:|---:|---:|
| `/auth/signin` (signed out) | 35 | 1,074.7 KB | 3,756.8 KB |
| `/desk` | 57 | 1,586.0 KB | 5,470.0 KB |
| `/doc/[id]` | 65 | 1,935.3 KB | 6,735.5 KB |
| `/doc/[id]/pieces` | 63 | 1,671.0 KB | 5,759.3 KB |
| `/people` | 59 | 1,644.8 KB | 5,682.9 KB |
| `/library` | 59 | 1,611.1 KB | 5,552.0 KB |

Source: `data/local-jsweight.json` (top chunks per route listed there). Chunks `9078` (216.6 KB),
`6386` (112.6 KB) and `d25a86d5` (97.9 KB, crypto-browserify) load on every route, sign-in included.

Next 16 no longer writes `entryJSFiles` into `page_client-reference-manifest.js`, so the per-route
figure is taken from the browser (every `.js` resource fetched by the load, `encodedBodySize`, `next start`
gzip), not from build manifests.

## Top chunks (gzip)

| Chunk | gzip KB | parsed KB | Loaded | What is in it |
|---|---:|---:|---|---|
| `04b411a3.*` (async) | 1709.6 | 4831.3 | dynamic import only | `@sparkjsdev/spark` (splat viewer) |
| `app/(document)/doc/[id]/page-*` | 222.6 | 819.9 | `/doc/[id]` | 766 KB of `src/app` code (the 4,112-line page), 36 KB `src/lib` |
| `9078-*` | 213.5 | 768.3 | shared | lucide-react 449, @tanstack/table-core 52, file-selector 30, framer-motion 29, react-dropzone 28, date-fns 28, react-day-picker 21, radix (≈95) |
| `3668.*` (async) | 171.0 | 411.9 | dynamic | pdf-lib + standard fonts + pako |
| `db534642.*` (async) | 136.3 | 401.9 | dynamic | xlsx |
| `0323052c.*` (async) | 118.3 | 401.9 | dynamic | pdfjs-dist |
| `6386-*` | 112.2 | 490.7 | shared | `packages/supabase` 472.5 (hooks + clients), `packages/utils` 16.6 |
| `7268-*` | 109.8 | 391.1 | shared | portal `src/components` 263, `src/lib` 97.5, `src/hooks` 29 |
| `d25a86d5-*` | 97.6 | 317.7 | shared | **`next/dist/compiled/crypto-browserify` only** |
| `6034-*` | 79.2 | 300.3 | shared | `packages/patina-design-system` 299.5 |
| `8beefcf0.*`, `add11241.*` (async) | 73.8 + 62.3 | 314.7 + 227.7 | dynamic | three.js |
| `app/(document)/board/[boardId]/page-*` | 69.5 | 236.2 | `/board/[id]` | page code |
| `5752-*` | 68.4 | 254.0 | shared | portal `src/components` 220.8 |

## (a) The ~325 KB crypto-browserify chunk — hypothesis CONFIRMED (cause refined)

`static/chunks/d25a86d5-*.js` is 317.7 KB parsed / 97.6 KB gzip and contains exactly one module,
`next/dist/compiled/crypto-browserify/index.js`. That is Next's browser fallback for Node's `crypto`.
Import chain:

1. a client component imports anything from `@patina/utils` (the package is in `transpilePackages`,
   `next.config.js:5`, and webpack resolves it to source: the analyzer shows
   `packages/utils/src/index.ts + 18 modules (concatenated)` inside chunk `6386-*`);
2. `packages/utils/src/index.ts:6` — `export * from './crypto';`
3. `packages/utils/src/crypto.ts:5` — `import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'crypto';`
4. webpack's client fallback for `crypto` → `next/dist/compiled/crypto-browserify`.

Refinement: the "CommonJS so it can't tree-shake" part is **refuted** for the client build — the
source is ESM and is module-concatenated. The polyfill still ships because `crypto.ts` imports the
Node built-in and the barrel re-exports it; crypto-browserify itself is CommonJS with side effects,
so webpack keeps it once anything reaches `./crypto`.

## (b) The ~790 KB "MIME-table" chunk — source FOUND; it is mostly icons, not MIME

The only chunk with a MIME table is `9078-*` (768.3 KB parsed / 213.5 KB gzip; 840 occurrences of
`application/`). The MIME table is `file-selector/dist/es2015/file.js` (26 KB parsed), pulled in by
`react-dropzone` (`dist/es/index.js` 21 KB + `utils` 8 KB), which is imported by
`packages/patina-design-system/src/components/Media/media-uploader.tsx`.

The bulk of the chunk is **lucide-react: 449 KB parsed, all 1,584 icon modules**
(`lucide-react/dist/esm/icons/*.js`), although `lucide-react@0.544.0` declares `"sideEffects": false`
and every grep-visible import in `apps/designer-portal/src` and `packages/*/src` is a named import.
The importer that defeats tree-shaking was **not identified** inside this timebox (candidates to check:
the design system's `dist/index.js`, which imports `lucide-react` and is consumed through
`transpilePackages`, and `optimizePackageImports` in `next.config.js:262`). The rest of the chunk is the
design system's third-party set: @tanstack/table-core 52, framer-motion 29, date-fns 28,
react-day-picker 21, embla-carousel 16, @tanstack/virtual-core 15, @radix-ui/* ≈95.

## Design system

`packages/patina-design-system` is consumed as one built file (`package.json` `"module": "./dist/index.js"`,
`"sideEffects": ["*.css", "dist/styles.css"]`). In the client build it lands as chunk `6034-*`
(299.5 KB parsed / 79.2 KB gzip) and its dependencies as most of `9078-*`.

## Prod cross-check

On app.patina.cloud every `_next/static` asset (chunks, CSS, woff2) is served with
`cache-control: public, max-age=0, must-revalidate`. A hard load of `/doc/[id]` re-validated all 63
scripts (63 × 304, `transferSize` 300 B each) before the page's first Supabase request could start
(`data/prod-walk.json` → `staticAssetCaching`).
