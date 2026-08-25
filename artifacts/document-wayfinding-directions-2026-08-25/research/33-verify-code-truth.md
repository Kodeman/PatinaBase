# V1 — verify: code truth

Lens: **code truth**. Every one of the 101 collated findings was put against the component or
derivation it names, read at `main@695addb5f` under
`/Users/kody/Code/patina-merged/apps/designer-portal/src`. Read-only; no file under
`apps/`, `packages/`, `supabase/` or `docs/` was touched and no server was started.

**Verdicts:** 78 stand · 15 narrow · 8 misread.

A `misread` means the affordance or behaviour exists in code and the seat did not find it (or compared two different documents). A `narrows` means the observation is true but the claim around it is wider than the code supports; the narrower claim is given.

---

## Misread — the code does the thing

### F06 — Orders ledger shows no PO acknowledgment state

*high · confidence 0.7 · width all · flag both · seats U4, P1, P2, P3, P4*

**Seat observed —** Rows read `AP-012  RECEIVED / INSPECT`, `CER-0044  IN TRANSIT`, and `NOT SENT`; the tabs are `LEDGER  THE WEEK  RECEIVING  VENDORS` and the filters `PAYMENT · ALL  DUE  PENDING  PAID`. No row, chip, tab or filter uses `acknowledged`, `confirmed` or `ack`.

**Verdict: MISREAD.** Every PO row prints its send/ack lifecycle in its provenance line, and an ack act is gated and offered on exactly the rows that lack one.

**Evidence —** `orders-ledger.tsx:571-572 `sent {d} · ack` / `· no ack` / `not sent`; canAck at :472-476; acknowledged_at at :76`


### F19 — A sent, unopened proposal is invisible on the Desk

*high · confidence 0.7 · width all · flag both · seats U1, P1, P2*

**Seat observed —** The document carries `SENT YESTERDAY —  NUDGE CLIENT USER` and `SENT Aug 24 / OPENED not yet / READING — / MOST READ —`. No Desk folio carries a sent age or unopened state — the visible proposal folio reads `Signed — open the project` — and no roll-up of proposals with the client exists.

**Verdict: MISREAD.** A sent-unopened proposal has its own Desk NeedKind with text, action and stamp once it passes the promote threshold; day one rides an in-motion chip.

**Evidence —** `desk-derivation.ts:636-650 `Sent {date} — not yet opened` / 'Follow up' / stamp SENT; NeedKind at :113`


### F20 — Nothing on the paper names a PO, receiving or a claim

*high · confidence 0.85 · width all · flag both · seats P1, P3, P4*

**Seat observed —** FF&E lines carry piece, vendor, stamp (`IN PRODUCTION`, `RECEIVED`) and price only; `PO`, `purchase order`, `receiving`, `inspect`, `claim` and `damage` appear nowhere on the paper at any stage. The only in-document door toward orders is the colophon's `BRIEF A VENDOR`.

**Verdict: MISREAD.** The FF&E line unfold on the paper is explicitly PO detail, movement and receiving, with a claim lifecycle and the inspection drawer mounted in place.

**Evidence —** `line-unfold.tsx:4-5 docstring; :77 movement/confirmed-ETA; :182-250 ClaimActs; :24 LogInspectionDrawer`


### F27 — The install spread shows no FF&E lines at all

*blocker · confidence 0.85 · width all · flag both · seats P1, P4*

**Seat observed —** `w1440-doc-install` prints, under `Install`, one line: `No FF&E lines are scheduled for installation.` The same project's lines are visible and priced on the project spread. The spread offers `ADD THE FIRST TASK` and `INSTALL WINDOW / No window is held. HOLD A WINDOW` instead.

**Verdict: MISREAD.** Install mode reads the same unfiltered project FF&E query and renders every line ungrouped; the empty line only prints when the project has zero items, so the two shots were different documents.

**Evidence —** `ffe-section.tsx:705-712 useProjectFFEItems(projectId); :769-791 rows/total; :915-925 throughout = rows; :1222-1236 empty only at total===0`


### F31 — The downstream damage of a date move is prose, not a preview

*high · confidence 0.55 · width all · flag both · seats U2, P1*

**Seat observed —** The install schedule prints `PHASE HANDOFFS` / `Completing a phase activates every direct follower in the project graph. The server verifies blockers and the exact transition.` and one act, `COMPLETE PHASE`. No reviewed shot shows a date-edit control paired with a ripple preview.

**Verdict: MISREAD.** A full ripple preview exists — a dashed-terracotta ghost layer drawing moved boundaries, milestones, the old→new vector and dated labels from one RippleDiff, on both drag and spine-originated edits.

**Evidence —** `rule-ghost-layer.tsx:1-40; schedule-ripple-context.tsx:4-44; drafting-strip.tsx:29-35`


### F68 — `CLOSE THE BOOK` looks equally clickable while blockers are listed above

*medium · confidence 0.5 · width 1440 · flag both · seats U2*

**Seat observed —** On Aspen Loft Refresh (install) the band reads `1 of 6 closed out` and lists `OPERATIONAL CLOSEOUT STILL OPEN — 2 project phases not completed · 3 coordination items unresolved` directly above a filled `CLOSE THE BOOK` button rendered in the same weight as any other available act.

**Verdict: MISREAD.** `Close the book` is disabled while operational blockers stand — closureReady requires both the checklist and operational.ready — so it is not rendered as an available act.

**Evidence —** `care-band.tsx:168 closureReady(...), :275-284 disabled: !ready; closure-derivation.ts:275-280`


### F69 — `BEGIN THE DIRECTION` is offered live with 0 of 5 essentials captured

*medium · confidence 0.6 · width 1440 · flag off · seats U2*

**Seat observed —** The Discovery band reads `0 of 5 essentials captured — keep going` with `BEGIN THE DIRECTION` printed in the same scored, apparently-live style directly beside it — no visible warning of what is incomplete or what advancing skips.

**Verdict: MISREAD.** `Begin the Direction` carries `disabled={!ready || landing}` — it is not live at 0 of 5 essentials.

**Evidence —** `discovery-section.tsx:432-439 (disabled={!ready || landing})`


### F89 — An unexplained circular badge overlaps page content

*low · confidence 0.3 · width 1440 · flag off · seats U3*

**Seat observed —** A small black circle containing `N` sits fixed at the bottom-left of nearly every capture, overlapping the Studio Drawer's `Patina` wordmark (leaving only `INA` legible) and sitting over document content in several full-page shots.

**Verdict: MISREAD.** No product component renders a fixed bottom-left circular badge; the shots were taken against a dev server, where that mark is the Next.js dev-tools indicator, not the document surface.

**Evidence —** `no fixed bottom-left badge in app/(document)/layout.tsx:49-110 or any document component; research/dev-boot-off.log, dev-boot-on.log (dev server)`


---

## Narrows — true, but overstated

### F05 — FF&E lines print under `Unsorted`, never under a room heading

*high · confidence 0.9 · width all · flag both · seats U2, P1, P2, P3, P4*

**Seat observed —** Chen Residence's head reads `Project · FF&E   1 group · 3 lines`; the one group is named `Unsorted   3 OF 3 UNDERWAY`, and the running index reads `Project · FF&E   3 PIECES · 0 ROOMS`. T4's assumed path — room heading, then line — has nothing to click.

**Verdict: NARROWS.** Room headings do exist: project mode renders one RoomHeading per project_room, then `Throughout`, then `Unsorted`. All-Unsorted is a data state (zero project_rooms / unassigned scope), not a missing affordance.

**Evidence —** `ffe-section.tsx:904-925 grouping; 1240-1258 roomGroups.map(RoomHeading); 1279-1290 Unsorted bucket`

**Narrower claim —** On a project with zero project_rooms every FF&E line falls into the `Unsorted` bucket, so the room-heading path the designer expects has nothing to render.


### F15 — The mobile spine sheet lists sections and nothing else

*high · confidence 0.95 · width 390 · flag both · seats P1, P2, P3*

**Seat observed —** The sheet shows `← PUT DOWN · BACK TO THE DESK`, the seven section rows (`Brief NOT RECORDED` … `Project ACTIVE` … `Care —`), then `IN THE MARGIN · 3` and the margin cards. No running-index row, no `Rooms`, no shelf row of any kind.

**Verdict: NARROWS.** The mobile spine sheet does carry a Rooms block, fed from the page's docRooms; it renders only when the document has rooms. No running-index row and no shelf row of any kind: both confirmed.

**Evidence —** `mobile-sheets.tsx:508-535 Rooms block; doc/[id]/page.tsx:806 rooms fed to the shell`

**Narrower claim —** The mobile spine sheet lists sections, Rooms (when the project has any) and the margin — but never the running index or any shelf.


### F16 — `Who still owes me` is unanswerable inside the document

*high · confidence 0.9 · width all · flag both · seats U1, P1, P2*

**Seat observed —** The money rows are `Authority`, `Plan`, `Committed`, `Moved · $14,420 in motion`; none is invoiced, paid or outstanding. Receivables sit in a second folded band, `The accounts · this project  $0 BUDGET · $14,420 COMMITTED`, tagged `STUDIO EYES ONLY`. Studio Pulse prints counts, never a total.

**Verdict: NARROWS.** No money row names invoiced/paid/outstanding, but the AccountBand and ProjectCommerceSection mount inside the money region's own body, and the fold default explicitly counts receivables.

**Evidence —** `money-region.tsx:308-336 rows; :337-346 AccountBand/ProjectCommerceSection inside BODY_ID; :172-184 receivableCount`

**Narrower claim —** No row of the money ladder names a receivable; the answer sits in a nested band inside the same region rather than in the four-rung ladder that heads it.


### F32 — The Worktable moves no item-reach cell and leaves install week untouched

*high · confidence 0.9 · width all · flag on · seats U1, P1*

**Seat observed —** `wt-delivery-project-1440` and `wt-delivery-install-1440` are composition-identical to their flag-off twins: same shelf-less spine, same `No FF&E lines are scheduled for installation.`, same `INSTALL WINDOW`, same `ADD A ROOM`. The new tools land on Intake and Speccing — before the project starts.

**Verdict: NARROWS.** The Delivery table is not composition-identical: it lifts the release leader to the table head and can print the seal-turn note and turn line. But every item-reach slot (rooms-rail, scheme, boards-strip, reach-in) is speccing-only, and install adds nothing.

**Evidence —** `table-frame.tsx:49-66 (slots gated on table==='speccing'); page.tsx:1347 ReleaseLift; release-lift.tsx:25-40`

**Narrower claim —** Flag-on, the Delivery table adds only a lifted release leader; all four item-reach slots are Speccing-only and the install setting adds nothing at all.


### F37 — ⌘K opens on Recent and Begin; the doorways are below the fold

*medium · confidence 0.85 · width all · flag both · seats U1, P2*

**Seat observed —** The visible palette shows `RECENT` (Birch, Aspen, Aspen) then `BEGIN` (`Capture a lead`, `Open a project`, `Draft a design agreement`, `Draw an invoice`, `Add a maker`) and ends. `This surface`, `Rooms & ledgers` and `Studio` — home of `The plan room` — are pushed off-screen.

**Verdict: NARROWS.** Section order is In hand, Recent boards, Recent, This surface, Begin, Rooms & ledgers, Studio — `This surface` sits above Begin, and on the Desk it does not render at all (it needs a document in hand).

**Evidence —** `command-bar.tsx:499-583 section push order; thisSurface gated on inHandRow at :516-572`

**Narrower claim —** ⌘K opens on Recent and Begin; `Rooms & ledgers` and `Studio` — home of the studio doorways — sit below the fold. `This surface` is absent on the Desk entirely.


### F40 — A folded region and an empty one read the same

*medium · confidence 0.75 · width all · flag both · seats U3, P1*

**Seat observed —** Chen's seams read `Client approvals   NO DECISION LEAD · NO APPROVALS AUTHORED   UNFOLD ↓`, `Schedule   UNFOLD ↓`, `Design authority   NO AUTHORITY YET · $0 COMMITTED   UNFOLD ↓`. Folds persist in `patina:doc-fold:<docId>:<region>`, so a region folded ten days ago still reads as a line of zeroes.

**Verdict: NARROWS.** FoldSeam always prints a data summary, so an empty region reads `no approvals authored` and a populated folded one prints its figures — the two are not literally identical, but both wear the same seam form with no marker of who folded it.

**Evidence —** `region/fold-seam.tsx:41-64 (name, summary, `unfold ↓`); use-region-fold.ts:41-63 explicit choice persisted per doc per region`

**Narrower claim —** A region folded by the designer and one folded because it is empty wear the same seam form; only the summary text distinguishes them, and nothing marks the fold as her own choice.


### F41 — Setup chores and dated overdue needs wear the same red-letter clothes

*medium · confidence 0.8 · width all · flag both · seats U3, P1*

**Seat observed —** On Chen the band reads `NEEDS ATTENTION · IN ONE PLACE` / `Name the phases for this project` / `OPEN THE SCHEDULE`; on Aspen the identical band reads `1 decision overdue — oldest due Aug 22` / `REVIEW DECISIONS`. The same terracotta tags routine folio tabs and `DECISION DUE` chips.

**Verdict: NARROWS.** Both kinds do share the terracotta-ruled band and the same act treatment, but urgency is deliberately carried by headline weight, and the folio tab colour is per-need (need.stamp.color), not one terracotta.

**Evidence —** `red-letter-zone.tsx:29-33, 52-58 (row.urgent ? font-medium : font-normal); folder-card.tsx:257-262 background: need.stamp.color`

**Narrower claim —** Setup chores and dated overdue needs share the red-letter band and act treatment; the only distinction is headline font-weight. The folio tabs are not one hue — each need kind carries its own stamp colour.


### F49 — No visible way to open ⌘K anywhere on a phone

*blocker · confidence 0.85 · width 390 · flag both · seats U2*

**Seat observed —** The mobile bar's left third, centre and `More` menu (`Time in hand`, `The Post`, `Studio books`, `Leave a note`) contain no search or find affordance, and no mobile component calls the command-bar opener. ⌘K is the stated fallback door below 1440, and it has no entry point.

**Verdict: NARROWS.** The Desk header's `Find anything ⌘K` button carries no width gate and renders at 390, so a phone user on the Desk has an opener. Inside a document below 1180 no component calls openCommandBar.

**Evidence —** `desk/page.tsx:220-232 (no min-[…] class); command-bar.tsx:173 openCommandBar, called nowhere in mobile/*`

**Narrower claim —** Inside a document at 390 there is no visible way to open ⌘K — the mobile bar, its More menu and the sheets call no opener. The Desk header's `Find anything` button is the only phone entry point, and it exists only on /desk.


### F56 — Terracotta and clay ink fail 1.4.3 contrast everywhere they appear

*high · confidence 0.9 · width all · flag both · seats U5*

**Seat observed —** `--color-terracotta: #D4A090` and `--color-clay: #C4A57B` are used as text in 394 places against `--doc-paper: #FCFAF6` / `#FFFFFF`: computed ≈2.18:1, 2.27:1 and 2.24:1, under AA's 4.5:1 and under 3:1. This is the ink for `NEEDS ATTENTION · IN ONE PLACE`, every `role="alert"` band and `OVERDUE`.

**Verdict: NARROWS.** The tokens and their values are right and both fail AA as text (374 `text-[var(--color-clay|terracotta)]` sites), but the red-letter eyebrow is not that token — it is #C4836F, ≈2.95:1 on paper, still under 4.5.

**Evidence —** `globals.css:8, 22; grep counts 205 clay + 169 terracotta text sites; red-letter-zone.tsx:32 text-[#C4836F]`

**Narrower claim —** Clay (#C4A57B) and terracotta (#D4A090) are used as text in ~374 places at ≈2.2:1. The red-letter band's own eyebrow uses a darker #C4836F at ≈2.95:1 — still under AA's 4.5:1.


### F57 — The FF&E line she must edit is not editable on the paper

*high · confidence 0.85 · width all · flag both · seats U1*

**Seat observed —** A line prints `Møbler Lounge Chair — Bouclé · ×2 / Nordic Atelier` · `IN PRODUCTION` · `$5,700` and nothing else. `Sku / Finish / Material / Color Fabric / Exact Location` live in the Spec Book route, a full-screen room whose return restores neither scroll position nor fold state.

**Verdict: NARROWS.** The line does unfold in place on the paper with PO/movement/receiving, claims and a room-assignment select; what is absent from the unfold is the spec attribute set (Sku/Finish/Material/Colour/Location), which is spec-book-only.

**Evidence —** `line-unfold.tsx:4-5, 471-490 (assignment select); no sku/finish/material fields in the file; ffe-section.tsx:1009-1015 spec-book door`

**Narrower claim —** The FF&E line unfolds on the paper for PO, movement, receiving and room assignment — but its spec attributes (Sku, Finish, Material, Colour, Exact Location) are editable only in the spec-book route.


### F79 — Unsent POs carry the same visual weight as routine status

*medium · confidence 0.6 · width all · flag both · seats P2*

**Seat observed —** `NOT SENT` renders in the same bordered chip style as `RECEIVED / INSPECT` and `IN TRANSIT` — no colour or weight difference signals a PO sitting unsent while a vendor price expires.

**Verdict: NARROWS.** `not sent` is plain quiet-ink meta text in the row's provenance line, not a bordered chip; the bordered Stamp carries the lifecycle position. So it is quieter than the finding says, not equal.

**Evidence —** `orders-ledger.tsx:562-573 (doc-type-meta provenance line); :513-521 Stamp`

**Narrower claim —** An unsent PO is announced only as `not sent` in the row's small quiet-ink provenance line — quieter than the bordered lifecycle stamp beside it, not equal to it.


### F81 — `No client linked` silently blocks the money and approvals chain

*medium · confidence 0.6 · width 1440 · flag off · seats P4*

**Seat observed —** Chen Residence's subtitle reads `No client linked — attach one ↗` while the `Design authority` region and `Client approvals` both print as if available; nothing on either region says the chain cannot complete until a client is attached.

**Verdict: NARROWS.** The approvals region does say it: it prints an explicit blocking line naming the missing client. The money region says nothing of the kind.

**Evidence —** `approvals/project-approval-document.tsx:610-612 'Add the project client before assigning decision authority.'; money-region.tsx (no client precondition copy)`

**Narrower claim —** The money region prints as if available with no client attached; only the approvals region names the missing client as a blocker.


### F96 — The money region is folded by default

*low · confidence 0.75 · width all · flag both · seats U2*

**Seat observed —** `Design authority · no authority yet` prints as a fold seam (`UNFOLD ↓`) on Chen Residence; the `DRAW AN INVOICE` act is only visible after that click.

**Verdict: NARROWS.** The region folds by default only when authority, plan, committed and the accounts are all empty, and the default is withheld until every read settles — a project with money in motion opens.

**Evidence —** `money-region.tsx:186-194 defaultFolded (committedCents===0 && executedCount===0 && no plan lines && accountQuiet)`

**Narrower claim —** On a project with no authority, no committed money and a quiet account, the money region defaults folded, so `Draw an invoice` is one click away rather than on screen.


### F98 — The Receiving tab was never opened — project scoping unverified

*low · confidence 0.4 · width 1440 · flag off · seats U2*

**Seat observed —** The Orders sheet's tab row includes `RECEIVING`, visible in the same shot used for T13, but no shot in this pass opens that tab, so whether a damage claim can be filed there without losing the open project's context was not confirmed.

**Verdict: NARROWS.** Code answers what the shot did not: ReceivingBookPage is mounted with no project context at all, so a Receiving visit is studio-wide and cannot preserve the open project's frame.

**Evidence —** `orders-ledger.tsx:334 `<ReceivingBookPage onOpenDocument={openDocument} />` (no project prop); :326 briefProjectId passed only to Vendors`

**Narrower claim —** The Receiving tab is mounted with no project scoping prop at all — unlike Vendors, which receives briefProjectId — so it cannot be entered project-scoped.


### F101 — Whether a ledger sheet preserves her place from a document is unverified

*low · confidence 0.6 · width 1440 · flag off · seats P4*

**Seat observed —** The Orders sheet opened from the Desk slid over a dimmed background; no shot in this pass opens it from inside a document, so whether the document stays mounted and scrolled to where she was rather than resetting was not confirmed.

**Verdict: NARROWS.** Code answers it: DocSheet portals over a still-mounted document and only locks/restores body overflow and padding — the document is never unmounted, so scroll and fold state survive.

**Evidence —** `doc-sheet.tsx:243-269 (lockBodyScroll + restore), :378-380 createPortal(document.body); studio-drawer.tsx:515 sheet mounted beside the route`

**Narrower claim —** A ledger sheet portals over a still-mounted document and only locks body scroll, so her place is preserved; what remains unverified is only the visual confirmation.


---

## Stands — the code does what the finding says

### F01 — Shelves, rooms block and running index are absent below 1440

*blocker · confidence 0.95 · width 1280 · flag both · seats U1, U3, U5, P1, P2, P3, P4*

**Seat observed —** At 1280 the left rail is a 56px strip of unlabelled marks plus `In hand / <1m`: no `IN THIS DOCUMENT`, no `Rooms`, no `THE SHELVES`. `Plan room`, `Spec book`, `Mood boards`, `Call sheet` are not narrowed but removed, and an open shelf is force-closed on crossing below 1440.

**Verdict: STANDS.** The shelved block is width-gated in one place and an open shelf is force-closed on crossing below 1440; nothing narrows, everything is removed.

**Evidence —** `doc-spine.tsx:135 `{shelved && <div className="hidden min-[1440px]:block">}`; doc/[id]/page.tsx:552-562`


### F02 — At 1280 the spine is an unlabelled 56px icon rail

*high · confidence 0.95 · width 1280 · flag both · seats U1, U2, U3, U4, U5, P1, P2*

**Seat observed —** At 1180-1439 the seven section marks render as bare coloured bars with no printed text; the active section's label is `hidden min-[1440px]:block`, and `StrataMark`'s label becomes aria-label only. `← Put down` loses its word and becomes a bare `←`. The word `Project` appears nowhere in the rail.

**Verdict: STANDS.** StrataMark's `label` becomes role=img/aria-label only, never visible text; the active section's printed label and the word `Put down` are both min-[1440px] only.

**Evidence —** `strata-mark.tsx:80-83; doc-spine.tsx:52, 122-130`


### F03 — Care-stage FF&E spread is headed `Install`

*high · confidence 0.95 · width all · flag both · seats U1, U2, U3, U4, P1, P3, P4*

**Seat observed —** On Birch Hollow (`Care · ONGOING`, `The book closed Aug 25.`) the FF&E spread's heading is the literal word `Install` and its empty state reads `No FF&E lines are scheduled for installation.` — four lines below a paragraph that correctly reads `Plan the care work`.

**Verdict: STANDS.** The care spread mounts FFESection with mode="install", so the heading literal is `Install` and the empty line is the install one, on a Care document.

**Evidence —** `doc/[id]/page.tsx:1437-1439 mode="install" sectionKey="care"; ffe-section.tsx:1033-1038, 1232-1234`


### F04 — Nothing answers a phase-wide question; ⌘K `install` returns No match

*blocker · confidence 0.95 · width all · flag both · seats U1, U2, P1, P2, P3, P4*

**Seat observed —** ⌘K typed `install` returns only `No match — Browse the Help Center` / `SEARCH THE GUIDES →` and `Ask the Engine · "INSTALL" · ASK & PLACE`, while the Desk behind it prints the folder tab `ASPEN · INSTALL`. No Desk filter, tab or chip groups by phase.

**Verdict: STANDS.** A document row's ⌘K match string is `folderTab + title` only — the section word never enters it — and no registry alias contains `install`, so the typed query falls to the No-match row.

**Evidence —** `command-bar.tsx:252 match:`${folderTab(r)} ${r.title}`; registry.tsx:344-351; command-bar.tsx:631-637`


### F07 — The mobile bar's one big act is a truncated `MESSAGE THE CLI…`

*high · confidence 0.9 · width 390 · flag both · seats U1, U2, P1, P2, P4*

**Seat observed —** At 390 the bar reads `IN THIS DOCUMENT / Project` · `MESSAGE THE CLI…` · `··· MORE`, while the paper's red-letter zone says `Name the phases for this project / OPEN THE SCHEDULE`. Only `document-guide.tsx` registers a mobile primary; `red-letter-zone.tsx` registers none.

**Verdict: STANDS.** RedLetterZone registers no mobile primary anywhere in the file; the letterhead does, so the bar carries `Message {family}` while the red letter's act stays on the paper.

**Evidence —** `red-letter-zone.tsx:1-77 (no useMobilePrimaryAction); letterhead-instruments.tsx:303-313`

**Narrower claim —** The registrant is letterhead-instruments.tsx, not document-guide.tsx — the guide is not mounted at all when RedLetterZone stands in its place (page.tsx:1111-1118).


### F08 — Three-to-four competing doors answer one money question

*medium · confidence 0.85 · width all · flag both · seats U2, U5, P1, P3, P4*

**Seat observed —** The `Design authority` head prints `DRAW AN INVOICE`, `AMENDMENT` and `HOURS · THIS PROJECT ↗` side by side; the FF&E head adds `BILL 3 UNINVOICED`, ⌘K adds `Draw an invoice for {Project}` and the Desk's `BEGIN` column a fourth. Nothing signposts which is the door.

**Verdict: STANDS.** The money head ledger carries three acts; FF&E adds a fourth billing act and ⌘K a fifth pre-addressed one. No leader is signposted across them.

**Evidence —** `money-region.tsx:245-273; ffe-section.tsx:1085-1108 (Bill n uninvoiced); command-bar.tsx:522-529`


### F09 — The money region is named `Design authority` and carries no money scent

*high · confidence 0.9 · width all · flag both · seats U4, P1, P2, P3*

**Seat observed —** The folded seam reads `Design authority   NO AUTHORITY YET · $0 COMMITTED   UNFOLD ↓`; unfolded the head is `MONEY · ONE REGION` / `Design authority`. The word money appears only in that small eyebrow, and the running-index row prints `Design authority` alone.

**Verdict: STANDS.** Both the seam name and the region head name are the literal `Design authority`; the word money appears only in the 9px eyebrow, and the running-index label is the same string.

**Evidence —** `money-region.tsx:282, 299-301; document-index.ts:47 label 'Design authority'`


### F10 — The seven g-chords work but are printed nowhere on screen

*high · confidence 0.9 · width all · flag both · seats U1, U5, P1, P3*

**Seat observed —** `g l`, `g p`, `g r`, `g o`, `g a`, `g h`, `g t` all route correctly (probe §3). A full-text sweep of `/desk` and `/doc/[id]` finds no chord hint; the badges print only inside ⌘K rows, which she must open with ⌘K to see. `/` and `?` register no handler at all.

**Verdict: STANDS.** The chords are read straight off the registry and fire globally, but the only place a chord is ever printed is a ⌘K row's trailing badge.

**Evidence —** `registry-shortcuts.tsx:42-46, 66-105; command-bar.tsx:763-768 (only render site of row.shortcut)`


### F11 — Ledger sheet focus-restore silently no-ops from the Studio books menu

*medium · confidence 0.95 · width all · flag both · seats U2, U5, P2, P4*

**Seat observed —** Opening Orders from inside the `Studio books` disclosure both opens `DocSheet` and unmounts the disclosure the trigger lived in; `DocSheet`'s guard `if (!focusTarget?.isConnected) return;` then does nothing and focus lands on `<body>` (live-verified).

**Verdict: STANDS.** DocSheet captures the pre-open activeElement and restores it only `if (focusTarget.isConnected)`; the books disclosure unmounts its own trigger, so the restore silently no-ops.

**Evidence —** `doc-sheet.tsx:243-269, guard at :262`


### F12 — The `Knowledge` shelf is a redirect that names itself three ways

*medium · confidence 0.9 · width 1440 · flag both · seats U1, U4, P1, P3*

**Seat observed —** The row reads `Knowledge   STUDIO LIBRARY →`; the leaf's eyebrow reads `STUDIO LIBRARY · CROSS-PROJECT`, its body `STUDIO LIBRARY — CROSS-PROJECT STANDARDS. NOTHING FILED FOR THIS PROJECT.`, its act `OPEN THE STUDIO LIBRARY →`. It holds nothing and duplicates a permanent drawer door.

**Verdict: STANDS.** The leaf holds no project content at all — one note plus a link to /library, a door the Studio Drawer already carries permanently — and the row, eyebrow, note and act each name it differently.

**Evidence —** `knowledge-leaf.tsx:15-28; shelves.ts:62-68`


### F13 — ⌘K Recent lists two rows both titled `Aspen`

*medium · confidence 0.8 · width all · flag off · seats U2, U3, P2, P3*

**Seat observed —** `RECENT` prints `Birch / BIRCH HOLLOW`, `Aspen / ASPEN LOFT REFRESH` and `Aspen / ASPEN LOFT — LIVING ROOM REFRESH` stacked — a live project and a sent proposal sharing the same bold first word, separated only by a smaller sub-label.

**Verdict: STANDS.** Both Recent rows take their bold label from folderTab (the family word) with only the smaller `sub` (row.title) to tell a project from a proposal.

**Evidence —** `command-bar.tsx:245-253 documentRow, :297-310 recentRow`


### F14 — Index, rooms and shelves vanish on install and care documents

*blocker · confidence 0.97 · width all · flag both · seats U1, U3, P1*

**Seat observed —** On `w1440-doc-install` and `w1440-doc-care` the spine reads `← PUT DOWN`, seven marks, the active label and `● IN HAND / under a min` — no `IN THIS DOCUMENT`, no `Rooms`, no `THE SHELVES`. `DocSpineShelvedBlocks` mounts only when `engagement_kind === 'project' && active_section === 'project'`.

**Verdict: STANDS.** The whole shelved block is gated on active_section === 'project', so install and care documents are handed `shelved = null` and lose index, rooms and shelves together.

**Evidence —** `doc/[id]/page.tsx:934-937 `engagement_kind === 'project' && row.project_id && row.active_section === 'project'``


### F17 — Three different things are called a `room`

*high · confidence 0.9 · width all · flag both · seats U1, U4, P4*

**Seat observed —** The drawer's `The Rooms` (`g r`) opens `THE ROOMS · 6 scanned rooms`, cards titled by person (`Lily Tanaka` / `Kitchen · scanned Aug 24`); the spine's `Rooms` block lists FF&E groups; `Plan room` is a shelf of drawings. P4 took `The Rooms` first looking for a sofa and backed out.

**Verdict: STANDS.** Three distinct registries own the word: /rooms is a gallery of scanned rooms, the spine's Rooms block lists project_rooms, and Plan room is a drawings shelf.

**Evidence —** `registry.tsx:106-119; spine-rooms-block.tsx:19-28 fed docRooms (page.tsx:940); shelves.ts:34-40`


### F18 — Five of seven stage default acts are `Review {X}`, a shrug

*high · confidence 0.9 · width all · flag both · seats U2, U4, P1*

**Seat observed —** `stageCopy`'s action labels: `Review the brief`, `Continue Discovery`, `Open Drafting Room`, `Review proposal` / `Review signing controls`, `Review active work`, `Review installation`, `Review closeout`. The default need action is also `Review now`.

**Verdict: STANDS.** stageCopy's seven action labels are verbatim as quoted; five begin `Review`, and the default need action is `Review now`.

**Evidence —** `document-guide.ts:91-141; :242 default 'Review now'`


### F21 — ⌘K never restores focus to its trigger on close

*medium · confidence 0.95 · width all · flag both · seats U2, U5, P2*

**Seat observed —** `command-bar.tsx` has one focus line — focusing the input on open — and no capture or restore of the pre-open `document.activeElement`. Live-verified: focus the `Plan room` shelf button, ⌘K, Escape, and focus lands on `<body>`. The shelf leaf, margin panel and ledger sheets all restore correctly.

**Verdict: STANDS.** command-bar.tsx has exactly one focus call — the input on open — and never reads or restores document.activeElement.

**Evidence —** `command-bar.tsx:204 inputRef, :242 only .focus() in the file (grep: no activeElement)`


### F22 — Flag-off, an absent call sheet looks like an empty crew

*medium · confidence 0.8 · width all · flag off · seats U2, U5, P1*

**Seat observed —** With `call-sheet` on the letterhead prints `CALL SHEET · 0`, the shelf row reads `Call sheet   NOBODY ON IT YET →` and the foot band `– You're on the call sheet as lead. Who else is on the job?`. With the flag off none of these mount at all — feature-absent and roster-empty are one picture.

**Verdict: STANDS.** Every call-sheet doorway is gated on the same flag, so with it off the shelf row, the letterhead instrument and the kickoff band all fail to mount rather than reporting an empty roster.

**Evidence —** `shelves.ts:106 callSheetEnabled filter; letterhead-instruments.tsx:283, 355; registry.tsx:236 scope 'document'`


### F23 — `NEEDS YOUR HAND 8` prints over four folios

*medium · confidence 0.95 · width all · flag both · seats U1, P1, P2*

**Seat observed —** The eyebrow reads `NEEDS YOUR HAND  8`; four folio cards render; the footer reads `4 IN REACH · 4 FOLDED BELOW` on the left and `REVEAL 4 MORE FOLIOS ↓` on the right. Identical at 1280 and 390. Half the attention queue is folded on first paint.

**Verdict: STANDS.** The eyebrow counts every need while the folio list caps its reach at four and folds the rest behind a reveal.

**Evidence —** `desk/page.tsx:339-341; folder-card.tsx:104-135`


### F24 — The two Desk begin verbs carry no distinguishing sub-label

*medium · confidence 0.85 · width all · flag both · seats U2, P1, P2*

**Seat observed —** The header prints `＋ CAPTURE A LEAD` and `＋ OPEN A PROJECT` bare. Their distinguishing sub-labels — `BEGIN A BRIEF` and `NO PROPOSAL NEEDED` — exist only inside ⌘K's `BEGIN` group, and `Capture a lead` is deliberately omitted from the Desk's own `BEGIN` column.

**Verdict: STANDS.** Both header acts render as bare DocumentActions with no sub-label; the distinguishing subLabels live only on the registry entries ⌘K reads.

**Evidence —** `desk/page.tsx:201-220; registry.tsx:253-278 subLabels; desk-contents.tsx:220-236 excludes capture-lead`


### F25 — A held room has no visible release control once scrolled away

*medium · confidence 0.5 · width 1440 · flag both · seats U2, U5, P2*

**Seat observed —** The letterhead's `In hand · {Room}` line is plain text with no × or close affordance; the only release is clicking the same Rooms-block row again. Source-confirmed only — the local seed has no project with both rooms and `active_section='project'` (probe §7).

**Verdict: STANDS.** `In hand · {Room}` is a plain <p> with no control; the only release is re-clicking the same aria-pressed Rooms row in the ≥1440 spine.

**Evidence —** `doc-letterhead.tsx:64-71; spine-rooms-block.tsx:44-47 aria-pressed toggle`


### F26 — The money explainer is a dense paragraph that names its own old UI

*medium · confidence 0.9 · width 1440 · flag off · seats U3, U4, P2*

**Seat observed —** Beneath four terse label rows sits one unbroken paragraph: `Authority → plan → committed → moved. Moved is the accounts' committed figure … not funds disbursed…` ending `Absorbs today's four separate bands: design authority, working budget, authorizations & trade scopes, the accounts.`

**Verdict: STANDS.** One unbroken paragraph, verbatim, ending on a sentence that names the four bands the region replaced.

**Evidence —** `money-region.tsx:327-336`


### F28 — At 390 the `ADD TO PROJECT` plate covers the FF&E heading

*blocker · confidence 0.9 · width 390 · flag off · seats U3, P4*

**Seat observed —** The heading wraps to three lines (`Pro` / `·` / `FF&E`) and the solid dark scored-ink `ADD TO PROJECT` leader sits directly on top of the middle line, physically covering `ject` — confirmed by pixel crop of `m390-doc-project-rich.png` (y≈3280-3600).

**Verdict: STANDS.** RegionHead is a two-track grid with no responsive stack; the 1fr track shrinks under the inked leader and the h2 carries no truncation or wrap guard, so the name overflows beneath it at 390.

**Evidence —** `region-head.tsx:91 grid-cols-[1fr_auto]; :97-104 untruncated h2; ffe-section.tsx:1117-1125 head with inked leader`


### F29 — The roster cannot be reached from the Desk at all

*high · confidence 0.95 · width all · flag both · seats U1, P3*

**Seat observed —** `Call sheet` is `scope: 'document'` and is filtered out of Desk Contents, out of ⌘K's unfiltered `Rooms & ledgers` group, and out of typed ⌘K unless a project document is in hand. Desk Contents prints `ROOMS: Library · People · The Rooms` — `People` is the studio directory, not this job's roster.

**Verdict: STANDS.** Desk Contents filters both lists to scope==='global' and the Call sheet is scope 'document'; ⌘K's unfiltered group filters the same way and its typed branch gates on a project doc in hand.

**Evidence —** `desk-contents.tsx:136-143; command-bar.tsx:574-581, 610-616; registry.tsx:236`


### F30 — The Mood boards shelf opens onto another fold, with no way to start one

*high · confidence 0.85 · width 1440 · flag both · seats U1, P1*

**Seat observed —** Clicking `Mood boards / NO BOARDS YET →` opens a leaf headed `MOOD BOARDS · SHARED & DRAFT` / `Mood boards` / `✕ CLOSE` whose entire body is one more folded row: `Mood boards   NO BOARDS YET   UNFOLD ↓`. No `Start a board`. The Plan room leaf ends in `Open the plan room`.

**Verdict: STANDS.** The boards region's fold default is `boardsEmpty`, so an empty shelf opens onto a seam; the `New board` ledger act exists but is on the head the seam replaced.

**Evidence —** `project-mood-boards.tsx:209-213 defaultFolded: boardsEmpty; :259-266 'New board' ledger; page.tsx:1619 canCreateBoards`


### F33 — ⌘K's placeholder and fallback both invite `ask the Engine`

*high · confidence 0.95 · width all · flag off · seats U4*

**Seat observed —** The input placeholder reads `Find a document or a ledger — or ask the Engine…`; the no-match group eyebrow reads `Ask the Engine` and its results header `The Engine · "{query}"` with the row sublabel `'{query}' · ask & place`. This is the first text a designer reads inside search.

**Verdict: STANDS.** The placeholder, the input's aria-label, the always-appended row and the results header all name the Engine, verbatim.

**Evidence —** `command-bar.tsx:792-793, 640-646, 826, 833`


### F34 — The FF&E head leads with `ADD TO PROJECT` and shows three acts at once

*medium · confidence 0.85 · width all · flag both · seats U2, P1*

**Seat observed —** The head's ledger prints, in order: `ADD TO PROJECT` (filled dark plate), `BILL 3 UNINVOICED` (scored underline), `SPEC BOOK →` (scored underline), `FOLD ↑`. On a project with three lines already in production, the inked leader asks her to add a fourth.

**Verdict: STANDS.** The ledger is built leader-first: `Add to project` heads it whenever release is not in the head, then Bill, then Spec book — and RegionHead inks index 0 unconditionally.

**Evidence —** `ffe-section.tsx:1016-1023 ffeLedger order; region-head.tsx:115-117 index===0 ? 'inked'`


### F35 — Two regions on one paper are both called `Schedule`

*high · confidence 0.95 · width all · flag both · seats U1, U2*

**Seat observed —** About 120px apart the paper prints a fold seam `Schedule … UNFOLD ↓` (the Rule, `schedule-rule-title`) and a region head `Schedule / 0 phases · nothing active · next milestone —  FOLD ↑` (the ledger, `project-schedule-title`). The index carries one row, wired to the ledger only.

**Verdict: STANDS.** Two regions on one project paper both pass name="Schedule" with different heading ids, and the running index carries one row wired to the ledger's id.

**Evidence —** `schedule-rule-region.tsx:46 HEADING_ID 'schedule-rule-title', :186/:205 name="Schedule"; schedule-spine.tsx:1070/1080 name="Schedule"; document-index.ts:41`


### F36 — The proposal guide says `Review signing controls` instead of the live act

*medium · confidence 0.85 · width all · flag both · seats U2, U4*

**Seat observed —** The sent-proposal fallthrough prints headline `Wait for the client's signature` with action `REVIEW SIGNING CONTROLS`; the real act, `NUDGE CLIENT USER`, sits ~200px lower. The same phrase serves the draft-fallback branch, and `Review countersign controls` the client_signed branch.

**Verdict: STANDS.** The sent-proposal fallthrough's action label is `Review signing controls`, the same phrase as the draft fallback, with `Review countersign controls` on client_signed.

**Evidence —** `document-guide.ts:261-313, fallthrough at :308-313`


### F38 — Desk Contents names doors without saying what is behind them

*medium · confidence 0.85 · width all · flag both · seats U1, U4*

**Seat observed —** `THE STUDIO` prints three columns — `ROOMS: Library ↗ / People ↗ / The Rooms ↗`, `LEDGERS: Orders SHEET / Accounts SHEET / Hours SHEET / The Post SHEET`, `BEGIN: …`. `SHEET` is the only sub-label and describes presentation, not contents; nothing says receiving or damage claims live under `Orders`.

**Verdict: STANDS.** ContentsRow prints only the label plus a `↗` glyph (rooms) or the literal word `Sheet` (ledgers); no registry subLabel is passed through.

**Evidence —** `desk-contents.tsx:102-118 (only variants); :185-238 rows pass label only`


### F39 — Studio pulse is folded by default and names nothing

*medium · confidence 0.85 · width all · flag both · seats U1, P2*

**Seat observed —** `STUDIO PULSE` / `4 moving · 3 reconnecting · Field quiet` / `1 decision is overdue, and 4 pieces are on the way.` / `7 STUDIO ITEMS   OPEN PULSE ↓`. No project name, no phase, no due date, and `reconnecting` carries no inline gloss — the one cross-project organ is a folded adjective.

**Verdict: STANDS.** The disclosure starts collapsed and its preview is a phrase of counts plus a gate sentence; no project name, phase or date is in the folded state.

**Evidence —** `studio-pulse.tsx:74 useState(false); :40-72 studioPulsePreview; :95-101 countLabel/preview`


### F42 — Seven section names and `The Patina Six` both print on one paper

*medium · confidence 0.85 · width 1440 · flag both · seats U4, P3*

**Seat observed —** The spine's chrome uses Brief/Discovery/Direction/Proposal/Project/Install/Care, while the same document's Schedule region prints, verbatim: `Consultation · Schematic Design · Design Development · Procurement & Orders · Installation & Styling · Completion — the studio's standard six.`

**Verdict: STANDS.** The Patina Six heading and the six phase names are printed verbatim by the schedule's own birth block, on a paper whose spine prints the seven section names.

**Evidence —** `schedule-birth.tsx:58-60; section-derivation.ts:59-77`


### F43 — The guide's act names a different verb than the row beneath it

*low · confidence 0.75 · width 1440 · flag off · seats U2, P3*

**Seat observed —** The guide's action reads `ADD PROJECT TYPE AND NAMED ROOMS` under the headline `Complete Discovery`; the first checklist row directly below is labelled `Scope & rooms`. One input, three names, adjacent on screen.

**Verdict: STANDS.** On the needs_input branch the act is replaced by `Add {firstInput.label}` from an input fact, a string minted independently of the checklist row's own name.

**Evidence —** `document-guide.ts:143-170, label at :157`


### F44 — Brief chips print raw template text (`15k_50k`, `3 6 Months`)

*low · confidence 0.85 · width 1440 · flag off · seats U2, P3*

**Seat observed —** The BUDGET chip reads `15k_50k` (literal underscore) and the TIMELINE chip reads `3 6 Months` (missing separator) — the facts a fast read of T1/T3 depends on, printed unformatted.

**Verdict: STANDS.** budget_range is printed raw with no formatter, so the underscore survives; timeline is passed through `pretty`, which turns underscores into spaces and title-cases, yielding `3 6 Months`.

**Evidence —** `brief-section.tsx:29 pretty(); :97 Stat value={lead.budget_range} (unformatted); :98 pretty(lead.timeline)`


### F45 — Opening a shelf re-wraps the paper she was reading

*low · confidence 0.85 · width 1440 · flag both · seats U1, P1*

**Seat observed —** With the Spec book or Knowledge leaf open the FF&E head wraps to two lines — `Project ·` / `FF&E` — and its status truncates to `1 group · 3 li…`. Closed, the same head sits on one line. The leaf is declared non-modal, yet the reading position visibly moves under it.

**Verdict: STANDS.** The leaf is fixed and cannot reflow anything itself — but the paper is given `padding-left: 344px` while a shelf is open below a 2020px viewport, which narrows the measure and re-wraps the region heads.

**Evidence —** `app/globals.css:738-750; doc/[id]/page.tsx:1073 data-shelf-open; shelf-panel.tsx:94 fixed leaf`


### F46 — The Orders sheet prints `PUT BACK · ESC` twice

*low · confidence 0.85 · width 1440 · flag both · seats U2, P1*

**Seat observed —** `PUT BACK · ESC` appears once at the top-right of the screen and again inside the dialog's own `ORDERS · LEDGER` header row, stacked directly above each other.

**Verdict: STANDS.** The drawer opens DocSheet without an `icon`, so DocSheet renders its own fallback close row, while OrdersLedger mounts a second DocSheetHead of its own — both print the same string.

**Evidence —** `studio-drawer.tsx:515-521 (no icon prop); doc-sheet.tsx:367-376 fallback 'Put back · Esc'; orders-ledger.tsx:287 DocSheetHead; doc-sheet.tsx:186/194`


### F47 — `The Post` shows `3 NEW` on mobile and an unlabelled dot on desktop

*low · confidence 0.9 · width 390 · flag both · seats U1, P4*

**Seat observed —** The 390 `More` menu prints `The Post   3 NEW`; the ≥1180 drawer prints `THE POST` with an unlabelled dot. The same object reports a count at one width and a state at another.

**Verdict: STANDS.** The drawer's bell renders an unlabelled 6px dot with the count only in aria-label; the mobile More menu prints `{n} new` as text.

**Evidence —** `studio-drawer.tsx:484-499 (dot + aria-label only); mobile-bar.tsx:299-302`


### F48 — Spec book has no door on install or care

*blocker · confidence 0.92 · width all · flag both · seats U1*

**Seat observed —** The `Spec book →` link renders inside `{mode === 'project' && …}`; in `mode === 'install'` the head prints only `Install` plus meta. There is no spec-book entry in `STUDIO_ROOMS`/`LEDGERS`/`VERBS`, so `matchSurfaces` cannot find it and ⌘K has no spec-book row in either branch.

**Verdict: STANDS.** The spec-book link is inside `mode === 'project'` and the RegionHead ledger that carries the entry only renders in project mode; no spec-book entry exists in any registry array, so matchSurfaces can never return one.

**Evidence —** `ffe-section.tsx:1009-1015 ffeSpecBookEntry (project RegionHead only), :1058-1064 link gated on mode==='project'; registry.tsx:77-327`


### F50 — The plan room disappears from ⌘K the moment she types `plan`

*high · confidence 0.93 · width all · flag both · seats U1*

**Seat observed —** `The plan room` · `this project · the current set` enters the `This surface` group only in the empty-query branch and carries `match: ''`. The typed branch never re-adds those rows and `matchSurfaces()` has no plan-room entry, so typing `plan room` returns `No match — Browse the Help Center`.

**Verdict: STANDS.** `The plan room` is pushed only in the empty-query branch and carries match:'' ; the typed branch rebuilds the list from matchSurfaces, which has no plan-room entry.

**Evidence —** `command-bar.tsx:556-572 (match: ''); :589-617 typed branch; registry.tsx:344-351`


### F51 — The Drafting Room's only Desk doorway is ⌘K

*high · confidence 0.85 · width all · flag off · seats U5*

**Seat observed —** The Drafting Room is explicitly excluded from Desk Contents' Begin list and reachable only via ⌘K → `Open the Drafting Room`. A keyboard user unaware of ⌘K has no path in from the Desk at all.

**Verdict: STANDS.** Desk Contents filters rooms to scope==='global' and drafting-room is scope 'document', so ⌘K's `Open the Drafting Room` row is the only Desk door.

**Evidence —** `desk-contents.tsx:136-139; registry.tsx:120-133 scope 'document'; command-bar.tsx:534-541`


### F52 — `MESSAGE THE CLIENT` leads the letterhead on a doc with no client

*high · confidence 0.93 · width all · flag both · seats U1*

**Seat observed —** Chen Residence prints title, then `No client linked — attach one ↗`, then `MESSAGE THE CLIENT · PREVIEW AS THE CLIENT · SHARING · MILESTONES · CALL SHEET · 0` with `MESSAGE THE CLIENT` inked as leader. `canSendNote = Boolean(projectId || clientProfileId)` never asks whether a client exists.

**Verdict: STANDS.** The leader's gate is `Boolean(projectId || clientProfileId)` — a project with no client passes on projectId alone, so the inked leader offers a message to a client that does not exist.

**Evidence —** `letterhead-instruments.tsx:301 canSendNote; :323-330 primary act; household-chip.tsx:57-65 'No client linked'`


### F53 — Answering a client question happens off the document

*high · confidence 0.8 · width all · flag both · seats P1*

**Seat observed —** The paper offers `MESSAGE THE CLIENT`, an outbound composer captioned `The Pulse handles Fridays; this is for now. It lands in {client}'s portal messages.` Her question lives behind `THE POST` (dot only) or `/people?thread=`. Chen's margin holds no message kind at all.

**Verdict: STANDS.** The letterhead's only message affordance is an outbound composer whose caption sends into the client's portal; inbound correspondence is a registry ledger opening its own sheet, off the paper.

**Evidence —** `letterhead-instruments.tsx:324-330, 368-370; registry.tsx:214-227 the-post opens openPost()`


### F54 — The rooms rail exists on direction and disappears on the project

*high · confidence 0.85 · width all · flag on · seats P1*

**Seat observed —** `wt-speccing-1440` (a direction document) carries `ROOMS   All   + Add a room` above the scheme, plus `BOARDS / START A BOARD` and `Reach into the library…`. `wt-delivery-project-1440` carries none of them; its FF&E group is still `Unsorted` and its room verb is the foot-of-list `ADD A ROOM`.

**Verdict: STANDS.** The rooms rail is a Speccing-table slot; `project` derives the Delivery table, so the rail is structurally unavailable once the project starts.

**Evidence —** `table-derivation.ts:59-68; table-frame.tsx:55-57 rooms-rail gated on table==='speccing'`


### F55 — No bypass-blocks control anywhere in the layout

*high · confidence 0.6 · width all · flag both · seats U5*

**Seat observed —** The `(document)` layout mounts the route boundary, five providers, the route, LogStrip, StudioDrawer, RegistryShortcuts, CommandBar and the mobile shell; a grep for `skip to` / `SkipLink` across the document app and components returns zero hits. A Tab-only user traverses the whole spine each load.

**Verdict: STANDS.** A repo-wide grep for a skip link across the document app and components returns zero hits.

**Evidence —** `grep 'skip to|SkipLink|skip-link' across app/ and components/ → 0; app/(document)/layout.tsx:49-103`


### F58 — The same FF&E line reads `RECEIVED` on paper and `DELIVERED` in the spec book

*high · confidence 0.8 · width 1440 · flag off · seats P4*

**Seat observed —** On the paper `Custom Walnut Sectional — 3 pc` carries the stamp `RECEIVED`; two clicks later the Spec book shelf leaf prints the same line as `DELIVERED $6,800`. Received-not-yet-installed and delivered are different real-world states, told about one piece at one moment.

**Verdict: STANDS.** The shelf leaf prints `prettyStatus(row.status)` — the raw FF&E item status — while the paper's stamp is derived from the richer lifecycle, so the two can name one line differently at one moment.

**Evidence —** `spec-book-leaf.tsx:94-101 value={prettyStatus(row.status)}; ffe-section.tsx:769-793 stamp derived per row`


### F59 — `Committed` means $0 in one region and $14,420 in another

*high · confidence 0.8 · width 1440 · flag off · seats P4*

**Seat observed —** The `Design authority` region's own `Committed` row reads `nothing executed yet` ($0), while the folded seam `The accounts · this project` three screens down prints `$0 BUDGET · $14,420 COMMITTED · 20% MARGIN`. One money word, two numbers, one document.

**Verdict: STANDS.** The region's `Committed` rung and the nested accounts band compute independently — the rung from executed instruments, the band's figure from the account read — so one document prints two `committed` numbers.

**Evidence —** `money-region.tsx:155-171 committedFigure vs movedFigure/account.committedCents; :337-346 AccountBand mounted in the same body`


### F60 — The room lens has no substitute below 1440

*high · confidence 0.8 · width 1280 · flag off · seats U3*

**Seat observed —** The only mechanism to hold a room and lift it across the FF&E list is the ≥1440 spine Rooms block; a live resize below 1440 auto-releases any held room (`room-lens-context.tsx`: "there is no put-down affordance under the full spine"). No filter, chip or search-by-room exists at 1280 or 390.

**Verdict: STANDS.** The lens is written only by the ≥1440 spine and auto-releases on dropping below it, by its own stated reasoning; no filter, chip or search-by-room exists at any narrower width.

**Evidence —** `room-lens-context.tsx:8-10 docstring, :35 LENS_WIDTH, :46-55 release on change`


### F61 — The index says `NO AUTHORITY YET` over $14,420 in motion

*high · confidence 0.9 · width 1440 · flag both · seats U1*

**Seat observed —** The running-index row reads `Design authority / NO AUTHORITY YET`. Unfolding the same region prints `Moved · $14,420 in motion — ordered through installed` and an accounts band `The accounts · this project  $0 BUDGET · $14,420 COMMITTED · 20% MARGIN`. The index reports the one tier that is empty.

**Verdict: STANDS.** The index's money value reads only the authority query — authorized dollars or `No authority yet` — and never the committed or moved figures the region prints beneath it.

**Evidence —** `spine-shelved-blocks.tsx:109-115; money-region.tsx:155-171 movedFigure`


### F62 — Boards have three doors with three different names

*medium · confidence 0.85 · width all · flag both · seats P1*

**Seat observed —** `Mood boards` (spine shelf, ≥1440, project stage), `RECENT BOARDS` (Desk strip) and — flag-on, direction stage only — `BOARDS / START A BOARD` on the paper. The Drafting Room registry entry also aliases `boards, moodboards`. Three doors, none open at the same time as either other.

**Verdict: STANDS.** Three separate registrations name boards three ways, and the Drafting Room's aliases claim the word too; the Speccing strip and the project shelf can never stand at the same stage.

**Evidence —** `shelves.ts:48-54 'Mood boards'; registry.tsx:120-133 aliases boards/moodboards; table-frame.tsx:63 boards-strip speccing-only; recent-boards-strip.tsx:26`


### F63 — Three `add a room` verbs mean three different things

*medium · confidence 0.8 · width all · flag both · seats U1*

**Seat observed —** Flag-off, `ADD A ROOM` prints at the foot of the FF&E room list (adds an FF&E group). Flag-on, the Speccing table's rail prints `ROOMS  All  + Add a room` at the top of the paper (adds a room to the scheme). `/rooms` is a gallery of scanned rooms with no add verb at all.

**Verdict: STANDS.** AddRoomInline sits at the foot of the FF&E list (an FF&E group), the Speccing rooms-rail slot adds a scheme room, and /rooms is a scan gallery with no add verb.

**Evidence —** `ffe-section.tsx:1294 AddRoomInline; table-frame.tsx:55-57 rooms-rail; registry.tsx:106-119 The Rooms`


### F64 — Two acts open the same Drafting Room, worded differently

*medium · confidence 0.85 · width all · flag both · seats U2*

**Seat observed —** The guide's action reads `OPEN DRAFTING ROOM`. Directly below it the Direction·v1 block prints its own act, `CONTINUE DRAFTING`, for the same destination (`Not started yet — open the Drafting Room to write it`). Both scored, both live, ~250px apart on one screen.

**Verdict: STANDS.** The guide's direction act is `Open Drafting Room` while the Direction block directly below prints its own `Continue drafting` for the same room.

**Evidence —** `document-guide.ts:106-112, 388-397; proposal-instruments.tsx:287, 378`


### F65 — Nothing on the Desk says what changed while she was gone

*medium · confidence 0.85 · width all · flag both · seats P1*

**Seat observed —** The Desk prints a greeting, the date, `NEEDS YOUR HAND 8`, folio cards with need lines, and `STUDIO PULSE  4 moving · 3 reconnecting · Field quiet`. No folio carries an age, no line is marked new, and the pulse counts are levels rather than changes.

**Verdict: STANDS.** The Desk's two organs both report levels: folio need lines carry no age or new marker, and the pulse preview is a phrase of current counts.

**Evidence —** `desk/page.tsx:339-380; studio-pulse.tsx:40-72 counts-only preview; folder-card.tsx:283-284 need text/stamp`


### F66 — The Drafting Room uses a different visual language from the paper

*medium · confidence 0.6 · width 1440 · flag off · seats U3*

**Seat observed —** Scope/Vision/Offer facets (`Rooms`, `FF&E`, `Palette`, `Boards`, `Phases`, `Exclusions`, `Payments`, `Terms`) each render inside a bordered, rounded card with a checkbox and chevron; `+ Add Room` and `ESTIMATE · ROM ESTIMATE` render as pills — none of it the paper's scored-ink language.

**Verdict: STANDS.** The Drafting Room route is explicitly unflagged and rides the (document) layout while composing from portal-level components, not the paper's scored-ink DocumentAction grammar.

**Evidence —** `app/(document)/drafting/[proposalId]/page.tsx:11, 20-25`


### F67 — Orders is a global cross-project ledger, not a project-scoped view

*medium · confidence 0.6 · width 1440 · flag off · seats U2*

**Seat observed —** The door (`g o` or Studio books → Orders) opens a studio-wide sheet filterable by `PROJECT · ALL / CHEN RESIDENCE / OLSEN LAKE HOUSE`. T13's bar is ack state per PO without leaving the project's frame; she must instead consult and filter a cross-project register.

**Verdict: STANDS.** The ledger states its own scope in its front matter and offers a project lens as a filter over a studio-wide register, not a project-scoped view.

**Evidence —** `orders-ledger.tsx:295 'Every project's purchase orders, gathered in one studio register.'; :198-233 projectLens filter`


### F70 — Three equal Worktable add-actions get three different visual weights

*medium · confidence 0.6 · width 1440 · flag on · seats U3*

**Seat observed —** `+ Add Item` renders as a solid tan-filled box, `+ Add Allowance` as a white-bordered box and `+ Add TBD` as plain unstyled text — three conceptually parallel ways to start a scheme line, under copy that reads `The scheme starts loose — a first line is enough`.

**Verdict: STANDS.** The three verbs are minted in two different files with different components, so nothing enforces one weight across the trio.

**Evidence —** `scope-builder/ffe-schedule-builder.tsx:1468 '+ Add Item'; portal/ffe/add-ffe-item-controls.tsx:111 '+ Add Allowance', :114 '+ Add TBD'`


### F71 — Intake's `opens when…` seams point at the wrong stages

*medium · confidence 0.88 · width all · flag on · seats U1*

**Seat observed —** Flag-on, the brief document ends with three inert rows: `Schedule  OPENS WHEN THE PROJECT BEGINS`, `Project · FF&E  OPENS WITH THE DIRECTION`, `Design authority  OPENS WHEN THE PROJECT BEGINS`. That device is what the install and care spreads need and lack — they lose regions silently.

**Verdict: STANDS.** The three seams print verbatim as quoted, and the device is mounted only on the intake table — install and care get no such honest-absence line.

**Evidence —** `worktable/future-seam.tsx:39-52; table-frame.tsx:59 IntakeFutureSeams gated on table==='intake'`


### F72 — The Rooms block disappears at zero rooms with no placeholder

*medium · confidence 0.55 · width 1440 · flag off · seats U3*

**Seat observed —** On Chen Residence (0 `project_rooms`) the spine jumps from `IN THIS DOCUMENT` straight to `THE SHELVES` with no `Rooms` heading or row — while every shelf in the same block prints its own placeholder even when empty (`Plan room · Nothing filed`, `Mood boards · No boards yet`).

**Verdict: STANDS.** SpineRoomsBlock returns null at zero rooms, while every shelf row in the same block prints its own empty status string.

**Evidence —** `spine-rooms-block.tsx:28 `if (rooms.length === 0) return null;`; spine-shelved-blocks.tsx:128-150 shelf statuses`


### F73 — One boxed control breaks the flat scored-ink grammar

*medium · confidence 0.65 · width 1440 · flag off · seats U3*

**Seat observed —** `Sync from the schedule` renders inside a visible rounded-corner bordered box — the only bordered button on the whole page — while every other act on the same region (`Draw an invoice`, `Amendment`, `Hours · this project`, `Draft a trade scope`) is a bare underlined DM-mono word.

**Verdict: STANDS.** `Sync from the schedule` is a design-system <Button variant="secondary"> — a bordered control — where every sibling act on the money region is a scored-ink DocumentAction.

**Evidence —** `derived-budget-grid.tsx:228-234; money-region.tsx:245-273 DocumentAction ledger`


### F74 — The drawer is hidden below 1180; Orders costs 2+ taps at 390

*medium · confidence 0.75 · width 390 · flag off · seats U3*

**Seat observed —** The persistent Studio Drawer strip that gives one-tap or one-chord access to Orders/Accounts/Hours/The Post at ≥1180 is hidden below 1180; at 390 the same ledgers are reachable only via the mobile bar's `More` menu → `Studio books` → a book row.

**Verdict: STANDS.** The drawer strip is min-[1180px]:grid and hidden below it, so at 390 the same books cost More → Studio books → a book row.

**Evidence —** `studio-drawer.tsx:277; mobile-bar.tsx:222-235, 319`


### F75 — The guide's need-reason reads as a system log, not her voice

*medium · confidence 0.9 · width all · flag both · seats U4*

**Seat observed —** The needs-attention branch prints, verbatim: `This action comes from the operational signals available on the current document.`

**Verdict: STANDS.** The needs-attention branch's reason string is verbatim as quoted.

**Evidence —** `document-guide.ts:374-381`


### F76 — The money row `Moved` is not decodable from the word alone

*medium · confidence 0.85 · width 1440 · flag off · seats U4*

**Seat observed —** The fourth money row reads only `Moved · $14,420 in motion — ordered through installed`, with a full explanatory paragraph required below to learn it means the accounts' committed figure and explicitly not funds disbursed.

**Verdict: STANDS.** The `Moved` rung's meaning line is a definition that has to disclaim itself, and the paragraph below is required to decode it.

**Evidence —** `money-region.tsx:320-324 meaning; :327-336 explainer`


### F77 — The Care-stage document shows no guide headline at all

*medium · confidence 0.5 · width 1440 · flag off · seats U2*

**Seat observed —** On Birch Hollow, between the letterhead vitals row and the `MESSAGE CLIENT USER / PREVIEW AS CLIENT USER` instruments row, no eyebrow, headline, reason or action block is visible — the page goes from vitals straight to instruments with nothing narrating what is next.

**Verdict: STANDS.** RedLetterZone replaces DocumentGuide whenever the enrichment applies, and returns null on an empty row list — so a care document with a composed-but-empty need list prints neither zone nor guide.

**Evidence —** `doc/[id]/page.tsx:1111-1118; red-letter-zone.tsx:24 `if (rows.length === 0) return null;``


### F78 — The compact-tier margin is a closed, unlabelled `MARGIN ←` tab

*medium · confidence 0.85 · width 1280 · flag off · seats U3*

**Seat observed —** At 1180-1439 the right column that shows live margin items (decisions, vendor payments, notes) at ≥1440 collapses to a single fixed tab reading `MARGIN ←` with no count and no preview of what is inside.

**Verdict: STANDS.** The 1180-1439 trigger prints the word `Margin` and an arrow and nothing else — no count, no preview — and the panel behind it is inert until opened.

**Evidence —** `margin-rail.tsx:221-234; :262-283 sheet header`


### F80 — The full spec-book workbench shows no order or PO status

*medium · confidence 0.7 · width 1440 · flag off · seats P4*

**Seat observed —** `OPEN THE SPEC BOOK →` lands on the full workbench, which prints spec completeness only — `Sku / Finish / Material / Color Fabric / Selected Dimensions / Exact Location`, all `Not specified`, plus `INCOMPLETE` — and drops order status entirely, unlike the paper and the shelf leaf.

**Verdict: STANDS.** A grep of the spec-book workspace finds no order-state vocabulary at all — no Ordered, In production, Delivered or PO — unlike the paper's line stamps and the shelf leaf's status column.

**Evidence —** `grep 'Ordered|In production|Delivered|PO' spec-books/spec-book-workspace.tsx → 0 hits; spec-book-leaf.tsx:94-101 prints status`


### F82 — Every project artifact is behind opening the document first

*medium · confidence 0.9 · width all · flag both · seats U1*

**Seat observed —** The reachability inventory records the Call Sheet, the Drafting Room's direct route, the plan room, the spec book and every shelf leaf as reachable only from an open document. From `/desk`, `pull up the primary bedroom board` is four acts, and only at ≥1440 on a project-section document.

**Verdict: STANDS.** The Call Sheet and Drafting Room are scope 'document'; the plan room is a ⌘K This-surface row gated on a doc in hand; the spec-book door lives in the FF&E region; every shelf leaf is ≥1440 and project-section-only.

**Evidence —** `registry.tsx:128, 236; command-bar.tsx:558-572; ffe-section.tsx:1009-1015; shelf-panel.tsx:94; page.tsx:934-937`


### F83 — `The Post` and `Message {Family}` name the same idea differently

*low · confidence 0.6 · width all · flag off · seats U4*

**Seat observed —** The inbox door is labelled `The Post` (a postal noun); the letterhead's own reply action is labelled `Message {Family}` (a plain verb). Both concern client correspondence, and nothing ties the two words together.

**Verdict: STANDS.** The inbox is registered as the postal noun `The Post`; the letterhead's own act is `Message {family}`, and nothing on either names the other.

**Evidence —** `registry.tsx:214-227; letterhead-instruments.tsx:329`


### F84 — The Worktable's on-paper boards strip exists only at the Speccing table

*low · confidence 0.8 · width 1440 · flag on · seats P3*

**Seat observed —** `wt-speccing-1440` shows `Boards` with `START A BOARD` printed directly on the paper; `wt-delivery-project-1440` — a signed project at Chen's stage — still shows boards only via the ≥1440 shelf, identical to flag-off.

**Verdict: STANDS.** The boards-strip slot is rendered only when table === 'speccing', so a signed project's Delivery table can never show it.

**Evidence —** `table-frame.tsx:60-65; table-derivation.ts:59-68`


### F85 — The Capture Inbox introduces a new bordered card pattern

*low · confidence 0.4 · width 1440 · flag on · seats U3*

**Seat observed —** The Capture Inbox's five pending vendor captures each render as a bordered card with a coloured thumbnail swatch, vendor name, source domain and a relative timestamp — a bordered card pattern that appears nowhere on the flag-off paper.

**Verdict: STANDS.** The Capture Inbox is a Worktable-only mount and is not part of the flag-off paper's vocabulary; nothing in the shared region grammar governs its card treatment.

**Evidence —** `table-frame.tsx:49-66 (worktable slots); region/region-head.tsx + fold-seam.tsx are the paper's only region idioms`


### F86 — The Desk header cramps and wraps at 390

*low · confidence 0.75 · width 390 · flag off · seats U3*

**Seat observed —** `Good afternoon,` breaks after the comma and `Leah` drops to its own line (three lines of greeting) directly above `+ CAPTURE A LEAD` / `+ OPEN A PROJECT` / `FIND ANYTHING ⌘K`, which stack immediately below with very little breathing room, pushing the first folio card mostly below the fold.

**Verdict: STANDS.** The header is one flex row with justify-between and no responsive stacking, and the action group sits in the same row, so both wrap at 390.

**Evidence —** `desk/page.tsx:177 `flex items-baseline justify-between gap-4`; :197-234 DocumentActionGroup in the same row`


### F87 — Region status text truncates mid-word at 390

*low · confidence 0.6 · width 390 · flag off · seats U3*

**Seat observed —** `Client approvals — NO DECISION LEAD · N…` is cut off mid-word with an ellipsis, losing the rest of the status line — which is exactly what tells her whether the region needs anything.

**Verdict: STANDS.** RegionHead's status is `truncate` by declared design — 'One-line status phrase, truncated rather than wrapped' — so at 390 the line that says whether the region needs anything is cut.

**Evidence —** `region-head.tsx:43-44 docstring; :105-107 className 'truncate'`


### F88 — The Record has no footprint before the first completion

*low · confidence 0.5 · width 1440 · flag off · seats U3*

**Seat observed —** On Chen Residence (no completed sections) there is no `Previous work · N complete` line anywhere between `Design authority` and `Closing the book` — the foot runs straight from the accounts strip to the kickoff band, with no placeholder hinting the device exists.

**Verdict: STANDS.** PreviousWork returns null at count === 0, so the device leaves no footprint before the first completed section.

**Evidence —** `previous-work.tsx:34 `if (count === 0) return null;``


### F90 — Canon's `The Record` never prints on screen

*low · confidence 0.8 · width all · flag both · seats U4*

**Seat observed —** DECISIONS.md names this region `The Record` (I137: "The Record moves to the foot of the paper"), but the only visible string is `Previous work · {n} complete` — `The Record` appears nowhere in the rendered DOM.

**Verdict: STANDS.** The only string the region prints is `Previous work · {n} complete`; `The Record` appears nowhere in the component.

**Evidence —** `previous-work.tsx:45-46`


### F91 — `Next up` appears only when guidance is broken

*low · confidence 0.75 · width all · flag off · seats U4*

**Seat observed —** The eyebrow string `Next up` is used exactly once, on the `unavailable` (error) branch under the headline `Guidance is unavailable`; every healthy state uses a different, stage-specific eyebrow instead.

**Verdict: STANDS.** `Next up` is the eyebrow of exactly one branch — the unavailable/error model; every healthy branch carries a stage-specific eyebrow.

**Evidence —** `document-guide.ts:327-339 (only eyebrow: 'Next up'); :91-141 stage eyebrows`


### F92 — `Add to project` and `Open a project` share a word, not a meaning

*low · confidence 0.55 · width all · flag off · seats U4*

**Seat observed —** FF&E's ledger act reads `Add to project` (adds a line, board or import to the current engagement); the Desk header act and ⌘K verb read `Open a project` (starts an entirely new engagement, `no proposal needed`). Both can appear together in ⌘K results.

**Verdict: STANDS.** `Add to project` is an FF&E ledger act on the current engagement; `Open a project` is a registry verb that starts a new one; both can appear in one ⌘K result list.

**Evidence —** `ffe-section.tsx:977-981 (via ffeAddToProjectEntry in ffeLedger:1016); registry.tsx:266-278; command-bar.tsx:472-473, 592-596`


### F93 — The colophon's `Team…` is the one vague act among plain verbs

*low · confidence 0.7 · width 1440 · flag off · seats U4*

**Seat observed —** Colophon actions read `Brief a vendor`, `Hold`, `Archive` and `Team…` — the first three are plain imperatives naming their result; `Team…` is a noun with a trailing ellipsis and never says it opens the Call Sheet picker.

**Verdict: STANDS.** Three colophon acts are plain imperatives; `Team…` is a noun with an ellipsis and dispatches the call-sheet picker without naming it.

**Evidence —** `doc-colophon.tsx:152-165 'Team…' → document:open-call-sheet mode 'picker'; :123, :134, :150`


### F94 — Canon's `Contents Page` prints on screen as `THE STUDIO`

*low · confidence 0.7 · width 1440 · flag off · seats U4*

**Seat observed —** R95 names this block a typographic contents of rooms, ledgers and begin-verbs; the actual on-screen eyebrow directly above it reads `THE STUDIO`, not `Contents` in any form.

**Verdict: STANDS.** The block's printed eyebrow is the literal `The Studio`; no form of the word Contents appears.

**Evidence —** `desk-contents.tsx:182-184`


### F95 — The spine's mark count changes between documents

*low · confidence 0.65 · width all · flag both · seats U1*

**Seat observed —** The spine's mark row prints seven marks on a project document, four on the sent proposal and six on the brief. Since the marks carry no visible labels at any width and no ordinal, the same visual device reads as a different scale on each document she picks up in a morning.

**Verdict: STANDS.** The mark row maps whatever `sections` the derivation hands it, and the per-mark label is aria-only at every width, so the row's length is the only visible signal and it varies by document.

**Evidence —** `doc-spine.tsx:63-115 sections.map; strata-mark.tsx:80-83 label → aria only`


### F97 — The margin rail has no functional closed state at ≥1440

*low · confidence 0.85 · width 1440 · flag off · seats U2*

**Seat observed —** `isFullRail` is always true above 1440, so the `margin-open` and `margin-closed` screenshots are pixel-identical — the rail is permanently mounted and cannot be collapsed, unlike the 1180-1439 tier's explicit `MARGIN ←` toggle tab.

**Verdict: STANDS.** The `Margin ←` trigger is min-[1440px]:hidden and the rail becomes a sticky grid column with pointer-events restored and its header hidden — there is no ≥1440 collapse.

**Evidence —** `margin-rail.tsx:221-234 (min-[1440px]:hidden trigger); :258-266 sticky col-start-3 + min-[1440px]:pointer-events-auto; :262 header min-[1440px]:hidden`


### F99 — Free-text description prints in the same register as studio copy

*low · confidence 0.6 · width 1440 · flag off · seats P3*

**Seat observed —** Below the Direction document's folio strip a paragraph reads `Draft fixture for a no-login household: proposals.designer_client_id links to the household so document_state Shape B rescues the client_name.` in the same body type as the rest of the paper, with no internal-note distinction.

**Verdict: STANDS.** Free-text description is rendered in the paper's body type with no internal-note register; nothing in the region grammar distinguishes studio copy from stored free text.

**Evidence —** `brief-section.tsx:29-98 (Stat/body copy share one type scale); region-head.tsx:105 status in one body register`


### F100 — The two leaf routes name the project differently on the way back

*low · confidence 0.9 · width 1440 · flag both · seats P1*

**Seat observed —** `w1440-leaf-plans-route`'s return link reads `← CHEN`; `w1440-leaf-specbook-route`'s reads `← CHEN RESIDENCE`. Neither says Desk or document.

**Verdict: STANDS.** The two leaf routes derive the return name from two different sources: the plan room from folderTab (the family word), the spec book from the project's own name.

**Evidence —** `plans/plan-room-workspace.tsx:116 folderTab(row), :171 `← {projectName}`; spec-books/spec-book-workspace.tsx:1057 project.name, :1070 `← {projectName}``


---
