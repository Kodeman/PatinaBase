# Bundle baseline: `/desk` and `/doc/[id]`

Captured on the SQ-1815 candidate at `0fabcadf26fa2d8c2cd1dca4227e58d464c946e2` (Room Proof 08 preparation branch), 2026-10-23. These are current-source measurements, not a before/after comparison; no round-8 renderer exists in this baseline.

## Capture

- Node `v24.12.0`; pnpm `9.0.0`; Turbo `2.8.14`.
- Commands: `bash scripts/bootstrap-worktree.sh`, then `pnpm exec turbo run build --filter=@patina/designer-portal^... && ANALYZE=true pnpm --filter @patina/designer-portal analyze && node scripts/bundle-budget.mjs apps/designer-portal/.next`.
- Worktree bootstrap installed frozen-lockfile dependencies and copied six local environment files. No database reset or runtime service was started.
- Workspace dependency build and designer portal webpack analyze build completed. The final budget command exited 1 because `/desk` exceeded its configured budget; this is a measured baseline failure, not a failed build.

## Route totals

Values are raw gzip-byte sums of the route's emitted client chunks as reported by `bundle-budget.mjs`.

| Route | Gzip bytes | Budget | Headroom (budget − measured) | Result |
|---|---:|---:|---:|---|
| `(document)/desk` (`/desk`) | 1,349,791 | 1,346,026 | −3,765 | Over budget by 3,765 bytes |
| `(document)/doc/[id]` (`/doc/[id]`) | 1,687,406 | 1,687,684 | 278 | Under budget by 278 bytes |

Tripwires: 142 lucide icon modules / 200 maximum; 0 client `crypto-browserify` modules and 0 matching client chunks.

## What the budget script counts

`scripts/bundle-budget.mjs` reads `.next/analyze.html` for analyzer `chartData`, then reads `.next/server/app/<route>/page_client-reference-manifest.js`. On this Next 16 manifest format it unions every `clientModules[*].chunks[*]` entry that is a physical `static/chunks/*.js` file, deduplicates by path, and gzip-compresses each emitted file. It does not sum analyzer `gzipSize`; chart data is used for module/tripwire inspection. Current manifests contained 358 client modules each, with 66 unique chunks for `/desk` and 73 for `/doc/[id]`.

A `next/dynamic` renderer chunk is counted **if** Next lists that physical chunk in the route's client-reference manifest `clientModules[*].chunks`; a lazy-only async chunk omitted from that manifest is not counted by the current route sum. Therefore do not infer that a passing route total includes a flag-gated chunk. WP-01 must explicitly identify the round-8 renderer's emitted JS asset in `analyze.html` chartData (the webpack analyzer output) and report its physical path and `gzipSync` byte length. For each route, check whether that exact path is already in the manifest-derived chunk set; report both its standalone gzip size and whether it is included in the route total. Keep legacy statically loaded and round-8 lazily loaded, report the legacy route totals plus the explicit round-8 chunk measurement, and do not treat making legacy lazy as byte savings. `bundle-budget.mjs` and its budgets remain unchanged in this slice.
