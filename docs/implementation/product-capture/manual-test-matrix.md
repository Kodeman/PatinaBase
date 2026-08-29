# Chrome Extension — Manual Test Matrix (v0.3.0)

**Purpose:** The extension side panel cannot be exercised by browser-automation
MCP (it's a Chrome extension surface, not a page `claude-in-chrome` can drive —
see `feedback_chrome_automation_qa_constraints`). This matrix is the canonical
pre-release smoke check. Run after any change to `apps/extension/src/panel/`,
`src/state/`, `src/lib/extraction/*`, or `src/lib/spec-book-placement.ts`.

Rewritten 2026-08-29 for 0.3.0 (W3-E11) — the prior version referenced
`pnpm --filter @strata/extension build` (stale package scope), "Saved to
Catalog" (retired copy — see `CommitBar.tsx`), a trade-pricing column (the
trade region is gated behind a settings toggle now, not the primary save
path), and P0/P1 edge cases (offline queue, vendor confirm/fuzzy-dedupe UI,
compact mode) that no longer exist post-0.3.0 cut (CL-R3, `apps/extension/CLAUDE.md`
Gotchas). See `artifacts/capture-launch-2026-08-29/rulings.md` for the
program's rulings and `copy-inventory.md` for the current button/label text
this matrix checks against.

## Setup

1. **Build a prod-config binary** — either:
   - **CI dry-run artifact** (matches exactly what ships — packaged with the
     real prod `PLASMO_PUBLIC_*` env, verified against
     `apps/designer-portal/wrangler.jsonc`'s prod anon key by the workflow's
     "Verify prod config parity" step):
     ```bash
     gh workflow run extension-cws.yml -f dry_run=true
     RUN_ID="$(gh run list --workflow=extension-cws.yml --limit 1 --json databaseId -q '.[0].databaseId')"
     gh run watch "$RUN_ID"
     gh run download "$RUN_ID" -n patina-capture-0.3.0 -D "$TMPDIR/patina-capture-dl"
     unzip -o "$TMPDIR"/patina-capture-dl/*.zip -d "$TMPDIR/patina-capture-dl/unpacked"
     ```
     (Full detail on this build path, including the artifact-name caveat, is
     in `e2e-prod-walk.md`'s setup section — this matrix reuses it verbatim.)
   - **Local build**: `pnpm --filter @patina/extension build` — produces
     `apps/extension/build/chrome-mv3-prod` from your local
     `apps/extension/.env.development`/shell env. Faster, but only as
     trustworthy as your local env vars matching prod.
2. Chrome → `chrome://extensions` → enable **Developer mode** → **Load
   unpacked** → select `apps/extension/build/chrome-mv3-prod` (local build) or
   `$TMPDIR/patina-capture-dl/unpacked` (CI artifact — it's the packaged
   zip's contents, load the unzipped folder, not the zip itself).
3. **Sign in at app.patina.cloud first**, in a normal tab, before opening the
   side panel — the panel adopts that session automatically via the portal's
   `sb-<project-ref>-auth-token` cookie (`src/hooks/use-portal-session.ts`,
   `src/lib/portal-cookie.ts`). Signing into the panel's own QR/email flow
   (`AuthScreen.tsx`) is the fallback, not the daily path.
4. Pin the extension to the toolbar (puzzle-piece menu → pin).

## Test sites

Real product pages, not domain patterns — where a fixture harvest already
verified a live URL (`apps/extension/src/__tests__/fixtures/README.md`,
2026-08-29), that URL is used below so this row also cross-checks the jsdom
extraction fixture. IKEA has no harvested fixture; its URL pattern is
noted since IKEA rotates specific product URLs — pick any current
`ikea.com/us/en/p/...` sofa/chair/table page.

| # | Site | URL | Type | Why this site |
|---|---|---|---|---|
| 1 | IKEA | `ikea.com/us/en/p/...` (any current sofa/chair/table page) | Big-box retailer | JSON-LD heavy, lazy-loaded gallery |
| 2 | West Elm | `https://www.westelm.com/products/harris-sofa-96-h4614/` | Direct brand | Client-rendered (curl 403s — Williams-Sonoma WAF); compact case (manufacturer = retailer) |
| 3 | CB2 | `https://www.cb2.com/berkeley-78-jade-performance-velvet-sofa/s450191` | Direct brand | Same WAF as West Elm; compact case |
| 4 | Wayfair | `https://www.wayfair.com/furniture/pdp/ebern-designs-traditional-upholstered-standard-sofa-with-square-armrests-and-2-throw-pillows-w112266288.html` | Retailer-only | Hover-loaded gallery, largest known fixture page |
| 5 | Design Within Reach | `https://www.dwr.com/living-lounge-chairs/eames-lounge-chair-and-ottoman/5667.html?lang=en_US` | Retailer with distinct manufacturer | Brand shown as text above the title ("Herman Miller"); Item No. 100077567 is SKU-shaped — the sharpest CL-R12 (manufacturer ≠ retailer) test |
| 6 | Herman Miller | `https://www.hermanmiller.com/products/seating/lounge-seating/eames-lounge-chair-and-ottoman/` | Direct brand | Compact case; cookie-consent modal blocks content until dismissed — confirm the panel still extracts after you dismiss it |
| 7 | Hedge House Furniture | `https://hedgehousefurniture.com/products/white-oak-marie-nightstand-114010-in-stock` | Indie Shopify maker | Dimensions/wood/finish are freeform paragraph copy, not structured fields — tests the `low`/`medium` end of extraction, not JSON-LD-heavy sites |

## Per-row checklist

For each row: open the URL, open the side panel (toolbar icon or
`Ctrl+Shift+S` / `Cmd+Shift+S`), fill the table below, then run **one**
destination through to its terminal screen (S4 "Saved to your library" or
S5 "Sent to your inbox" — `src/screens/TerminalScreens.tsx`) per the
suggested distribution so all four destinations get covered across the
seven rows:

| Row | Destination to exercise |
|---|---|
| 1 IKEA | Save to library |
| 2 West Elm | Save to library |
| 3 CB2 | Save to project room (`fill_slot` or `create_line` — open a room with an empty FF&E line first) |
| 4 Wayfair | Save to project room |
| 5 DWR | Send to inbox |
| 6 Herman Miller | Send to inbox |
| 7 Hedge House | Send for client approval (client decision) — **use a throwaway `designer_clients` row**, per the prod-write-probe README's warning (`apps/extension/scripts/README.md`): a real client gets emailed and a real `client_decisions` row lands `pending`. |

| # | Site | Session adopted | Extraction ≥ medium | Brand correct (page, not domain) | Retailer correct | Price + currency | Dimensions row populated | SKU present | Save → library | Save → project room | Send → inbox | Client decision | Seconds-to-save |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 |   |   |   |   |   |   |   |   |   |   |   |   |   |
| 2 |   |   |   |   |   |   |   |   |   |   |   |   |   |
| 3 |   |   |   |   |   |   |   |   |   |   |   |   |   |
| 4 |   |   |   |   |   |   |   |   |   |   |   |   |   |
| 5 |   |   |   |   |   |   |   |   |   |   |   |   |   |
| 6 |   |   |   |   |   |   |   |   |   |   |   |   |   |
| 7 |   |   |   |   |   |   |   |   |   |   |   |   |   |

For the four destination columns: mark ✅ (terminal screen reached) or ❌ for
the ONE destination you actually ran per the distribution table above; mark
the other three `n/a` for that row.

### Acceptance per row

- **Session adopted** → panel opens straight to the capture screen, no
  `AuthScreen.tsx` sign-in prompt (`src/hooks/use-portal-session.ts` restored
  a session from the portal cookie).
- **Extraction ≥ medium** → there is **no raw confidence score in the UI**
  since CL-R15 (`InsightRegion.tsx`, `FieldBadge.tsx` show only per-field
  verdigris/rust badges, never a number). Proxy: Region C's "Patina insight"
  reads "Read *N* of 8 fields from *host*" (`InsightRegion.tsx:44-49`) with
  **≤2 fields flagged** ("need a look" list); a `low`-confidence page (row 7)
  is exempt from this bar. To see the actual `confidence` string
  (`high`/`medium`/`low`) after saving, check the `product.captured` PostHog
  event's `confidence` property (see `e2e-prod-walk.md`'s analytics step) —
  it is emitted, just not rendered.
- **Brand correct (page, not domain)** → the "Brand" row in Region A
  (`RecordRegion.tsx:230-235`) shows only when a vendor is linked
  (`draft.manufacturer.vendor?.name ?? draft.retailer.vendor?.name`), and its
  value must be the brand as printed on the page — not a name derived from
  the URL/domain.
- **Retailer correct** → there is **one** Brand field, not separate
  manufacturer/retailer cards — this column is only meaningfully testable on
  a retailer site that names a distinct manufacturer (row 5, DWR). Pass =
  Brand reads "Herman Miller" (the manufacturer named on the page), not
  "Design Within Reach" or a domain-derived guess. On direct-brand rows
  (2, 3, 4 partial, 6) mark `n/a` — retailer and manufacturer are the same
  entity there.
- **Price + currency** → Region A's Price row (`RecordRegion.tsx:204-227`)
  shows the correct amount with the correct glyph
  (`CURRENCY_GLYPHS` — `$`/`CA$`/`£`/`€`, falling back to the bare ISO code);
  all seven sites here are USD, so pass = a plain `$` and a number matching
  the page.
- **Dimensions row populated** → Region A's Dimensions row shows a non-empty
  width/height/depth triple *before* you type anything
  (`RecordRegion.tsx:266-324`, `hasAnyDimValue`) — fail if you had to type
  in a dimension yourself to make the row "populated."
- **SKU present** → the "SKU / model #" row (`RecordRegion.tsx:237-264`) is
  pre-filled, not showing the `+ Add SKU` prompt — this is the newest
  extraction field (CL-R1/D6, landed in parallel with this lane); DWR's
  "Item No. 100077567" is the strongest candidate to actually pass this.
- **Save → library / project room / inbox / client decision** → the terminal
  screen for that path is reached (S4 `"Saved to your library"`, S5
  `"Sent to your inbox"`, or the decision sheet's `"Sent for approval"` /
  `"The client has been notified."` — `DecisionSheet.tsx:41-42`) with no
  error banner. For "project room," additionally confirm the FF&E line now
  shows `product_id` set (portal Spec Book, or the SQL check in
  `e2e-prod-walk.md`).
- **Seconds-to-save** → wall-clock from clicking the toolbar icon on the
  product page to the terminal screen appearing.

## Edge cases to verify

| Case | Setup | Expected |
|---|---|---|
| **Pinterest pin** (known-bad domain) | Navigate to any `pinterest.com/pin/...` URL (e.g. `https://www.pinterest.com/pin/378724649918852625/`, the harvested fixture — a board/roundup pin, not a product) and open the panel | The R5 error screen (`TerminalScreens.tsx:79-120`) shows **exactly** `"This page doesn't carry product details. Snapshot it, or add the piece by hand."` (`KNOWN_BAD_DOMAIN_MESSAGE`, `src/lib/mode-detection.ts:68-69`) — with **Snapshot** and **By hand** buttons but **no Retry** button (`isKnownBad` check, `TerminalScreens.tsx:85,94`; retrying a known-bad domain is a dead end by design, CL-R14). |
| **Offline save** | Open a product page, let extraction complete, then DevTools → Network → Offline, then attempt any save | **⚠ Correction to the brief's assumption**: there is **no dedicated offline UX** in this build. The 0.3.0 cut removed the offline queue entirely (CL-R3, W1-E5 — `apps/extension/CLAUDE.md` Gotchas: "Offline queue... removed in 0.3.0... do not reintroduce without a producer/assets/linking path"). A repo-wide grep for `offline`/`navigator.onLine`/"you're offline" in `apps/extension/src` turns up nothing in UI code. So the save attempt fails through the ordinary Supabase-error path: `CommitBar.tsx`'s `run()` catches the thrown error, `errMsg()` stringifies it, and `RecordScreen.tsx:16-20` renders it inline as a rust-colored banner on the capture screen (the panel does **not** navigate to R5 for this — R5/`ErrorScreen` is extraction-failure-only). Expect a generic network-failure string (commonly `"Failed to fetch"` from the browser `fetch` layer) — record whatever string actually appears; if it reads as a genuinely unhelpful message, that's a product gap to flag, not a test failure. |
| **Duplicate URL** | Save any product from row 1–6 to the library once, then re-open the panel on the **same URL** | Exact-URL dedup fires (`state/reducer.ts` "dedup" block); `RecordScreen.tsx:22-31` shows the brass "Looks like one you have" banner naming the existing item, and `CommitBar.tsx:116-135` swaps the footer to `Update "{name}"` (brass primary) / `Save as new` (secondary) — confirm the literal quoted product name matches the earlier capture, and that clicking Update reaches S4 with the existing product's row updated in place (`updateExisting` in `state/effects.ts`), not a second product row created. |

## Metrics rollup

After running the matrix, compute:

| Metric | Target | This run | Pass? |
|---|---|---|---|
| Session adopted | 7/7 | __/7 |   |
| Extraction ≥ medium (proxy: ≤2 fields flagged) | ≥6/7 (row 7 indie is the expected exception) | __/7 |   |
| Brand correct | 7/7 when a vendor is linked | __/7 |   |
| Retailer correct (row 5 only; others `n/a`) | 1/1 | __/1 |   |
| Price + currency correct | 7/7 | __/7 |   |
| Dimensions pre-populated | ≥5/7 | __/7 |   |
| SKU pre-populated | ≥1/7 (DWR is the strongest candidate) | __/7 |   |
| All four destinations reached their terminal screen at least once across the 7 rows | 4/4 | __/4 |   |
| Median seconds-to-save (known vendors, rows 1–6) | <10s | __s |   |

## After the run

Update `docs/implementation/product-capture/progress.md` with the date,
pass/fail per row, any extraction regressions found (cross-check against
`artifacts/capture-launch-2026-08-29/extraction-report.json` if the same
site/product was in the jsdom fixture harvest), and any new TODOs surfaced.
