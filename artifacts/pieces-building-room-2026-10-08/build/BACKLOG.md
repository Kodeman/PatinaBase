# US-21 Build backlog: the Build room, Direction A, one release

**SQ-600 · W0 · 8 October 2026.** Read `build/CONTRACT.md` first; every ticket cites it.

**How to read a ticket.**
- **Category** is one of `coding.easy`, `coding.normal`, `interaction-design-implementation`, `behavior-verification`, or `review-audit` for the review after each wave.
- **Scope** lists every path the ticket may write. Nothing outside it.
- **Acceptance** cites the S-scenario (`synthesis/direction.md` §3 A), the specimen frame (`specimens/SPEC.md` §6, a1–a15, and `specimens/proposed-a-{1440,390}.html`) and the D-entry or fix-now item.
- **Verify** is the exact command the executor runs on its committed candidate.

**Rules for every ticket.**
- **Branch.** Integration branch `pieces/build-room`, cut from `879742578`. Every ticket is one isolated worktree with one scoped commit.
- **No scope overlap inside a wave.** A dependency inside a wave means "start after"; it never means sharing a file.
- **No feature flag.** Tests that render the Document or the Pieces region pin `one-voice` and `ask-the-paper` ON (CONTRACT §3.8).
- **Local DB.** Migration tickets apply only their own file with `psql -f` and never reset (CONTRACT §4). Only the named reset owner regenerates `database.types.ts` and `00-legacy-grants.sql`.
- **Copy.** UI copy follows `patina-brand-voice`. Run the CONTRACT §5 banned-word check on new UI files.
- **Off limits.** Never deploy, push or touch Strata before T-63. Never edit `.claude-plugin/*` or `.claude/.codebase-info/`.
- **Size.** Each ticket is 1–3 hours of work. One that grows stops and requests steering.

## Waves

| Wave | Slice | Tickets | Reset owner | Review |
|---|---|---|---|---|
| W1 fix-now | 0 | T-1 … T-7 | none | T-8 |
| W2 primitives | 1 | T-9 … T-20 (T-9 first; T-10…T-16 parallel; T-17; then T-18, T-19, T-20 parallel) | T-17 | T-21 |
| W3 room, Rough in, Spec | 2 | T-22 … T-32 (T-22, T-23, T-24, T-25, T-26, T-28, T-30, T-31, T-32 parallel; T-27 after T-23…T-26; T-29 after T-25, T-30) | none | T-33 |
| W4 Price, Release, D7 phase 2 | 3 | T-34 … T-42 (T-34…T-37 parallel; T-38; then T-39; then T-40, T-41, T-42 parallel) | T-38 | T-43 |
| W5 second wave | 4 | T-44 … T-54 (T-44…T-48 parallel; T-49; T-50; then T-51…T-54 parallel) | T-49 | T-55 |
| W6 paint | 5 | T-56, T-57 | T-56 | T-58 |
| W7 end-to-end | all | T-59, T-60 | T-59 | T-61 |
| W8 ship | all | T-62, T-63 | none | T-64 |

**Totals.** 8 waves and 64 tickets: 52 build, verification and ship tickets, plus 8 wave reviews. The integrated QA (T-60) is one of the 52. The contract plans 18 migrations.

---

## W1: fix-now (slice 0)

### T-1 Add-line sheet: Enter adds, Esc closes, one scope value
- **Slice:** 0 (fix-now #1, #2 sheet half). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/components/document/schedule/add-line-sheet.tsx`
  - `apps/designer-portal/src/components/document/schedule/__tests__/add-line-sheet.test.tsx` (new)
- **Depends on:** none.
- **Acceptance:**
  - **Enter.** In the Line field, Enter saves the line through `useCreateNamedProjectNeed`, clears the fields, keeps the sheet open and returns focus to Line.
  - **Esc and `DONE ADDING`.** Esc closes the sheet. A visible `DONE ADDING` act closes it too, so the act is never Enter alone (a13, R3-7).
  - **Scope value.** `Not in a room yet` sends `assignmentScope:'unassigned', roomId:null`. A room sends `'room'`. "Throughout" is sent only when chosen. No display string is compared (`:62`).
  - **Scenario.** Four lines in four Enters on Living Room (S1, a2's rows L1–L4).
  - **Test.** It asserts each of these, plus the COM fabric path (`:80-88`), which is unchanged.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/schedule/__tests__/add-line-sheet.test.tsx && pnpm type-check && pnpm exec eslint src/components/document/schedule/add-line-sheet.tsx`

### T-2 The stamp word PLACEHOLDER, "Not priced", and the empty-state sentence
- **Slice:** 0 (fix-now #4, #5 print half, #12). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/lib/document/stamp-derivation.ts`
  - `apps/designer-portal/src/lib/document/__tests__/stamp-derivation.test.ts`
  - `apps/designer-portal/src/lib/document/__tests__/stamp-label-parity.test.ts`
  - `apps/designer-portal/src/lib/document/__tests__/trade-schedule-stamps.test.ts`
  - `apps/designer-portal/src/lib/document/document-guide.ts`
  - `apps/designer-portal/src/lib/document/__tests__/document-guide.test.ts`
- **Depends on:** none.
- **Acceptance:**
  - **New inputs.** `LineStampInput` gains optional `productId`, `vendorId` and `vendorName`.
  - **The fallthrough** (`:140-143`) returns `placeholder` (label `PLACEHOLDER`) when `productId` and both vendor fields are explicitly null. Otherwise it returns the current word until T-19.
  - **"Not priced".** A helper `priceWord(row)` returns `Not priced` for `unit_price_cents = 0` when the line has no product and is not an allowance.
  - **Empty state.** `document-guide.ts:236` prints `Nothing ordered yet.` when there are zero lines, or nothing when the reading is empty (fix-now #12; walk `step1-project-1440.jpg`).
  - **Q3 words only.** No `ROUGHED`.
  - **D1.** Rows R9a and R9b of CONTRACT §3.3 pass.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/lib/document/__tests__/stamp-derivation.test.ts src/lib/document/__tests__/stamp-label-parity.test.ts src/lib/document/__tests__/trade-schedule-stamps.test.ts src/lib/document/__tests__/document-guide.test.ts && pnpm type-check`

### T-3 "Placeholders" across counts, acts and the US-19 band, in one move
- **Slice:** 0 (fix-now #4 counts). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/lib/document/act-names.ts`
  - `apps/designer-portal/src/lib/document/ffe-leader.ts`
  - `apps/designer-portal/src/lib/document/ticket-derivation.ts`
  - `apps/designer-portal/src/lib/document/lens-band-derivation.ts`
  - `apps/designer-portal/src/components/document/command-bar.tsx`
  - `apps/designer-portal/src/lib/document/__tests__/act-names.test.ts`
  - `apps/designer-portal/src/lib/document/__tests__/ffe-leader.test.ts`
  - `apps/designer-portal/src/lib/document/__tests__/ticket-derivation.test.ts`
  - `apps/designer-portal/src/lib/document/__tests__/ticket-leader.test.ts`
  - `apps/designer-portal/src/lib/document/__tests__/lens-band-derivation.test.ts`
- **Depends on:** none.
- **Acceptance:**
  - **New words.** `N unspecified` becomes `N placeholders` (`ffe-leader.ts:98`, `ticket-derivation.ts:488,564`). The act `Spec the {N} unspecified` becomes `Fill the {N} placeholders` (`act-names.ts:104,466,468,578`; the a1 letterhead strip `21 placeholders +4 MORE`).
  - **The band's regex.** The `UNSPECIFIED` regex at `lens-band-derivation.ts:1119` is renamed and matches the new sentence. A test proves the band's Standing row still derives `{kind, count}` from the Pieces ticket sentence with `one-voice` on. Without this, US-19's row drops in silence (CONTRACT §1.1 #4).
  - **Internal names.** The `unspecified` StandingRowKind may keep its internal name; only printed words change.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/lib/document/__tests__/act-names.test.ts src/lib/document/__tests__/ffe-leader.test.ts src/lib/document/__tests__/ticket-derivation.test.ts src/lib/document/__tests__/ticket-leader.test.ts src/lib/document/__tests__/lens-band-derivation.test.ts && pnpm type-check`

### T-4 Pieces region head: ADD TO THE JOB, placeholder count, Bill only priced lines, hash landing
- **Slice:** 0 (fix-now #2 region label, #3, #4 head, #5 Bill, #8 landing). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/components/document/ffe-section.tsx`
  - `apps/designer-portal/src/components/document/schedule/__tests__/ffe-region-head.test.tsx`
  - `apps/designer-portal/src/components/document/__tests__/ffe-section-hash-landing.test.tsx` (new)
- **Depends on:** T-3 (it reads the renamed act).
- **Acceptance:**
  - **Head act.** The head's `open-add-to-project` act reads `ADD TO THE JOB` (`:1874-1875`); the room act stays `ADD A LINE` (`:882`).
  - **Placeholders.** The head counts and names placeholders through T-3's act (`:1860-1864`).
  - **Bill.** `billableUninvoiced` (`:1405-1406`) excludes `unit_price_cents = 0` lines with no product and no allowance.
  - **Room label.** The unassigned group reads `Not in a room yet` (`:2679-2684`).
  - **Hash landing.** On settle, a `#line-<id>` hash scrolls to the row and unfolds it (fix-now #8 landing). This works with the arrival hold: `arrival-run.tsx:168` reads the hash and is not changed.
  - **Flags.** Tests pin `one-voice` ON.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/schedule/__tests__/ffe-region-head.test.tsx src/components/document/__tests__/ffe-section-hash-landing.test.tsx && pnpm type-check && pnpm exec eslint src/components/document/ffe-section.tsx`

### T-5 The line's own acts: one room label, REMOVE THIS LINE, damage only after an order
- **Slice:** 0 (fix-now #2 line half, #6, #9). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/components/document/line-unfold.tsx`
  - `apps/designer-portal/src/components/document/schedule/line-card.tsx`
  - `apps/designer-portal/src/components/document/buying/exception-overlay.tsx`
  - `apps/designer-portal/src/components/document/line-unfold/__tests__/remove-line.test.tsx` (new)
- **Depends on:** none.
- **Acceptance:**
  - **Room label.** `Unsorted` becomes `Not in a room yet` (`line-unfold.tsx:368`, `line-card.tsx:505`).
  - **Anchor.** `line-card` carries `id="line-<id>"`.
  - **Remove.** `REMOVE THIS LINE` sits in the act group (`:386-428`). It asks for a reason (`useArchiveProjectSelection`, ≥5 characters, `00435:530`). The refusal for authorized or ordered lines prints `Released lines change through Record a change.` (S5, a8's gated example; R1-F29). Undo waits on D8 (T-27).
  - **Damage.** `Something's wrong…` is absent until the line is ordered or later (`exception-overlay.tsx:149-160,803`; R1-F7).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/line-unfold/__tests__/remove-line.test.tsx src/components/document/line-unfold/__tests__/money-out.test.tsx && pnpm type-check`

### T-6 The time hold moves to the doc layout
- **Slice:** 0 (fix-now #7, D14). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/app/(document)/doc/[id]/layout.tsx` (new)
  - `apps/designer-portal/src/app/(document)/doc/[id]/layout.test.tsx` (new)
  - `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`
  - `apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx`
- **Depends on:** none.
- **Acceptance:**
  - **The move.** The layout calls `useDocumentEngagement(id)` and `useHoldDocument` (CONTRACT §3.4). `page.tsx:1178-1185` no longer calls it.
  - **The test** proves one `hold`, and no `release`, across `/doc/A` → `/doc/A/spec-book` → `/doc/A`. A move to `/doc/B` releases and re-holds once.
  - **Arrival** (`data-arrival-held`) DOM is unchanged.
  - **Scenario.** S7 "nothing pops": a4's drawer reads `ON HAND TODAY 2h 21m`, continuous (R1-F9, R3-10).
- **Verify:** `cd apps/designer-portal && pnpm exec jest --runTestsByPath 'src/app/(document)/doc/[id]/layout.test.tsx' 'src/app/(document)/doc/[id]/page.test.tsx' && pnpm type-check`

### T-7 Spec book: back to the line, a Room select, "lines"
- **Slice:** 0 (fix-now #8, #11 spec-book half). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/components/document/spec-books/spec-book-workspace.tsx`
  - `apps/designer-portal/src/components/document/spec-books/__tests__/spec-book-way-back.test.tsx` (new)
- **Depends on:** none (T-4 and T-5 provide the landing).
- **Acceptance:**
  - **Back link.** It goes to `/doc/${projectId}#line-${ffeItemId}` when entered with `?ffeItemId=` (`:1095-1100`).
  - **Room select.** The item editor has a Room select writing through `useAssignLineRoom` (`use-document-rooms.ts:72-90`), with explicit `assignmentScope`.
  - **Wording.** "selections" prints as "lines" (`:1104,1197,1376`). Fix-now #11's `one-voice` half ships through the flag (CONTRACT §6.5).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/spec-books/__tests__/spec-book-way-back.test.tsx && pnpm type-check`

### T-8 Review W1: adversarial review of the fix-now wave
- **Slice:** 0. **Category:** review-audit.
- **Scope:** read-only. The W1 integrated commit on `pieces/build-room`.
- **Depends on:** T-1 … T-7.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Check:**
    - fix-now 1–9, 11 and 12 against `direction.md` §4;
    - that no display string drives a scope value;
    - that the band row survives T-3 (`one-voice` on);
    - that the hold never double-releases;
    - that the removal refusal names Record a change.
- **Verify:** `cd apps/designer-portal && pnpm type-check && pnpm exec jest src/lib/document src/components/document/schedule src/components/document/line-unfold`

---

## W2: primitives (slice 1). Reserve 00729–00738. Reset owner T-17.

### T-9 Migration 00729: build columns and backfills
- **Slice:** 1 (D2, D3, D4, D5, D8, D12, D15 columns). **Category:** coding.normal.
- **Scope:** `supabase/migrations/00729_pieces_build_columns.sql`.
- **Depends on:** none (post the reservation in `story_log` first).
- **Acceptance:**
  - **As specified.** CONTRACT §2 "00729 in full": columns, CHECKs (validated after the backfill), the thread `need_label` backfill, and the `selected_media` grant only if missing.
  - **Idempotent.** It applies twice clean.
  - **No row change:** `select count(*) from project_ffe_items where parent_ffe_item_id is not null and link_kind is null` returns 0.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00729_pieces_build_columns.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00729_pieces_build_columns.sql`

### T-10 Migration 00730: need label survives fill, unit, rough $, paste batch, build fields
- **Slice:** 1 (D2, D3, D12, D13). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00730_pieces_need_unit_rough_rpcs.sql`
  - `supabase/tests/ffe/pieces_need_unit_rough_test.sql`
- **Depends on:** T-9.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00730.
  - **Base.** Full copy of `_place_product_in_project_v2_00438_impl` at `00678:1263`.
  - **Need label survives a fill.** In the test: fill `Hardware, 2 knobs for custom cabinet` with the Emtek knob, and the thread's need label is unchanged (S3, a6, D2).
  - **Batch.** `batch_create_named_project_needs` creates 4 Living Room lines in one call (S1, D13).
  - **Locks.** `set_project_ffe_line_build_fields` refuses quantity or unit on a released line.
  - **Rough $.** It is stored in `rough_cents` and never in `budget_max_cents` (D12).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00730_pieces_need_unit_rough_rpcs.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/ffe/pieces_need_unit_rough_test.sql`

### T-11 Migration 00731: remove without ceremony before publication, restore
- **Slice:** 1 (D8). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00731_pieces_remove_restore.sql`
  - `supabase/tests/ffe/pieces_remove_restore_test.sql`
- **Depends on:** T-9.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00731. Base `archive_project_selection` `00435:521`.
  - **The test:**
    - an unpublished line is removed with no reason, then restored with its prior disposition;
    - a line in a published review edition needs a reason;
    - an authorized line refuses with the Record a change sentence.
  - **Scenario.** S5, a8 (`Removed · 1` restorable).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00731_pieces_remove_restore.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/ffe/pieces_remove_restore_test.sql`

### T-12 Migration 00732: the labor gate in SQL (link kind, add labor, PO proof)
- **Slice:** 1 (D4 + D5, the labor gate). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00732_pieces_labor_gate.sql`
  - `supabase/tests/procurement/pieces_labor_gate_test.sql`
- **Depends on:** T-9.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00732: `link_ffe_pair(uuid, uuid, text)` and `add_labor_line`.
  - **The wallpaper.** Its install is added as labor (9 roll, $85). The maker's PO for Phillip Jeffries lists 9 rolls and no install. The install bills on its own $765 line (S4, a7, Q5, R-PB7).
  - **Under a Trade Scope.** `add_labor_line` refuses a Trade Scope presence parent.
  - **`create_purchase_order`.** Rewritten only if the PO assertion fails; the evidence is recorded in a ticket comment either way.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00732_pieces_labor_gate.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/procurement/pieces_labor_gate_test.sql`

### T-13 Migration 00733: labor released with its piece
- **Slice:** 1 (D5, labor gate: readiness and authorization). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00733_pieces_release_labor.sql`
  - `supabase/tests/commercial/pieces_release_labor_test.sql`
- **Depends on:** T-9 (T-12's `add_labor_line` is used by the test fixture, so apply 00732 first).
- **Acceptance:**
  - **As specified.** CONTRACT §2 00733.
  - **Bases.** `get_project_ffe_readiness` `00445:5`; the authorization impl `00578:2924`, a full copy.
  - **The release set.** Releasing the 6 ready pieces creates an authorization with 7 lines and $30,760, the last being `↳ Install, wallpaper hanger (labor) $765` (a3's set; ADV-5).
  - **Refusals.** A labor line alone refuses with `Labor is released with its piece.`
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00733_pieces_release_labor.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/commercial/pieces_release_labor_test.sql`

### T-14 Migration 00734: room placements, phase 1, with the three worked cases
- **Slice:** 1 (D7 phase 1). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00734_pieces_room_placements.sql`
  - `supabase/tests/ffe/pieces_room_placements_test.sql`
- **Depends on:** T-9.
- **Acceptance:**
  - **As specified.** CONTRACT §2, "00734 in full".
  - **The worked cases** (`direction.md` §3.4 D7), each as a named `DO` block:
    - waste 913 vs 830 returns `wasteQuantity 83`;
    - partial receipt leaves one integer on the line;
    - a share change after the PO is recorded in `project_ffe_placement_events`, with no PO or money change;
    - 860 is accepted and 950 is refused.
  - **RLS.** A client JWT reads 0 rows.
  - **Scenario.** S2, a5 (Hall 120 · Living 320 · Dining 180 · Kitchen 210).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00734_pieces_room_placements.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/ffe/pieces_room_placements_test.sql`

### T-15 Migration 00735: the spec-book snapshot carries unit, need, labor and rooms, hash-stable
- **Slice:** 1 (D7 phase 1 spec-book chapters, D2, D3, D5). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00735_pieces_spec_book_snapshot.sql`
  - `supabase/tests/spec_books/pieces_snapshot_hash_test.sql`
- **Depends on:** T-9, T-14.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00735. Base `00714:124`.
  - **Hash stability.** An unchanged default line's `content_hash` equals the 00714 hash. A four-room line's hash changes. No issued spec book reports a revision on deploy.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00735_pieces_spec_book_snapshot.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/spec_books/pieces_snapshot_hash_test.sql`

### T-16 Migration 00736: `ffe_line_stage` and the computed fields
- **Slice:** 1 (D1). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00736_pieces_line_stage.sql`
  - `supabase/tests/ffe/pieces_line_stage_test.sql`
- **Depends on:** T-9.
- **Acceptance:**
  - **As specified.** CONTRACT §2, "00736 in full".
  - **Cases.** CONTRACT §3.3 cases R6a–R9b and L1–L3 pass as SQL.
  - **Rough $.** It never promotes a line (R7c, R9a).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00736_pieces_line_stage.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/ffe/pieces_line_stage_test.sql`

### T-17 W2 DB integration: reset, types and grants (reset owner)
- **Slice:** 1. **Category:** coding.easy.
- **Scope:**
  - `packages/supabase/src/database.types.ts`
  - `supabase/seed/00-legacy-grants.sql`
- **Depends on:** T-9 … T-16, merged on `pieces/build-room`.
- **Acceptance:**
  - **The window.** CONTRACT §4 protocol: post the reset window, check live claims, confirm `.env.local` is local.
  - **The run.** One `supabase db reset` from the integration worktree. Regenerate both files. Every W2 SQL test plus `supabase/tests/{ffe,procurement,commercial,spec_books}` passes.
  - **Admin.** `apps/admin-portal` builds.
  - **Record.** Post the pass table.
- **Verify:** `cd supabase && supabase db reset && cd .. && pnpm db:generate && python3 scripts/generate-legacy-grants.py && bash scripts/run-sql-tests.sh && git diff --exit-code packages/supabase/src/database.types.ts supabase/seed/00-legacy-grants.sql && pnpm --filter @patina/admin-portal build`

### T-18 Types and hooks for the primitives
- **Slice:** 1 (D2, D3, D4, D5, D7, D8, D12, D13). **Category:** coding.normal.
- **Scope:**
  - `packages/types/src/ffe.ts`
  - `packages/types/src/project-v2.ts`
  - `packages/supabase/src/hooks/use-pieces.ts` (new)
  - `packages/supabase/src/hooks/index.ts`
  - `packages/supabase/src/hooks/use-project-v2.ts`
  - `packages/supabase/src/hooks/__tests__/use-pieces.test.ts` (new)
- **Depends on:** T-17.
- **Acceptance:**
  - **Types and hooks.** CONTRACT §3.1 types and the W2 rows of §3.2.
  - **`useProjectFFEItems`.** It selects `ffe_line_stage, ffe_line_authorization`, and its key is unchanged.
  - **The vitest** asserts each RPC name, argument shape and invalidated key.
  - **Names.** No `…Placement` type without `Room`.
- **Verify:** `cd packages/supabase && pnpm type-check && pnpm exec vitest run src/hooks/__tests__/use-pieces.test.ts && cd ../types && pnpm type-check`

### T-19 The D1 mirror in every stamp consumer
- **Slice:** 1 (D1). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/lib/document/stamp-derivation.ts`
  - `apps/designer-portal/src/lib/document/__tests__/stamp-derivation.test.ts`
  - `apps/designer-portal/src/lib/document/__tests__/stamp-label-parity.test.ts`
  - `apps/designer-portal/src/lib/document/room-state.ts`
  - `apps/designer-portal/src/lib/document/ticket-derivation.ts`
  - `apps/designer-portal/src/components/document/command-bar.tsx`
  - `apps/designer-portal/src/components/document/line-unfold.tsx`
  - `apps/designer-portal/src/components/document/ffe-section.tsx`
  - `apps/designer-portal/src/components/document/shelves/spec-book-leaf.tsx`
  - `apps/designer-portal/src/components/document/shelves/__tests__/spec-book-leaf.test.tsx`
  - `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`
- **Depends on:** T-17, T-18.
- **Acceptance:**
  - **Signatures.** CONTRACT §3.3, every row R1–L3 as a test case.
  - **Consumers.** Every consumer builds its input with `lineStageInputFromRow`.
  - **Parity.** TS equals `ffe_line_stage` wherever both exist.
  - **SPECIFIED** never prints. `LABOR` prints beside the word for labor lines.
  - **The specimens.** The spec book's stamp follows a4 (`SPECCED · 5 OF 6`) and a3 (`READY`/`PLACEHOLDER`).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/lib/document/__tests__/stamp-derivation.test.ts src/lib/document/__tests__/stamp-label-parity.test.ts src/components/document/shelves/__tests__/spec-book-leaf.test.tsx && pnpm type-check && pnpm exec eslint src/lib/document/stamp-derivation.ts`

### T-20 Labor-gate readers: COM means COM; unit on the PO
- **Slice:** 1 (D4, D5, D3 on the PO). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/components/portal/procurement/order-paper/com-slot.tsx`
  - `apps/designer-portal/src/components/document/buying/com-piece.tsx`
  - `packages/supabase/src/hooks/use-buying-phase2.ts`
  - `supabase/functions/po-send/lib.ts`
  - `supabase/functions/po-send/index.ts`
  - `supabase/functions/_shared/po-pdf.ts`
  - `supabase/functions/po-send/lib.test.ts`
- **Depends on:** T-17.
- **Acceptance:**
  - **Readers.** Every reader in CONTRACT §1.3 filters `link_kind = 'com'` where it means COM:
    - `com-slot.tsx:46…168`;
    - `com-piece.tsx:43-52`;
    - `use-buying-phase2.ts:1212,1234`;
    - `po-send/lib.ts:918,940-941`;
    - `index.ts:355`.
  - **`useLinkFfePair`** passes `kind`.
  - **Wallpaper.** A labor child never prints `COM arriving separately`. The PO line prints `9 roll`. This is the labor gate's PO acceptance case (S4, a7).
  - **Redeploy fan-out.** Recorded for T-63: `_shared/po-pdf.ts` changes po-send, spec-pdf and fulfillment-po.
- **Verify:** `cd supabase/functions && deno test --allow-all --config deno.json po-send _shared/spec-pdf.test.ts _tests/fulfillment-po.test.ts && cd ../../packages/supabase && pnpm type-check`

### T-21 Review W2: adversarial review of the primitives
- **Slice:** 1. **Category:** review-audit.
- **Scope:** read-only. The W2 integrated commit.
- **Depends on:** T-9 … T-20.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Check each RPC:**
    - each rewritten body is a full copy of the base named in CONTRACT §2 (last-writer-wins);
    - every write sets `app.ffe_mutation_rpc`;
    - grants and revokes;
    - `search_path`;
    - `_ffe_require_studio_project`.
  - **Check `rough_cents`:** absent from every client RPC.
  - **Check the labor gate** end to end.
  - **Check placements:** unaware consumers never double money.
  - **Check the spec-book hash:** stable.
- **Verify:** `cd supabase && bash ../scripts/run-sql-tests.sh`

---

## W3: Build room, Rough in and Spec (slice 2). 00739–00741 reserved, none planned.

### T-22 Drafting stock tokens and stamp classes
- **Slice:** 2 (Q2). **Category:** coding.easy.
- **Scope:**
  - `apps/designer-portal/src/app/globals.css`
  - `docs/design/house-sheet/SPEC.md`
  - `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts`
- **Depends on:** none.
- **Acceptance:**
  - **Tokens.** CONTRACT §3.5: SPEC §2.1 values byte for byte, under `[data-drafting-stock]` use only.
  - **Dark companions** go in house-sheet SPEC, not globals.css.
  - **Stamp classes** per SPEC §2.4.
  - **Contrast.** `contrast.test.ts` passes, with the new sheet pairs added (`--sheet-ink-faint` on `--sheet` and `--sheet-head` ≥ 4.5:1).
  - **The Document paper** reads no `--sheet-*` (beige is reading, white is working).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/lib/document/__tests__/contrast.test.ts && ! grep -n 'sheet-' src/app/globals.css | grep -n 'data-document-paper'`

### T-23 The Build room route: head, lenses, room rail, return path
- **Slice:** 2 (S7). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/app/(document)/doc/[id]/pieces/page.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/build-room-shell.tsx` (new)
  - `apps/designer-portal/src/lib/document/pieces/build-room-url.ts` (new)
  - `apps/designer-portal/src/lib/document/pieces/room-counts.ts` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/build-room-shell.test.tsx` (new)
  - `apps/designer-portal/src/lib/document/pieces/__tests__/room-counts.test.ts` (new)
- **Depends on:** none (T-22 tokens are visual only).
- **Acceptance:**
  - **The head.** SPEC §6 shell exactly: `← WHOLE HOME RENOVATION`, `BUILD THE PIECES`, then `ROUGH IN · SPEC · PRICE · RELEASE` as `<button aria-pressed>`. The reading sentence per lens. Right side: `Living Room · 6 lines · 4 placeholders`.
  - **The rail.** Rooms with counts, `Not in a room yet 0`, `Removed N`, `+ ROOM`.
  - **The return path.** ←, Esc and back land on `/doc/[id]#pieces-room-<roomId>` (S7, a3, a10, R1-F10).
  - **At 390.** `← WHOLE HOME` · `Living Room ▾`, and the segmented lens row with ≥44px targets (a13).
  - **Price.** The lens is absent for seats without money (R1, Q7).
  - **Counts.** Placed lines count in each room (a5, §4.4).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/build-room-shell.test.tsx src/lib/document/pieces/__tests__/room-counts.test.ts && pnpm type-check && pnpm exec eslint src/components/document/pieces src/lib/document/pieces 'src/app/(document)/doc/[id]/pieces'`

### T-24 The Rough in table: entry row, keys, row menu, Move to room…, remove with undo
- **Slice:** 2 (S1, S5, S6). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/rough-in-table.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/move-to-room-menu.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/undo-toast.tsx` (new)
  - `apps/designer-portal/src/lib/document/pieces/rough-in-keys.ts` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/rough-in-table.test.tsx` (new)
- **Depends on:** none (props-driven; T-27 wires the data).
- **Acceptance:**
  - **Columns.** `LINE · QTY · UNIT · ROUGH $ · STAGE ·`, with the a2 widths.
  - **The entry row** is always last, with a caret. Enter adds and starts the next row in the same room. Tab moves across. ⌘↓ goes to the next room. Backspace on an empty name or ⌘⌫ removes.
  - **Key hint.** `ENTER ADDS THE LINE · TAB MOVES ACROSS · ⌘↓ NEXT ROOM · PASTE A LIST TO ADD SEVERAL · / SEARCHES THE LIBRARY` (a2).
  - **Row menu.** `Fill with a product`, `Move to room…`, `Also place in…`, `Remove`.
  - **Moving.** `Move to room…` lists the rooms with `· HERE` (a9) and works by keyboard and touch (S6, Q8).
  - **Undo.** The toast reads `Removed <name> ×N from <room>.` with `UNDO` and a 10 s countdown (a8, a15).
  - **Gated acts** use `aria-disabled` with the reason linked, never `disabled`.
  - **Rough $** prints `~$4,800`.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/rough-in-table.test.tsx && pnpm type-check && pnpm exec eslint src/components/document/pieces src/lib/document/pieces`

### T-25 Inline Library search and the paste preview
- **Slice:** 2 (S1, S3, D13). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/library-inline-search.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/paste-preview.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/library-inline-search.test.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/paste-preview.test.tsx` (new)
- **Depends on:** none.
- **Acceptance:**
  - **Search.** Typing `knob` lists results such as `Emtek Ribbon & Reed knob · satin brass · $38 each`, then `Search the Library for "knob" →`. Arrow keys select and Enter chooses (a6).
  - **Paste.** Pasting N newline-separated names previews N lines, then confirms through one batch call. The preview is cancellable (S1, D13).
  - **Screen readers.** Both announce their result counts in a live region.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/library-inline-search.test.tsx src/components/document/pieces/__tests__/paste-preview.test.tsx && pnpm type-check`

### T-26 Drag rows between rooms
- **Slice:** 2 (S6, Q8). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/lib/document/pieces/use-row-drag.ts` (new)
  - `apps/designer-portal/src/lib/document/pieces/__tests__/use-row-drag.test.ts` (new)
- **Depends on:** none.
- **Acceptance:**
  - **Props.** It returns `rowDragProps` and `roomDropProps`.
  - **Lift.** The lifted row gets a strong outline and an 8px shift, with the `⋮⋮` handle.
  - **Drop target.** The room heading shows a 2px rule and `MOVE TO KITCHEN` (a9).
  - **Multi-select.** Shift-click selects several.
  - **Released lines** are not draggable and say why.
  - **Announcement.** It announces `Moved Counter stools to Kitchen.`
  - **Reduced motion.** `prefers-reduced-motion` gives no transition.
  - **Data path.** `triage_project_ffe_items` (via `useAssignLineRoom`).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/lib/document/pieces/__tests__/use-row-drag.test.ts && pnpm type-check`

### T-27 The Rough in lens assembled, with the elevation pane
- **Slice:** 2 (S1, S5, S6, D8 undo, D13). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/rough-in-lens.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/elevation-pane.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/rough-in-lens.test.tsx` (new)
- **Depends on:** T-23, T-24, T-25, T-26.
- **Acceptance:**
  - **Hooks.** Each room table is wired to `useBatchCreateNamedProjectNeeds`, `useSetFfeLineBuildFields`, `useArchiveProjectSelection`, `useRestoreProjectSelection`, `useAssignLineRoom` and `usePlaceProductInProjectV2`.
  - **Undo.** It calls restore.
  - **The pane.** `LIVING ROOM · ELEVATION` with `ELEVATION NOT ON FILE` and `+ FILE` (a2).
  - **Hidden here:** the buying cells, Bill, Release and the roads (a2).
  - **The S1 test.** Four Enters make four lines, with no sheet.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/rough-in-lens.test.tsx && pnpm type-check && pnpm exec eslint src/components/document/pieces`

### T-28 Rough $ on the quick sheet
- **Slice:** 2 (fix-now #10, D12). **Category:** coding.easy.
- **Scope:**
  - `apps/designer-portal/src/components/document/schedule/add-line-sheet.tsx`
  - `apps/designer-portal/src/components/document/schedule/__tests__/add-line-sheet.test.tsx`
- **Depends on:** none (the W2 column exists).
- **Acceptance:**
  - **The field.** A `Rough $` field writes `roughCents` through the create path. It prints `~$4,800`, is never an allowance and never sets `budgetMaxCents`.
  - **The test** asserts the request carries `roughCents` and no allowance keys (Q7, D12, R1-F23).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/schedule/__tests__/add-line-sheet.test.tsx && pnpm type-check`

### T-29 The Spec lens: fields pane, fill in place, next unfinished, image
- **Slice:** 2 (S3, S4 fields, D2, D15). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/spec-lens.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/spec-fields-pane.tsx` (new)
  - `apps/designer-portal/src/lib/document/pieces/spec-progress.ts` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/spec-lens.test.tsx` (new)
- **Depends on:** T-25, T-30.
- **Acceptance:**
  - **The left pane** lists rows as `name · stage · N OF 6`.
  - **The right pane**, in a4's order: `WHAT WE NEED` (the need label), `MAKER`, `PRODUCT` (`FILL WITH A PRODUCT` and `BRING IN…`), `IMAGE` (drop or paste a link, writing `selected_media`, D15), `FINISH`, `MATERIAL`, `COLOR`, `DIMENSIONS`, `EXACT LOCATION` (default `See drawings`), `NOTES`, `ROOMS`, `UNIT`, `LABOR`, `COM`.
  - **Rough $.** A dim `~$4,800 each · set the price in Price`.
  - **Fill preview.** Fill shows the a6 preview (`The need stays on the line. The PO carries the product.`), then `FILL THIS LINE`.
  - **Stamp.** It flips PLACEHOLDER to SPECCED on naming a maker (a4) or filling (a6).
  - **Navigation.** `NEXT UNFINISHED →`.
  - **At 390.** Stacked, as a14.
  - **Hidden here:** money, procurement and receiving.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/spec-lens.test.tsx && pnpm type-check && pnpm exec eslint src/components/document/pieces src/lib/document/pieces`

### T-30 Room chips, ADD LABOR and COM on the line
- **Slice:** 2 (S2, S4, D7 phase 1, D4/D5). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/placement-chips.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/labor-act.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/com-toggle.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/placement-chips.test.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/labor-act.test.tsx` (new)
- **Depends on:** none (the W2 hooks exist).
- **Acceptance:**
  - **Chips.** `Hall · 120 sq ft` and so on, with `+ ROOM` and per-room quantity editing through `useSetLinePlacements`.
  - **Totals sentence.** `830 sq ft × $11.50 / sq ft = $9,545` (a5). When the line quantity exceeds the sum, it prints `waste 83 sq ft` (D7 case 1).
  - **Also-in line.** `ALSO IN LIVING ROOM · DINING · KITCHEN · 120 SQ FT HERE`.
  - **`ADD LABOR`.** It creates the indented `↳` labor line through `useAddLaborLine`, with its own unit and rough price (S4, a7).
  - **COM.** `This piece takes COM` reuses `buying/com-piece.tsx` (no edit to it).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/placement-chips.test.tsx src/components/document/pieces/__tests__/labor-act.test.tsx && pnpm type-check`

### T-31 The Document's Pieces region becomes room overview rows
- **Slice:** 2 (Q14, S7). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/ffe-section.tsx`
  - `apps/designer-portal/src/components/document/pieces/pieces-overview.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/pieces-overview-row.tsx` (new)
  - `apps/designer-portal/src/lib/document/pieces/overview-derivation.ts` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/pieces-overview.test.tsx` (new)
  - `apps/designer-portal/src/components/document/__tests__/ffe-section-one-voice.test.tsx`
  - `apps/designer-portal/src/components/document/schedule/__tests__/ffe-region-head.test.tsx`
  - `apps/designer-portal/src/components/document/schedule/__tests__/ffe-section-ceremony.test.tsx`
  - `apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx`
- **Depends on:** none (W2 is merged; T-23's `room-counts.ts` is not imported: the overview keeps its own derivation file).
- **Acceptance:**
  - **The head**, in `mode==='project'` (a1): `Pieces` / `by room · 7 rooms · 26 lines` / `21 placeholders · 4 specced · nothing released`.
  - **Acts:** `WORK THE PIECES →` (inked), `ADD TO THE JOB`, `RELEASE FOR AUTHORIZATION` (gated, with `Nothing is ready to release yet.`), `RECORD A CHANGE`, `FOLD ↑`.
  - **Front matter:** `~$69,328 roughed · nothing released`.
  - **Room rows.** Each prints the strata mark, the name, `6 lines · 5 placeholders`, `~$23,564`, `ADD A LINE` and `WORK THIS ROOM →`.
  - **Unfolding.** A room row unfolds to its lines, and a released line unfolds to the buyer's instrument as today.
  - **Gone in project mode:** Tasks, the folio preamble, `Build the FF&E schedule`, `ADD A CONCEPT RENDER`, `READ BY …`, `SPEC THE N UNSPECIFIED →` and `BILL N UNINVOICED LINES →`.
  - **Coming back.** The row the reader came from gets the 3px bar (a10).
  - **At 390.** Stacked, as a12.
  - **Install mode** is unchanged.
  - **Flags.** No branching on `one-voice` or `ask-the-paper` (CONTRACT §3.8). Tests pin both ON, and the flag-off assertions for retired strings are deleted.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/pieces-overview.test.tsx src/components/document/__tests__/ffe-section-one-voice.test.tsx src/components/document/schedule/__tests__/ffe-region-head.test.tsx src/components/document/schedule/__tests__/ffe-section-ceremony.test.tsx && pnpm exec jest --runTestsByPath 'src/app/(document)/doc/[id]/page.test.tsx' && pnpm type-check && pnpm exec eslint src/components/document/ffe-section.tsx src/components/document/pieces`

### T-32 The spec book prints unit, need label, labor and rooms
- **Slice:** 2 (D7 phase 1 spec-book chapters, D2, D3, D5). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/lib/spec-books/model.ts`
  - `apps/designer-portal/src/components/document/shelves/spec-book-leaf.tsx`
  - `supabase/functions/spec-book-render/render-model.ts`
  - `supabase/functions/spec-book-render/test-fixtures.ts`
  - `supabase/functions/spec-book-render/render-model.test.ts`
  - `apps/designer-portal/src/lib/spec-books/__tests__/model-pieces.test.ts` (new)
- **Depends on:** none (00735 is merged).
- **Acceptance:**
  - **New snapshot keys.** The keys `unit`, `needLabel`, `lineKind` and `placements` render as follows:
    - quantity `913 sq ft`;
    - the need label above the product name;
    - `LABOR` beside the word;
    - `ALSO IN …` under the name.
  - **Defaults.** Absent keys render exactly as today, so nothing changes visually.
  - **Spec-book wording.** "lines", from T-7.
- **Verify:** `cd supabase/functions && deno test --allow-all --config deno.json spec-book-render && cd ../../apps/designer-portal && pnpm exec jest src/lib/spec-books/__tests__/model-pieces.test.ts && pnpm type-check`

### T-33 Review W3: adversarial review of the Build room
- **Slice:** 2. **Category:** review-audit.
- **Scope:** read-only. The W3 integrated commit, plus `specimens/proposed-a-1440.html` and `proposed-a-390.html`.
- **Depends on:** T-22 … T-32.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Check:**
    - a1, a2, a4, a5, a6, a8, a9, a10 and a12–a15 against the running UI, at 1440 and 390;
    - every act is reachable by keyboard and touch independent of drag;
    - focus returns after add, remove and undo;
    - announcements;
    - the beige paper carries no tabs;
    - no `--sheet-*` on the paper;
    - the overview has no flag branch;
    - Rough $ never shows on a client surface.
- **Verify:** `cd apps/designer-portal && pnpm type-check && pnpm exec jest src/components/document/pieces src/lib/document/pieces`

---

## W4: Price, Release, D7 phase 2 (slice 3). Reserve 00742–00748. Reset owner T-38.

### T-34 Migration 00742: room hand-backs (READY FOR LEAH)
- **Slice:** 3 (D18, Q13). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00742_pieces_room_handbacks.sql`
  - `supabase/tests/rooms/pieces_room_handbacks_test.sql`
- **Depends on:** none (post the W4 reservation).
- **Acceptance:**
  - **As specified.** CONTRACT §2 00742.
  - **Before and after.** The test snapshots every `project_ffe_items` row before and after `hand_back_project_room`, and they are identical: no disposition, select or release.
  - **RLS.** A client JWT reads 0 rows.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00742_pieces_room_handbacks.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/rooms/pieces_room_handbacks_test.sql`

### T-35 Migration 00743: Make it an allowance
- **Slice:** 3 (D12, Q7, Q12). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00743_pieces_price_acts.sql`
  - `supabase/tests/ffe/pieces_price_acts_test.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00743.
  - **Refusals.** A released line refuses, naming Record a change. Labor refuses.
  - **Rough $.** `rough_cents` never appears in `get_client_project_threshold` or `get_client_project_selections` output (D12).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00743_pieces_price_acts.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/ffe/pieces_price_acts_test.sql`

### T-36 Migration 00744: the authorization freezes each line's rooms
- **Slice:** 3 (D7 phase 2). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00744_pieces_release_placements.sql`
  - `supabase/tests/commercial/pieces_release_placements_test.sql`
- **Depends on:** none (00733 is merged; base = 00733).
- **Acceptance:**
  - **As specified.** CONTRACT §2 00744.
  - **One row.** The oak floor releases as one authorization row, with `snapshot.placements` of 4 rooms summing to 830 and quantity 913. Never 4 rows, never only the primary (slice 3 "why here").
  - **Labor** still rides with its piece (re-run T-13's assertions).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00744_pieces_release_placements.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/commercial/pieces_release_placements_test.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/commercial/pieces_release_labor_test.sql`

### T-37 Migration 00745: client payloads carry rooms
- **Slice:** 3 (D7 phase 2). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00745_pieces_client_rooms.sql`
  - `supabase/tests/commercial/pieces_client_rooms_test.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00745. Bases `00441:82`, `00580:167` and `00638:322`, each a full copy.
  - **Additive.** `rooms` and `unit` are added. `room_name`/`roomName` stays the primary (iOS-safe).
  - **Never in a client payload:** `rough_cents`, `need_label` and the internal link fields. A grep of the JSON for `rough` is empty.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00745_pieces_client_rooms.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/commercial/pieces_client_rooms_test.sql`

### T-38 W4 DB integration: reset, types and grants (reset owner)
- **Slice:** 3. **Category:** coding.easy.
- **Scope:**
  - `packages/supabase/src/database.types.ts`
  - `supabase/seed/00-legacy-grants.sql`
- **Depends on:** T-34 … T-37.
- **Acceptance:** As T-17, for W4. Every W2 and W4 SQL test passes, and admin-portal builds.
- **Verify:** `cd supabase && supabase db reset && cd .. && pnpm db:generate && python3 scripts/generate-legacy-grants.py && bash scripts/run-sql-tests.sh && git diff --exit-code packages/supabase/src/database.types.ts supabase/seed/00-legacy-grants.sql && pnpm --filter @patina/admin-portal build`

### T-39 Hooks and types for hand-backs, allowance and authorization rooms
- **Slice:** 3. **Category:** coding.easy.
- **Scope:**
  - `packages/supabase/src/hooks/use-pieces.ts`
  - `packages/supabase/src/hooks/__tests__/use-pieces.test.ts`
  - `packages/types/src/ffe.ts`
  - `packages/types/src/commercial.ts`
- **Depends on:** T-38.
- **Acceptance:** CONTRACT §3.2 W4 rows and §3.1 `RoomHandback`, plus `commercial.ts:242` `rooms?` and `unit?`.
- **Verify:** `cd packages/supabase && pnpm type-check && pnpm exec vitest run src/hooks/__tests__/use-pieces.test.ts && cd ../types && pnpm type-check`

### T-40 The Price lens
- **Slice:** 3 (S4, D12, D19 sentence, Q7, Q16). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/price-lens.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/price-table.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/price-lens.test.tsx` (new)
- **Depends on:** T-39.
- **Acceptance:**
  - **Front matter.** `Job · $30,760 priced · ~$36,368 roughed` (a7).
  - **Columns.** `LINE · QTY · UNIT · TRADE COST · MARKUP · CLIENT PRICE · ROUGH ~ ·`, with labor `↳` indented and room subtotals (`Bedroom · $2,835 priced · ~$6,100 roughed`).
  - **Trade cost** is typed through `useSetFfeLineCommercials`.
  - **Markup and client price** are read-only on every job (CONTRACT §1.2 client-price note). On an active job, the sentence reads `This job is active. Markup and client price are read-only here; they change through Record a change. Trade cost can still be typed.`
  - **The row menu.** `Add labor`, `Make it an allowance` (`useMakeFfeLineAllowance`), `Move to room…`, `Remove`.
  - **At 390.** Stacked cards.
  - **Access.** Absent for seats without money.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/price-lens.test.tsx && pnpm type-check && pnpm exec eslint src/components/document/pieces`

### T-41 The Release lens: readiness, disposition, READY FOR LEAH, the ceremony
- **Slice:** 3 (S7, D18, Q13, D1 row 6). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/release-lens.tsx` (new)
  - `apps/designer-portal/src/lib/document/pieces/readiness.ts` (new)
  - `apps/designer-portal/src/components/document/pieces/__tests__/release-lens.test.tsx` (new)
  - `apps/designer-portal/src/lib/document/pieces/__tests__/readiness.test.ts` (new)
- **Depends on:** T-39.
- **Acceptance:**
  - **The table**, across rooms (a3): `LINE · ROOM · STAGE · READINESS · FOR THE CLIENT`.
  - **Blocker sentences:** `Needs a product or a maker`, `Needs a client price`, `Ready`.
  - **`FOR THE CLIENT`.** A disposition select (Candidate · Selected · Alternate), set by Leah. Placeholders print `—`.
  - **`READY FOR LEAH`.** Per room, through `useHandBackRoom`. It writes nothing else.
  - **The ceremony.** The consequence lists the set, ending `↳ Install, wallpaper hanger (labor) $765`. Then `Releasing sends these 7 lines to the client for authorization: 6 pieces and the one labor line that goes with its piece. Their prices lock when the client signs.` Then `Release 7 lines · $30,760 for authorization` (`.act--terminal`), via the existing `create_furnishings_authorization_from_schedule` hook.
  - **After release.** Lines read `RELEASED`.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/release-lens.test.tsx src/lib/document/pieces/__tests__/readiness.test.ts && pnpm type-check && pnpm exec eslint src/components/document/pieces src/lib/document/pieces`

### T-42 The client portal prints a released line's rooms
- **Slice:** 3 (D7 phase 2). **Category:** coding.normal.
- **Scope:**
  - `apps/client-portal/src/lib/commercial-documents.ts`
  - `apps/client-portal/src/components/threshold/approval-ask.tsx`
  - `apps/client-portal/src/components/threshold/review-ask.tsx`
  - `apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx`
  - `apps/client-portal/src/lib/__tests__/commercial-documents-rooms.test.ts` (new)
- **Depends on:** T-39.
- **Acceptance:**
  - **Rooms and unit.** The mapper reads `rooms` and `unit` and prints `White oak floor · 913 sq ft · Hall · Living Room · Dining · Kitchen`.
  - **Single-room lines** render exactly as today.
  - **Never shown:** rough, need label or internal fields.
  - **Coverage floor.** The client-portal floor still holds.
- **Verify:** `cd apps/client-portal && pnpm exec jest src/lib/__tests__/commercial-documents-rooms.test.ts src/components/threshold/__tests__/threshold.test.tsx && pnpm type-check`

### T-43 Review W4: adversarial review of Price, Release and the client payloads
- **Slice:** 3. **Category:** review-audit.
- **Scope:** read-only. The W4 integrated commit.
- **Depends on:** T-34 … T-42.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Check:**
    - the release set and total (7 lines, $30,760);
    - labor never alone;
    - D18 writes nothing else;
    - client payload allow-lists (no rough, no internal fields), on all 3 RPCs and iOS's `room_name`;
    - the frozen snapshot matches the live placements at release;
    - client price is never writable;
    - the a3 and a7 copy is word for word.
- **Verify:** `cd supabase && bash ../scripts/run-sql-tests.sh`

---

## W5: the second wave (slice 4). Reserve 00750–00757. Reset owner T-49.

### T-44 Migration 00750: supersede carries the designer's work
- **Slice:** 4 (D9). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00750_pieces_supersede_carries.sql`
  - `supabase/tests/ffe/pieces_supersede_carries_test.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00750. Base `00661:374`.
  - **What carries.** Spec fields, notes, unit, rough, placements, and children re-parented. The need label is untouched (S3, R1-F19/F20).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00750_pieces_supersede_carries.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/ffe/pieces_supersede_carries_test.sql`

### T-45 Migration 00751: line groups
- **Slice:** 4 (D6, Q9). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00751_pieces_line_groups.sql`
  - `supabase/tests/ffe/pieces_line_groups_test.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00751. Snapshot base = 00735.
  - **The shower.** A group with 6 placeholder lines (S3).
  - **Hash.** Stable for ungrouped lines.
  - **Groups** carry no money.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00751_pieces_line_groups.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/ffe/pieces_line_groups_test.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/spec_books/pieces_snapshot_hash_test.sql`

### T-46 Migration 00752: an allowance filled at or under its ceiling
- **Slice:** 4 (D10, Q12). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00752_pieces_allowance_fill.sql`
  - `supabase/tests/commercial/pieces_allowance_fill_test.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00752. Base `place_product_in_project_v2` `00447:190`.
  - **At and under** the ceiling: the variance row is recorded and the authorization is not voided.
  - **Over** the ceiling: refused with the Record a change sentence.
  - **Fixed lines** are unchanged.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00752_pieces_allowance_fill.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/commercial/pieces_allowance_fill_test.sql`

### T-47 Migration 00753: merge catalog duplicates, never hard delete
- **Slice:** 4 (D11, Q11). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00753_pieces_catalog_merge.sql`
  - `supabase/tests/catalog/pieces_catalog_merge_test.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00753. Base policy `00584:1270`.
  - **The merge.** No live line is un-filled. The merged product carries `merged_into_id` and `deleted_at`.
  - **Delete.** A referenced delete is refused (S5).
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00753_pieces_catalog_merge.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/catalog/pieces_catalog_merge_test.sql`

### T-48 Migration 00754: receiving by room
- **Slice:** 4 (D7 phase 3). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00754_pieces_order_rooms.sql`
  - `supabase/tests/receiving/pieces_order_rooms_test.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00754. Bases `00493:83` and 00734.
  - **The receipt.** 500 of 913 allocates Hall 120 → Living 320 → Dining 60 by default, or as given. `received_quantity` stays 500 (D7 case 2).
  - **The primary room** may now change while on a PO.
- **Verify:** `cd supabase && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f migrations/00754_pieces_order_rooms.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/receiving/pieces_order_rooms_test.sql`

### T-49 W5 DB integration: reset, types and grants (reset owner)
- **Slice:** 4. **Category:** coding.easy.
- **Scope:**
  - `packages/supabase/src/database.types.ts`
  - `supabase/seed/00-legacy-grants.sql`
- **Depends on:** T-44 … T-48.
- **Acceptance:** As T-17, for W5. All of the W2, W4 and W5 tests pass.
- **Verify:** `cd supabase && supabase db reset && cd .. && pnpm db:generate && python3 scripts/generate-legacy-grants.py && bash scripts/run-sql-tests.sh && git diff --exit-code packages/supabase/src/database.types.ts supabase/seed/00-legacy-grants.sql && pnpm --filter @patina/admin-portal build`

### T-50 Hooks and types for groups, merge and per-room receipts
- **Slice:** 4. **Category:** coding.easy.
- **Scope:**
  - `packages/supabase/src/hooks/use-pieces.ts`
  - `packages/supabase/src/hooks/__tests__/use-pieces.test.ts`
  - `packages/types/src/ffe.ts`
- **Depends on:** T-49.
- **Acceptance:** CONTRACT §3.2 W5 rows; `ProjectLineGroup`.
- **Verify:** `cd packages/supabase && pnpm type-check && pnpm exec vitest run src/hooks/__tests__/use-pieces.test.ts && cd ../types && pnpm type-check`

### T-51 The PO sidemark names every room; room budgets split by share
- **Slice:** 4 (D7 phase 3). **Category:** coding.normal.
- **Scope:**
  - `supabase/functions/po-send/index.ts`
  - `supabase/functions/po-send/lib.ts`
  - `supabase/functions/po-send/lib.test.ts`
  - `apps/designer-portal/src/hooks/use-account-page.ts`
  - `apps/designer-portal/src/hooks/__tests__/use-account-page-rooms.test.ts` (new)
- **Depends on:** T-50.
- **Acceptance:**
  - **Sidemark.** The PO line for the oak floor reads `Hall 120 · Living Room 320 · Dining 180 · Kitchen 210 sq ft` (`index.ts:300`).
  - **Room budgets** (`use-account-page.ts:108-159`) split a placed line's money by share and never double it.
  - **Single-room lines** are unchanged.
  - **Audit.** The other phase-3 readers in CONTRACT §1.3 (`use-procurement.ts:476`, `buying/exceptions.ts:446`, `project-commerce.ts`, `use-projects.ts:359,759`, `project-room-adapter.ts`) are audited for per-room money sums, with the result commented on the ticket. Any that sum money get a follow-up ticket filed, not edited here.
- **Verify:** `cd supabase/functions && deno test --allow-all --config deno.json po-send && cd ../../apps/designer-portal && pnpm exec jest src/hooks/__tests__/use-account-page-rooms.test.ts && pnpm type-check`

### T-52 Group headings in Rough in and Spec
- **Slice:** 4 (S3, D6, Q9). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/line-group-row.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/rough-in-table.tsx`
  - `apps/designer-portal/src/lib/document/pieces/rough-in-keys.ts`
  - `apps/designer-portal/src/components/document/pieces/spec-lens.tsx`
  - `apps/designer-portal/src/components/document/pieces/__tests__/line-group-row.test.tsx` (new)
- **Depends on:** T-50.
- **Acceptance:**
  - **Grouping.** Tab at the start of a name indents it into a group, and Shift-Tab out of it.
  - **The heading row:** Inter 14, w500, with no qty, unit, money, stamp or acts, and a strong rule under it.
  - **Members** start with `↳`.
  - **The shower:** a heading with 6 placeholder lines (S3, SPEC §2.6).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/line-group-row.test.tsx src/components/document/pieces/__tests__/rough-in-table.test.tsx && pnpm type-check`

### T-53 Merge a catalog duplicate; retire the hard delete
- **Slice:** 4 (D11, S5). **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/src/hooks/use-products.ts`
  - `apps/designer-portal/src/components/catalog/duplicate-detection-panel.tsx`
  - `apps/designer-portal/src/components/catalog/__tests__/duplicate-merge.test.tsx` (new)
- **Depends on:** T-50.
- **Acceptance:**
  - **Merge.** `duplicate-detection-panel.tsx:180` offers `MERGE INTO THIS ONE` through `useMergeStudioProduct`.
  - **Retired.** `useDeleteProduct` (`:189-197`) is removed, and `DeleteProductDialog` is never wired (direction §4).
  - **A referenced product** refuses deletion with the merge sentence.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/catalog/__tests__/duplicate-merge.test.tsx && pnpm type-check && pnpm exec eslint src/hooks/use-products.ts src/components/catalog/duplicate-detection-panel.tsx`

### T-54 Receiving asks which rooms a delivery covers
- **Slice:** 4 (D7 phase 3, case 2). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/orders-book-receiving.tsx`
  - `apps/designer-portal/src/components/document/__tests__/orders-book-receiving-rooms.test.tsx` (new)
- **Depends on:** T-50.
- **Acceptance:**
  - **The prompt.** Receiving a placed line shows its rooms, pre-filled in placement order (500 → Hall 120, Living 320, Dining 60), editable, summing to the received quantity.
  - **Single-room lines** show no prompt.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/__tests__/orders-book-receiving-rooms.test.tsx && pnpm type-check`

### T-55 Review W5: adversarial review of the second wave
- **Slice:** 4. **Category:** review-audit.
- **Scope:** read-only. The W5 integrated commit.
- **Depends on:** T-44 … T-54.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Check:**
    - supersede loses nothing designer-authored;
    - the allowance variance math and the over-ceiling refusal;
    - merge un-fills no line and the narrowed delete policy;
    - the receipt allocation sums;
    - sidemark and budgets never double money;
    - groups carry no money.
- **Verify:** `cd supabase && bash ../scripts/run-sql-tests.sh`

---

## W6: paint and finish (slice 5). Reserve 00760–00762. Reset owner T-56.

### T-56 Migration 00760: room finishes on project_palettes (also the reset owner)
- **Slice:** 5 (D16, Q10). **Category:** coding.normal.
- **Scope:**
  - `supabase/migrations/00760_pieces_room_finishes.sql`
  - `supabase/tests/rooms/pieces_room_finishes_test.sql`
  - `packages/supabase/src/database.types.ts`
  - `supabase/seed/00-legacy-grants.sql`
- **Depends on:** none.
- **Acceptance:**
  - **As specified.** CONTRACT §2 00760.
  - **Clients** can read and cannot write (the 00140 FOR ALL policy is narrowed).
  - **Studio** upserts by room.
  - **The reset protocol** (CONTRACT §4): types and grants regenerated, all SQL tests pass.
- **Verify:** `cd supabase && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/rooms/pieces_room_finishes_test.sql && cd .. && pnpm db:generate && python3 scripts/generate-legacy-grants.py && bash scripts/run-sql-tests.sh && git diff --exit-code packages/supabase/src/database.types.ts supabase/seed/00-legacy-grants.sql`

### T-57 The Finishes lens, the painter's print, the wall swatch
- **Slice:** 5 (S8, D16, Q10). **Category:** interaction-design-implementation.
- **Scope:**
  - `apps/designer-portal/src/components/document/pieces/finishes-lens.tsx` (new)
  - `apps/designer-portal/src/app/(document)/doc/[id]/pieces/finishes/print/page.tsx` (new)
  - `apps/designer-portal/src/components/document/pieces/build-room-shell.tsx`
  - `apps/designer-portal/src/components/document/pieces/pieces-overview-row.tsx`
  - `packages/supabase/src/hooks/use-pieces.ts`
  - `packages/types/src/ffe.ts`
  - `apps/designer-portal/src/components/document/pieces/__tests__/finishes-lens.test.tsx` (new)
- **Depends on:** T-56.
- **Acceptance:**
  - **The fifth lens.** `FINISHES` (a11).
  - **The table.** `Bedroom · Finishes` as `SURFACE · PRODUCT · SHEEN · SWATCH`, with a 24×24 swatch, through `useProjectPalettes` and `useSetRoomFinishes`.
  - **The print.** `PRINT THE PAINT AND FINISH SCHEDULE` and the sentence `One page per room, addressed to the painter. Nothing else prints on it.` The print route renders one page per room.
  - **The overview row** shows the wall swatch.
  - **Minimal**, per Q10: nothing more.
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces/__tests__/finishes-lens.test.tsx && pnpm type-check && cd ../../packages/supabase && pnpm type-check`

### T-58 Review W6: adversarial review of paint and finish
- **Slice:** 5. **Category:** review-audit.
- **Scope:** read-only. The W6 integrated commit.
- **Depends on:** T-56, T-57.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Check:**
    - the client write lockdown;
    - old `role` swatches still read;
    - the print is addressed to the painter only;
    - a11 copy;
    - the fifth lens does not turn the head into tabs (Q1 test: a lens removes acts).
- **Verify:** `cd apps/designer-portal && pnpm exec jest src/components/document/pieces && pnpm type-check`

---

## W7: end-to-end S1–S8 verification. Reset owner T-59.

### T-59 Playwright suite S1–S8, with the walk fixture
- **Slice:** all. **Category:** coding.normal.
- **Scope:**
  - `apps/designer-portal/e2e/document/pieces-build-room.spec.ts` (new)
  - `apps/designer-portal/e2e/document/pieces-fixture.sql` (new)
  - `apps/designer-portal/playwright.config.ts`
  - `supabase/seed/dev/pieces_build_room_walk_dev.sql` (new, local-only)
- **Depends on:** W1–W6 integrated.
- **Acceptance:**
  - **The fixture.** Whole Home Renovation per SPEC §4 (rooms, lines H1…K2, placements §4.3), seeded through `e2e/helpers/psql.ts` after one reset under CONTRACT §4.
  - **Flags.** `NEXT_PUBLIC_FLAG_OVERRIDES` gains `ask-the-paper:true,one-voice:true`. Mind the secret-scan trap in `playwright.config.ts`: edit only that one string.
  - **The specs**, one per scenario, each with its return path:
    - S1, four Enters (a2, a13);
    - S2, the oak floor in 4 rooms (a5);
    - S3, fill plus the shower group (a6);
    - S4, wallpaper labor, PO and invoice (a7);
    - S5, remove, undo, refusal and merge (a8, a15);
    - S6, drag and `Move to room…` (a9);
    - S7, the head, Esc, back and hold (a3, a10);
    - S8, finishes and print (a11).
  - **Viewports.** 1440 and 390.
  - **Timing.** Logged per spec, not asserted.
- **Verify:** `cd apps/designer-portal && pnpm exec playwright test e2e/document/pieces-build-room.spec.ts --project=chromium`

### T-60 Integrated QA: S1–S8 at 1440 and 390, by mouse, keyboard and touch
- **Slice:** all. **Category:** behavior-verification.
- **Scope:** read-only, except evidence under `artifacts/pieces-building-room-2026-10-08/build/qa/`.
- **Depends on:** T-59.
- **Acceptance:** A walker who did not build the job performs S1–S8 on the integrated local build:
  - at 1440 and 390;
  - by mouse, by keyboard alone, and by touch (iPhone or simulator);
  - with VoiceOver for S1, S5 and S7.

  For each scenario, record:
  - step count;
  - S1's time by hand;
  - one named refusal met;
  - focus return and announcements;
  - the return path to the overview;
  - a screenshot.

  Plus, with `one-voice` and `ask-the-paper` on:
  - the US-19 paper (eyebrow, Next, `Standing · N`);
  - `Record a change` at the Pieces head with no duplicate act;
  - a band Standing count equal to the overview's placeholders.

  Pass and fail per row, each failure filed as a ticket (`direction.md` §5 acceptance; slice 2's human mobile walk).
- **Verify:** `cd apps/designer-portal && pnpm exec playwright test e2e/document/pieces-build-room.spec.ts --project=chromium --project=webkit`

### T-61 Review W7: adversarial review of the integrated release candidate
- **Slice:** all. **Category:** review-audit.
- **Scope:** read-only. The full `pieces/build-room` diff against `879742578`.
- **Depends on:** T-59, T-60.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Check:**
    - security (RLS on all 7 new tables, client allow-lists, RPC authority);
    - the migration order and the last-writer-wins bases;
    - the edge fan-out list;
    - banned words across the diff;
    - VISION §6 (no tabs on the paper);
    - the US-19 interaction (§3.8);
    - T-60's open failures.
- **Verify:** `cd apps/designer-portal && pnpm type-check && pnpm lint && pnpm test`

---

## W8: ship

### T-62 V15, I25 reopened, house sheet, the Sanity copy list
- **Slice:** all. **Category:** coding.easy.
- **Scope:**
  - `docs/vision/VISION-DECISIONS.md`
  - `docs/design/the-document/DECISIONS.md`
- **Depends on:** T-61.
- **Acceptance:**
  - **V15**, "The Build room": the rulings listed in CONTRACT §6 step 7, with the client-price note.
  - **I25** is reopened, with drag plus `Move to room…`.
  - **Sanity (`kv3qrinl`):** query the published and draft documents for the six strings in §6 step 7, list the hits in a ticket comment, and publish nothing.
- **Verify:** `cd docs/vision && grep -n '^### V15' VISION-DECISIONS.md && grep -n 'I25' ../design/the-document/DECISIONS.md`

### T-63 Ship: db push, functions, portals, flags, probes
- **Slice:** all. **Category:** behavior-verification.
- **Scope:** none in the repo. Prod actions only, **after Kody says "ship" in the session**.
- **Depends on:** T-62 and the orchestrator's combined gate on the integrated commit.
- **Acceptance:** CONTRACT §6 steps 1–8, in order.
  - **`db push`:** 00727 and 00728 first, then the 18 US-21 migrations; the plan must list exactly those, or stop.
  - **Edge redeploys:** po-send, spec-book-render, spec-pdf and fulfillment-po.
  - **Portals:** designer-portal and client-portal, via `deploy-portal.sh` with the env exported.
  - **Flags:** `ask-the-paper` then `one-voice` ON FOR EVERYONE, each verified through the `/flags` probe.
  - **Probes:** (a)–(m), recorded.
  - **If W5 is absent** from the integrated commit, stop and request a ruling (CONTRACT §2, 00734).
- **Verify:** `cd apps/designer-portal && npx wrangler deployments list --name patina-designer-portal`

### T-64 Review W8: post-ship probe audit
- **Slice:** all. **Category:** review-audit.
- **Scope:** read-only. T-63's evidence and the Strata state.
- **Depends on:** T-63.
- **Acceptance:**
  - Report every finding with confidence and severity.
  - **Confirm:**
    - Strata's ledger lists 00727, 00728 and the US-21 numbers;
    - no client payload carries `rough_cents`;
    - the bottom rows of the Worker deployments match the recorded versions;
    - both flags return true for an unrelated user id;
    - probes (a)–(m) carry evidence.
  - **Name** the owed signed-in walk with Leah.
- **Verify:** `cd apps/client-portal && npx wrangler deployments list --name patina-client-portal`
