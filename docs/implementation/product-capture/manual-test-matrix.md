# Chrome Extension — Manual Test Matrix

**Purpose:** The extension toolbar UI cannot be exercised by browser-automation MCP. This matrix is the canonical pre-release smoke check. Run after any change to `apps/extension/src/sidepanel.tsx`, the `lib/extraction/*` modules, or the vendor/trade-pricing components.

## Setup

1. `pnpm --filter @strata/extension build`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/build/chrome-mv3-prod`
3. Sign in to `app.patina.cloud` in another tab so the cookie bridge can pick up the session, OR use the QR auth flow.
4. Open the Patina Capture side panel.

## Test sites

Pick one product page per row. Note that hostnames may change — replace with current equivalent if needed.

| # | Site | URL pattern | Type | Why this site |
|---|---|---|---|---|
| 1 | IKEA | `ikea.com/us/en/p/...` | Big-box retailer | JSON-LD heavy, lazy-loaded gallery |
| 2 | West Elm | `westelm.com/products/...` | Direct brand | Compact-mode test (manufacturer = retailer) |
| 3 | CB2 | `cb2.com/...` | Direct brand | Trade-account program present |
| 4 | Wayfair | `wayfair.com/furniture/pdp/...` | Retailer-only | Hover-loaded gallery, range pricing |
| 5 | Design Within Reach | `dwr.com/...` | Retailer with manufacturer brand | Trade tier display, retailer ≠ manufacturer |
| 6 | Herman Miller | `hermanmiller.com/products/...` | Direct brand | Compact-mode + high-confidence vendor |
| 7 | One indie brand | (any small-batch furniture site) | Unknown | Tests `low` confidence + inline-create flow |

## Per-row checklist

For each row, capture the following. Mark ✅ / ❌ / ⚠️ and add notes. Empty ones to the right of the table.

| # | Side panel opens | Extraction confidence ≥ Medium | Vendor auto-match correct | Trade-pricing displays | Save success | Time to save (sec) | Notes |
|---|---|---|---|---|---|---|---|
| 1 |   |   |   |   |   |   |   |
| 2 |   |   |   |   |   |   |   |
| 3 |   |   |   |   |   |   |   |
| 4 |   |   |   |   |   |   |   |
| 5 |   |   |   |   |   |   |   |
| 6 |   |   |   |   |   |   |   |
| 7 |   |   |   |   |   |   |   |

### Acceptance per row

- **Side panel opens** → click extension icon, panel renders without auth screen.
- **Extraction confidence** → debug panel shows `confidence: medium` or `high`. Low is a fail unless the page is genuinely sparse.
- **Vendor auto-match** → manufacturer or retailer card shows up with `Matched` (exact) or `Likely match` (high). For row 7 (indie), expect `+ Link existing` / `+ Create new` buttons.
- **Trade-pricing displays** → if vendor has a trade program, expect "your price" line OR "Apply for trade access" CTA. Hidden if no program is set up — that's OK, note as "n/a".
- **Save success** → footer button transitions to "Saved to Catalog" / "Vendor Saved" with sage background.
- **Time to save** → from sidepanel render to save success. Spec target <10s for matched vendors.

## Spec metrics rollup

After running the matrix, compute against spec §12 targets:

| Metric | Target | This run | Pass? |
|---|---|---|---|
| Products with vendor link | >80% | __/7 = __% |   |
| Vendor detection accuracy | >90% for known retailers (rows 1–6) | __/6 = __% |   |
| Capture completion time | <10s for matched vendors | median __s |   |
| Trade-pricing display rate | 100% when account exists | __/__ |   |
| New-vendor creation rate | <20% | __/7 = __% |   |

## Edge cases to verify

- [ ] **Compact mode (P0-2)** — On row 2 or 6 (direct brand), confirm a single "Vendor (Direct)" card renders, not two separate manufacturer/retailer cards.
- [ ] **Confirm button (P0-1)** — On a high-confidence (not exact) match, confirm clicking "Confirm" snaps the badge to "Matched" with a check icon.
- [ ] **Fuzzy duplicate prompt (P0-5)** — On row 7, type a name that already exists in vendors (e.g., "Herman Miller Co" → existing "Herman Miller"). Expect dedupe prompt before insert.
- [ ] **Save+Favorite (P0-6)** — Switch to vendor mode on an About page. Click "Save + Fav" — confirm a `saved_vendors` row exists for the user/vendor.
- [ ] **Offline queue** — DevTools → Network → Offline → capture → bring back online → confirm queue drains and the vendor inserts before the product (background.ts vendor-first sync).
- [ ] **No-images allow save (P1-9)** — Find a product page where `images.ts` returns 0 images (rare) — confirm save is allowed with the warning, not blocked.
- [ ] **Failed vendor create (P1-9)** — Force a vendor insert failure (e.g., RLS denial) — confirm the product still saves with `vendor_id = null` and the error message surfaces.

## After the run

Update `docs/implementation/product-capture/progress.md` with:
- Date of run
- Pass/fail per row
- Any extraction regressions found
- Any new TODOs surfaced
