# The Shelved Spine — production implementation blueprint

Ratified prototype: `artifacts/spine-shelves-prototype-2026-08-15/prototype.html` (read it first — port INTENT, never markup or vanilla-JS state handling; React owns list order via sort, not DOM reparenting).

## Orchestrator rulings (decisions already made — do not re-litigate)

- **GA, no feature flag** — matches I135 "Project, Composed" same-day-GA precedent; rollback = git revert; no migrations involved.
- **Running index entries (v1)**: Schedule · Client approvals · Project · FF&E · Design authority — the four with real inline regions. Communications and Action items are OMITTED from v1 (no inline surface exists; do not invent regions). Index renders only when `active_section === 'project'`.
- **Approvals are lens-inert in v1** — approvals carry no room dimension in the schema; do not invent a room join. Room lens lifts: FF&E, and the shelf leaves that have room data (spec book regroup, plan room sheets IF they carry a room association — verify; mood boards IF boards carry a room field — verify). Schedule and Money never lift (do not wire the context into them).
- **Knowledge shelf**: honest empty leaf — one line of copy ("Studio library — cross-project standards. Nothing filed for this project.") plus a link-out ONLY if a real library route exists (verify at build time); NO fabricated standards/lessons lists.
- **Call sheet shelf**: a doorway, not a leaf — the shelf row dispatches the existing `document:open-call-sheet` CustomEvent. Deliberate deviation from the prototype's uniform leaf treatment.
- **NotStartedBand retired**; keep `KickoffBand` mounted standalone (ungated by emptiness-collapse) after AccountBand if its first-staffing nudge has no other home.
- **"Open the schedule" ledger verb**: drop for v1 (no separate schedule page exists; don't fake a mapping). Ledger = "Adjust dates" (inked) + Fold.
- **Presence block**: its "In this document" label moves — presence text relocates to the spine foot (under the timer, unlabeled or labeled "Presence"); the running index takes the "In this document" name. Record in DECISIONS.
- **DECISIONS.md append = I136**, documenting: the shelved spine (index/rooms/shelves), schedule-rule fold with new fold key, mood-boards relocation off the paper, NotStartedBand retirement, deferred items (Communications/Action-items index entries, approvals room dimension, Knowledge data).

## 1. Spine — `apps/designer-portal/src/components/document/doc-spine.tsx` (139 lines)

- L29-36 `<aside data-document-spine data-spine-regime="sheet-below-1180-compact-to-1439-full-from-1440">` — regime string + Tailwind class list are asserted by `__tests__/responsive-document-shell.test.tsx:134` (classes L136-141). Do not change them.
- L37-46 Put down · L48-118 phase marker `<ul>` (7 StrataMarks; already icon-only at compact tier via sr-only) · L120 CompactSpineTimerDoorway · L122-124 SpineTimer · L126-135 the CURRENT "In this document" block = the presence line (naming collision — see ruling).
- Add after the phase `<ul>` (~L118): one mono summary line ("Project · Active · Week 1") from `sections.find(s => s.state === 'active')`, gated `hidden min-[1440px]:block`.
- Three NEW blocks between phase strip and timer, all `hidden min-[1440px]:block` (≥1440 ONLY; compact 1180-1439 and mobile <1180 untouched):
  1. `spine-running-index.tsx` — props `{entries: {key, label, value}[], activeKey, onJump}`; reading line = absolutely-positioned span, top/height via useLayoutEffect reading active button offsetTop/offsetHeight (ref map).
  2. `spine-rooms-block.tsx` — props `{rooms, heldRoomId, onToggleRoom}`; aria-pressed on room buttons.
  3. `spine-shelves-block.tsx` — props `{openShelf, onToggleShelf}` + per-shelf status string; aria-expanded on shelf buttons.
- The responsive-shell test passes unmodified (it never asserts absence of extra spine children). NEW tests required: index scrollspy/jump, room toggle aria-pressed, shelf toggle aria-expanded, room-lens lift.

## 2. Running index — anchors + scrollspy

- `sectionAnchorId` (`lib/document/section-anchor.ts:11-13`) names only the seven top-level sections — regions inside 'project' have NO shared anchor scheme. Do NOT rename regions' existing ad-hoc headingIds (`'project-schedule-title'`, `'money-region-heading'`, etc. — `focusRegionHeading` is wired to exact strings). Give the index a lookup table entry-key → existing heading id. Only the new ScheduleRule fold region needs a new id.
- Scrollspy: one IntersectionObserver in `hooks/use-document-running-index.ts`, rootMargin `-20% 0px -62% 0px` (prototype's). Folded regions UNMOUNT their bodies (fold-seam.tsx:9-13), so re-attach observer targets on fold/unfold and on `sections` change (query via getElementById in an effect).
- Click-while-folded → unfold first: fold state is per-region-local (`useRegionFold` called inside FFESection, MoneyRegion, ProjectMoodBoards, CareBand, ProjectApprovalDocument, ScheduleSpine — six call sites). The index CANNOT unfold directly; dispatch a CustomEvent `document:unfold-region` `{detail:{region}}` (mirror the `document:open-section` pattern at page.tsx:412-418) and have each indexed region listen.

## 3. Rooms + room lens

- Room source: `useDocumentRooms(projectId)` (hooks/use-document-rooms.ts, reads `project_rooms`) — already fetched at page.tsx:434 (`docRooms`). Reuse; no new query.
- Room state word: extract a pure `roomStateWord(rows)` into `lib/document/room-state.ts` from FFESection's RoomHeading tri-state logic (ffe-section.tsx:454-538; COMMITTED/UNDERWAY sets L483-486); refactor RoomHeading to use it; spine calls `useProjectFFEItems(projectId)` (React Query dedupes).
- `room-lens-context.tsx`: `{heldRoomId: string|null; toggleRoom(id)}`. Provider wraps from DocLetterhead through shelves (page.tsx ~L816). Always mounted; only ≥1440 UI writes it. Guard: letterhead renders below 1440 too — add a resize-reset or accept + verify a stale "IN HAND" chip can't strand (mobile has no put-down UI for it).
- Lift = stable partition sort + wash class per row-list (one line each): `heldRoomId ? [...rows].sort((a,b)=>(a.roomId===heldRoomId?0:1)-(b.roomId===heldRoomId?0:1)) : rows` — JS sort is stable; original order preserved within partitions. Never filter/hide. Wash: flat clay tint token in globals.css (D4: no shadows).
- FF&E rows: `item.project_room_id` (confirmed). Letterhead: new optional `inHandRoomName` prop on DocLetterhead, rendered between LetterheadVitals (L55-59) and NeedsSetupChip (L60), mono uppercase on clay-wash strip.

## 4. Collapsible schedule — CRITICAL

- TWO schedule surfaces: `ScheduleSpine` (schedule-spine.tsx, inside 'project' section, ALREADY owns `region: 'schedule'` fold at L816-820) and `ScheduleRule` (schedule-rule.tsx via ProjectScheduleHandoffMount at page.tsx:1021-1027, unconditional top-of-paper, NO fold today). The prototype folds ScheduleRule (the drafting strip).
- **Do NOT reuse fold key `'schedule'`** — localStorage collision + both mounted simultaneously under 'project'. Add `'schedule-rule'` to the RegionFoldKey union (region/use-region-fold.ts:25-31).
- Fold wrapper at the ProjectScheduleHandoffMount call site: `useRegionFold({docId: projectId, region: 'schedule-rule', defaultFolded: true})` (always-true default, not data-derived).
- Folded seam summary: reuse `positionText`/`scheduleVitals`/`scheduleFacts` already computed at page.tsx:512-550 — thread down as prop; do NOT recompute inside ScheduleRule (R108: two schedule sentences must not drift — see page.tsx:206 comment).
- Folded glance track: extract presentational `ScheduleGlanceStrip` from ScheduleRule's existing pieces (RuleTrack, RuleToday, monthColumns, buildTimeScale, ruleSegments — L58-77, 140-143, 171-177, 199), shared by the pinned glance (L542-592) and the new folded state. Do not reuse the sticky/IO pinning logic for the folded state.
- Unfolded: today's DraftingStrip + ScheduleConfirmStrip + PhaseAdvanceControl + new "FRAME · PHASE DATES" mono eyebrow + RegionHead (name "Schedule", ledger "Adjust dates" inked + Fold).
- **armEdit-while-folded hazard**: ScheduleSpine's "Edit dates" → `nav.armEdit(phaseId)` → ScheduleRule `registerArmEditHandler`/`handleArmEdit` (schedule-rule.tsx:332-344) scrolls/focuses a bar that is UNMOUNTED when folded; `useArmedBarFocus` intent expires (~1.5s, L323-326). Port ScheduleSpine's pending-reveal pattern (schedule-spine.tsx:700-748, 825-832): on armEdit/reveal while folded, setFolded(false) and defer scroll/focus to an effect keyed on unfold.
- Leaf z-index: existing stack margin rail z-[1] < doc-spine z-[2] < pinned glance z-[3] < mobile bar z-40 < DocSheet z-50 (schedule-rule.tsx:40). Leaf at z-[45]; DocSheet must still win over an open leaf.

## 5. Shelves

- `components/document/shelves/shelf-panel.tsx`: single fixed `<aside role="region">`, left = spine width, 320px, Esc-to-close with precedence BEFORE page.tsx's Esc→put-down (L464-473 has a role="dialog" guard at L468 — extend the guard chain: leaf → dialog → put-down). Focus close button on open; restore to trigger on close. One shelf open at a time.
- Plan room: thin read of PlanRoomBand's data (`usePlanRoom(projectId)`, see not-started-band.tsx:73) + "Open the plan room" link to existing `/doc/[id]/plans` route. No CRUD duplication.
- Spec book: read-only regroup of `useProjectFFEItems` rows by `project_room_id` + link to `/doc/[id]/spec-book`. No new hook.
- Mood boards: MOVE `<ProjectMoodBoards/>` mount from not-started-band.tsx:155 into the leaf. Component transplants whole (it owns its own fold — strip or keep chrome, implementer's call). Before deleting the inline mount, grep designer-portal AND client-portal for `project-mood-boards`, `#project-mood-boards`, `document:new-project-board` (event wiring at not-started-band.tsx:40, 111-128; `#ffe-selection-...` anchors from continueItems L122-159) and re-point: NEW_BOARD_EVENT should now open the shelf.
- Call sheet: shelf row dispatches `document:open-call-sheet` `{detail:{mode:'sheet'}}` (existing wiring page.tsx:1289-1298; roster from `useProjectRoster`, page.tsx:698). Near-zero new code.
- Knowledge: per ruling above.

## 6. Gates (designer-portal is the only portal with working ESLint — these are real signals)

```
pnpm --filter designer-portal type-check
pnpm --filter designer-portal lint
pnpm --filter designer-portal test
pnpm --filter designer-portal build
```
Must-pass tests: `responsive-document-shell.test.tsx` (unmodified), `region/__tests__/use-region-fold.test.tsx` (exercises `region:'schedule'` at L52 — add a parallel case for `'schedule-rule'`). New tests: running index, room lens lift, shelf open/close/Esc/focus-restore, schedule-rule fold + armEdit-while-folded.

## 7. Build order (tree stays green)

1. Foundations: region-anchor lookup, `'schedule-rule'` union member, `room-state.ts` extraction (FFESection output byte-identical).
2. ScheduleRule fold (hardest — armEdit plumbing + glance extraction).
3. RoomLensContext + FF&E lift + letterhead IN HAND line.
4. Mood boards → shelf relocation + NotStartedBand retirement (grep-before-delete).
5. Spine blocks (index/rooms/shelves), ≥1440-gated.
6. Shelf panel + five leaves.
7. Scrollspy (needs real headings mounted).
8. Tests.

## 8. Risks

1. Fold-key collision (mitigated by `'schedule-rule'`).
2. page.tsx is 1300 lines and central — new state as isolated context at top; Esc precedence as explicit early-return chain; don't touch jumpToSection's signature (add a sibling for region jumps).
3. Mood-boards relocation breaks inline-anchor assumptions — grep first (incl. client-portal deep links, help-system DOCUMENT_SURFACE_KEYS).
4. Two schedule sentences drifting (mitigated: thread page.tsx's derivation down).
5. Stale room-lens state below 1440 (letterhead is not width-gated) — reset safeguard.
