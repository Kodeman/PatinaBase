# US-27 W1b · The walk: every designer-portal area today, at 1440 and 390 (SQ-800)

This is the "before" evidence for the US-27 uplift. It covers each area in BRIEF §3, in order, as it renders today. No product code changed.

## 0. Method

- **Code.** Worktree at `19be3cae2`, which contains `81b40e732`, the BRIEF §3 baseline. The designer portal ran under `next dev` on **:3005**, with the 13 BRIEF §7 flags on and PostHog off.
- **Data.** Local Supabase only (127.0.0.1). The US-24 seed `artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk_v2.sql` was applied once with psql, and there was no `db reset`. The test inquiry "Ainsley Moore" was left as it is.
- **Seats.** Leah Hartwell, the principal, for every capture. Jordan, the hire, only for `a2-document-jordan-*`.
- **Captures.** Playwright Chromium, JPEG quality 70.
  - Viewports: 1440×900 and 390×844 (deviceScaleFactor 1).
  - `fold` is the first viewport. `full` is the whole page.
  - `sheet` is an overlay opened from that page, shot at the fold.
  - Hidden before every shot: the Next dev indicator and the TanStack devtools button. Both are dev-only.
  - Not hidden: the **TESTER** pill (bottom-left) is dev/test chrome, but it stays in the shots. In full-page captures the fixed dock is painted once per viewport band, so it repeats mid-page. That is a capture artefact, not a layout bug.
- **Marks at rest.** These use US-26's counter verbatim (`marks()`, copied from SQ-786 `capture.js`). It counts within the first viewport:
  - **text**: every element that holds its own text;
  - **controls**: every control;
  - **colour**: text or fill with HSL saturation above 0.25;
  - **edges**: every drawn border edge.
  - It is written `text · controls · colour · edges` and is counted inside `<main>`, so the dock and the TESTER pill are excluded.
  - **Routes with no `<main>`** (marked † below) were counted on `<body>` after removing the fixed dock and the TESTER pill, so the rule matches. These are rooms, room, room file, library, piece, judgments, finishes print, invoice print, drafting and compose. `nomain-marks.json` holds both counts for the routes that do have a `<main>`.
  - Sheets are counted inside their `[role=dialog]`.
- **Edges and stocks.** `structure()` records, for the first viewport:
  - every computed background (the stocks);
  - every border style and colour;
  - every element whose right edge passes the viewport (overflow);
  - every element whose text is clipped by ellipsis or line-clamp (truncation);
  - and, at 390, every control smaller than 44 px.
- **Evidence.** Raw JSON is in the board verification folder `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-800/`: `walk-12345.json`, `walk-6789.json`, `walk-extras.json`, `walk-extras2.json` and `nomain-marks.json`. It is not in the repo.
- **Dark mode.** N/A, as in US-26 SQ-786 WALK §0. The portal paints no dark paper set (`apps/designer-portal/src/app/globals.css:56`).
- **Full pages.** A full capture was skipped where the page is exactly one viewport tall, so the full page is the fold: plans, doc boards, judgments, and the room file at 390. One was also skipped where the 1440 full page already shows every section, to keep the folder under 15 MB: pieces, spec book, piece and compose at 390.

| Area | Record used |
|---|---|
| Document | Holloway Den `e7210000-…-0003` (Leah), Marsh Street Kitchen `e7210000-…-0001` (Jordan), Whole Home Renovation `e6590000-…-0001` (pieces, plans, spec book, boards, finishes print) |
| Rooms | room `7e023c47-f03f-4d06-8eda-217bfa3d2d77` |
| Library piece | `e6590000-…-0101`, the Emtek knob |
| Board | `813012bd-fb7c-419e-b0e3-8b5fcd5fd9ff`, made for this walk (see Leftovers) |
| Drafting | proposal `d0c10000-…-00b2`, Elena Marlowe |
| Ceremony | lead `e7210000-…-0051`, Ines Calder |
| Invoice | `INV-2026-0721`, Holloway Den |

## 1. The Desk

- **Route and record.** `/desk`, Leah. Shots: `a1-desk-fold-1440.jpg`, `a1-desk-fold-390.jpg`. These were shot fresh, before the walk's board existed. The full Desk is US-26 SQ-786's evidence and was not re-shot.
- **The eye reads first** the masthead and "Today" heading. Then the run of ledger rows, which all sit on one cream ground.
- **Bleeds and edges.**
  - This is the US-26 finding again. Today's job lines, the inquiry pool and the ledger are separated only by hairlines (`rgba(44,41,38,0.18)`, 49 of them on the page). Nothing has its own edge.
  - The only heavier rules are four 1px ink rules under section heads.
  - There is no stock change between sections: ground cream all the way.
- **Marks at rest, 1440 fold:** **45 · 18 · 9 · 12**. This is identical to US-26's count, so the counter reproduces.
- **At 390:**
  - Marks are 25 · 9 · 4 · 8.
  - **Horizontal scroll (broken):** `scrollWidth` is 399 on a 390 viewport. The header acts "＋ RECORD AN INQUIRY" and "＋ CREATE A PROJECT FILE" run to x = 399.
  - The collapsed dock truncates its section label: "Studio overview" gets an ellipsis.
  - The TESTER pill sits on top of the dock label.

## 2. The Document (a job)

### What was walked

| Page | Route | Shots |
|---|---|---|
| The paper | `/doc/[id]` | `a2-document-{fold,full}-{1440,390}`, `a2-document-sheet-{1440,390}` (RECORD A CHANGE sheet), `a2-document-jordan-fold-{1440,390}`, `a2-document-wholehome-fold-1440` |
| Pieces | `/doc/[id]/pieces` | `a2-pieces-fold-{1440,390}`, `a2-pieces-full-1440` |
| Plans | `/doc/[id]/plans` | `a2-plans-fold-{1440,390}` |
| Spec book | `/doc/[id]/spec-book` | `a2-spec-book-fold-{1440,390}`, `a2-spec-book-full-1440` |
| Boards tab | `/doc/[id]/boards` | `a2-doc-boards-fold-{1440,390}` (empty state, shot before the walk's board existed) |
| Finishes print | `/doc/[id]/pieces/finishes/print` | `a2-finishes-print-fold-1440` |

### The paper

- **The eye reads first** the Playfair job title on the doc stock. Then the "NEXT —" line, and the margin note at right.
- **Stocks.** This is the one area that already layers three stocks:
  - the ground at left (rail, `238,230,219`);
  - the document sheet (`252,250,246`);
  - the margin at right (ground again).
- **Bleeds.** Inside the sheet, every section (brief, record, money, pieces) is a heading plus hairline rows (`229,226,221`). No section has its own edge, and a section closes only when the next one's 1px ink rule starts.
- **Edges.**
  - On Holloway, one dashed tan edge (`196,165,123`) marks the empty-state slot.
  - On Jordan's Marsh Street view, the hand-off block has a **2 px blue-grey left rule** (`139,156,173`). It is the only unit in the document that owns an edge (`a2-document-jordan-fold-1440`).
- **Truncation.** The margin note is line-clamped: "One client, one paper. The rail on the left says where this…".
- **Marks at rest, 1440 fold:**

  | View | Marks |
  |---|---|
  | Holloway | **37 · 17 · 15 · 12** |
  | Marsh Street (Jordan) | 32 · 15 · 10 · 11 |
  | Whole Home | 32 · 14 · 10 · 11 |

  The colour count is the highest in the portal at the fold. It comes from coloured status words and pigment dots in the rail and margin.
- **The RECORD A CHANGE sheet** (`a2-document-sheet-1440`) is a quiet dialog, 9 · 2 · 0 · 1. One rule under its header is its only edge.
- **At 390:**
  - The NEXT line truncates to "OVERDUE 12D · INV-2026-0721" with an ellipsis.
  - On Jordan's view, "NO ACK · MS-0388" is ellipsised.
  - In the sheet, "$0 BUDGET · $0 COMMITTED" is ellipsised.
  - The dock's "PROJECT FILE SECTIONS" label sits under the TESTER pill.
  - Three targets are smaller than 44 px.

### Pieces

- **The eye reads first** the grid of piece rows and their status chips.
- **Edges.** This is the most edge-heavy page in the portal: **84 dashed edges** (`107,101,94`), one on every PLACEHOLDER chip. READY chips are solid ink (`26,24,22`, 51), and the row hairlines are `217,212,204` (47). An elevation drawing card at right is boxed.
- **Colour.** Zero colour marks. Status is carried by dashed against solid, not by colour.
- **Marks at rest, 1440 fold:** **51 · 13 · 0 · 60**.
- **At 390:** 17 · 6 · 0 · 23, and **13 targets are smaller than 44 px**: the chips.

### Plans

- **What it shows.** A one-viewport empty state with a dashed placeholder (`229,226,221`).
- **Marks at rest, 1440 fold:** **11 · 6 · 1 · 4**.
- **At 390:** fine.

### Spec book

- **The eye reads first** the truncated title "Whole Home Renovation — Spe…". It truncates even at 1440.
- **Design language.** This page is a different design language from the paper:
  - rounded pill filters;
  - a legacy rounded "Run issue checks" button;
  - white, cream and doc stocks mixed in one view;
  - 139 hairline boxes (`229,226,221`).
- **Marks at rest, 1440 fold:** **100 · 26 · 10 · 62**, the noisiest fold in the portal.
- **At 390 (broken):**
  - The tab nav overflows: `scrollWidth` is 424. "SPECIFICATION EDITOR · AUDIENCE · EDITIONS · ISSUE READI…", with REVISION HISTORY off-screen.
  - 14 targets are smaller than 44 px.

### Boards tab

- **What it shows.** An empty state: a dashed empty card and a legacy **filled sand "New board"** button. That button is a second filled act style, beside the ink filled act elsewhere.
- **Marks at rest, 1440 fold:** **8 · 3 · 2 · 3**.
- **At 390:** the dock label "Design boards" is ellipsised.

### Finishes print

- **What it shows.** A print sheet with no `<main>`.
- **Marks at rest, 1440 fold:** **2 · 1 · 3 · 1**†.

## 3. Rooms

- **Routes and shots.**

  | Page | Route | Shots |
  |---|---|---|
  | Rooms | `/rooms` | `a3-rooms-{fold,full}-{1440,390}` |
  | Room | `/room/7e023c47…` | `a3-room-{fold,full}-{1440,390}` |
  | Room file | `/room/7e023c47…/file` | `a3-room-file-fold-{1440,390}`, `a3-room-file-full-1440` |

- **The eye reads first** the measured-room cards: client name in Playfair, then a large dashed "AWAITING DRAWING" plate.
- **Edges and stocks.**
  - The cards are **boxed with a 1px edge on a darker card stock** over a lighter ground. This is the closest thing in the portal today to "a unit has its own edge" (`a3-rooms-fold-1440`).
  - The plate inside each card is a second, dashed edge, so each card carries two nested edges.
  - The head band is a separate white stock with a bottom rule and the measured-rooms ornament.
- **The room route** says "The room plan is not available yet." (`a3-room-fold-1440`).
- **The room file** uses a different head band from the room (`a3-room-file-fold-1440`).
- **Marks at rest, 1440 fold** (†, body less the dock):

  | Page | Marks |
  |---|---|
  | Rooms | **26 · 7 · 10 · 35** |
  | Room | 4 · 1 · 6 · 1 |
  | Room file | 7 · 1 · 2 · 0 |

- **Colour.** Small sage and grey dots grade scan quality: "● QUALITY GOOD", "● QUALITY EXCELLENT". This is colour that grades, not orients.
- **At 390:**
  - The dock collapses to a dark ink band, a stock change, labelled "STUDIO SECTION / Measured r…", which is truncated. Keys, Ledgers and Find move behind "··· MORE ACTIONS" (`a3-rooms-fold-390`).
  - The TESTER pill covers the band label.
  - Nothing overflows.

## 4. People

- **Route and shots.** `/people`. `a4-people-{fold,full}-{1440,390}`.
- **`a4-people-sheet-{1440,390}`** is the contact record opened **inline** (Ines Calder), scrolled into view. People has no record sheet today: the record expands in the list.
- **The eye reads first** the coloured avatar discs (sage, brown, pink fills), then the boxed square status chips: ON PAPER, NOT ASKED, NOT ON FILE.
- **Edges.**
  - There are about 600 border edges on the page:
    - `216,204,184` ×342;
    - sage `168,181,160` ×196;
    - yellow `232,197,71` ×36;
    - rose `212,160,144` ×20.
  - Chips are boxed, filter tabs are boxed, and rows are hairlined.
  - The chip edges are **coloured by state**, so colour grades.
- **Bleeds.** The sticky header is **translucent**: rows show through it when scrolled (`a4-people-sheet-1440`). The record opens in place with no edge of its own, so it bleeds into the next contact.
- **Marks at rest, 1440 fold:** **40 · 18 · 6 · 72**. Edges are the highest of any first-viewport list.
- **At 390:**
  - 14 · 9 · 5 · 28. The page runs 15,787 px, the longest in the portal.
  - The dock label "Studio contacts" is ellipsised.

## 5. Library

- **Routes and shots.**

  | Page | Route | Shots |
  |---|---|---|
  | Library | `/library` | `a5-library-{fold,full}-{1440,390}` |
  | Capture sheet | `/library` | `a5-library-sheet-{1440,390}` |
  | Piece | `/library/e6590000-…-0101` | `a5-piece-fold-{1440,390}`, `a5-piece-full-1440` |
  | Judgments | `/library/judgments` | `a5-judgments-fold-{1440,390}` |

- **The eye reads first** the personal-library empty state. Its underline rule reads as a section close with nothing above it. Then the shelf tabs.
- **Edges.**
  - Filters are **rounded pill chips**, which conflict with People's square boxed chips.
  - The search placeholder is clipped.
- **Marks at rest, 1440 fold** (†):

  | Page | Marks |
  |---|---|
  | Library | **32 · 13 · 15 · 33** |
  | Piece | 35 · 6 · 13 · 32 |
  | Judgments | 10 · 5 · 6 · 9 |
  | Capture sheet (dialog) | 57 · 26 · 21 · 64 |

- **The piece page:**
  - boxed tags (STUDIO LIBRARY / PUBLISHED);
  - a bordered tan spec panel;
  - a filled "Ready for a project" act.

  That is three edge treatments in one fold (`a5-piece-fold-1440`).
- **Judgments.** White cards on cream. The prompt rule touches the header rule. One card's image does not match its title: "Heirloom Oak Dining Table" shows a whole dining room.
- **At 390:**
  - **The search input shrinks to a sliver showing "P" (broken)** (`a5-library-fold-390`).
  - The dock label "Resource library" is ellipsised on every library route.
  - Nothing overflows.

## 6. Boards

- **Routes and shots.**

  | Page | Route | Shots |
  |---|---|---|
  | Boards | `/boards` | `a6-boards-{fold,full}-{1440,390}` |
  | Board | `/board/813012bd…` | `a6-board-{fold,full}-{1440,390}` |
  | Document boards tab, after the board existed | `/doc/…/boards` | `a6-boards-doc-fold-{1440,390}`, `a6-board-picker-sheet-{1440,390}` (the NEW BOARD template picker) |

- **The boards list:**
  - **The eye reads first** the Playfair "Studio design boards" heading. Then one list row, with an italic Playfair initial "P", the board title and a mono project tag.
  - Status filters are dotted-underline mono links.
  - The row has hairlines above and below, and no edge. Below it is one empty ground.
  - Marks at rest, 1440 fold: **12 · 6 · 2 · 2**.
- **The board room is a different design system** (`a6-board-fold-1440`):
  - sans type throughout;
  - pill section tags;
  - a **filled sand "Save and close"**;
  - dashed drop zones (`229,226,221` ×12, `232,222,208` ×4);
  - **the one `box-shadow` found anywhere in the walk** (`shadows=1`).
  - The title "Palette + mater…" overlaps the back pill at 1440.
  - The canvas runs past the right edge to x = 1496.
  - There is no dock, and the TESTER pill sits over the side panel.
  - Marks at rest, 1440 fold: **44 · 31 · 8 · 74**. This is the highest control count in the portal.
- **The board picker sheet** (dialog): 22 · 6 · 1 · 24, with boxed template tiles.
- **At 390 (broken):**
  - The toolbar is clipped: "Share · Present design board · COMPOSITION TOOLS · Save…" runs to x = 774, and the tabs read "Preser", "PALETT".
  - The canvas overflows.
  - The list page's dock label "Studio design boards" is ellipsised.

## 7. Making papers

- **Routes and shots.**

  | Page | Route | Shots |
  |---|---|---|
  | Drafting | `/drafting/d0c10000-…-00b2` | `a7-drafting-{fold,full}-{1440,390}` |
  | Compose | `/compose` | `a7-compose-fold-{1440,390}`, `a7-compose-full-1440` |
  | Ceremony | `/ceremony/e7210000-…-0051` | `a7-ceremony-{fold,full}-{1440,390}` |

- **Drafting and compose:**
  - **The eye reads first** the drafting ornament and title, then the stack of **rounded "facet cards"**.
  - An open card gains a clay edge.
  - Section markers are short **coloured dashes** (brown, blue-grey).
  - There is a legacy boxed "+ Add Room" button.
  - The client's-copy card is rounded too. These are the only rounded cards in the document family.
  - Marks at rest, 1440 fold: drafting **45 · 10 · 12 · 48**†, compose 32 · 6 · 16 · 49†.
- **Ceremony** redirects to the lead's brief document, `/doc/e7210000-…-0051`, rendered as "Full Room" (`a7-ceremony-fold-1440`):
  - **The eye reads first** "Full Room", then the NEXT line "RESPOND TO THE INQUIRY".
  - The rail calls the client "New client", and the name "Ines Calder" appears only in the body.
  - Budget and Timeline sit in **boxed tiles**.
  - The quote has a **3 px tan left rule** (`196,165,123`).
  - The three acts (ACCEPT · BEGIN / NURTURE / PASS) are underline links.
  - Marks at rest, 1440 fold, inside `<main>`: **24 · 5 · 2 · 16**.
- **At 390:**
  - **Drafting:** the ornament overlaps the BACK link, and the title column is squeezed. The dock label "Proposal workspace" is ellipsised.
  - **Compose (broken):** `scrollWidth` is 421, because the "CAPTURE" doc-type meta runs past the edge. The dock label "Compose a piece" is ellipsised.
  - **Ceremony:** clean.

## 8. Money

### What was walked

| Surface | Shots |
|---|---|
| Accounts sheet, from the Desk's Ledgers | `a8-accounts-sheet-{1440,390}` |
| Invoice sheet, from Accounts then a FOLIO | `a8-invoice-sheet-{1440,390}` |
| Procurement sheet (purchase orders) | `a8-procurement-sheet-{1440,390}` |
| Invoice print, `/invoices/…/print` (`INV-2026-0721`) | `a8-invoice-print-{fold,full}-{1440,390}` |

### Accounts sheet

- **The eye reads first** the "STUDIO ACCOUNTS · LEDGER" head, then the rows' boxed status chips.
- **Chips.** PAID, DRAFT and SENT are boxed. **SENT is blue**, so colour grades.
- **Bleeds.** Rows are hairlined, with no per-invoice edge.
- **Marks at rest (dialog):** **64 · 21 · 16 · 40** at 1440; 52 · 17 · 12 · 29 at 390.
- **At 390 (broken):** 16 truncations, including "STUDIO ACCOUNTS…", "In…" and "PE…".

### Invoice sheet

- **What it shows.** The FOLIO for INV-2026-0723, opened from Accounts. It is **a second dialog stacked on the Accounts dialog**: a doc-stock sheet over a cream sheet over the dimmed Desk, so three layers are visible at once (`a8-invoice-sheet-1440`).
- **Edges.**
  - One boxed PAID chip.
  - Hairlines between the facts, the line items and the payments.
  - A dotted rule under the payment row.
- **Acts.** Both are underline links (REGENERATE LINK, PRINT / SAVE PDF). There is no filled act.
- **Fixture.** LINE ITEMS is empty above a $9,200 subtotal.
- **Truncation at 1440.** "Deposit for the Pell C…".
- **Marks at rest.** Not counted separately. The counter resolved to the Accounts dialog beneath, so it returned the Accounts numbers.
- **At 390 (broken):**
  - The wrapped title "Invoice INV-2026-0723" collides with the boxed PAID chip.
  - "CLIENT USER · PELL COUR…" and the payment method "A…" are ellipsised.
  - The Accounts rows behind show through below the sheet (`a8-invoice-sheet-390`).

### Procurement sheet

- **Chips.** Tilted "stamp" chips. RECEIVED/INSPECT is **yellow**, so colour grades.
- **Bleeds.** The PROJECT filter row runs straight into the PAYMENT filter row, so the two groups bleed together.
- **Marks at rest (dialog):** **54 · 29 · 3 · 16** at 1440.
- **At 390:** 35 · 22 · 0 · 5. The filters fill the fold and the register never shows. "PURCHASE ORDERS · ORDER REGISTER" is ellipsised.

### Invoice print

- **The eye reads first** the studio name ("Local Dev Studio", fixture) and the invoice number.
- **Stocks and edges.**
  - **Pure white stock**, the only all-white page apart from preferences.
  - A **filled ink rounded "Print / Save PDF"** button.
  - Ledger rules only: the table head, the total and the footer.
- **Fixture.** The line-item table is empty. The fixture invoice has no lines, yet the subtotal is $3,800.
- **Marks at rest, 1440 fold:** **28 · 2 · 0 · 4**†.
- **At 390:** clean.

## 9. Shared chrome

### What was walked

| Surface | Route | Shots |
|---|---|---|
| Help | `/help` | `a9-help-{fold,full}-{1440,390}`, `a9-help-desk-fold-1440` (a topic) |
| Preferences | `/preferences` | `a9-preferences-{fold,full}-{1440,390}` |
| ⌘K | — | `a9-cmdk-sheet-{1440,390}` |
| Keys | — | `a9-keys-sheet-1440` |
| Dock, Ledgers menu | — | `a9-dock-sheet-1440` |

### Header

- The header changes per area:
  - the Desk has a masthead;
  - the Document has a rail;
  - rooms, boards and drafting have a white head band with a back link and an ornament;
  - the board room has its own toolbar;
  - help and preferences have none.
- There are at least five header patterns.

### Dock

- **At 1440** it is a fixed bottom bar with a hairline top: Resource library · Studio contacts · Measured rooms · Ledgers ↑ · Find anything ⌘K · Keys ? · NO ACTIVE TIMER · STUDIO INBOX · avatar.
- **The Ledgers menu** (`a9-dock-sheet-1440`) is a **rounded** popover. It opens over square-cornered room cards and overlaps them with no stock change, because it is the same cream.
- **At 390** it becomes a dark ink band with a truncated section label and "··· MORE ACTIONS". Keys and Ledgers live behind it, so the 390 keys and dock sheets were not captured: the Playwright click on the hidden "Keys" target timed out.
- The dock is missing on help, preferences, the board room and invoice print.

### ⌘K

- **What it shows.** A white dialog over a dimmed page. Each stage row lists projects in one mono line, and those lines **truncate with ellipses**, for example "WHOLE HOME RENOVATION · WHITLOCK RESIDENCE (PLAN ROOM E2E 17…".
- **Marks at rest (dialog):** **33 · 13 · 9 · 22** at 1440; 30 · 12 · 9 · 18 at 390 (6 truncations).

### Keys

- **What it shows.** A doc-stock dialog. The keycaps are small boxed glyphs, and the rows are hairlined.
- **Marks at rest (dialog):** **39 · 2 · 15 · 70**. Every keycap is boxed.

### Help

- **What it shows.**
  - Its own chrome: no dock and no house header.
  - Bordered topic cards (`rgba(44,41,38,0.18)` ×36).
  - A rounded search field.
- **Empty gap (broken).** The **FEATURED GUIDES heading has nothing under it**.
- **Marks at rest, 1440 fold:** **19 · 7 · 7 · 32**. The topic page `a9-help-desk-fold-1440` is 4 · 0 · 0 · 4.

### Preferences

- **What it shows.**
  - A third design language: white **rounded cards** (`238,230,219` edges ×24) on cream.
  - **Native blue checkboxes**: the only browser-blue in the portal.
  - Bold serif headings ("Notification preferences", "Email", "Designer activity") that do not read as the house Playfair.
  - No dock, no back link and no header.
- **Marks at rest, 1440 fold:** **19 · 0 · 0 · 12**. It has no controls by the counter's definition, because the native checkboxes are not counted.
- **At 390:** it reflows cleanly, but the TESTER pill covers "Project milestones".

### Overlays and sheets

- Every dialog uses the same dimmed backdrop, but with different stocks:
  - doc stock: Keys, RECORD A CHANGE;
  - white: ⌘K, board picker;
  - cream: Accounts, Procurement.

### Empty states

There are at least four empty-state treatments:
- dashed card (plans, doc boards);
- underline rule (library);
- plain text ("No recorded activity", ceremony);
- dashed plate inside a boxed card (rooms).

## What repeats across areas

### Patterns that recur

1. **Hairline rows with no unit edge.** This is the default almost everywhere: the Desk, the paper's sections, the boards list, Accounts, Procurement, Keys and ⌘K. A row is separated from its neighbour by a `229,226,221` or `rgba(44,41,38,.18)` hairline and nothing else. This is the same bleed US-26 found on the Desk.
2. **A section closes only when the next one opens.** Section heads carry a 1px ink rule above, and nothing closes a section at its bottom. Seen on the Desk, the paper, ceremony and the invoice print.
3. **Mono eyebrows over Playfair titles.** DM Mono caps eyebrows (`STUDIO ACCOUNTS · LEDGER`, `MEASURED ROOMS`, `BRIEF · FULL ROOM`, `IN THE MARGIN`) appear on every area except preferences and the board room.
4. **Underline-link acts.** Mono caps underlined acts are the house default: ACCEPT · BEGIN, NEXT acts, "+ NOTE", status filters.
5. **One cream ground.** Most areas sit on a single cream ground with no second stock. Only the Document (rail, doc and margin) and the rooms cards layer stocks.
6. **Dock label ellipsis at 390.** On every area with the dock, the collapsed dock truncates the section name ("Studio overview", "Studio contacts", "Resource library", "Measured r…", "Proposal workspace", "Compose a piece", "Design boards", "Studio design boards"). The TESTER pill also covers it in dev.
7. **Status chips.** Status shows as chips on People, Pieces, Accounts, Procurement and Piece.

### Inconsistencies between areas

1. **Edges.** Four unrelated edge vocabularies:
   - boxed card on a darker stock (rooms);
   - dashed chip edges (pieces, 84 of them);
   - rounded cards (drafting, compose, preferences, the Ledgers popover, help search);
   - square boxed chips and keycaps (People, Accounts, Keys).

   Only two units in the whole document family own an edge: Jordan's 2 px hand-off rule and ceremony's 3 px quote rule. They differ in width and colour.
2. **Chip shapes.** There are three:
   - square boxed (People, Accounts, Piece);
   - rounded pill (Library filters, spec book, board-room tags);
   - tilted stamps (Procurement).
3. **Colour grades in five places**, against BRIEF §1 "colour orients and never grades":
   - People chip edges by state;
   - rooms quality dots;
   - Accounts' blue SENT;
   - Procurement's yellow RECEIVED/INSPECT;
   - Pieces' solid against dashed (by edge, not hue).

   No area uses colour to orient, meaning to say which job or stage something belongs to.
4. **Filled acts.** At least four filled-act styles break "one filled act per view" consistency (V18 Q8):
   - ink rounded "Print / Save PDF";
   - filled sand "New board" and "Save and close";
   - filled "Ready for a project" (Piece);
   - the spec book's legacy rounded "Run issue checks".

   Plus boxed legacy "+ Add Room" in drafting.
5. **Design systems.** Three sit outside the house sheet:
   - the board room: sans, pills, one `box-shadow`, no dock;
   - preferences: white rounded cards and native blue checkboxes;
   - the spec book: pills, a white and cream mix, and the 100-text-mark fold.
6. **Eyebrows.** The eyebrow sits in a different place in each area:
   - inline beside the title (boards: "1 ACTIVE BOARD" under; rooms: "· 6 scanned rooms" after);
   - above the title (Document);
   - inside the dialog head (sheets);
   - absent (preferences, board room).
7. **Section closes.**
   - The Document closes nothing.
   - Rooms close each unit with its card edge.
   - The library closes an empty section with an underline.
   - The invoice print closes with a footer rule.

   No two areas end a section the same way.
8. **Card or row.** The same kind of thing is a card in one area and a row in another:
   - a job is a row on the Desk, a facet card in drafting, and a rail entry in the Document;
   - a person is a row with an avatar disc;
   - a room is a boxed card;
   - a board is a list row;
   - a piece is a chip row in Pieces and a white card in Judgments.
9. **Sheets differ in stock and header.** Doc stock (Keys), white (⌘K, picker) and cream (Accounts, Procurement). The header rule is under the head in some and absent in others.
10. **Broken at 390.** These are the uplift's must-fix list:
    - Desk header horizontal scroll (399);
    - spec book tab overflow (424);
    - compose meta overflow (421);
    - board room toolbar and canvas overflow;
    - library search shrunk to "P";
    - Accounts' 16 truncations;
    - the invoice sheet's title colliding with its PAID chip;
    - Procurement filters fill the fold;
    - the Document NEXT-line ellipsis;
    - the ⌘K row ellipses.

    Every truncation also breaks the binding "wrap, never truncate" rule.

## Leftovers

- **Local DB.** This walk created one board through the UI: "Palette + materials study", id `813012bd-fb7c-419e-b0e3-8b5fcd5fd9ff`, on Whole Home Renovation. Before it, `proposal_boards` was empty, so `/board/[id]` could not be walked. It was **deleted after the walk** (`delete from proposal_boards where id=…`; 5 `proposal_board_items` rows cascaded; log `board-cleanup.log` in the evidence folder). Local `proposal_boards` is empty again. The a1 Desk folds predate it. The `a6-*` and `a8-*` shots that show a "RECENT BOARDS" region, and the Desk behind the money sheets, were taken while it existed. To re-walk `/board/[id]`, make a board from the Document boards tab ("Start a board", then "New board", then "Palette + materials study").
- **Missing captures.**
  - The Library STUDIO shelf tab could not be opened by automation. Two selector attempts timed out, so there is no `a5-library-studio-*`. The default shelf in `a5-library-*` shows the tab row.
  - The People "record sheet" does not exist. The record opens inline, and `a4-people-sheet-*` shows that.
  - There are no 390 captures of the Keys sheet or the Ledgers menu, because both sit behind the 390 "MORE ACTIONS" overflow.
- **Out of scope** per BRIEF §3: the auth screens and `(legal)` were not walked.
