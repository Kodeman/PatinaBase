# G1 — Code anatomy of the document surface

Verified against `main@695addb5f`, read-only. All paths are relative to
`/Users/kody/Code/patina-merged/apps/designer-portal/` unless stated otherwise.
Facts only; every claim carries `file:line`.

Gate note: `grep NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local` is denied by the
sandbox filesystem deny-list (`/Users/kody/Code/patina-merged/**/.env.*`). No database and no
dev server were touched for this deliverable, so the gate's precondition never arose.

---

## 1. Routes

### Route group `(document)` — layout `src/app/(document)/layout.tsx`

The layout wraps every route below in a shell (`layout.tsx:50`) and mounts a fixed set of
always-present chrome (`layout.tsx:49–110`):

| Mounted | File | Line |
|---|---|---|
| `DocumentRouteBoundary` (wraps all) | `src/components/document/document-route-boundary.tsx` | `layout.tsx:49` |
| `DocumentTimeProvider` | `src/hooks/document-time-provider.tsx` | `layout.tsx:53` |
| `MobileShellProvider` | `src/components/document/mobile/mobile-shell.tsx` | `layout.tsx:55` |
| `HelpStateProvider` | `src/components/document/help/help-state-provider.tsx` | `layout.tsx:59` |
| `DocumentHelpProvider` | `src/components/document/help/document-help.tsx` | `layout.tsx:64` |
| `DeskWalkthroughProvider` | `.../help/desk-walkthrough.tsx` | `layout.tsx:66` |
| `{children}` (the route) | — | `layout.tsx:68` |
| `LogStrip` | `src/components/document/log-strip.tsx` | `layout.tsx:69` |
| `StudioDrawer` | `src/components/document/studio-drawer.tsx` | `layout.tsx:70` |
| `RegistryShortcuts` (headless g-chords) | `src/components/document/registry-shortcuts.tsx` | `layout.tsx:73` |
| `CommandBar` (⌘K) | `src/components/document/command-bar.tsx` | `layout.tsx:75` |
| `InterruptionSettings` | `src/components/document/interruption-settings.tsx` | `layout.tsx:77` |
| `AccountSheet` | `.../account/account-sheet.tsx` | `layout.tsx:80` |
| `InvoiceOverlays` | `.../accounts/invoice-overlays.tsx` | `layout.tsx:82` |
| `DraftProposalOverlay` | `.../rooms/drafting/draft-proposal-opener.tsx` | `layout.tsx:84` |
| `MobileActionDock` | `.../mobile/mobile-action-dock.tsx` | `layout.tsx:86` |
| `MobileBar` | `.../mobile/mobile-bar.tsx` | `layout.tsx:87` |
| `MobileSheets` | `.../mobile/mobile-sheets.tsx` | `layout.tsx:88` |
| `FeedbackLayer` | `.../feedback/feedback-layer.tsx` | `layout.tsx:93` |
| `DeskWalkthrough` | `.../help/desk-walkthrough.tsx` | `layout.tsx:96` |
| `DeskDoorway` (`/desk?book=` / `?account=`) | `src/components/document/desk-doorway.tsx` | `layout.tsx:103` |

`metadata.title = 'The Desk · Patina'` (`layout.tsx:26`). The layout's own docstring states:
"no zone nav, no sub-nav, no utility bar" (`layout.tsx:30–31`) and "NO ToastProvider — and never
one … Any `toast()` call reached from this tree no-ops against the context default"
(`layout.tsx:36–41`). Neither a toast provider nor a nav component appears in the imports
(`layout.tsx:1–23`).

| Route | File | Renders | Flag gating |
|---|---|---|---|
| `/desk` | `app/(document)/desk/page.tsx` | `DeskPage` — greeting header, 3 header acts, MarginNote(s), `NeedsYourHandFolios`, `StudioPulse`, `RecentBoardsStrip`, `DeskContents`, `CaptureLeadSheet`, `OpenProjectSheet` | none on the route. `studio-workspaces` gates only `StudioSetupWhisper` (`desk/page.tsx:64, 327`); `call-sheet` only feeds the whisper's step derivation (`desk/page.tsx:69, 75, 82–83`) |
| `/doc/[id]` | `app/(document)/doc/[id]/page.tsx` | `DocumentPage` → `RoomLensProvider` → `DocumentPageBody key={id}` (`page.tsx:254–270`) | none on the route. `worktable` gates the Worktable composition (`page.tsx:280`); `call-sheet` gates the roster read + shelf row (`page.tsx:825, 866, 948`) |
| `/doc/[id]/plans` | `app/(document)/doc/[id]/plans/page.tsx:12` | `<PlanRoomWorkspace routeId={id} />`; layout is a pass-through (`plans/layout.tsx:6` returns `children`) | none |
| `/doc/[id]/spec-book` | `app/(document)/doc/[id]/spec-book/page.tsx:12` | `<SpecBookWorkspace projectId={id} />`; layout pass-through (`spec-book/layout.tsx:6`) | none |
| `/drafting/[proposalId]` | `app/(document)/drafting/[proposalId]/page.tsx:20–25` | `<DraftingRoom proposalId>` + `<DraftingEstimateFlow proposalId>` | none — "Unflagged — it rides the (document) layout" (`page.tsx:11`) |
| `/board/[boardId]` | `app/(document)/board/[boardId]/page.tsx:33` | mood-board room; `board/[boardId]/layout.tsx:2` returns `children` | none |
| `/ceremony/[leadId]` | `app/(document)/ceremony/[leadId]/page.tsx:14–17` | `<CeremonySurface leadId>` | `arrival-arc`, read inside `ceremony-surface.tsx:63` |
| `/compose` | `app/(document)/compose/page.tsx:8–10` | `<ComposingPage />` | none |
| `/library` | `app/(document)/library/page.tsx:13–15` | `<LibraryRoom />` | none |
| `/library/[id]` | `app/(document)/library/[id]/page.tsx:14–17` | `<PieceRoom productId>` | none |
| `/library/judgments` | `app/(document)/library/judgments/page.tsx` | judgments view, `backTo '/library'` (`page.tsx:10`) | none |
| `/people` | `app/(document)/people/page.tsx:12–14` | `<PeopleRoom />` | `call-sheet` inside `people/views/directory-view.tsx:219` and `people/party-profile-sheet.tsx:156` |
| `/rooms` | `app/(document)/rooms/page.tsx:19–21` | `<RoomsIndex />` | none |
| `/room/[id]` | `app/(document)/room/[id]/page.tsx` | `<RoomView>` | `room-file` (`rooms/room-view/room-view.tsx:151`), `room-view-refined-path` (`room-view.tsx:181`) |
| `/room/[id]/file` | `app/(document)/room/[id]/file/page.tsx:26–35` | `<RoomFileView scanId={id} />` | none on the route |

### Route group `(document-help)` — layout `src/app/(document-help)/help/layout.tsx`

Its own paper-styled shell, **not** the `(document)` layout: no drawer, no ⌘K, no mobile bar
(`help/layout.tsx:21–43`). `metadata.title = 'Help · Patina'` (`help/layout.tsx:18`).
Header carries exactly two links: `Help` → `/help` (`help/layout.tsx:26–32`) and
`← The Desk` → `/desk` (`help/layout.tsx:33–37`).

| Route | File | Renders | Flag |
|---|---|---|---|
| `/help` | `app/(document-help)/help/page.tsx:27` | `HelpCenterPage` | none |
| `/help/[surfaceKey]` | `app/(document-help)/help/[surfaceKey]/page.tsx:14–24` | `<HelpArticle>` + `<RelatedArticles>` | none |
| `/help/topic/[prefix]` | `app/(document-help)/help/topic/[prefix]/page.tsx:22–39` | topic list; title from `topicLabelFor(prefix)` (`page.tsx:27`) | none |

---

## 2. Component tree, top → bottom

### `/doc/[id]` at ≥1440

Root grid: `page.tsx:1044–1047` —
`grid-cols-1` / `min-[1180px]:grid-cols-[56px_minmax(0,1fr)]` / `min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px]`,
`data-document-shell`, `data-shell-regime="single-below-1180-compact-to-1439-full-from-1440"`.

| # | Component | File | Mount line | One line |
|---|---|---|---|---|
| 0 | Paper-grain overlay | inline `<div aria-hidden>` | `page.tsx:1050–1057` | 1%-alpha repeating gradient, `pointer-events-none` |
| 1 | `DocSpine` | `components/document/doc-spine.tsx` | `page.tsx:1059–1064` | Grid col 1: Put down link, 7 marks, active line, shelved blocks, timer, presence |
| 1a | `DocSpineShelvedBlocks` (via `shelved` prop) | `components/document/spine-shelved-blocks.tsx` | `page.tsx:938–952` | Running index + Rooms + Shelves; only on a project doc whose `active_section === 'project'` |
| 1b | `FinalizeShelf` (alternative `shelved`) | `components/document/worktable/finalize-shelf.tsx` | `page.tsx:1001–1004` | The client's-copy shelf, Finalize table only |
| 2 | `<main data-document-paper>` | inline | `page.tsx:1070–1075` | `max-w-[1040px]`, `justify-self-center`, `pb-32` |
| 3 | `DocLetterhead` | `components/document/doc-letterhead.tsx` | `page.tsx:1080–1104` | Mark, title (self-save on projects), household chip, vitals, in-hand room, needs-setup chip |
| 3a | `HouseholdChip` | `components/document/household-chip.tsx` | `page.tsx:1091–1099` | "for {Family}" subtitle, opens the household sheet |
| 3b | `LetterheadTitle` / `LetterheadVitals` | `components/document/letterhead-vitals.tsx` | `doc-letterhead.tsx:52, 60` | Blur-save title + Start/Target/Band/Phases row on project docs |
| 3c | `NeedsSetupChip` | `components/document/needs-setup-chip.tsx` | `doc-letterhead.tsx:72` | "Needs setup · N" dashed chip |
| 4 | `RedLetterZone` **or** `DocumentGuide` | `red-letter-zone.tsx` / `document-guide.tsx` | `page.tsx:1111–1118` | Red letter on project docs with a composed Desk answer; otherwise the one-act guide |
| 5 | `LetterheadInstruments` (+ `FolioLetterhead`) | `letterhead-instruments.tsx`, `folio-strip.tsx` | `page.tsx:1134–1151` | Message / Preview as / scan / sharing tier / call sheet; folio disclosure |
| 6 | `MobileMarginChips` | `mobile/mobile-margin-chips.tsx` | `page.tsx:1155–1160` | Letterhead-anchored margin chips (mobile only) |
| 7 | `ProjectApprovalDocumentMount` | `project-approval-document-mount.tsx` | `page.tsx:1162–1171` | The approvals record (`data-index-region="approvals"`) |
| 8 | `ScheduleNavProvider` › `RippleProvider` | `schedule/schedule-nav-context.tsx`, `schedule/schedule-ripple-context.tsx` | `page.tsx:1179, 1193` | Render no DOM |
| 9 | `ScheduleRuleRegion` | `schedule/schedule-rule-region.tsx` | `page.tsx:1201–1208` | The Rule — phase schedule instrument |
| 10 | `<div data-active-section>` | inline | `page.tsx:1211–1229` | The one open section; also the drop target for folio drags |
| 10a | `SectionStageLineMount` | `section-stage-line-mount.tsx` | `page.tsx:1235–1240` | Stage sub-label inside the open section |
| 10b | `TableFrame` | `worktable/table-frame.tsx` | `page.tsx:1241–1247` | Worktable composition (flag `worktable`); pass-through when `composition` is null |
| 10c | `IntakeSpreadHeader` | `worktable/intake-spread-header.tsx` | `page.tsx:1255–1262` | Intake table only |
| 10d | `BriefSection` | `brief-section.tsx` | `page.tsx:1263` | spread = brief |
| 10e | `DiscoverySection` | `discovery/discovery-section.tsx` | `page.tsx:1264–1272` | spread = discovery |
| 10f | Direction/Proposal `<section>` | inline | `page.tsx:1273–1340` | Heading, verdict whisper, `FinalizeHead`, `ProposalInstruments`, `ProposalFolioStrip`, `ProposalBlocksReadOnly`, `OfferFacets` |
| 10g | `ReleaseLift` | `worktable/release-lift.tsx` | `page.tsx:1347` | Delivery/procurement table only |
| 10h | `ScheduleSpine` | `schedule/schedule-spine.tsx` | `page.tsx:1356–1361` | `data-index-region="schedule"` — the schedule ledger |
| 10i | `RoomFilesSection` | `room-file/room-files-section.tsx` | `page.tsx:1367` | Null when no Room-File-bearing scans |
| 10j | `FFESection` | `ffe-section.tsx` | `page.tsx:1368–1384` (project), `1408–1420` (install), `1438–1448` (care) | `data-index-region="ffe"` |
| 10k | `MoneyRegion` | `commercial/money-region.tsx` | `page.tsx:1390–1400` | `data-index-region="money"` |
| 10l | `CareBand` | `care-band.tsx` | `page.tsx:1403`, `1426` | Closing the book |
| 10m | `InstallWindowCeremony` | `schedule/install-window-ceremony.tsx` | `page.tsx:1423` | Install spread only |
| 10n | `CareSection` | `quiet-sections.tsx` | `page.tsx:1431–1436` | Care spread only |
| 11 | `AccountBand` | `account-band.tsx` | `page.tsx:1470–1474` | Only when `spreadSection !== 'project'` |
| 12 | `KickoffBand` | `roster/kickoff-band.tsx` | `page.tsx:1481` | First-staffing nudge |
| 13 | `PreviousWork` › `SettledBar[]` | `previous-work.tsx`, `settled-bar.tsx` | `page.tsx:1489–1560` | The Record, at the foot |
| 14 | `DocColophon` | `doc-colophon.tsx` | `page.tsx:1564–1570` | Studio · hands · Brief a vendor · Hold · Archive · Team… |
| 15 | `ResponsiveMarginRail` › `MarginRail` \| `DiscoveryMargin` | `margin-rail.tsx`, `discovery/discovery-margin.tsx` | `page.tsx:1578–1596` | Grid col 3 at ≥1440; an `inert` sheet 1180–1439 |
| 16 | `DocumentShelves` (project) | `shelves/document-shelves.tsx` | `page.tsx:1613–1622` | The open leaf beside the spine |
| 17 | `DocumentShelves` (proposal/client copy) | same | `page.tsx:1625–1633` | Finalize table only |
| 18 | `CallSheetMount` | `roster/call-sheet-mount.tsx` | `page.tsx:1635–1645` | Overlay, closed by default |

Pre-render states, all replacing the whole tree:
loading (`page.tsx:880–888`), error (`page.tsx:890–910`), missing (`page.tsx:912–926`).

### `/desk`

`<main className="mx-auto w-full max-w-[1120px] …">` (`desk/page.tsx:176`).

| # | Component | File | Line |
|---|---|---|---|
| 1 | `<header>` greeting + date | inline | `desk/page.tsx:177–196` |
| 2 | `DocumentActionGroup` — 3 acts | `document-action.tsx` | `desk/page.tsx:197–234` |
| 3 | Error state (replaces everything below) | inline | `desk/page.tsx:248–274` |
| 4 | `MarginNote` — first-touch | `margin-note.tsx` | `desk/page.tsx:281–293` |
| 5 | `MarginNote` — walkthrough offer | `margin-note.tsx` | `desk/page.tsx:299–320` |
| 6 | `StudioSetupWhisper` | `account/studio-setup-whisper.tsx` | `desk/page.tsx:327–333` |
| 7 | `SectionEyebrow` "Needs your hand" | `section-eyebrow.tsx` | `desk/page.tsx:339–341` |
| 8 | Loading skeleton / empty line / `NeedsYourHandFolios` | `folder-card.tsx` | `desk/page.tsx:343–370` |
| 9 | `StudioPulse` | `studio-pulse.tsx` | `desk/page.tsx:376–380` |
| 10 | `RecentBoardsStrip` | `recent-boards-strip.tsx` | `desk/page.tsx:382` |
| 11 | `DeskContents prominent` (quiet desk) | `desk-contents.tsx` | `desk/page.tsx:386` |
| 12 | `DeskContents` (working desk) | `desk-contents.tsx` | `desk/page.tsx:392` |
| 13 | `CaptureLeadSheet` | `overlays/capture-lead-sheet.tsx` | `desk/page.tsx:398–401` |
| 14 | `OpenProjectSheet` | `overlays/open-project-sheet.tsx` | `desk/page.tsx:404–407` |

The Desk has **no rails**: no spine, no margin. Its only persistent chrome is the layout's
Studio Drawer (≥1180) or Mobile Bar (<1180).

---

## 3. Registries, verbatim

### 3.1 Section `ORDER` — `src/lib/document/section-derivation.ts:59–67`

```ts
const ORDER: SectionKey[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
  'care',
];
```

Labels — `section-derivation.ts:69–77`:
`brief: 'Brief'`, `discovery: 'Discovery'`, `direction: 'Direction'`, `proposal: 'Proposal'`,
`project: 'Project'`, `install: 'Install'`, `care: 'Care'`.

States (`section-derivation.ts:15`): `'settled' | 'active' | 'future' | 'unrecorded'`.
Sub-label strings: `settledSub` (`:87–99`), `activeSub` (`:101–132`), `futureSub` (`:134–153`),
and the literal `'Not recorded'` for unrecorded (`:175`).

### 3.2 Table derivation — `src/lib/document/table-derivation.ts:54–84`

| `activeSection` | table | setting | line |
|---|---|---|---|
| `brief` | `intake` | — | `:56–58` |
| `discovery` | `intake` | — | `:57–58` |
| `direction` | `speccing` | — | `:59–60` |
| `proposal` | `speccing` if `proposalStatus === 'draft'`, else `finalize` | — | `:61–65` |
| `project` | `delivery` | `procurement` | `:66–68` |
| `care` | `delivery` | `procurement` | `:67–68` |
| `install` | `delivery` | `install` | `:69–73` |
| (unreached default) | `intake` | — | `:74–82` |

`TableKey = 'intake' | 'speccing' | 'finalize' | 'delivery'` (`:20`);
`TableSetting = 'procurement' | 'install'` (`:23`).
`tableCompositionKey` = `` `${table}/${section}/${setting ?? '-'}` `` (`:92`).

### 3.3 `ALL_SHELVES` — `src/lib/document/shelves.ts:33–76`

| key | title | eyebrow | kind | subject | flag | width | line |
|---|---|---|---|---|---|---|---|
| `planroom` | `Plan room` | `Plan room · Drawing set` | leaf | project | none | ≥1440 | `:34–40` |
| `specbook` | `Spec book` | `Spec book · By room` | leaf | project | none | ≥1440 | `:41–47` |
| `moodboards` | `Mood boards` | `Mood boards · Shared & draft` | leaf | project | none | ≥1440 | `:48–54` |
| `callsheet` | `Call sheet` | `Call sheet · The roster` | **doorway** | project | `call-sheet` | ≥1440 | `:55–61` |
| `knowledge` | `Knowledge` | `Studio library · Cross-project` | leaf | project | none | ≥1440 | `:62–68` |
| `clientcopy` | `The client’s copy` | `The client’s copy · Live` | leaf | **proposal** | `worktable` (Finalize table) | ≥1440 | `:69–75` |

Filtering: `shelvesFor({subject, callSheetEnabled, clientCopyEnabled})` (`shelves.ts:92–110`) —
subject must match, `callsheet` requires `callSheetEnabled`, `clientcopy` requires
`clientCopyEnabled`. Width: the whole shelves block is `hidden min-[1440px]:block`
(`doc-spine.tsx:135`); the leaf itself is `hidden … min-[1440px]:left-[200px] min-[1440px]:block`
(`shelves/shelf-panel.tsx:94`), 320px wide, `z-[45]`. An open shelf is force-closed below 1440
(`doc/[id]/page.tsx:553–562`).

Events: `CLOSE_SHELF_EVENT = 'document:close-shelf'` (`shelves.ts:127`),
`NEW_BOARD_EVENT = 'document:new-project-board'` (`shelves.ts:137`).

### 3.4 `STUDIO_ROOMS` — `src/lib/document/registry.tsx:77–134`

| key | label | subLabel | route | chord | scope | weight | aliases |
|---|---|---|---|---|---|---|---|
| `library` (`:78–91`) | `Library` | — | `/library` (`studio-drawer.tsx:76`) | `['g','l']` | global | room | library, catalog, pieces, products, shelves |
| `people` (`:92–105`) | `People` | — | `/people` (`studio-drawer.tsx:77`) | `['g','p']` | global | room | people, clients, contacts, vendors, makers, crm, directory |
| `rooms` (`:106–119`) | `The Rooms` | — | `/rooms` (`studio-drawer.tsx:78`) | `['g','r']` | global | room | rooms, scans, room view |
| `drafting-room` (`:120–133`) | `Drafting Room` | `proposal in hand` | `/drafting/{proposalId}` (`command-bar.tsx:374`) | **none** | document | room | drafting, proposal editor, boards, moodboards |

### 3.5 `STUDIO_LEDGERS` — `registry.tsx:152–244`

| key | label | subLabel | destination | chord | scope | weight | aliases |
|---|---|---|---|---|---|---|---|
| `orders` (`:153–175`) | `Orders` | — | Drawer sheet | `['g','o']` | global | sheet | orders, procurement, purchase orders, po, pos, receiving, shipping, schedules |
| `accounts` (`:176–199`) | `Accounts` | — | Drawer sheet | `['g','a']` | global | sheet | accounts, invoices, invoicing, billing, bill, money, receivables, earnings, payments |
| `hours` (`:200–213`) | `Hours` | — | Drawer sheet | `['g','h']` | global | sheet | hours, time, time tracking, timesheet |
| `the-post` (`:214–227`) | `The Post` | — | `openPost()` (`overlays/post-sheet.tsx`) | `['g','t']` | global | sheet | post, inbox, notifications, messages, mail, letters |
| `call-sheet` (`:228–243`) | `Call sheet` | `who is on the job` | `document:open-call-sheet` event | **none** | **document** | sheet | call sheet, roster, crew, team, parties, who |

### 3.6 `STUDIO_VERBS` — `registry.tsx:252–327` (none carries a chord)

| key | label | subLabel | opener | scope | aliases |
|---|---|---|---|---|---|
| `capture-lead` (`:253–265`) | `Capture a lead` | `begin a Brief` | route `/desk` + `openCaptureLead()` (`command-bar.tsx:348–352`) | global | new lead, new client, capture, prospect, intake, brief |
| `open-project` (`:266–278`) | `Open a project` | `no proposal needed` | route `/desk` + `openOpenProject()` (`command-bar.tsx:353–357`) | global | new project, start project, create project, manual project |
| `draft-proposal` (`:279–300`) | `Draft a design agreement` | `for an existing household` | `openDraftProposalPicker()` (`command-bar.tsx:358–359`) | global | proposal, quote, estimate, new proposal, propose, agreement, design agreement, services agreement |
| `draw-invoice` (`:301–313`) | `Draw an invoice` | `milestones · time · FF&E · ad-hoc` | `openInvoiceComposer()` (`command-bar.tsx:360–361`) | global | invoice, invoicing, bill, billing, new invoice |
| `add-maker` (`:314–326`) | `Add a maker` | `a vendor on your roster` | `/people?add=maker` (`command-bar.tsx:362–363`) | global | vendor, maker, supplier, trade, new vendor |

`ALL_STUDIO_SURFACES = [...ROOMS, ...LEDGERS, ...VERBS]` (`registry.tsx:333–337`);
`matchSurfaces(query)` matches label + aliases, case-insensitive substring, empty query → `[]`
(`registry.tsx:344–351`).

### 3.7 `PROJECT_PAPER_ORDER` — `src/lib/document/document-index.ts:34–55`

```ts
export const PROJECT_PAPER_ORDER: readonly ProjectPaperRegion[] = [
  { key: 'approvals', label: 'Client approvals', headingId: () => 'project-approvals-title' },
  { key: 'schedule',  label: 'Schedule',         headingId: () => 'project-schedule-title' },
  { key: 'ffe',       label: 'Project · FF&E',   headingId: (projectId) => `ffe-region-heading-${projectId}` },
  { key: 'money',     label: 'Design authority', headingId: () => 'money-region-heading' },
];
```

`DOCUMENT_INDEX_KEYS` and `DOCUMENT_INDEX_LABELS` are both derived from that one array
(`document-index.ts:58–64`). `UNFOLD_REGION_EVENT = 'document:unfold-region'`
(`document-index.ts:86`). The values printed against each label are composed in
`spine-shelved-blocks.tsx:103–116`.

---

## 4. Guide copy, verbatim

Source: `src/lib/document/document-guide.ts`. `stageCopy` — `:91–141`.

| stage | state | eyebrow | headline | reason | action label → destination |
|---|---|---|---|---|---|
| `brief` (`:92–98`) | `actionable` | `Brief · decide the fit` | `Review the inquiry` | `Choose whether to accept, nurture, or pass so the relationship has a clear next move.` | `Review the brief` → anchor `brief` |
| `discovery` (`:99–105`) | `needs_input` | `Discovery · shape the brief` | `Complete Discovery` | `Capture the essential scope, budget, timing, style, and lifestyle inputs before shaping direction.` | `Continue Discovery` → anchor `discovery` |
| `direction` (`:106–112`) | `actionable` | `Direction · compose the offer` | `Shape the direction` | `Turn the agreed discovery into scope, fees, terms, and a visual point of view.` | `Open Drafting Room` → anchor `direction` (re-pointed to `href: /drafting/{proposal_id}` at `:389–392` when the row carries one) |
| `proposal` (`:113–119`) | `waiting` | `Proposal · in the client’s hands` | `Follow up on the proposal` | `Review its current state and use the existing proposal controls for the next client touch.` | `Review proposal` → anchor `proposal` |
| `project` (`:120–126`) | `on_track` | `Project · active work` | `Move the project forward` | `Start with the schedule and the active work that needs a decision, release, or follow-through.` | `Review active work` → anchor `project` |
| `install` (`:127–133`) | `actionable` | `Install · finish in the field` | `Complete the installation` | `Work through arrivals, inspections, installation details, and closeout items in the schedule.` | `Review installation` → anchor `install` |
| `care` (`:134–140`) | `actionable` | `Care · close the loop` | `Close out the project` | `Resolve the remaining care items, hand off the finished work, and close the book.` | `Review closeout` → anchor `care` |

### Meta states

**`unavailable`** — `deriveDocumentGuide` `:327–339`. eyebrow `Next up`,
headline `Guidance is unavailable`. Reason forks on `retryAvailable`:
- retryable: `Try again before acting so missing data is never mistaken for an empty section.`
- not retryable: `Part of this document could not be read, so nothing is claimed here. Work from the sections below rather than reading this space as an empty one.`

Action: `Try again` → `{kind:'retry'}` when retryable, else `null` (`:335–337`).

**`paused`** — `:340–349`. eyebrow `` `${stageCopy[stage].eyebrow} · paused` ``, headline
`This project is paused`, reason `Review the project status before resuming lifecycle work.`,
action `Review project status` → anchor `{section: stage, focusId: 'document-project-status'}`.

Other states composed at runtime:
- **gate** (`gateGuide`, `:178–202`): state `waiting` when `gate.act?.kind === 'nudge'`, else
  `actionable`; eyebrow `` `${stageLabel} · gate` `` or `` `${stageCopy[stage].eyebrow} · gate` ``;
  headline `gateSentence(gate)`; reason `gate.provenance`; action `gateActionLabel(gate)` → anchor
  `{section: stage, focusId: handoffAnchorId(gate.sourceId)}`.
- **needs attention** (`:374–381`): eyebrow `` `${stageCopy[stage].eyebrow} · needs attention` ``,
  headline `need.text`, reason `This action comes from the operational signals available on the
  current document.`, action from `needGuideAction` (`:208–245`; default label `Review now`).
- **proposal lifecycle** (`proposalGuide`, `:247–314`): eight branches, all with eyebrow prefix
  `Proposal ·`:

| state | eyebrow | headline | action label | line |
|---|---|---|---|---|
| `draft` | `Proposal · in the studio` | `Finish the design agreement` / `Finish the proposal` | `Open Drafting Room` → `/drafting/{id}`, else `Review signing controls` | `:261–270` |
| `client_signed` | `Proposal · client signed` | `Countersign the design agreement` | `Review countersign controls` | `:271–278` |
| `executed` | `Proposal · executed` | `Open the authorized project` / `Review the executed agreement` | `Open the project` → `/doc/{projectId}`, else `Review signing controls` | `:279–290` |
| `accepted` | `Proposal · signed` | `The client has signed` | `Review signing controls` | `:291–298` |
| `declined`/`expired`/`superseded`/`revised` | `` `Proposal · ${outcome}` `` | `Follow up on the expired proposal` / `Follow up on the proposal` | `Review follow-up controls` | `:299–307` |
| fallthrough | `Proposal · with the client` | `Wait for the client’s signature` | `Review signing controls` | `:308–313` |

- **needs_input override** (`withInputs`, `:143–170`): when state is `needs_input` and the first
  input fact carries a `focusId`, the action becomes `` `Add ${firstInput.label}` `` → anchor
  `{section: stage, focusId, activate: true}` (`:150–163`).

### Precedence, in order — `deriveDocumentGuide` `:316–397`

1. `availability === 'unavailable'` → unavailable model (`:327`)
2. `row.is_paused` → paused model (`:340`)
3. `gate` truthy → `gateGuide` (`:362–364`)
4. `need && !proposalLifecycleNeed` → needs-attention model (`:374–381`); `proposalLifecycleNeed`
   defined at `:367–373`
5. `stage === 'proposal'` → `proposalGuide` (`:383–386`)
6. otherwise → `stageCopy[stage]`, with the direction→drafting href swap (`:388–397`)

### RedLetterZone trigger

Rendered instead of `DocumentGuide` when **all three** hold (`doc/[id]/page.tsx:1111–1118`):
`row.engagement_kind === 'project'` **and** `enrichedOperationalNeeds` is not `undefined`
**and** `!deskGuidanceFailed`. `enrichedOperationalNeeds` is `undefined` unless
`deskEnrichmentApplies(row)` (`page.tsx:777–779`, predicate at `:214–221`).
`deskGuidanceFailed = deskEnrichment && enrichedOperationalQuery.isError` (`page.tsx:725`).
The component itself returns `null` when `rows.length === 0` (`red-letter-zone.tsx:25`), so a
project with a composed-but-empty need list prints neither zone nor guide.
Rows are built at `page.tsx:780–795`.

---

## 5. Width regime

Two declared regime attributes:
- `data-shell-regime="single-below-1180-compact-to-1439-full-from-1440"` on the document shell
  (`doc/[id]/page.tsx:1046`)
- `data-spine-regime="sheet-below-1180-compact-to-1439-full-from-1440"` on the spine
  (`doc-spine.tsx:40`)

| | **< 1180** | **1180 – 1439** | **≥ 1440** |
|---|---|---|---|
| Grid | `grid-cols-1`, `[grid-template-rows:auto_1fr]` (`page.tsx:1047`) | `grid-cols-[56px_minmax(0,1fr)]` (`page.tsx:1047`) | `grid-cols-[200px_minmax(0,1fr)_232px]` (`page.tsx:1047`) |
| Spine | `hidden` — the mobile spine sheet is the index (`doc-spine.tsx:43`) | Sticky, `h-screen`, `w-full`, `px-1.5 pt-4` — marks stack vertically (`doc-spine.tsx:43, 63`) | `w-auto px-4 pt-6`; marks travel in **one row** (`min-[1440px]:flex-row`, `doc-spine.tsx:63`), per-mark text drops out, active phase's line prints once below (`doc-spine.tsx:122–130`) |
| Put-down link | — | Arrow glyph only (`min-[1440px]:inline` on the word, `doc-spine.tsx:52`) | `← Put down` with the word (`doc-spine.tsx:48–54`) |
| Shelved blocks (index/rooms/shelves) | — | `hidden` (`doc-spine.tsx:135`) | Mounted (`doc-spine.tsx:135`) |
| Shelf leaf | — | Not rendered; an open shelf is force-closed (`page.tsx:553–562`) | 320px `aside`, `left-[200px]`, `z-[45]` (`shelf-panel.tsx:94`) |
| Spine timer | — | `CompactSpineTimerDoorway`: `min-[1180px]:flex min-[1440px]:hidden` (`spine-timer.tsx:61`) — a readout that opens the shared timer sheet | `SpineTimer` full controls, inside `hidden min-[1440px]:block` (`doc-spine.tsx:139–141`) |
| Presence line | — | — | `Just you · visible to the studio` / `You and …` (`doc-spine.tsx:144–147`) |
| Margin rail | Hidden; replaced by `MobileMarginChips` + the spine sheet's "In the margin · N" | **Closed `inert` sheet**: a `Margin ←` trigger tab (`margin-rail.tsx:228–234`, `min-[1180px]:inline-flex min-[1440px]:hidden`), opening a fixed 360px modal `aside` with a sticky `In the margin` / `Close` header (`margin-rail.tsx:264–283`); focus-trapped, body-scroll-locked (`:206–218`) | Sticky rail in grid col 3, `min-[1440px]:sticky min-[1440px]:col-start-3`, permanently visible, header row hidden (`margin-rail.tsx:258, 264`) |
| Studio Drawer | `hidden` (`studio-drawer.tsx:277`) | 60px fixed strip (`studio-drawer.tsx:277`) | same |
| Mobile bar | Mounted, `min-[1180px]:hidden` (`mobile-bar.tsx:156`) | Hidden | Hidden |
| Mobile sheets | `min-[1180px]:hidden` (`mobile-sheets.tsx:257`); auto-close above `max-width:1179px` (`:345`) | Only the **timer** sheet survives (`through-1439`, `min-[1440px]:hidden`, `mobile-sheets.tsx:254–257`; regime query `max-width:1439px`, `:345`) | All closed |
| Guide action button | `hidden` (`document-guide.tsx:92`) — the act moves to the mobile dock via `useMobilePrimaryAction` (`:52–64`) | Visible (`min-[1180px]:block`) | Visible |
| Main measure | `px-7` | `min-[1180px]:px-10` | `min-[1440px]:px-12`; `max-w-[1040px]` throughout (`page.tsx:1074`) |

**The mobile bar (<1180), left→right** (`mobile-bar.tsx:151–341`):
- Left third: strata glyph + eyebrow `In this document` (in a doc) or `In the studio` (elsewhere)
  + the context word — the active section's label, or `Document`, or a surface name from
  `surfaceLabel()` (`:42–51`): `The Desk`, `The Library`, `The People Room`, `The Rooms`,
  `Drafting`, `Composing`, `The Studio`. In a document it is a button opening the spine sheet
  (`:158–174`); elsewhere it is inert (`:176–187`).
- Centre: the registered mobile primary action (`:190–205`), else the time glance — eyebrow
  `In hand` (running) / `Today`, value = elapsed, or today's minutes, or `Hands free` (`:207–219`).
- Right: `More` (`:222–235`) opening a menu (`:237–339`) that lists secondary actions, then
  `Time in hand` + `{elapsed} · review or adjust`, then `The Post` (+ `{n} new`),
  then `Studio books`, then `Leave a note` (+ `Shipped`).
- The whole bar returns `null` while a time-log offer is on screen (`mobile-bar.tsx:120`).

---

## 6. LABEL INVENTORY

### 6.1 `/desk`

| String | File:line |
|---|---|
| `Good morning` / `Good afternoon` / `Good evening` / `Hello` | `desk/page.tsx:150–156` |
| `{greeting}, {firstName}` or `{greeting}.` | `desk/page.tsx:182–191` |
| Date line, e.g. `MONDAY · AUGUST 25` (uppercased) | `desk/page.tsx:157–162, 193–195` |
| `Capture a lead` (primary, leading `＋`) | `desk/page.tsx:202–210` |
| `Open a project` (secondary, leading `＋`) | `desk/page.tsx:213–220` |
| `Find anything` (tertiary) + `⌘K` kbd | `desk/page.tsx:221–233, 227–229` |
| `Desk actions` (group aria-label) | `desk/page.tsx:200` |
| `The desk could not be read.` | `desk/page.tsx:253–255` |
| `Something interrupted the read — often a session that needs refreshing. Try again, or reload the page.` | `desk/page.tsx:256–259` |
| `Try again` (error recovery) | `desk/page.tsx:266–272` |
| `Desk recovery` (group aria-label) | `desk/page.tsx:264` |
| `This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds anything by name — try “invoice”.` | `desk/page.tsx:287–292` |
| `New desk, same studio — your projects are all here as documents now.` | `desk/page.tsx:305–306` |
| `The walkthrough is six quick stops` (inline button) | `desk/page.tsx:316` |
| `if you'd like the lay of it.` | `desk/page.tsx:318` |
| `Appears once · Recedes on use` (MarginNote default caption) | `margin-note.tsx:98` |
| `Dismiss note` | `margin-note.tsx:183` |
| `Finish setting up` | `account/studio-setup-whisper.tsx:42` |
| `Needs your hand` (eyebrow + count) | `desk/page.tsx:340`, `section-eyebrow.tsx:17–29` |
| `Nothing needs your hand. The work is in motion.` | `desk/page.tsx:364` |
| `All {n} folios in reach` / `{4} in reach · {n} folded below[ · {n} time-sensitive]` | `folder-card.tsx:104–110` |
| `Fold to four` / `Reveal {n} more folio(s)` | `folder-card.tsx:132–134` |
| `Needs your hand display` (group aria-label) | `folder-card.tsx:115` |
| Folder tab `{Family} · {Section}` | `folder-card.tsx:154, 259` |
| Folder title (`row.title`) | `folder-card.tsx:270–272` |
| Stage line `{Section} · {Phase}` | `folder-card.tsx:153, 273` |
| Need text + stamp chip | `folder-card.tsx:283–284` |
| Need action label (ledger form, e.g. `Send reminder`) | `folder-card.tsx:334–336` |
| Section labels: `Brief`/`Discovery`/`Direction`/`Proposal`/`Project`/`Install`/`Care` | `folder-card.tsx:25–31` |
| `Studio pulse` (eyebrow) | `studio-pulse.tsx:111` |
| `Reading studio activity…` / pulse preview sentence | `studio-pulse.tsx:99–101` |
| `Field quiet`, `No secondary work needs attention · Field quiet` | `studio-pulse.tsx:60, 69` |
| `Reading count` / `{n} known item(s)` / `{n} studio item(s)` | `studio-pulse.tsx:94–98` |
| `Open pulse` / `Fold pulse` | `studio-pulse.tsx:156` |
| `Studio pulse display` / `Studio pulse details` (aria) | `studio-pulse.tsx:142, 165` |
| `Part of the studio pulse could not be read. The work shown below is the activity still available.` | `studio-pulse.tsx:222–223` |
| `In motion` (eyebrow + count) | `studio-pulse.tsx:232` |
| `Recent boards` (eyebrow) | `recent-boards-strip.tsx:26` |
| `The Studio` (contents eyebrow) | `desk-contents.tsx:183` |
| `Rooms` / `Ledgers` / `Begin` (column heads) | `desk-contents.tsx:188, 204, 220` |
| `Library`, `People`, `The Rooms` rows + `↗` glyph | `desk-contents.tsx:190–199, 112` |
| `Orders`, `Accounts`, `Hours`, `The Post` rows + `Sheet` tag | `desk-contents.tsx:206–215, 121` |
| `Open a project`, `Draft a design agreement`, `Draw an invoice`, `Add a maker` (Begin; `capture-lead` excluded) | `desk-contents.tsx:225–236` |
| Account nameplate: `{name}` / `{email}` / `Account`; aria `Account and settings` | `account/account-nameplate.tsx:47, 66` |

### 6.2 `/doc/[id]` at ≥1440 — the spine

| String | File:line |
|---|---|
| `Document spine` (aria-label) | `doc-spine.tsx:39` |
| `Put down document` (aria-label) | `doc-spine.tsx:48` |
| `← Put down` | `doc-spine.tsx:50–54` |
| Active-mark label `{Label} — {sub}` | `doc-spine.tsx:74–75, 84–85` |
| Inert-mark aria `{Label}: {sub}` | `doc-spine.tsx:98` |
| `Jump to {Label}` (title) / `Jump to {Label}: {sub}` (aria) | `doc-spine.tsx:109–110` |
| Active section label + sub, printed once | `doc-spine.tsx:124–128` |
| `Just you · visible to the studio` | `doc-spine.tsx:146` |
| `You and {names}` | `doc-spine.tsx:147` |
| **Running index** heading `In this document` | `spine-running-index.tsx:67` |
| Running-index rows: `Client approvals`, `Schedule`, `Project · FF&E`, `Design authority` | `document-index.ts:34–55`, rendered `spine-running-index.tsx:102` |
| Schedule value = `positionText` or `Not scheduled` | `doc/[id]/page.tsx:941` |
| Approvals value = `Reading…` or `{n} in the log` | `doc/[id]/page.tsx:942–946` |
| FF&E value = `{n} piece(s) · {n} room(s)` | `spine-shelved-blocks.tsx:106–108` |
| Money value = `Reading…` / `Authority unread` / `{$} authorized` / `No authority yet` | `spine-shelved-blocks.tsx:109–115` |
| **Rooms block** heading `Rooms` | `spine-rooms-block.tsx:36` |
| Room row: name + state word, `In hand · ` prefix when held | `spine-rooms-block.tsx:60, 69–72` |
| `Take a room in hand · nothing hides` | `spine-rooms-block.tsx:79` |
| **Shelves block** heading `The shelves` | `spine-shelves-block.tsx:45` |
| Shelf titles: `Plan room`, `Spec book`, `Mood boards`, `Call sheet`, `Knowledge`, `The client’s copy` | `shelves.ts:36, 43, 50, 57, 64, 71` |
| Shelf statuses: `Nothing filed` / `{n} sheet(s)`; `Nothing specified` / `{n} specified · by room`; `No boards yet` / `{n} board(s)`; `Nobody on it yet` / `{n} on the roster`; `Studio library`; `As sent · live` | `spine-shelved-blocks.tsx:129–150` |
| Shelf row trailing glyph `→` | `spine-shelves-block.tsx:99` |
| **Timer** `In hand[ · paused]`, elapsed, `Pause`, `Resume`, `+ Log`, `Minutes`, `Activity`, `Add entry`, `Adding…` | `spine-timer.tsx:138, 141, 146, 151, 161, 169–170, 179, 203, 200` |

### 6.3 `/doc/[id]` — the paper

**Letterhead**
| String | File:line |
|---|---|
| `Document progress` (mark aria) | `doc-letterhead.tsx:49` |
| Title (`row.title`), self-save on projects; aria `Project title` | `doc-letterhead.tsx:52–56`, `letterhead-vitals.tsx:494` |
| `for {Family} ↗` | `household-chip.tsx:47–56` |
| `No client linked — attach one ↗` | `household-chip.tsx:57–65` |
| `View or change the client this document is for` (aria) | `household-chip.tsx:43` |
| Vitals string (project): `{Phase} · Target {Month YYYY} · {$}` | `doc/[id]/page.tsx:188–205, 232–242` |
| Vitals variants: `Target ~{month}`, `Target band · {month}` | `doc/[id]/page.tsx:199–203` |
| Vitals (proposal): `{$} proposed` | `doc/[id]/page.tsx:244` |
| Vitals (lead): `{client} · New inquiry` | `doc/[id]/page.tsx:249` |
| Vitals (relationship): `{client} · In discovery` | `doc/[id]/page.tsx:251` |
| `Start` / `Target` field labels, `—` when unset, `×` clear, `Clear start`/`Clear target` (aria) | `letterhead-vitals.tsx:167–190, 402, 408` |
| `Set a budget band` | `letterhead-vitals.tsx:416` |
| `Band` `$` `from` – `to`; aria `Budget band minimum (dollars)` / `…maximum…` | `letterhead-vitals.tsx:420–439` |
| `Phases ▸` / `Phases ▾` | `letterhead-vitals.tsx:451` |
| `est` (phase estimate placeholder) | `letterhead-vitals.tsx:326` |
| `Could not save just now.` / `couldn't save` | `letterhead-vitals.tsx:79, 98` |
| `In hand · {Room}` | `doc-letterhead.tsx:69` |
| `Needs setup · {n} →` | `needs-setup-chip.tsx:47` |

**Letterhead instruments**
| String | File:line |
|---|---|
| `Document letterhead actions` (group aria) | `letterhead-instruments.tsx:321` |
| `Message {Family}` | `letterhead-instruments.tsx:329` |
| `Preview as {Family}` | `letterhead-instruments.tsx:338` |
| `Your scan` / `The scan` | `letterhead-instruments.tsx:351` |
| `Call sheet · {n}` (+ terracotta suffix) | `letterhead-instruments.tsx:462` |
| Sharing tiers: `Full access` / `They see daily progress, every update, photos as they happen.`; `Milestones` / `Phase-end updates and major decisions only.`; `Curated` / `You publish specific updates; the reveal comes at completion.` | `letterhead-instruments.tsx:48–59` |
| `The Pulse handles Fridays; this is for now. It lands in {client}'s portal messages.` | `letterhead-instruments.tsx:368–370` |
| `A quick note to {client}…` (placeholder) | `letterhead-instruments.tsx:377` |
| `Send` / `Sending…` / `Cancel` | `letterhead-instruments.tsx:398, 391, 405` |
| `Could not change the tier. Try again.` | `letterhead-instruments.tsx:495` |
| Folio letterhead: `The folio · {n} file(s) ↑/↓` | `folio-strip.tsx:388–389` |
| Folio groups: `On the lines`, `The letterhead`, section labels | `folio-strip.tsx:369–374, 32–38` |
| Folio strip: `Folio[ · n]`, `+ File`, `Drop to clip it here`, `Clipping…` | `folio-strip.tsx:206–207, 231, 229` |
| File chip titles: `Shared — the client mirror renders this file` / `Studio only — click to share with the client`; `Superseded {date}`; `Slide versions back` / `Slide older versions out` | `folio-strip.tsx:104–106, 123, 85` |

**Guide / red letter**
| String | File:line |
|---|---|
| Eyebrow / headline / reason / action — see §4 | `document-guide.ts:91–141` |
| `Input needed · {label}` · `{owner} · blocks {blocks}[ · +{n} more]` | `document-guide.tsx:83–86` |
| `Next up: {headline}` (sr-only live region) | `document-guide.tsx:121` |
| `Needs attention` (region aria-label) | `red-letter-zone.tsx:29` |
| `Needs attention · in one place` | `red-letter-zone.tsx:33` |
| `Needs attention actions` (group aria) | `red-letter-zone.tsx:41` |
| Row text = `need.text`; row act = `need.actionLabel` (default `Review now`) | `red-letter-zone.tsx:57, 68`; `document-guide.ts:242` |

**Region heads (name · status · ledger)**
| Region | Name | Eyebrow | Status | Ledger, in order | File:line |
|---|---|---|---|---|---|
| Approvals | `Client approvals` | `Exact artifact · named authority` | `{n} awaiting decision · {lead}` or `{n} decided · {lead}` (`no decision lead` when absent) | `New approval` / `Close draft`, or `Assign project client`, or `Assign current project client` (+ `Assigning…`) | `approvals/project-approval-document.tsx:591–601, 492–495, 503–525` |
| Schedule (Rule) | `Schedule` | — | `scheduleRuleSummary` — `Phase dates`, else `{position} · Install {Month YYYY}` / `Install ~{Month YYYY}` | `Adjust dates` (only with an active phase) | `schedule/schedule-rule-region.tsx:201–210`; ledger `:153–160`; summary `doc/[id]/page.tsx:672–682` |
| Schedule (Spine) | `Schedule` | — | `scheduleStatus` | `scheduleLedger` | `schedule/schedule-spine.tsx:1070–1088`; status `:778`, ledger `:785` |
| FF&E | `Project · FF&E` | — | `{n} group(s) · {n} lines[ · {n} awaiting authorization]` | `Release for authorization` **or** `Add to project` (leader), then the other, then `Bill {n} uninvoiced`, then `Spec book →` | `ffe-section.tsx:1116–1125, 971–975, 977–1021` |
| Money | `Design authority` | `Money · one region` | `headStatus` | `Draw an invoice`, `Amendment` / `Add a change`, `Hours · this project ↗` | `commercial/money-region.tsx:295–305, 232–236` (status), `245–273` (ledger) |
| Care | `Closing the book` | `Care · closing the book` | `**Everything is settled** — close the book when you're ready` or `**{done} of {n} closed out** · the checklist settles this project` | `Close the book` (+ `Closing…`) | `care-band.tsx:293–315, 275–284` |
| — all heads | | | | `Fold ↑` toggle | `region/region-head.tsx:146` |

**Seams (folded regions)** — `region/fold-seam.tsx:41–65`: name (Playfair italic), summary
(truncated DM-mono), and the literal `unfold ↓` (`:62`). Money seam name `Design authority`
(`money-region.tsx:282`); FF&E seam name `Project · FF&E` with summary
`{n} group(s) · no lines yet` when empty (`ffe-section.tsx:1108–1109, 974–975`); Schedule seam
name `Schedule` (`schedule-spine.tsx:1070`).

**Money region rows** — `commercial/money-region.tsx:308–336`
| Row | Meaning line | Line |
|---|---|---|
| `Authority` | `What the client has agreed to fund` | `:309–313` |
| `Plan` | `What the plan intends to spend` | `:314` |
| `Committed` | `What is contractually owed` | `:315–319` |
| `Moved` | `The accounts' committed figure — client value of lines at ordered and later; not funds disbursed` | `:320–324` |
| Explainer | `Authority → plan → committed → moved. Moved is the accounts' committed figure — the client value of schedule lines at ordered, in production, shipped, delivered or installed — not funds disbursed, and not the contractually owed total above it.` + `{n} trade scope(s) still in draft, counted in neither.` + `Absorbs today's four separate bands: design authority, working budget, authorizations & trade scopes, the accounts.` | `:327–336` |

**FF&E region body**
| String | File:line |
|---|---|
| `Release readiness could not be read, so no line can be released yet.` | `ffe-section.tsx:1138–1140` |
| `Checking readiness` | `ffe-section.tsx:1154` |
| `No lines are currently eligible for release.` | `ffe-section.tsx:1169–1171` |
| `Tick the lines the client is being asked to authorize. Prices lock when you release.` | `ffe-section.tsx:1175–1178` |
| `Reading the schedule` | `ffe-section.tsx:1203` |
| `The FF&E schedule could not be read.` + `Try again` | `ffe-section.tsx:1207–1218` |
| `Build the FF&E schedule` / `Add the pieces and allowances the studio will specify, price, authorize, procure, and install.` / inputs `Room`, `Piece or allowance`, `Budget` / act `Open the spec book` | `ffe-section.tsx:1224–1228` |

**Approvals region body**
| String | File:line |
|---|---|
| `Bind each request to one issued plan, client-ready specification, or published budget checkpoint. Discussion stays in the project thread; only the recorded outcome settles an approval.` | `project-approval-document.tsx:603–607` |
| `Add the project client before assigning decision authority.` | `:610–612` |
| `This project does not have a designated decision lead yet.` | `:616–618` |
| `Decision authority does not match this project's current client.` | `:623–628` |
| `Add or reopen a project phase before authoring a new approval. Completed phases cannot receive a new unresolved blocker.` | `:633–636` |

**Care band body**
`Operational closeout still open` (`care-band.tsx:327–329`), blocker list items (`:332`).

**Kickoff band**
`– You're on the call sheet as lead. Who else is on the job?` (`roster/kickoff-band.tsx:81–83`);
`{n} on the call sheet` (`:86`); acts `From the rolodex` (`:100`), `New person` (`:107`),
`Later` (`:117`); group aria `Add to the call sheet` (`:93`).

**Direction/Proposal spread**
`Direction` / `Proposal` heading + `· v{n}` (`page.tsx:1277–1280`); the section's sub on the right
(`page.tsx:1281–1283`); verdict whisper (`page.tsx:1293–1295`);
`Read-only preview · edit in the Drafting Room` (`page.tsx:1321–1323`).

**The Record**
`Previous work · {n} complete` + `+`/`−` (`previous-work.tsx:45–46`);
`Client approvals · {n} awaiting publish →` (`previous-work.tsx:56`);
`Previous work` (section aria, `:37`).
Settled bars: name = section label, or `Proposal · v{n}` (`page.tsx:1548–1550`);
hint = the section's `sub` (`page.tsx:1551`); `fold ↑` / `unfold ↓` (`settled-bar.tsx:42`);
stamps `Signed · {date}` (`page.tsx:1507`) and `Approved[ · {date}]` (`page.tsx:1510`);
unfold footer `Signed by {name} · {date}` / `Signed · {date}` (`page.tsx:1537`).

**Colophon** — `doc-colophon.tsx`
`{studio name}` or `The studio` (`:105`); `hands on the work: you[ · names]` (`:97, 108`);
acts `Brief a vendor` (`:123`), `Hold` / `Resume` (+ `Holding…` / `Resuming…`) (`:134, 140`),
`Archive` (`:150`), `Team…` (`:164`); group aria `Document colophon actions` (`:116`);
confirm pane `The document goes to the cabinet — find it any time in ⌘K.` (`:172`),
`Archive it` (`:189`, + `Archiving…` `:186`), `Keep it out` (`:196`);
row aria `Archive confirmation` (`:178`).

**Page-level states**
`Picking up…` (`page.tsx:884`);
`This document could not be picked up.` + `Try again` + `Back to the desk` (`page.tsx:893–906`);
`No document answers to this name.` + `← Back to the desk` (`page.tsx:915–922`).

### 6.4 `/doc/[id]` — the margin rail (≥1440)

| String | File:line |
|---|---|
| `Margin` (1180–1439 trigger tab) + `←` | `margin-rail.tsx:231–234` |
| `In the margin` (sheet header, <1440) | `margin-rail.tsx:269` |
| `Close` / `Close margin` (aria) | `margin-rail.tsx:275, 280` |
| `Margin` (rail aria-label at ≥1440) | `margin-rail.tsx:252` |
| `In the margin` (rail heading) | `margin-rail.tsx:490` |
| `+ Decision` | `margin-rail.tsx:503` |
| `+ Note` | `margin-rail.tsx:511` |
| `Margin capture actions` (group aria) | `margin-rail.tsx:496` |
| `Drafts · {n} ↑/↓` | `margin-rail.tsx:530` |
| `Untitled draft`, `edit` | `margin-rail.tsx:550, 553` |
| `Note on this line…` / `Note to the margin…` (placeholder) | `margin-rail.tsx:570` |
| `Note body` (aria), `Note due date (optional)` (aria) | `margin-rail.tsx:572, 587` |
| `Save` / `Saving…` / `Discard` | `margin-rail.tsx:600, 597, 610` |
| `Margin note actions` (row aria) | `margin-rail.tsx:585` |
| `The margin — decisions, messages, and money gather here` (empty) | `margin-rail.tsx:631` |
| `Settled · {n} ↑/↓` | `margin-rail.tsx:648` |
| `New decision` / `Edit draft` (composer sheet title) | `margin-rail.tsx:660` |
| `The margin on the right is where decisions and money gather. Esc puts the document down — and the hours log themselves while it's in your hand.` | `margin-rail.tsx:464–467` |
| `{actor} changed {file}.` + `{project} · {date}` caption | `margin-rail.tsx:478–486` |

### 6.5 Studio Drawer strip (≥1180) — `components/document/studio-drawer.tsx`

| String | Line |
|---|---|
| `Studio drawer` (nav aria-label) | `:275` |
| `Patina` (wordmark → `/desk`) | `:285` |
| Breadcrumb: `Library`, `People`, `Rooms`, `Drafting`, `Document` (none on `/desk`) | `:115–125, 293` |
| Room doors: `Library`, `People`, `The Rooms` | `:331` from `registry.tsx:81, 95, 109` |
| `Studio books` + `↑`/`↓` | `:361, 366` |
| Books menu heading `Studio books · sheets` | `:386` |
| Book rows: `Orders`, `Accounts`, `Hours` | `:414–416` (from `LEDGERS`, `:81–92`) |
| `Recent` tag on the most-recent book | `:419` |
| `Leave a note` | `:439` |
| `Shipped` (unseen-feedback tag) | `:443` |
| `In hand today` + elapsed | `:458, 461` |
| `Hands free` | `:466` |
| `The Post` label + aria `The Post, {n} unread` | `:486, 505` |
| Account nameplate | `:509` → `account/account-nameplate.tsx:66` |
| Sheet title = the book's name | `:518` |

localStorage: `RECENT_BOOK_KEY = 'patina.document.recentStudioBook'` (`:111`), read at `:166–177`,
written at `:207–214`. `STUDIO_BOOKS` (sheet weight) is re-ordered recent-first at `:154–159`.

### 6.6 ⌘K — `components/document/command-bar.tsx`

| String | Line |
|---|---|
| `Command bar` (dialog aria-label) | `:779` |
| `Close command bar` | `:784` |
| `Find anything, or ask the Engine` (input aria) | `:792` |
| `Find a document or a ledger — or ask the Engine…` (placeholder) | `:793` |
| Group eyebrow `In hand` (row hint `resume`) | `:503` |
| Group eyebrow `Recent boards` | `:507` |
| Group eyebrow `Recent` | `:515` |
| Group eyebrow `This surface` | `:573` |
| Group eyebrow `Begin` | `:575` |
| Group eyebrow `Rooms & ledgers` | `:577` |
| Group eyebrow `Studio` | `:583` |
| `Add to project` · `this project · Library, link, need, import, or board` | `:472–473` |
| `Add a change` · `this project · amendment workflow` | `:485–486` |
| `Draw an invoice for {Project}` · `this household · pre-addressed` | `:526–527` |
| `Open the Drafting Room` · `this proposal · boards & lines` | `:537–538` |
| `Open the call sheet` · `this project · who is on the job` | `:551–552` |
| `The plan room` · `this project · the current set` | `:566–567` |
| Room/ledger/verb rows: label from registry, sub = `subLabel` or `room ↗` / `ledger` | `:385` |
| `Browse the Help Center` · `guides · every surface` | `:400–401` |
| `Help…` · `about this surface` | `:408–409` |
| `Take the walkthrough` · `the Desk, in a minute` | `:418–419` |
| `Leave a note` · `feedback on this screen` | `:427–428` |
| `The Desk` · `go home` | `:434–435` |
| `Interruptions` · `break-through settings` | `:442–443` |
| `Settings` · `profile · notifications · security` | `:450–451` |
| `Sign out` · `{email}` or `end this session` | `:458–459` |
| Person rows: `{name}` · `{role} · jump to person →` | `:326–327` |
| `No match — Browse the Help Center` · `search the guides →` | `:633–634` |
| `Ask the Engine` · `“{query}” · ask & place` | `:644–645` |
| `The Engine · “{query}”` + `← results` | `:826, 833` |
| Chord badges (`g l`, `g p`, `g r`, `g o`, `g a`, `g h`, `g t`) | `:766–768` |

### 6.7 The mobile bar at 390 (<1180) — `components/document/mobile/mobile-bar.tsx`

`Document bar` (nav aria, `:153`); `In this document` (`:168`); `In the studio` (`:180`);
context word — active section label, `Document`, or `The Desk` / `The Library` /
`The People Room` / `The Rooms` / `Drafting` / `Composing` / `The Studio` (`:42–51, 84–85`);
`Open sections, current section {context}` (aria, `:162`); `In hand` / `Today` (`:209`);
elapsed / `Hands free` (`:212–216`); `More` (`:233`) with aria `More studio actions` (`:225, 242`);
menu rows — secondary actions with `↗` (`:261, 264`), `Time in hand` (`:283`) +
`{elapsed} · review or adjust` (`:285`), `The Post` (`:299`) + `{n} new` (`:302`),
`Studio books` (`:319`), `Leave a note` (`:331`) + `Shipped` (`:334`).

Mobile sheets (`components/document/mobile/mobile-sheets.tsx`):
`Dismiss` (`:265`), `Time in hand` (timer dialog aria, `:260`);
drawer — `The drawer · six books` (`:373–374`),
`Pulled over whatever you're holding. Put back when done.` (`:376–378`), rows
`Library` / `a room · walk in`, `Orders` / `cross-engagement POs`, `Accounts` / `revenue · A/R`,
`People` / `a room · walk in`, `Rooms` / `a room · walk in`, `Hours` / `this week`
(`:83–120`, rendered `:409, 420`);
spine — `← Put down · back to the Desk` (`:453`), section rows (label + sub, `:474, 477`),
`Rooms` (`:513`), `In the margin · {n}` (`:540`),
`The margin — decisions, messages, and money gather here.` (`:570`);
timer sheet — `Minutes` (`:702–703`), `Activity` (`:709`),
`Manual time entry actions` (`:723`).

### 6.8 Shelf leaf (≥1440) — `components/document/shelves/`

`{Title} shelf` (aria, `shelf-panel.tsx:92`); eyebrow (`:99`) and title (`:102`) from
`ALL_SHELVES`; `✕ Close` (`:111`).
Leaf empties: `The plan room could not be read.` / `Reading the plan room…` /
`No drawings filed yet.` (`plan-room-leaf.tsx:30, 32, 59`);
`The spec book could not be read.` / `Reading the schedule…` / `Nothing specified yet.`
(`spec-book-leaf.tsx:69, 70, 81`).

---

## 7. Reachability inventory

"Acts" = discrete user actions from the named starting surface. ⌘K-only doors are marked **⌘K-only**.

### From `/desk`

| Door | Destination | Acts | Notes |
|---|---|---|---|
| `Capture a lead` header act | `CaptureLeadSheet` overlay | 1 | `desk/page.tsx:202–210` |
| `Open a project` header act | `OpenProjectSheet` overlay | 1 | `desk/page.tsx:213–220` |
| `Find anything` / `⌘K` | Command bar | 1 | `desk/page.tsx:221–233`; hotkey `command-bar.tsx:211` |
| A folio card | `/doc/{engagement_id}` or `need.deepLink` | 1 | `folder-card.tsx:208–216` |
| Folio ledger act (overdue invoice) | Accounts book, Receivables page | 1 | `folder-card.tsx:317–336` |
| `Reveal {n} more folios` | folded folios | 1 | `folder-card.tsx:117–135` |
| `Open pulse` → any pulse row | in-motion chip / request / reconnect / field row | 2 | `studio-pulse.tsx:144–157, 227–243` |
| `Recent boards` strip row | `/board/{id}` | 1 | `recent-boards-strip.tsx` |
| Contents: `Library` / `People` / `The Rooms` | `/library`, `/people`, `/rooms` | 1 | `desk-contents.tsx:190–199` → `openLedger` → `studio-drawer.tsx:259–261` |
| Contents: `Orders` / `Accounts` / `Hours` / `The Post` | Drawer sheet | 1 | `desk-contents.tsx:206–215` |
| Contents: `Open a project` / `Draft a design agreement` / `Draw an invoice` / `Add a maker` | overlay or `/people?add=maker` | 1 | `desk-contents.tsx:225–236, 159–165` |
| Drawer: `Patina` wordmark | `/desk` | 1 | `studio-drawer.tsx:281–286` |
| Drawer: 3 room doors | `/library`, `/people`, `/rooms` | 1 | `studio-drawer.tsx:301–340` |
| Drawer: `Studio books` → book row | Orders / Accounts / Hours sheet | 2 | `studio-drawer.tsx:343–424` |
| Drawer: `Studio books` → `Leave a note` | Feedback sheet | 2 | `studio-drawer.tsx:425–446` |
| Drawer: `The Post` bell | Post sheet | 1 | `studio-drawer.tsx:474–507` |
| Drawer: nameplate | Account sheet | 1 | `studio-drawer.tsx:509` |
| g-chords `g l/p/r/o/a/h/t` | Library, People, Rooms, Orders, Accounts, Hours, The Post | 1 (2 keys) | `registry-shortcuts.tsx:42–47, 94–101` |
| ⌘K → `Drafting Room` | `/drafting/{id}` if a draft is in hand, else the draft-proposal picker | 2 | **⌘K-only** from the Desk — no Desk doorway (`desk-contents.tsx:137–139`); `command-bar.tsx:371–375` |
| ⌘K → `Capture a lead` | Capture sheet | 2 | duplicate of the header act (`desk-contents.tsx:222–225` deliberately omits it) |
| ⌘K → `Browse the Help Center` | `/help` | 2 | **⌘K-only** |
| ⌘K → `Help…` | contextual help panel | 2 | **⌘K-only** |
| ⌘K → `Take the walkthrough` | `/desk?tour=desk-walkthrough` | 2 | **⌘K-only** (also the MarginNote offer, once) |
| ⌘K → `Interruptions` | Interruption settings | 2 | **⌘K-only** |
| ⌘K → `Settings` / `Sign out` | Account sheet / sign-out | 2 | also from the nameplate (Settings) |
| ⌘K → person row | `/people?person={id}` | 2 | **⌘K-only** as a direct deep link |
| ⌘K → `Ask the Engine` | inline Engine results | 2 | **⌘K-only** |
| `Call sheet` | — | — | **unreachable from the Desk**: `scope: 'document'`, filtered out of Contents (`desk-contents.tsx:141–143`), out of ⌘K's unfiltered group (`command-bar.tsx:580`), and out of typed ⌘K results (`command-bar.tsx:610–615`) |

### From an open project doc (`/doc/[id]`, ≥1440)

| Door | Destination | Acts | Notes |
|---|---|---|---|
| `← Put down` (spine) | `/desk` | 1 | `doc-spine.tsx:46–55` |
| `Esc` | `/desk` | 1 key | `page.tsx:527–536`; yields to a dialog or an open shelf |
| Spine mark (settled/active) | scroll + unfold that section | 1 | `doc-spine.tsx:105–115` → `jumpToSection` `page.tsx:423–464` |
| Running-index row | scroll to that region (unfolding it) | 1 | `spine-running-index.tsx:84–113`, `use-document-running-index.ts:41` |
| Rooms-block row | lift that room across paper + shelves | 1 | `spine-rooms-block.tsx:42–75` |
| Shelf row (`Plan room`/`Spec book`/`Mood boards`/`Knowledge`) | shelf leaf beside the spine | 1 | `spine-shelves-block.tsx:51–101`, `page.tsx:540–548` |
| Shelf row `Call sheet` | Call Sheet overlay (a doorway, not a leaf) | 1 | `page.tsx:541–545` |
| Guide / red-letter act | anchor, href, ledger, or retry | 1 | `page.tsx:751–768` |
| Household chip | Household sheet | 1 | `household-chip.tsx:40–48` |
| `Message {Family}` | inline composer | 1 | `letterhead-instruments.tsx:324–330` |
| `Preview as {Family}` | client mirror overlay | 1 | `letterhead-instruments.tsx:332–339` |
| `Your scan` / `The scan` | `/room/{scanId}?from=document&docId=…` | 1 | `letterhead-instruments.tsx:341–352` |
| `Call sheet · {n}` instrument | Call Sheet overlay | 1 | `letterhead-instruments.tsx:449–462` (flag `call-sheet`) |
| Folio letterhead disclosure → file chip | file viewer or `/room/{path}` | 2 | `folio-strip.tsx:381–418, 349` |
| `Fold ↑` on any region head | fold that region | 1 | `region-head.tsx:138–148` |
| A fold seam | unfold + focus the heading | 1 | `fold-seam.tsx:41–65` |
| `New approval` (approvals) | inline composer | 1 | `project-approval-document.tsx:505–511` |
| `Adjust dates` (Rule) | arm a phase edit | 1 | `schedule-rule-region.tsx` ledger |
| `Add to project` (FF&E) | Add-to-project sheet | 1 | `ffe-section.tsx:977–981` |
| `Release for authorization` (FF&E or table head) | release ceremony | 1 | `ffe-section.tsx:982–993`; lifted to the table head at `page.tsx:1347` |
| `Bill {n} uninvoiced` (FF&E) | invoice composer | 1 | `ffe-section.tsx:994–1008` |
| `Spec book →` (FF&E) | `/doc/{projectId}/spec-book` | 1 | `ffe-section.tsx:1009–1015` |
| `Open the spec book` (FF&E empty state) | `/doc/{projectId}/spec-book` | 1 | `ffe-section.tsx:1228` |
| `Draw an invoice` (money) | invoice composer, project pre-addressed | 1 | `money-region.tsx:249–253` |
| `Amendment` / `Add a change` (money) | amendment sheet | 1 | `money-region.tsx:257–265` |
| `Hours · this project ↗` (money) | Hours book, project-scoped | 1 | `money-region.tsx:267–272` |
| `Close the book` (care) | close the project | 1 | `care-band.tsx:275–283` |
| Kickoff `From the rolodex` / `New person` | Call Sheet picker / add | 1 | `kickoff-band.tsx:95–108` |
| `Previous work · {n} complete` → a settled bar | unfold that phase's record | 2 | `previous-work.tsx:38–47`, `settled-bar.tsx:53–62` |
| `Client approvals · {n} awaiting publish →` | scroll to the approvals record | 1 | `previous-work.tsx:51–57`, `page.tsx:514–522` |
| Colophon `Brief a vendor` | Orders book, Vendors page | 1 | `doc-colophon.tsx:118–124` |
| Colophon `Hold` / `Resume` | project status mutation | 1 | `doc-colophon.tsx:125–142` |
| Colophon `Archive` → `Archive it` | archive + `/desk` | 2 | `doc-colophon.tsx:143–199` |
| Colophon `Team…` | Call Sheet picker | 1 | `doc-colophon.tsx:153–165` |
| Margin `+ Decision` / `+ Note` | composer | 1 | `margin-rail.tsx:498–513` |
| Margin item row | unfold in place | 1 | `margin-rail.tsx:437–455` |
| Margin `Drafts · {n}` → a draft | edit composer | 2 | `margin-rail.tsx:522–558` |
| Margin `Settled · {n}` | reveal settled items | 1 | `margin-rail.tsx:640–653` |
| Drawer (all rows, as on the Desk) | rooms / books / Post / account | 1–2 | `studio-drawer.tsx:271–511` |
| g-chords | 7 surfaces | 1 (2 keys) | `registry-shortcuts.tsx` |
| ⌘K → `The plan room` | `/doc/{engagementId}/plans` | 2 | **⌘K-only** — no other doorway in the tree at this commit; `command-bar.tsx:562–572` |
| ⌘K → `Add to project` | Add-to-project sheet | 2 | duplicates the FF&E ledger act |
| ⌘K → `Add a change` (install/care) | amendment | 2 | **⌘K-only** on install/care spreads; `command-bar.tsx:481–492` |
| ⌘K → `Draw an invoice for {Project}` | pre-addressed composer | 2 | duplicates the money-region act |
| ⌘K → `Open the call sheet` | Call Sheet overlay | 2 | duplicates the letterhead instrument |
| ⌘K → `Open the Drafting Room` | `/drafting/{id}` | 2 | proposal docs only (`draftingProposalId`, `command-bar.tsx:334–339`) |
| ⌘K → `Interruptions` / `Take the walkthrough` / `Browse the Help Center` / `Help…` / person rows / `Ask the Engine` | as above | 2 | **⌘K-only** |

Surfaces reachable **only** from an open document (never from `/desk`): the Call Sheet
(`registry.tsx:236`), the Drafting Room's direct route (`registry.tsx:128`), the plan room
(`command-bar.tsx:558–572`), the spec book (`ffe-section.tsx:1009–1015`), and every shelf leaf
(`shelf-panel.tsx:94`).

---

## 8. Flags

All six are read through `useFeatureFlag` (`src/hooks/use-feature-flag.ts:114–178`).
Default when absent: **fail-closed** — initial state is `{value: false, isLoading: true}`
(`:119–120`); when PostHog can never initialize, `isLoading` is forced false and the flag settles
`false` (`:158–164`, docstring `:107–112`). `NEXT_PUBLIC_FLAG_OVERRIDES` (`flag:true,flag:false`)
short-circuits PostHog entirely (`:49–63, 118`).

| Flag | Read at | Gates |
|---|---|---|
| `worktable` | `doc/[id]/page.tsx:280` | The Worktable composition: `table` is null off the flag (`page.tsx:982`), so `TableFrame` is a pass-through, `IntakeSpreadHeader`, `FinalizeHead`, `OfferFacets`, `FinalizeShelf`, `ReleaseLift`, the client's-copy shelf and the seal-turn note (`page.tsx:859–863, 995–1009, 1255, 1300, 1338, 1347, 1625`) never mount |
| `call-sheet` | `doc/[id]/page.tsx:825`; `desk/page.tsx:69`; `command-bar.tsx:196`; `letterhead-instruments.tsx:283`; `roster/kickoff-band.tsx:52`; `roster/call-sheet.tsx:76`; `roster/project-team-roster.tsx:36`; `roster/rolodex-picker.tsx:111`; `coordination/item-composer.tsx:217`; `people/party-profile-sheet.tsx:156`; `people/views/directory-view.tsx:219`; `account/account-studio-page.tsx:118` | The roster read (`page.tsx:865–869`), the `Call sheet` shelf row (`shelves.ts:106`), the letterhead `Call sheet · n` instrument (`letterhead-instruments.tsx:355`), the Kickoff band (`kickoff-band.tsx:70`), the ⌘K "This surface" call-sheet row and its typed-query reachability (`command-bar.tsx:547, 612`), the sheet itself (`call-sheet.tsx:76`), and the Desk setup-whisper's rolodex step (`desk/page.tsx:75, 82–83`) |
| `arrival-arc` | `triage-bar.tsx:85`; `open-requests-strip.tsx:242`; `ceremony/ceremony-surface.tsx:63` | The arrival ceremony — the `/ceremony/[leadId]` surface and the triage/open-requests arrival affordances |
| `room-file` | `rooms/room-view/room-view.tsx:151` | The Room File affordance inside `/room/[id]` |
| `room-view-refined-path` | `rooms/room-view/room-view.tsx:181` | The refined room-view render path inside `/room/[id]` |
| `studio-workspaces` | `desk/page.tsx:64`; `account/account-sheet.tsx:105` | The Desk's `StudioSetupWhisper` (`desk/page.tsx:327`) and the Account sheet's Studio tab |

Portal-wide there are two further flags not read anywhere in the `(document)` tree:
`procurement-workspace-pilot` and `capture-producer-idempotency`.

---

## 9. Corrections to the stated claims

**(a) Section ORDER — CONFIRMED.** `ORDER` is exactly
`brief, discovery, direction, proposal, project, install, care`
(`src/lib/document/section-derivation.ts:59–67`).

**(b) Three width tiers — CONFIRMED with three refinements.**
Breakpoints and the `data-spine-regime` attribute are as claimed (`doc-spine.tsx:40`, value
`"sheet-below-1180-compact-to-1439-full-from-1440"`). Refinements:
1. The compact tier's spine column is **56px**, and the full tier's is **200px** with a **232px**
   margin column (`doc/[id]/page.tsx:1047`) — the compact spine is an icon rail, not a labelled one.
2. At 1180–1439 the margin is not absent but a **closed, `inert`, focus-trapped 360px sheet**
   with its own `Margin ←` trigger tab (`margin-rail.tsx:228–262`), not merely "opens on demand".
3. The Studio Drawer strip is also gated at 1180 (`hidden … min-[1180px]:grid`,
   `studio-drawer.tsx:277`) — the mobile bar owns the edge below it.

**(c) Registry groups — CONFIRMED for membership, CORRECTED on chords.**
The three arrays hold exactly the named entries (`registry.tsx:77–134, 152–244, 252–327`).
The claim "with g-chords" is wrong for two of the three groups:
- **No `STUDIO_VERBS` entry carries a `shortcut`** (`registry.tsx:252–327`).
- `drafting-room` (`registry.tsx:120–133`) and `call-sheet` (`registry.tsx:228–243`) carry no
  chord either; both are `scope: 'document'`.
- Only seven surfaces are chorded: `g l` Library, `g p` People, `g r` The Rooms, `g o` Orders,
  `g a` Accounts, `g h` Hours, `g t` The Post — enumerated by
  `registry-shortcuts.tsx:42–47`, which filters for `shortcut.length === 2 && shortcut[0] === 'g'`.

**(d) `stageCopy` + precedence — CONFIRMED for stageCopy, CORRECTED on precedence.**
Each of the seven stages carries exactly one `{state, eyebrow, headline, reason, action}`
(`document-guide.ts:91–141`). The precedence chain has **two states above the gate** that the
claim omits: `availability === 'unavailable'` (`:327`) and `row.is_paused` (`:340`) both return
before the gate is consulted. The full order is
unavailable → paused → gate → operational need → proposal lifecycle → stage default
(`:327, 340, 362, 374, 383, 388`). Additionally, `withInputs` can replace the action with
`Add {input}` on the `needs_input` branch only (`:143–170`), and the `direction` stage's action
destination is swapped from an anchor to `/drafting/{proposal_id}` when the row carries one (`:389–392`).

**(e) `ALL_SHELVES` — CONFIRMED with two refinements.**
Six entries in the claimed order (`shelves.ts:33–76`).
1. `callsheet` is `kind: 'doorway'`, not a leaf (`shelves.ts:59`) — it opens the roster sheet
   rather than a panel, and declares no `aria-expanded` (`spine-shelves-block.tsx:55–63`).
2. `clientcopy` is gated by the caller's `clientCopyEnabled`, not by reading `worktable` itself
   (`shelves.ts:95, 108`); the page passes it only on the Finalize table, which requires the
   `worktable` flag (`doc/[id]/page.tsx:995–1004`). Its `subject` is `'proposal'`, so it and the
   four project shelves can never stand together (`shelves.ts:74, 104–106`).
The ≥1440 constraint is correct and enforced twice: the block is `hidden min-[1440px]:block`
(`doc-spine.tsx:135`) and an open shelf is force-closed below 1440 (`doc/[id]/page.tsx:553–562`).

**(f) `PROJECT_PAPER_ORDER` — CONFIRMED.** One array at `document-index.ts:34–55` in the order
approvals → schedule → ffe → money; `DOCUMENT_INDEX_KEYS` and `DOCUMENT_INDEX_LABELS` are both
`.map`ed off it (`:58–64`).

**(g) Studio Drawer — CONFIRMED with two refinements.**
Fixed 60px bottom strip (`studio-drawer.tsx:277`), wordmark → `/desk` (`:281–286`), breadcrumb
(`:287–296`), three room doors (`:301–340`), a `Studio books` doorway with a localStorage
recent-first ordering (key `patina.document.recentStudioBook`, `:111, 154–159, 166–177, 207–214`),
in-hand time (`:454–469`), The Post bell (`:474–507`), account nameplate (`:509`).
1. The strip is **not shown below 1180** — `hidden … min-[1180px]:grid` (`:277`).
2. The books menu carries a **seventh** row not in the claim: `Leave a note` (Feedback), rendered
   below a clay rule after the three books (`:425–446`).

**(h) Flags on the surface — CONFIRMED.** All six named flags are read within the `(document)`
tree; call sites enumerated in §8. Note that `arrival-arc`, `room-file`, and
`room-view-refined-path` are read only on the Rooms/ceremony routes, never on `/desk` or
`/doc/[id]`.

**(i) No toast provider, no zone nav — CONFIRMED.** Neither appears among the layout's imports
(`layout.tsx:1–23`) or its render tree (`:48–111`); the file states both explicitly
(`:30–31` "no zone nav, no sub-nav, no utility bar"; `:36–41` "NO ToastProvider — and never one").
