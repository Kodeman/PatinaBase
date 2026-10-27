# Round 8 preservation inventory

Source snapshot: integration branch `redesign/designer-portal-round8`, base `0fabcadf26fa`. This is a source/test inventory, not a claim that runtime behavior has been exercised. CODEBASE-MAP explicitly makes these release obligations even when the mockup simplifies them (CODEBASE-MAP.md:53–72). “Destination” is the planned round-8 home; existing routes and behavior remain until their owning slice moves them.

## Capability families

| Capability family and retained behavior | Entry / backing source | Existing tests (representative; not exhaustive) | Round-8 destination |
|---|---|---|---|
| Inquiry, lead/discovery, proposal, direct project, agreement, activation; preserve lineage/identity | Desk create/triage and `/doc/[id]`; route renders pre-work regions and proposal/brief mounts (apps/designer-portal/src/app/(document)/desk/page.tsx:628–818; doc/[id]/page.tsx:3734–3844, 4008–4029) | `src/app/(document)/desk/page.test.tsx`; `src/components/document/prework/prework-region.test.tsx`; `src/components/document/rooms/drafting/agreement/__tests__/agreement-composer-frame.test.tsx` | Studio masthead for openings; chapter 01 Brief & agreement; lead/proposal pre-work remains distinct |
| Rooms, bulk/grouping, alternates, finishes, COM, labor, tax/markup, protected issued values, change orders | `/doc/[id]` mounts `FFESection`; `pieces/` route owns BuildRoom; registry `library` room (doc/[id]/page.tsx:3872–3898, 3923–3953; registry.tsx:90–110) | `src/components/document/__tests__/ffe-section-life.test.tsx`; `src/app/(document)/doc/[id]/worktable.test.tsx`; `e2e/document/pieces-build-room.spec.ts` | Chapter 06 FF&E and dense inline unfold; no business-rule reduction |
| Personal capture, studio library/catalog/configurations, boards/materials, teaching and usage provenance | Registry `library`; `/library`, `/boards`, `/board/[boardId]`; registry.tsx:90–105, 269–315; CODEBASE-MAP.md:21–37 | `src/lib/document/registry.test.ts`; `src/app/(document)/library/page.test.tsx`; `e2e/document/library.spec.ts` if present in this branch—verify per selected slice | Library/room design and library book; preserve provenance and full catalog rather than demo-card substitution |
| Measured rooms, plan uploads/revisions/issues, render lifecycle/source privacy | Registry `rooms`; `/rooms`, `/room/[id]`; job `RoomFilesSection` (registry.tsx:111–130; doc/[id]/page.tsx:3872–3874) | `src/app/(document)/rooms/page.test.tsx`; `src/components/document/room-files-section.test.tsx` (check current names before using as gate) | Chapter 02 Design for room evidence; Library resource for general room collection |
| Orders register, weekly orders, receiving, claims, vendor accounts, external/store purchases | Registry `orders`; `/doc/[id]` schedule/purchasing sections (registry.tsx:169–205; doc/[id]/page.tsx:3852–3898) | `src/components/document/buying/__tests__/draft-review.test.ts`; `src/components/document/po-preview.test.tsx`; `e2e/document/pieces-build-room.spec.ts` | Orders book, relevant chapter 06 FF&E / chapter 07 Site & team; keep studio purchases distinct from external fulfilment |
| Accounts, receivables/aging, invoices/receipts, commercial authority, earnings visibility | Registry `accounts`; `MoneyRegion`, AccountBand, invoice overlays (registry.tsx:206–239; doc/[id]/page.tsx:3899–3916, 3943–3953; `(document)/layout.tsx:16–21, 109–112`) | `src/components/document/commercial/money-region.test.ts`; `src/components/document/accounts/__tests__/invoice-folio-held.test.ts`; `src/components/document/accounts/__tests__/invoice-composer-offline-preflight.test.ts` | Accounts book and chapter 08 Financials; preserve authority, holds, receipts, and draft-first external sends |
| Timer/manual hours, member/project/studio scopes, pending rates, claims/releases | Registry verb `log-time` and ledger `hours`; `DocumentTimeProvider`, LogStrip and LogTime overlay ((document)/layout.tsx:28–31, 71–74, 100–102; registry.tsx:213–229, 315–343) | `src/components/document/log-time-sheet.test.tsx`; `src/hooks/document-time-provider.test.tsx`; `src/components/document/log-strip.test.tsx` | Hours book / chapter 08 Financials, with one cross-surface time subsystem |
| Client/maker/trade relationships, communications, nurture, reviews, portfolio/outreach | Registry `people`, `add-maker`; existing people page and communications (registry.tsx:111–128, 315–332; CODEBASE-MAP.md:63–68) | `src/components/document/people/__tests__/reach-access.test.ts`; `src/components/document/people/__tests__/inbound-queue-band.test.ts`; `src/components/document/people/__tests__/person-profile.test.ts` | People/resource views and contextual chapter 07 Site & team actions; outbound stays draft-first |
| Project directory, work orders, Field observations, tasks, changes, distribution/receipts | Registry document-scoped `call-sheet`; job mounts visits, schedule, files and change sheet (registry.tsx:240–266; doc/[id]/page.tsx:3672–3680, 3872–3874, 4200–4204) | `src/components/document/schedule/__tests__/schedule-spine-add-line.test.ts`; `src/components/document/roster/__tests__/notice-log.test.ts`; `src/components/document/call-sheet.test.tsx` | Chapter 07 Site & team; project directory book/utility remains reachable |
| Studio membership, rates, agreement defaults, preferences, notification rules, profile, help/command search | Accounts sheet, help, CommandBar, InterruptionSettings, AccountSheet and keys mounted by route-group layout ((document)/layout.tsx:10–28, 80–116) | `src/components/document/command-bar.test.tsx`; `src/components/document/account/account-sheet.test.tsx`; `src/components/document/help/document-help.test.tsx` | Utility / studio masthead doors and existing global instruments; not a new navigation hierarchy |
| Save errors, loading, missing/redirected identity, access loss, offline/retry, concurrency/activity | InlineErrorSurface/SavingBand at route-group shell; page/sheets own local error states ((document)/layout.tsx:34–35, 80–90; doc/[id]/page.tsx:3400–3434) | `src/components/feedback/inline-error-surface.test.tsx`; `src/components/document/accounts/__tests__/invoice-folio-offline-preflight.test.ts`; `src/app/(document)/doc/[id]/page.test.tsx` | First-class state at each affected round-8 surface; not removed as visual noise |
| Client page and Field/iOS consumers; existing links/contracts | Existing client/Field surfaces and shared contracts; CODEBASE-MAP.md:69–72 | Consumer-specific acceptance belongs to WP-10C / acceptance catalogue, not a new portal-only test | Preserve existing links/contracts; coordinate any new evidence surface with client/iOS owners |

The representative test paths above are evidence pointers, not guarantees that every capability is covered; the map itself says live-data baseline must establish runtime behavior (CODEBASE-MAP.md:72). Before using a named test as a gate, confirm it exists in this checkout.

## Registry inventory (all entries)

The registry states it is the single source read by Studio Drawer, command bar, and Desk Contents (registry.tsx:1–24). Entries and round-8 destinations:

| Registry entry | Source lines | Destination / retained door |
|---|---:|---|
| `library` Resource library (room, global) | registry.tsx:90–103 | Studio masthead; Library book / chapter 02 Design |
| `people` Studio contacts (room, global) | registry.tsx:104–117 | Studio masthead; People/resource view |
| `rooms` Measured rooms (room, global) | registry.tsx:118–130 | Studio masthead; room evidence / chapter 02 Design |
| `drafting-room` Proposal workspace (room, document scoped) | registry.tsx:131–160 | Chapter 01 Brief & agreement; only while proposal is in hand |
| `orders` Purchase orders (ledger, global) | registry.tsx:169–189 | Orders book and chapters 06/07 |
| `accounts` Studio accounts (ledger, global) | registry.tsx:190–212 | Accounts book and chapter 08 Financials |
| `hours` Timesheets (ledger, global) | registry.tsx:213–227 | Hours book and chapter 08 Financials |
| `the-post` Studio inbox (ledger, global) | registry.tsx:228–239 | Correspondence/book utility |
| `call-sheet` Project directory (ledger, document scoped) | registry.tsx:240–266 | Chapter 07 Site & team; remains job-scoped |
| `capture-lead` Record an inquiry | registry.tsx:269–284 | Studio masthead; creates inquiry brief |
| `open-project` Create a project file | registry.tsx:285–297 | Studio masthead; direct project setup |
| `draft-proposal` Draft a services agreement | registry.tsx:298–318 | Studio masthead; chapter 01 |
| `draw-invoice` Draft an invoice | registry.tsx:319–330 | Studio masthead / chapter 08 |
| `log-time` Record time | registry.tsx:331–350 | Studio masthead / Hours utility |
| `add-maker` Add a maker or supplier | registry.tsx:351–363 | People/resource utility |

Registry defines keys, scope, aliases and labels, not backing hook/RPC implementations. Do not infer a single backend from the registry. Registry coverage tests include `src/lib/document/__tests__/registry.test.ts` and consumer parity tests under `src/components/document/` (confirm exact test filenames when selecting a gate).

## Current job regions and placements

`doc/[id]/page.tsx` retains its rendered page and branching behavior until the frame-owner slice; the relevant source group begins at the body return (around line 3418). The current page has: arrival skeleton/shell and status; DocSpine and responsive margin rail; document letterhead/subject/household context; LensBand and status; HouseholdSheet, folio letterhead/handoff/client note; ProjectApprovalDocumentMount; ScheduleNavProvider/RippleProvider/ScheduleRuleRegion; active section and StageLine; TableFrame with IntakeSpreadHeader and pre-work Brief, Discovery, agreement, scope, vision and proposal regions; project-flow branch containing ReleaseLift, ScheduleSpine, RoomFilesSection, VisitsBlock, FFESection, MoneyRegion, CareBand and InstallWindowCeremony; PreviousWork/SettledBar; DocColophon; ResponsiveMarginRail with discovery/margin content; DocumentShelves and CallSheetMount; RecordAChangeSheet. Source anchors: `doc/[id]/page.tsx:3418–3487` shell/spine/paper, `3495–3672` head and providers, `3672–3844` schedule/pre-work, `3844–3991` project branches, `4008–4121` account/kickoff/previous-work/colophon, `4127–4204` margin and overlays.

Proposed mapping: chapter 01 = intake, brief, discovery, services agreement and scope; 02 = room/design evidence, designs and plans; 03 = cabinetry/build-specific content; 04 = approvals; 05 = schedule; 06 = FF&E; 07 = site/team/visits/files; 08 = money/accounts; 09 = install, closeout and care; 10 = record/previous work/changes. JobHead receives origin, identity/context and the room-in-hand release. This mapping is a destination, not authority to omit current conditional branches.

Desk/page ownership remains the Studio surface, with capture/open-project/draft-proposal actions and existing needs/roster/arrival/error states (`desk/page.tsx:608–818`). Its redesign destination is Studio masthead, CommissionSpread/AttentionList, JobsRegister and NextConversation per execution plan.

## Overlay/provider preservation and DocSpine

The `(document)/layout.tsx` shell mounts, in order: ArrivalMount, SkipToPaper, SavingBand, InlineErrorSurface, NavRule, DocumentRouteBoundary; then DocumentTimeProvider, MobileShellProvider, HelpStateProvider, DocumentHelpProvider, DeskWalkthroughProvider, NeedActSheetProvider and ArrivalRoute; shared children include LogStrip, StudioDrawer, RegistryShortcuts, KeysShortcut/KeysSheet, LogTimeShortcut/LogTimeOverlay, CommandBar, InterruptionSettings, AccountSheet, InvoiceOverlays, DraftProposalOverlay, ReturnToLeadUndo, MobileActionDock/MobileBar/MobileSheets, DeskWalkthrough and DeskDoorway. Exact providers/consumers are visible at `(document)/layout.tsx:80–149`. All are single route-group owners, not page-local duplicates. Round-8 frames must preserve the shared shell and its one set of providers/overlays.

DocSpine duties today (doc-spine.tsx:37–103, 121–295; page.tsx:3447–3455):

| Current duty | Existing evidence | Round-8 home |
|---|---|---|
| Section ladder, current active section, section jump/scroll and stage position | `DocSpine.sections`, jump callback and ladder (`doc-spine.tsx:37–68, 122–177`); section IDs/index use in page | `ContentsMargin`, preserving navigation to all chapters |
| Money/workflow ladder and doors/lens destinations | `LensLadder` import/derivation and current ladder render (`doc-spine.tsx:24–33, 158–223`) | Chapter sub-labels and local chapter doors; no loss of money/workflow wayfinding |
| Room-in-hand label and release action | `roomInHand`, `onReleaseRoom`; `data-spine-room-in-hand` / `data-spine-release-room` (`doc-spine.tsx:99–103, 279–295`) | `JobHead`; release remains at job head and reachable at any scroll position |
| Responsive rail/mobile handoff and compact section handle | comments/markup around `doc-spine.tsx:158–177`; mobile shell in `(document)/layout.tsx:86–87, 119–122` | Sticky ContentsMargin at desktop; existing MobileSheets below 1180px |
| Lens/context state and section label context | active section and lens/section derivation (`doc-spine.tsx:122–155`) | Chapter active state and chapter sub-labels; preserve current active/held context semantics |

No behavior is authorized to disappear merely because DocSpine itself is retired. Existing component tests include `src/components/document/spine/__tests__/lens-ladder.test.tsx`, `src/components/document/__tests__/shelved-spine.test.tsx`, and `src/hooks/__tests__/use-document-running-index.test.tsx`.
