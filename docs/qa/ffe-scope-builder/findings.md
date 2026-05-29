# FF&E Scope Builder — QA Findings (2026-05-29)

End-to-end QA of the **FF&E (Furniture, Fixtures & Equipment) tab** of the Scope Builder
(`/portal/proposals/[id]/scope?tab=ffe`, component
`apps/designer-portal/src/components/portal/scope-builder/ffe-schedule-builder.tsx`).
Every capability was exercised live in Chrome **and** verified against the local Supabase
database (REST API, service-role) — the FF&E builder writes directly to Supabase, so DB
state is the authoritative signal.

- **Environment:** local — designer-portal `:3000`, Supabase `:54321/:54322`, logged in as
  `designer@patina.dev` (profile `a0000000-…0004`).
- **Test proposal:** `Full Room Design` — `3db5b367-0f88-4524-9883-1a796569ca2a` (status `draft`).
- **Rooms:** Living Room `8d603e69-…0870`, Primary Bedroom `815e9b73-…a354`.
- **Branch:** `qa/ffe-scope-builder`.

## Verdict

FF&E is **functionally solid** once two real defects are fixed (both fixed + re-verified in
this pass). The 3-item-type model (Fixed / Allowance / TBD), totals math, room grouping,
validation, capture-consume, and DB persistence all behave correctly.

| Severity | Issue | Status |
|----------|-------|--------|
| **High (UX)** | BUG-1 — schedule/summary don't refresh after add/update/remove | **Fixed + verified** |
| **High (functional)** | BUG-2 — Quick-create Draft product blocked by RLS | **Fixed + verified** |
| Low (cosmetic) | BUG-3 — duplicate "Preliminary FF&E Schedule" heading | **Fixed + verified** |
| Medium (data/finance) | OBS-1 — allowance midpoint excluded from `proposals.total_amount` | Documented (needs product decision) |
| Low (UX) | OBS-2 — "FF&E Budget" summary tile ignores item costs | Documented |
| Low (gap) | OBS-3 — no in-UI edit of an existing item | Documented |
| Low (gap) | OBS-4 — catalog "+ Add Item" can't assign to a room | Documented |
| Info | OBS-5 — drag gesture not simulable via automation (not a product bug) | Documented |
| Info | OBS-6 — "Generate Proposal from Scope" creates empty section bodies | Documented |

---

## Pass/fail matrix

| # | Case | Result | Evidence |
|---|------|--------|----------|
| FFE-01 | Empty state | ✅ PASS | "No items yet…", both room drop zones + 3 add buttons present; 0 `proposal_items` |
| FFE-02 | Add Fixed (catalog) | ✅ PASS (data) | DB: `fixed`, qty 1, `unit_price=189000`, `line_total_cents=189000`, `product_id` set, unassigned; `total_amount`→189000. Exposed BUG-1 |
| FFE-03 | Add Fixed (Quick-create Draft) | ❌→✅ | Originally **failed** (BUG-2, RLS). After fix: draft product `layer=personal`, `owner_user_id` set, `status=draft`, `$750`; item `fixed`/qty 1/`75000` |
| FFE-04a | Allowance: empty category | ✅ PASS | Save disabled |
| FFE-04b | Allowance: min>max | ✅ PASS | min 2000 / max 1000 → Save disabled |
| FFE-04c | Allowance: min<0 | ✅ PASS | guarded by `min>=0` + `min<=max` |
| FFE-04d | Allowance: valid | ✅ PASS | DB: `allowance`, `budget_min_cents=100000`, `budget_max_cents=200000`, `unit_price=0`, `ffe_category=seating`, Living Room, notes |
| FFE-05a | TBD: empty category | ✅ PASS | Save disabled |
| FFE-05b | TBD: valid | ✅ PASS | DB: `tbd`, `budget_*`=null, `unit_price=0`, `ffe_category=lighting`, unassigned, notes |
| FFE-06 | Cancel (allowance/TBD) | ✅ PASS | Form closes, no row written, count unchanged |
| FFE-07 | Estimated-total math | ✅ PASS | fixed $1,890 + allowance midpoint $1,500 + tbd $0 = **$3,890**; later 4 items = **$6,640**; `$`/comma formatting correct |
| FFE-08 | Grouping / empty zones | ✅ PASS | Unassigned + per-room groups; empty room shows dashed drop zone; allowance shows range, TBD shows "—" |
| FFE-09 | Remove item | ✅ PASS (data) | DB row deleted, `total_amount` recalculated. Exposed BUG-1 on remove path |
| FFE-10 | Drag capture → room (consume) | ✅ PASS (contract) | `consume_capture` → `fixed` Velvet Club Chair, **qty 2**, `unit_price=125000`, `line_total_cents=250000`, `ffe_category=seating`, Primary Bedroom; capture → `status=consumed` + back-refs + `consumed_at`. Gesture itself not simulable (OBS-5) |
| FFE-11 | Category dropdown | ✅ PASS | Lists 13 system categories; no custom-create UI in FF&E tab (minor) |
| FFE-12 | Edit existing item | ⚠️ GAP | No edit affordance — only remove ×. `useUpdateProposalItem` exists but is unused (OBS-3) |
| FFE-13 | Persistence across reload | ✅ PASS | Every item reappears after hard reload — genuinely DB-backed, **not** mock-fallback |
| FFE-14 | Generate Proposal from Scope | ✅ works | Creates 7 sections; bodies mostly empty (OBS-6) |

---

## Bugs (fixed in this pass)

### BUG-1 — FF&E schedule & scope summary don't refresh after add/update/remove  ·  High (UX)

**Symptom.** Adding an item from the catalog (or via Allowance/TBD forms) or removing an
item left the schedule showing the *old* contents ("0 items / No items yet" after the first
add) until a manual page reload. The write succeeded in the DB but the UI looked like nothing
happened — exactly the kind of "is it broken or did it save?" confusion the repo's prior
mock-fallback audit warned about.

**Root cause.** The FF&E builder reads items from React-Query key
`['proposal-items-schedule', proposalId]` (`ffe-schedule-builder.tsx:1181`) and the summary
tiles from `['scope-builder-summary', proposalId]`. Only `useConsumeCapture` invalidated
those keys. `useAddProposalItem` / `useUpdateProposalItem` / `useRemoveProposalItem`
(`packages/supabase/src/hooks/use-proposals.ts`) invalidated only `['proposals']`,
`['proposal', id]`, `['proposal-stats']` — never the two keys the Scope Builder actually reads.

**Fix.** Added the two missing invalidations to all three item hooks' `onSuccess`
(mirroring `useConsumeCapture`):
```ts
queryClient.invalidateQueries({ queryKey: ['proposal-items-schedule', proposalId] });
queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
```

**Verified.** After the fix, adding an allowance showed the new row live ("4 items · Est.
total $6,890") and removing it dropped back to "3 items · $5,890" — both **without any
reload**. The Quick-create Draft add also appeared live.

### BUG-2 — Quick-create Draft product rejected by row-level security  ·  High (functional)

**Symptom.** Picker → **Quick-create draft** → "Create draft + use" → red banner
*"Failed to create draft"*. Console: `new row violates row-level security policy for table
"products"`. No product row was created — the entire Draft tab was non-functional for designers.

**Root cause.** `products` INSERT is governed by layered RLS; a designer may insert only into
their **personal** layer: `products_personal_insert` = `layer='personal' AND owner_user_id =
auth.uid()`. `useCreateDraftProduct` (`packages/supabase/src/hooks/use-products.ts`) inserted
`{name, brand, source_url, price_retail, status:'draft', captured_by, …}` but **never set
`layer` or `owner_user_id`** (and `layer` is `NOT NULL` with no default), so the insert
matched no INSERT policy and was rejected.

**Fix.** Set the personal-layer ownership on the insert:
```ts
layer: 'personal',
owner_user_id: user.id,
```

**Verified.** Draft "Custom Walnut Console (QA Draft)" now creates a product
(`layer=personal`, `owner_user_id=a0000000-…0004`, `status=draft`, `price_retail=75000`) and
adds it as a `fixed` item ($750), appearing live in the schedule.

### BUG-3 — Duplicate "Preliminary FF&E Schedule" heading  ·  Low (cosmetic)

**Symptom.** The heading rendered twice on the FF&E tab (same pattern on every Scope Builder
tab, e.g. "Rooms in Scope").

**Root cause.** `ScopeBuilderShell` renders an `<h3>` title + description for each tab, and
the child component (`FFEScheduleBuilder`) **also** rendered its own `<h3>`.

**Fix.** Removed the redundant `<h3>` inside `FFEScheduleBuilder` (it's used only by the
shell), keeping the useful "{n} items · Est. total" subtitle. Verified: a single heading now.
*(Other tabs — Rooms/Palette/Phases/etc. — exhibit the same duplication in their child
components; out of scope for this FF&E pass but worth a follow-up sweep.)*

---

## Observations (documented — not changed)

- **OBS-1 — Allowance midpoint excluded from the proposal total (medium, financial).**
  Allowance items store `line_total_cents=0` (only `budget_min/max_cents` are set), and
  `updateProposalTotal` sets `proposals.total_amount = Σ line_total_cents`. So the on-screen
  "Estimated Total" includes allowance midpoints (e.g. $3,890) but `proposals.total_amount`
  does **not** (stayed $1,890). This propagates to the proposals-list "Value", win-rate
  metrics, and — via `activate_proposal_as_project` — the project's `budget_cents`. **Two
  totals on the same workflow disagree.** *Recommended fix needs a product decision:* either
  fold the allowance midpoint into the stored total/budget, or relabel the on-screen figure as
  a non-binding estimate. Not changed here because it alters financial semantics.

- **OBS-2 — "FF&E Budget" summary tile ignores item costs (low).**
  `useScopeBuilderSummary` computes the tile as `Σ proposal_scope_rooms.budget_cents`, so it
  showed **$0** next to "FF&E Items 4" and a $6,640 schedule. By design (it reflects per-room
  budget allocations), but the label reads as the FF&E spend and is confusing.

- **OBS-3 — No in-UI edit of an existing item (gap).** Item rows expose only a remove ×;
  quantity/price/category/room can't be edited after creation (e.g. capture-consumed items are
  stuck at qty/price from creation). `useUpdateProposalItem` exists but is never wired to UI.

- **OBS-4 — Catalog "+ Add Item" can't target a room (gap).** Catalog picks always land in
  "Unassigned" (no room selector in the picker flow). Only the Allowance/TBD forms and
  drag-drop assign a room.

- **OBS-5 — Drag gesture not simulable via automation (info, not a defect).** Neither a CDP
  drag nor synthetic `PointerEvent`s activated dnd-kit's PointerSensor. The wiring is correct
  (dnd-kit 6.3.1 supplies default Pointer/Keyboard sensors; droppables + `handleDragEnd` are
  sound), so this is a test-harness limitation. The consume contract was verified by calling
  `consume_capture` directly with the modal's exact arguments.

- **OBS-6 — "Generate Proposal from Scope" creates empty section bodies (info).** It created
  the 7 sections (vision/concept/space_plan/selections/investment/timeline/terms) but most
  bodies are blank (only static blurbs in selections/terms). Structured FF&E data stays in
  `proposal_items`; it is not embedded into section bodies.

---

## Files changed

- `packages/supabase/src/hooks/use-proposals.ts` — BUG-1: add `proposal-items-schedule` +
  `scope-builder-summary` invalidations to the three item-mutation hooks.
- `packages/supabase/src/hooks/use-products.ts` — BUG-2: set `layer:'personal'` +
  `owner_user_id` on the draft-product insert.
- `apps/designer-portal/src/components/portal/scope-builder/ffe-schedule-builder.tsx` — BUG-3:
  drop the duplicate heading.

**Verification:** `tsc --noEmit` clean for the designer-portal (covers the .tsx change and
`@patina/supabase` imports); all three fixes re-tested live (UI live-update) and against the DB.
