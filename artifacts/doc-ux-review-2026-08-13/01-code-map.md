# The Document surface — structural map (apps/designer-portal)
*(Produced by Explore agent, 2026-08-13, for the /doc UX review)*

Orientation source: `.agents/skills/patina-portal-features/SKILL.md` (canonical skill dir is `.agents/skills/`, not `.claude/skills/`) plus `apps/designer-portal/CLAUDE.md`.

## 1. Route tree

Route group: `apps/designer-portal/src/app/(document)/` — shell at `(document)/layout.tsx:43`. Post-R21-dissolve this is the *only* landing surface; `(portal)/portal/` zones were deleted (`the-document-pilot` flag retired).

- `desk/page.tsx` — the dashboard-equivalent ("The Desk"), read-only needs list.
- `doc/[id]/page.tsx` — **the open document**, one route for every engagement shape (project / proposal / lead / relationship).
- `doc/[id]/plans/page.tsx` + layout — Plan Room workspace (`PlanRoomWorkspace`).
- `doc/[id]/spec-book/page.tsx` + layout — Spec Book workspace (`SpecBookWorkspace`).
- `board/[boardId]/page.tsx` — mood-board detail.
- `ceremony/[leadId]/page.tsx` — lead-acceptance ceremony.
- `drafting/[proposalId]/page.tsx` — the Drafting Room (proposal editor).
- `compose/page.tsx` — proposal/message composer entry.
- `library/page.tsx`, `library/[id]/page.tsx`, `library/judgments/page.tsx` — Library room.
- `people/page.tsx` — People/Rolodex room.
- `rooms/page.tsx`, `room/[id]/page.tsx`, `room/[id]/file/page.tsx` — physical rooms.

No `/doc/[id]/schedule`, `/ffe`, `/budget` sub-routes exist — phase does **not** change the URL. `doc/[id]/page.tsx` reads one row from the `document_state` view and renders **one active section in place** (D1: "no document tabs").

## 2. Phase model

Source of truth: `document_state` view, `supabase/migrations/00191_document_state_view.sql:22`. Unions 4 engagement shapes into one `active_section` per row:

- Shape A (signed project), lines 26–42: `active_section` = `'care'` if `p.status='completed'`; `'install'` if `p.current_phase in ('installation','final_walkthrough')`; else `'project'`. `is_paused` = `status='on_hold'`, `is_archived` = `status='archived'`.
- Shape B (pre-signing proposal chain), lines 92–105: `'direction'` while `status='draft'`, else `'proposal'`.
- Shape C (open lead), lines 147–169: `'brief'`, gated `leads.status in ('new','viewed','contacted')`.
- Shape D (accepted relationship, no proposal), lines 176–221: `'discovery'`.

Full `SectionKey` union (`src/lib/document/desk-derivation.ts:29`): `brief | discovery | direction | proposal | project | install | care`. Spine order/labels: `src/lib/document/section-derivation.ts:42-58`.

Underlying DB machinery (distinct from `active_section`):
- `projects.current_phase` (free-text `phase_key`: `design`, `procurement`, `installation`, `final_walkthrough`) — `supabase/migrations/00066_proposal_project_flow_v2.sql:206`.
- `project_phases` table — per-phase rows, `status IN ('pending','in_progress','completed','delayed')`, dates, fee, gate condition — `00066:303-311`. Seeded from `proposal_phases` by `activate_proposal_as_project`.
- `doc/[id]/page.tsx:411` derives `installPhase = phases.find(p => p.phase_key === 'installation')` for spine sub-labels.

**Project vs install gate**: solely the view conditional `current_phase in ('installation','final_walkthrough')`. Everything downstream branches off `row.active_section` — `doc/[id]/page.tsx:904-995`.

## 3. Major components by active section (`src/components/document/`)

Mounted from `doc/[id]/page.tsx:904-995`, DOM order:

**`active_section === 'project'`** (:904-952):
- `ScheduleSpine` (`schedule/schedule-spine.tsx`) if flag `schedule-spine` on, else legacy `CoordinationBand` (`coordination/coordination-band.tsx`). Data via `RippleProvider`/`useResolvedSchedule`.
- `FFESection` (`ffe-section.tsx`, `mode="project"`) — FF&E schedule-as-table. Feeds via `useProjectFFEItems` (`withLifecycle: true`), `useProjectFfeReadiness`, `useFfeInvoiceCoverage`.
- `ProjectAuthorityBandForProject` (`commercial/project-authority-band.tsx`).
- `ProjectCommerceSection` (`commercial/project-commerce-section.tsx`) — budget folded into commerce + `AccountBand`, no Budget tab.
- `CareBand` (`care-band.tsx`) — folded/quiet pre-install.

**`active_section === 'install'`** (:953-972):
- Same `FFESection`, `mode="install"`.
- `CareBand` **unfolded by default** (comment `care-band.tsx:9-13`: "closing out IS the work of this stage").

**`active_section === 'care'`** (:973-995):
- `CareSection` (`quiet-sections.tsx`) — completion date + portfolio snapshot (post `close_project` RPC, migration 00238).
- `FFESection` again, `mode="install"`, read-only-ish.

**Cross-section, project docs only** (:1000-1027): `AccountBand`, `ProjectMoodBoards`, `KickoffBand` (roster), `PlanRoomBand`, `DocColophon`.

**Punch list**: not a standalone section — coordination items via `coordination/item-resolve/resolve-punch.tsx`, surfaced inside `ScheduleSpine`/`CoordinationBand`.

**Settled history** (:708-777, `PreviousWork`/`SettledBar`): Brief → `BriefRecap`, Discovery → `DiscoveryRecap`, Direction/Proposal → `ProposalBlocksReadOnly` — earlier phases stay reviewable in place (R66), never a separate route.

## 4. Navigation model

No zone nav, no tab bar, no sidebar (D1). Chrome in `(document)/layout.tsx:43-112`:
- **Studio Drawer** (`studio-drawer.tsx`) — fixed 60px bottom strip. Left: wordmark (→/desk) + breadcrumb. Center: 6 doors from `ALL_STUDIO_SURFACES` registry: `library`, `orders`, `accounts`, `people`, `rooms`, `hours` — each `weight: 'room'` (navigates, puts down held doc) vs `'sheet'` (overlay). Room doors: /library, /people, /rooms; sheet doors: orders/accounts/hours overlays.
- **Command Bar** (⌘K, `command-bar.tsx`) — global search/nav, owns `openLedger`.
- **LogStrip** — time tracking via `useHoldDocument` (`doc/[id]/page.tsx:257-265`): opening /doc/[id] starts a timer.
- Desk → doc: `/desk` "needs your hand" folders (`folder-card.tsx`, `desk-contents.tsx`) → `/doc/[id]`; in-doc jump nav = `DocSpine` (:616, `jumpToSection` :288-329). Esc puts the doc down → /desk (:373-382).
- No `ToastProvider` — failures render as inline bands at the act site (`layout.tsx:36-41`).

## 5. FF&E GA (merge `01fdee48`, 2026-08-12)

Doc-surface-visible pieces:
- `ffe-section.tsx` — new readiness gate `useProjectFfeReadiness(selectionIds)`; error state renders inline alert + retry ("Release readiness could not be read, so no line can be released yet."), `actionKey="retry-ffe-readiness"`. `useProjectFFEItems` opt-in `withLifecycle: true` for line-unfold trail.
- `schedule/add-to-project-sheet.tsx` (new ~371 lines) + `add-line-sheet.tsx` — add FF&E lines/rooms into project schedule.
- `rooms/piece/add-to-project-sheet.tsx` — piece-level add (Library → schedule).
- `spec-books/spec-book-workspace.tsx` (+168).
- `project-mood-boards.tsx` (+175) + `mood-board/board-add-rail.tsx`/`board-room-shell.tsx` — empty state → `GuidedEmptyState`→`BoardsBuilder`.
- `account-band.tsx`, `account/account-extension-page.tsx`, `account/account-sheet.tsx` — po-send repricing gate / extension flow.
- Client portal: `ProjectReviewEdition.tsx` + reviews/[editionId] route (edge fns `project-review-media`/`selection-review-send`).
- Hooks: `use-place-in-document.ts` (+78), `use-document-rooms.ts` (+32), `use-projects.ts` (+160).

## 6. Flags / gates on the doc surface

- `schedule-spine` — `doc/[id]/page.tsx:518` — ScheduleSpine (new) vs CoordinationBand (legacy); fail-closed to legacy while loading.
- `call-sheet` — :522 + command-bar, letterhead-instruments, item-composer, roster/*, people/*, account-studio-page, desk — whole Call Sheet feature, overlay never a route.
- `arrival-arc` — triage-bar, open-requests-strip, ceremony-surface.
- `room-file` / `room-view-refined-path` — rooms/room-view.
- `studio-workspaces` — account-sheet, desk.
- Hydration gate: first paint held to `!hydrated` (:538-546).
- `resolutionState` machine drives 3 full-page states (:538-584): loading "Picking up…", error "This document could not be picked up", missing "No document answers to this name".
- `GuidedEmptyState` reused across ffe-section:1048, project-mood-boards:201, work-block:136.
- No component-level RBAC gate in the tree — enforcement is middleware + RLS.
