# Chrome Extension

Plasmo-based extension for product capture from e-commerce sites. v0.3.0.

## Commands

```bash
pnpm --filter @patina/extension dev   # Dev mode with HMR
pnpm --filter @patina/extension build # Production build

# Gate (PR-time, via scripts/verify-affected.sh):
pnpm --filter @patina/extension type-check && pnpm --filter @patina/extension test && pnpm --filter @patina/extension build && bash apps/extension/scripts/check-bundle.sh
```

## Lint

No ESLint for the extension in v1 — there is no shared ESLint config in the repo for it to extend. This is a decision, not an omission: the gate is type-check + vitest + the bundle-marker check above.

## Architecture

**Important**: All entry files must be in `src/` directory (Plasmo requirement when `src/` exists)

- `src/sidepanel.tsx` — Main sidebar UI (opens when clicking extension icon)
- `src/background.ts` — Background service worker: `refresh-token` alarm (30-min re-auth), context menus (capture page/image/selection), the `capture-product` command (Ctrl/Cmd+Shift+S), and message relays (`chrome.runtime.onMessage`) between content script and panel
- `src/contents/extractor.ts` — Content script for page data extraction
- `src/lib/extraction/` — Extraction modules: price, images, materials, dimensions, color-finish, metadata, manufacturer, retailer, vendor. Known-bad domains (Pinterest, Instagram) and their fallback message live in `src/lib/mode-detection.ts`
- `src/state/` — The capture state machine: `reducer.ts` + `types.ts` (draft/routing/dedup/session/io slices), `effects.ts` (the 5 save paths — library, project room, inbox, decision, update), `CaptureProvider.tsx`
- `src/panel/regions/` — Record (extracted fields), Insight (confidence summary), RouteCommit (destination picker) — composed into the screens below
- `src/overlays/` — Sheets: Account, CreateProject, Decision, ImageSelect, Insight (expanded), RecentCaptures, Settings
- `src/screens/` — C1 `ExtractingScreen`, C2/R1 `RecordScreen`, R2 `SnapshotScreen`, R5/S4/S5 `TerminalScreens`, vendor mode `VendorScreen`
- `src/components/` — Shared UI (`AuthScreen`, `FFESlotPicker`, ...)

## Key Patterns

- Per-field confidence badges (verified/read/edited/needs check) — **no raw confidence score in the UI** (CL-R15; `FieldBadge.tsx`). The extractor's `high`/`medium`/`low` score is still computed and sent to PostHog, just never rendered.
- Sticky project/room and route kind (`saveSpecBookPlacementContext`, `spec-book-placement.ts`) — remembered across captures within a session.
- The capture note lives in `products.capture_provenance.note` — **never `products.usage_notes`**, which is the separate Layer-2 "how to use this piece" field written at studio-promotion time (`payloads.ts:34-49`).
- Portal session cookie adoption (`use-portal-session.ts`) is the primary sign-in path; QR pairing (`qrcode.react` + `use-qr-auth.ts`, `AuthScreen.tsx`) is the fallback for a bare install with no portal session.

## Gotchas

- **Portal session cookie**: the extension reads the portal's `sb-<project-ref>-auth-token` cookie (`base64-`-prefixed, chunked `.0/.1`). Use the existing decoder — never `JSON.parse` it — and keep the env below pointed at the SAME Supabase project as the portals (Strata in prod), or decode fails.
- **Offline queue, OCR, and trade pricing were removed in 0.3.0 (capture-launch W1) — do not reintroduce without a producer/assets/linking path.** Also removed in 0.3.0: `@patina/catalog-ui`, `tesseract.js`, `@plasmohq/storage` deps and vendor certifications (CL-R16).
- **Permissions model**: `https://*/*` host permission, with the justification in `docs/design/capture-launch/permissions-justification.md`; `http://*/*` dropped in 0.3.0.
- **Capture note ≠ `usage_notes`**: `capture_provenance.note` (extension) and `products.usage_notes` (Layer-2 promotion field, portal-only) are different columns with different owners — never conflate them when reading or writing either.
- The `react`/`react-dom` aliases in `package.json` are kept as insurance against a duplicate-React resolution inside Plasmo's bundler, even though nothing currently forces the dupe — don't remove without confirming the bundler still dedupes correctly.

## Environment

```
PLASMO_PUBLIC_SUPABASE_URL
PLASMO_PUBLIC_SUPABASE_ANON_KEY
PLASMO_PUBLIC_PORTAL_URL
PLASMO_PUBLIC_POSTHOG_KEY
```

## Related docs

- `docs/specs/_active/product-capture.md` — capture flow spec
- `docs/design/capture-launch/cws-listing.md` — Chrome Web Store listing copy
- `docs/design/capture-launch/permissions-justification.md` — per-permission justification
- `docs/implementation/product-capture/manual-test-matrix.md` — 7-site extraction smoke test
- `docs/implementation/product-capture/e2e-prod-walk.md` — all-5-write-paths prod walk + verification
- `apps/extension/scripts/README.md` — `prod-write-probe.mjs`, the scripted RLS write-path probe
