# Recon: the production Document surface — for the cinematic-arrival build

Angle: where would a "the paper answers a hand" arrival land on the real
`/doc/[id]` route. Everything below is anchored to files I opened; where I
could not confirm a claim I say so.

## (a) Route, files, server vs client

- Route: `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (3435
  lines, `'use client'` at line 1 — the WHOLE page is a client component, no
  server component in the route tree does data work).
- Route group layout: `apps/designer-portal/src/app/(document)/layout.tsx` —
  no `'use client'` directive (Server Component), but its body is entirely
  `<>`-composed client components (StudioDrawer, CommandBar, MobileBar,
  MobileSheets, DeskWalkthrough, DeskDoorway, etc. — layout.tsx:1–144). It
  mounts the chrome that coexists with an open document: log strip, studio
  drawer, ⌘K command bar, account sheet, invoice overlays, mobile bar/dock/
  sheets, help provider, desk walkthrough. `SkipToPaper` (layout.tsx:71) is
  the first focusable node, ahead of `DocumentRouteBoundary`.
- Sibling routes under the same `[id]` segment (own `layout.tsx`+`page.tsx`,
  so NOT the same tree as `/doc/[id]/page.tsx`): `plans/`, `spec-book/`,
  `boards/` — confirmed via `find` (page.tsx docstring at line 5–10 calls this
  "full bleed (D12): the paper IS the screen").
- `DocumentPage` (page.tsx:899–915) wraps `DocumentPageBody` in
  `RoomLensProvider`, keyed on `id` (`key={id}`, page.tsx:912) — a project-id
  change is a **fresh mount**, not a param-only re-render. This matters for an
  arrival: the arrival's "hold, then fly" state should probably also be
  keyed per-document-id, mirroring this pattern, or it will replay on every
  in-document navigation that doesn't actually change documents.
- The engagement resolution hook is `useDocumentEngagement(id)` from
  `@patina/supabase` (imported page.tsx:51/957) — it can return `{kind:
  'engagement', row}` or `{kind: 'redirect', projectId}` (used at
  page.tsx:1264–1271 to `router.replace` a signed proposal onto its project
  doc). Not confirmed: I did not open the hook's own file (not required by
  the angle; the row shape is `DocumentStateRow`, `lib/document/
  desk-derivation.ts:50`).

## (b) Section/act structure — how it actually renders

**Doctrine mismatch to flag up front:** the mockup's Document (`document.html`)
implies all acts/sections sit on one long assembled page. The real page does
**not** work that way. `SectionKey` (`desk-derivation.ts:41–48`) is:

```
brief | discovery | direction | proposal | project | install | care
```

— seven keys, but **only one renders at a time** (page.tsx:2938 comment:
"The active section — exactly one (§4)"). The doctrine names in the task
(Brief, Discovery, Direction, Agreement, Procurement, Schedule, Install, Care)
map onto these seven as: Agreement → `proposal`; Procurement + Schedule (FF&E,
money, the Rule/schedule instrument) → live **inside** `project`, not as
separate top-level sections. `install` and `care` are their own keys.

- `deriveSections()` (`lib/document/section-derivation.ts:156`, `ORDER` array
  at line 59) is the pure function that turns a `DocumentStateRow` +
  proposal-lineage + schedule facts into the seven `SpineSection` objects
  (`{key, label, state: 'settled'|'active'|'future'|'unrecorded', sub}`) — one
  source shared by the spine rail and the settled bars (file docstring,
  lines 1–8).
- The single active section mounts at `id={sectionAnchorId(row.active_section)}`
  with `data-active-section` (page.tsx:2939–2957). `sectionAnchorId()`
  (`lib/document/section-anchor.ts:11`) returns `` `doc-section-${key}` `` —
  ONE canonical DOM-id scheme the spine, settled bars, and mobile spine sheet
  all address (file docstring: "one source of truth… mirrors the existing
  `doc-room-${id}` convention").
- Settled (past) sections render as `SettledBar` components
  (imported page.tsx:93; `components/document/settled-bar.tsx`, 83 lines —
  not read in full, confirmed only import + existence), which unfold on click
  into the full historical content (page.tsx:1096 "Which settled phase is
  unfolded (R66 review)").
- Inside the **active `project` section**, a fixed mount order composes the
  paper's substance — `PROJECT_PAPER_ORDER` in
  `lib/document/document-index.ts:53–79` is the canonical list, in the actual
  mount order, with a comment enforcing that page.tsx must not drift from it:
  `approvals` → `schedule` → `ffe` (labelled "Pieces") → `money` → `care`
  ("Closing the book") → `record` ("The record"). Each carries its own
  heading id (see (b) DOM ids below).
- Pre-work stops (brief/discovery/direction/proposal/scope/vision/investment)
  are declared beside `PROJECT_PAPER_ORDER` in the same file
  (`document-index.ts`, comment at line ~82 — file continues past what I
  read; not fully enumerated, treat pre-work region list as **not fully
  confirmed** beyond the `DocumentIndexKey` union at lines 18–32).
- Component ownership per act, confirmed via imports at the top of page.tsx:
  - Brief → `BriefSection` (`components/document/brief-section.tsx`,
    imported page.tsx:102) + `BriefRecap` (page.tsx:103).
  - Discovery → `DiscoverySection`
    (`components/document/discovery/discovery-section.tsx`, page.tsx:109) +
    `DiscoveryRecap` (page.tsx:112), `DiscoveryMargin` (page.tsx:113).
  - Direction → drafting state via `useDraftingState` (page.tsx:163,989) —
    the direction/drafting UI itself lives under
    `components/document/drafting/` and `components/document/worktable/`
    (dir listing confirmed; individual component not opened).
  - Proposal/Agreement → `ProposalBlocksReadOnly` (page.tsx:96),
    `ProposalInstruments` (page.tsx:136), `ProposalFolioStrip`/
    `FolioLetterhead` (page.tsx:137), `ProjectApprovalDocumentMount`
    (page.tsx:130, mounted page.tsx:2889–2899 with `quietLeader`, `projectId`,
    `clientProfileId`, `phases`) — this is the client-approval record.
  - Procurement/Schedule (inside `project`) → `ScheduleRuleRegion`
    (page.tsx:128, mounted 2929–2936, "the phase schedule as a horizontal
    instrument… Project-wide, mounted with the AccountBand at the top of the
    project document" per the comment at 2922–2928), `ScheduleSpine`
    (page.tsx:98), `FFESection` (page.tsx:97, the "Pieces" region),
    `RoomFilesSection` (page.tsx:99).
  - Install → `InstallWindowCeremony` (page.tsx:101).
  - Care → `CareBand` + `CloseoutState` (page.tsx:104–107),
    `CareSection`/quiet-sections (page.tsx:108).
  - Money → `MoneyRegion` (page.tsx:123, `components/document/commercial/
    money-region.tsx`).
  - Records/previous work → `PreviousWork` (page.tsx:94).
  - Roster/people → `KickoffBand` (page.tsx:125), `CallSheetMount`
    (page.tsx:133), `HouseholdChip` (page.tsx:135).

## (c) Data hooks per section + "needs you" fields

Top-level reads in `DocumentPageBody` (all from `@patina/supabase` unless
noted), page.tsx:950–1066:

- `useDocumentEngagement(id)` → the row + resolution kind.
- `useProjectV2(projectId)` → `project` (vitals: `target_end_date`,
  `total_amount_cents`, `start_date` — typed narrowly as
  `ProjectVitalsRecord`, page.tsx:251–255, specifically to avoid the `any`
  hole that once let a non-existent `target_completion` column render
  nothing for months — comment at 246–250).
- `useProjectPhases(projectId)` → `phases`.
- `useProjectApprovals(projectId)` → approvals (drafted/unsent count for the
  recap line).
- `useResolvedSchedule(projectId)` → schedule (one derivation feeding the
  letterhead vitals, the Project sub-label, and the Install sub-label —
  comment page.tsx:971–972).
- `useProposal(proposalId)` → `liveProposal`.
- `useDiscovery(...)` → discovery row, gated on `active_section === 'discovery'`
  or (for proposal docs) on the proposal's `designer_client_id` chain
  (page.tsx:978–988).
- `useDraftingState(proposalId, active_section === 'direction')`.
- `useDeskEngagements({enabled: deskEnrichment})` → the Desk-composed
  operational needs for THIS document (`selectOperationalNeedForDocument`,
  `selectOperationalNeedsForDocument`, page.tsx:994–1014). Gated by
  `deskEnrichmentApplies()` (page.tsx:312–319): refuses paused/archived rows
  and only applies when the row carries a `project_id`, or is a
  `proposal`+`proposal_id`, or `lead`+`lead_id`.
- `useProjectContextualHandoffs(projectId)` → gates for the guide's "nearest
  open gate" (page.tsx:1018, `nearestOpenGate(deriveGates(...))`).
- `useProposalFeedback(proposalId)` → per-line client verdicts, rolled up into
  the letterhead's quiet summary ("4 of 12 approved · 1 flagged",
  page.tsx:1062–1080).
- `useProjectFFEItems`, `usePlanRoom`, `useProjectOwnedBoards`,
  `useProjectBoards`, `useProjectInvoices`, `usePurchaseOrders`,
  `useMoneyLadder` — all inside `ProjectTicketFacts` (page.tsx:509–706), gated
  to run ONLY when a project exists; `ProjectlessTicketFacts` (page.tsx:725–
  836) runs the proposal-only equivalents (`useProposalScopeRooms`,
  `useProposalScheduleItems`, `useBoards`) for pre-project papers.

**"Needs you" vocabulary** — `NeedKind` union, `lib/document/
desk-derivation.ts:109` (I read only the stamp-colour map that mirrors it,
`components/document/red-letter-zone.tsx:26–46`, which enumerates all 19
kinds): `overdue_decision`, `overdue_invoice`, `proposal_signed`,
`damage_claim`, `proposal_declined`, `proposal_expired`, `lines_flagged`,
`new_lead`, `ceremony_pending`, `reconnect_due`, `hesitating_proposal`,
`awaiting_inspection`, `schedule_conflict`, `schedule_proposal`, `task_due`,
`schedule_unconfigured`, `po_unsent`, `po_unacknowledged`, `pulse_due`. These
map onto the task's example states as: proposal awaiting approval →
`hesitating_proposal`/`lines_flagged`; overdue client reply →
`overdue_decision`/`reconnect_due`; order/sample in transit →
`po_unacknowledged`/`po_unsent`/`awaiting_inspection`; install date →
`schedule_conflict`/`schedule_proposal`; care note → `pulse_due` (not fully
confirmed — I did not open `care-band.tsx`); discovery essentials missing →
NOT a `NeedKind` at all, it's a separate readiness gate:
`ESSENTIAL_KEYS` = `['scope','budget','timeline','style','lifestyle']`
(`lib/document/discovery-readiness.ts:44`, list body not directly quoted —
confirmed via the array's grep hit and the file's own docstring lines 1–17
naming "the FIVE STRUCTURED ESSENTIALS").

These needs are produced by `rankOperationalNeeds()` (from `@patina/utils`,
page.tsx:82/1027–1033) and turned into `redLetterRows: RedLetterRow[]`
(page.tsx:1770–1788, `RedLetterRow` type at `components/document/
red-letter-zone.tsx`). **Important:** `RedLetterZone` the component
(`red-letter-zone.tsx:86`, has its own test file) is **not directly rendered**
in `page.tsx` — I grepped for `<RedLetterZone` and found no render call. The
rows instead feed `bandNeeds` (page.tsx:2214–2219), which becomes **line 2 of
the `LensBand`** — the single quiet leader sentence at the top of the paper,
not a standalone alert region. `NO_BAND_NEEDS` (page.tsx:409) is the frozen
empty-array sentinel used when nothing stands. This is the closest existing
analog to the mockup's crown/headline concept: **one sentence, cycling
through ranked needs, printed as the lens band's second line** — never a list
of chips.

## (d) Hash navigation / scroll-into-view — NOT hash-based

No `window.location.hash` usage found anywhere in page.tsx (confirmed by
grep — zero hits). Navigation-to-anchor instead runs through:

- **Query params**, read once on mount (`useEffect`, no listener kept open):
  `?ffeItemId=` (page.tsx:1102–1106, sets `requestedFfeItemId`) and
  `?sheet=call` (page.tsx:1236–1239, opens the Call Sheet overlay). These are
  described in-code as "the Call Sheet's ADDRESS" (comment at 1232–1235) —
  i.e. the doctrine calls a query param an "address," not a URL hash.
- **In-memory jump functions**, all funnelling to
  `Element.scrollIntoView({block:'start', behavior: reduceMotion?'auto':
  'smooth'})` with a `prefers-reduced-motion` check inline every time
  (pattern repeats at lines 1176, 1288, 1415, 1466, 1861):
  - `jumpToSection(key, focusId?, activate?)` (page.tsx:1160–1201) — for
    top-level SECTION jumps (spine clicks / settled bars). Opens history
    disclosure if needed, sets `openSection`, then double-`requestAnimation
    Frame`s to `document.getElementById(sectionAnchorId(key))`
    `.scrollIntoView`, then focuses a `focusId` element or
    `[data-settled-heading]` inside the section, and can synthetically
    `.click()` an `aria-expanded` toggle if `activate` is true.
  - `jumpToRegion(key: DocumentIndexKey)` (page.tsx:1837–1844) — for REGION
    jumps inside the active `project` section (approvals/schedule/ffe/money/
    care/record + pre-work stops). Composes `requestRegionUnfold(key)` (from
    `document-index.ts`) + `lens.forceFullThrough(key)` + `scrollToRegion(key,
    projectId)` (from `hooks/use-document-running-index.ts`) — a deliberate
    three-step press order documented at 1831–1836 ("the unfold sets the
    index's 700ms lock; `forceFullThrough` commits every region… so the
    heights exist before `scrollToRegion` reads the target's y two frames
    later").
  - `landOnFfeAnchor(elementId)` / `jumpToLine(lineId)` /
    `jumpToRoom(roomId)` (page.tsx:1853–1886) — land on
    `` `ffe-selection-${lineId}` `` or `` `doc-room-${roomId}` `` (both
    confirmed live in `components/document/ffe-section.tsx:502,672`),
    unfolding the `ffe` region first if the target isn't in the DOM yet, with
    the same two-frame wait pattern.
  - `toTop()` (page.tsx:1409–1420) scrolls/focuses `#document-project-status`
    (the letterhead header, confirmed `id="document-project-status"` at
    `doc-letterhead.tsx:65`) — the household band's "back to top" act.
  - A **live scrollspy**: `useDocumentRunningIndex(regionKeys, projectId)`
    (page.tsx:1823–1829) observes `data-index-region` roots and returns
    `activeKey`/`mountedKeys`, feeding the spine's "you are here" ladder and
    the mobile bar's "AT \<STOP\>" line.

**Implication for the arrival build:** there is no `#anchor` in the URL to
target. An arrival that wants to "land on" a section or region must call
`jumpToSection`/`jumpToRegion`/`landOnFfeAnchor` (or replicate their unfold→
raf→raf→scrollIntoView→focus sequence) rather than relying on the browser's
native hash scroll. Any arrival implementation should also respect the
inline `prefers-reduced-motion` checks these functions already perform.

## (e) Head/nav elements that would need to fade in with an assembly, and R143

- `<header id="document-project-status" tabIndex={-1}>` — the letterhead
  (`doc-letterhead.tsx:65–116`): StrataMark progress glyph (line 67), title
  (`<h1>` or editable `LetterheadTitle`, 76–86), household/subject/vitals
  (89–107), `NeedsSetupChip` (107), and the "instruments" ledger column
  (111–113, only ≥1180px per the CSS grid at line 69).
- `<aside data-document-spine aria-label="Document spine">`
  (`doc-spine.tsx:134–286`) — sticky rail, ≥1180px only
  (`min-[1180px]:block`, line 140; below that it's `hidden` and replaced by a
  bottom sheet per D13, comment lines 8–9). Inside it: the "Put down" link
  (147–156, `href="/desk"`, `aria-label="Put down document"`), the reserved-
  height `data-spine-head` block (163–274: `data-rail-label` household name,
  `data-spine-mark` StrataMark, `data-spine-stage-phrase` + `data-spine-
  stage-count`, and conditionally `data-spine-room-in-hand` / `data-spine-
  release-room` when a room is held), and the `LensLadder` below the rule.
- `ScheduleRuleRegion` (mounted page.tsx:2929–2936) — "Project-wide… mounted
  with the AccountBand at the top of the project document so it reads as a
  project overview above the section work" (comment 2922–2928).

**R143 legibility-at-rest doctrine — not directly located.** I grepped the
opened files for "R143" and found no hit in `page.tsx`, `doc-spine.tsx`, or
`doc-letterhead.tsx`; I did not have budget to grep the whole
`docs/design/the-document/` tree for its definition. **Not confirmed** — the
task references it as an existing doctrine constraint but I cannot cite its
text or which elements it names. Recommend a follow-up grep of
`docs/design/the-document/DECISIONS.md` and `the-document-spec.md` for
"R143" before the arrival's fade choreography is finalized, since an
arrival that visually de-emphasizes the wrong element mid-flight could
violate it sight-unseen.

What IS confirmed as "must stay legible / is deliberately NEVER hidden":
the spine's progress mark is explicitly `INERT` and always visible (doc-
spine.tsx:185–199, "no press, no tooltip, no tabstop… the one ambient move
the system keeps, and it stills under reduce"); the letterhead's `<h1>` is
never truncated, only wrapped (doc-letterhead.tsx comment 70–74, "D-B48… a
starved track stacks it rather than amputating it"); `SkipToPaper` is
"the first focusable node in the tree" unconditionally (layout.tsx:69–71).

## (f) Put-down path back to the Desk

Two confirmed doors, both to `/desk`, both already respecting the
sheet-priority order described as "D1":

1. **Escape key** (page.tsx:1367–1388): global `keydown` listener. Priority
   order, stated in the comment: a sheet (`[role="dialog"]`) is topmost and
   closes itself first (1379); then an open shelf leaf (`openShelf`, 1380,
   "ShelfPanel closes it"); only a bare document is put down. Also guards
   `isEditableTarget(e.target)` (1378, from `hooks/use-lens-state.ts`) so
   Escape while editing a field (e.g. amending the letterhead name) restores
   the field rather than navigating away — the comment cites this exact bug
   ("Escape restored the name and then put the paper down underneath her").
   On an actual put-down it calls `fireZoneFlightIfDue(null)` (an analytics
   signal for "picked up and put down within 10s with no write",
   `lib/document/zone-flight.ts`, page.tsx:1294–1351) then
   `router.push('/desk')`.
2. **Spine link** (`doc-spine.tsx:147–156`): `<Link href="/desk"
   aria-label="Put down document">` with the "←" glyph + "Put down" text
   (hidden below `min-[1180px]`, i.e. only visible on the sticky rail at
   desktop widths).

Not confirmed as a THIRD door: whether the mobile bottom sheet / mobile bar
(`components/document/mobile/mobile-bar.tsx`, imported in layout.tsx:22) also
exposes an explicit "put down" affordance below 1180px — I did not open that
file. Given D13's stated regime (spine hidden below 1180px, replaced by a
sheet), a mobile-width arrival almost certainly needs its own put-down
target; this needs a direct read of `mobile-bar.tsx`/`mobile-sheets.tsx`
before implementation, not assumed from this recon.

## Mockup → real-component vocabulary mapping (best-effort)

| Mockup `data-part` (document.html) | Real DOM / component | File:line |
|---|---|---|
| name (household) | `data-rail-label` in `data-spine-head`; also letterhead `client` node | `doc-spine.tsx:172-183`; `doc-letterhead.tsx:90` |
| stage | `data-spine-stage-phrase` / `stagePhrase.top` | `doc-spine.tsx:210-232` |
| crown / progress glyph | `StrataMark` in `data-spine-mark` (rail) and letterhead (`fill` prop) | `doc-spine.tsx:200-207`; `doc-letterhead.tsx:67` |
| headline (one leading sentence) | `LensBand` line 2, fed by `redLetterRows`/`guideModel.headline` | page.tsx:2214-2242 (`bandNeeds`, `guideHeadline`) |
| f1..f3 (facts strip) | The ticket's rows (`TicketRow[]`) from `deriveTicket()`, and the money ladder's rungs | page.tsx:848-874 (`TicketFacts`), `lib/document/ticket-derivation.ts`, `lib/document/money-ladder.ts` |
| act (nav words: Brief/Discovery/…) | `SpineSection.label` from `deriveSections()`, printed by `DocSpine`/settled bars | `lib/document/section-derivation.ts:69-77,156` |
| sections (the body acts) | The single `data-active-section` mount + its internal regions (`PROJECT_PAPER_ORDER`) | page.tsx:2939; `lib/document/document-index.ts:53-79` |

## Gaps / things this recon could not confirm

- R143's exact text and which elements it protects (grepped only the files
  already open; the doctrine doc itself was not read).
- Full contents of `mobile-bar.tsx`/`mobile-sheets.tsx` (put-down affordance
  below 1180px).
- `care-band.tsx` internals (whether `pulse_due` is really the care-note
  need kind, and the care region's own DOM ids beyond `care-region-heading`).
- `settled-bar.tsx` internals (exact unfold DOM/animation, only its role in
  the page was inferred from callers).
- The pre-work `DocumentIndexKey` region list (`brief/discovery/direction/
  proposal/scope/vision/investment`) — confirmed as a type union, not
  confirmed as to which components mount each region root or their heading
  ids (I read only the `PROJECT_PAPER_ORDER` half of the file).
- `useDocumentEngagement`'s own implementation (row shape confirmed via type
  imports only, not read directly).
