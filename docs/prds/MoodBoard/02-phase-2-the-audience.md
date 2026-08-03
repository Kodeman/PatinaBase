# Phase 2 — The Audience

Master PRD: [00-mood-board-prd.md](./00-mood-board-prd.md) ·
Architecture: [04-technical-foundations.md](./04-technical-foundations.md) ·
Previous: [Phase 1 — The Room](./01-phase-1-the-room.md) ·
Next: [Phase 3 — The Reach](./03-phase-3-the-reach.md)

---

## Overview

Phase 1 made the board a place to work. Phase 2 makes it a thing to show.

Four pieces of work, all riding the existing data model plus one small additive
migration:

1. **One composition renderer** for every client-facing surface — designer
   Present mode, client portal, guest share, and the designer's proposal mirror.
   Ruling #2 (Kody, 2026-08-03). Sections become visible to clients. Duplicated
   render paths are retired.
2. **On-canvas verdicts** — the per-pin approve/flag/comment anchor that
   `item_feedback.board_item_id` has supported since 00267 but that has never
   appeared on a composition.
3. **Board-scoped share** — extend `document_shares` (00266) so a designer can
   send a link to *one board* rather than a whole proposal.
4. **Project-phase boards** — light up the dead `00272`/`00273` branch so boards
   survive signing.

**Flag:** still `mood-board-editor`. Phase 2's renderer swap is the highest-risk
change in the package (it touches a live revenue surface), so the swap is rolled
out **per surface**, in the order given in R2.6.5.

---

## Dependencies

| Dependency | Status | Note |
|-----------|--------|------|
| Phase 1 complete | required | `BoardRoomCanvas`, the command stack, and the section-band UI are prerequisites for Present mode |
| `item_feedback` + `board_item_id` anchor + `item_feedback_gate()` (00267) | shipped | One-anchor CHECK: exactly one of `proposal_item_id` / `ffe_item_id` / `board_item_id` |
| `useBoardFeedback` / `useClientBoardFeedback` (`packages/supabase/src/hooks/use-item-feedback.ts`) | shipped | Designer and client read paths for verdicts |
| `document_shares` + `resolve_document_share()` (00266) | shipped | SECURITY DEFINER, stores `sha256(token)` only, forces `feedbackEnabled = false` on every guest render |
| `project_boards` (00179) + activation carry (00180) | shipped | Frozen JSONB snapshot; snapshot items carry **no** `id` |
| `proposal_boards.project_id` owner leg + `chk_proposal_boards_owner` + RLS legs (00272) | shipped | Live project-owned boards |
| `continue_board_in_project(...)` RPC (00273) | shipped | Never called from any UI |
| `useProjectBoards`, `useProjectOwnedBoards`, `useContinueBoardInProject` (`use-boards.ts:720-802`) | shipped, **dead** | Zero mounts today; Phase 2 mounts them |
| `BoardComposition` / `ScaledBoardCanvas` / `StackedBoardItems` / `FeaturedPieces` (`packages/patina-design-system/src/components/proposal/BoardsBlock.tsx`, 710 lines) | shipped | The evolution target — see R2.1 |
| `apps/client-portal/src/components/board-block.tsx` (98 lines) | shipped | Client portal consumer |
| `apps/client-portal/src/app/share/[token]/page.tsx` | shipped | Server-resolved guest render, RLS bypass via the RPC |
| `apps/designer-portal/src/components/document/drafting/proposal-mirror.tsx` (667 lines) | shipped | Designer's view of the client render |
| `verdictChipSpec` (`apps/designer-portal/src/lib/document/verdict-chip.ts`) | shipped | Chip vocabulary reused on canvas |

---

## Detailed requirements

### R2.1 — The unified composition renderer

**Ruling #2:** presentation mode *is* the client render. One render path.

**R2.1.1** `BoardComposition` in
`packages/patina-design-system/src/components/proposal/BoardsBlock.tsx` becomes
the single composition renderer. It is extended, not replaced — its existing
props (`items`, `mode`, `renderPinOverlay`, `renderPinDetail`) are preserved and
extended additively.

**R2.1.2** New props:

| Prop | Type | Purpose |
|------|------|---------|
| `sections` | `BoardSection[]` | Section definitions from `proposal_boards.sections`; renders labelled bands behind members |
| `canvasWidth` / `canvasHeight` | `number` | The board's persisted logical size (Phase 1 R1.6) — replaces any inferred bounds |
| `backgroundColor` | `string` | From `proposal_boards.background_color` (default `#FAF8F5`) |
| `fit` | `'contain' \| 'width'` | Zoom-to-fit strategy; `contain` for full-bleed present, `width` for in-document embedding |
| `fullBleed` | `boolean` | Removes the document card chrome; used by Present mode and guest share |
| `showNotes` | `boolean` | Toggles `note`-type pin visibility |
| `interactive` | `boolean` | Enables pin hit-targets for verdicts (R2.3); default `false` |

**R2.1.3** Section bands render **behind** pins, with the section name as a
visible label. Membership is read from `data.section_id` on each item; the band
bounds are computed with the same `sectionBounds` geometry the editor uses, so
the client sees exactly the bands the designer arranged. Sections with zero
members do not render.

**R2.1.4** `ScaledBoardCanvas` (the measure-and-scale wrapper at
`BoardsBlock.tsx:114-188`) remains the scaling mechanism. Its measurement must
use the passed `canvasWidth`/`canvasHeight` rather than any hardcoded or
inferred dimension, so a Phase-1-grown canvas scales correctly.

**R2.1.5** `StackedBoardItems` (the `<sm` fallback at `BoardsBlock.tsx:427`)
**stays**. Below the small breakpoint the composition is unreadable; the stacked
list is the correct render. It gains section headings so the client's mental
model matches the composition.

**R2.1.6** `FeaturedPieces` (`BoardsBlock.tsx:499`) stays unchanged — it is the
product-detail list beneath the composition, not a duplicate render.

**R2.1.7** The renderer must produce byte-identical geometry for a given board
regardless of which of the four surfaces mounts it. Any surface-specific
difference is expressed only through the props in R2.1.2.

### R2.2 — Present mode in the room

**R2.2.1** The Edit/Present segmented toggle in the room's top bar (stubbed out
in Phase 1 R1.4.1) becomes functional. `P` toggles it from the keyboard.

**R2.2.2** Present mode renders `BoardComposition` with `fullBleed`, `fit:
'contain'`, sections visible, at 100dvh. The left rail, inspector, guides, grid,
and handles are hidden. The top bar collapses to: board name, notes toggle,
share, Edit toggle, Done.

**R2.2.3 — Live-editable presentation (the Morpholio lesson).** Present mode is
**not** a frozen slideshow. Switching back to Edit, changing an item, and
switching to Present shows the change immediately, with no reload and no
re-render of the client's view state. Where the designer and client are looking
at the same screen, this is sufficient; a client viewing a *share link* sees
changes on their next load (no realtime — [O1](./00-mood-board-prd.md#9-open-items)).

**R2.2.4** A notes toggle shows/hides `note` pins, so working annotations can be
suppressed for a client without deleting them.

**R2.2.5** Present mode is view state. It never persists, never enters the undo
stack, and never blocks autosave — pending layout writes continue to flush on
the same 600ms cadence while presenting.

**R2.2.6** Escape in Present mode returns to Edit, not out of the room. A second
Escape exits per Phase 1 R1.3.1.

### R2.3 — On-canvas verdicts

**R2.3.1** When `interactive` is true and feedback is enabled, each pin on the
composition carries a verdict affordance: **Approve**, **Flag**, **Note**. The
vocabulary and colors come from `verdictChipSpec` so canvas chips and document
chips read the same.

**R2.3.2** Verdicts write to `item_feedback` with `board_item_id` set (00267;
verdict values are `approved` / `rejected` / `comment`, and a `comment` verdict
requires a body per `item_feedback_comment_needs_body`). No new table, no new
column.

**R2.3.3** The client-portal composition is `interactive` when the proposal's
`feedbackEnabled` visibility is true. The **guest share render is never
interactive** — `resolve_document_share()` forces `feedbackEnabled = false` on
every guest render regardless of what the share row stores, and Phase 2 must not
weaken that.

**R2.3.4** On the designer side, the room shows an existing verdict as a chip
anchored to the pin in both Edit and Present mode. Chips are read-only for the
designer.

**R2.3.5** The left rail gains a **Feedback** filter listing pins by verdict
(approved / flagged / commented / no verdict). Selecting an entry selects and
scrolls-to the pin on the canvas.

**R2.3.6** A verdict on a pin whose item is subsequently deleted cascades away
(`board_item_id REFERENCES proposal_board_items(id) ON DELETE CASCADE`). Undoing
that delete (Phase 1 R1.12.5 re-inserts with the original id) does **not**
restore the cascaded feedback. This is accepted; the delete confirmation must
warn when the selection carries verdicts.

**R2.3.7** Verdict counts appear on the board cover in the launcher strip and
desk recents.

### R2.4 — Board-scoped share

**R2.4.1** The room's top bar gains a **Share** control (omitted in Phase 1). It
issues a tokenized, revocable, view-only link scoped to a single board.

**R2.4.2** The share reuses the `document_shares` mechanics exactly: raw token
returned once to the creator's clipboard, only `sha256(token)` stored, guest
reads exclusively through the SECURITY DEFINER resolver, `feedbackEnabled`
forced false, `status` revocable, optional `expires_at`, `view_count` and
`last_viewed_at` maintained.

**R2.4.3** Schema change (see [Migrations](#migrations)): `document_shares`
gains a `scope` discriminator and a nullable `board_id`, and `proposal_id`
becomes nullable so that a **project-owned** board (which has no proposal) can
be shared.

**R2.4.4** `resolve_document_share()` is extended to return a board payload when
`scope = 'board'`: the board row, its items, its sections, and its canvas
dimensions — and nothing else. A board share must not expose the parent
proposal, its schedule, its pricing beyond what the pin snapshots already carry,
or sibling boards.

**R2.4.5** The guest route renders a board share full-bleed through the R2.1
renderer with `interactive: false`.

**R2.4.6** A share-management panel in the room lists this board's active
shares with label, created-at, view count, last viewed, and a revoke action.

**R2.4.7** Existing proposal-scoped shares continue to work unchanged. The
migration must not alter the behavior of any existing row.

### R2.5 — Project-phase boards

The schema and the RPC shipped in 00272/00273 and the hooks exist. Phase 2
mounts them.

**R2.5.1** A project surface lists **live project-owned boards** via
`useProjectOwnedBoards(projectId)` (boards whose `project_id` is set — the owner
leg guarded by `chk_proposal_boards_owner`). Each opens in the room at
`/board/[boardId]`.

**R2.5.2** The same surface lists **frozen snapshots** via
`useProjectBoards(projectId)` — the `project_boards` JSONB rows created by
`activate_proposal_as_project` (00180). These render **read-only** through the
R2.1 renderer.

**R2.5.3** Snapshot items carry no `id`. The read-only render must therefore
disable every affordance that requires an item id: verdicts, selection,
inspector, deep-link-to-pin. The renderer must not throw or key on a missing id.

**R2.5.4** A frozen snapshot carries a **Continue in project** action calling
`useContinueBoardInProject` → `continue_board_in_project` (00273), producing a
live project-owned board. On success the user is navigated into the room on the
new board.

**R2.5.5** Continuing twice from the same snapshot must not silently produce
duplicate boards — the UI shows the already-continued board and offers to open
it instead. (Verify the RPC's own idempotency behavior before implementing;
if it is not idempotent, guard in the UI and note it.)

**R2.5.6** The room's top-bar room chip renders correctly for a project-owned
board (project name, not proposal name), and the Done target resolves to the
project surface rather than `/drafting/[proposalId]` (Phase 1 R1.3.2 fallback
chain gains a project leg).

**R2.5.7** Project-owned boards use the owner-ref autosave barrier from Phase 1
R1.18.4.

### R2.6 — Retiring duplicated render paths

**R2.6.1** After R2.1, the following consume `BoardComposition` and nothing
else:

| Surface | File | Change |
|---------|------|--------|
| Designer Present mode | `apps/designer-portal/src/app/(document)/board/[boardId]/page.tsx` | New consumer |
| Client portal proposal board block | `apps/client-portal/src/components/board-block.tsx` | Passes the new props; drops any local layout logic |
| Guest share | `apps/client-portal/src/app/share/[token]/page.tsx` | Renders the board payload full-bleed |
| Designer proposal mirror | `apps/designer-portal/src/components/document/drafting/proposal-mirror.tsx` | Uses the same renderer as the client |

**R2.6.2** `BoardStatic.tsx` in
`packages/patina-design-system/src/components/BoardCanvas/` is superseded in
practice already; after R2.6.1 it has no consumers. Mark it `@deprecated` in
Phase 2. Deletion is a Phase 3 cleanup decision
([O4](./00-mood-board-prd.md#9-open-items)).

**R2.6.3** `StackedBoardItems` is **not** retired (R2.1.5).

**R2.6.4** The inline `board-editor.tsx` (1644 lines) may be deleted only once
the flag reaches 100% and the legacy drafting path in R1.2.2 is removed. Not a
Phase 2 requirement.

**R2.6.5 — Rollout order.** Swap one surface at a time, verifying each before
the next:
1. Designer Present mode (no external audience)
2. Designer proposal mirror (internal, but shows what the client will see)
3. Client portal board block
4. Guest share

---

## Out of scope for Phase 2

| # | Not in Phase 2 | Where it lands |
|---|----------------|----------------|
| — | Composition-true PNG/PDF export | [Phase 3 R3.1/R3.2](./03-phase-3-the-reach.md) |
| — | Cover thumbnails generated from the composition | [Phase 3 R3.2](./03-phase-3-the-reach.md#r32--cover-thumbnails) |
| — | Realtime propagation of edits to a client's open share link | [O1](./00-mood-board-prd.md#9-open-items) — Phase 4 or never |
| — | Comment/edit share tiers (view-only remains the only tier) | not scoped |
| — | Verdicts on the guest render | Structurally excluded by `resolve_document_share()` — R2.3.3 |
| — | Board-to-spec generation (cut sheet, shoppable list) | [O3](./00-mood-board-prd.md#9-open-items) |
| — | Deleting `board-editor.tsx`, `BoardCanvas`, `BoardStatic` | Phase 3 cleanup, [O4](./00-mood-board-prd.md#9-open-items) |
| — | Any change to `item_feedback` schema | Not needed — 00267 already anchors on `board_item_id` |

---

## Migrations

One additive migration. **Take the next `NNNNN` at build time**
(`ls supabase/migrations/*.sql | sort | tail -1`) — never the number in this
doc. Follow **patina-db-migrations**; if branches are running in parallel,
follow **patina-parallel-work** for collision avoidance.

### `NNNNN_board_scoped_shares.sql`

| Change | Detail |
|--------|--------|
| `document_shares.scope` | `TEXT NOT NULL DEFAULT 'proposal' CHECK (scope IN ('proposal','board'))`. The default backfills every existing row to `'proposal'` with no data migration. |
| `document_shares.board_id` | `UUID REFERENCES public.proposal_boards(id) ON DELETE CASCADE`, nullable |
| `document_shares.proposal_id` | `DROP NOT NULL` — a project-owned board's share has no proposal |
| Anchor CHECK | `scope = 'proposal'` ⇒ `proposal_id IS NOT NULL AND board_id IS NULL`; `scope = 'board'` ⇒ `board_id IS NOT NULL` (`proposal_id` may be non-null when the board is proposal-owned, and is informational only) |
| Index | `idx_document_shares_board ON document_shares(board_id, created_at DESC) WHERE board_id IS NOT NULL` |
| RLS | The existing designer-of-proposal policy is extended with a board leg: a designer may manage a share whose `board_id` resolves to a board they own through **either** owner leg (`proposal_id` → proposals, or `project_id` → projects), mirroring the 00272 RLS legs. |
| `resolve_document_share()` | Extended to branch on `scope`. **Recreate the whole function body** — do not attempt a partial edit; RPC head-body discipline in **patina-db-migrations** exists because an earlier partial recreate silently reverted a prior fix. If the return signature changes, `DROP FUNCTION` then `CREATE`. |

Additional migration notes:

- Schema-qualify any extension function (`extensions.digest(...)`,
  `extensions.uuid_generate_v5(...)`) — the prod `db push` session's
  `search_path` does not include `extensions`.
- If the migration adds or changes GRANT/REVOKE, regenerate the local ACL seed:
  `python3 scripts/generate-legacy-grants.py`.
- Apply locally with `pnpm supabase:reset`, then regenerate types with
  `pnpm db:generate` (needs `SUPABASE_DB_URL`). Never hand-edit
  `database.types.ts`.

---

## Analytics

| Event | Properties | Fired when |
|-------|-----------|-----------|
| `board_presented` | `board_id`, `item_count`, `section_count`, `surface` (`room` \| `mirror`), `duration_ms` (on exit from Present) | Present mode is entered; `duration_ms` on exit |
| `board_shared` | `board_id`, `scope` (`board`), `has_expiry`, `share_id` | A board share is created |
| `board_share_viewed` | `board_id`, `share_id` | A guest render resolves a board-scoped share (server-side capture) |
| `verdict_given` | `verdict` (`approved` \| `rejected` \| `comment`), `board_id`, `board_item_id`, `item_type`, `surface` (`client_portal` \| `room`) | An `item_feedback` row is written from a composition pin |
| `project_board_continued` | `project_id`, `source_board_id`, `new_board_id` | `continue_board_in_project` succeeds |

Feeds metrics **M5** (`board_presented` + `board_shared` per activated
proposal) and **M6** (boards with ≥1 `verdict_given` / boards presented or
shared). **M8** — client-render error rate — is monitored via the existing
error tracking on the client portal across the R2.6.5 rollout, not via a new
event.

---

## Acceptance criteria

| AC | Criterion | Proves |
|----|-----------|--------|
| AC2.1 | The same board rendered in Present mode, the client portal, the guest share, and the proposal mirror produces identical pin geometry (screenshot diff within antialiasing tolerance) | R2.1.7 |
| AC2.2 | A board with 3 sections renders 3 labelled bands behind the pins on every client surface; a section with no members renders nothing | R2.1.3 |
| AC2.3 | A board whose canvas was grown to 2400×1600 in Phase 1 scales to fit without clipping on all four surfaces | R2.1.4 |
| AC2.4 | Below the `sm` breakpoint the stacked fallback renders, now with section headings | R2.1.5 |
| AC2.5 | `P` and the top-bar toggle switch to Present; rail, inspector, handles, guides, and grid are all absent; the composition fits with a margin | R2.2.2 |
| AC2.6 | Edit an item, switch to Present: the change is visible with no reload. Switch back: the item is still selected-able and the undo stack is intact | R2.2.3, R2.2.5 |
| AC2.7 | The notes toggle hides `note` pins and does not delete or modify them (DB rows unchanged) | R2.2.4 |
| AC2.8 | Escape in Present returns to Edit; a second Escape exits the room | R2.2.6 |
| AC2.9 | A client with feedback enabled approves a pin; an `item_feedback` row exists with `board_item_id` set and the other two anchors null | R2.3.2 |
| AC2.10 | A `comment` verdict submitted with an empty body is rejected (the `item_feedback_comment_needs_body` CHECK is surfaced as a validation message, not a 500) | R2.3.2 |
| AC2.11 | The guest share render shows **no** verdict affordances even when the share row's stored visibility claims `feedbackEnabled: true` | R2.3.3 |
| AC2.12 | The designer sees verdict chips anchored to pins in both Edit and Present, and the rail Feedback filter selects and scrolls to the pin | R2.3.4, R2.3.5 |
| AC2.13 | Deleting a pin that carries verdicts shows a warning naming the count; after delete the `item_feedback` rows are gone; undo restores the pin but not the feedback | R2.3.6 |
| AC2.14 | Creating a board share returns the raw token exactly once; the DB row stores only a hash; the raw token appears in no log or response thereafter | R2.4.2 |
| AC2.15 | A board share URL renders that board and nothing else. Probing the parent proposal's data through the same token returns nothing | R2.4.4 |
| AC2.16 | A **project-owned** board (no proposal) can be shared, and the resulting link resolves | R2.4.3 |
| AC2.17 | Every pre-existing proposal-scoped share still resolves identically after the migration (test against rows created before the migration in a reset-then-seed run) | R2.4.7 |
| AC2.18 | Revoking a board share makes the link 404; the row's `status` is `revoked` | R2.4.6 |
| AC2.19 | A project surface lists live project-owned boards, each opening in the room | R2.5.1 |
| AC2.20 | A frozen `project_boards` snapshot renders read-only with no selection, no inspector, no verdict affordances, and throws nothing despite items having no `id` | R2.5.2, R2.5.3 |
| AC2.21 | "Continue in project" produces a live editable project-owned board and navigates into it; a second attempt from the same snapshot offers the existing board instead of creating a duplicate | R2.5.4, R2.5.5 |
| AC2.22 | In the room on a project-owned board, the room chip shows the project, Done returns to the project surface, and exit flush succeeds | R2.5.6, R2.5.7 |
| AC2.23 | `board-block.tsx`, `share/[token]/page.tsx`, and `proposal-mirror.tsx` each import `BoardComposition` and contain no local pin-layout logic | R2.6.1 |
| AC2.24 | `BoardStatic` is marked deprecated and has zero imports | R2.6.2 |
| AC2.25 | The five Phase 2 events fire with the documented property sets | Analytics |

---

## Verification plan

No CI. Local gates only — **patina-verification**.

### Gate commands

| Scope | Command | Gates |
|-------|---------|-------|
| Migration | `pnpm supabase:reset` then `pnpm db:generate` | Migration applies on a full replay with seeds; types regenerate cleanly |
| SQL behavior | `psql $SUPABASE_DB_URL -f` a scratch script exercising `resolve_document_share()` for both scopes and both owner legs | AC2.15, AC2.16, AC2.17 |
| Design system | `pnpm --filter @patina/design-system test` and `build` | R2.1 renderer props, section bands, missing-id tolerance |
| Client portal | `pnpm --filter client-portal type-check` and `build` | AC2.23; the client portal has the weakest lint story, so `build` is the real gate |
| Designer portal | `pnpm --filter designer-portal type-check`, `test`, `lint`, `build` | Present mode, verdict chips, share panel, project surface |
| E2e | `pnpm --filter designer-portal test:e2e` with the flag override | AC2.5, AC2.6, AC2.9, AC2.21 |

### Automated coverage by layer

**Design-system vitest** (`BoardsBlock.test.tsx`, extended):
- section-band bounds match the editor's `sectionBounds` output for the same
  input (a shared fixture used by both test suites — this is the guard for
  AC2.1)
- a board with `canvasWidth`/`canvasHeight` beyond the default scales to fit
- items with `id: undefined` (the frozen-snapshot shape) render without
  throwing and without verdict affordances
- `interactive: false` renders no verdict targets
- `showNotes: false` omits `note` pins from the DOM
- stories: full-bleed present · in-document embed · frozen snapshot ·
  stacked `<sm` fallback with section headings

**Designer-portal jest**:
- Present toggle state machine including the Escape ladder (AC2.8)
- verdict chip mapping through `verdictChipSpec`
- rail Feedback filter selection → canvas selection
- delete-with-verdicts warning copy and count
- share panel: create → token shown once → revoke
- project surface: live vs frozen list rendering, continue-in-project navigation

**Client-portal jest**: `board-block.tsx` passes the new props; feedback-enabled
gating drives `interactive`.

**Playwright e2e** (flag override, single actor, no `networkidle`):
- designer opens the room → Present → edits in Edit → Present shows the change
- designer creates a board share → opens the token URL in a fresh context →
  board renders, no verdict controls
- client approves a pin in the client portal → designer sees the chip in the room
- activate a proposal → continue a frozen board into the project → the new board
  opens in the room

### Manual walk checklist

| # | Check | ☐ |
|---|-------|---|
| 1 | Side-by-side screenshots of a real board pre- and post-swap on the client portal — pin positions, sizes, and rotations identical | ☐ |
| 2 | Same for the guest share and the proposal mirror | ☐ |
| 3 | Present mode on an external display at 1920×1080 and on a 13" laptop — composition fits, no clipping | ☐ |
| 4 | Board share opened on a phone (stacked fallback) and on a tablet (composition) | ☐ |
| 5 | A share link opened while the designer edits — reload shows the edit (confirming R2.2.3's no-realtime boundary is understood, not a bug) | ☐ |
| 6 | Verdicts on a touch device — the pin hit targets are usable at composition scale | ☐ |
| 7 | An activated proposal's frozen board, walked end to end: view → continue → edit → present | ☐ |
| 8 | The four R2.6.5 surfaces verified **in the given order**, with a pause between each | ☐ |

Deploy note: this phase changes shared workspace packages
(`@patina/design-system`, `@patina/supabase`). Portals must be deployed with
`./infra/deploy-portal.sh <name>` so workspace dists are rebuilt first —
building with `opennextjs-cloudflare` directly bundles a stale dist. See
**patina-deploy**.
