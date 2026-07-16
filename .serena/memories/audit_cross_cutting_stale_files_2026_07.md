# Cross-cutting stale-file audit (2026-07-02)

Scope: repo-wide cross-cutting only (orphaned workspace pkgs / byte-identical dupes / tracked build artifacts).

## Findings
1. **No orphaned workspace packages.** All 14 @patina/* packages + 3 services are listed as a dependency of at least one app/service/package (verified by grepping every package.json dep block). aesthete-inference = Python (no package.json), studios/help-system-studio + apps are entry points (no importers expected).
2. **No tracked dist/.next/.turbo/coverage/out/*.tsbuildinfo.**
3. **BUT ~446 stray co-located tsc outputs committed** (.js/.d.ts/.js.map/.d.ts.map sitting next to their .ts source). Real build target is gitignored `dist/` (services: `main: dist/main.js`, `start:prod: node dist/main`, `nest build`). Concentration: services/projects/src+test+prisma (382), services/media/src+test (33), packages/patina-design-system root configs (13), apps/designer-portal test/e2e .d.ts.map (10), packages/cache (4), apps/admin-portal test .d.ts.map (4). services/orders src is clean.
4. **Committed generated Prisma clients** (66 files incl 6 native .dylib.node/.so.node) under services/{media,orders,projects}/src/generated/prisma-client — regenerated on `postinstall: prisma generate`, so redundant in git.
5. **packages/supabase/supabase/** = stale stub (migrations 00001/00002 + seed.sql byte-identical to root; last touched initial-setup 2026-03-08; root supabase/ has 253 migration files, updated today). config.toml may still back the package's `supabase` CLI scripts.
6. Doc byte-identical dupes: "Chrome ext/io-mobile-Capture/patina-mobile-ux-flow.html" (misplaced copy of ios-Capture), wireframes mobile-immersive-exp-v2.html == mobile-immersive-experience.html, portal-vs-desk-feature-gap-matrix{,-v2}.{html,md} dual-homed in docs/product + docs/design/the-document.

## NOT stale (verified used, do not flag)
- Portal-local component copies (style-tag/score-circle/detail-row/strata-mark/loading-strata) duplicated vs @patina/catalog-ui — all actively imported in each portal (refactor opp, not removable).
- help-system/src/reference/* — exported from package index.ts (public API).
- Cross-app source dupes (gdpr.ts ×3, api routes, jest configs) — each used by its own app.
