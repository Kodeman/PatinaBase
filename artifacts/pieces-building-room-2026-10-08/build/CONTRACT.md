# US-21 Build contract: the Build room, Direction A, slices 0–5

**SQ-600 · W0 · 8 October 2026 · Opus 5.5.** Verified against main `879742578`. Integration branch `pieces/build-room`, cut from that commit.

**The goal.** All of Direction A ships in ONE production release, on for everyone, with no feature flag:
- slices 0–5 of `synthesis/direction.md` §5;
- D1–D16 and D18;
- the fix-now track.

US-19 (Running a Job) rides the same release (§6).

**Out of scope:**
- **D17**, fractional quantity: deferred.
- **D19**, a client-price authority on active jobs: not built.

**Sources.** This contract is built from these. Where it corrects one of them, it says so; anything it does not restate stands as written there.
- `synthesis/direction.md`: D-entries, the D1 table, the D7 worked cases, fix-now, slices and Q-rulings.
- `specimens/SPEC.md`: tokens §2.1, stamps §2.4, frames a1–a15.
- `review/r1-opus.md`, `review/triage.md` and `briefing/current-state.md`.

**Story rulings bound here (final):**
- **Rollout:** on for everyone. Beige is reading and white is working: drafting stock on the Build room only, and the Document paper stays beige with no tabs.
- **Q3:** the stage words are `Placeholder · Specced · Ready · Released`. There is no ROUGHED.
- **Q4:** placements use a join table, keep the primary room, and ship in 3 phases.
- **Q5:** labor is a line on its piece, billed on its own line, never on the maker PO. Trade Scope stays for lump sums.
- **Q6:** the spec book survives.
- **Q7:** Rough $ is internal and visible to every seat; trade cost, markup and client price appear only in Price, governed by R1.
- **Q8:** I25 reopens, with drag plus `Move to room…`.
- **Q9:** a group heading is allowed.
- **Q10:** a minimal paint and finish schedule.
- **Q11:** merge, never hard delete.
- **Q12:** an allowance filled at or under its ceiling records the variance; over it, Record a change.
- **Q13:** `READY FOR LEAH` records an internal D18 fact.
- **Q14:** the Pieces region becomes room overview rows.
- **Q15:** record the reading.
- **Q16:** Record a change.

Paths are repo-relative. `DP` = `apps/designer-portal/src`. `M` = `supabase/migrations`.

---

## 1. Anchors, re-verified

Every anchor below was opened on `879742578`.
- **Moved** marks an anchor that has moved since `direction.md` cited it.
- **New** marks evidence the direction did not have.

### 1.1 Fix-now track (slice 0)

| # | Anchor (verified) | Status | Notes for the executor |
|---|---|---|---|
| 1 | `DP/components/document/schedule/add-line-sheet.tsx` (172 lines): `:89-90` `reset(); onClose();`; no `<form>` or `onKeyDown`; `:112` autoFocus | confirmed | The sheet imports `useCreateNamedProjectNeed` and `useAddComFabricLine` from `../buying/com-piece`. |
| 2 | `add-line-sheet.tsx:62` compares to the display string `'Unsorted'`. `:64` sends `throughout`. `ffe-section.tsx:2679,2683` print `Not in a room yet`. `line-unfold.tsx:368` and `schedule/line-card.tsx:505` print `Unsorted` | confirmed | **New:** the `assignment_scope` CHECK is `(assignment_scope='room') = (project_room_id IS NOT NULL)` (00434). "Not in a room yet" must send `assignmentScope:'unassigned'` with `roomId:null`. |
| 3 | `ffe-section.tsx:1874-1875`, head act `open-add-to-project` "Add a line"; `:876-882`, room act `open-add-schedule-line` | confirmed | The sheet title lives in `DP/components/document/schedule/add-to-project-sheet.tsx` (209 lines). A second file of the same name exists at `components/document/rooms/piece/`; leave that one alone. |
| 4 | `DP/lib/document/stamp-derivation.ts`: fallthrough `:140-143`, LineStampInput `:56-67` (no product, vendor or authorization fields), labels `:162-180`; `ffe-section.tsx:1862` unspecifiedLineIds | confirmed, **plus New** | **The word "unspecified" is a cross-file contract.** It prints at `ffe-leader.ts:98`, `act-names.ts:104,466,468,578` and `ticket-derivation.ts:488,564`. **US-19's band parses it:** `lens-band-derivation.ts:1119`, the `UNSPECIFIED` regex over the `ticket:spec` sentence. Renaming it in one place drops the band's Standing row in silence, so all of them move in one ticket (T-3). |
| 5 | `M/00066_*.sql:268` `unit_price_cents DEFAULT 0`; `ffe-section.tsx:1405-1406` billableUninvoiced excludes only NULL | confirmed | |
| 6 | `line-unfold.tsx:386-428` acts; `packages/supabase/src/hooks/use-project-ffe-ga.ts:248` useArchiveProjectSelection; `M/00435:521-545` (reason ≥5 at `:530`; refusal `:531-539`; writes `removed_at, removed_by, removal_reason`, `design_disposition='not_selected'` at `:541-542`) | confirmed | **New:** `removed_at`, `removed_by` and `removal_reason` already exist (`00434:208-210`). D8 adds only `removed_disposition`, so a restore can return the line to its prior disposition. |
| 7 | `DP/hooks/document-time-provider.tsx:916-925` useHoldDocument; `HeldDocument` `:72`; the call at `DP/app/(document)/doc/[id]/page.tsx:1178-1185`; row from `useDocumentEngagement(id)` `page.tsx:1020-1027` | confirmed | There is no `doc/[id]/layout.tsx`. `spec-book/`, `boards/` and `plans/` each have a pass-through layout. Six page tests mock `useHoldDocument`. `components/document/rooms/room-shell.tsx:11-13` relies on `/doc/[id]` unmounting to release the hold. That still holds: Library and Rooms routes sit outside `/doc/[id]`. |
| 8 | `DP/components/document/spec-books/spec-book-workspace.tsx` (1669 lines): back link `:1095-1100`; room reads `:821,841`; `ffe-section.tsx:737-740` links with `?ffeItemId=` | confirmed, **plus New** | **No `#line-<id>` anchor exists anywhere on the paper.** There is no line `id` attribute and no hash handler; only `arrival/arrival-run.tsx:168` reads the hash. The back link needs an `id` on the row (line-card) and a settle-then-scroll handler in ffe-section. Room select: `useAssignLineRoom`, `DP/hooks/use-document-rooms.ts:72-90`. |
| 9 | `DP/components/document/buying/exception-overlay.tsx:149-160` (defaultType `'damage'`), `:803` | confirmed | |
| 10 | No internal rough field exists. The allowance fields are `packages/types/src/ffe.ts:131-139` (CreateNamedProjectNeedRequest) and `00447:219-241` | confirmed | It needs D12's column, so it ships in W3 (T-28), after W2 lands the column. |
| 11 | `ffe-section.tsx:1847` ffeTradeWord and `:2550` "Build the FF&E schedule", both on `oneVoice` (state `:1193`; `FlagProbe` `:2758`); the spec book prints "selections" at `spec-book-workspace.tsx:1104,1197,1376` | confirmed | Delivered by turning `one-voice` on for everyone at ship (§6), plus the spec-book rename. |
| 12 | **Moved:** "Everything ordered is moving." is `DP/lib/document/document-guide.ts:236`, not ffe-section | moved | Tests: `DP/lib/document/__tests__/document-guide.test.ts`. |
| — | `DeleteProductDialog`/`useDeleteProduct`: `DP/hooks/use-products.ts:189-197`; the products FK `00066:261` is `ON DELETE SET NULL` | confirmed | Never wired before D11 (T-53 retires it). |

### 1.2 Data-model delta

Each row gives the latest definer (last writer wins); every CREATE OR REPLACE in §2 builds on these.

| D | Verified anchor | Correction or new evidence |
|---|---|---|
| D1 | `stamp-derivation.ts:104-144`. Consumers: `page.tsx`, `line-unfold.tsx`, `command-bar.tsx`, `ffe-section.tsx`, `shelves/spec-book-leaf.tsx`, `lib/document/room-state.ts`, `lib/document/ticket-derivation.ts`. Tests: `lib/document/__tests__/{stamp-derivation,stamp-label-parity,trade-schedule-stamps}.test.ts`, `components/document/shelves/__tests__/spec-book-leaf.test.tsx` | **New:** `ffe_line_authorization_state(p_item_id uuid) RETURNS text` exists, STABLE SQL at `00705:79-97`, returning `sent`, `client_signed`, `executed` or NULL. Row 6 reuses it. |
| D2 | Threads table `00434:194-201`, CHECK `:246-250`, RLS `00438:383` (`studio_read`, SELECT only) | **Moved:** the fill's name overwrite is `00678:1378`, inside `_place_product_in_project_v2_00438_impl`, latest at **`00678:1263`** (not `00435:194-196`). The public entry is `place_product_in_project_v2` `00447:190`. Its fill guard is `:256-269`, and `:275` calls `_place_product_in_project_v2_00444_impl`. `create_named_project_need` `00435:332` is a SQL INVOKER wrapper and needs no change. |
| D3 | `00692:31` set_project_ffe_line_commercials; allow-list `:50-56` | `unit` does **not** join the commercial allow-list: 00692 is vendor and trade only by ruling (header `:25-26`). Unit is written by the new `set_project_ffe_line_build_fields` (§2). |
| D4 | `parent_ffe_item_id` column `00702:91-104`; `link_ffe_pair` `00702:108-168` (one-level check `:147`) | All readers are listed in §1.3. |
| D5 | **Moved:** `create_purchase_order` latest outer is **`00450:15-52`**. The original body (`00435:878`) was renamed to `_create_purchase_order_00449_impl` in 00449. | **New:** the outer already refuses any line whose `vendor_id ≠ p_vendor_id` or that is not `selected` and active (`00450:36-42`). A labor line therefore never reaches a maker's PO unless the maker is its vendor, which is exactly the "installer is the vendor" exception. W2 proves this with a SQL test and rewrites the outer **only if** the test fails. |
| D6 | No `project_line_groups` or `line_group_id` exists | No name collision. |
| D7 | Room FK `00066:259-268`. **Moved:** `get_client_project_selections` latest is **`00441:82-104`**: an explicit column allow-list, disposition `selected` only. The authorization inner impl is `_create_furnishings_authorization_from_schedule_00444_impl`, latest **`00578:2924-3215`**; its line-freeze insert is **`00578:3163-3196`** (`room_name`, `project_room_id`, `snapshot jsonb`). The public outer is `00462:1408`. | **New:** the client portal's selection surface reads **`get_client_project_threshold`** (`00580:167-342`, room reads `:214-215`, `:294-295`), not `get_client_project_selections`. The iOS Patina app reads `get_client_project_selections` (`apps/mobile/Patina/Patina/Core/Network/ProjectsAPIClient.swift:120,249`). The commercial bundle is `get_client_commercial_document_bundle` `00638:322`, which takes roomName from the frozen item at `:543`. Name collisions: `_reconcile_activated_ffe_placements` (activation), `PlaceProductInProjectRequest.placement` (board x/y, `types/src/ffe.ts:107`), `FfePlacementOutcome` (`:57`), and supersede's `placementIds` (`00661:403`, board placements). TS names therefore say **room placement**. |
| D8 | `archive_project_selection` `00435:521-545` | Review publication is `project_review_items.source_ffe_item_id` (`00434:324-327`) joined to `project_review_editions.status <> 'draft'` (`00434:294-316`). "Never published" means no such row. |
| D9 | `supersede_project_selection` `00661:374-441`: guard `:387-393`, notes `false,NULL` at `:424`, fresh empty spec `:429-430` | |
| D10 | Fill guard `00447:256-269` | |
| D11 | `products.merged_into_id`, `deleted_at` `00152:55-56`; `products_studio_delete` `00584:1270-1282` | |
| D12 | `project_ffe_items` | **New:** clients cannot read the raw table. The client SELECT policy was dropped (`00434:11`, `00462:925`) and writes are revoked (`00438:442`); payloads use explicit allow-lists (`00441`). `rough_cents` is protected by omission: it must never be added to any client RPC. |
| D13 | Precedent `batch_place_library_products_in_project` `00435:336` | |
| D14 | As fix-now 7 | |
| D15 | `project_ffe_specs.selected_media` `00380:53`. Spec column writes go through the authenticated column grant (`packages/supabase/src/hooks/use-add-to-the-job.ts:90-108`) | T-9 checks whether `selected_media` is in that grant, and adds it in 00729 if not. |
| D16 | **Moved:** `project_palettes` **already exists** (`00140:16-66`), keyed `project_id` + `scope_room_id` (FK `project_rooms`), with `swatches jsonb` holding `{hex,name,role,brand,brand_code,sort_order}`. Studio RLS: `00316:178` `project_palettes_studio_rw`. `paint_colors` exists (`00132:17`). The hook `useProjectPalettes` (`packages/supabase/src/hooks/use-project-v2.ts:101`, key `['project-palettes', projectId]`) has no consumers. | **Nothing to re-key.** The 00140 policy "Inherit project access for palettes" is `FOR ALL` and includes `client_id`, so clients can write palettes today. D16 narrows that to client SELECT. |
| D18 | No `project_room_handbacks` exists | |
| — | `guard_ffe_rpc_mutation` (latest `00438:371`, trigger `a_ffe_rpc_mutation_only_trg` `00435:958-960`) raises "RPC-only" on any authenticated write | Every new `project_ffe_items` column is written only by SECURITY DEFINER RPCs that `set_config('app.ffe_mutation_rpc','on',true)`. |
| — | Spec-book hash: `_spec_book_current_item_snapshots` `00714:124-260` builds `jsonb_strip_nulls(jsonb_build_object(...))` `:146` and hashes it with sha256 `:254-256` | **New:** a new snapshot key must be NULL in the default state, or every issued spec book reports a revision on deploy (§2, 00735). |
| — | **Client price** | **New, and a steering note:** no post-placement writer of `unit_price_cents` exists. 00692's header (`:5-9`, `:25-26`) says the only writers are approval, activation and repricing. A pre-activation "client price editable" path would be a new commercial authority, which is D19, and D19 is not built. **In this release the Price lens prints client price and markup read-only on every job**, with the a7 sentence on active jobs (Whole Home Renovation is active). `Make it an allowance` is the one writable client-visible act (00743). Kody may rule otherwise; nothing in W1–W3 depends on it. |

### 1.3 Consumers D1, D4, D5 and D7 must touch

**`parent_ffe_item_id` readers.** This is the complete list. Each must filter `link_kind = 'com'` wherever it means COM: in the labor gate (W2, T-20).
- `DP/components/portal/procurement/order-paper/com-slot.tsx:46,58,77,86,118,124,168`
- `DP/components/document/buying/com-piece.tsx:43,47,48,51,52`
- `packages/supabase/src/hooks/use-buying-phase2.ts:1212,1234` (`useLinkFfePair` `:210` gains `kind`)
- `supabase/functions/po-send/lib.ts:918,940-941` (comArrivingSeparately) and `po-send/index.ts:355`
- SQL: only 00702 (`:91-104`, `:147-162`)

**`project_room_id` readers: 39 files** (R1 counted 33). Rule: **an unaware consumer shows the primary room and never multiplies or splits money by placement.**

| Phase | File | Disposition |
|---|---|---|
| 1 (W2/W3) | `DP/components/document/ffe-section.tsx`, `schedule/line-card.tsx`, `line-unfold.tsx`, `DP/app/(document)/doc/[id]/page.tsx:647` | Overview counts include placed lines in each room. Line rows print the also-in line. |
| 1 | `DP/components/document/shelves/spec-book-leaf.tsx:68-71`, `spec-books/spec-book-workspace.tsx`, `DP/lib/spec-books/model.ts`, `supabase/functions/spec-book-render/render-model.ts` (+ `test-fixtures.ts`), `supabase/functions/spec-pdf/index.ts:539-542` | Print the also-in line from the snapshot's `placements` key. |
| 1 | `add-line-sheet.tsx`, `schedule/document-import-review.tsx`, `packages/supabase/src/hooks/use-add-to-the-job.ts`, `DP/hooks/use-document-rooms.ts`, `packages/supabase/src/hooks/use-project-v2.ts:192,209`, `packages/types/src/ffe.ts:64`, `packages/types/src/project-v2.ts:74` | Create and assign the primary room only. Types gain the room-placement shape. |
| 2 (W4) | SQL `00441:82`, `00580:167`, `00638:322`, `00578:2924`; `packages/types/src/commercial.ts:242`; `DP/hooks/use-commercial-documents.ts`; `apps/client-portal/src/lib/commercial-documents.ts:627,928,1015,1125-1153`; `apps/client-portal/src/components/threshold/approval-ask.tsx:494-496` (+ `threshold.tsx`, `review-ask.tsx`) | Each frozen or client line carries its rooms breakdown. `room_name` stays the primary, for iOS. |
| 3 (W5) | `supabase/functions/po-send/index.ts:300` (sidemark); `packages/supabase/src/hooks/use-procurement.ts:476`; `use-buying-phase2.ts`; `DP/components/document/buying/exceptions.ts:446`; `buying/com-piece.tsx`; `DP/hooks/use-account-page.ts:108-159` (room budgets); `DP/lib/document/project-commerce.ts`; `DP/hooks/use-projects.ts:359,759`; `DP/lib/project-room-adapter.ts` | The sidemark names every room. Receiving allocates per placement. Room budgets split a placed line by share. The rest are audited for per-room sums. |
| none | `apps/client-portal/src/components/threshold/room-capture.tsx`, `commercial/trade/trade-scope-draft-sheet.tsx`, `project-mood-boards.tsx`, `shelves/mood-boards-leaf.tsx`, `mood-board/board-add-rail.tsx`, `board-room-inspector.tsx`, `board-room-shell.tsx`, `packages/supabase/src/hooks/use-boards.ts`, `use-project-visits.ts`, `DP/lib/scope/board-schedule.ts` | These read boards, scans, visits and trade sections, not FF&E lines. Untouched. |

**Stamp derivation.** Covered by the D1 row above, plus `DP/components/document/command-bar.tsx`.

**Authorization:**
- the inner impl `00578:2924`: labor inclusion in W2, the placements snapshot in W4;
- readiness `get_project_ffe_readiness` `00445:5-81` (image rule `:37`, line total `:62`);
- `guard_project_ffe_purchase_authority` (00578).

**PO:**
- `create_purchase_order` `00450:15`;
- `po-send` `index.ts:300,355` and `lib.ts:918-941`;
- `_shared/po-pdf.ts:298`, the qty cell, which gains the unit.

**Receiving:** `record_project_ffe_receipt_batch` `00493:83`; `DP/components/document/orders-book-receiving.tsx`.

**Client payloads:** `get_client_project_threshold` 00580, `get_client_project_review_bundle`, `get_client_commercial_document_bundle` 00638, `get_project_working_budget` `00422:1005`, `list_furnishings_authorizations` `00422:2058`, `get_project_authority_summary`, `resolve_spec_book_share`, `get_client_project_selections` 00441.
- **Rough $:** none of these may select `rough_cents`.
- **Placements:** only 00441, 00580 and 00638 gain them, via the frozen snapshot.

---

## 2. Migration plan

**Numbering.** Provisional, from 00729, with a gap per wave. Before a wave's first file lands, the wave's reset owner posts one `story_log` line, `DECISION: US-21 reserves 007xx–007yy`, and checks that `ls supabase/migrations | tail` on main shows no file in the range. If another session has taken a number, renumber the whole wave block upward and keep the order. US-19's 00727 and 00728 are already on main.

**House rules for every file.** Each file has:
- a banner giving purpose, lineage ("CREATE OR REPLACE base: `<file>:<line>`"), and "Adds GRANT/REVOKE → regenerate 00-legacy-grants";
- idempotent DDL (`IF NOT EXISTS`, `DROP … IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE`);
- RLS in the same file as its table;
- for every function: `REVOKE ALL … FROM PUBLIC, anon` and `GRANT EXECUTE … TO authenticated`, `SECURITY DEFINER`, `SET search_path TO 'public','pg_temp'`, and `extensions.`-qualified calls;
- `PERFORM public._ffe_require_studio_project(project_id)` (`00717:75`) as the studio authority check on every write RPC;
- `set_config('app.ffe_mutation_rpc','on',true)` before any `project_ffe_items` write.

A rewritten body is a **full copy of its base plus the change**, never a partial. A signature change uses `DROP FUNCTION IF EXISTS <old signature>` followed by `CREATE`, re-issues its grants, and is called out in the banner.

**SQL tests** live at `supabase/tests/<domain>/<name>_test.sql`. They follow `supabase/tests/ffe/assignment_scope_rpc_derivation_test.sql`:
- a header naming the migration and anchors;
- `BEGIN;`, fixtures, and `DO $$ … $$` blocks that set `request.jwt.claim.sub` and `request.jwt.claim.role` and `RAISE EXCEPTION` on a failed assertion;
- `ROLLBACK;` at the end.

They run as:
```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/<domain>/<name>_test.sql
```

**Generated files** (one owner per wave; never edited by a migration ticket):
- `supabase/seed/00-legacy-grants.sql`, via `python3 scripts/generate-legacy-grants.py`. Every migration below adds GRANT or REVOKE, so every DB wave regenerates it.
- `packages/supabase/src/database.types.ts`, via `pnpm db:generate`.

### W2: primitives (slice 1), block 00729–00738 (00737–00738 spare)

| # | File | Owner | Contents |
|---|---|---|---|
| 00729 | `pieces_build_columns.sql` | T-9 | See "00729 in full" below. **No RPCs, and no test of its own:** T-10 to T-16 exercise its columns. |
| 00730 | `pieces_need_unit_rough_rpcs.sql` | T-10 | **Base `_place_product_in_project_v2_00438_impl` at `00678:1263`.** It accepts the request keys `unit`, `roughCents`, `needLabel`, `lineKind`. Unknown values are refused with a named CHECK message. On **create**, it writes `unit`, `rough_cents` and `line_kind='goods'` (labor goes only through `add_labor_line`), and sets the new thread's `need_label` from `needLabel`, else `name`. On **fill** (`00678:1378`), the line `name` still takes the product name; `need_label` on the thread is **never** touched. `place_product_in_project_v2` (00447) and `create_named_project_need` (00435:332) pass jsonb through and stay as they are. New `batch_create_named_project_needs(p_request jsonb) RETURNS jsonb`: `{projectId, roomId|null, assignmentScope, lines:[{name, quantity?, unit?, roughCents?}], idempotencyKey}`, a maximum of 100 lines, all-or-nothing; it returns `{selectionIds:[…]}` and loops the 00438 impl (precedent `00435:336`). New `set_project_ffe_line_build_fields(p_item_id uuid, p_request jsonb) RETURNS public.project_ffe_items` takes the keys `name`, `needLabel`, `quantity` (int > 0), `unit`, `roughCents` (int ≥ 0 or null). It refuses a removed line. It refuses `quantity`/`unit` once the line is on a PO or `ffe_line_authorization_state(id)` is not null, with the sentence `This line is released. Quantity and unit change through Record a change.` `name`, `needLabel` and `roughCents` stay editable. Test: `supabase/tests/ffe/pieces_need_unit_rough_test.sql` (need label survives a fill and a supersede; batch creates N in one room with unassigned/room scope correct; unit CHECK; locked fields refuse). |
| 00731 | `pieces_remove_restore.sql` | T-11 | **Base `archive_project_selection` at `00435:521`.** The reason is required (≥5 characters) only when the line appears in a non-draft review edition (§1.2 D8); otherwise it is optional, defaulting to `'removed while building'`. It writes `removed_disposition = design_disposition` before setting `not_selected`. Its refusal text becomes `Released lines change through Record a change.` New `restore_project_selection(p_ffe_item_id uuid) RETURNS jsonb` clears `removed_*`, restores `design_disposition := COALESCE(removed_disposition,'candidate')` and returns `{selectionId, restored:true}`. It refuses a line not removed, or one whose thread now has another active primary. Test: `supabase/tests/ffe/pieces_remove_restore_test.sql`. |
| 00732 | `pieces_labor_gate.sql` | T-12 | **Base `link_ffe_pair` at `00702:108`:** `DROP FUNCTION IF EXISTS public.link_ffe_pair(uuid, uuid)`, then `CREATE public.link_ffe_pair(p_child uuid, p_parent uuid, p_kind text DEFAULT 'com') RETURNS public.project_ffe_items`. It writes `link_kind := p_kind` and keeps the one-level check (`:147`). `labor` is refused here: it goes through `add_labor_line`. New `add_labor_line(p_parent_ffe_item_id uuid, p_request jsonb) RETURNS jsonb`: `{name, quantity?, unit?, roughCents?, vendorId?}`. It inserts a child with `line_kind='labor'`, `link_kind='labor'`, the parent's room and scope, and disposition `candidate`. It refuses when the parent is itself a child, a labor line, removed, on a PO, released, or a Trade Scope presence line. That last refusal is the Trade Scope reconciliation: a labor line never sits under a lump-sum scope. **`create_purchase_order`: no rewrite.** The test proves that a labor line with `vendor_id ≠ p_vendor_id` is refused by `00450:36-42`, and that one with the installer as vendor is accepted. If either assertion fails, rewrite the outer from base `00450:15` to refuse `line_kind='labor' AND vendor_id IS DISTINCT FROM p_vendor_id` with `Labor is billed on its own line, never on the maker's order.` Test: `supabase/tests/procurement/pieces_labor_gate_test.sql`, which also checks the wallpaper acceptance: the maker's PO has 9 rolls and no install line, and `add_invoice_billing_lines` bills the install as its own $765 line. |
| 00733 | `pieces_release_labor.sql` | T-13 | **Base `get_project_ffe_readiness` at `00445:5`:** a labor line is ready only when its parent is ready (blocker key `parent_not_ready`). **Base `_create_furnishings_authorization_from_schedule_00444_impl` at `00578:2924`:** the id set is expanded with every active labor child of an included piece. A labor line whose parent is not in the set is refused with `Labor is released with its piece.`. Test: `supabase/tests/commercial/pieces_release_labor_test.sql` (the release of 6 pieces gains the $765 install, giving 7 lines and $30,760). |
| 00734 | `pieces_room_placements.sql` | T-14 | **D7 phase 1.** See "00734 in full" below. Test: `supabase/tests/ffe/pieces_room_placements_test.sql`, covering the three D7 worked cases verbatim (waste 913 vs 830 printing 83; partial receipt 500 → `received_quantity` unchanged and one integer; share change 210→240 / 120→90 recorded with no money and no PO change, 860 ≤ 913 accepted, 950 refused), plus RLS (a client JWT selects 0 rows). |
| 00735 | `pieces_spec_book_snapshot.sql` | T-15 | **Base `_spec_book_current_item_snapshots` at `00714:124`.** It adds the keys `unit` (`NULLIF(i.unit,'each')`), `needLabel` (NULL when it equals `name`), `lineKind` (`NULLIF(i.line_kind,'goods')`), `parentFfeItemId` (NULL unless labor), and `placements` (NULL unless more than one placement; otherwise `[{roomName, quantity, areaNote}]` in sort order). Test: `supabase/tests/spec_books/pieces_snapshot_hash_test.sql`. **It asserts that the content_hash of an unchanged default line equals the pre-migration hash**, computed in the test from the 00714 body inlined as a temp function, and that a placed line's hash changes. |
| 00736 | `pieces_line_stage.sql` | T-16 | See "00736 in full" below. Test: `supabase/tests/ffe/pieces_line_stage_test.sql`. **It covers the D1 table rows 6–9 and the labor rule as cases** (§3.3; the same fixtures as the TS test). |

**00729 in full.**
- **Columns on `project_ffe_items`:**
  - `unit text NOT NULL DEFAULT 'each'`, with CHECK `project_ffe_items_unit_check` IN (`each, sq_ft, lin_ft, roll, yard, box, hour, lot`);
  - `rough_cents integer` (CHECK ≥ 0);
  - `line_kind text NOT NULL DEFAULT 'goods'` (CHECK IN `goods, labor`);
  - `link_kind text` (CHECK IN `com, labor, accessory`);
  - `removed_disposition text`.
- **Backfill:** `UPDATE … SET link_kind='com' WHERE parent_ffe_item_id IS NOT NULL AND link_kind IS NULL`. Wrap it in `set_config('app.ffe_mutation_rpc','on',true)`; the migration runs as postgres, which the guard already allows.
- **CHECKs, then VALIDATE:**
  - `project_ffe_items_link_kind_iff_parent`: `(parent_ffe_item_id IS NULL) = (link_kind IS NULL)`;
  - `project_ffe_items_labor_is_linked`: `(line_kind='labor') = (link_kind IS NOT DISTINCT FROM 'labor')`.
- **Thread:** `project_ffe_selection_threads.need_label text`, backfilled from the primary item's `name`.
- **D15:** `GRANT UPDATE (selected_media) ON public.project_ffe_specs TO authenticated`, only if T-9 finds it missing from the 00435 grant.

**00734 in full.**
- **Table** `public.project_ffe_placements`:
  - `id uuid PK DEFAULT extensions.gen_random_uuid()`;
  - `ffe_item_id uuid NOT NULL REFERENCES project_ffe_items ON DELETE CASCADE`;
  - `project_id uuid NOT NULL REFERENCES projects ON DELETE CASCADE`;
  - `project_room_id uuid NOT NULL REFERENCES project_rooms ON DELETE CASCADE`;
  - `quantity integer NOT NULL CHECK (quantity > 0)`;
  - `area_note text`;
  - `sort_order integer NOT NULL DEFAULT 0`;
  - `created_at`, `updated_at`;
  - `UNIQUE (ffe_item_id, project_room_id)`.
- **Event table** `public.project_ffe_placement_events`: `id`, `ffe_item_id`, `project_id`, `changed_by uuid`, `changed_at`, `before jsonb`, `after jsonb`. Append-only.
- **RLS** on both: SELECT `TO authenticated USING (public.can_buy_for_project(project_id))` (`00702:60`). `REVOKE INSERT, UPDATE, DELETE … FROM authenticated, anon`. No client policy.
- **`set_line_placements(p_ffe_item_id uuid, p_placements jsonb) RETURNS jsonb`** takes `[{roomId, quantity, areaNote?}]` and replaces the set. Rules:
  - every room belongs to the line's project;
  - `sum(quantity) ≤ line.quantity`;
  - the first placement is primary: it sets `project_room_id` and `assignment_scope='room'`;
  - an empty array leaves the primary room and deletes the rows;
  - a set of one row is stored (single room) but prints nothing extra.
- **When the line is released or on a PO** (`ffe_line_authorization_state` not null, or `purchase_order_id` set):
  - a change that keeps `sum ≤ quantity` is allowed and **recorded** in the events table (Q4's lock is on money and quantity; D7 case 3);
  - any change to `quantity` itself is not this RPC's job;
  - the primary room may not change once the line is on a PO before phase 3. In this one-release plan, phase 3 lifts that in 00754.
- **Returns** `{placements, wasteQuantity: quantity - sum}`.
- **Not built:** the interim "Order refuses a multi-room line" is not built, because phase 3 ships in the same release. If W5 slips out of the release, T-63 must stop and request a ruling. The fallback is that refusal sentence (`direction.md:165`), added to the 00450 outer.

**00736 in full.**
- **`public.ffe_line_stage(p public.project_ffe_items) RETURNS text`**: STABLE, SECURITY INVOKER SQL, usable as a PostgREST computed field. It returns:
  - `released` when `ffe_line_authorization_state(p.id)` is not null;
  - `ready` when the line has (product or vendor), `quantity > 0`, and (`item_type='fixed' AND unit_price_cents > 0`) or (`item_type='allowance' AND budget_max_cents > 0`), and for labor the parent's own `ffe_line_stage` is `ready` or `released`;
  - `specced` when it has a product, or `vendor_id`/`vendor_name`;
  - else `placeholder`.
- It returns NULL when `status` is ordered or later. Rows 1–5 stay with today's TS precedence.
- **Computed field `public.ffe_line_authorization(p public.project_ffe_items) RETURNS text`**, which wraps `ffe_line_authorization_state(p.id)` for the TS mirror.
- **Rough $** never enters either function.

### W3: Build room, Rough in + Spec (slice 2), block 00739–00741 (reserved; none planned)

No schema is planned. A W3 ticket that finds it needs SQL stops and requests steering. It must not write a migration outside the reservation.

### W4: Price + Release + D7 phase 2 (slice 3), block 00742–00748 (00746–00748 spare)

| # | File | Owner | Contents |
|---|---|---|---|
| 00742 | `pieces_room_handbacks.sql` | T-34 | **D18.** Table `project_room_handbacks(id uuid PK, project_id uuid NOT NULL FK projects CASCADE, project_room_id uuid NOT NULL FK project_rooms CASCADE, handed_back_by uuid NOT NULL REFERENCES profiles, handed_back_at timestamptz NOT NULL DEFAULT now())`, append-only. RLS: SELECT studio `can_buy_for_project(project_id)`; writes revoked. `hand_back_project_room(p_project_room_id uuid) RETURNS jsonb` inserts one row and returns `{handedBackAt}`. It **never** touches `project_ffe_items`. Test: `supabase/tests/rooms/pieces_room_handbacks_test.sql` (writes no disposition; a client JWT reads 0 rows). |
| 00743 | `pieces_price_acts.sql` | T-35 | `make_ffe_line_allowance(p_item_id uuid, p_budget_max_cents integer) RETURNS public.project_ffe_items` sets `item_type='allowance'` and `budget_max_cents` (> 0), and leaves `rough_cents` alone. It refuses once the line is released or on a PO (R8: `Released lines change through Record a change.`) and refuses labor. Test: `supabase/tests/ffe/pieces_price_acts_test.sql` (also asserts that `rough_cents` never reaches `get_client_project_threshold` or `get_client_project_selections` output; a grep of the payload JSON for the value). |
| 00744 | `pieces_release_placements.sql` | T-36 | **Base `_create_furnishings_authorization_from_schedule_00444_impl` = 00733, the W2 rewrite** (not 00578). The frozen `snapshot` gains `unit`, `needLabel`, `lineKind`, `parentFfeItemId`, and `placements` `[{roomName, quantity, areaNote}]` (NULL for single-room). `room_name` stays the primary. Test: `supabase/tests/commercial/pieces_release_placements_test.sql` (the oak floor released with 4 rooms and 830 of 913; one row, never four). |
| 00745 | `pieces_client_rooms.sql` | T-37 | **D7 phase 2, client payloads.** **Bases:** `get_client_project_selections` `00441:82`, `get_client_project_threshold` `00580:167`, `get_client_commercial_document_bundle` `00638:322`. Each line gains an additive `rooms` array: `[{name, quantity, unit}]`, from the frozen snapshot for authorized lines, else from live placements. Each line also gains an additive `unit`. `room_name`/`roomName` keep their meaning, the primary room, so iOS decoding (`ProjectsAPIClient.swift:120`) is unchanged. **No `rough_cents`, no `need_label` and no labor-internal fields.** A labor line appears as its own line with its unit (it bills on its own line). Test: `supabase/tests/commercial/pieces_client_rooms_test.sql`. |

### W5: the second wave (slice 4), block 00750–00757 (00755–00757 spare)

| # | File | Owner | Contents |
|---|---|---|---|
| 00750 | `pieces_supersede_carries.sql` | T-44 | **D9. Base `supersede_project_selection` `00661:374`.** The new line copies designer-authored spec fields (`finish`, `material`, `color`, `selected_dimensions`, `location`, `notes`, `selected_media`), the line `notes` (replacing `false,NULL` at `:424`), `unit`, `rough_cents`, the room placements (rows copied to the new id), and active labor and accessory children (re-parented to the new line, not copied). `need_label` stays on the thread. Test: `supabase/tests/ffe/pieces_supersede_carries_test.sql`. |
| 00751 | `pieces_line_groups.sql` | T-45 | **D6.** Table `project_line_groups(id, project_id FK CASCADE, project_room_id FK CASCADE NULL, name text NOT NULL, sort_order int, created_at)`; RLS: studio SELECT, writes revoked. Column `project_ffe_items.line_group_id uuid REFERENCES project_line_groups ON DELETE SET NULL`. `set_line_group(p_ffe_item_ids uuid[], p_group jsonb) RETURNS jsonb`, where `p_group` is `{groupId}` or `{name, roomId}` (creates the group) or null (ungroup); an emptied group is deleted. Groups carry no money, stage or acts. **Snapshot base = 00735:** it adds `lineGroup` (NULL when ungrouped). Test: `supabase/tests/ffe/pieces_line_groups_test.sql` (the shower: a group with 6 placeholder lines; the hash is stable for ungrouped lines). |
| 00752 | `pieces_allowance_fill.sql` | T-46 | **D10.** Table `project_ffe_allowance_fills(id, ffe_item_id, authorization_item_id, ceiling_cents, filled_cents, variance_cents, filled_by, filled_at)`; RLS studio SELECT, writes revoked. **Base `place_product_in_project_v2` `00447:190`:** inside the fill guard `:256-269`, an `allowance` line on a signed authorization may be filled when the new `quantity × unit_price_cents ≤ client_line_total_cents` of its frozen item. That records a row and does not void. Over the ceiling, it refuses with `Over the allowance. This goes through Record a change.` Fixed lines are unchanged. Test: `supabase/tests/commercial/pieces_allowance_fill_test.sql` (the at, under and over cases). |
| 00753 | `pieces_catalog_merge.sql` | T-47 | **D11.** `merge_studio_product(p_from uuid, p_into uuid) RETURNS jsonb`. Both are studio products of the caller's studio. It re-points `project_ffe_items.product_id`, board items and spec rows from `p_from` to `p_into`, then sets `merged_into_id = p_into` and `deleted_at = now()` on `p_from`. **Base `products_studio_delete` `00584:1270`**, narrowed to `NOT EXISTS` any `project_ffe_items.product_id` reference. Test: `supabase/tests/catalog/pieces_catalog_merge_test.sql` (no line is un-filled; a referenced delete is refused). |
| 00754 | `pieces_order_rooms.sql` | T-48 | **D7 phase 3.** Table `project_ffe_placement_receipts(id, placement_id FK project_ffe_placements CASCADE, receipt_batch_id, quantity int > 0, created_at)`; RLS studio SELECT. **Base `record_project_ffe_receipt_batch` `00493:83`:** each `p_lines` element may carry `placements:[{placementId, quantity}]`. When it is absent, the receipt defaults to placement `sort_order`. `received_quantity` on the line stays the one integer. **Base `set_line_placements` = 00734:** the "primary room fixed while on a PO" refusal is lifted. Test: `supabase/tests/receiving/pieces_order_rooms_test.sql` (500 of 913 allocated Hall 120 → Living 320 → Dining 60). |

### W6: paint and finish (slice 5), block 00760–00762 (00761–00762 spare)

| # | File | Owner | Contents |
|---|---|---|---|
| 00760 | `pieces_room_finishes.sql` | T-56 | **D16 on the existing `project_palettes` (00140).** `DROP POLICY "Inherit project access for palettes"` and recreate it as **client SELECT only** (same predicate). Studio writes stay with `project_palettes_studio_rw` (00316:178). Add a partial unique index `(project_id, scope_room_id) WHERE scope_room_id IS NOT NULL`. Add `CHECK (jsonb_typeof(swatches)='array')` NOT VALID, then VALIDATE. A finish row is a swatch element `{surface, product, brand, brand_code, sheen, hex, sort_order}`; `role` stays readable for old rows. No RPC: studio writes go through the table under RLS. Test: `supabase/tests/rooms/pieces_room_finishes_test.sql` (a client UPDATE is refused; studio upsert by room). |

**Total: 18 migrations.** W2 8, W4 4, W5 5, W6 1.

---

## 3. Interfaces

### 3.1 `@patina/types` (`packages/types/src/ffe.ts`; T-18, T-39, T-50)

```ts
export type FfeLineUnit = 'each' | 'sq_ft' | 'lin_ft' | 'roll' | 'yard' | 'box' | 'hour' | 'lot';
export type FfeLineKind = 'goods' | 'labor';
export type FfeLinkKind = 'com' | 'labor' | 'accessory';
export type FfeLineStage = 'placeholder' | 'specced' | 'ready' | 'released';
export interface FfeRoomPlacement { id: string; ffeItemId: string; projectRoomId: string; quantity: number; areaNote: string | null; sortOrder: number }
export interface SetLinePlacementsResult { placements: FfeRoomPlacement[]; wasteQuantity: number }
export interface BatchCreateNamedProjectNeedsRequest { projectId: string; roomId: string | null; assignmentScope: FfeAssignmentScope; lines: Array<{ name: string; quantity?: number; unit?: FfeLineUnit; roughCents?: number | null }>; idempotencyKey: string }
export interface SetFfeLineBuildFieldsRequest { name?: string; needLabel?: string; quantity?: number; unit?: FfeLineUnit; roughCents?: number | null }
export interface AddLaborLineRequest { name: string; quantity?: number; unit?: FfeLineUnit; roughCents?: number | null; vendorId?: string | null }
export interface RoomHandback { id: string; projectRoomId: string; handedBackBy: string; handedBackAt: string }   // W4
export interface ProjectLineGroup { id: string; projectId: string; projectRoomId: string | null; name: string; sortOrder: number } // W5
export interface RoomFinish { surface: string; product: string | null; brand: string | null; brandCode: string | null; sheen: string | null; hex: string | null; sortOrder: number } // W6
```

**Field additions.**
- `ProjectFfeSelection` gains `unit`, `lineKind`, `linkKind`, `roughCents`, `needLabel?`.
- `CreateNamedProjectNeedRequest` and `PlaceProductInProjectRequest` gain `unit?`, `roughCents?`, `needLabel?`.
- `packages/types/src/commercial.ts:242` (the authorization item) gains `rooms?: Array<{ name: string; quantity: number; unit: FfeLineUnit }>` and `unit?` (W4).

**Rules.**
- Never name a type `…Placement` without `Room`; see the §1.2 collisions.
- `packages/types` type-check is the only gate there.

### 3.2 `@patina/supabase` hooks

**Location.** New file `packages/supabase/src/hooks/use-pieces.ts`, exported from `packages/supabase/src/hooks/index.ts` with `export * from "./use-pieces"`.

**Write pattern.** Every write uses `(getSupabase() as any).rpc(...)`, as `use-add-to-the-job.ts:100` does, until `database.types.ts` carries the function. On success it calls `invalidateFfeCaches(queryClient, projectId)` (`use-procurement.ts:297`) plus the hook's own key.

| Hook | Signature | Query key, or what it invalidates | Wave |
|---|---|---|---|
| `useProjectRoomPlacements` | `(projectId: string \| null) => UseQueryResult<FfeRoomPlacement[]>` | `['project-room-placements', projectId]` | W2 |
| `useSetLinePlacements` | `() => Mutation<SetLinePlacementsResult, {projectId, itemId, placements: Array<{roomId, quantity, areaNote?}>}>` | placements + ffe caches | W2 |
| `useBatchCreateNamedProjectNeeds` | `() => Mutation<{selectionIds: string[]}, BatchCreateNamedProjectNeedsRequest>` | ffe caches | W2 |
| `useSetFfeLineBuildFields` | `() => Mutation<ProjectFfeItemRow, {projectId, itemId} & SetFfeLineBuildFieldsRequest>` | ffe caches | W2 |
| `useRestoreProjectSelection` | `() => Mutation<{selectionId: string; restored: true}, {projectId, selectionId}>` | ffe caches + removed | W2 |
| `useRemovedProjectLines` | `(projectId) => UseQueryResult<ProjectFfeItemRow[]>` | `['project-ffe-removed', projectId]` (`removed_at IS NOT NULL`) | W2 |
| `useAddLaborLine` | `() => Mutation<{selectionId: string}, {projectId, parentItemId} & AddLaborLineRequest>` | ffe caches | W2 |
| `useLinkFfePair` (existing, `use-buying-phase2.ts:210`) | gains `kind?: 'com' \| 'accessory'` (default `'com'`) | unchanged | W2 |
| `useProjectFFEItems` (existing, `use-project-v2.ts:174-215`) | select adds computed fields `ffe_line_stage, ffe_line_authorization` | key unchanged `['project-ffe-items', projectId, filters, {withLifecycle}]` | W2 |
| `useRoomHandbacks` / `useHandBackRoom` | `(projectId) => UseQueryResult<RoomHandback[]>` / `() => Mutation<{handedBackAt}, {projectId, roomId}>` | `['project-room-handbacks', projectId]` | W4 |
| `useMakeFfeLineAllowance` | `() => Mutation<ProjectFfeItemRow, {projectId, itemId, budgetMaxCents}>` | ffe caches | W4 |
| `useProjectLineGroups` / `useSetLineGroup` | `(projectId) => UseQueryResult<ProjectLineGroup[]>` / `() => Mutation<…, {projectId, itemIds, group: {groupId} \| {name, roomId} \| null}>` | `['project-line-groups', projectId]` | W5 |
| `useMergeStudioProduct` | `() => Mutation<…, {fromProductId, intoProductId}>` | products + ffe caches | W5 |
| `useSetRoomFinishes` | `() => Mutation<…, {projectId, roomId, finishes: RoomFinish[]}>` (upsert `project_palettes` by room) | `['project-palettes', projectId]` (reuses `useProjectPalettes`, `use-project-v2.ts:101`) | W6 |

**Tests.** Each hook gets a vitest in `packages/supabase/src/hooks/__tests__/use-pieces.test.ts`. It asserts:
- the RPC name and argument shape;
- the invalidated keys.

### 3.3 The derived stage (D1)

**Location.** `DP/lib/document/stamp-derivation.ts` (T-19; the W1 seed is T-2).

```ts
export type LineStage = 'placeholder' | 'specced' | 'ready' | 'released';
export interface LineStageInput {
  productId: string | null; vendorId: string | null; vendorName: string | null;
  quantity: number; itemType: 'fixed' | 'allowance' | 'tbd';
  unitPriceCents: number | null; budgetMaxCents: number | null;
  authorizationState: 'sent' | 'client_signed' | 'executed' | null;   // ffe_line_authorization
  lineKind: 'goods' | 'labor'; parentStage?: LineStage | null;      // labor only
}
export function deriveLineStage(input: LineStageInput): LineStage;
export function lineStageInputFromRow(row: ProjectFfeItemRow, parent?: ProjectFfeItemRow | null): LineStageInput;
export function isLaborLine(row: { line_kind?: string | null }): boolean;   // prints LABOR beside the word
```

**How it plugs in.**
- `deriveLineStamp`'s fallthrough (`:140-143`) returns the `deriveLineStage` word in place of `specified`.
- `LineStampKind` gains `placeholder | specced | ready | released`.
- `LINE_STAMP_LABEL` gains `PLACEHOLDER | SPECCED | READY | RELEASED`.
- `SPECIFIED` never prints. Delete its label only if no consumer still keys on it; T-19 greps.
- `rough_cents` is not an input.
- **Parity:** wherever `ffe_line_stage` is present on the row, the TS result must equal it. `stamp-label-parity.test.ts` gains that assertion.

**Test cases.** These are the D1 precedence table plus the labor rule, in `lib/document/__tests__/stamp-derivation.test.ts`. The same fixtures are used in `pieces_line_stage_test.sql` for rows 6–9.

| Case | Input | Expect |
|---|---|---|
| R1 | pending blocking decision, any stage | today's `decision_due` |
| R2 | open damage claim, ordered | today's `damaged` |
| R3 | Trade Scope presence line | today's trade word, never a pre-order word |
| R4 | delivered, received 500 of 913 | today's `partial` |
| R5 | status `ordered` and later | the goods word, as today |
| R6a | `authorizationState='sent'` | `released` |
| R6b | signed `allowance`, no product | `released`, with `ALLOWANCE` beside it |
| R7a | product, qty 2, `fixed`, 3800 | `ready` |
| R7b | product, `allowance`, budgetMax 120000 | `ready` |
| R7c | product, `fixed`, `unit_price 0`, `rough 480000` | `specced` (rough never counts) |
| R8a | product, no price | `specced` |
| R8b | no product, `vendorName 'Hollis Millwork'` | `specced` |
| R9a | no product, no vendor, rough 480000 | `placeholder` |
| R9b | no product, no vendor, `fixed` 5000 | `placeholder` (a price never promotes it) |
| L1 | labor, own price 8500 × 9, parent `ready` | `ready`, and `isLaborLine` |
| L2 | labor, own price, parent `specced` | `specced` |
| L3 | labor, parent `released` | `released` (released with its piece) |

**"Not priced."** Every surface prints `Not priced` for `unit_price_cents = 0` when the line has no product and is not an allowance. Bill excludes those lines (fix-now #5).

### 3.4 Routes and layout

```
DP/app/(document)/doc/[id]/layout.tsx            NEW, 'use client' (D14, T-6): useDocumentEngagement(id) → useHoldDocument(...)
DP/app/(document)/doc/[id]/page.tsx              useHoldDocument call removed (T-6)
DP/app/(document)/doc/[id]/pieces/page.tsx       NEW (T-23): reads ?lens=rough|spec|price|release|finishes & ?room=<id>
DP/app/(document)/doc/[id]/pieces/finishes/print/page.tsx   NEW (T-57): one page per room, addressed to the painter
DP/app/(document)/doc/[id]/{spec-book,boards,plans}/layout.tsx   unchanged pass-throughs, now under the hold
```

**`doc/[id]/layout.tsx`.**
- It calls `useDocumentEngagement(id)`: the same hook and cache key as `page.tsx:1026`, so there is no second fetch.
- It holds `{projectId, projectName: row.title, phaseKey: row.current_phase ?? null}` only for `resolution.kind === 'engagement'`.
- It renders `children` with no wrapper element, so the arrival (US-14 `data-arrival-held`) DOM is unchanged.
- **Acceptance:** the hold survives `/doc/[id]` → `/doc/[id]/spec-book` → `/doc/[id]/pieces` → back with no `release()` call; a different `[id]` releases and re-holds once.

**The Build room** is a client page inside the `(document)` layout, so the drawer and ⌘K persist.

**Return path.**
- `← <job>`, Esc (when no menu, toast or input with content holds focus) and the browser back all go to `/doc/[id]#pieces-room-<roomId>`.
- The overview scrolls that room row to the top and gives it the 3px `--ink` bar (a10).
- The room comes from the sheet's `?room=`. Lens and room live in the URL, so back and forward walk lens changes.

### 3.5 Drafting-stock tokens (T-22)

**Where they live.** `DP/app/globals.css`, in the `:root` block that starts at `:1975`, under a new comment heading `/* — the drafting stock (US-21, V15 Q2): working sheets only — */`. The values are SPEC §2.1 byte for byte:
- `--sheet #FFFFFF`
- `--sheet-head #F3F0EA`
- `--sheet-ink #1A1816`
- `--sheet-ink-muted #4A4540`
- `--sheet-ink-faint #6B655E`
- `--sheet-rule #D9D4CC`
- `--sheet-rule-strong #1A1816`
- `--sheet-row-hover #F6F3EE`
- `--sheet-toast`
- `--sheet-toast-ink`
- `--row: 40px`
- `--head: 48px`
- `--module: 24px`

**Correction to SPEC §2.1.** The dark values are **not** written into globals.css:
- the portal paints no dark paper set (`globals.css:56-59`, `:1968-1974`);
- `DP/lib/document/__tests__/contrast.test.ts` measures every `--*-ink` hex against the light grounds.

The dark companions are recorded in `docs/design/house-sheet/SPEC.md`, as `--color-card-edge`'s is.

**Scoping.** The tokens are consumed only under `[data-drafting-stock]`, which is set on the Build room root. The Document paper never reads them; a test asserts that no `--sheet-*` is used under `[data-document-paper]`.

**Stamp classes** go in the same file: `.stamp`, `.stamp--placeholder` (dashed), `--specced`, `--ready`, `--released` (filled) and `--labor`, per SPEC §2.4. On the reading paper the same words use `--ink`, `--ink-faint` and `--hairline-strong`.

### 3.6 Component file map (new)

All under `DP/components/document/pieces/`, with tests in `DP/components/document/pieces/__tests__/`. Pure derivations go in `DP/lib/document/pieces/`.

| File | Owner | Role |
|---|---|---|
| `build-room-shell.tsx` | T-23 | The head: `← <JOB>`, `BUILD THE PIECES`, the four lens buttons with `aria-pressed` (five in W6), and the room counts. Also the reading sentence (SPEC §6 shell), the room rail (rooms with counts, `Not in a room yet`, `Removed · N`, `+ ROOM`), the 390 head (`Room ▾` picker plus a segmented lens row), Esc and back. |
| `lib/document/pieces/build-room-url.ts` | T-23 | Parses and writes `lens`, `room` and the return anchor. |
| `lib/document/pieces/room-counts.ts` | T-23 | Per-room `{lines, placeholders, specced, ready, released, roughCents}`, counting placed lines in each room. Labor counts as a line. |
| `rough-in-table.tsx`, `lib/document/pieces/rough-in-keys.ts` | T-24 | The props-driven table and key map: Enter adds and starts the next line, Tab moves across, ⌘↓ goes to the next room, Backspace on an empty name or ⌘⌫ removes. Also the empty entry row, the row menu (`Fill with a product`, `Move to room…`, `Also place in…`, `Remove`), `move-to-room-menu.tsx` and `undo-toast.tsx` (10 s, `UNDO`). Takes props `onPaste`, `onSlash`, `rowDragProps`, `roomDropProps`. |
| `library-inline-search.tsx`, `paste-preview.tsx` | T-25 | `/` search and `FILL WITH A PRODUCT` results. Paste splits on newlines, then previews N lines, then confirms through the batch. |
| `lib/document/pieces/use-row-drag.ts` | T-26 | Pointer drag with Shift-click multi-select. Returns `rowDragProps` and `roomDropProps`, and announces the move through a live region. Keyboard and touch use `Move to room…`. |
| `rough-in-lens.tsx`, `elevation-pane.tsx` | T-27 | Composes the tables per room and wires the hooks. |
| `spec-lens.tsx`, `spec-fields-pane.tsx`, `lib/document/pieces/spec-progress.ts` | T-29 | The `N OF 6` field count, `NEXT UNFINISHED →`, fill in place, and the image drop (D15). |
| `placement-chips.tsx`, `labor-act.tsx`, `com-toggle.tsx` | T-30 | Room chips with per-room quantity and `+ ROOM`, plus the waste sentence. `ADD LABOR`. The COM checkbox (reuses `buying/com-piece.tsx`). |
| `pieces-overview.tsx`, `pieces-overview-row.tsx`, `lib/document/pieces/overview-derivation.ts` | T-31 | The Document's overview rows. |
| `price-lens.tsx`, `price-table.tsx` | T-40 | The 1440 table and the 390 stacked cards. Client price is read-only, with the a7 sentence. `Make it an allowance`. |
| `release-lens.tsx`, `lib/document/pieces/readiness.ts` | T-41 | The blocker sentences, `FOR THE CLIENT` disposition, `READY FOR LEAH`, and the ceremony naming its set and total. |
| `line-group-row.tsx` | T-52 | The group heading (no money, no stage, no acts) and Tab-indent wiring. |
| `finishes-lens.tsx` | T-57 | The per-room table `SURFACE · PRODUCT · SHEEN · SWATCH` and the print act. |

### 3.7 Existing components that change

| File | Change | Ticket |
|---|---|---|
| `components/document/ffe-section.tsx` | **W1:** the head fixes and hash landing. **W2:** the D1 input. **W3:** in `mode==='project'`, the Pieces region becomes `<PiecesOverview>`, with one row per room. A room row unfolds to its lines, and a released line still unfolds to the buyer's instrument. These retire in project mode: the folio preamble, Tasks, "Build the FF&E schedule", `ADD A CONCEPT RENDER`, `READ BY · ROOM · MAKER · NEXT ACT`, `SPEC THE N UNSPECIFIED →` and `BILL N UNINVOICED LINES →`. **`mode==='install'` is untouched.** | T-4, T-19, T-31 |
| `schedule/add-line-sheet.tsx` | Enter, Esc, `DONE ADDING`, explicit scope (W1); `Rough $` (W3) | T-1, T-28 |
| `line-unfold.tsx`, `schedule/line-card.tsx`, `buying/exception-overlay.tsx` | The single room label, `REMOVE THIS LINE`, damage hidden until ordered, `id="line-<id>"` | T-5 |
| `spec-books/spec-book-workspace.tsx` | Back to `#line-<id>`, the Room select, "lines" | T-7 |
| `shelves/spec-book-leaf.tsx`, `lib/spec-books/model.ts`, `supabase/functions/spec-book-render/*` | Unit, need label, LABOR and the also-in line | T-32 |
| `portal/procurement/order-paper/com-slot.tsx`, `buying/com-piece.tsx`, `supabase/functions/po-send/{lib,index}.ts`, `_shared/po-pdf.ts` | `link_kind='com'` filter; unit on the PO line | T-20 |
| `lib/document/{act-names,ffe-leader,ticket-derivation,lens-band-derivation}.ts`, `command-bar.tsx` | `unspecified` becomes `placeholders` in one move | T-3 |
| `DP/hooks/use-products.ts` | `useDeleteProduct` retired, replaced by merge | T-53 |
| `components/document/orders-book-receiving.tsx` | Per-room allocation prompt for a placed line | T-54 |
| `DP/hooks/use-account-page.ts` | Room budgets split a placed line by share | T-51 |
| `apps/client-portal/src/lib/commercial-documents.ts`, `components/threshold/approval-ask.tsx` (+ `review-ask.tsx`, `threshold.tsx` where they print `roomName`) | Print `Living Room · Dining · Kitchen · Hall` from `rooms`, with the unit | T-42 |

### 3.8 `one-voice` and `ask-the-paper` inside the Pieces region

These flags ship ON FOR EVERYONE in this release (§6). Five rules follow.
1. **The overview never branches on either flag.** It prints its own words (a1). The `oneVoice` branches at `ffe-section.tsx:1847` and `:2550` live inside the project-mode region that the overview replaces, so the overview retires them for project mode. Install mode keeps its `installOneLeader` (`:1200`) and `ffeHeld` (`:2163`) logic.
2. **`recordChangeAtHead`** (`:1196`) means the region head prints `Record a change` when either flag is on. The overview head carries `RECORD A CHANGE` unconditionally (a1), so the two agree whatever the flag says.
3. **The US-19 band** reads the Pieces ticket sentences through `ticket-derivation.ts` and parses them with the regexes in `lens-band-derivation.ts:1110-1122`. T-3 changes word and regex together, and T-31 must not change the ticket sentences.
4. **Tests.** Jest tests that render the region pin both flags ON, since that is the shipped state. Flag-off assertions about the retired project-mode strings are deleted, not rewritten: `ffe-section-one-voice.test.tsx`, `ffe-region-head.test.tsx`, `ffe-section-ceremony.test.tsx` and `page.test.tsx`. `playwright.config.ts`'s `NEXT_PUBLIC_FLAG_OVERRIDES` gains `ask-the-paper:true,one-voice:true` (T-59).
5. **`FlagProbe one-voice`** (`:2758`) stays for its other consumers.

---

## 4. Local DB protocol

The local Supabase (`127.0.0.1:54322`) is **shared across every session and worktree**. A `supabase db reset` replays only the resetting worktree's migrations and clobbers every other session's objects.

1. **Never reset blindly.** Only the wave's named reset owner resets, and only once per wave.
   - **Before resetting:**
     - Post `story_log` on US-21: `CONSTRAINT: local reset window <wave> at <time>`.
     - Read `mcp__plugin_sidequest_board__changes` for live claims in other stories that touch `supabase/`.
     - If any are live, `SendMessage` the orchestrator and wait for the window.
   - **The reset itself:**
     - Run `grep NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local`. It must be `http://127.0.0.1:54321`.
     - Run `cd supabase && supabase db reset` from the **integration branch worktree** that holds every merged wave file.
2. **Migration tickets do not reset.** They apply their own file with `psql … -v ON_ERROR_STOP=1 -f supabase/migrations/<file>`, then run their test.
   - Apply only your own file.
   - It is idempotent by the §2 rules, so a later `supabase migration up` or reset re-applies it cleanly.
   - Never run another wave's files; never `DROP` another session's objects.
3. **Reset owners per wave:**
   - W1: none (no SQL).
   - W2: **T-17**.
   - W3: none.
   - W4: **T-38**.
   - W5: **T-49**.
   - W6: **T-56**.
   - W7: **T-59** (seeds the walk fixture after one reset).
   - W8: none (no local reset).
4. **The reset owner then:**
   - runs `pnpm db:generate` and commits `packages/supabase/src/database.types.ts`;
   - runs `python3 scripts/generate-legacy-grants.py` and commits `supabase/seed/00-legacy-grants.sql`;
   - re-runs every SQL test the wave added plus `supabase/tests/ffe/*.sql`, `procurement/*.sql`, `commercial/*.sql` and `spec_books/*.sql`;
   - posts the pass table.

   No other ticket edits either generated file.
5. **Fixture data** for walks lives in `supabase/seed/dev/pieces_build_room_walk_dev.sql` (T-59). It is local only, never wired into `config.toml` for prod, and nothing of it ships.
6. **Numbers.**
   - A collision found at reset time is fixed by renumbering in the integration branch, with every banner and test header updated.
   - A Strata ledger with US-19's 00727 and 00728 not yet applied is expected (§6).

---

## 5. Verification gates, per layer

Each ticket runs only its own exact verify command (BACKLOG). The orchestrator runs the combined gate (last row) once per wave, after integration into `pieces/build-room`.

| Layer | Exact command | Notes |
|---|---|---|
| SQL migration | `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/<file> && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/<domain>/<test>.sql` | Run from the repo root. |
| Wave DB (reset owner) | `cd supabase && supabase db reset && cd .. && pnpm db:generate && python3 scripts/generate-legacy-grants.py && bash scripts/run-sql-tests.sh` | `run-sql-tests.sh` honours `KNOWN_FAILURES.md`. The wave's new files must pass, not be listed. |
| Types drift | `pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts` | After the reset owner commits. |
| `@patina/types` | `cd packages/types && pnpm type-check` | Type-check is the only gate. |
| `@patina/supabase` | `cd packages/supabase && pnpm type-check && pnpm exec vitest run src/hooks/__tests__/use-pieces.test.ts` | |
| designer-portal unit | `cd apps/designer-portal && pnpm exec jest <explicit test paths> && pnpm type-check && pnpm lint` | `next build` is not a gate here. Jest traps: `@patina/help-system` mocks are ignored, and `@portabletext/react` raises an ESM error, so never import either from a new test. |
| designer-portal e2e | `cd apps/designer-portal && pnpm exec playwright test e2e/document/pieces-build-room.spec.ts --project=chromium` | It needs the local stack and the dev server Playwright starts; flags come from `playwright.config.ts`. |
| client-portal | `cd apps/client-portal && pnpm exec jest <paths> && pnpm type-check` | The full `pnpm test` enforces the coverage floor (70/60/70/70); the combined gate runs it. |
| admin-portal | `cd apps/admin-portal && pnpm build` | Runs after every types regen; it is the strictest consumer of `@patina/types`. |
| Edge functions | `cd supabase/functions && deno test --allow-all --config deno.json po-send spec-book-render _shared/spec-pdf.test.ts _tests/fulfillment-po.test.ts` | |
| Copy | The banned-word check, in the code block below the table | Every UI ticket runs it on its own new files. |
| Combined wave gate (orchestrator) | `pnpm --filter @patina/types type-check && pnpm --filter @patina/supabase type-check && pnpm --filter @patina/supabase test && pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal lint && pnpm --filter @patina/designer-portal test && pnpm --filter @patina/client-portal type-check && pnpm --filter @patina/client-portal test && pnpm --filter @patina/admin-portal build` | Plus the wave DB row when the wave has SQL, plus the edge row when `supabase/functions` changed. |

**The banned-word check.** Character classes keep the words themselves out of this file. Give it the ticket's new UI paths, and expect no output:
```
cd apps/designer-portal && ! grep -rnE '\bA[I]\b|[Aa]lgo[r]ithm|[Ee]ngin[e]|[Pp]owered [b]y|[Cc]ura[t]ed|[Ll]uxur[y]|[Bb]espok[e]|[Ee]levat[e]d|[Dd]isrup[t]' src/components/document/pieces src/lib/document/pieces
```

---

## 6. Ship checklist (W8; requires Kody's "ship" in the session)

**Ship chain.** Kody's "ship" authorizes the full chain: migrate → functions → portals → flags → verify (CLAUDE.md, Deploying). Procedures come from `patina-deploy`, and the prod CLIs need the sandbox off.

**What ships.**
- The integrated `pieces/build-room` commit, after the combined gate and the W7 integrated QA pass.
- US-19 (Running a Job, built on main, never deployed) rides the same release.

**Rollback.**
- **Portals:** `wrangler rollback <prior version>`, after recording the prior designer and client Worker versions before step 3.
- **Migrations:** they are additive and stay.
- **Flags:** off is instant for US-19 only. The Build room has no flag.

1. **Preflight.**
   - `git diff --stat .claude/settings.json` is empty, or restored.
   - `supabase migration list --linked` shows Strata's last applied number.
   - `ls supabase/migrations | tail -25` is reconciled against it.
   - **Probe 1 (stops the ship).** 00760's `CREATE UNIQUE INDEX project_palettes_one_per_room` fails if any project already has two palettes in one room. This must return no rows; if it returns any, stop and reconcile them first:
     ```sql
     select project_id, scope_room_id, count(*) from project_palettes where scope_room_id is not null group by 1,2 having count(*) > 1;
     ```
   - **Probe 2 (informational).** Proposals with two palettes in one room. Activation merges them into one room row (00762), so rows here do not stop the ship; record the count.
     ```sql
     select proposal_id, scope_room_id, count(*) from proposal_palettes where scope_room_id is not null group by 1,2 having count(*) > 1;
     ```
2. **`db push`, in this order.**
   - Run `supabase db push --include-all`.
   - Before accepting, confirm that the plan lists exactly, in order:
     - **`00727_maker_eta_request_drafts.sql`, `00728_maker_follow_up_drafts.sql` (US-19, first)**;
     - then **00729–00737, 00742–00745, 00750–00762** (the final numbers from the integration branch).
   - **If the plan lists anything other than 00727–00728, 00729–00737, 00742–00745 and 00750–00762, stop and reconcile the ledger.** The directory carries `20260910152111_create_contact_messages.sql` and `_pending/` outside the series.
   - **Verify on Strata.** US-19:
     - `procurement_drafts` kind accepts `maker_eta_request` and `maker_follow_up`;
     - `procurement_drafts.ffe_item_id` exists;
     - index `procurement_drafts_one_open_maker_note` exists.
   - **Verify on Strata.** Ours:
     - `\d project_ffe_items` shows `unit, rough_cents, line_kind, link_kind, removed_disposition, line_group_id`;
     - `select count(*) from project_ffe_items where parent_ffe_item_id is not null and link_kind is null` = 0;
     - tables `project_ffe_placements`, `project_ffe_placement_events`, `project_room_handbacks`, `project_line_groups`, `project_ffe_allowance_fills` and `project_ffe_placement_receipts` exist;
     - `pg_policies` for `project_palettes` shows no client write.
   - No migration enqueues jobs, so there is no worker race.
3. **Edge functions.**
   - `supabase functions deploy po-send` (COM filter, unit, sidemark rooms).
   - `supabase functions deploy spec-book-render` (unit, labor, rooms, groups).
   - `supabase functions deploy spec-pdf` (T-61b edits it).
   - **`_shared/po-pdf.ts` changed.** Its only importer is `po-send`, deployed above. `_shared/spec-pdf.ts` and `_shared/fulfillment-po-pdf.ts` name po-pdf only in comments and import nothing from it, so `fulfillment-po` is not redeployed for it.
   - If `_shared/spec-pdf.ts` itself changed, `_shared/spec-pdf.importers.json` lists the importers (`spec-pdf`).
   - Verify with `supabase functions list`: the updated_at of `po-send`, `spec-book-render` and `spec-pdf` is newer than the push.
   - US-19 has no edge-function change.
4. **Portals.** In the same shell for each, export from that portal's `wrangler.jsonc` production vars:
   - `NEXT_PUBLIC_SUPABASE_URL`;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - `NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-bkvcixdmuyejfzcijpdg-auth-token`;
   - for designer only, also `SUPABASE_ORIGIN_RUNTIME` and `SUPABASE_SERVICE_ROLE_KEY`, per US-19 design-review-10 §4 step 2.

   Then:
   - `./infra/deploy-portal.sh designer-portal`;
   - `./infra/deploy-portal.sh client-portal` (the D7 phase 2 rooms in `commercial-documents.ts` and threshold).
   - Admin-portal and manufacturer-portal are not redeployed, since their code did not change.
   - Verify with `cd apps/<portal> && npx wrangler deployments list` (the bottom row is live).
   - After the deploy, grep a served chunk for `pieces` to catch the placeholder-env incident (memory). `/version` proves nothing.
5. **PostHog flags `ask-the-paper` and `one-voice`: ON FOR EVERYONE.**
   - This is Kody's ruling, and it supersedes design-review-10 §4 step 3's "by user id".
   - Turn on `ask-the-paper` first, then `one-voice`, each at 100% rollout with no property filter.
   - **Verify each through the PostHog `/flags` probe**, as the SQ-347 and US-15 flips were: one probe with a studio user id and one with an unrelated user id must both return `true`.
   - Identify sends only the user id and `email_domain`; never target by email.
   - The Build room has **no flag**.
6. **Post-deploy probes.** Sign in as Kody on Strata and run these.

   **Probes for this build:**
   - (a) `/doc/<a project>`: the Pieces region shows room rows, `WORK THE PIECES →` and `RECORD A CHANGE`, with no folio preamble, no "Build the FF&E schedule", no `SPEC THE N UNSPECIFIED`, and the letterhead strip reading `N placeholders`.
   - (b) `WORK THE PIECES →` opens `/doc/<id>/pieces?lens=rough` on white stock. `ON HAND TODAY` keeps counting across the move: the hold is on the layout.
   - (c) Enter a test line in a scratch project and remove it, and the `UNDO` restores it. Delete the scratch project after. Do this only on Kody's own test project, never on a studio's job.
   - (d) Esc lands back on the overview at the room row.
   - (e) The spec book's back lands at `#line-<id>`.
   - (f) A client page for a released multi-room line (if any exists; else skip and record it) prints the room breakdown.
   - (g) A PO preview for a labor-bearing line lists no install.

   **The US-19 probes**, from `artifacts/document-running-a-job-2026-10-07/delivery/design-review-10.md` §4 and `final-walk.md`:
   - (h) A project paper reads the `PROJECT · {job}` eyebrow, line 2 with Next, and `Standing · N`.
   - (i) A sent proposal's band.
   - (j) The three unflagged §3-23 changes: on a project paper with a differing acknowledgment at 390, the Order cell wraps and `ACCEPT THEIRS`/`DISPUTE` read whole.
   - (k) `Record a change` prints at the Pieces head (US-19's `recordChangeAtHead`, `ffe-section.tsx:1196`), alongside our overview's `RECORD A CHANGE`, with no duplicate act. **Checked at 390 and 1440.**
   - (l) **Interaction:** a project with placeholder lines shows a band Standing row whose count equals the overview's placeholder count. This proves T-3's word and regex moved together.
   - (m) A held maker note follows N1 of review-10 (known low; record only).
7. **Docs and copy** (T-62 lands these on the integration branch before the push).
   - **`docs/vision/VISION-DECISIONS.md` gains V15**, "The Build room": Q1 (a lens head on a working sheet, not the paper), Q2 (drafting stock), Q3 (stage words), Q4 (room placements with the three worked cases), Q5 (labor as a line), Q7 (Rough $), Q9 (group heading), Q10 (the paint schedule's 3-of-4 feature test, logged), Q12 (allowance variance), Q13 (handback), Q14, Q15 (the reading, recorded) and Q16 (D19 deferred). It also notes that client price is read-only in this release (§1.2).
   - **`docs/design/the-document/DECISIONS.md`:** I25 is reopened: drag plus `Move to room…`.
   - **`docs/design/house-sheet/SPEC.md`:** the drafting stock and its dark companions.
   - **Sanity (`kv3qrinl`):** query the published and draft help and teaching documents for `Add a line`, `FF&E schedule`, `unspecified`, `Unsorted`, `SPECIFIED` and `selections`. List every hit for Kody, and do not publish. The 11 Workshop Notes drafts stay unpublished (US-13).
   - **In-repo guide copy** (`document-guide.ts:195` `Open the FF&E schedule`, `:236`) is handled by T-2 and T-3.
8. **After.** The owed signed-in prod walk is S1–S8 on Leah's own job, with her or a first-hire stand-in, by mouse, keyboard and touch, at 1440 and 390. It times S1 by hand (`direction.md` §7).
   - Record the result in the US-21 story log.
   - Update memory's RESUME with the Worker versions and the Strata range.
   - The codebase map is stale after integration, and refreshing it is the orchestrator's job.
