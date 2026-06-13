# Track 3 — Audit-first pass (Rooms shell + the Library)

**Date:** 2026-06-13 · **Reads against:** `the-document-track3-package.md`, spec v1.4, `DECISIONS.md` (R36–R40)
**Scope of this pass:** the audit the package mandates *before* code — "most of Track 3 already exists somewhere." Method: 7 parallel read-only subsystem audits + first-hand reading of the shell, time system, catalog data layer, and reusables. Verdict per subsystem below, then the build plan for **slices 1–2 only** (the Engine, Accounts, Aesthete fold, Composing Page stay on the shelf until after the L4 device check).

**Headline:** the substrate is ~80% there. Slices 1–2 are **re-housing, not rebuilding**. No `needs-design-ruling` item *blocks* slices 1–2; three items are flagged for the design session below (none blocking).

---

## 1. The three-layer Library / catalog — **EXISTS (fully). Reuse the data layer as-is.**

The Products/catalog zone already ships everything R32/R39 needs:

| Concern | What exists | Reuse |
|---|---|---|
| Three shelves | `products.layer` column — `NOT NULL`, CHECK `'personal'\|'studio'\|'catalog'`; RLS per layer (00152) | `LayerProductLayer` type |
| Shelf reads | `useLayerProducts({layer,…})` → `LayerProductRow[]`; `useLayerCounts()` → `{personal,studio,catalog}` | both, directly |
| Capture | `useCaptureProduct()` → writes `layer='personal'` + `owner_user_id` (extension / photo / URL) | directly |
| Promote (personal→studio) | `promote_to_studio` RPC (+ `promotion_audit_log`); `usePromoteToStudio` | hook + `PromoteToStudioModal` |
| Nominate (studio→catalog) | `nominate_vendor` fn → `vendor_nominations` state machine; admin side `use-admin-nominations` | hook + nominate modal |
| Cross-layer search | `useCrossLayerSearch()` — one query, grouped by layer (the librarian's search) | slice 3 (deferred) |
| Card / detail UI | `@patina/catalog-ui`: `ProductCard`, `ProductListItem`, `TeachPanel`, `ScoreCircle`, `StyleTag`, `LayerIcon`, `LayerChip`, `PromotionToast`, `NominationStatusBanner`, `LoadingStrata`, `EmptyState`, `product-detail/*` | compose into shelves |

Legacy home: `/portal/library/{personal,studio,catalog}` + `LibraryLayerNav` (special-cased SubNav). The Library Room re-houses these into one full-bleed paper Room; the legacy zone stays URL-reachable (D7) and is ⌘K-only after.

**Flagged (non-blocking):** the prototype shows a **Via-Patina mark** on Catalog cards and a **Golden-Hour** "needs teaching" tag. Via-Patina lives on vendor/catalog rows (R30) and the needs-teaching signal is `teaching_queue.status='pending'` — **not** dedicated `products` columns. Slice 2 renders these from the real signals it can read (catalog layer + teaching-queue membership) and shows nothing invented. → flagged as **I-note**, not a migration.

## 2. Put-down + timer chain-out — **EXISTS (fully). Reuse the exact path; do not fork.**

`DocumentTimeProvider` (`@/hooks/document-time-provider`) is mounted once in the `(document)` layout and is the single serialized timer lane:

- `useHoldDocument(doc)` — **hold on mount / `release()` on unmount.** `release()` chains the running timer out and offers the log strip (crash-safe write-first, R20 no-timeout).
- **Therefore Room entry is free:** navigating `/doc/[id] → /library` unmounts the doc page → its `useHoldDocument` cleanup fires `release()` → timer chains out + `LogStrip` is offered. This is *the normal put-down*, reused verbatim — provided the Room lives under `(document)` so it inherits the provider + `LogStrip` + `StudioDrawer` + `CommandBar`.
- The Library Room is **studio-wide, not project-scoped** — it does **not** call `useHoldDocument` (no `projectId`). It only *triggers* the put-down of whatever was held, via navigation.

**Return-to-origin:** `rememberDocumentInHand()` → `localStorage['patina:last-document-in-hand']` is **telemetry only** (engagement id, not a URL). Return-to-origin needs a *new, tiny* mechanism: stash the origin **pathname** on Room entry, restore on leave. Building a `room-origin` helper (sessionStorage) modeled on that pattern.

**Flagged (non-blocking):** the prototype's Hours sheet shows a `Sourcing · the Library · 35m` line, implying the Room logs its **own** time. The shipped time system is **project-scoped** (`project_time_entries.project_id` required) and R39's physics list does **not** include non-project Room time. Slice 1 implements the ruled physics (put the held *document* down) and does **not** capture Library time. → flagged for ruling if the design session wants non-project "studio time."

## 3. The companion API / Engine backend — **EXISTS (fully). PREP ONLY — not built this session.**

Reported so slice 3's ⌘K result-lines can be designed against the real contract:

- Three edge fns: `companion-message`, `companion-history`, `companion-context`; tables `companion_conversations` / `companion_messages` / `companion_quick_action_log`; hooks `useCompanionConversation`, `useSendCompanionMessage`.
- **`POST /functions/v1/companion-message`** — req `{ user_id, message, context?: {screen, product_id?, room_id?}, conversation_id? }` → resp `{ message_id, response, quick_actions: QuickAction[]|null, suggested_products: ProductSuggestion[]|null, metadata:{confidence,sources,processing_time} }`.
- **`ProductSuggestion { product_id, name, price, image_url, match_score, reason }`** — carries `product_id`, so it maps **cleanly** to a paper result-line with one act **`Place → [document]`** (R38).
- Backed by Claude (`sonnet-4-20250514`), hydrated with room/product/style context.

**Slice-3 blocker (recorded, not ours yet):** `parseAIResponse` currently returns `null` for `suggested_products` — the structured-output wiring (Claude `tool_use`) + the `Place → [document]` RPC + `source='engine'` provenance are the slice-3 work. The backend is reusable; the surface is a re-skin.

## 4. Teaching / the Aesthete zone — **EXISTS (partially). Reuse data; relocate + de-gamify.**

`/portal/teaching` ships Quick Tags (~5 min inline style), Deep Analysis (~15 min spectrum sliders), Validation. Hooks: `useTeachingQueue` (pending), `useDesignerTeachingStats` (accuracy / impact / daily-goal), `useClaimNextProduct`, `useSaveSpectrum`, `useSubmitTeaching`, `useAssignStyle`. `TeachPanel` (catalog-ui) is the inline control; `/portal/teaching/deep` holds the spectrum sliders.

Slice-2 work = **relocate + re-skin**, not rebuild: Quick Tags inline on the card (reuse `TeachPanel`), Deep Analysis as a **paper sheet over the Room** (wrap the spectrum sliders in `DocSheet`), stats compressed to **one foot line** ("N taught today · accuracy · future matches improved"). **Strip the gamification** (badges, daily-goal bars) per R32/R37 — "present, never gamified."

## 5. The reusables kit — **EXISTS. Compose, don't author from scratch.**

| Reusable | File | Used for |
|---|---|---|
| `StrataMark` (state + 3-hue fill) | `components/document/strata-mark.tsx` | shelf rules / room mark |
| `StrataSweep` (indeterminate loader, R35 — **the only** spinner) | `components/ui/strata-sweep.tsx` | capture/save/scan states |
| `LedgerFrontMatter` (caption + `FrontMatterStat[]`) | `components/document/ledger-front-matter.tsx` | the Library foot line |
| `DocSheet` (z-50 overlay, charcoal, Esc/backdrop/focus, D4) | `components/document/overlays/doc-sheet.tsx` | Deep-Analysis + Capture sheets |
| `StudioDrawer` (D8 bar, `document:open-ledger`) | `components/document/studio-drawer.tsx` | doorway affordance + persistence |
| `CommandBar` ⌘K (`LEDGERS` incl. `Library`) | `components/document/command-bar.tsx` | Library = navigate, not sheet |
| Brand tokens, `.strata-sweep`, `doc-sheet-up`, `doc-breath` | `app/globals.css` | never redefine locally |
| D4 zero-shadow lint (CI-blocking) | `eslint.config.mjs` | already covers `components/document/**` |

**Mount-point decisions (implementation-only):**
- Room route → **`src/app/(document)/library/page.tsx`** (inherits the layout's providers/Drawer/LogStrip/⌘K + D4 lint coverage).
- Room components → **`src/components/document/rooms/`** (already inside the D4 lint glob — *no eslint change needed*; avoids colliding with the existing `src/components/rooms/` room-scan viewers).
- Drawer doorway → add `weight: 'room'|'sheet'` to `LEDGERS`; `library` = `room` → spine-tick + `↗`, click **navigates** to `/library` (not a sheet). ⌘K's `Library` row likewise routes to `/library`.

---

## 6. Build plan (slices 1–2; the rest deferred)

**Slice 1 — the reusable Rooms shell.** `RoomShell` (full-bleed paper, thin head with `← origin` leave + ident + action slot, Drawer persists, scrim/sheets mount *inside* over the paper, reduced-motion safe) + `/library` route stub + the doorway affordance + the origin stash. Schema: **none**.

**Slice 2 — the Library, first Room.** Three Strata-ruled shelves on `useLayerProducts`/`useLayerCounts`; capture (sheet) → promote → nominate; inline Quick Tags on needs-teaching cards; Deep Analysis sheet; one foot stat line (`useDesignerTeachingStats`, de-gamified); the librarian input present but **ask deferred to slice 3** (visually standing, submit is a no-op stub with an honest note). Schema: **additive read-only if any** (reuse catalog tables). **Then STOP** → ≥1280px + ~390px screenshots + L4 device-check prep.

**Hard sequence honored:** slice 1 gates slice 2; the Engine (3), Accounts (4), Aesthete fold (5), Composing Page (6) are **not** touched. No destructive migrations (R21/D7).
