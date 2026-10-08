# B0 Briefing — Current state of building a job's Pieces

US-20 · verified against `main` @ `699a2a900` (this worktree's base). All paths are under
`apps/designer-portal/src/` unless noted. Every claim below is cited `file:line`.

---

## 1. Recon verification table

One row per bullet in `BRIEF.md` "What recon established" (`BRIEF.md:26-47`).

| # | Recon bullet | Verdict | Detail |
|---|---|---|---|
| 1 | Where pieces live: `/doc/[id]`, Pieces region = `FFESection`, grouped by `RoomHeading` → Throughout → Not in a room yet | **CONFIRMED** | `app/(document)/doc/[id]/page.tsx`; `components/document/ffe-section.tsx:1152` (`FFESection`), `:751` (`RoomHeading`), `:491` (`FFELine`); grouping render at `ffe-section.tsx:2626-2694`. |
| 2 | `project_ffe_items.status` defaults to `specified`; no placeholder stage; a placeholder (`product_id IS NULL`) still stamps "Specified" | **CONFIRMED** | `supabase/migrations/00066_proposal_project_flow_v2.sql:265-266` (`DEFAULT 'specified'`); `lib/document/stamp-derivation.ts:104-144` has no `product_id` branch — any status in the 8-value `MACHINE` set (`:18-27`) falls straight to its own label, `specified` otherwise (`:141`). |
| 3 | `design_disposition` (candidate/selected/alternate/not_selected/superseded, 00434) is ignored by the stamp | **CONFIRMED** | `LineStampInput` (`stamp-derivation.ts:56-67`) carries no `design_disposition` field; `supabase/migrations/00434_ffe_privacy_domain_foundation.sql:206,227-228,242-245`. |
| 4 | Authorization soft-locks the room select; cost edits refused once on a PO (00692) | **CONFIRMED** | `softLockSentence` at `components/document/line-unfold.tsx:64`, applied to the `<select disabled={Boolean(softLock)}>` at `:355`; `supabase/migrations/00692_ffe_line_commercials.sql:74-75` (`RAISE EXCEPTION ... line is on a purchase order`). |
| 5 | All writes go through RPCs (00435/00438) | **CONFIRMED** | `supabase/migrations/00435_ffe_ga_rpc_boundaries.sql` defines `create_named_project_need`, `place_product_in_project_v2`, `archive_project_selection`, `supersede_project_selection`, `triage_project_ffe_items`, etc. (`:86-962`); `00438_ffe_release_security_hardening.sql` adds the integrity/guard triggers (`:266-371`). |
| 6 | Clicking a line opens `LineUnfold`: one Next act, six procurement cells, Room select, folio, Bill/Add note/Fold; "Edit spec details →" sits outside the unfold | **CONFIRMED** | `line-unfold.tsx:4-5` ("six cells: The buy · Quote · Order · Movement · Money out · Receiving"), Next act group `:218-253`, Room select `:346-378`, folio `:381-384`, Bill/Add note/Fold `:386-428`; "Edit spec details →" rendered as a sibling of `<LineUnfold>`, not inside it, at `ffe-section.tsx:732-741`. |
| 7 | Per-room "Add a line" (`add-line-sheet.tsx`) has Line name, How many, COM checkbox; creates via `create_named_project_need` (00435) | **CONFIRMED** | `components/document/schedule/add-line-sheet.tsx:109-138` (exactly those 3 fields); `useCreateNamedProjectNeed` import `:5`. |
| 8 | No price, allowance or unit field on that sheet | **CONFIRMED** | Same file, same lines — no price/allowance/unit control exists in the form. |
| 9 | **Bug:** sheet compares against `'Unsorted'`, section passes `'Not in a room yet'`, so the line saves as Throughout | **CONFIRMED, and worse than stated** | `add-line-sheet.tsx:62` (`roomName === 'Unsorted'`) vs. the caller `ffe-section.tsx:2679-2684` (`setAddLineRoom({ id: null, name: 'Not in a room yet' })`). The mismatch sends it to `'throughout' as const` (`add-line-sheet.tsx:60-64`), not merely "saved as Throughout" — it is misrouted every time. See §7 for the third inconsistent label. |
| 10 | Section-level "Add a line" opens `add-to-project-sheet.tsx` with **ten** entry paths into `line-card.tsx` | **CORRECTED — eleven, not ten** | `components/document/schedule/add-to-project-sheet.tsx:87-119`: "From something you have" (From the Library, Paste a link, From a photo, From a vendor's quote, Import a schedule, Bring in a deck — 6) + "Not in any catalog" (A custom piece, A find, A store buy, Name a need, Bought it already — 5) = **11**. Sibling evidence (`artifacts/procurement-buying-review-2026-10-05/research/r2-item-intake.md:38`) counted **nine** on 2026-10-05 — two roads (From a photo, Bring in a deck) were added since, or that memo undercounted; either way the door keeps growing. |
| 11 | "Placeholder → product": LineCard's "Optional placeholder to fill" overwrites the placeholder's name; `supersede_project_selection`/`useSupersedeProjectSelection` have no UI | **CONFIRMED, with the exact overwrite site** | Select at `schedule/line-card.tsx:551-556`; the actual overwrite happens server-side in `place_product_in_project_v2` at `supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:194-196` (`UPDATE ... SET product_id = v_product.id, name = v_product.name, ...`) — unconditional, not merged with the placeholder's own name. `useSupersedeProjectSelection` defined at `packages/supabase/src/hooks/use-project-ffe-ga.ts:263`, re-exported `hooks/index.ts:1422`, zero consumers under `apps/designer-portal/src`. |
| 12 | Allowances (item_type fixed/allowance/tbd; budget min/max) can only be authored pre-signature (`ffe-schedule-builder.tsx`) | **CONFIRMED** | `item_type` CHECK at `00066_proposal_project_flow_v2.sql:264`; `allowance` is read/written throughout `components/portal/scope-builder/ffe-schedule-builder.tsx` (`:192,211,346,472,505`, a pre-signature scope-builder surface); grep for `item_type: 'allowance'` in app code outside that file and its tests returns nothing. |
| 13 | A line has exactly one room: `project_room_id` + `assignment_scope` ∈ room/throughout/unassigned (00434); no join table, so "throughout" is a scope value, not a room set | **CONFIRMED** | `00434_ffe_privacy_domain_foundation.sql:246-250`: `CHECK (assignment_scope IN ('room','throughout','unassigned') AND ((assignment_scope='room') = (project_room_id IS NOT NULL)))`. No `project_ffe_item_rooms` or similar join table exists anywhere in `supabase/migrations/`. |
| 14 | The only way to change a room is the unfold's Room select (`use-document-rooms.ts`, `useAssignLineRoom`) | **CONFIRMED** | `hooks/use-document-rooms.ts:72-90`; it wraps `useTriageProjectFfeItems` (the same RPC exception-overlay.tsx uses), wired only into the `<select>` at `line-unfold.tsx:349-375`. |
| 15 | Drag between rooms not supported (DECISIONS I25, deferred) | **CONFIRMED** | `docs/design/the-document/DECISIONS.md:1160` (I25 header), `:1197-1200` ("Drag-to-ASSIGN-rooms and cross-section drag are polish debt — assignment ships via the unfold."). No drag-and-drop handlers exist on `FFELine`/`RoomHeading` in `ffe-section.tsx`. |
| 16 | `archive_project_selection`/`useArchiveProjectSelection` exist, no UI calls them; catalog delete allowed by RLS (`products_studio_delete`, 00584) but `useDeleteProduct`, `delete-product-dialog.tsx`, `duplicate-detection-panel.tsx` are unused; Library has no delete/merge/archive | **CONFIRMED** | `use-project-ffe-ga.ts:248` (`useArchiveProjectSelection`), zero consumers. `products_studio_delete` policy at `supabase/migrations/00584_studio_comember_rls_sweep.sql:1270-1281`. `useDeleteProduct` at `hooks/use-products.ts:189`, imported nowhere (the only other `use-products` import, `catalog-filters.tsx:15`, pulls `useCategories`/`useVendors` only). `DeleteProductDialog` (`components/catalog/delete-product-dialog.tsx:24`) and `DuplicateDetectionPanel` (`duplicate-detection-panel.tsx:180`) are each referenced only in their own file. `components/document/rooms/library/library-room.tsx` (286 lines) has zero `delete`/`archive`/`merge` tokens. |
| 17 | Labor exists only as Trade Scope (00423), a lump sum per trade written as prose per room; cannot be attached to a line | **CONFIRMED** | `supabase/migrations/00423_trade_scope_instrument.sql:144-210`: `trade_scope_terms` (one row per trade, lump-sum client price) + `trade_scope_sections` (prose per room, optional per-section `allocation_cents` that must sum to the lump sum). No FK from `trade_scope_sections`/`trade_scope_terms` to `project_ffe_items`. |
| 18 | No unit of measure; quantity is a whole number | **CONFIRMED** | `project_ffe_items.quantity INTEGER NOT NULL DEFAULT 1` (`00066...sql:267`); no `unit`/`uom` column added in any later migration (grepped all `ALTER TABLE project_ffe_items`, §5). |
| 19 | Client price can't be typed after activation; only maker/trade cost editable (`set_project_ffe_line_commercials`) | **CONFIRMED** | `supabase/migrations/00692_ffe_line_commercials.sql:31-54`: the RPC's allow-list is `vendorId`/`tradePriceCents` only (`:54` raises if any other key is present). |
| 20 | `/doc/[id]/spec-book` has SKU, Finish, Material, Color/fabric, Exact location, dimensions, notes; no room assignment there; separate route | **CONFIRMED** | `components/document/spec-books/spec-book-workspace.tsx:424-428` (field list), `:590-593,714` (editor controls); the file only *reads* `project_room_id` for chapter grouping (`:821,841`), never writes it. Route is `app/(document)/doc/[id]/spec-book/page.tsx`, distinct from `app/(document)/doc/[id]/page.tsx`. |
| 21 | Time-tracker: `useHoldDocument` held only on `doc/[id]/page.tsx`; navigating to spec book unmounts it, writes a time entry, shows `log-strip.tsx` | **CONFIRMED** | `hooks/document-time-provider.tsx:916-925` (`useHoldDocument`'s cleanup calls `release()` on unmount); no `useHoldDocument`/`useDocumentHold` call exists in `app/(document)/doc/[id]/spec-book/page.tsx` or `layout.tsx`. `log-strip.tsx:13-14,193,211` ("Log" persists, "Discard" deletes the entry). |
| 22 | No designer-portal paint/finish surface; `proposal_palettes`/`palette_swatches` (00131) pre-signature only; `useProjectPalette` unused | **CONFIRMED, one name correction** | `supabase/migrations/00131_proposal_palettes.sql:21-58`: both tables key off `proposal_id`, not `project_id`. The hook is actually named **`useProjectPalettes`** (plural) — `packages/supabase/src/hooks/use-project-v2.ts:101`, re-exported `hooks/index.ts:1399`, zero consumers under `apps/designer-portal/src`. |
| 23 | "Lens" means five different things in code; no single "you are in stage X" device | **CONFIRMED** | Distinct files/concepts: a reading lens (`components/document/buying/maker-reading.tsx`), `components/document/room-lens-context.tsx`, `components/document/lens-band.tsx`, a lens-density fold state (`ffe-section.tsx`'s own `ffeFold.density`, e.g. `:2243,2359`), and a worktable rooms rail (`app/(document)/doc/[id]/page.tsx`, `components/document/worktable/table-slots.tsx`). |

**Net:** 21 of 23 bullets confirmed outright; 2 corrected (entry-path count is 11 not 10; the unused palette hook is `useProjectPalettes`, plural). Recon is reliable; use it as the floor, not the ceiling — several bullets undercount how deep the fragmentation goes (see §3, §7).

---

## 2. Line life today, as a state machine

Six largely-independent axes live on one `project_ffe_items` row. None of them is a single linear machine; Leah's confusion is partly that the *status* axis reads like the whole story but is only one of six.

### 2a. `status` — the goods machine (the one stamp Leah sees by default)

```
 [create: specified] ──Order (UI, orderAct)──▶ [quoted*] ... the schedule's
        │                                         status values enumerate a
        │                                         *lifecycle contract that
        │                                         the current RPC set does
        ▼                                         not yet drive one-by-one —
 specified ──▶ quoted ──▶ approved ──▶ ordered ──▶ production ──▶ shipped ──▶ delivered ──▶ installed
    │(default,       advanced only as a side-effect of PO/order RPCs (create_purchase_order,
    │ 00066:265)      start_purchase_order_change, 00435:849,878) and receiving (00691) — UI-reachable
    │                 through the LineUnfold "Next" act (Order / Send to vendor / Log inspection /
    │                 PoStatusAct "advance" / InstallAct), line-unfold.tsx:225-253
    │
    ├─▶ delivered, received_quantity set short ──▶ "partial" (derived display only, stamp-derivation.ts:131-137)
    ├─▶ blocked=true + pending decision ──▶ "decision_due" overlay (stamp-derivation.ts:109-110) — UI: LineExceptions, line-unfold.tsx:343
    ├─▶ open damage_claims row (ffe_item_id FK) ──▶ "damaged" overlay (stamp-derivation.ts:113-114) — RPC-only trigger (receiving flow), no direct line-level UI act to create a claim here
    └─▶ trade_scope_document_id set (line belongs to a Trade Scope presence row) ──▶ status axis yields
           to trade_engaged/trade_in_progress/trade_substantially_complete/trade_accepted/trade_pending
           (stamp-derivation.ts:124-128,45-54) — reachable only through the Trade Scope surface, not Pieces
```
All 8 `status` values are reachable from the UI through the procurement cells (`line-unfold.tsx`), but **only once a line is far enough along to have a vendor and PO** — during the pure "roughing in" moment Leah is in (S1/S3), a line sits at `specified` and the status axis is inert. The `blocked`/`damaged` overlays are unreachable from the Pieces surface itself (they're set by receiving/claims flows elsewhere).

### 2b. `design_disposition` — candidate/selected/alternate/not_selected/superseded (00434:242-245)

```
                     ┌── set at CREATION only, via LineCard's "Design status" <select>
                     │   (line-card.tsx:519-527) — Candidate / Selected / Alternate / Not selected
                     │   AddLineSheet's quick "Add a line" hard-codes 'candidate' (add-line-sheet.tsx:66)
                     ▼
     candidate (default, 00434:227) ── selected ── alternate ── not_selected
            │                                                        ▲
            │  NO UI control changes disposition on an EXISTING line │
            │  (LineUnfold has no disposition field at all)          │
            ▼                                                        │
     supersede_project_selection (RPC only, no UI call) ──────────────┘
       marks old row 'superseded' (00435:542→ actually :567) and inserts
       a NEW row 'selected' (00435:586) — a replacement, not an edit
            │
            ▼
     archive_project_selection (RPC only, no UI call) ── sets design_disposition='not_selected'
       + removed_at/removed_by/removal_reason (00435:541-542) — this IS the delete S5 asks for
```
Net: **you can pick any of 4 dispositions when a line is born** (via the full LineCard road only — the quick AddLineSheet road always gives `candidate`), but **no UI changes disposition afterward.** The only way disposition moves post-creation is through two RPCs nothing in the portal calls.

### 2c. `item_type` — fixed / allowance / tbd (00066:264)

- `fixed` (default) and `tbd` (set when the "Name a need" road is chosen, `line-card.tsx:233`, or always on the quick `add-line-sheet.tsx:59`) are UI-reachable at creation.
- `allowance` is reachable only pre-signature, in the proposal-phase scope builder (`ffe-schedule-builder.tsx`) — **unreachable on an active project's Pieces region.** No RPC or UI transition moves a line from `fixed`/`tbd` to `allowance` after activation, or vice versa.

### 2d. `product_id` — null (placeholder) ⟷ filled

```
  product_id = NULL ("Name a need" road, or quick Add-a-line)
       │
       │  LineCard → "Optional placeholder to fill" <select> (line-card.tsx:551-556)
       ▼
  place_product_in_project_v2 with placeholderSelectionId set (UI-reachable)
       │
       ▼
  product_id = <product>.id, AND name := <product>.name (unconditional overwrite,
  00435:194-196) — the placeholder's intent text is destroyed, not merged (see §7)
```
There is no reverse transition (filled → null) from any UI or RPC found.

### 2e. `assignment_scope` / `project_room_id` — room | throughout | unassigned (00434:207,246-250)

Exactly one room per line, enforced by the CHECK constraint. Set at creation (AddLineSheet/LineCard) or changed only via the LineUnfold Room `<select>` → `useAssignLineRoom` → `triage_project_ffe_items` RPC (`use-document-rooms.ts:72-90`, UI-reachable). No join table exists, so "in four rooms" (S2) has no row shape to land in at all — this is a **data-model gap**, not a missing control.

### 2f. Authorization track and PO

- **Authorization:** a line moves from `auth.track === 'none'` to released by the section-level "Release for authorization" ceremony act (`ffe-section.tsx:1881-1893`, UI-reachable, gated by `canRelease`/eligibility). Once released, the Room select soft-locks (`line-unfold.tsx:64,355-356`). Voiding a released line requires `supersede_project_selection` (RPC-only, no UI) per the function's own guard (`00435:556-558`, "draft or sent authorization must be voided before replacement").
- **PO:** `purchase_order_id` is set by `create_purchase_order`/`start_purchase_order_change` (`00435:849,878`), reached from the LineUnfold "Order" act (`orderAct`, `line-unfold.tsx:172-181`, UI-reachable). Once set, `set_project_ffe_line_commercials` refuses any cost edit except `vendorId`/`tradePriceCents` (`00692:74-75`).

### 2g. `removed_at` (soft delete)

Only path is `archive_project_selection` (RPC, no UI caller) — requires a ≥5-character reason (`00435:530`) and refuses if the line is authorized or has a PO (`:531-539`, "must be changed through supersession/PO change"). **This is exactly the gap behind S5** ("How do I delete that? ... I can't delete anything").

**Summary table — reachability**

| Axis | UI-reachable | RPC-exists-no-UI | Unreachable (no path at all) |
|---|---|---|---|
| `status` (goods) | all 8, once vendor/PO exist | — | — |
| `status` → damaged/blocked overlays | — | triggered by receiving/claims elsewhere | direct act from Pieces |
| `design_disposition` set at birth | candidate/selected/alternate/not_selected | — | — |
| `design_disposition` changed in place | — | supersede (→superseded+new row), archive (→not_selected) | — |
| `item_type` fixed/tbd | yes, at birth | — | fixed/tbd ⟷ allowance post-activation |
| `product_id` null→filled | yes (placeholder fill) | — | filled→null |
| `assignment_scope`/room | yes, create + LineUnfold select | — | multi-room (no join table) |
| authorization release | yes (ceremony) | void via supersede | — |
| PO | yes (Order act) | — | — |
| `removed_at` | — | archive_project_selection | — |

---

## 3. Action inventory per surface Leah touched

Counting every visible act (button/link/select that performs a mutation or navigation), by surface.

### Pieces region — section head (`ffe-section.tsx`)

Project-mode head, built from a dynamic ledger (`ffeLedger`, `:2138-2186`) whose composition depends on state. Possible entries, always showing at least the elected leader:

| Key | Label | Shows when |
|---|---|---|
| `release-for-authorization` | "Release for authorization" | `releaseInHead` true; gated/disabled with a reason if nothing is eligible (`:1881-1893`) |
| (claim) | exception act | an open damage claim exists (`:2121-2123`) |
| (po) | exception act | a PO-kind exception exists (`:2124`) |
| `open-add-to-project` | **"Add a line"** | always available (`:1873-1877`) — opens `AddToProjectSheet`, the 11-road sheet |
| `bill-project-ffe` | "Bill N uninvoiced" | `billableUninvoiced.length > 0` (`:2308-2324`) |
| `bill-project-purchases` | "Bill N unbilled purchases" | `unbilled.length > 0` (`:2326-2335`) |
| `bill-project-riders` | "Bill N unbilled riders" | `unbilledRiderRows.length > 0` (`:2337-2346`) |
| `open-spec-book` | "Spec book" / own-act label | always, trailing door (`:2103-2117`) |
| `record-a-change-pieces-head` | "Record a change" | `recordChangeAtHead` (`:2176-2186`) |
| `open-the-pieces` | own-act label | project on hold (`:2164-2173`) |

**Up to 8 distinct acts can be live on the section head at once**, ranked by `FFE_LEDGER_ORDER` (`:2130-2137`). Plus, in install/select mode (a different render branch, `:2254-2355`): "Put back · Esc", "Bill N uninvoiced" (duplicate branch), "Bill N unbilled purchases", "Bill N unbilled riders", "Mark N installed" (`:1008-1018`), "Put back" (`:1020-1029`), "Choose what's installed" (`:2570-2581`). **Distinct `actionKey`s found in this one file: 16** (`open-add-schedule-line`, `open-add-project-room`, `add-project-room`, `edit-ffe-line-spec-details`, `record-a-change-line`, `mark-ffe-lines-installed`, `put-back-ffe-install-selection`, `put-back-choose-the-piece`, `put-back-release-ceremony`, `bill-project-ffe`, `bill-project-purchases`, `bill-project-riders`, `record-a-change-install-head`, `retry-ffe-readiness`, `retry-ffe-schedule`, `choose-ffe-lines-installed`), plus the section head's own dynamic ledger (6 more keys) and "Spec book →" link.

**A genuine source of confusion found while counting:** the section-head "Add a line" (`:1875`, opens `AddToProjectSheet`) and the room-level "Add a line" (`RoomHeading`, `:874-884`, opens the plain `AddLineSheet`) carry the **identical visible label** for two structurally different sheets (11 roads vs. 3 fields). Leah's "add a line, add a line, add a line" rhythm (TRANSCRIPT.md:24,42-47) is the room-level one; the section head's same-named button does something else entirely.

### RoomHeading (`ffe-section.tsx:751-887`)

| Act | Label | Notes |
|---|---|---|
| Press the heading | (room name, `aria-pressed`) | "holds" the room — a focus act, not a mutation (`:857-866`) |
| `open-add-schedule-line` | "Add a line" | opens `AddLineSheet` for this room (`:874-884`) |
| Tri-state tick (selecting mode only) | "Include every eligible line in {room}" | bulk-release mode only (`:830-835`) |

**3 acts** (2 in normal project mode).

### FFELine (`ffe-section.tsx:491-746`)

| Act | Label | Notes |
|---|---|---|
| Click the row | — | toggles unfold (`:697-704`) |
| `edit-ffe-line-spec-details` | "Edit spec details →" | only visible when unfolded; leaves the Document for `/spec-book` (`:732-741`) |
| `record-a-change-line` (conditional) | "Record a change" | only when `recordChange` flag set (`:463-472`) |

**Up to 3 acts**, before even unfolding into LineUnfold.

### LineUnfold (`line-unfold.tsx`)

| Act | Label | Notes |
|---|---|---|
| Next act (one of) | Order / Send to vendor / Log inspection / (inline ack) / advance / Install | contextual, `:218-253` |
| Order (secondary) | "Order" | shown again if not the lifted Next (`:388`) |
| Send to vendor (secondary) | — | `:389` |
| Log inspection (secondary) | — | `:390` |
| Room `<select>` | "Unsorted" / "Throughout" / room names | `:346-378` |
| FolioStrip | (upload/view cut sheets) | `:381-384` |
| `bill-ffe-line` | "Bill" | `:394-402` |
| `include-line-in-next-release` (conditional) | "Include in the next release" | `:405-413` |
| `add-ffe-line-note` | "Add note" | `:414-420` |
| `fold-ffe-line` | "Fold" | `:421-427` |

**9-10 distinct acts** live inside one unfolded line, on top of the 3 above it — **12-13 acts reachable from a single click on one line**, before Leah has entered any spec detail.

### AddLineSheet (`add-line-sheet.tsx`)

Line name, How many, COM checkbox, "Add the line"/"Add the pair". **1 act, 3 fields** — by far the simplest surface, and the one Leah explicitly likes (TRANSCRIPT.md:61, "I like this: add a line").

### AddToProjectSheet / LineCard

AddToProjectSheet: **11 road choices** (§1, row 10) + "Return to Project · FF&E" finish act (`add-to-project-sheet.tsx:190`). LineCard (`line-card.tsx`): seller/maker fields (name, where, how paid / website), scope picker (room/throughout/unassigned buttons, `:505-507`), room `<select>` (`:513-516`), "Design status" `<select>` with 4 options (`:521-526`), "Optional board placement" `<select>` (`:530-533`), "Optional placeholder to fill" `<select>` (`:554-556`), trade price input (`:452`), and one save act (`:564-566`). **Roughly 8 distinct fields/controls plus 1 save act**, behind 11 initial road choices.

### Spec book SelectionEditor (`spec-book-workspace.tsx:254-626`)

Fields: SKU, Finish, Material, Color/fabric, Exact location, dimensions (structured/raw toggle, `:279-295`), notes. Acts: "Declare N/A" (`:350`), "Save selection" (`:366-367`). **~6 fields, 3 acts**, on a route that unmounts the time tracker (§7) and has no way back except the global nav (TRANSCRIPT.md:37, "How do I get back to Project?").

### Library and Piece room

- Library listing (`components/document/rooms/library/library-room.tsx`, 286 lines): **3 `DocumentAction`s total**, none of them delete/merge/archive.
- Piece room (`/library/[id]`, `components/document/rooms/piece/piece-room.tsx`, 1563 lines, same component as the Library item view, per its own comment at `app/(document)/library/[id]/page.tsx:7-12`): **17 `DocumentAction`s** — rich editing of one catalog item, zero delete.

**Total distinct visible acts counted across the surfaces Leah actually used in the transcript (section head, RoomHeading, FFELine→LineUnfold, AddLineSheet): 30+.** This is the concrete evidence behind "too many functions at once" — a single unfolded line alone exposes more controls than the entirety of AddLineSheet, the one surface Leah found simple.

---

## 4. Scenarios S1–S8 — today's exact click path

| # | Scenario | Today's path | Clicks / screens | Gap type |
|---|---|---|---|---|
| S1 | Rough-in 4 lines in Living Room, under a minute, without leaving the list | Room heading "Add a line" (`ffe-section.tsx:874-884`) → sheet opens (`AddLineSheet`) → type name → "Add the line" → sheet closes → repeat ×4. **Possible and matches Leah's own praise** (TRANSCRIPT.md:61). | ~2 clicks + 1 sheet open/close per line × 4 = **~12 actions, 1 screen** (sheet layers over the list, doesn't navigate away) | None — this is the one flow recon and Leah agree works |
| S2 | One floor/tile piece in 4 named rooms, not "throughout" | **Not possible.** `assignment_scope` CHECK forces exactly one room or the scope value `throughout`/`unassigned` (00434:246-250); no join table. The only workaround is 4 separate line rows, which is not "one piece" and loses the single source of truth Leah is asking for. | — | **Data-model gap** |
| S3 | "Hardware, 2 knobs" (placeholder) becomes the real knob, intent survives; shower outlined as components then backfilled | Section head "Add a line" → AddToProjectSheet → "From the Library" road → product picker (search/select) → LineCard → "Optional placeholder to fill" select → pick the placeholder → Save. **Possible**, but `name` is overwritten with the product's name (00435:194-196) — the intent text ("Hardware, 2 knobs") is lost, contradicting "intent survives." | ~6-7 clicks, 2 screens (sheet + picker) | **UI defect** (data survives in the row but is destroyed on fill — see §7) |
| S4 | Wallpaper + attached labor line; oak floor priced per sq ft with an image and a few editable fields | Labor attachment: **not possible** — Trade Scope (00423) is a lump sum per trade in prose, with no FK to `project_ffe_items`, and no "labor" `item_type`. Oak-floor-as-a-thing: possible via "A custom piece" road into LineCard (name, trade price, maker fields) — but LineCard has **no image-upload control** for the `custom`/`need` roads (`imageUrl` only ever comes from `prefill`/`pick`, `line-card.tsx:219`, which those roads never populate). | Labor: no path. Floor: ~5 clicks, 2 screens, minus the image | **Data-model gap** (labor attach) + **UI gap** (no image control on custom/need roads) |
| S5 | Delete the sunroom line; delete a duplicate from the studio catalog | Line delete: **not possible from any UI** — `archive_project_selection` exists but nothing calls it (§1 row 16, §2g). Catalog delete: RLS permits it (`products_studio_delete`) but `DeleteProductDialog`/`useDeleteProduct` are wired to nothing (§1 row 16). Matches Leah's own words exactly (TRANSCRIPT.md:37-39, "I can't delete anything... that's good to know that I'm just not missing it."). | — | **RPC-exists-no-UI** (both halves) |
| S6 | Drag a piece between rooms | **Not possible.** No drag handlers on `FFELine`/`RoomHeading`; DECISIONS.md:1197-1200 defers it explicitly ("assignment ships via the unfold"). The only room change is the LineUnfold Room `<select>` (one line at a time, inside an unfold). | n/a — the select substitute is ~3 clicks (unfold the line, open select, choose room) per line | **UI-only gap** (the RPC/data path — `triage_project_ffe_items` — already supports reassignment; only the drag gesture is missing) |
| S7 | At each stage, show only what's possible now; obvious way back to the project overview; time tracker doesn't interrupt | **Not built as a device.** "Lens" exists as 5 unrelated code concepts (§1 row 23) with no single "you are in stage X" switch. Getting back to Project from spec-book is a global-nav act, not an in-flow one (TRANSCRIPT.md:37, "You got to go back to your project..."). The time tracker (`useHoldDocument`) unmounts on navigating to `/spec-book` and fires the Log/Discard popup (§2, §7) — it does interrupt. | — | **UI/architecture gap** — this is the whole ask, not a single click path |
| S8 | Room-by-finish paint schedule document, painter-only, doesn't have to live in Patina | **No designer-portal surface exists.** `proposal_palettes`/`palette_swatches` (00131) are the closest shape (per-room, `role` enum already includes wall/ceiling/trim/floor/metal/textile, `00131_proposal_palettes.sql:51`) but are keyed to `proposal_id`, pre-signature only, and `useProjectPalettes` is unused (§1 row 22). | — | **Data-model gap** (no project-scoped palette) + **UI gap** (no document/export) |

---

## 5. Data-model inventory

### `project_ffe_items` (base: `00066_proposal_project_flow_v2.sql:256-282`; altered by 15+ later migrations)

Full column provenance (every `ALTER TABLE project_ffe_items ADD COLUMN`, grepped across `supabase/migrations/*.sql`):

| Column | Added | Purpose |
|---|---|---|
| `blocked_by_decision_id`, `last_status_change_at` | 00084 | decision gating |
| `purchase_order_id` | 00148 | PO link |
| `received_quantity` | 00150 | receiving |
| `source_decision_id` | 00175 | decision provenance |
| `trade_price_cents`, `markup_percent` | 00185 | dual pricing |
| `added_via` | 00208 | provenance tag (e.g. `'engine'`, `'replacement'`) |
| `doc_code` | 00262 | document code |
| `custom_fields JSONB NOT NULL DEFAULT '{}'` | **00268** | open-ended per-line data |
| `source_commercial_document_id`, `source_authorization_item_id` | 00412 | commercial authority |
| `trade_scope_document_id` + 2 more | 00423 | trade-scope presence line |
| `selection_thread_id`, `supersedes_ffe_item_id`, `design_disposition`, `assignment_scope`, `removed_at`, `removed_by`, `removal_reason` | **00434** | the disposition/room/archive axes (§2) |
| `role_identity` | 00438 | RPC role tagging |
| `currency` | 00661 | multi-currency |
| `installed_on` | 00691 | install date |
| **`parent_ffe_item_id`** | **00702** | COM-pair linkage (one line points at its parent) |

**What's already there to carry Leah's asks, without a migration:**

- **Placeholder intent** (S3's "intent survives"): `custom_fields` (00268) could hold the original placeholder name/description, read back as a fallback label when `product_id` is non-null, without touching the destructive `name` assignment in `00435:196` directly — or the RPC fix itself (§7) could simply stop overwriting `name`.
- **Unit of measure** (S4's "per square foot"): no column exists; `custom_fields` (00268, JSONB, already present) is the lowest-friction place for a `unit`/`uom` key without a schema change. `products.dimensions JSONB` (`00001_initial_schema.sql:35`, `{ width, height, depth, unit }`) shows the codebase already has a `unit` convention to borrow.
- **Multi-room placement** (S2): no existing column can carry this — `assignment_scope`'s CHECK constraint (00434:246-250) structurally forbids more than one room per row. This genuinely needs either a join table or a deliberate "the same piece, several lines" convention (and a way to keep them visually one piece — `parent_ffe_item_id` or `custom_fields` could tag siblings after the fact, but nothing does today).
- **Labor attachment** (S4's wallpaper + labor line): **`parent_ffe_item_id` (00702) already exists and already means "this line belongs to that line"** — today used exclusively for COM-fabric pairs (`components/document/buying/com-piece.tsx`, wired from `add-line-sheet.tsx:80-88`). The same column could carry a labor line pointed at its piece without a migration; nothing in the RPCs or UI currently allows creating a labor-typed line or pointing an arbitrary line at a parent outside the COM flow.

### `project_ffe_specs` (SKU/Finish/Material/etc., per `spec-book-workspace.tsx`)

Confirmed by sibling evidence (`artifacts/procurement-buying-review-2026-10-05/research/r2-item-intake.md:5`): "`project_ffe_specs` is always inserted empty (`ffe_item_id`, `routing_source` only) regardless of path" — the spec fields render through a fallback chain (project override → FF&E line → product master), never copied onto the line at intake.

### `project_rooms` (`00066...sql:220-237`)

`name`, `budget_cents`, `committed_cents`, `actual_cents`, `ffe_categories TEXT[]`, `notes`, `sort_order`. No column suggests multi-room membership for a line; rooms are purely the "one side" of the `project_ffe_items.project_room_id` FK.

### Studio-layer `products`

Base at `00001_initial_schema.sql:29-46`: `dimensions JSONB { width, height, depth, unit }`, `materials TEXT[]`, no unit/UOM beyond that embedded field. Studio scoping (`layer='studio'`, `studio_id`) referenced in the delete policy (`00584...sql:1270-1281`); added prior to 00584 (00152, per that migration's own comment at `:1267-1268`).

### Trade scope (00423) — see §1 row 17, §2a. No FK to `project_ffe_items`.

### `po_cost_lines` (00704, `supabase/migrations/00704_po_cost_lines_shipments.sql:56-82`)

PO-grain, not line-grain: `purchase_order_id`, `kind` (`freight, crating, liftgate, residential, white_glove, receiving, storage, handling, restocking, other` — no `labor`/`install`), `estimate_cents`/`actual_cents`, `billable_to_client`, `billing_rule`. This is logistics cost on a PO, not a mechanism for attaching labor to a schedule line — it does not fill the S4 gap.

### Palettes (00131) — see §1 row 22, §4 S8. `proposal_palettes`/`palette_swatches`, `proposal_id`-scoped, pre-signature only. `palette_swatches.role` (`wall/ceiling/trim/floor/metal/textile/accent/foundation/other`, `00131...sql:51`) is a ready-made shape for a room-by-finish document if re-scoped to `project_id`.

---

## 6. Prior-art digest

- **`docs/design/project-ffe-workflow/ffe-within-the-document-proposal.html`** ("Keep the project in hand"): proposed the project page show "what is settled, what is being built, the next useful act" and "one verb at the Project · FF&E heading opens all valid sources." **Partly shipped** — the single "Add a line" ledger entry opening `AddToProjectSheet` is exactly this, but the destination fanned out to 11 roads instead of staying simple.
- **`docs/design/project-ffe-workflow/one-project-three-doors-proposal.html`** ("One project, three doors in, one living list"): named the exact bug class Leah hit — "Card → Piece Room → Add to a project → project row. The item lands unassigned, and the designer must refine it later" — and proposed consolidating to three doors. **Shipped the consolidation instinct, not the restraint**: doors grew to 11 rather than 3.
- **`docs/design/spec-books/contracts.md`**: "frozen for the pilot" — `project_ffe_items` is the live schedule, `products` is master data never touched by selection edits, `project_ffe_specs` holds only project-specific data. **Shipped as written** — confirmed by the empty-insert behavior in §5.
- **`docs/design/spec-book-workflow.html`** ("From Captured Piece to Issued Book"): the spec-book pipeline this describes is the live `spec-book-workspace.tsx` surface — **shipped**, including the separate-route friction Leah hit (§1 row 20).
- **`docs/design/the-document/the-document-schedule-package.md` R99-R101**: govern the **Schedule** region's spine/rule architecture ("one schedule with a folded and unfolded state... nothing is thrown away, we are building the trunk") and chain model (durations/links, dates derived) — not Pieces-specific, but the "one state, two renderings, never duplicated" doctrine is the clearest existing precedent for the single "lens" device S7 asks for.
- **`docs/design/authorized-schedule/the-authorized-schedule-proposal.html`**: the Authorized Schedule's core idea — "the signed row and the schedule row are now one row" — is already live, cited verbatim in `line-unfold.tsx:11-15`. **Shipped.**
- **`artifacts/procurement-buying-review-2026-10-05/research/r2-item-intake.md`**: five days older than this brief, same territory. Its headline — "nine intake paths... fan into only two real write mechanisms" (`place_product_in_project_v2`, `create_named_project_need`) — is confirmed still true in substance, though the sheet now offers 11 roads, not 9 (§1 row 10). It also independently found the Spec Book *does* edit SKU/finish/dimensions (on `project_ffe_specs`, not the line) — a correction to an earlier brief, not to this one.
- **US-18 `artifacts/document-running-a-job-2026-10-07/synthesis/direction.md` / `delivery/rulings.md`**: direction.md:95-96 proposed a project-wide ⌘K that lands on an unfolded line with its Order cell open, and a unified "Record a change" act — **both landed on the Pieces head/line** (`ffe-section.tsx:1873-1877` already has an analogous single-entry pattern; `record-a-change-*` action keys exist throughout §3). **Caution:** rulings.md:287 names a "Placeholder-name guard" (0a-7) — this is unrelated to the FF&E placeholder-name-overwrite bug in §7; it resolves the *client's* display name (`Client User` → `the client`), not a schedule line's placeholder name. The line-level bug this brief found (00435:196) is still open.
- **DECISIONS.md I25** (`:1160,1197-1200`): explicitly deferred drag-to-assign-rooms and cross-section drag as "polish debt." **Still deferred** — confirmed in §1 row 15/§4 S6.
- **DECISIONS.md placeholders/allowances** (`:1845`): "Allowance (a budget for a category not yet chosen) · TBD (to be [determined])" — the semantic origin of `item_type`'s three values, confirmed still governing §2c.
- **DECISIONS.md multi-room/"throughout"** (`:1038-1039`): an earlier decision described unassigned lines falling under a single combined **"Throughout · unassigned"** label. The current code instead renders **two separate groups** — "Throughout" and "Not in a room yet" (`ffe-section.tsx:2657-2694`) — a drift from that decision that is also the root of the §1 row 9 / §7 naming bug.

---

## 7. Small canon-safe defects worth fixing now

1. **`'Unsorted'` vs `'Not in a room yet'` string-comparison bug** — `components/document/schedule/add-line-sheet.tsx:62` compares `roomName === 'Unsorted'`, but its only caller for the unassigned group passes `'Not in a room yet'` (`ffe-section.tsx:2679-2684`), so every line added from that group is silently misrouted to `assignmentScope: 'throughout'` instead of `'unassigned'`. **Worse: there is a third label for the same value** — the LineUnfold Room `<select>` shows the option text `"Unsorted"` for `assignment_scope='unassigned'` (`line-unfold.tsx:368`), and `LineCard`'s own scope picker also renders `'Unsorted'` for that value (`line-card.tsx:505`). Fix sketch: make `add-line-sheet.tsx:62` compare against `'Not in a room yet'` (or better, pass a stable `roomId === null && !isThroughout` boolean instead of comparing display strings), and rename the `ffe-section.tsx` group heading to `'Unsorted'` to match the other two surfaces — one label, three places, now.

2. **Delete and archive hooks no UI calls** — `useArchiveProjectSelection` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:248`) and `useDeleteProduct` (`apps/designer-portal/src/hooks/use-products.ts:189`) with its dialog (`components/catalog/delete-product-dialog.tsx:24`) and `DuplicateDetectionPanel` (`duplicate-detection-panel.tsx:180`) are fully built and reachable through RLS/RPC but wired into zero buttons. Fix sketch: wire `DeleteProductDialog` into the Library/Piece-room action list (it already exists and compiles) and wire a "Remove this line" act in `LineUnfold` to `useArchiveProjectSelection` with a reason prompt (the RPC already requires ≥5 chars, `00435:530`) — both are UI-only additions over an already-safe, already-reasoned backend.

3. **Time hold released on `/spec-book`** — `hooks/document-time-provider.tsx:916-925` (`useHoldDocument`'s unmount cleanup calls `release()`); the spec-book route (`app/(document)/doc/[id]/spec-book/page.tsx`) never calls `useHoldDocument`, so navigating there from the project page unmounts the hold and fires the Log/Discard popup (`log-strip.tsx:13-14,193,211`) mid-task, exactly as Leah described (TRANSCRIPT.md:33). Fix sketch: mount `useHoldDocument` in the spec-book route's layout too (same `projectId`), so the hold survives the in-project navigation and only releases on leaving the Document entirely.

4. **Placeholder name overwritten on fill** — `supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:194-196`, inside `place_product_in_project_v2`'s placeholder branch: `UPDATE ... SET product_id = v_product.id, name = v_product.name, ...` unconditionally replaces the placeholder's own name. Fix sketch: only set `name = v_product.name` when the existing `name` looks system-generated, or simply stop overwriting `name` here and let the product's identity show through `product_id`/the join instead — the placeholder's authored intent ("Hardware, 2 knobs for custom cabinet") is exactly the information Leah said she needs to survive (TRANSCRIPT.md:49-51).

5. **Section-head "Add a line" and room-level "Add a line" are the same label for two different sheets** — `ffe-section.tsx:1875` (opens the 11-road `AddToProjectSheet`) and `ffe-section.tsx:882` (opens the 3-field `AddLineSheet`). Fix sketch: rename one — the section head's act is "Add to the job" in the sheet's own title (`add-to-project-sheet.tsx:35`'s sibling `openAddToProject('section')`), so surfacing that exact phrase on the section-head button (instead of "Add a line") would remove the collision without touching behavior.

6. **`'alternate'` design_disposition is selectable but has no downstream meaning** — `line-card.tsx:524` offers "Alternate" in the Design status select at line-creation time, but no code anywhere (stamp derivation, readiness, the stage machine, or any later RPC) reads or acts on `design_disposition='alternate'` once set — it is accepted, stored, and then invisible. (Grepped all of `supabase/migrations/*.sql` and `apps/designer-portal/src` for any `design_disposition = 'alternate'` *read* outside a `FILTER`/count context — none found that changes behavior.) Not urgent to fix, but worth naming: it is a control that does nothing yet.
