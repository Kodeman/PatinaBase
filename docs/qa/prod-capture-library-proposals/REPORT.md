# Production QA — Capture → Library → Proposals (app.patina.cloud designer portal)

**Date:** 2026-06-04
**Target:** https://app.patina.cloud (production designer portal)
**Account:** kody@kochaver.com (role: Designer; prod profile UUID `e01db20f-87c6-45a6-bc18-84c68e0e7452`)
**Driver:** Chrome automation (`mcp__claude-in-chrome__*`), live production session
**Scope (agreed):** Extension + portal capture · build proposals but **stop before send** · current Chrome session · thorough
**Plan:** `/Users/kody/.claude/plans/make-a-plan-to-concurrent-parasol.md`

---

## TL;DR / Verdict

| Flow | Result |
|------|--------|
| **Capture — portal manual add** | ✅ PASS (create 2xx, draft persists, renders on detail) |
| **Capture — CSV/Excel import** | ⚠️ NOT TESTED (blocked by automation tooling — page itself loads 200) |
| **Capture — Chrome extension** | ⚠️ NOT TESTED (extension UI is browser-chrome, not automatable) |
| **Capture — quick-create-draft** | ✅ PASS (created + used inline in proposal picker) |
| **Library — 3-layer (Personal/Studio/Catalog)** | ℹ️ PILOT-GATED on prod for this account — not accessible (by design) |
| **Library — legacy `/portal/catalog` (the live experience)** | ✅ PASS (list/search/filter/grid-list/detail/edit, all on live data) |
| **Mock-fallback false-green audit** | ✅ PASS (data proven live; no silent mock observed) |
| **Proposals — list page `/portal/proposals`** | 🔴 **P0 CRASH** — white-screens in production |
| **Proposals — create + Scope Builder + generate + preview + send-ready** | ✅ PASS (full build path works via `/new`; reached send-ready without sending) |

**Headline:** The **Proposals list page crashes in production** (`TypeError: g.existsSync is not a function` — a Node `fs` API bundled into the client). This is isolated to the **list** route; `/portal/proposals/new` and the proposal editor/scope-builder all work. A designer landing on "Proposals" from the nav gets a blank error page, so the feature is effectively unreachable through normal navigation even though the underlying build flow is healthy.

---

## Important coverage boundaries (automation tooling limits)

These items could **not** be exercised by the browser-automation harness. They are **not** product defects — they're limits of the tools — but they bound what this pass verified:

1. **Chrome extension capture (1A)** — the Patina Capture extension's UI (toolbar icon, side panel) lives in Chrome's browser chrome, **outside the page viewport** the automation can see/click. `navigate` also force-prefixes `https://`, so `chrome://extensions` is unreachable, and `read_console_messages` only reads the page's console (not the extension's). → Recommend a **user-assisted** check: you open the extension on a live product page and capture; I verify the result lands in the catalog (verify-by-effect). The extension is configured for prod (`apps/extension/.env.local` → `https://api.patina.cloud`, portal `https://app.patina.cloud`) and auto-auths off the portal cookie, so a prod-built extension should "just work."
2. **CSV/Excel import (1C)** — `file_upload` no longer accepts host filesystem paths and its loaded schema has no content parameter; `upload_image` only handles screenshots. No way to feed a `.csv`. The import **page** loads fine (200) and the 3-step wizard renders.
3. **Image upload** (product hero image; media → Supabase Storage) — same root cause as #2.
4. **Capture-inbox consume / drag-drop (3F)** — synthetic `left_click_drag` does not trigger HTML5 drag-and-drop, so the "drag a capture onto a room" gesture couldn't be performed. The **Capture Inbox renders** with its pending seed capture ("WestElm Chair").
5. **GIF/screenshot export to disk** — `save_to_disk`/`gif_creator` export produced no accessible file in this environment. Evidence below is therefore network statuses + console traces + step-by-step observations rather than embedded images.

---

## Environment notes (not bugs)

- **Three-layer Library is pilot-gated.** `/portal/library` shows *"Three-layer Library is in pilot … For now, continue using /portal/catalog as usual."* `/portal/library/personal` (and siblings) **redirect** back to the gate. This account isn't in the pilot (feature flag, fail-closed). The **live** library experience for production designers is the legacy `/portal/catalog`, which this pass tested thoroughly.
- **Dashboard "ACTIVE PROJECTS" flashes 0 then loads to 3** — async load, not a bug.
- **AI/Aesthete scores show "—"** in the catalog — engine isn't scoring; expected.
- **Seed clients use `@patina-seed.invalid`** addresses — safe; no real mail could be sent even if a send were attempted.
- Help system is live (Sanity `kv3qrinl` queries all return 200).

---

## Flow 1 — Capture

### 1B. Portal manual add — `/portal/catalog/new` ✅ PASS
- **Validation:** submitting with an empty Product Name fires **no** network POST and stays on the page → blocked client-side. **Minor gap:** no inline error or toast is shown — it's a silent no-op (see PUNCH-2).
- Filled Name `QA-2026-06-04 Manual Chair`, Maker `QA Test Maker`, description, Retail Price `1250`, Lead Time, Dimensions, Material → **Save as Draft**.
- Landed on `/portal/catalog` with the product as the first card (`$1,250 · DRAFT`); the catalog count incremented **13 → 14**.
- **Live-data proof:** `GET https://app.patina.cloud/api/catalog/products` → **200**, and the list contains the product I just created (a static mock fixture could not). Console clean.
- Tier/Category dropdowns didn't visibly open under automation (low confidence — likely an automation interaction quirk, not confirmed a bug; see PUNCH-5, needs manual verify). They're optional; the draft saved fine without them.

### 1C. CSV/Excel import — `/portal/catalog/import` ⚠️ NOT TESTED (tooling)
- Page loads 200; 3-step wizard (Upload → Map Columns → Preview & Import) renders; "Catalog 14" nav count correct.
- Could not upload the prepared CSV (`/tmp/qa-import-2026-06-04.csv`, 2 good rows + 1 missing-name row) — file-upload tooling limit (boundary #2). **No import products were created on prod.**

### 1D. Quick-create-draft ✅ PASS (exercised in Flow 3, step 3C)
- Created `QA-2026-06-04 Draft Sconce` (QA Test Maker, $340) via the proposal product-picker's "Quick-create draft" tab; immediately usable as a line item. This is the `useCreateDraftProduct` path and also seeds a draft product in the personal library.

### 1A. Chrome extension ⚠️ NOT TESTED (tooling boundary #1)

---

## Flow 2 — Library (live `/portal/catalog`)

All checks on live data (legacy catalog page; three-layer pilot gate documented above).

| Check | Result | Evidence |
|-------|--------|----------|
| Catalog list loads | ✅ | `GET /api/catalog/products` 200; 14 products incl. my QA item |
| Search | ✅ | typing `QA-2026-06-04` filtered to exactly 1 result; count → 1 |
| DRAFTS filter | ✅ | showed only my draft; all seed products (ACTIVE) correctly excluded |
| Grid ↔ List toggle | ✅ | List renders table (PRODUCT/PRICE/AI SCORE/ACTIONS + Edit) |
| Product detail | ✅ | renders title/maker/$1,250 "MADE TO ORDER"/Story/Materials; reads `api.patina.cloud/rest/v1/product_relations` & `/products` (live Supabase) |
| Edit Mode + auto-save | ✅ | appended " EDITED-QA" to The Story; indicator → "AUTO-SAVED"; **persisted across a full reload** |
| Personal→Studio promotion | n/a | requires three-layer library (pilot-gated) |
| Image upload (media/storage) | ⚠️ not tested | tooling boundary #3 |
| **Mock-fallback false-green audit** | ✅ PASS | every product list backed by a 2xx call; my just-created product appears (impossible with static mock); no silent fallback observed |

Console clean throughout Flow 2.

---

## Flow 3 — Proposals (build, stop before send)

### 🔴 P0 — `/portal/proposals` (list) crashes in production
- Navigating to the Proposals list (the "Proposals" nav target) renders **"Application error: a client-side exception has occurred while loading app.patina.cloud."** — blank page. Reproducible across reloads.
- **Console / root cause:**
  ```
  TypeError: g.existsSync is not a function
      at .../_next/static/chunks/8064-….js
      at .../_next/static/chunks/app/(portal)/portal/proposals/page-1d6f6feff1cc15c3.js
  ```
  `existsSync` is Node's `fs.existsSync` — a **server-only API bundled into the client** for the proposals **list** page. It throws in the browser. Some module imported (transitively) into `proposals/page` pulls in `fs`. Isolate via the `8064` chunk; the offending import is reachable only from the list page bundle (the `/new` and `/[id]` bundles are unaffected).
- **Blast radius:** the list page is the normal entry point to proposals, so the feature looks fully broken to a designer even though the create/edit/scope flows are healthy. **Fix priority: high.**

### The build path (via `/portal/proposals/new`) ✅ PASS
Created proposal id **`7489a4df-a231-4b29-8a7e-089237f615d3`**.

| Step | Result | Notes |
|------|--------|-------|
| `/portal/proposals/new` renders | ✅ | project/client pickers, version, 5 templates (Full Room Design … Custom) |
| Link project + client | ✅ | project "Thompson Loft – Living + Dining" (`4a012d3e…`), client "Alex Thompson" |
| Create (Full Room Design template) | ✅ | editor loads at `/proposals/[id]`; sections seeded from template; `profiles` 200 |
| Edit a section (Design Vision) | ✅ | debounced save → "AUTO-SAVED 0 MIN AGO"; persisted |
| Scope Builder — add Room | ✅ | "QA-2026-06-04 Living Room" $25k; Scope Summary ROOMS 0→1 live (`43c13168…`) |
| FF&E — Fixed from Catalog | ✅ | "Linen Drapery Set" $780; total live-updates |
| FF&E — Quick-create draft | ✅ | "QA-2026-06-04 Draft Sconce" $340 created+used |
| FF&E — Allowance | ✅ | "Rugs" $500–$1,500; **line total = midpoint $1,000** (total $780→$1,780, +$1,000) ✓ |
| FF&E — TBD | ✅ | "Art", price "—"; total unchanged at $1,780 ✓ |
| FF&E — dual query-key invalidation | ✅ | schedule list **and** scope summary update without manual refresh on every add |
| FF&E — capture-inbox consume | ⚠️ not tested | drag-drop tooling boundary #4 (inbox renders w/ pending "WestElm Chair") |
| Phases (Add Defaults) | ✅ | 5 phases; Scope Summary → PHASES 5, DESIGN FEES $10,000, DURATION 19 wk |
| Payments — milestone %→amount | ✅ | 50% → **$6,060** (= 50% of $12,120 = FF&E $2,120 + fees $10,000) ✓ |
| Generate Proposal from Scope | ✅ | sections populate; **Total Investment $12,120** (consistent); payment 30/40/30 sums to $12,120; timeline 19 wk |
| Preview as Client (`/preview`) | ✅ | read-only client view renders (letterhead, vision, space plan, selections) |
| Send screen (`/send`) | ✅ reached send-ready | recipient auto-populated (Alex Thompson · @patina-seed.invalid), EXPIRES 14 days, "$12,120"; **STOPPED — did not click Send** (no email sent) |

**Internal consistency:** Scope Summary FF&E ($2,120) == Investment line subtotal; Total Investment $12,120 == FF&E + design fees; payment schedule and timeline both reconcile. ✓

**Secondary findings in the build path:**
- **PUNCH-3 (P2):** the custom **50% payment milestone** added in the Scope Builder did **not** carry into the generated proposal — the generated Payment Schedule used a default **30/40/30**. Tied to a display bug: the Payments "Total" row and "% allocated" label stayed **0%** while the milestone row showed 50%/$6,060 and the progress bar filled ~50% (aggregation/persist gap).
- **PUNCH-4 (P3):** in the generated **Investment** section, the Allowance ("Rugs") and TBD ("Art") rows show a **blank** price, even though the allowance's $1,000 midpoint is included in the Total. Minor display nuance for the client-facing doc.

---

## Prioritized punch-list

| # | Sev | Area | Issue | Repro / evidence |
|---|-----|------|-------|------------------|
| **PUNCH-1** | **P0** | Proposals | List page `/portal/proposals` crashes (white screen) in prod | `TypeError: g.existsSync is not a function` in `proposals/page-*.js` (chunk `8064`). Node `fs` API bundled client-side. Reproducible. `/new` + editor unaffected. **Fix:** find the import in the proposals-list page tree that pulls in `fs`/`existsSync` and move it server-side or swap for a browser-safe lib. |
| **PUNCH-2** | P2 | Catalog / add product | Empty-name "Save as Draft" is a **silent no-op** — blocked client-side but no inline error/toast | `/portal/catalog/new` → click Save with Name empty → no POST, no message |
| **PUNCH-3** | P2 | Proposals / Payments | Custom payment milestone doesn't persist/aggregate → generated proposal falls back to default 30/40/30; "Total"/"% allocated" stays 0% | Scope Builder → Payments → add 50% milestone; "Total" row shows 0%; Generate → schedule is 30/40/30 |
| **PUNCH-4** | P3 | Proposals / Investment | Allowance & TBD line items render blank price in generated Investment section (allowance midpoint still counted in Total) | Generated proposal Investment: "Rugs" / "Art" show no amount |
| **PUNCH-5** | P3 (verify) | Catalog / add product | Tier/Category dropdowns didn't open under automation — **needs manual confirmation** (likely automation quirk, not a real bug) | `/portal/catalog/new` → click "Select tier…" — no menu observed via automation |

No console errors were observed on any page **except** the P0 proposals-list crash.

---

## Cleanup manifest (real prod artifacts created — all tagged `QA-2026-06-04`)

Remove these when convenient. None were sent/published/activated; the quick-draft product stays in the personal library as a draft.

| Type | Name / id | State |
|------|-----------|-------|
| Product | `QA-2026-06-04 Manual Chair` — id **`e172229e-7ff5-4f51-90ac-86f558fd5c32`** | draft; description edited to end with "EDITED-QA" |
| Product | `QA-2026-06-04 Draft Sconce` (QA Test Maker, $340) | draft (created via proposal quick-create) |
| Proposal | `Thompson Loft – Living + Dining — Full Room Design` v1.0 — id **`7489a4df-a231-4b29-8a7e-089237f615d3`** | **draft, NOT sent, NOT activated**; linked client Alex Thompson, project `4a012d3e-d4e9-4da5-a88e-ef284ac82c83` |
| ↳ scope room | `QA-2026-06-04 Living Room` — id `43c13168-83f4-4c56-af7a-656af3a17b20` | child of the proposal |
| ↳ FF&E items (4) | Linen Drapery (fixed), Rugs (allowance), Art (TBD), Draft Sconce (fixed) | child of the proposal |
| ↳ phases (5) + 1 payment milestone | default phase set; one 50% milestone | child of the proposal |
| Local file | `/tmp/qa-import-2026-06-04.csv` | local only (never imported) |

**Not created:** no CSV-import products (`Import Lamp`/`Import Vase`) — import was blocked by tooling; no proposal email; no project activation; no public-catalog promotions.

---

## Coverage summary

- **Fully verified (automated):** portal manual-add capture; quick-create-draft; entire live catalog/library surface (list, search, filters, grid/list, detail, edit+persist); mock-fallback audit; full proposal build path (create → scope rooms/FF&E all 4 types/phases/payments → generate → preview → send-ready) with arithmetic consistency.
- **Could not verify (tooling):** extension capture, CSV import, image upload, capture-inbox drag-consume.
- **By design / environment:** three-layer library (pilot-gated).
- **Highest-value follow-ups:** fix PUNCH-1 (proposals list crash) first; then a quick user-assisted pass on the four tooling-blocked items (especially extension capture and CSV import), and PUNCH-3 (payment milestone persistence).
