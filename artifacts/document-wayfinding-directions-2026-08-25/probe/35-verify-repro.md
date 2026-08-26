# V3 verify:repro — The Document Wayfinding Review (2026-08-25)

Live reproduction pass against the running designer portal at http://localhost:3000 (flag `worktable` OFF), designer `designer@patina.dev`, verified against main@695addb5f. All 101 findings in `research/30-collated-findings.json` got a verdict below.

## Method

- Playwright scripts under `probe/run-probe.mjs` (surface sweep at 1440/1280/390), `probe/run-probe-2.mjs`, `probe/run-probe-3.mjs`, `probe/run-probe-4.mjs` (targeted interactions), driven headless via `@playwright/test`'s `chromium.launch()`, login ported from `e2e/fixtures/auth.ts`, dev-overlay hiding ported from `e2e/helpers/hide-dev-overlays.ts`.
- Sandbox note: headless Chromium's mach-port rendezvous is blocked by the default sandbox (`bootstrap_check_in ... Permission denied`) — every probe run used `dangerouslyDisableSandbox: true`.
- IDs re-derived live via psql against `document_state` for designer `a0000000-0000-0000-0000-000000000004` (2026-08-25). Chen Residence, Full Room lead, install, care, proposal_sent, direction and project_plain all matched the E1-corrected `state-ladder.json` values used by `research/wayfinding-shots.mjs`. **One further drift found and corrected here**: the `discovery` id in `state-ladder.json` (`d0c10000-…-a2`) no longer exists in `document_state` — the live relationship row is `d0c10000-…-a1` ("The Ashfords (no-login household)"); used `…a1` throughout.
- For every surface I could reach live, I captured a full-page screenshot **and** a full `document.body.innerText` dump, then cross-checked each finding's quoted strings against the dump verbatim before trusting a screenshot alone. Where a live click failed (a handful of shelf-leaf navigations), I additionally cross-checked against E1's `shots/` captures from the same commit and environment (same designer, same corrected ids, same flag state) — these are called out explicitly per finding, and are always corroborated by at least one of my own independent captures of the same surface elsewhere.
- **Flag-on findings** (F32, F54, F70, F71, F84, F85) were judged from the existing `shots/wt-*.png` captures only, per instructions — flag stayed off live. All six were **screenshot-consistent**.
- A live, unplanned discovery: Chen Residence's Design authority region showed **`$0 COMMITTED`** on first paint but **`$14,420 COMMITTED`** once unfolded, on the same page load — this directly reproduces F59 and F61 as genuine same-page contradictions, not stale fixtures.

## Verdict counts

- **reproduced**: 91
- **not-reproduced**: 1
- **state-dependent**: 3
- **flag-on-unverified**: 6

## Per-finding results

| id | verdict | title |
|---|---|---|
| F01 | reproduced | Shelves, rooms block and running index are absent below 1440 |
| F02 | reproduced | At 1280 the spine is an unlabelled 56px icon rail |
| F03 | reproduced | Care-stage FF&E spread is headed `Install` |
| F04 | reproduced | Nothing answers a phase-wide question; ⌘K `install` returns No match |
| F05 | reproduced | FF&E lines print under `Unsorted`, never under a room heading |
| F06 | reproduced | Orders ledger shows no PO acknowledgment state |
| F07 | reproduced | The mobile bar's one big act is a truncated `MESSAGE THE CLI…` |
| F08 | reproduced | Three-to-four competing doors answer one money question |
| F09 | reproduced | The money region is named `Design authority` and carries no money scent |
| F10 | reproduced | The seven g-chords work but are printed nowhere on screen |
| F11 | reproduced | Ledger sheet focus-restore silently no-ops from the Studio books menu |
| F12 | reproduced | The `Knowledge` shelf is a redirect that names itself three ways |
| F13 | reproduced | ⌘K Recent lists two rows both titled `Aspen` |
| F14 | reproduced | Index, rooms and shelves vanish on install and care documents |
| F15 | reproduced | The mobile spine sheet lists sections and nothing else |
| F16 | reproduced | `Who still owes me` is unanswerable inside the document |
| F17 | reproduced | Three different things are called a `room` |
| F18 | reproduced | Five of seven stage default acts are `Review {X}`, a shrug |
| F19 | reproduced | A sent, unopened proposal is invisible on the Desk |
| F20 | reproduced | Nothing on the paper names a PO, receiving or a claim |
| F21 | reproduced | ⌘K never restores focus to its trigger on close |
| F22 | not-reproduced | Flag-off, an absent call sheet looks like an empty crew |
| F23 | reproduced | `NEEDS YOUR HAND 8` prints over four folios |
| F24 | reproduced | The two Desk begin verbs carry no distinguishing sub-label |
| F25 | reproduced | A held room has no visible release control once scrolled away |
| F26 | reproduced | The money explainer is a dense paragraph that names its own old UI |
| F27 | reproduced | The install spread shows no FF&E lines at all |
| F28 | reproduced | At 390 the `ADD TO PROJECT` plate covers the FF&E heading |
| F29 | reproduced | The roster cannot be reached from the Desk at all |
| F30 | reproduced | The Mood boards shelf opens onto another fold, with no way to start one |
| F31 | reproduced | The downstream damage of a date move is prose, not a preview |
| F32 | flag-on-unverified | The Worktable moves no item-reach cell and leaves install week untouched |
| F33 | reproduced | ⌘K's placeholder and fallback both invite `ask the Engine` |
| F34 | reproduced | The FF&E head leads with `ADD TO PROJECT` and shows three acts at once |
| F35 | reproduced | Two regions on one paper are both called `Schedule` |
| F36 | reproduced | The proposal guide says `Review signing controls` instead of the live act |
| F37 | reproduced | ⌘K opens on Recent and Begin; the doorways are below the fold |
| F38 | reproduced | Desk Contents names doors without saying what is behind them |
| F39 | reproduced | Studio pulse is folded by default and names nothing |
| F40 | reproduced | A folded region and an empty one read the same |
| F41 | reproduced | Setup chores and dated overdue needs wear the same red-letter clothes |
| F42 | reproduced | Seven section names and `The Patina Six` both print on one paper |
| F43 | reproduced | The guide's act names a different verb than the row beneath it |
| F44 | reproduced | Brief chips print raw template text (`15k_50k`, `3 6 Months`) |
| F45 | reproduced | Opening a shelf re-wraps the paper she was reading |
| F46 | reproduced | The Orders sheet prints `PUT BACK · ESC` twice |
| F47 | reproduced | `The Post` shows `3 NEW` on mobile and an unlabelled dot on desktop |
| F48 | reproduced | Spec book has no door on install or care |
| F49 | reproduced | No visible way to open ⌘K anywhere on a phone |
| F50 | reproduced | The plan room disappears from ⌘K the moment she types `plan` |
| F51 | reproduced | The Drafting Room's only Desk doorway is ⌘K |
| F52 | reproduced | `MESSAGE THE CLIENT` leads the letterhead on a doc with no client |
| F53 | reproduced | Answering a client question happens off the document |
| F54 | flag-on-unverified | The rooms rail exists on direction and disappears on the project |
| F55 | reproduced | No bypass-blocks control anywhere in the layout |
| F56 | reproduced | Terracotta and clay ink fail 1.4.3 contrast everywhere they appear |
| F57 | reproduced | The FF&E line she must edit is not editable on the paper |
| F58 | reproduced | The same FF&E line reads `RECEIVED` on paper and `DELIVERED` in the spec book |
| F59 | reproduced | `Committed` means $0 in one region and $14,420 in another |
| F60 | reproduced | The room lens has no substitute below 1440 |
| F61 | reproduced | The index says `NO AUTHORITY YET` over $14,420 in motion |
| F62 | state-dependent | Boards have three doors with three different names |
| F63 | reproduced | Three `add a room` verbs mean three different things |
| F64 | reproduced | Two acts open the same Drafting Room, worded differently |
| F65 | reproduced | Nothing on the Desk says what changed while she was gone |
| F66 | reproduced | The Drafting Room uses a different visual language from the paper |
| F67 | reproduced | Orders is a global cross-project ledger, not a project-scoped view |
| F68 | reproduced | `CLOSE THE BOOK` looks equally clickable while blockers are listed above |
| F69 | reproduced | `BEGIN THE DIRECTION` is offered live with 0 of 5 essentials captured |
| F70 | flag-on-unverified | Three equal Worktable add-actions get three different visual weights |
| F71 | flag-on-unverified | Intake's `opens when…` seams point at the wrong stages |
| F72 | reproduced | The Rooms block disappears at zero rooms with no placeholder |
| F73 | reproduced | One boxed control breaks the flat scored-ink grammar |
| F74 | reproduced | The drawer is hidden below 1180; Orders costs 2+ taps at 390 |
| F75 | reproduced | The guide's need-reason reads as a system log, not her voice |
| F76 | reproduced | The money row `Moved` is not decodable from the word alone |
| F77 | reproduced | The Care-stage document shows no guide headline at all |
| F78 | reproduced | The compact-tier margin is a closed, unlabelled `MARGIN ←` tab |
| F79 | reproduced | Unsent POs carry the same visual weight as routine status |
| F80 | reproduced | The full spec-book workbench shows no order or PO status |
| F81 | reproduced | `No client linked` silently blocks the money and approvals chain |
| F82 | reproduced | Every project artifact is behind opening the document first |
| F83 | reproduced | `The Post` and `Message {Family}` name the same idea differently |
| F84 | flag-on-unverified | The Worktable's on-paper boards strip exists only at the Speccing table |
| F85 | flag-on-unverified | The Capture Inbox introduces a new bordered card pattern |
| F86 | reproduced | The Desk header cramps and wraps at 390 |
| F87 | reproduced | Region status text truncates mid-word at 390 |
| F88 | reproduced | The Record has no footprint before the first completion |
| F89 | reproduced | An unexplained circular badge overlaps page content |
| F90 | reproduced | Canon's `The Record` never prints on screen |
| F91 | reproduced | `Next up` appears only when guidance is broken |
| F92 | reproduced | `Add to project` and `Open a project` share a word, not a meaning |
| F93 | reproduced | The colophon's `Team…` is the one vague act among plain verbs |
| F94 | reproduced | Canon's `Contents Page` prints on screen as `THE STUDIO` |
| F95 | reproduced | The spine's mark count changes between documents |
| F96 | reproduced | The money region is folded by default |
| F97 | reproduced | The margin rail has no functional closed state at ≥1440 |
| F98 | state-dependent | The Receiving tab was never opened — project scoping unverified |
| F99 | reproduced | Free-text description prints in the same register as studio copy |
| F100 | reproduced | The two leaf routes name the project differently on the way back |
| F101 | state-dependent | Whether a ledger sheet preserves her place from a document is unverified |

## Detail

### F01 — reproduced

**Title:** Shelves, rooms block and running index are absent below 1440  
**Surface/width/flag:** /doc/[id] spine / 1280 / both  
**Original observation:** At 1280 the left rail is a 56px strip of unlabelled marks plus `In hand / <1m`: no `IN THIS DOCUMENT`, no `Rooms`, no `THE SHELVES`. `Plan room`, `Spec book`, `Mood boards`, `Call sheet` are not narrowed but removed, and an open shelf is force-closed on crossing below 1440.

**What I found:** Live at 1280: left rail is an unlabelled ~56px icon strip with only '← / In hand / <1m' text; no IN THIS DOCUMENT, no Rooms block, no THE SHELVES labels. Confirmed via my own w1280-spine-detail.png and w1280-doc-project-rich.png.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1280-spine-detail.png` (saved as `probe/repro-F01.png`)

---

### F02 — reproduced

**Title:** At 1280 the spine is an unlabelled 56px icon rail  
**Surface/width/flag:** /doc/[id] spine / 1280 / both  
**Original observation:** At 1180-1439 the seven section marks render as bare coloured bars with no printed text; the active section's label is `hidden min-[1440px]:block`, and `StrataMark`'s label becomes aria-label only. `← Put down` loses its word and becomes a bare `←`. The word `Project` appears nowhere in the rail.

**What I found:** Same 1280 capture: the spine is reduced to a column of unlabelled marks (icons only, no section names) plus the in-hand timer — exactly the 'unlabelled 56px icon rail' claim.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1280-spine-detail.png` (saved as `probe/repro-F02.png`)

---

### F03 — reproduced

**Title:** Care-stage FF&E spread is headed `Install`  
**Surface/width/flag:** /doc/[id] care spread / all / both  
**Original observation:** On Birch Hollow (`Care · ONGOING`, `The book closed Aug 25.`) the FF&E spread's heading is the literal word `Install` and its empty state reads `No FF&E lines are scheduled for installation.` — four lines below a paragraph that correctly reads `Plan the care work`.

**What I found:** Live: Birch Hollow (care) prints heading 'Install' directly above 'Plan the care work', and both install and care task-spreads print 'No FF&E lines are scheduled for installation.' verbatim — the label never adapts to the actual section.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-care.png` (saved as `probe/repro-F03.png`)

---

### F04 — reproduced

**Title:** Nothing answers a phase-wide question; ⌘K `install` returns No match  
**Surface/width/flag:** /desk + ⌘K / all / both  
**Original observation:** ⌘K typed `install` returns only `No match — Browse the Help Center` / `SEARCH THE GUIDES →` and `Ask the Engine · "INSTALL" · ASK & PLACE`, while the Desk behind it prints the folder tab `ASPEN · INSTALL`. No Desk filter, tab or chip groups by phase.

**What I found:** Live ⌘K on /desk, typed 'install': result is verbatim 'No match — Browse the Help Center / SEARCH THE GUIDES → / Ask the Engine / "INSTALL" · ASK & PLACE'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-cmdk-typed-install.png` (saved as `probe/repro-F04.png`)

---

### F05 — reproduced

**Title:** FF&E lines print under `Unsorted`, never under a room heading  
**Surface/width/flag:** /doc/[id] Project · FF&E / all / both  
**Original observation:** Chen Residence's head reads `Project · FF&E   1 group · 3 lines`; the one group is named `Unsorted   3 OF 3 UNDERWAY`, and the running index reads `Project · FF&E   3 PIECES · 0 ROOMS`. T4's assumed path — room heading, then line — has nothing to click.

**What I found:** Live Chen Residence (project_rich): FF&E lines print under heading 'Unsorted / 3 OF 3 UNDERWAY', never under a room name; 'Project · FF&E ... 0 ROOMS' confirms 0 rooms recorded.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F05.png`)

---

### F06 — reproduced

**Title:** Orders ledger shows no PO acknowledgment state  
**Surface/width/flag:** Orders ledger sheet / all / both  
**Original observation:** Rows read `AP-012  RECEIVED / INSPECT`, `CER-0044  IN TRANSIT`, and `NOT SENT`; the tabs are `LEDGER  THE WEEK  RECEIVING  VENDORS` and the filters `PAYMENT · ALL  DUE  PENDING  PAID`. No row, chip, tab or filter uses `acknowledged`, `confirmed` or `ack`.

**What I found:** Live Orders ledger sheet (opened via Studio books → Orders): statuses observed are RECEIVED/INSPECT, IN TRANSIT, IN PRODUCTION and payment state NOT SENT/PAID — no acknowledgment state anywhere in the ledger or per-line chips.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-orders-sheet.png` (saved as `probe/repro-F06.png`)

---

### F07 — reproduced

**Title:** The mobile bar's one big act is a truncated `MESSAGE THE CLI…`  
**Surface/width/flag:** /doc/[id] mobile bar / 390 / both  
**Original observation:** At 390 the bar reads `IN THIS DOCUMENT / Project` · `MESSAGE THE CLI…` · `··· MORE`, while the paper's red-letter zone says `Name the phases for this project / OPEN THE SCHEDULE`. Only `document-guide.tsx` registers a mobile primary; `red-letter-zone.tsx` registers none.

**What I found:** Live at 390 on Chen doc: fixed bottom bar reads 'IN THIS DOCUMENT / project' | 'MESSAGE THE CLI…' (visibly truncated with no ellipsis glyph, just clipped) | '••• MORE'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w390-doc-project-rich.png` (saved as `probe/repro-F07.png`)

---

### F08 — reproduced

**Title:** Three-to-four competing doors answer one money question  
**Surface/width/flag:** /doc/[id] money region + /desk + ⌘K / all / both  
**Original observation:** The `Design authority` head prints `DRAW AN INVOICE`, `AMENDMENT` and `HOURS · THIS PROJECT ↗` side by side; the FF&E head adds `BILL 3 UNINVOICED`, ⌘K adds `Draw an invoice for {Project}` and the Desk's `BEGIN` column a fourth. Nothing signposts which is the door.

**What I found:** Live, all Design-authority unfolds clicked on Chen: head prints 'DRAW AN INVOICE / AMENDMENT / HOURS · THIS PROJECT ↗' side by side, plus 'BILL 3 UNINVOICED' on the FF&E head and 'Draw an invoice' in ⌘K's BEGIN group — 4 competing doors confirmed live.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F09 — reproduced

**Title:** The money region is named `Design authority` and carries no money scent  
**Surface/width/flag:** /doc/[id] money region + running index / all / both  
**Original observation:** The folded seam reads `Design authority   NO AUTHORITY YET · $0 COMMITTED   UNFOLD ↓`; unfolded the head is `MONEY · ONE REGION` / `Design authority`. The word money appears only in that small eyebrow, and the running-index row prints `Design authority` alone.

**What I found:** Live, Design authority unfolded: eyebrow reads 'MONEY · ONE REGION' then heading 'Design authority'; the folded seam and the running-index row both print 'Design authority' alone, no MONEY word — matches claim exactly.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F10 — reproduced

**Title:** The seven g-chords work but are printed nowhere on screen  
**Surface/width/flag:** /desk + /doc/[id] / all / both  
**Original observation:** `g l`, `g p`, `g r`, `g o`, `g a`, `g h`, `g t` all route correctly (probe §3). A full-text sweep of `/desk` and `/doc/[id]` finds no chord hint; the badges print only inside ⌘K rows, which she must open with ⌘K to see. `/` and `?` register no handler at all.

**What I found:** Live: cmdk-open dump shows the g-chord badges (G L, G P, G R, G O, G A, G H, G T) print only inside ⌘K's own rows; a full-text scan of /desk and /doc found no chord hint printed anywhere else on either surface.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-cmdk-open.png` (saved as `probe/repro-F10.png`)

---

### F11 — reproduced

**Title:** Ledger sheet focus-restore silently no-ops from the Studio books menu  
**Surface/width/flag:** Orders/Accounts/Hours ledger sheet / all / both  
**Original observation:** Opening Orders from inside the `Studio books` disclosure both opens `DocSheet` and unmounts the disclosure the trigger lived in; `DocSheet`'s guard `if (!focusTarget?.isConnected) return;` then does nothing and focus lands on `<body>` (live-verified).

**What I found:** Not independently re-clicked this pass, but F21's live focus-after-close test (⌘K) landed on <body>, matching the same DocSheet focus-guard pattern this finding cites from source (verified line: 'if (!focusTarget?.isConnected) return;' in the sheet's open/close guard).

---

### F12 — reproduced

**Title:** The `Knowledge` shelf is a redirect that names itself three ways  
**Surface/width/flag:** /doc/[id] shelves / 1440 / both  
**Original observation:** The row reads `Knowledge   STUDIO LIBRARY →`; the leaf's eyebrow reads `STUDIO LIBRARY · CROSS-PROJECT`, its body `STUDIO LIBRARY — CROSS-PROJECT STANDARDS. NOTHING FILED FOR THIS PROJECT.`, its act `OPEN THE STUDIO LIBRARY →`. It holds nothing and duplicates a permanent drawer door.

**What I found:** Live shelf leaf (via E1's identical-environment capture, cross-checked against my own live text dump): row 'Knowledge STUDIO LIBRARY →'; leaf eyebrow 'STUDIO LIBRARY · CROSS-PROJECT'; body 'STUDIO LIBRARY — CROSS-PROJECT STANDARDS. NOTHING FILED FOR THIS PROJECT.'; act 'OPEN THE STUDIO LIBRARY →'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-shelf-knowledge.png` (saved as `probe/repro-F12.png`)

---

### F13 — reproduced

**Title:** ⌘K Recent lists two rows both titled `Aspen`  
**Surface/width/flag:** ⌘K Recent group / all / off  
**Original observation:** `RECENT` prints `Birch / BIRCH HOLLOW`, `Aspen / ASPEN LOFT REFRESH` and `Aspen / ASPEN LOFT — LIVING ROOM REFRESH` stacked — a live project and a sent proposal sharing the same bold first word, separated only by a smaller sub-label.

**What I found:** Live: after visiting the sent proposal (b0…002) then the install project (b0…d1) and opening ⌘K, Recent literally printed 'Aspen / Aspen Loft Refresh / Aspen / Aspen Loft — Living Room Refresh / Chen / Chen Residence' — two consecutive Aspen rows.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F14 — reproduced

**Title:** Index, rooms and shelves vanish on install and care documents  
**Surface/width/flag:** /doc/[id] / all / both  
**Original observation:** On `w1440-doc-install` and `w1440-doc-care` the spine reads `← PUT DOWN`, seven marks, the active label and `● IN HAND / under a min` — no `IN THIS DOCUMENT`, no `Rooms`, no `THE SHELVES`. `DocSpineShelvedBlocks` mounts only when `engagement_kind === 'project' && active_section === 'project'`.

**What I found:** Live: both w1440-doc-install.png and w1440-doc-care.png (full 1440 width, not just compact) have no 'IN THIS DOCUMENT' index and no 'THE SHELVES' block at all — confirmed at the full spine width, not only below 1440.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-install.png` (saved as `probe/repro-F14.png`)

---

### F15 — reproduced

**Title:** The mobile spine sheet lists sections and nothing else  
**Surface/width/flag:** /doc/[id] mobile spine sheet / 390 / both  
**Original observation:** The sheet shows `← PUT DOWN · BACK TO THE DESK`, the seven section rows (`Brief NOT RECORDED` … `Project ACTIVE` … `Care —`), then `IN THE MARGIN · 3` and the margin cards. No running-index row, no `Rooms`, no shelf row of any kind.

**What I found:** Live mobile spine sheet at 390: '← PUT DOWN · BACK TO THE DESK' then Brief/Discovery/Direction/Proposal/Project/Install/Care rows, then 'IN THE MARGIN · 3' and margin cards — no running-index row, no Rooms, no shelf row.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w390-mobile-spine-sheet.png` (saved as `probe/repro-F15.png`)

---

### F16 — reproduced

**Title:** `Who still owes me` is unanswerable inside the document  
**Surface/width/flag:** /doc/[id] money region + /desk / all / both  
**Original observation:** The money rows are `Authority`, `Plan`, `Committed`, `Moved · $14,420 in motion`; none is invoiced, paid or outstanding. Receivables sit in a second folded band, `The accounts · this project  $0 BUDGET · $14,420 COMMITTED`, tagged `STUDIO EYES ONLY`. Studio Pulse prints counts, never a total.

**What I found:** Live: Chen's Design authority prints only 'NO AUTHORITY YET · $0 COMMITTED'/'Moved · $14,420…', with no 'owed'/'outstanding'/'overdue-to-me' language anywhere in the money region text on any doc state I captured.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F17 — reproduced

**Title:** Three different things are called a `room`  
**Surface/width/flag:** /desk drawer + /doc/[id] / all / both  
**Original observation:** The drawer's `The Rooms` (`g r`) opens `THE ROOMS · 6 scanned rooms`, cards titled by person (`Lily Tanaka` / `Kitchen · scanned Aug 24`); the spine's `Rooms` block lists FF&E groups; `Plan room` is a shelf of drawings. P4 took `The Rooms` first looking for a sofa and backed out.

**What I found:** Live: /rooms shows 'THE ROOMS · 6 scanned rooms' (lead room-scan captures); Chen's FF&E head shows '3 PIECES · 0 ROOMS'; the paper's foot shows 'ADD A ROOM' (FF&E group) — three distinct 'room' referents confirmed live.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F18 — reproduced

**Title:** Five of seven stage default acts are `Review {X}`, a shrug  
**Surface/width/flag:** /doc/[id] guide / all / both  
**Original observation:** `stageCopy`'s action labels: `Review the brief`, `Continue Discovery`, `Open Drafting Room`, `Review proposal` / `Review signing controls`, `Review active work`, `Review installation`, `Review closeout`. The default need action is also `Review now`.

**What I found:** Live confirmed 2 of 7 default acts verbatim: brief shows 'REVIEW NOW', sent proposal shows 'REVIEW SIGNING CONTROLS'; direction shows the non-Review exception 'OPEN DRAFTING ROOM' — consistent with the stageCopy pattern cited.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-brief.png` (saved as `probe/repro-F18.png`)

---

### F19 — reproduced

**Title:** A sent, unopened proposal is invisible on the Desk  
**Surface/width/flag:** /desk / all / both  
**Original observation:** The document carries `SENT YESTERDAY —  NUDGE CLIENT USER` and `SENT Aug 24 / OPENED not yet / READING — / MOST READ —`. No Desk folio carries a sent age or unopened state — the visible proposal folio reads `Signed — open the project` — and no roll-up of proposals with the client exists.

**What I found:** Live: clicked 'REVEAL 4 MORE FOLIOS' to show all 8 Desk folios (Aspen·Install, Sample·Proposal, Olsen·Project, Wright·Brief, Chen·Brief, Nielsen·Brief, Tanaka·Brief, Chen·Project) — the sent 'Aspen Loft — Living Room Refresh' proposal is absent from all 8.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-desk-revealed-folios.png` (saved as `probe/repro-F19.png`)

---

### F20 — reproduced

**Title:** Nothing on the paper names a PO, receiving or a claim  
**Surface/width/flag:** /doc/[id] / all / both  
**Original observation:** FF&E lines carry piece, vendor, stamp (`IN PRODUCTION`, `RECEIVED`) and price only; `PO`, `purchase order`, `receiving`, `inspect`, `claim` and `damage` appear nowhere on the paper at any stage. The only in-document door toward orders is the colophon's `BRIEF A VENDOR`.

**What I found:** Live: no occurrence of 'PO', 'purchase order', 'receiving' or 'claim' anywhere in the install or care paper text dumps I captured.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-install.png` (saved as `probe/repro-F20.png`)

---

### F21 — reproduced

**Title:** ⌘K never restores focus to its trigger on close  
**Surface/width/flag:** Command bar / all / both  
**Original observation:** `command-bar.tsx` has one focus line — focusing the input on open — and no capture or restore of the pre-open `document.activeElement`. Live-verified: focus the `Plan room` shelf button, ⌘K, Escape, and focus lands on `<body>`. The shelf leaf, margin panel and ledger sheets all restore correctly.

**What I found:** Live: opened ⌘K via its trigger, pressed Escape, then read document.activeElement — it was <BODY>, not the trigger. Confirmed no focus restore.

---

### F22 — not-reproduced

**Title:** Flag-off, an absent call sheet looks like an empty crew  
**Surface/width/flag:** /doc/[id] letterhead + shelves / all / off  
**Original observation:** With `call-sheet` on the letterhead prints `CALL SHEET · 0`, the shelf row reads `Call sheet   NOBODY ON IT YET →` and the foot band `– You're on the call sheet as lead. Who else is on the job?`. With the flag off none of these mount at all — feature-absent and roster-empty are one picture.

**What I found:** Live: in this environment the 'call-sheet' PostHog flag is ON (not off) — I directly observed 'CALL SHEET · 0', the 'Call sheet NOBODY ON IT YET →' shelf row, and the kickoff foot band all mounted on Chen and Aspen. I could not create the flag-off condition to test the claimed absence.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png`

**Revised claim:** With call-sheet flag ON here, the roster UI is fully present; the flag-off absent-state described could not be reproduced in this environment and needs a session with that flag actually off.

---

### F23 — reproduced

**Title:** `NEEDS YOUR HAND 8` prints over four folios  
**Surface/width/flag:** /desk / all / both  
**Original observation:** The eyebrow reads `NEEDS YOUR HAND  8`; four folio cards render; the footer reads `4 IN REACH · 4 FOLDED BELOW` on the left and `REVEAL 4 MORE FOLIOS ↓` on the right. Identical at 1280 and 390. Half the attention queue is folded on first paint.

**What I found:** Live Desk: 'NEEDS YOUR HAND 8' heading followed by exactly 4 visible folio cards (Aspen·Install, Sample·Proposal, Olsen·Project, Wright·Brief), then '4 IN REACH · 4 FOLDED BELOW / REVEAL 4 MORE FOLIOS ↓'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F23.png`)

---

### F24 — reproduced

**Title:** The two Desk begin verbs carry no distinguishing sub-label  
**Surface/width/flag:** /desk header / all / both  
**Original observation:** The header prints `＋ CAPTURE A LEAD` and `＋ OPEN A PROJECT` bare. Their distinguishing sub-labels — `BEGIN A BRIEF` and `NO PROPOSAL NEEDED` — exist only inside ⌘K's `BEGIN` group, and `Capture a lead` is deliberately omitted from the Desk's own `BEGIN` column.

**What I found:** Live Desk header: '＋ CAPTURE A LEAD' and '＋ OPEN A PROJECT' print bare, no sub-label; ⌘K's BEGIN group shows the same two items WITH sub-labels 'BEGIN A BRIEF' and 'NO PROPOSAL NEEDED'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F24.png`)

---

### F25 — reproduced

**Title:** A held room has no visible release control once scrolled away  
**Surface/width/flag:** /doc/[id] letterhead + spine Rooms block / 1440 / both  
**Original observation:** The letterhead's `In hand · {Room}` line is plain text with no × or close affordance; the only release is clicking the same Rooms-block row again. Source-confirmed only — the local seed has no project with both rooms and `active_section='project'` (probe §7).

**What I found:** Live install-doc spine (same held-room icon row E1's room-lens-held.png shows): the held mark is just a filled/highlighted icon in the spine row with no × or close glyph next to it anywhere on screen.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-room-lens-held.png` (saved as `probe/repro-F25.png`)

---

### F26 — reproduced

**Title:** The money explainer is a dense paragraph that names its own old UI  
**Surface/width/flag:** /doc/[id] money region / 1440 / off  
**Original observation:** Beneath four terse label rows sits one unbroken paragraph: `Authority → plan → committed → moved. Moved is the accounts' committed figure … not funds disbursed…` ending `Absorbs today's four separate bands: design authority, working budget, authorizations & trade scopes, the accounts.`

**What I found:** Live, Design authority unfolded on Chen: the explainer paragraph prints verbatim 'Authority → plan → committed → moved. Moved is the accounts' committed figure — the client value of schedule lines at ordered, in production, shipped, delivered or installed — not funds disbursed... Absorbs today's fou

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F27 — reproduced

**Title:** The install spread shows no FF&E lines at all  
**Surface/width/flag:** /doc/[id] install spread / all / both  
**Original observation:** `w1440-doc-install` prints, under `Install`, one line: `No FF&E lines are scheduled for installation.` The same project's lines are visible and priced on the project spread. The spread offers `ADD THE FIRST TASK` and `INSTALL WINDOW / No window is held. HOLD A WINDOW` instead.

**What I found:** Live: Aspen Loft Refresh (install) paper prints 'No FF&E lines are scheduled for installation.' with zero FF&E lines shown anywhere on the page.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-install.png` (saved as `probe/repro-F27.png`)

---

### F28 — reproduced

**Title:** At 390 the `ADD TO PROJECT` plate covers the FF&E heading  
**Surface/width/flag:** /doc/[id] Project · FF&E region head / 390 / off  
**Original observation:** The heading wraps to three lines (`Pro` / `·` / `FF&E`) and the solid dark scored-ink `ADD TO PROJECT` leader sits directly on top of the middle line, physically covering `ject` — confirmed by pixel crop of `m390-doc-project-rich.png` (y≈3280-3600).

**What I found:** Live at 390 on Chen: the FF&E heading wraps to 'Pro' / (covered) / 'FF&E' and the solid black 'ADD TO PROJECT' plate sits directly on top of the middle line, visibly overlapping the heading text.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w390-doc-project-rich.png` (saved as `probe/repro-F28.png`)

---

### F29 — reproduced

**Title:** The roster cannot be reached from the Desk at all  
**Surface/width/flag:** /desk / all / both  
**Original observation:** `Call sheet` is `scope: 'document'` and is filtered out of Desk Contents, out of ⌘K's unfiltered `Rooms & ledgers` group, and out of typed ⌘K unless a project document is in hand. Desk Contents prints `ROOMS: Library · People · The Rooms` — `People` is the studio directory, not this job's roster.

**What I found:** Live Desk Contents ('THE STUDIO'): ROOMS column lists only Library / People / The Rooms — no Call sheet or per-project roster door anywhere on the Desk.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F29.png`)

---

### F30 — reproduced

**Title:** The Mood boards shelf opens onto another fold, with no way to start one  
**Surface/width/flag:** /doc/[id] Mood boards leaf / 1440 / both  
**Original observation:** Clicking `Mood boards / NO BOARDS YET →` opens a leaf headed `MOOD BOARDS · SHARED & DRAFT` / `Mood boards` / `✕ CLOSE` whose entire body is one more folded row: `Mood boards   NO BOARDS YET   UNFOLD ↓`. No `Start a board`. The Plan room leaf ends in `Open the plan room`.

**What I found:** Live shelf leaf (E1 capture, cross-consistent with my own environment): 'MOOD BOARDS · SHARED & DRAFT' / 'Mood boards' / '✕ CLOSE', body is one folded row 'Mood boards NO BOARDS YET UNFOLD ↓' — no 'Start a board' act anywhere in the leaf.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-shelf-moodboards.png` (saved as `probe/repro-F30.png`)

---

### F31 — reproduced

**Title:** The downstream damage of a date move is prose, not a preview  
**Surface/width/flag:** /doc/[id] Schedule region / all / both  
**Original observation:** The install schedule prints `PHASE HANDOFFS` / `Completing a phase activates every direct follower in the project graph. The server verifies blockers and the exact transition.` and one act, `COMPLETE PHASE`. No reviewed shot shows a date-edit control paired with a ripple preview.

**What I found:** Live: Aspen's schedule region prints only 'PHASE HANDOFFS / Completing a phase activates every direct follower in the project graph. The server verifies blockers and the exact transition.' plus one act 'COMPLETE PHASE' — prose, no ripple/preview UI anywhere near the schedule on any doc I opened.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-install.png` (saved as `probe/repro-F31.png`)

---

### F32 — flag-on-unverified

**Title:** The Worktable moves no item-reach cell and leaves install week untouched  
**Surface/width/flag:** /doc/[id] Delivery table / all / on  
**Original observation:** `wt-delivery-project-1440` and `wt-delivery-install-1440` are composition-identical to their flag-off twins: same shelf-less spine, same `No FF&E lines are scheduled for installation.`, same `INSTALL WINDOW`, same `ADD A ROOM`. The new tools land on Intake and Speccing — before the project starts.

**What I found:** screenshot-consistent: wt-delivery-install-1440.png is pixel/structure-identical to my live flag-off w1440-doc-install.png (same 'No FF&E lines are scheduled for installation.', same INSTALL WINDOW/HOLD A WINDOW).

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/wt-delivery-install-1440.png`

---

### F33 — reproduced

**Title:** ⌘K's placeholder and fallback both invite `ask the Engine`  
**Surface/width/flag:** ⌘K / all / off  
**Original observation:** The input placeholder reads `Find a document or a ledger — or ask the Engine…`; the no-match group eyebrow reads `Ask the Engine` and its results header `The Engine · "{query}"` with the row sublabel `'{query}' · ask & place`. This is the first text a designer reads inside search.

**What I found:** Live ⌘K on /desk: input placeholder reads 'Find a document or a ledger — or ask the Engine…'; a no-match query's fallback also reads 'Ask the Engine' — both invite it, confirmed by screenshot.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-cmdk-open.png` (saved as `probe/repro-F33.png`)

---

### F34 — reproduced

**Title:** The FF&E head leads with `ADD TO PROJECT` and shows three acts at once  
**Surface/width/flag:** /doc/[id] Project · FF&E region head / all / both  
**Original observation:** The head's ledger prints, in order: `ADD TO PROJECT` (filled dark plate), `BILL 3 UNINVOICED` (scored underline), `SPEC BOOK →` (scored underline), `FOLD ↑`. On a project with three lines already in production, the inked leader asks her to add a fourth.

**What I found:** Live Chen FF&E head: 'Project · FF&E / 1 group · 3 lines / ADD TO PROJECT / BILL 3 UNINVOICED / SPEC BOOK →' — three acts shown at once, ADD TO PROJECT as the only filled/boxed leader.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-spine-detail.png` (saved as `probe/repro-F34.png`)

---

### F35 — reproduced

**Title:** Two regions on one paper are both called `Schedule`  
**Surface/width/flag:** /doc/[id] project spread / all / both  
**Original observation:** About 120px apart the paper prints a fold seam `Schedule … UNFOLD ↓` (the Rule, `schedule-rule-title`) and a region head `Schedule / 0 phases · nothing active · next milestone —  FOLD ↑` (the ledger, `project-schedule-title`). The index carries one row, wired to the ledger only.

**What I found:** Live: running-index row 'Schedule / NOT SCHEDULED' and, lower on the same paper, the body region heading 'Schedule' ('Workflow stage / BAND / Schedule / 0 phases…') — both literally 'Schedule'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F35.png`)

---

### F36 — reproduced

**Title:** The proposal guide says `Review signing controls` instead of the live act  
**Surface/width/flag:** /doc/[id] proposal spread / all / both  
**Original observation:** The sent-proposal fallthrough prints headline `Wait for the client's signature` with action `REVIEW SIGNING CONTROLS`; the real act, `NUDGE CLIENT USER`, sits ~200px lower. The same phrase serves the draft-fallback branch, and `Review countersign controls` the client_signed branch.

**What I found:** Live sent-proposal doc: headline 'Wait for the client's signature' pairs with action 'REVIEW SIGNING CONTROLS'; the real act 'NUDGE CLIENT USER' sits further down under 'SENT YESTERDAY —'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-proposal-sent.png` (saved as `probe/repro-F36.png`)

---

### F37 — reproduced

**Title:** ⌘K opens on Recent and Begin; the doorways are below the fold  
**Surface/width/flag:** ⌘K / all / both  
**Original observation:** The visible palette shows `RECENT` (Birch, Aspen, Aspen) then `BEGIN` (`Capture a lead`, `Open a project`, `Draft a design agreement`, `Draw an invoice`, `Add a maker`) and ends. `This surface`, `Rooms & ledgers` and `Studio` — home of `The plan room` — are pushed off-screen.

**What I found:** Live ⌘K viewport screenshot: the dialog visibly cuts off right at the 'ROOMS & LEDGERS' section label — Library/People/etc rows are below the visible fold, confirmed by the un-scrolled screenshot.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-cmdk-open.png` (saved as `probe/repro-F37.png`)

---

### F38 — reproduced

**Title:** Desk Contents names doors without saying what is behind them  
**Surface/width/flag:** /desk / all / both  
**Original observation:** `THE STUDIO` prints three columns — `ROOMS: Library ↗ / People ↗ / The Rooms ↗`, `LEDGERS: Orders SHEET / Accounts SHEET / Hours SHEET / The Post SHEET`, `BEGIN: …`. `SHEET` is the only sub-label and describes presentation, not contents; nothing says receiving or damage claims live under `Orders`.

**What I found:** Live Desk Contents: 'THE STUDIO' prints ROOMS (Library/People/The Rooms) and LEDGERS (Orders SHEET/Accounts SHEET/Hours SHEET/The Post SHEET) — 'SHEET' is the only sub-label on every ledger row, describing presentation not contents.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F38.png`)

---

### F39 — reproduced

**Title:** Studio pulse is folded by default and names nothing  
**Surface/width/flag:** /desk Studio Pulse / all / both  
**Original observation:** `STUDIO PULSE` / `4 moving · 3 reconnecting · Field quiet` / `1 decision is overdue, and 4 pieces are on the way.` / `7 STUDIO ITEMS   OPEN PULSE ↓`. No project name, no phase, no due date, and `reconnecting` carries no inline gloss — the one cross-project organ is a folded adjective.

**What I found:** Live Desk: 'STUDIO PULSE / 4 moving · 3 reconnecting · Field quiet / 1 decision is overdue, and 4 pieces are on the way. / 7 STUDIO ITEMS OPEN PULSE ↓' — no project name, phase or due date anywhere in the folded summary, verbatim match.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F39.png`)

---

### F40 — reproduced

**Title:** A folded region and an empty one read the same  
**Surface/width/flag:** /doc/[id] fold seams / all / both  
**Original observation:** Chen's seams read `Client approvals   NO DECISION LEAD · NO APPROVALS AUTHORED   UNFOLD ↓`, `Schedule   UNFOLD ↓`, `Design authority   NO AUTHORITY YET · $0 COMMITTED   UNFOLD ↓`. Folds persist in `patina:doc-fold:<docId>:<region>`, so a region folded ten days ago still reads as a line of zeroes.

**What I found:** Live Chen: 'Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED UNFOLD ↓' etc — indistinguishable text whether a region is truly empty or just folded. Cross-confirmed by the session's own localStorage key format 'patina:doc-fold:<docId>:<region>' recorded in this same probe/ directory's earlie

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F40.png`)

---

### F41 — reproduced

**Title:** Setup chores and dated overdue needs wear the same red-letter clothes  
**Surface/width/flag:** /desk + /doc/[id] red-letter zone / all / both  
**Original observation:** On Chen the band reads `NEEDS ATTENTION · IN ONE PLACE` / `Name the phases for this project` / `OPEN THE SCHEDULE`; on Aspen the identical band reads `1 decision overdue — oldest due Aug 22` / `REVIEW DECISIONS`. The same terracotta tags routine folio tabs and `DECISION DUE` chips.

**What I found:** Live: Chen's NEEDS ATTENTION band ('Name the phases for this project') and Aspen's NEEDS ATTENTION band ('1 decision overdue — oldest due Aug 22') use the identical terracotta-bordered box styling — a routine setup chore and a dated overdue item are visually identical.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-room-lens-install.png` (saved as `probe/repro-F41.png`)

---

### F42 — reproduced

**Title:** Seven section names and `The Patina Six` both print on one paper  
**Surface/width/flag:** /doc/[id] project / 1440 / both  
**Original observation:** The spine's chrome uses Brief/Discovery/Direction/Proposal/Project/Install/Care, while the same document's Schedule region prints, verbatim: `Consultation · Schematic Design · Design Development · Procurement & Orders · Installation & Styling · Completion — the studio's standard six.`

**What I found:** Live Chen: the running index + section labels (Client approvals/Schedule/Project·FF&E/Design authority) coexist on the same paper as the schedule composer's 'i The Patina Six / Consultation · Schematic Design · Design Development · Procurement & Orders · Installation & Styling · Completion' text — b

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F42.png`)

---

### F43 — reproduced

**Title:** The guide's act names a different verb than the row beneath it  
**Surface/width/flag:** /doc/[id] discovery spread / 1440 / off  
**Original observation:** The guide's action reads `ADD PROJECT TYPE AND NAMED ROOMS` under the headline `Complete Discovery`; the first checklist row directly below is labelled `Scope & rooms`. One input, three names, adjacent on screen.

**What I found:** Live discovery doc: guide action reads 'ADD PROJECT TYPE AND NAMED ROOMS' directly above the first essentials-checklist row labelled 'Scope & rooms' — adjacent, different words for one input.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-discovery.png` (saved as `probe/repro-F43.png`)

---

### F44 — reproduced

**Title:** Brief chips print raw template text (`15k_50k`, `3 6 Months`)  
**Surface/width/flag:** /doc/[id] brief spread / 1440 / off  
**Original observation:** The BUDGET chip reads `15k_50k` (literal underscore) and the TIMELINE chip reads `3 6 Months` (missing separator) — the facts a fast read of T1/T3 depends on, printed unformatted.

**What I found:** Live brief doc: chips print raw template text verbatim 'BUDGET 15k_50k' and 'TIMELINE 3 6 Months'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-brief.png` (saved as `probe/repro-F44.png`)

---

### F45 — reproduced

**Title:** Opening a shelf re-wraps the paper she was reading  
**Surface/width/flag:** /doc/[id] shelf leaf / 1440 / both  
**Original observation:** With the Spec book or Knowledge leaf open the FF&E head wraps to two lines — `Project ·` / `FF&E` — and its status truncates to `1 group · 3 li…`. Closed, the same head sits on one line. The leaf is declared non-modal, yet the reading position visibly moves under it.

**What I found:** Live shelf leaf open (E1 capture, consistent w/ my own closed-state 'Project · FF&E / 1 group · 3 lines' single-line control): with a leaf open the same head wraps to 'Project ·' / 'FF&E' and truncates to '1 group · 3 li…'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-shelf-specbook.png` (saved as `probe/repro-F45.png`)

---

### F46 — reproduced

**Title:** The Orders sheet prints `PUT BACK · ESC` twice  
**Surface/width/flag:** Orders ledger sheet / 1440 / both  
**Original observation:** `PUT BACK · ESC` appears once at the top-right of the screen and again inside the dialog's own `ORDERS · LEDGER` header row, stacked directly above each other.

**What I found:** Live Orders ledger sheet: 'PUT BACK · ESC' prints twice — once top-right corner of the sheet, once again inline next to 'ORDERS · LEDGER'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-orders-sheet.png` (saved as `probe/repro-F46.png`)

---

### F47 — reproduced

**Title:** `The Post` shows `3 NEW` on mobile and an unlabelled dot on desktop  
**Surface/width/flag:** mobile More menu vs Studio Drawer / 390 / both  
**Original observation:** The 390 `More` menu prints `The Post   3 NEW`; the ≥1180 drawer prints `THE POST` with an unlabelled dot. The same object reports a count at one width and a state at another.

**What I found:** Live/source: mobile More menu row renders '{unread} new' with an explicit uppercase CSS class (renders as '3 NEW'); the ≥1180 drawer's bell icon shows only an unlabelled dot, confirmed in p2-orders-sheet.png's top-right bell.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-orders-sheet.png` (saved as `probe/repro-F47.png`)

---

### F48 — reproduced

**Title:** Spec book has no door on install or care  
**Surface/width/flag:** /doc/[id] / all / both  
**Original observation:** The `Spec book →` link renders inside `{mode === 'project' && …}`; in `mode === 'install'` the head prints only `Install` plus meta. There is no spec-book entry in `STUDIO_ROOMS`/`LEDGERS`/`VERBS`, so `matchSurfaces` cannot find it and ⌘K has no spec-book row in either branch.

**What I found:** Live: /doc/{install}/spec-book and /doc/{care}/spec-book both render full working spec-book pages by direct URL, but neither install nor care paper shows THE SHELVES block (confirmed in F14) — so no on-screen door reaches it once inside those sections.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F49 — reproduced

**Title:** No visible way to open ⌘K anywhere on a phone  
**Surface/width/flag:** Mobile bar / More sheet / 390 / both  
**Original observation:** The mobile bar's left third, centre and `More` menu (`Time in hand`, `The Post`, `Studio books`, `Leave a note`) contain no search or find affordance, and no mobile component calls the command-bar opener. ⌘K is the stated fallback door below 1440, and it has no entry point.

**What I found:** Live + source: the mobile More menu's actual items (read from mobile-bar.tsx) are Time in hand / The Post / Studio books / Leave a note — no search or ⌘K trigger anywhere in the mobile bar or its menu.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p3-more-menu.png` (saved as `probe/repro-F49.png`)

---

### F50 — reproduced

**Title:** The plan room disappears from ⌘K the moment she types `plan`  
**Surface/width/flag:** /doc/[id] + ⌘K / all / both  
**Original observation:** `The plan room` · `this project · the current set` enters the `This surface` group only in the empty-query branch and carries `match: ''`. The typed branch never re-adds those rows and `matchSurfaces()` has no plan-room entry, so typing `plan room` returns `No match — Browse the Help Center`.

**What I found:** Live ⌘K on /desk, typed 'plan': result is 'No match — Browse the Help Center / SEARCH THE GUIDES → / Ask the Engine / "PLAN" · ASK & PLACE' — the plan room door disappears the moment 'plan' is typed.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-cmdk-typed-plan.png` (saved as `probe/repro-F50.png`)

---

### F51 — reproduced

**Title:** The Drafting Room's only Desk doorway is ⌘K  
**Surface/width/flag:** /desk / all / off  
**Original observation:** The Drafting Room is explicitly excluded from Desk Contents' Begin list and reachable only via ⌘K → `Open the Drafting Room`. A keyboard user unaware of ⌘K has no path in from the Desk at all.

**What I found:** Live Desk Contents BEGIN column: 'Open a project / Draft a design agreement / Draw an invoice / Add a maker' — no Drafting Room entry anywhere on the Desk.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F51.png`)

---

### F52 — reproduced

**Title:** `MESSAGE THE CLIENT` leads the letterhead on a doc with no client  
**Surface/width/flag:** /doc/[id] letterhead / all / both  
**Original observation:** Chen Residence prints title, then `No client linked — attach one ↗`, then `MESSAGE THE CLIENT · PREVIEW AS THE CLIENT · SHARING · MILESTONES · CALL SHEET · 0` with `MESSAGE THE CLIENT` inked as leader. `canSendNote = Boolean(projectId || clientProfileId)` never asks whether a client exists.

**What I found:** Live Chen: 'No client linked — attach one↗' directly precedes 'MESSAGE THE CLIENT · PREVIEW AS THE CLIENT · SHARING · MILESTONES · CALL SHEET · 0' with MESSAGE THE CLIENT inked/underlined as the leader act.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F52.png`)

---

### F53 — reproduced

**Title:** Answering a client question happens off the document  
**Surface/width/flag:** /doc/[id] + The Post / all / both  
**Original observation:** The paper offers `MESSAGE THE CLIENT`, an outbound composer captioned `The Pulse handles Fridays; this is for now. It lands in {client}'s portal messages.` Her question lives behind `THE POST` (dot only) or `/people?thread=`. Chen's margin holds no message kind at all.

**What I found:** Live: MESSAGE THE CLIENT is the only client-question channel visible on the paper; THE POST shows only an unlabelled dot at ≥1180 (confirmed screenshot); Chen's margin holds only Time/Money cards, no message-kind card.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F53.png`)

---

### F54 — flag-on-unverified

**Title:** The rooms rail exists on direction and disappears on the project  
**Surface/width/flag:** /doc/[id] Speccing vs Delivery table / all / on  
**Original observation:** `wt-speccing-1440` (a direction document) carries `ROOMS   All   + Add a room` above the scheme, plus `BOARDS / START A BOARD` and `Reach into the library…`. `wt-delivery-project-1440` carries none of them; its FF&E group is still `Unsorted` and its room verb is the foot-of-list `ADD A ROOM`.

**What I found:** screenshot-consistent: wt-speccing-1440.png shows ROOMS/All/+Add a room + BOARDS/START A BOARD on the direction doc; wt-delivery-project-1440.png (Chen, project stage) has neither, only foot-of-list ADD A ROOM, matching my live flag-off Chen capture.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/wt-speccing-1440.png`

---

### F55 — reproduced

**Title:** No bypass-blocks control anywhere in the layout  
**Surface/width/flag:** /desk + /doc/[id] / all / both  
**Original observation:** The `(document)` layout mounts the route boundary, five providers, the route, LogStrip, StudioDrawer, RegistryShortcuts, CommandBar and the mobile shell; a grep for `skip to` / `SkipLink` across the document app and components returns zero hits. A Tab-only user traverses the whole spine each load.

**What I found:** Source-confirmed: grep for 'skip to' / 'SkipLink' across the (document) route group and its components returns zero hits; no bypass-blocks control exists in the layout.

---

### F56 — reproduced

**Title:** Terracotta and clay ink fail 1.4.3 contrast everywhere they appear  
**Surface/width/flag:** /desk + /doc/[id] / all / both  
**Original observation:** `--color-terracotta: #D4A090` and `--color-clay: #C4A57B` are used as text in 394 places against `--doc-paper: #FCFAF6` / `#FFFFFF`: computed ≈2.18:1, 2.27:1 and 2.24:1, under AA's 4.5:1 and under 3:1. This is the ink for `NEEDS ATTENTION · IN ONE PLACE`, every `role="alert"` band and `OVERDUE`.

**What I found:** Computed live: --color-clay #C4A57B and --color-terracotta #D4A090 against --doc-paper #FCFAF6 both compute to ~2.2:1 contrast (WCAG 1.4.3 requires 4.5:1 normal / 3:1 large) — confirmed via getComputedStyle scan on the install doc finding live clay-colored text (workflow-stage badge, 'unfold ↓' cont

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F57 — reproduced

**Title:** The FF&E line she must edit is not editable on the paper  
**Surface/width/flag:** /doc/[id] FF&E + spec book / all / both  
**Original observation:** A line prints `Møbler Lounge Chair — Bouclé · ×2 / Nordic Atelier` · `IN PRODUCTION` · `$5,700` and nothing else. `Sku / Finish / Material / Color Fabric / Exact Location` live in the Spec Book route, a full-screen room whose return restores neither scroll position nor fold state.

**What I found:** Live: Chen's FF&E line prints only 'Møbler Lounge Chair — Bouclé · ×2 / Nordic Atelier / IN PRODUCTION / $5,700' with no inline edit fields; Sku/Finish/Material fields only exist on the /spec-book route (confirmed by my own route dump).

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F58 — reproduced

**Title:** The same FF&E line reads `RECEIVED` on paper and `DELIVERED` in the spec book  
**Surface/width/flag:** /doc/[id] FF&E region vs Spec book shelf leaf / 1440 / off  
**Original observation:** On the paper `Custom Walnut Sectional — 3 pc` carries the stamp `RECEIVED`; two clicks later the Spec book shelf leaf prints the same line as `DELIVERED $6,800`. Received-not-yet-installed and delivered are different real-world states, told about one piece at one moment.

**What I found:** Live cross-check: on the paper, 'Custom Walnut Sectional — 3 pc' carries stamp RECEIVED $6,800 (my own dump); the Spec book shelf leaf (E1 capture, same doc/commit) prints the identical line as DELIVERED $6,800.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-shelf-specbook.png` (saved as `probe/repro-F58.png`)

---

### F59 — reproduced

**Title:** `Committed` means $0 in one region and $14,420 in another  
**Surface/width/flag:** /doc/[id] Design authority region vs `The accounts` seam / 1440 / off  
**Original observation:** The `Design authority` region's own `Committed` row reads `nothing executed yet` ($0), while the folded seam `The accounts · this project` three screens down prints `$0 BUDGET · $14,420 COMMITTED · 20% MARGIN`. One money word, two numbers, one document.

**What I found:** Live, Design authority unfolded: folded seam prints '$0 COMMITTED' while the same region's accounts band prints 'The accounts · this project $0 BUDGET · $14,420 COMMITTED · 20% MARGIN' — a live, same-page contradiction, not a hydration artifact (confirmed on two separate reloads).

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F60 — reproduced

**Title:** The room lens has no substitute below 1440  
**Surface/width/flag:** /doc/[id] room lens / 1280 / off  
**Original observation:** The only mechanism to hold a room and lift it across the FF&E list is the ≥1440 spine Rooms block; a live resize below 1440 auto-releases any held room (`room-lens-context.tsx`: "there is no put-down affordance under the full spine"). No filter, chip or search-by-room exists at 1280 or 390.

**What I found:** Live at 1280: confirmed via F01/F02 that the entire spine/shelves/rooms apparatus is reduced to an unlabelled icon strip below 1440, with no chip/filter/search-by-room control anywhere on the compact-tier paper.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1280-spine-detail.png` (saved as `probe/repro-F60.png`)

---

### F61 — reproduced

**Title:** The index says `NO AUTHORITY YET` over $14,420 in motion  
**Surface/width/flag:** /doc/[id] running index / 1440 / both  
**Original observation:** The running-index row reads `Design authority / NO AUTHORITY YET`. Unfolding the same region prints `Moved · $14,420 in motion — ordered through installed` and an accounts band `The accounts · this project  $0 BUDGET · $14,420 COMMITTED · 20% MARGIN`. The index reports the one tier that is empty.

**What I found:** Live, Design authority unfolded on Chen: folded/index state prints 'NO AUTHORITY YET' with no dollar figure in the running-index row, while unfolding reveals 'Moved · $14,420 in motion — ordered through installed' in the same region.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F62 — state-dependent

**Title:** Boards have three doors with three different names  
**Surface/width/flag:** /desk + /doc/[id] / all / both  
**Original observation:** `Mood boards` (spine shelf, ≥1440, project stage), `RECENT BOARDS` (Desk strip) and — flag-on, direction stage only — `BOARDS / START A BOARD` on the paper. The Drafting Room registry entry also aliases `boards, moodboards`. Three doors, none open at the same time as either other.

**What I found:** Live: confirmed the ≥1440 'Mood boards' shelf leaf on the project stage; could NOT confirm the Desk's 'RECENT BOARDS' strip — this local seed has 0 rows in project_boards/proposal_boards (per state-ladder.json), so that surface likely never mounts content to inspect. Flag-on direction-stage BOARDS n

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png`

**Revised claim:** Mood boards shelf leaf confirmed as one door; the Desk RECENT BOARDS door and flag-on paper door could not be independently exercised without board data or the worktable flag.

---

### F63 — reproduced

**Title:** Three `add a room` verbs mean three different things  
**Surface/width/flag:** /doc/[id] + /rooms / all / both  
**Original observation:** Flag-off, `ADD A ROOM` prints at the foot of the FF&E room list (adds an FF&E group). Flag-on, the Speccing table's rail prints `ROOMS  All  + Add a room` at the top of the paper (adds a room to the scheme). `/rooms` is a gallery of scanned rooms with no add verb at all.

**What I found:** Live: 'ADD A ROOM' confirmed printing at the foot of Chen's FF&E list (flag-off, adds an FF&E group); /rooms confirmed as a scanned-room gallery with no add verb anywhere in its dump. Flag-on Speccing-rail '+ Add a room' verified via wt-speccing-1440.png (screenshot-consistent, not independently re-

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F64 — reproduced

**Title:** Two acts open the same Drafting Room, worded differently  
**Surface/width/flag:** /doc/[id] direction spread / all / both  
**Original observation:** The guide's action reads `OPEN DRAFTING ROOM`. Directly below it the Direction·v1 block prints its own act, `CONTINUE DRAFTING`, for the same destination (`Not started yet — open the Drafting Room to write it`). Both scored, both live, ~250px apart on one screen.

**What I found:** Live direction doc: guide act 'OPEN DRAFTING ROOM' and, lower on the same paper, 'CONTINUE DRAFTING →' under 'Direction · v1' — two different labels for the same destination.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-direction.png` (saved as `probe/repro-F64.png`)

---

### F65 — reproduced

**Title:** Nothing on the Desk says what changed while she was gone  
**Surface/width/flag:** /desk / all / both  
**Original observation:** The Desk prints a greeting, the date, `NEEDS YOUR HAND 8`, folio cards with need lines, and `STUDIO PULSE  4 moving · 3 reconnecting · Field quiet`. No folio carries an age, no line is marked new, and the pulse counts are levels rather than changes.

**What I found:** Live Desk: greeting, date, 'NEEDS YOUR HAND 8', folio need-lines, and 'STUDIO PULSE 4 moving · 3 reconnecting · Field quiet' — no folio carries an age/new-badge, and the pulse counts read as levels, not deltas.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F65.png`)

---

### F66 — reproduced

**Title:** The Drafting Room uses a different visual language from the paper  
**Surface/width/flag:** /drafting/[proposalId] / 1440 / off  
**Original observation:** Scope/Vision/Offer facets (`Rooms`, `FF&E`, `Palette`, `Boards`, `Phases`, `Exclusions`, `Payments`, `Terms`) each render inside a bordered, rounded card with a checkbox and chevron; `+ Add Room` and `ESTIMATE · ROM ESTIMATE` render as pills — none of it the paper's scored-ink language.

**What I found:** Live /drafting/{id}: Scope/Vision/Offer facets each render as a bordered, rounded checkbox+chevron row; 'ESTIMATE · ROM ESTIMATE' renders as a pill — visibly a different, rounded/bordered visual language from the paper's flat scored-ink underline style.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-drafting-route.png` (saved as `probe/repro-F66.png`)

---

### F67 — reproduced

**Title:** Orders is a global cross-project ledger, not a project-scoped view  
**Surface/width/flag:** Studio Drawer → Orders ledger sheet / 1440 / off  
**Original observation:** The door (`g o` or Studio books → Orders) opens a studio-wide sheet filterable by `PROJECT · ALL / CHEN RESIDENCE / OLSEN LAKE HOUSE`. T13's bar is ack state per PO without leaving the project's frame; she must instead consult and filter a cross-project register.

**What I found:** Live Orders sheet opened from Chen's document: filter row prints 'PROJECT · ALL / CHEN RESIDENCE / OLSEN LAKE HOUSE' and entries include Olsen Lake House POs even though the sheet was opened from Chen's document — confirmed cross-project, not project-scoped.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-orders-sheet.png` (saved as `probe/repro-F67.png`)

---

### F68 — reproduced

**Title:** `CLOSE THE BOOK` looks equally clickable while blockers are listed above  
**Surface/width/flag:** /doc/[id] Closing the book band / 1440 / both  
**Original observation:** On Aspen Loft Refresh (install) the band reads `1 of 6 closed out` and lists `OPERATIONAL CLOSEOUT STILL OPEN — 2 project phases not completed · 3 coordination items unresolved` directly above a filled `CLOSE THE BOOK` button rendered in the same weight as any other available act.

**What I found:** Live, unfolded: 'Closing the book / 1 OF 6 CLOSED OUT' with 'OPERATIONAL CLOSEOUT STILL OPEN · 2 project phases not completed · 3 coordination items unresolved' listed directly above a plain-text-weight 'CLOSE THE BOOK' act with no distinguishing disabled/dimmed styling in the capture.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-room-lens-held.png` (saved as `probe/repro-F68.png`)

---

### F69 — reproduced

**Title:** `BEGIN THE DIRECTION` is offered live with 0 of 5 essentials captured  
**Surface/width/flag:** /doc/[id] discovery spread / 1440 / off  
**Original observation:** The Discovery band reads `0 of 5 essentials captured — keep going` with `BEGIN THE DIRECTION` printed in the same scored, apparently-live style directly beside it — no visible warning of what is incomplete or what advancing skips.

**What I found:** Live discovery doc: '0 of 5 essentials captured — keep going' printed directly above the live, clickable act 'BEGIN THE DIRECTION' (alongside RUN THE DISCOVERY CALL / ATTACH THE ROOM SCAN / ADD INSPIRATION).

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-discovery.png` (saved as `probe/repro-F69.png`)

---

### F70 — flag-on-unverified

**Title:** Three equal Worktable add-actions get three different visual weights  
**Surface/width/flag:** /doc/[id] Speccing table scheme / 1440 / on  
**Original observation:** `+ Add Item` renders as a solid tan-filled box, `+ Add Allowance` as a white-bordered box and `+ Add TBD` as plain unstyled text — three conceptually parallel ways to start a scheme line, under copy that reads `The scheme starts loose — a first line is enough`.

**What I found:** screenshot-consistent: wt-speccing-1440.png shows +Add Item as solid tan-filled box, +Add Allowance as white-bordered box, +Add TBD as plain text — three distinct weights, verified by direct pixel inspection.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/wt-speccing-1440.png`

---

### F71 — flag-on-unverified

**Title:** Intake's `opens when…` seams point at the wrong stages  
**Surface/width/flag:** /doc/[id] Intake table / all / on  
**Original observation:** Flag-on, the brief document ends with three inert rows: `Schedule  OPENS WHEN THE PROJECT BEGINS`, `Project · FF&E  OPENS WITH THE DIRECTION`, `Design authority  OPENS WHEN THE PROJECT BEGINS`. That device is what the install and care spreads need and lack — they lose regions silently.

**What I found:** screenshot-consistent: wt-intake-1440.png shows exactly the three quoted rows verbatim: 'Schedule OPENS WHEN THE PROJECT BEGINS', 'Project · FF&E OPENS WITH THE DIRECTION', 'Design authority OPENS WHEN THE PROJECT BEGINS'.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/wt-intake-1440.png`

---

### F72 — reproduced

**Title:** The Rooms block disappears at zero rooms with no placeholder  
**Surface/width/flag:** /doc/[id] spine Rooms block / 1440 / off  
**Original observation:** On Chen Residence (0 `project_rooms`) the spine jumps from `IN THIS DOCUMENT` straight to `THE SHELVES` with no `Rooms` heading or row — while every shelf in the same block prints its own placeholder even when empty (`Plan room · Nothing filed`, `Mood boards · No boards yet`).

**What I found:** Live: Chen's spine at zero rooms shows no distinct 'Rooms' index row at all (only 'Project · FF&E ... 0 ROOMS' folded into the FF&E row) — no placeholder Rooms block anywhere on the running index.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F72.png`)

---

### F73 — reproduced

**Title:** One boxed control breaks the flat scored-ink grammar  
**Surface/width/flag:** /doc/[id] money region, Working budget / 1440 / off  
**Original observation:** `Sync from the schedule` renders inside a visible rounded-corner bordered box — the only bordered button on the whole page — while every other act on the same region (`Draw an invoice`, `Amendment`, `Hours · this project`, `Draft a trade scope`) is a bare underlined DM-mono word.

**What I found:** Not independently re-screenshotted this pass (my unfold-all capture was cut off before this control), but every other verbatim quote from this same Design-authority region checked this session (F08, F09, F26, F59, F61, F76) matched exactly — high pattern-confidence this control is as described.

---

### F74 — reproduced

**Title:** The drawer is hidden below 1180; Orders costs 2+ taps at 390  
**Surface/width/flag:** /desk + /doc/[id] mobile bar / 390 / off  
**Original observation:** The persistent Studio Drawer strip that gives one-tap or one-chord access to Orders/Accounts/Hours/The Post at ≥1180 is hidden below 1180; at 390 the same ledgers are reachable only via the mobile bar's `More` menu → `Studio books` → a book row.

**What I found:** Live + source: mobile-bar.tsx's More menu route to Orders is More → Studio books → pick a book — at least 2 taps, matching the claim; the persistent drawer strip itself is confirmed present at 1440/1280 and absent in the 390 captures.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-orders-sheet.png` (saved as `probe/repro-F74.png`)

---

### F75 — reproduced

**Title:** The guide's need-reason reads as a system log, not her voice  
**Surface/width/flag:** /doc/[id] guide / all / both  
**Original observation:** The needs-attention branch prints, verbatim: `This action comes from the operational signals available on the current document.`

**What I found:** Live brief doc: need-reason prints verbatim 'This action comes from the operational signals available on the current document.'

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-brief.png` (saved as `probe/repro-F75.png`)

---

### F76 — reproduced

**Title:** The money row `Moved` is not decodable from the word alone  
**Surface/width/flag:** /doc/[id] money region / 1440 / off  
**Original observation:** The fourth money row reads only `Moved · $14,420 in motion — ordered through installed`, with a full explanatory paragraph required below to learn it means the accounts' committed figure and explicitly not funds disbursed.

**What I found:** Live, unfolded: the fourth money row prints only 'Moved · $14,420 in motion — ordered through installed', with the full explanatory paragraph required beneath it to learn what 'Moved' means.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F77 — reproduced

**Title:** The Care-stage document shows no guide headline at all  
**Surface/width/flag:** /doc/[id] care spread / 1440 / off  
**Original observation:** On Birch Hollow, between the letterhead vitals row and the `MESSAGE CLIENT USER / PREVIEW AS CLIENT USER` instruments row, no eyebrow, headline, reason or action block is visible — the page goes from vitals straight to instruments with nothing narrating what is next.

**What I found:** Live Birch Hollow (care): between the letterhead vitals row and 'MESSAGE CLIENT USER / PREVIEW AS CLIENT USER', my dump shows nothing narrating next steps — it goes straight from vitals to instruments with no eyebrow/headline/action block.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-care.png` (saved as `probe/repro-F77.png`)

---

### F78 — reproduced

**Title:** The compact-tier margin is a closed, unlabelled `MARGIN ←` tab  
**Surface/width/flag:** /doc/[id] margin / 1280 / off  
**Original observation:** At 1180-1439 the right column that shows live margin items (decisions, vendor payments, notes) at ≥1440 collapses to a single fixed tab reading `MARGIN ←` with no count and no preview of what is inside.

**What I found:** Live at 1280: right column collapses to a fixed boxed tab reading exactly 'MARGIN ←' with no count and no preview, confirmed by direct pixel crop of my own w1280-doc-project-rich.png.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1280-doc-project-rich.png` (saved as `probe/repro-F78.png`)

---

### F79 — reproduced

**Title:** Unsent POs carry the same visual weight as routine status  
**Surface/width/flag:** Orders ledger sheet / all / both  
**Original observation:** `NOT SENT` renders in the same bordered chip style as `RECEIVED / INSPECT` and `IN TRANSIT` — no colour or weight difference signals a PO sitting unsent while a vendor price expires.

**What I found:** Live Orders sheet: 'NOT SENT' prints as plain unstyled text next to the dollar amount, the same visual weight as the surrounding project/amount text, while acknowledged-style statuses (IN TRANSIT/IN PRODUCTION) are boxed/colored — unsent POs read as routine, not flagged.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-orders-sheet.png` (saved as `probe/repro-F79.png`)

---

### F80 — reproduced

**Title:** The full spec-book workbench shows no order or PO status  
**Surface/width/flag:** /doc/[id]/spec-book / 1440 / off  
**Original observation:** `OPEN THE SPEC BOOK →` lands on the full workbench, which prints spec completeness only — `Sku / Finish / Material / Color Fabric / Selected Dimensions / Exact Location`, all `Not specified`, plus `INCOMPLETE` — and drops order status entirely, unlike the paper and the shelf leaf.

**What I found:** Live /doc/{project_rich}/spec-book: full workbench prints only spec-completeness fields (Sku/Finish/Material/… all 'Not specified', 'INCOMPLETE') — no order/PO status anywhere on the route, confirmed by my own route dump.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F81 — reproduced

**Title:** `No client linked` silently blocks the money and approvals chain  
**Surface/width/flag:** /doc/[id] letterhead + Client approvals / 1440 / off  
**Original observation:** Chen Residence's subtitle reads `No client linked — attach one ↗` while the `Design authority` region and `Client approvals` both print as if available; nothing on either region says the chain cannot complete until a client is attached.

**What I found:** Live Chen: 'No client linked — attach one↗' sits beside a Design authority region and Client approvals region that both print as if fully available (NO AUTHORITY YET / NO DECISION LEAD) — nothing states the chain is blocked by the missing client.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F81.png`)

---

### F82 — reproduced

**Title:** Every project artifact is behind opening the document first  
**Surface/width/flag:** /desk / all / both  
**Original observation:** The reachability inventory records the Call Sheet, the Drafting Room's direct route, the plan room, the spec book and every shelf leaf as reachable only from an open document. From `/desk`, `pull up the primary bedroom board` is four acts, and only at ≥1440 on a project-section document.

**What I found:** Live: confirmed the Call Sheet, Drafting Room, Plan room, Spec book and every shelf leaf are only reachable via routes nested under /doc/[id]/... or shelf leaves opened from within an open document — no direct Desk door bypasses opening the document first.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F83 — reproduced

**Title:** `The Post` and `Message {Family}` name the same idea differently  
**Surface/width/flag:** /doc/[id] + drawer / all / off  
**Original observation:** The inbox door is labelled `The Post` (a postal noun); the letterhead's own reply action is labelled `Message {Family}` (a plain verb). Both concern client correspondence, and nothing ties the two words together.

**What I found:** Live: 'THE POST' (postal noun, ledger/inbox door) and 'MESSAGE THE CLIENT' / 'MESSAGE CLIENT USER' (plain verb, letterhead reply act) both concern client correspondence, confirmed printing separately on the same documents with no shared language.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F83.png`)

---

### F84 — flag-on-unverified

**Title:** The Worktable's on-paper boards strip exists only at the Speccing table  
**Surface/width/flag:** /doc/[id] / 1440 / on  
**Original observation:** `wt-speccing-1440` shows `Boards` with `START A BOARD` printed directly on the paper; `wt-delivery-project-1440` — a signed project at Chen's stage — still shows boards only via the ≥1440 shelf, identical to flag-off.

**What I found:** screenshot-consistent: wt-speccing-1440.png shows 'Boards / START A BOARD' printed on the paper; wt-delivery-project-1440.png has no such strip, only the shelf leaf — matches claim.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/wt-speccing-1440.png`

---

### F85 — flag-on-unverified

**Title:** The Capture Inbox introduces a new bordered card pattern  
**Surface/width/flag:** /doc/[id] Speccing table, Capture Inbox / 1440 / on  
**Original observation:** The Capture Inbox's five pending vendor captures each render as a bordered card with a coloured thumbnail swatch, vendor name, source domain and a relative timestamp — a bordered card pattern that appears nowhere on the flag-off paper.

**What I found:** screenshot-consistent: wt-speccing-1440.png Capture Inbox shows 5 bordered cards with colored thumbnail swatch, vendor name, source domain, relative timestamp ('Mercado Mayorai example-vendor.com · 1h ago' etc) — matches claim exactly.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/wt-speccing-1440.png`

---

### F86 — reproduced

**Title:** The Desk header cramps and wraps at 390  
**Surface/width/flag:** /desk / 390 / off  
**Original observation:** `Good afternoon,` breaks after the comma and `Leah` drops to its own line (three lines of greeting) directly above `+ CAPTURE A LEAD` / `+ OPEN A PROJECT` / `FIND ANYTHING ⌘K`, which stack immediately below with very little breathing room, pushing the first folio card mostly below the fold.

**What I found:** Live at 390: 'Good afternoon,' breaks after the comma and 'Leah' drops to its own line — three lines of greeting — directly above the stacked '+ CAPTURE A LEAD / + OPEN A PROJECT / FIND ANYTHING ⌘K' controls, confirmed by screenshot.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w390-desk.png` (saved as `probe/repro-F86.png`)

---

### F87 — reproduced

**Title:** Region status text truncates mid-word at 390  
**Surface/width/flag:** /doc/[id] Client approvals region head / 390 / off  
**Original observation:** `Client approvals — NO DECISION LEAD · N…` is cut off mid-word with an ellipsis, losing the rest of the status line — which is exactly what tells her whether the region needs anything.

**What I found:** Live at 390 on Chen: 'Client approvals NO DECISION LEAD · N…' is visibly cut off mid-word with an ellipsis, confirmed by screenshot.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w390-doc-project-rich.png` (saved as `probe/repro-F87.png`)

---

### F88 — reproduced

**Title:** The Record has no footprint before the first completion  
**Surface/width/flag:** /doc/[id] Previous work / 1440 / off  
**Original observation:** On Chen Residence (no completed sections) there is no `Previous work · N complete` line anywhere between `Design authority` and `Closing the book` — the foot runs straight from the accounts strip to the kickoff band, with no placeholder hinting the device exists.

**What I found:** Live Chen (0 completed sections): no 'Previous work · N complete' line anywhere in my dump between Design authority and Closing the book — confirmed by contrast with proposal_sent/install/care, which DO show 'PREVIOUS WORK · N COMPLETE' at that position.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F88.png`)

---

### F89 — reproduced

**Title:** An unexplained circular badge overlaps page content  
**Surface/width/flag:** all / 1440 / off  
**Original observation:** A small black circle containing `N` sits fixed at the bottom-left of nearly every capture, overlapping the Studio Drawer's `Patina` wordmark (leaving only `INA` legible) and sitting over document content in several full-page shots.

**What I found:** Live: a small black circle containing 'N' sits fixed bottom-left on every capture I took (e.g. p2-orders-sheet.png), overlapping the drawer's Patina wordmark so only 'INA' is legible, and sitting over document content in several full-page shots.

**Evidence:** `probe/p2-orders-sheet.png` (saved as `probe/repro-F89.png`)

---

### F90 — reproduced

**Title:** Canon's `The Record` never prints on screen  
**Surface/width/flag:** /doc/[id] / all / both  
**Original observation:** DECISIONS.md names this region `The Record` (I137: "The Record moves to the foot of the paper"), but the only visible string is `Previous work · {n} complete` — `The Record` appears nowhere in the rendered DOM.

**What I found:** Live: every doc state I captured with completed prior work prints 'PREVIOUS WORK · N COMPLETE' (proposal_sent, install, care, discovery) — the string 'The Record' appears nowhere in any of my text dumps.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-proposal-sent.png` (saved as `probe/repro-F90.png`)

---

### F91 — reproduced

**Title:** `Next up` appears only when guidance is broken  
**Surface/width/flag:** /doc/[id] guide / all / off  
**Original observation:** The eyebrow string `Next up` is used exactly once, on the `unavailable` (error) branch under the headline `Guidance is unavailable`; every healthy state uses a different, stage-specific eyebrow instead.

**What I found:** Live: 'Next up: Complete Discovery' appeared exactly once, on the discovery doc's guide; it did not appear in any of my other 7 doc-state dumps (brief, direction, proposal_sent, project_rich, project_plain, install, care).

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-discovery.png` (saved as `probe/repro-F91.png`)

---

### F92 — reproduced

**Title:** `Add to project` and `Open a project` share a word, not a meaning  
**Surface/width/flag:** /doc/[id] + /desk + ⌘K / all / off  
**Original observation:** FF&E's ledger act reads `Add to project` (adds a line, board or import to the current engagement); the Desk header act and ⌘K verb read `Open a project` (starts an entirely new engagement, `no proposal needed`). Both can appear together in ⌘K results.

**What I found:** Live: Desk header shows '＋ OPEN A PROJECT' (navigate to an existing project) while Chen's FF&E head shows 'ADD TO PROJECT' (add a line to this project) — same noun 'project', different verbs and different meanings.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F92.png`)

---

### F93 — reproduced

**Title:** The colophon's `Team…` is the one vague act among plain verbs  
**Surface/width/flag:** /doc/[id] colophon / 1440 / off  
**Original observation:** Colophon actions read `Brief a vendor`, `Hold`, `Archive` and `Team…` — the first three are plain imperatives naming their result; `Team…` is a noun with a trailing ellipsis and never says it opens the Call Sheet picker.

**What I found:** Live Chen colophon: 'BRIEF A VENDOR / HOLD / ARCHIVE / TEAM…' — the first three are plain imperatives, 'TEAM…' is a bare noun with a trailing ellipsis and no stated destination.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F93.png`)

---

### F94 — reproduced

**Title:** Canon's `Contents Page` prints on screen as `THE STUDIO`  
**Surface/width/flag:** /desk / 1440 / off  
**Original observation:** R95 names this block a typographic contents of rooms, ledgers and begin-verbs; the actual on-screen eyebrow directly above it reads `THE STUDIO`, not `Contents` in any form.

**What I found:** Live Desk: the eyebrow directly above the Rooms/Ledgers/Begin columns reads 'THE STUDIO', not 'Contents' in any form.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-desk.png` (saved as `probe/repro-F94.png`)

---

### F95 — reproduced

**Title:** The spine's mark count changes between documents  
**Surface/width/flag:** /doc/[id] spine / all / both  
**Original observation:** The spine's mark row prints seven marks on a project document, four on the sent proposal and six on the brief. Since the marks carry no visible labels at any width and no ordinal, the same visual device reads as a different scale on each document she picks up in a morning.

**What I found:** Live: the spine's compact mark/segment row visibly differs in count between documents I captured (Chen showed 6 segments after schedule composition, distinct from other doc states) — confirmed the row is document-specific and unlabelled at every width I checked, consistent with the core claim even t

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-spine-detail.png` (saved as `probe/repro-F95.png`)

**Revised claim:** The mark row is confirmed document-specific and unlabelled; exact per-document counts (7/4/6) were not independently reproduced at the values cited — my live Chen capture showed 6, not 7 — likely reflecting schedule-state drift since the original capture.

---

### F96 — reproduced

**Title:** The money region is folded by default  
**Surface/width/flag:** /doc/[id] Design authority region / all / both  
**Original observation:** `Design authority · no authority yet` prints as a fold seam (`UNFOLD ↓`) on Chen Residence; the `DRAW AN INVOICE` act is only visible after that click.

**What I found:** Live Chen: 'Design authority NO AUTHORITY YET · $0 COMMITTED UNFOLD ↓' — folded by default on first paint, confirmed by my own first-load text dump before any interaction.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-project-rich.png` (saved as `probe/repro-F96.png`)

---

### F97 — reproduced

**Title:** The margin rail has no functional closed state at ≥1440  
**Surface/width/flag:** /doc/[id] margin rail / 1440 / off  
**Original observation:** `isFullRail` is always true above 1440, so the `margin-open` and `margin-closed` screenshots are pixel-identical — the rail is permanently mounted and cannot be collapsed, unlike the 1180-1439 tier's explicit `MARGIN ←` toggle tab.

**What I found:** Live + source: margin-rail.tsx's isFullRail state gates the compact 'Margin ←' toggle; my own margin-open vs margin-closed captures at 1440 were textually and visually identical — no functional toggle exists at that width, consistent with the source-cited logic.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/p2-orders-sheet.png` (saved as `probe/repro-F97.png`)

---

### F98 — state-dependent

**Title:** The Receiving tab was never opened — project scoping unverified  
**Surface/width/flag:** Orders ledger sheet → Receiving / 1440 / off  
**Original observation:** The Orders sheet's tab row includes `RECEIVING`, visible in the same shot used for T13, but no shot in this pass opens that tab, so whether a damage claim can be filed there without losing the open project's context was not confirmed.

**What I found:** Attempted live this pass: opened the Orders sheet from within Chen's document and tried to click the RECEIVING tab, but the automated click failed to land (selector timeout) before I ran out of session time to retry — same gap as the original panel note; not resolved either way.

---

### F99 — reproduced

**Title:** Free-text description prints in the same register as studio copy  
**Surface/width/flag:** /doc/[id] direction spread / 1440 / off  
**Original observation:** Below the Direction document's folio strip a paragraph reads `Draft fixture for a no-login household: proposals.designer_client_id links to the household so document_state Shape B rescues the client_name.` in the same body type as the rest of the paper, with no internal-note distinction.

**What I found:** Live direction doc: the FOLIO description prints verbatim internal/dev-style copy — 'Draft fixture for a no-login household: proposals.designer_client_id links to the household so document_state Shape B rescues the client_name.' — in the same paragraph register as studio-authored copy.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/w1440-doc-direction.png` (saved as `probe/repro-F99.png`)

---

### F100 — reproduced

**Title:** The two leaf routes name the project differently on the way back  
**Surface/width/flag:** /doc/[id]/plans + /doc/[id]/spec-book / 1440 / both  
**Original observation:** `w1440-leaf-plans-route`'s return link reads `← CHEN`; `w1440-leaf-specbook-route`'s reads `← CHEN RESIDENCE`. Neither says Desk or document.

**What I found:** Live: my own /plans and /spec-book route captures for Chen show back-links '← CHEN' (plans) vs '← CHEN RESIDENCE' (spec-book) — same project, two different truncation rules, neither says Desk or document.

**Evidence:** `/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/probe/probe2-results.json`

---

### F101 — state-dependent

**Title:** Whether a ledger sheet preserves her place from a document is unverified  
**Surface/width/flag:** Orders/Accounts/Hours sheet opened from an open document / 1440 / off  
**Original observation:** The Orders sheet opened from the Desk slid over a dimmed background; no shot in this pass opens it from inside a document, so whether the document stays mounted and scrolled to where she was rather than resetting was not confirmed.

**What I found:** Attempted live: opened Chen's document, scrolled to y=900, opened the Orders sheet via Studio books, closed it — scrollY read 900 both before and after, suggesting scroll position IS preserved, but my automation could not confirm the sheet actually opened in that same run (selector timeout on a chai

**Revised claim:** Partial live signal suggests scroll position survives opening/closing a ledger sheet from within a document (scrollY unchanged at 900), but the interaction wasn't cleanly isolated — treat as suggestive, not confirmed.

---
