# US-27 specimens: build spec and gate

**12 October 2026 · SQ-805.** This spec tells the specimen builders what to draw for each of the nine areas in `../synthesis/uplift.md` (c) and (d), and how `check.mjs` judges it. Five builders work from it in parallel, so every frame id, fixture value and shared rule is fixed here. Where this spec and a builder's taste disagree, this spec wins. Where this spec and `uplift.md` disagree, `uplift.md` wins and the builder reports the gap.

There are **18 files**, two per area: `specimens/<slug>-1440.html` and `specimens/<slug>-390.html`. Each file sets "today" frames (a walk screenshot) beside "proposed" frames (the uplift, drawn in HTML).

Specimens are **static illustrations.** They prove nothing about time or trust. Any click or second figure printed on them is an estimate, labelled "est.".

## 1. Files and frame table

`check.mjs` reads this table, so keep its rows in exactly this format. Only these nine lines may start with `| **`. Ids are listed one by one; there are no ranges.

A frame id is `frame-<slug>-<kind><n>`:
- `t` is a **today** frame: a walk screenshot;
- `p` is a **proposed** frame: the uplift in HTML;
- `d` is a **dark** frame: a proposed frame in the documented dark set.

Numbers run on across both widths of an area, so every id is unique within its area. Each file carries each of its frames as `data-frame="<id>"`, and `#<id>` in the URL shows that frame alone (§5).

| Slug | Area | 1440 frames | 390 frames |
|---|---|---|---|
| **desk** | 1. The Desk | `frame-desk-t1` `frame-desk-p1` `frame-desk-p2` `frame-desk-p3` `frame-desk-p4` `frame-desk-p5` `frame-desk-p6` `frame-desk-d1` | `frame-desk-t2` `frame-desk-p7` `frame-desk-p8` `frame-desk-d2` |
| **document** | 2. The Document | `frame-document-t1` `frame-document-p1` `frame-document-t2` `frame-document-p2` `frame-document-t3` `frame-document-p3` `frame-document-d1` | `frame-document-t4` `frame-document-p4` `frame-document-t5` `frame-document-p5` |
| **rooms** | 3. Rooms | `frame-rooms-t1` `frame-rooms-p1` `frame-rooms-t2` `frame-rooms-p2` | `frame-rooms-t3` `frame-rooms-p3` |
| **people** | 4. People | `frame-people-t1` `frame-people-p1` `frame-people-t2` `frame-people-p2` | `frame-people-t3` `frame-people-p3` |
| **library** | 5. Library | `frame-library-t1` `frame-library-p1` `frame-library-t2` `frame-library-p2` | `frame-library-t3` `frame-library-p3` |
| **boards** | 6. Boards | `frame-boards-t1` `frame-boards-p1` `frame-boards-t2` `frame-boards-p2` `frame-boards-t3` `frame-boards-p3` | `frame-boards-t4` `frame-boards-p4` |
| **papers** | 7. Making papers | `frame-papers-t1` `frame-papers-p1` `frame-papers-p2` `frame-papers-t2` `frame-papers-p3` | `frame-papers-t3` `frame-papers-p4` `frame-papers-t4` `frame-papers-p5` |
| **money** | 8. Money | `frame-money-t1` `frame-money-p1` `frame-money-t2` `frame-money-p2` `frame-money-p3` `frame-money-t3` `frame-money-p4` `frame-money-t4` `frame-money-p5` `frame-money-d1` | `frame-money-t5` `frame-money-p6` `frame-money-t6` `frame-money-p7` |
| **chrome** | 9. Shared chrome | `frame-chrome-t1` `frame-chrome-p1` `frame-chrome-t2` `frame-chrome-p2` `frame-chrome-t3` `frame-chrome-p3` `frame-chrome-t4` `frame-chrome-p4` `frame-chrome-t5` `frame-chrome-p5` | `frame-chrome-t6` `frame-chrome-p6` `frame-chrome-t7` `frame-chrome-p7` |

Builders: **desk + chrome**, **document**, **rooms + people + library**, **boards + papers**, **money** (the orchestrator assigns them; one builder owns both widths of an area).

## 2. Frames

### 2.1 The frame register

`check.mjs` reads every row of this table whose first cell is a backticked frame id. The fourth cell is:
- for a **today** frame, the walk screenshot, which must exist in `../walk/`;
- for a **proposed** frame, the today frame it answers;
- for a **dark** frame, the proposed frame it darkens.

"Marks" are WALK §0's count at the fold: text · controls · colour · edges.

| Frame | Width | Kind | Pairs with | What it shows |
|---|---|---|---|---|
| `frame-desk-t1` | 1440 | today | `a1-desk-fold-1440.jpg` | The Desk today, Leah. Marks 45 · 18 · 9 · 12 (WALK §1) |
| `frame-desk-p1` | 1440 | proposed | `frame-desk-t1` | At rest, 8:40, the studio's scope (US-26 x1) |
| `frame-desk-p2` | 1440 | proposed | `frame-desk-t1` | Acting, 8:41, Mine: the reminder sheet open, Holloway's card lifted (US-26 x2) |
| `frame-desk-p3` | 1440 | proposed | `frame-desk-t1` | Settled, 8:48, Mine (US-26 x3) |
| `frame-desk-p4` | 1440 | proposed | `frame-desk-t1` | 11:21, Mine, Ainsley Moore recorded: **x4 as corrected** in `uplift.md` (d) |
| `frame-desk-p5` | 1440 | proposed | `frame-desk-t1` | Jordan's view, 8:55, Mine (US-26 x5) |
| `frame-desk-p6` | 1440 | proposed | `frame-desk-t1` | Close of day, 5:50 pm, Leah, Mine: **x6 as corrected** |
| `frame-desk-d1` | 1440 | dark | `frame-desk-p1` | p1 in the documented dark set |
| `frame-desk-t2` | 390 | today | `a1-desk-fold-390.jpg` | The Desk today at 390: scrollWidth 399, dock label ellipsised. Marks 25 · 9 · 4 · 8 |
| `frame-desk-p7` | 390 | proposed | `frame-desk-t2` | p1 on Leah's phone (US-26 x8) |
| `frame-desk-p8` | 390 | proposed | `frame-desk-t2` | p6 on the phone: **x12 as corrected** |
| `frame-desk-d2` | 390 | dark | `frame-desk-p7` | p7 in the dark set |
| `frame-document-t1` | 1440 | today | `a2-document-fold-1440.jpg` | Holloway Den's paper today. Marks 37 · 17 · 15 · 12 |
| `frame-document-p1` | 1440 | proposed | `frame-document-t1` | Holloway Den's paper, Leah: "what's next on this job" |
| `frame-document-t2` | 1440 | today | `a2-document-jordan-fold-1440.jpg` | Marsh Street Kitchen, Jordan's view today. Marks 32 · 15 · 10 · 11 |
| `frame-document-p2` | 1440 | proposed | `frame-document-t2` | Marsh Street Kitchen, Jordan: "what was handed to me" |
| `frame-document-t3` | 1440 | today | `a2-spec-book-fold-1440.jpg` | The spec book today. Marks 100 · 26 · 10 · 62 |
| `frame-document-p3` | 1440 | proposed | `frame-document-t3` | The spec book after the token pass (U-Q18) |
| `frame-document-d1` | 1440 | dark | `frame-document-p1` | p1 in the dark set |
| `frame-document-t4` | 390 | today | `a2-document-fold-390.jpg` | The paper at 390: NEXT ellipsised |
| `frame-document-p4` | 390 | proposed | `frame-document-t4` | p1 at 390, the NEXT band wrapping (U-Q19) |
| `frame-document-t5` | 390 | today | `a2-spec-book-fold-390.jpg` | The spec book at 390: tabs overflow to 424 |
| `frame-document-p5` | 390 | proposed | `frame-document-t5` | p3 at 390, the tabs wrapping |
| `frame-rooms-t1` | 1440 | today | `a3-rooms-fold-1440.jpg` | Measured rooms today. Marks 26 · 7 · 10 · 35 |
| `frame-rooms-p1` | 1440 | proposed | `frame-rooms-t1` | Rooms by job: "is this room measured and drawn yet?" |
| `frame-rooms-t2` | 1440 | today | `a3-room-file-fold-1440.jpg` | A room file today |
| `frame-rooms-p2` | 1440 | proposed | `frame-rooms-t2` | Pell Court's dining room file: "this wall's dimensions, while the maker is on the phone" |
| `frame-rooms-t3` | 390 | today | `a3-rooms-fold-390.jpg` | Rooms at 390: "Measured r…" in the dark dock band |
| `frame-rooms-p3` | 390 | proposed | `frame-rooms-t3` | p1 at 390 |
| `frame-people-t1` | 1440 | today | `a4-people-fold-1440.jpg` | People today. Marks 40 · 18 · 6 · 72 |
| `frame-people-p1` | 1440 | proposed | `frame-people-t1` | The directory: "who just came in", "is this trade's paperwork on file" |
| `frame-people-t2` | 1440 | today | `a4-people-sheet-1440.jpg` | A record opened today, bleeding into the next contact |
| `frame-people-p2` | 1440 | proposed | `frame-people-t2` | Chidi Mensah's record: "how do I reach him, and what are his rules" |
| `frame-people-t3` | 390 | today | `a4-people-fold-390.jpg` | People at 390 |
| `frame-people-p3` | 390 | proposed | `frame-people-t3` | p1 at 390 |
| `frame-library-t1` | 1440 | today | `a5-library-fold-1440.jpg` | The library today. Marks 32 · 13 · 15 · 33 |
| `frame-library-p1` | 1440 | proposed | `frame-library-t1` | Searching "Holloway": "find the piece I used on Holloway" |
| `frame-library-t2` | 1440 | today | `a5-piece-fold-1440.jpg` | A piece today: three edge treatments at the fold |
| `frame-library-p2` | 1440 | proposed | `frame-library-t2` | The Arden lounge chair: "is this piece ready to specify?" |
| `frame-library-t3` | 390 | today | `a5-library-fold-390.jpg` | The library at 390: the search shrunk to "P" |
| `frame-library-p3` | 390 | proposed | `frame-library-t3` | p1 at 390, the search full width |
| `frame-boards-t1` | 1440 | today | `a6-boards-fold-1440.jpg` | Studio design boards today. Marks 12 · 6 · 2 · 2 |
| `frame-boards-p1` | 1440 | proposed | `frame-boards-t1` | The boards index, by job, plate and caption |
| `frame-boards-t2` | 1440 | today | `a6-boards-doc-fold-1440.jpg` | A job's boards tab today |
| `frame-boards-p2` | 1440 | proposed | `frame-boards-t2` | Copperfield Terrace's boards tab: "show the client the direction" |
| `frame-boards-t3` | 1440 | today | `a6-board-fold-1440.jpg` | The board room today: the one walked `box-shadow`. Marks 44 · 31 · 8 · 74 |
| `frame-boards-p3` | 1440 | proposed | `frame-boards-t3` | The board room's chrome in the house system (U-Q17) |
| `frame-boards-t4` | 390 | today | `a6-board-fold-390.jpg` | The board room at 390: the toolbar runs to x = 774 |
| `frame-boards-p4` | 390 | proposed | `frame-boards-t4` | p3 at 390, a narrow layout |
| `frame-papers-t1` | 1440 | today | `a7-drafting-fold-1440.jpg` | Drafting today. Marks 45 · 10 · 12 · 48 |
| `frame-papers-p1` | 1440 | proposed | `frame-papers-t1` | Linden's revised proposal, mid-draft: "draft it, starting anywhere" |
| `frame-papers-p2` | 1440 | proposed | `frame-papers-t1` | The same proposal, ready: "what will the client actually see?" |
| `frame-papers-t2` | 1440 | today | `a7-ceremony-fold-1440.jpg` | A lead's first meeting today. Marks 24 · 5 · 2 · 16 |
| `frame-papers-p3` | 1440 | proposed | `frame-papers-t2` | Ines Calder's first meeting: accept, nurture or pass |
| `frame-papers-t3` | 390 | today | `a7-drafting-fold-390.jpg` | Drafting at 390: the ornament over BACK |
| `frame-papers-p4` | 390 | proposed | `frame-papers-t3` | p1 at 390 |
| `frame-papers-t4` | 390 | today | `a7-compose-fold-390.jpg` | Compose at 390: scrollWidth 421 |
| `frame-papers-p5` | 390 | proposed | `frame-papers-t4` | Compose at 390, the meta wrapping |
| `frame-money-t1` | 1440 | today | `a8-accounts-sheet-1440.jpg` | Accounts today. Marks 64 · 21 · 16 · 40 |
| `frame-money-p1` | 1440 | proposed | `frame-money-t1` | Accounts: "who owes us what" |
| `frame-money-t2` | 1440 | today | `a8-invoice-sheet-1440.jpg` | A folio stacked on Accounts today: three layers |
| `frame-money-p2` | 1440 | proposed | `frame-money-t2` | INV-2026-0723 replacing Accounts in one sheet (U-Q16) |
| `frame-money-p3` | 1440 | proposed | `frame-money-t2` | Record the payment: "record the payment that just landed" (U-Q6) |
| `frame-money-t3` | 1440 | today | `a8-procurement-sheet-1440.jpg` | Purchase orders today. Marks 54 · 29 · 3 · 16 |
| `frame-money-p4` | 1440 | proposed | `frame-money-t3` | Purchase orders: "which makers haven't confirmed our POs?" |
| `frame-money-t4` | 1440 | today | `a8-invoice-print-fold-1440.jpg` | The invoice print today. Marks 28 · 2 · 0 · 4 |
| `frame-money-p5` | 1440 | proposed | `frame-money-t4` | INV-2026-0721 as a print paper |
| `frame-money-d1` | 1440 | dark | `frame-money-p1` | p1 in the dark set |
| `frame-money-t5` | 390 | today | `a8-accounts-sheet-390.jpg` | Accounts at 390: 16 truncations |
| `frame-money-p6` | 390 | proposed | `frame-money-t5` | p1 at 390 |
| `frame-money-t6` | 390 | today | `a8-invoice-sheet-390.jpg` | The folio at 390: the title on its PAID chip, rows bleeding through |
| `frame-money-p7` | 390 | proposed | `frame-money-t6` | p2 at 390 |
| `frame-chrome-t1` | 1440 | today | `a9-cmdk-sheet-1440.jpg` | ⌘K today. Marks 33 · 13 · 9 · 22 |
| `frame-chrome-p1` | 1440 | proposed | `frame-chrome-t1` | ⌘K: "get me to that job" |
| `frame-chrome-t2` | 1440 | today | `a9-dock-sheet-1440.jpg` | The dock and its rounded Ledgers menu today |
| `frame-chrome-p2` | 1440 | proposed | `frame-chrome-t2` | The dock with the Ledgers popover open |
| `frame-chrome-t3` | 1440 | today | `a9-help-fold-1440.jpg` | Help today: FEATURED GUIDES over nothing. Marks 19 · 7 · 7 · 32 |
| `frame-chrome-p3` | 1440 | proposed | `frame-chrome-t3` | Help: "how does this work?" |
| `frame-chrome-t4` | 1440 | today | `a9-preferences-fold-1440.jpg` | Preferences today: white rounded cards, native blue checkboxes |
| `frame-chrome-p4` | 1440 | proposed | `frame-chrome-t4` | Preferences: "stop that email reaching me" |
| `frame-chrome-t5` | 1440 | today | `a2-plans-fold-1440.jpg` | An empty state today: a dashed box |
| `frame-chrome-p5` | 1440 | proposed | `frame-chrome-t5` | The one empty state, on Holloway Den's plans |
| `frame-chrome-t6` | 390 | today | `a3-rooms-fold-390.jpg` | The 390 dock today: a dark band, "Measured r…", the TESTER pill on it |
| `frame-chrome-p6` | 390 | proposed | `frame-chrome-t6` | The 390 dock: labels wrap, TESTER clear |
| `frame-chrome-t7` | 390 | today | `a9-cmdk-sheet-390.jpg` | ⌘K at 390: six ellipses |
| `frame-chrome-p7` | 390 | proposed | `frame-chrome-t7` | p1 at 390 |

### 2.2 What each proposed frame shows

Use the fixture (§3) exactly: its names, amounts, times and copy. Components are `uplift.md` (b)'s seven, by their `shared.css` class: Section `.section`, Card `.card`, Ledger row `.lrow`, Sheet `.sheet` / `.popover` / `.modal`, Empty state `.empty-t`, Header line `.hline` + `.rule-strong`, Stage edge (`.card.st-*`, `.tick.st-*`, `.title-rule.st-*`). Plus plate and caption (`.plate` + `.cap`), the ink state word (`.word`), the note edge (`.note-edge`), facts (`.facts`), money rows (`.money-rows`), fields (`.field`, `.check`), the dock (`.dock`). **A builder adds no component.** A local rule may lay components out; it may not restyle them.

Every proposed canvas has **at most one filled act** (`.act--terminal`), and only where this section names one. Every stage colour is on a unit that stands for a job. Every state is an ink word.

#### desk (US-26 Direction A, as built by `uplift.md` (d))

Draw US-26 `proposed-a-{1440,390}.html` frames a1, a2, a3, a5, a8 and a7/a13 again **in the shared components**, and redraw a4, a6 and a12 by the corrected rule.
- **p1 (8:40, the studio's scope).** US-26 SPEC §2.2 x1, A, word for word: the one-row header (the greeting "Good morning, Leah", ＋ Record an inquiry and ＋ Create a project file as secondary acts, Find anything ⌘K as tertiary), the double rule, the Today eyebrow "MONDAY 12 OCTOBER · TODAY" with "Mine · The studio's" on its baseline, four job cards (Holloway ×2 lines, Linden, Marsh Street "JORDAN'S" with the hand-off line then the PO line, Pell Court), Today's closing rule, then the ledger by person: **Leah's** (Also yours: Ines Calder, Thornfield; With others: Halloran, Copperfield, Aldous Lane; Coming back: Chen, Garnet Hill; No current alert · Show) and **Jordan's** (Wren Row Bath). No filled act.
- **p2 (8:41, Mine).** The Send reminder sheet (`.sheet`, L4) over the veil, scoped to INV-2026-0721: facts $3,800 · due Monday 28 September · 14 days overdue; the draft; "Send to Nora and Sam Holloway" as the sheet's one filled act; "Put back · Esc" in its head. Under the veil, Holloway's card is lifted (`.card.is-lifted`, L3). Leah's Mine five: Holloway invoice, Linden, Holloway PO, Pell Court, Ines Calder.
- **p3 (8:48, Mine).** Holloway's two lines settled in place in `--text-faint` with no feet: "Reminder sent · waiting on Nora and Sam Holloway since 8:42" and "Chase sent · waiting on Fenmoor Joinery since 8:47". Linden, Pell Court and Ines Calder keep their acts. No slot refills. No ✓, count or "cleared".
- **p4 (11:21, Mine), x4 corrected.** Today holds the morning's four cards and five settled lines: Holloway (8:42, 8:47), Linden "Follow-up sent · waiting on Tom and Ellery Vance since 9:05", Pell Court "Orders released · waiting on Calloway & Brandt Upholstery and Ninebark Lighting since 9:12", Ines Calder "Replied · waiting on Ines Calder since 9:20". Today's head: "Today's lines are handled. What can wait is below." Under Today's close: the muted visit line "Ainsley Moore recorded · just now · Open the brief", then **Also yours** with Ainsley Moore ("Called about a primary bedroom, budget $25–35k · just now", act Reply) and Thornfield ("The Ashbys signed on Friday", act Open the project). **Thornfield and Ainsley are rows, not cards.**
- **p5 (8:55, Jordan, Mine).** Two cards. Marsh Street Kitchen (project rule): "Leah handed you Marsh Street Kitchen on Saturday 10 October · Read her note", then "Ninebark Lighting has not answered PO-MS-0388 ($2,180) in 4 days. Leah's note asks to see anything in writing first." with **Draft the chase for Leah**. Wren Row Bath (proposal rule): "Priya and Dev Anand signed the design services agreement ($6,500) on Saturday" with Open the project. Below Today: "The rest of the studio's jobs are Leah's." No studio money.
- **p6 (5:50 pm, Leah, Mine), x6 corrected.** Today's head "Nothing more needs you today." over the same four cards and five settled lines as p4. **Also yours**: two muted rows settled in place, Ainsley Moore "Replied · waiting on Ainsley Moore since 2:40 pm" and Thornfield "Not today · 4:15 pm · back Tuesday 13 October", each with **Undo** only where the state allows it (Thornfield). **With others**: Halloran (samples, since Tuesday 6 October), Copperfield (palettes, since Friday 9 October), Aldous Lane (Calloway & Brandt delivering Thursday 15 October). **Coming back**: Chen (Friday 16 October, "waiting on the Chens' bench decision"), Garnet Hill (Monday 19 October, "the Okafors are travelling; call after the 18th"). Never more than five lines in Today. No count, no "moved today", no "cleared".
- **d1, d2.** p1 / p7 with the frame element carrying `theme-dark`. The caption says "Documented, not shipped: the portal paints no dark paper set (U-Q9)."
- **p7 (390).** The two-row header ("Good morning, *Leah*" with ⌕ Find; then ＋ Inquiry and ＋ Project with full accessible names), then the Holloway and Linden cards 1-up; the rest below the fold. The dock at the canvas foot with "Studio overview" wrapping, the TESTER pill clear of it.
- **p8 (390).** p6 on the phone.

#### document
- **p1 (Holloway Den, Leah).** Rail at left (`.rail`, L0′), the laid document (`.paper`, L1), the margin at right on ground. The letterhead "Holloway Den" `.t-d1` with a **3 px project title rule** (`.title-rule.st-project`, U-Q14) and the stage word PROJECT in ink. The NEXT band: "Invoice INV-2026-0721 is **$3,800 overdue**, due Monday 28 September." with **Send reminder** as a **scored secondary** (not filled; the fill lives in its sheet). Then the regions as Sections, each closing on `--rule-mid`: Client approvals, Schedule, Pieces (ledger rows), Financials (`.money-rows`), The record. The margin note, unclamped, in a `.card` off the paper. The rail's status words in ink, no pigment dots. No filled act.
- **p2 (Marsh Street, Jordan).** As p1, Jordan's seat. The hand-off block under the letterhead with `.note-edge`: "Leah handed you Marsh Street Kitchen on Saturday 10 October." then her note (§3.2). NEXT: "Ninebark Lighting has not answered PO-MS-0388 ($2,180) in 4 days." with **Draft the chase for Leah**. Financials shows this job's figures only (V18 Q10). No filled act.
- **p3 (spec book).** The header line (back to Holloway Den, title "Holloway Den · specification book", acts: secondary "Run issue checks", tertiary "Print"). Tabs as underline words (`.filters`): Specification · Audience · Editions · Issue readiness · Revision history. Then Sections by trade (Joinery, Lighting, Textiles), each a run of ledger rows (`.lrow.plain`) on one stock. No pills, no mixed white and cream. No filled act.
- **d1.** p1 in the dark set.
- **p4 (390).** p1 at 390: the rail folds to a one-line back act, the letterhead wraps, **the NEXT band wraps onto a second line**, Send reminder on its own 44 px row. The dock label "Project file sections" wraps.
- **p5 (390).** p3 at 390: the tab words wrap onto two lines; no horizontal scroll.

#### rooms
- **p1.** The header line "Measured rooms" (acts: secondary ＋ Scan a room, tertiary Find). Sections by job, client in the eyebrow with a 2 px stage tick beside it (`.tick.st-*`): Pell Court Dining, Holloway Den, Marsh Street Kitchen, Linden Place. Each Section holds up to three room **Cards** with a plate slot (the drawn plan, or for an undrawn room the A10 silhouette and the ink word AWAITING DRAWING, never a dashed box), the room name, type and scan date, dimensions, and "Quality good" as an ink word. Rooms past three in a job are ledger rows under the cards. Each Section closes. No filled act.
- **p2 (Pell Court, dining room file).** The same header line as p1 with back "← Measured rooms". The plan viewer as a Section; the wall facts as ledger rows (`.lrow.plain`); notes as text. No filled act.
- **p3 (390).** p1 at 390: cards 1-up; the dock wraps.

#### people
- **p1.** The header line "Studio contacts" (secondary ＋ Add contact, tertiary Find), **opaque**. The search `.field`. Filters as underline words: Everyone · Clients · Trades · Makers · Studio. **Inbound** first as a Section of one row (Ines Calder, 6:35 am), closed. Then the directory as a Section of ledger rows: an ink-initial avatar, name, role, one state word per paperwork column (ON PAPER · NOT ASKED · NOT ON FILE, unboxed, ink), phone. No filled act.
- **p2.** Chidi Mensah's record as a page view, laid as a `.paper` (L1) on the ground with "← Studio contacts": his rules ("Email first. Call for anything over $2,500."), How to reach him (facts), Paperwork (rows), On these jobs (rows with stage ticks: Holloway Den, Project). Each a Section. No filled act.
- **p3 (390).** p1 at 390: rows stack name / role / state words / phone.

#### library
- **p1.** The header line "Resource library" (primary act, scored: ＋ Capture). The search `.field` holding "Holloway". Shelf and type filters as one underline-word row. Results as **plate and caption** (no box): the pieces used on Holloway Den. Each caption: name, maker, and "Used on Holloway Den" with the job's tick. The shelf closes. No filled act.
- **p2 (the Arden lounge chair).** Back "← Resource library". Name `.t-d2`, maker, the plate. Facts (`.facts`): dimensions, COM, lead time, trade price. Tags as ink words (STUDIO LIBRARY · PUBLISHED). "Used on" as rows with stage ticks. "Add to a project" as a **secondary** act. No filled act.
- **p3 (390).** p1 at 390: the search `.field` full width; plates 2-up.

#### boards
- **p1.** The header line "Studio design boards" (secondary ＋ New board). Sections by job, client in the eyebrow with its tick. Boards as plate and caption. Status filters as underline words. No filled act.
- **p2 (Copperfield Terrace's boards tab).** Inside the Document's tab frame: the job's two open boards as **Cards** with a plate slot ("Palette A, warm limewash", "Palette B, slate and walnut"), each with "Sent to the Whitfields Friday 9 October" and act Present. Secondary ＋ New board. No filled act.
- **p3 (the board room, "Palette A, warm limewash").** The house header line (back "← Copperfield Terrace", title in Playfair, acts: secondary Present, secondary Save and close, tertiary Share). The tools as a Section in the side panel. Section tags as words. **The canvas is drawn as content**: swatches, three piece plates, and dashed drop zones inside the canvas only, each with its word. No shadow anywhere. No filled act.
- **p4 (390).** p3 narrow: the header wraps to two rows; tools fold behind a "Tools" act; the canvas fits 358 px.

#### papers
- **p1 (Linden Place, revised proposal, mid-draft).** Back "← Linden Place", title "A second sofa option for Tom and Ellery" `.t-d2` with a 3 px proposal title rule. "Drafted: scope, concept · To draft: pieces, fees" as words, no percentage. Facets as **Cards** (`.card`, no stage rule): Scope of work, Design concept, Pieces, Fees and terms; the open facet (Pieces) shows the 2 px clay focus ring. The client's copy as a `.paper` beside the facets. Sections close. "＋ Add a room" as a secondary act. No filled act (the draft cannot send yet).
- **p2 (ready).** As p1, all four facets drafted. The one filled act: **"Send to Tom and Ellery Vance"**.
- **p3 (Ines Calder's first meeting).** The header line names her: "Ines Calder" with a 3 px brief title rule. Her words as a quote with `.note-edge`. Budget and timeline as `.facts`, not tiles. The acts: **Accept and begin** (scored secondary), Nurture, Pass (tertiary). No filled act.
- **p4 (390).** p1 at 390: the ornament above the title, clear of the back act.
- **p5 (390, compose).** A new proposal for the Lindqvists, Brierley Mews: the doc-type meta "PROPOSAL · DRAFT · BRIERLEY MEWS" wraps; facets 1-up.

#### money
- **p1 (Accounts).** A `.sheet.wide` over the veiled Desk. Head "STUDIO ACCOUNTS · LEDGER" with "Put back · Esc". Front matter as text: "$13,700 is out with clients; **$3,800 of it is overdue**." Acts: secondary ＋ Draw an invoice, tertiary Export. Then the register as a Section of ledger rows: number, job, sentence, state word, amount. No chips, no blue. Closes on `--rule-mid`. No filled act.
- **p2 (INV-2026-0723 in place).** The same sheet frame: head "← Accounts · INV-2026-0723". Facts, Lines, Payments as Sections of rows. Acts: tertiary Regenerate link, tertiary Print / save PDF. **One sheet, no second dialog.** No filled act.
- **p3 (Record the payment).** A `.sheet` scoped to INV-2026-0726 (Chen Residence): amount, date received, method fields; the one filled act **"Record $3,400"**; "Put back" beside it.
- **p4 (Purchase orders).** A `.sheet.wide`. One Section head with two labelled filter lines (Project · Payment) as underline words. The register as ledger rows with state words in ink (SENT · NO ANSWER · RELEASED · ON HOLD · DELIVERING), no stamps, no yellow. No filled act.
- **p5 (print).** The print paper (`.paper`, no dock): Hartwell Studio's letterhead, INV-2026-0721, two lines, total. "Print / save PDF" as a **secondary** act. No filled act.
- **d1.** p1 in the dark set.
- **p6 (390).** p1 full width from the safe top; the head wraps; rows stack; no ellipsis.
- **p7 (390).** p2 at 390: the title wraps above the state word PAID; nothing shows through below the sheet.

#### chrome
- **p1 (⌘K, typed "holl").** A `.sheet` with the `.field` at its head. Sections: Jobs (Holloway Den with its project tick, Halloran Library with its direction tick), People (Nora Holloway, Sam Holloway), Acts (Record an inquiry). Every row wraps; nothing ellipsised.
- **p2 (the dock, Ledgers open).** The dock (`.dock`, L1 bar on a hairline-strong rule) across the canvas foot: Desk · Resource library · Studio contacts · Measured rooms · Ledgers ↑ · Find anything ⌘K · Keys ? · No active timer · Studio inbox · LH. The Ledgers `.popover` (L4′) open above it: Accounts · Purchase orders · Hours · FF&E. Square corners, paper-doc face over the cream it covers.
- **p3 (help).** The header line "Help" (back "← Desk"). Search `.field`. Sections: Featured guides (one row, "Handing a job to a hire"), The Desk, The Document, Money and ledgers, Rooms and scans, each a run of plain ledger rows. No topic cards.
- **p4 (preferences).** The header line "Preferences" (back "← Desk"). Sections Email, Designer activity, Project milestones, each a run of rows with a house `.check` control. No white cards, no browser-blue.
- **p5 (empty state).** Holloway Den's Plans: the Section eyebrow PLANS, the sentence "No plans yet. Bring in a drawing set to begin." with **Bring in a drawing set** as its inline secondary act, then the Section's closing rule. Beside it, as a second Section on the same canvas, the one sanctioned exception: Today emptied on a morning with nothing open, keeping one `.card-empty` frame with "Nothing needs you today."
- **p6 (390, the dock).** The dock at 390 on `--paper-doc` (not the dark ink band): "Measured rooms" wraps in full; ··· More holds Keys and Ledgers; the TESTER pill sits above the dock, clear of the label.
- **p7 (390).** p1 at 390.

### 2.3 Every frame

- **Element.** One `<section class="frame" data-frame="<id>">` per frame, in the order of §1. A dark frame's element is `<section class="frame theme-dark" data-frame="<id>">`.
- **Caption** (`.frame-cap`), first in the frame: the id, the moment, what it shows, the U-Q it depends on ("Depends on U-Q1 (card edge)"), and "est." on any estimate.
- **Today frame.** A `<figure class="today">` holding `<img src="../walk/<file>" alt="…">` (the file named in §2.1) and a `<figcaption>` with WALK's marks for it. The alt text names what today's screen shows.
- **Proposed or dark frame.** A `.canvas` at the file's width (1440 × at least 900, or 390 × at least 844), then a `.pins-key` list. Under the canvas, the line `Marks at rest: today <WALK figure> · proposed <span data-marks="proposed">measured at render</span>`. Specimen builders do not count; the render seat fills `data-marks`.
- **Pins.** Up to four `.pin` per canvas, numbered, never over the text they explain, each keyed in `.pins-key` with a source id ("WALK §8", "D2 area 8", "U-Q16", "F8").
- **Fixture notice.** `.fixture-note` in each frame's foot: "Illustrative fixture · Hartwell Studio is invented".

## 3. Fixture: Hartwell Studio, extended per area [illustrative]

The base is US-26 `specimens/SPEC.md` §3 (`artifacts/desk-redesign-2026-10-12/specimens/SPEC.md:183-259`), **unchanged**: the studio, Leah Hartwell (owner), Jordan Reyes (hire, week two), Monday 12 October 2026, the 18 jobs, the 8:40 rank and the day's timeline. Every name, firm and figure below is invented. No real client, maker, firm or person appears, and none may be added. Walk artefact names (Elena Marlowe, "Full Room", "Local Dev Studio", the Emtek knob, Whole Home Renovation) are **not** in this fixture.

### 3.1 Desk
US-26 §3, plus the two corrections in `uplift.md` (d): at 11:21 and at 5:50 pm Today keeps the morning's four cards and five settled lines; Ainsley Moore and Thornfield are Also yours rows.

### 3.2 Document
| Item | Holloway Den (Leah) | Marsh Street Kitchen (Jordan) |
|---|---|---|
| Client | Nora and Sam Holloway | Owen and Cait Brannigan |
| Stage | Project | Project |
| NEXT | Invoice INV-2026-0721 is $3,800 overdue, due Monday 28 September · Send reminder | Ninebark Lighting has not answered PO-MS-0388 ($2,180) in 4 days · Draft the chase for Leah |
| Client approvals | Built-in bench drawing, approved Thursday 1 October; bookcase finish, waiting since Friday 9 October | Pendant finish, approved Tuesday 6 October |
| Schedule | Fenmoor Joinery, bench and bookcase, install week of 9 November | Ninebark Lighting, two pendants and a wall light, ship week of 26 October once PO-MS-0388 is answered |
| Pieces | Built-in bench, Fenmoor Joinery, $6,200 · Bookcase wall, Fenmoor Joinery, $5,250 · Arden lounge chair, Calloway & Brandt Upholstery, $4,180 · Wool flatweave rug 8 × 10, Marrow & Weft, $2,400 · Halo floor lamp, Ninebark Lighting, $690 · Turned side table, Fenmoor Joinery, $940 | Halo pendant ×2, Ninebark Lighting, $1,450 · Halo wall light, Ninebark Lighting, $730 (together PO-MS-0388, $2,180) · Counter stools ×3, Calloway & Brandt Upholstery, $2,550 |
| Financials | Agreement $38,500 · invoiced $14,200 · paid $10,400 · overdue $3,800 | This job only: PO-MS-0388 $2,180 |
| The record | Reminder drafted, not sent · Sam asked about rift oak, Friday 9 October | Leah handed the job to Jordan, Saturday 10 October |
| Margin note | "Sam prefers the bench in rift oak; Nora wants the lighter stain. Both will see the sample on Thursday." | — |
| Hand-off note | — | "Marsh Street is yours. The Brannigans like a call before anything is ordered; ask me before anything goes out in writing." |

**Spec book (Holloway Den, edition 2).** Joinery: built-in bench (rift oak, matte oil), bookcase wall (rift oak, matte oil), turned side table (finish missing). Lighting: Halo floor lamp (aged brass). Textiles: Arden lounge chair (COM, Marrow & Weft "Fallow" bouclé, 6 yd), wool flatweave rug (natural). Issue readiness: "One item has no finish: the turned side table."

### 3.3 Rooms
| Job | Room | Scanned | Size | Drawn | Quality |
|---|---|---|---|---|---|
| Pell Court Dining | Dining room | Tue 29 Sep | 12′ 10″ × 15′ 1″ | yes | good |
| Pell Court Dining | Kitchen pass-through | Tue 29 Sep | 6′ 4″ × 9′ 8″ | awaiting drawing | good |
| Holloway Den | Den | Thu 24 Sep | 13′ 9″ × 16′ 9″ | yes | excellent |
| Marsh Street Kitchen | Kitchen | Wed 7 Oct | 11′ 2″ × 14′ 6″ | awaiting drawing | good |
| Marsh Street Kitchen | Scullery | Thu 8 Oct | 6′ 0″ × 8′ 3″ | awaiting drawing | good |
| Linden Place Living Room | Living room | Mon 14 Sep | 18′ 4″ × 20′ 8″ | yes | good |

**Pell Court dining room file, the walls:** North wall 12′ 10″, window 47″ × 57″, sill at 30″ · East wall 15′ 1″, opening to the kitchen 36″ × 84″ · South wall 12′ 10″, built-in sideboard niche 72″ × 18″ deep · West wall 15′ 1″, two sconces at 66″. Ceiling 9′ 2″. Note: "Banquette runs the full east wall; keep the opening clear."

### 3.4 People
| Person | Role | Firm | Paperwork | Phone | Note |
|---|---|---|---|---|---|
| Ines Calder | Client (inquiry, 6:35 am) | — | — | (415) 555-0141 | inbound |
| Nora Holloway | Client | — | ON PAPER | (415) 555-0118 | |
| Rosalind Fairweather | Client | — | ON PAPER | (415) 555-0162 | |
| Mae Halloran | Client | — | ON PAPER | (415) 555-0137 | |
| Chidi Mensah | Maker | Fenmoor Joinery | W-9 ON PAPER · COI ON PAPER | (510) 555-0174 | "Email first. Call for anything over $2,500." |
| Della Brandt | Maker | Calloway & Brandt Upholstery | W-9 ON PAPER · COI NOT ASKED | (510) 555-0129 | |
| Rafe Lindell | Maker | Ninebark Lighting | W-9 NOT ASKED | (707) 555-0156 | |
| Marco Hollis | Trade | Hollis Electric | W-9 ON PAPER · COI ON PAPER, to 31 March 2027 | (415) 555-0190 | |
| Pia Sorensen | Trade | Juniper Stone & Tile | COI **NOT ON FILE** | (415) 555-0103 | blocked: may not start on site until a COI is on file (terracotta-ink word) |

Chidi Mensah's record, On these jobs: Holloway Den (Project; PO-HD-0412, $11,450, no answer in 12 days), Chen Residence (Install; delivered Friday 2 October).

### 3.5 Library
| Piece | Maker | Trade price | Used on |
|---|---|---|---|
| Arden lounge chair | Calloway & Brandt Upholstery | $4,180 | Holloway Den (Project), Pell Court Dining (Project) |
| Built-in bench, rift oak | Fenmoor Joinery | $6,200 | Holloway Den |
| Halo floor lamp | Ninebark Lighting | $690 | Holloway Den |
| Wool flatweave rug, 8 × 10 | Marrow & Weft | $2,400 | Holloway Den, Linden Place (Proposal) |
| Tamsin sofa, 78″ | Calloway & Brandt Upholstery | $5,650 | Linden Place (Proposal) |
| Halo pendant | Ninebark Lighting | $725 | Marsh Street Kitchen, Pell Court Dining |

**The Arden lounge chair:** 31″ W × 34″ D × 30″ H, seat 17″; COM 6 yards; lead time 10–12 weeks; trade price $4,180. Story: "Deep seat, tight back; Leah's pick for a reading corner." Tags: STUDIO LIBRARY · PUBLISHED.

### 3.6 Boards
| Job (stage) | Board | State |
|---|---|---|
| Copperfield Terrace (Direction) | Palette A, warm limewash | Sent to the Whitfields Friday 9 October |
| Copperfield Terrace (Direction) | Palette B, slate and walnut | Sent to the Whitfields Friday 9 October |
| Halloran Library (Direction) | Fabric samples | Sent to Mae Halloran Tuesday 6 October |
| Linden Place Living Room (Proposal) | A second sofa option | Draft |

**Palette A, warm limewash:** Palette (limewash "Chalk", oiled walnut, aged brass, oatmeal linen), Materials (two swatches), Pieces (Arden lounge chair, Tamsin sofa, Halo floor lamp).

### 3.7 Making papers
**Linden Place revised proposal**, for Tom and Ellery Vance, after "The sofa is over budget; can we see a second option under $6,000?": Scope of work (living room, one seating group); Design concept ("Keep the rug and the chairs; a lower, lighter sofa"); Pieces (Tamsin sofa 78″ $5,650, Arden lounge chair ×2 $8,360, wool flatweave rug 8 × 10 $2,400; pieces total $16,410); Fees and terms (design fee $4,500; 50% deposit on pieces). Client's copy shows the pieces and the total, never the trade price.

**Compose (390):** a new proposal for the Lindqvists, Brierley Mews family room; nothing drafted yet.

**Ines Calder's first meeting:** web inquiry 6:35 am Monday; living room; budget $40–60k; timeline "before the holidays"; her words: "We just moved in and the living room is empty except for a piano."

### 3.8 Money (Leah's seat)
| Invoice | Job | For | Amount | State |
|---|---|---|---|---|
| INV-2026-0721 | Holloway Den | Design fee, phase 2 $2,600 · procurement handling, September $1,200 | $3,800 | SENT · **14 days overdue** (terracotta-ink clause) |
| INV-2026-0723 | Pell Court Dining | Deposit: Calloway & Brandt banquette and eight chairs $7,225 · Ninebark Lighting two pendants $1,975 | $9,200 | PAID Monday 6:10 am, card |
| INV-2026-0724 | Thornfield | Design retainer | $4,820 | DRAFT |
| INV-2026-0725 | Wren Row Bath | Design services agreement | $6,500 | SENT Saturday 10 October, due Saturday 24 October |
| INV-2026-0726 | Chen Residence | Install balance | $3,400 | SENT Wednesday 7 October, due Wednesday 21 October; a $3,400 bank transfer landed today |
| INV-2026-0718 | Copperfield Terrace | Direction fee | $2,600 | PAID Friday 2 October |

Out with clients: $3,800 + $6,500 + $3,400 = **$13,700**, of which **$3,800** is overdue.

| PO | Maker | Job | Amount | State |
|---|---|---|---|---|
| PO-HD-0412 | Fenmoor Joinery | Holloway Den | $11,450 | SENT Wed 30 Sep · NO ANSWER, 12 days |
| PO-MS-0388 | Ninebark Lighting | Marsh Street Kitchen (Jordan's) | $2,180 | SENT Thu 8 Oct · NO ANSWER, 4 days |
| PO-PC-0431 | Calloway & Brandt Upholstery | Pell Court Dining | $14,600 | RELEASED Mon 9:12 |
| PO-PC-0432 | Ninebark Lighting | Pell Court Dining | $3,950 | RELEASED Mon 9:12 |
| PO-AL-0377 | Calloway & Brandt Upholstery | Aldous Lane | $8,900 | DELIVERING Thu 15 Oct |
| PO-CR-0362 | Calloway & Brandt Upholstery | Chen Residence | $6,800 | balance $3,400 ON HOLD until Fri 16 Oct |

Print letterhead: Hartwell Studio · 214 Larch Street, Suite 3 · hello@hartwell.example.

### 3.9 Chrome
⌘K typed "holl": Jobs (Holloway Den · Project, Halloran Library · Direction), People (Nora Holloway, Sam Holloway), Acts (Record an inquiry). Help Sections: Featured guides ("Handing a job to a hire"), The Desk ("Today's five lines", "Not today and Coming back"), The Document ("The NEXT line", "Recording a change"), Money and ledgers ("Drawing an invoice", "Recording a payment"), Rooms and scans ("Scanning a room with Patina Field"). Preferences: Email (A client signs · A payment lands · A maker answers a PO), Designer activity (A teammate hands you a job · A teammate drafts for you), Project milestones (A piece ships · A piece is delivered).

## 4. Today frames: screenshots by reference

Today frames **reference the walk screenshots**; they do not rebuild today in HTML and do not inline it. Each is `<img src="../walk/<file>.jpg">`, the file named in §2.1. Reasons:
- the screenshots are the evidence (SQ-800), and a rebuild would be a second, unverified drawing of today;
- each is 60–95 KB, so inlining every one in every specimen would break §5's 20 KB data-URI cap and duplicate payloads across 18 files;
- the deck builder (`tools/build.us26.mjs`, adapted) inlines each walk file **once**, as a `data:` URI, and renames the specimen's own `../walk/` references so nothing is fetched once published.

`check.mjs` checks that each file exists in `../walk/` and that the specimen references it.

## 5. Shared CSS and build rules

1. **The shared block.** Every specimen carries **exactly one** `<style data-shared="uplift">` element whose text is `specimens/shared.css`, **verbatim**: copy the file's bytes between the tags (a single leading and trailing newline is allowed). A specimen's own layout goes in a **second** `<style>` after it. A local rule may place components, set a canvas's own grid, or draw content (a plan, a swatch). It may not restyle a shared class: no local rule names `.card`, `.section`, `.lrow`, `.sheet`, `.popover`, `.modal`, `.hline`, `.word`, `.act` or `.dock` with a colour, border, background or radius. If a component cannot do the job, the builder reports it; nobody forks it.
2. **Self-contained HTML.** Inline CSS and JS. Nothing is fetched except Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) for Playfair Display, Inter and DM Mono: the `<link>` from `../review/d1-sketches/components.html:7-9`, verbatim. No CDN scripts, no remote images. Inline SVG is fine. Any `data:image` base64 payload is at most 20 KB.
3. **Frames** as §2.3, every id from §1 present.
4. **The hash shows one frame.** `#<id>` shows only that frame, with no specimen chrome. `&nobar` also hides the frame's caption, `&nopins` hides the pins and their key. Tokens come in any order. With no hash, every frame shows in order under a sticky `.frame-bar` of `data-go="<id>"` buttons. Listen to `hashchange`. Hidden things take `.is-hidden`.
5. **No horizontal overflow at 390.** In the 390 files, `document.documentElement.scrollWidth` must not exceed 390 in any single-frame view. A 16 px gutter. Long sentences wrap; no `white-space: nowrap` on prose.
6. **Never.** No `box-shadow` or `drop-shadow` in any form. No `text-overflow: ellipsis`, no `line-clamp` (or `-webkit-line-clamp`), no `truncate` class. No standalone "AI". No badges, unread dots, counts, streaks, progress bars, "cleared today" or red/green status. No pills, no state chips, no coloured state edges.
7. **Accessibility.** Body text at least 4.5:1, 18 px text and tags 3:1; no meaning by colour alone; real `<button>` and `<a>` with the shared focus ring; 44 px targets at 390; every today image has alt text; nothing smaller than 12 px.
8. **Honesty.** The fixture is labelled; estimates say "est."; dark frames say "Documented, not shipped"; no words attributed to Leah, Jordan or any real person beyond the fixture's invented lines.
9. **Sending.** Nothing sends on its own. Every send is a named control ("Send to Nora and Sam Holloway").
10. **Sentinel.** The last non-empty line of every file is exactly `<!-- SPECIMEN COMPLETE -->`, written last.

## 6. Gate

```
node artifacts/portal-uplift-2026-10-12/specimens/check.mjs                 # all 18 files
node artifacts/portal-uplift-2026-10-12/specimens/check.mjs desk chrome     # only these areas
node artifacts/portal-uplift-2026-10-12/specimens/check.mjs --spec-only     # this file and shared.css only
node artifacts/portal-uplift-2026-10-12/specimens/check.mjs --self-test     # the gate's own detectors
```

`check.mjs` reads §1 and §2.1, and `shared.css`.

**`--spec-only`** opens no specimen. It checks:
- exactly nine area rows, one per slug, in the order desk, document, rooms, people, library, boards, papers, money, chrome;
- every listed id has the form `frame-<slug>-<t|p|d><n>`, belongs to its row's slug, and appears once;
- every listed id has one §2.1 row at the same width, and every §2.1 row is listed in §1;
- every today row names a file that exists in `../walk/`; every proposed row pairs with a today id of its area; every dark row pairs with a proposed id of its area;
- desk, document and money each have at least one dark frame;
- `shared.css` exists and itself has no shadow, ellipsis, line-clamp or `truncate`.

**Without the flag**, it also checks each `<slug>-{1440,390}.html` (all, or the slugs named):
- the file exists (a missing file prints `MISSING <file>`);
- its last non-empty line is the sentinel;
- **every frame id from §1 for that width** is present as `data-frame="<id>"`, and each dark frame's element carries `theme-dark`;
- every today image for its frames is referenced as `../walk/<file>`;
- **no external fetch** outside the two Google Fonts hosts (`src`, `href`, `srcset`, `poster`, `action`, CSS `url()`, `@import`, `fetch()`);
- **no `box-shadow`** and no `drop-shadow(`;
- **no `text-overflow: ellipsis`, no `line-clamp`, no `truncate`** class or selector;
- no standalone "AI" and no "A.I.";
- **the shared block** is present exactly once and identical to `shared.css`;
- **no horizontal overflow at 390** (390 files only, US-26's static method): no CSS `width`, `min-width` or `flex-basis` over 390 px; no `grid-template-columns` whose fixed px tracks and gaps sum over 390 px; no `width="…"` attribute over 390; no `white-space: nowrap` on a `p`, `li`, `h1`–`h6` or `blockquote` rule. Rules inside an `@media` or `@container` whose `min-width` is over 390 px are skipped, because they cannot apply at 390;
- no `data:image` payload over 20 KB.

It exits 0 when everything passes and 1 otherwise, naming each failing file and each problem. A bad argument exits 2. Until the specimens exist, a full run exits 1 and prints `MISSING` for each of the 18 files. That is expected; `--spec-only` and `--self-test` pass.

**`--self-test`** builds an in-memory specimen from this spec and `shared.css` for every slug and width, checks that it passes, then injects each violation above one at a time and checks that the gate names it.

**Render check** (after the gate passes, by the render seat): render each file with `artifacts/people-room-crm-2026-09-11/tools/render.mjs` at `--widths` 1440 or 390, one hash per frame with `&nobar`. Confirm no horizontal scroll at 390 (the static check is a floor, not proof), no console errors, no computed `box-shadow`, and fill each `data-marks` with US-26's counter (`marks()`, SQ-786 `capture.js`). Keep render output in the board verification folder, never in the repo.
