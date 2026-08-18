# Follow-up: pre-existing Media type debt (surfaced by the Phase 1 merge)

**Status:** open, low priority. Pre-existing on `main`; **not** introduced by Cloudflare Phase 1.
Logged 2026-08-18 when it turned PR #28's `quality` gate red (the merge proceeded past it since the
debt is orthogonal to Phase 1 and GitHub allowed the merge — non-required check).

## What's red

`.github/workflows/` `quality` job runs `tsc --noEmit` over the affected set. Because Phase 1 touched
`packages/types/src/{index,user,catalog-product-summary}.ts`, `@patina/types` became "affected," which
pulls `patina-design-system` into the type-check and surfaces two pre-existing problems in its `Media`
components:

1. **Implicit-`any` parameters** in `packages/patina-design-system/src/components/Media/`:
   - `media-manager.tsx` — lines 271 (`tag`), 393/409/423 (`t`), 573 (`version`), 604 (`usage`)
   - `media-preview-modal.tsx` — 304 (`tag`), 321 (`usage`)
2. **`Cannot find module '@patina/types/media'`** in `media-preview-modal.tsx:22`, `media-uploader.tsx:24`,
   `media-utils.ts:1`, `mobile-media-uploader.tsx:8`, `responsive-media-card.tsx:15`.

`@patina/types` *does* declare the subpath (`"./media": { types: "./dist/media.d.ts", … }` in its
`package.json` exports). So (2) is a **build-ordering gap** — the CI `quality` job type-checks
design-system without first building `@patina/types`'s `dist/`, so `dist/media.d.ts` is absent and the
subpath doesn't resolve. It is not a missing type; it's an unbuilt dependency.

## Why it's not a Phase 1 defect

Phase 1 does not touch any `Media/*` component. These files and their `@patina/types/media` imports
already exist on `main`; the errors were simply never exercised by the affected-set until Phase 1
touched `@patina/types`. Verified: `git diff main..phase1-close/staging-ready` over
`packages/patina-design-system/src/components/Media/` is empty.

## Fix (when picked up)

- **(2) build-ordering:** ensure the `quality` job builds workspace-package dists before type-checking
  (turbo `^build` graph), or that `@patina/types` is built first. This is the same class as the
  deploy-portal stale-dist guard — the type-check needs `@patina/types/dist/media.d.ts` present.
- **(1) implicit-anys:** annotate the seven parameters. Trivial, but touches design-system Media
  components unrelated to any active feature — batch it with other design-system hygiene, not alone.

Verify with `pnpm --filter @patina/designer-portal type-check` after building `@patina/types`.
