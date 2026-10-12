# US-27 W2b · D2, the UX and IA seat: how each area takes card separation (SQ-802)

How designer-portal areas 2–9 (BRIEF §3) take Direction A's four moves. No product code changes.

**Basis.** BRIEF; WALK (SQ-800) and its shots; the e1 inventory (SQ-799); US-26 `direction.md` §3 A, §5 and §7; VISION §1 and §4–§5; V11, V18 and V19. Code paths are relative to `apps/designer-portal/src` at a91a98107. "(e1)" marks a citation taken from the inventory; the rest were read for this seat.

**Two corrections to e1.**
- `globals.css:2026-2037` is `.field-control`. The shared sheet is `DocSheet` (`components/document/overlays/doc-sheet.tsx:393-395`, 68 importers), and its layer CSS is at `globals.css:1820-1836`.
- `DocSheet` carries `.doc-elevated`, which is `box-shadow: var(--elevation-sheet)` (`globals.css:201,359-361`). **Every sheet already ships a shadow.** WALK counted only inside `<main>`. This becomes J3.

**The four parts.** Every area below uses these; a part reused beats a variant (BRIEF §6).

| Part | Form | Use |
|---|---|---|
| **Section** | The eyebrow (ornament, mono 12 caps, controls on its baseline), then the title. It closes on a full-measure `--rule-mid` (US-26 F2), spaced 48/72/24/12. | Grouping |
| **Card** | 1 px `--color-card-edge` (`globals.css:60`), 2 px radius, a `--paper-doc` face on a `--paper` or rail ground, no shadow; an optional 3 px stage rule replaces the left edge | A **few** units Leah **picks among**: a job, a room, a board, a piece. Never more than about a screen of them. |
| **Ledger row** | Full-measure hairline, an optional 2 px stage tick, state as one ink word | **Many** things she **scans** |
| **Text** | Prose, facts, metadata | Everything else |

The test: chosen by look or name, it is a Card; scanned for a value, it is a row. Marks at rest are WALK's 1440 fold (text · controls · colour · edges); proposed counts are left to the specimen gate.

## Area 2 · The Document (a job)

**(a) Moments.**
- "What's next on this job?" (Leah, then the hire)
- "Where does the money stand on this job?"
- "What was handed to me?" (Jordan)

**(b) Order.**
- **Today:** the letterhead and NEXT band, then the regions: Client approvals · Schedule · Pieces · Financials · Closeout · The record. The rail is on the left and the margin on the right (`doc/[id]/page.tsx:3209-3893`, e1).
  - Each region opens on `RegionRule` (`components/document/region/region-rule.tsx:17-38`).
  - A region closes only when the next one opens.
- **Proposed:** the same order, because the paper is the right IA (VISION §5.1).
  - **Every region becomes a Section that closes on `--rule-mid`.** That is R126's own rank ("1.5px charcoal ends a section", `globals.css:137-145`), which today is spent opening one.
  - The next region then opens on space and its title, so no rule doubles. The double rule stays only where a movement opens (`region-rule.tsx:6-15`).
  - Lines stay Ledger rows.
  - **The two units that own an edge today become one note rule.** Jordan's hand-off block (2 px blue-grey) and ceremony's quote (3 px tan) both take a 3 px `--oak` left rule.
  - **No Cards on the paper body.** The margin's "The whole job" note keeps its box, because it sits off the paper.
- **Subroutes.**
  - Pieces stays as it is in kind (see (i)).
  - Plans holds the shared empty state.
  - **The spec book is a different design language** (pills, mixed stocks, 100 · 26 · 10 · 62). It takes Ledger rows, underline filters and `--paper-doc`.
  - The boards tab's tiles become Cards (see area 6).

**(c) Filled act.**
- **The paper:** the Next act (V18 Q8). In the 56 px band it stays a scored primary, because a fill owes a consequence sentence the band cannot hold (`lens-band.tsx:453-456`, R141). The fill lives in its act sheet.
- **The spec book:** none. "Run issue checks" (`spec-books/spec-book-workspace.tsx:1225`) becomes secondary.
- **The boards tab:** none. The sand "New board" becomes scored.

**(d) Colour.**
- The stage, once: a 3 px `--tab-*` rule beside the title, so the Desk card and its paper agree (J5).
- The overdue clause in terracotta-ink.
- The rail's pigment dots and the status words go ink. Today they give the highest colour count at any fold (15).

**(e) Overlays.**
- The act sheets (RECORD A CHANGE, NeedActSheet) stay `DocSheet`.
- Pieces, plans, the spec book and boards stay full-page subroutes: they are working surfaces.
- Finishes print stays a fixed full view (`pieces/finishes/print/page.tsx:93-119`, e1).

**(f) Risks.**
- **Carding the regions** turns the paper into panels. That is the dashboard VISION §5.1 forbids.
- **The NEXT line truncates by design** (`LINE_CLIP`, `lens-band.tsx:47,439`). That breaks wrap-never-truncate at 390 (J9).
- **Moving the close rule** changes R126's placement, and is guarded by `region/__tests__/region-rule.test.tsx`.

**(g) Effort: L.**
- **The paper, M:** a close weight on `RegionRule` (8 consumers); the title's stage rule; wrapping at `lens-band.tsx:439`; unclamping the margin note.
- **The spec book, M:** its own design system, with a truncating title at `spec-book-workspace.tsx:1191` and its tabs overflowing to 424 px at 390.
- **Pieces, S:** 13 chips are under 44 px at 390.

## Area 3 · Rooms

**(a) Moments.**
- "Is this room measured and drawn yet?"
- "Give me this wall's dimensions while the maker is on the phone."

**(b) Order.**
- **Today:** the RoomShell head, then a grid of room cards: client, type and scan date, a dashed plan plate, geometry, a quality dot, and a Document link (`rooms/page.tsx:9-14`, e1). The room and the room file are continuous viewers.
- **Proposed:** keep Cards. Rooms are few, picked by name and image-led.
  - **The card takes the shared edge and face.** Today it is `--doc-ink-border` on `--doc-sheet-front` (`components/document/rooms/room-view/room-card.tsx:41`).
  - **The dashed plate stays**, because dashed means "not filled in" (R126, `globals.css:141-142`). It loses its edge once a drawing exists, so no card shows two edges at rest.
  - **Group the cards into Sections by job** (client as eyebrow), and close each one.
  - **The room and the room file share one head band.** The viewer is a Section, the facts are rows, and the notes are text.

**(c) Filled act.** None. Nothing here moves money or signs (R139, `globals.css:851-856`).

**(d) Colour.**
- The linked job's 2 px stage tick beside the client name.
- The graded quality dot (`qualityGradeColor`, `room-card.tsx:29,56-57`) becomes the ink word "Quality good".

**(e) Overlays.** The room and the room file are full RoomShell pages. The drawer, the log strip and ⌘K sit above them (`room-shell.tsx:8-10`, e1), and Esc yields to deeper overlays (`:116-126`). The area has no sheets of its own.

**(f) Risks.**
- **A catalogue wall at 40 scans.** Sections by job bound it, and past one screen a Section folds ("Show the other rooms"), with no count badge.
- **The head band is translucent** (`room-shell.tsx:138`, `rgba(…,0.85)` with `backdrop-blur`), so rows bleed through in every RoomShell tenant.

**(g) Effort: S.**
- The edge and face at `room-card.tsx:41`.
- The quality word at `:56-57`.
- The plate edge at `room-plan-thumb.tsx:37`.
- Grouping in `rooms-index.tsx`.
- `room-shell.tsx:138` made opaque `--paper-doc`, one line that also fixes People, Library and judgments.

## Area 4 · People

**(a) Moments.**
- "How do I reach this person, and what are their rules?" (Chidi: "Email first. Call for anything over $2,500.")
- "Is this trade's paperwork on file?"
- "Who just came in?"

**(b) Order.**
- **Today:** the head, search, a left index, six **boxed** filter tabs, Mine / Studio, then rows of avatar, name, role, **three boxed state chips**, phone and seats (`components/document/people/directory/person-row.tsx:146-152`).
  - It has 72 edges at the fold, the most of any list.
  - A record replaces the directory body (`people/people-room.tsx:525-545`) with no edge of its own, so it bleeds.
- **Proposed:**
  - **Filters become underline words.**
  - **The directory is a Section of Ledger rows.** 52 people as cards would be the catalogue.
  - **State chips become ink words in a column:** ON PAPER · NOT ASKED · NOT ON FILE, unboxed.
  - **The person record becomes a Card** on `--paper-doc` with a back word. Its regions are Sections (`views/person-profile.tsx:97`, e1), and compliance stays a table (`compliance-table.tsx:145`, e1).
  - **The inbound queue is the first Section**, and it closes.

**(c) Filled act.** None. "Add contact" is a secondary.

**(d) Colour.**
- **Role orients:** the avatar pigment says client, trade or maker (J7).
- **State goes ink.** Today the state words take four pigments by ruling (`globals.css:1935-1947`, PR-v), and the chip edges grade them (WALK §4). Under J1, only a blocked or do-not-contact word keeps terracotta-ink.

**(e) Overlays.** The existing sheets stay `DocSheet`:
- compare-merge (`compare-merge-sheet.tsx:489`);
- add person (`directory/add-person-sheet.tsx:203`);
- record document (`record-document-sheet.tsx:32`);
- reach and access (`reach-access.tsx:241`);
- close seat (`close-seat-act.tsx:153`);
- paperwork link (`paperwork-link-act.tsx:41`).

The record stays a page view, so Back and deep links keep working.

**(f) Risks.**
- **This fights a ruling.** The coloured state words were specified ("direction §3.8, SPEC §2.2", quoted at `globals.css:1937-1938`), so J1 must rule before the build.
- **The page runs 15,787 px at 390.** Rows stay rows. Paging the directory is a separate IA question, not a carding one.

**(g) Effort: M.**
- The chip and tab box edges go; the 47 hairline uses mostly stay (e1 §h).
- Words replace pigments (`STATE_WORD_PIGMENTS`, `@patina/types`, cited at `globals.css:1940-1942`).
- A Card wrapper on the record (`people-room.tsx:536-544`).
- The shared `room-shell.tsx:138`.

## Area 5 · Library

**(a) Moments.**
- "Find the piece I used on Holloway."
- "Is this piece ready to specify?"
- "What have we judged?"

**(b) Order.**
- **Today:** a search hero, then the shelf tabs, then the **rounded pill** type filters (`components/document/rooms/library/library-toolbar.tsx:226-229`), then the shelves.
  - Results are 8 px-radius **white** cards with pigment dots (`library-card.tsx:96,119,128`).
  - Judgments are white cards (`library/judgments/page.tsx:199-207`, e1).
  - The piece page shows three edge treatments at its fold.
- **Proposed:**
  - **Search, then one Section head.** The shelves and type filters both become underline words, so the portal has one filter grammar and no pills.
  - **Each shelf is a Section that closes.**
  - **Pieces are Cards**, image-led and chosen by eye, with the shared edge.
  - **The dots become the shelf word**, as V18 Q1 bans dots.
  - **Judgments use the same Card.**
  - **The piece page:** facts as rows, the story as text, and the tags as ink words. The tan spec panel becomes a Section.

**(c) Filled act.** None. "Capture" in the head is the primary. The piece's filled "Ready for a project" becomes secondary, because R139 reserves the fill.

**(d) Colour.** Nothing orients. The photographs carry the colour, so the chrome stays monochrome.

**(e) Overlays.**
- Capture stays a `DocSheet`. At 57 · 26 · 21 · 64 marks, it is the busiest sheet.
- The piece page and judgments are full pages, and a nested RoomShell returns to the Library (`room-shell.tsx:62-68`).

**(f) Risks.**
- **The catalog shelf is a catalogue wall.** Cap each shelf at one screen, then "Show more".
- **The search input shrinks to "P" at 390.** That is broken, so fix it first.

**(g) Effort: M.**
- `library-card.tsx:96`, and `:116-139` where the badges become words.
- The pills in `library-toolbar.tsx`.
- `JudgmentCard`.
- The piece page.
- The search width at 390.

## Area 6 · Boards

**(a) Moments.**
- "Show the client the direction."
- "Pull pieces onto a board for this room."

**(b) Order.**
- **The list.**
  - **Today:** a head, dotted filters and one hairlined row.
  - **Proposed:** boards become **Cards** in the Desk's Recent Boards doorway shape (`desk/page.tsx:575-589`, e1), in a Section per job that closes.
- **The board room.**
  - **Today:** a separate design system. It has sans type, pill tags, a filled sand "Save and close" (`components/mood-board/board-room-shell.tsx:1322-1323`), and `shadow-sm` at four sites (`:178,:203,:1516,:1525`, deviation admitted at `:174-176`).
  - It shows 44 · 31 · 8 · 74 marks, the most controls in the portal, and it overflows at both widths.
  - **Proposed:** the chrome takes the house system:
    - a RoomShell-style head band;
    - a Playfair title;
    - scored acts;
    - the tools as a Section in the side panel;
    - words in place of pills.
  - **The canvas and its dashed drop zones stay.** Dashed means "not filled in".

**(c) Filled act.** None. "New board" and "Save and close" become scored primaries, and Present stays secondary.

**(d) Colour.** Content only, because the palette is the board. Each board Card's project tag carries the job's 2 px stage tick.

**(e) Overlays.**
- The template picker stays a `DocSheet`, and its tiles become Cards.
- Errors render in place (`board/[boardId]/error.tsx:7-23`, e1).
- Present is a full view.

**(f) Risks.**
- **House chrome must never clip or recolour the content.**
- **The badge shadows** are the code's only deliberate shadow (J3).
- **The toolbar runs to x = 774 at 390.** The board room needs a narrow layout, not a restyle.

**(g) Effort: L.**
- **The list, S.**
- **The board room, L:** the header and toolbar, the `Button variant="primary"`, the four shadow sites, the tags, and the 390 layout.

## Area 7 · Making papers

**(a) Moments.**
- "Draft Elena's proposal, starting anywhere."
- "What will the client actually see?"
- "First meeting with a new lead: accept, nurture, or pass."

**(b) Order.**
- **Drafting and compose.**
  - **Today:** the head, then the title with "0 % drafted" and tabs, then Sections ("Scope of work", "Design concept"). The Sections hold **8 px-radius facet cards** (`components/document/compose/compose-section.tsx:41-43`, 5 importers), beside a rounded "client's copy". Coloured dashes mark the sections.
  - **Proposed:** facets stay **Cards**, because each is a unit she opens and fills, and there are few. They take the shared edge and 2 px, and the open facet keeps its clay edge as focus.
  - **The client's copy becomes a Card** on `--paper-doc`, laid on the ground. That is a paper beside the draft: depth from stock, not shadow.
  - **Every Section closes.**
  - **The legacy boxed "+ Add Room"** (`portal/scope-builder/rooms-in-scope.tsx:680`) becomes a secondary DocumentAction.
- **The galley** keeps its own segmented sheet (`galley.css:169-505`, e1).
- **Ceremony.** The boxed Budget and Timeline tiles become rows, because two facts are not cards. The quote takes the `--oak` note rule.

**(c) Filled act.**
- **Drafting:** "Send to the client" is the R139 terminal, filled only once the draft can send.
- **The galley:** the signature.
- **Ceremony:** ACCEPT · BEGIN, as the Document's Next act.

**(d) Colour.**
- **The stage, once:** a 3 px `--tab-proposal` rule on the title.
- **The coloured section dashes go ink.** They are a second key to learn.

**(e) Overlays.** Drafting and compose are full pages, because they are long work. `DraftProposalOverlay` stays a sheet (`app/(document)/layout.tsx:134-135`, e1).

**(f) Risks.**
- **Cards beside a preview can read as a form builder.** Each facet shows its status as one word, never a chip.
- **At 390, compose overflows to 421 px**, and the ornament overlaps BACK.

**(g) Effort: M.**
- `compose-section.tsx:41-43,58`.
- The client's-copy card.
- `rooms-in-scope.tsx:680`.
- The ceremony tiles.
- The section dashes.
- The compose meta wrap.
- The galley, S: a token check.

## Area 8 · Money

**(a) Moments.**
- "Who owes us what?"
- "Record the payment that just landed."
- "Which makers haven't confirmed our POs?"

**(b) Order.**
- **Accounts.**
  - **Today:** the head, title and tabs, then the studio totals, "Draw an invoice" and export, then hairlined invoice rows with **boxed chips**, SENT in blue (64 · 21 · 16 · 40).
  - **Proposed:** the same order.
    - The totals stay text, as **front matter of their rows**, which V11 permits.
    - **Invoices are Ledger rows, never Cards** ("a ledger is not a dashboard"). State is an ink word.
    - **Each register is a Section that closes.** `.money-rows` has a top rule only (`globals.css:2157`, e1).
- **Procurement.**
  - **Today:** two filter rows bleed into each other, and tilted stamps are coloured by state.
  - **Proposed:** one Section head with two labelled lines, and the stamps become ink words. At 390 the filters fold behind "Filter", so the register reaches the first screen.
- **The folio:** facts, lines and payments, each a Section of rows.
- **Print:** a print paper, unchanged in kind.

**(c) Filled act.**
- **Accounts:** none. "Draw an invoice" stays a scored primary.
- **The folio:** "**Record $3,400**", the R139 terminal with the amount in the label (`globals.css:851-856`), in the Q10 scoped sheet.
- **Procurement:** none.
- **Print:** none. Its filled, rounded "Print / Save PDF" becomes scored.

**(d) Colour.**
- **Nothing orients.** Only the overdue clause is coloured, in terracotta-ink.
- **The status hues go ink:**
  - `accounts/accounts-ledger-page.tsx:32-36`;
  - its duplicate, `accounts/invoice-folio.tsx:67-71`;
  - `orders-ledger.tsx:115-116`.

**(e) Overlays.**
- **Money stays in sheets.** D9 puts review in the drawer ledger, never on a page (V11).
- **The folio today stacks a second dialog on Accounts**, so three layers show, and at 390 the rows bleed through. **Proposed:** the folio replaces Accounts inside one sheet, with "← Accounts" (J4).
- **Record the payment** is a new one-record sheet (US-26 Q10, recommended answer).

**(f) Risks.**
- **Carding invoices makes a dashboard.**
- **Totals without rows fail V11.**
- **A non-owner sees no studio totals** (V18 Q10).
- **Accounts truncates 16 times at 390**, starting with the sheet head (`overlays/doc-sheet.tsx:158`).

**(g) Effort: M.**
- One ink status map, replacing two duplicates.
- `orders-ledger.tsx:115-116`.
- The close on `.money-rows`.
- The procurement head.
- The folio in place.
- Wrapping.
- The record-payment sheet is counted in US-26 slice 3.

## Area 9 · Shared chrome

**(a) Moments.**
- "Get me to that job" (⌘K).
- "Stop that email reaching me" (preferences).
- "How does this work?" (help).

**(b) Order.**
- **Headers go from five patterns to three:**
  - the Desk's masthead;
  - the Document's rail;
  - the RoomShell band everywhere else, including help, preferences and the board room, which have none today.
- **⌘K:** Ledger rows in stage Sections that wrap, never ellipsise.
- **Keys:** text rows, with the keycaps unboxed (70 edges today).
- **Preferences:** today white `rounded-lg` cards (`app/preferences/page.tsx:433`) with native blue checkboxes (`:471`). It becomes Sections of rows with house controls.
- **Help:** its topic Cards stay, because there are few and they are picked by name. FEATURED GUIDES holds a row or does not print.
- **Empty states go from four treatments to one:** a dashed plate (R126) holding one sentence and one scored act.

**(c) Filled act.** None. Chrome never fills.

**(d) Colour.**
- **⌘K's stage groups** take the 2 px tick, as on the Desk's ledger. Nothing else in chrome is coloured.
- **The Ledgers popover** opens rounded, on the same cream as what it covers. It takes `--paper-doc` and the shared edge.

**(e) Overlays and depth.**
- **One sheet, `DocSheet`.** Today sheet stocks vary (doc, white, cream) and their head rules vary.
- **Every sheet becomes `--paper-doc`** with the `DocSheetHead` rule, on the existing scrim (`doc-sheet.tsx:377`).
- **The depth ladder, back to front:**
  1. the ground (`--paper` or rail);
  2. the paper (`--paper-doc`);
  3. a Card, a lifted face with `--color-card-edge`;
  4. the scrim;
  5. the sheet.
- **No shadow anywhere** (J3).

**(f) Risks.**
- **A blast radius of 68 `DocSheet` importers.** Change the primitive once, not per caller.
- **The dock truncates its label** (`mobile/mobile-bar.tsx:400`, `studio-drawer.tsx:309,577`). This is US-26 F8, and it must land portal-wide, not only on the Desk.

**(g) Effort: M.**
- `doc-sheet.tsx`: wrap at `:158`; at `:393-395`, the stock, a radius of 2 px instead of 5, and no `doc-elevated`.
- Wrapping at `mobile-bar.tsx:400` and `studio-drawer.tsx:309,577`.
- The popover (`studio-drawer.tsx:359-405`, e1).
- Preferences at `:433` and `:471`.
- The help heading.
- One empty-state component.
- ⌘K wrap.

## (h) The order for the deployment team

1. **The Desk, US-26 slices 0–2.** These define the Card, the Section close and the stage tick.
2. **Shared chrome (9).** Ship the four parts, the `DocSheet` changes, wrapping and the empty state. After this, most later work is deletion: of boxes, pills and pigment maps.
3. **The Document (2).** Paper, then pieces, then the spec book. It is VISION's first surface and the most-used area (e1 §i).
4. **Money (8).** It carries the first dollar (VISION §3), and Q10's sheet lands with it.
5. **Making papers (7).** It carries the margin upside, and the change is a small edge swap.
6. **Rooms (3), People (4) and Library (5), as one wave.** They share `room-shell.tsx:138`. J1 must be ruled before People.
7. **Boards (6), last.** It ranks lowest (e1 §i), and the board room is an L that needs J6.

Each area ships its own 390 must-fixes (WALK, inconsistency 10); none is deferred.

## (i) What stays deliberately different

- **The Document is a paper, not cards.** Its regions are Sections, its lines are rows, and it sits on one `--paper-doc` sheet between the rail and the margin. Stage colour appears once, on the title.
- **Only the Desk has stage-coloured job Cards.** Elsewhere a job is a 2 px tick or a 3 px title rule.
- **The Build room keeps the white drafting stock**, for working sheets only (V15 Q2, `globals.css:1968-1989`). It is a spreadsheet: rows, never Cards. PLACEHOLDER keeps its dashed edge.
- **Money is a ledger** (V11). It has no Cards, and its totals are only ever front matter.
- **The board canvas is the designer's**, with content colour and no house edges inside it.
- **The print routes** stay pure print stock, with no dock and no depth.
- **The agreement galley** keeps its segmented sheet, where R139's fill means "sign".
- **Room Cards hold a drawing.** The dashed plate stays honest until the room is drawn.

## (j) Founder questions

Each answer assumes US-26's recommended Q5–Q15; the ones that depend on a specific question name it.

| # | Question | Recommended | If declined |
|---|---|---|---|
| J1 | Extend V19 Q1, "colour orients, never grades", portal-wide? | **Yes.** State words go ink, and terracotta-ink stays only on a blocked, overdue or do-not-contact word. This demotes R126's filled stamps (`globals.css:147-156`), PR-v's People pigments, money's status hues and rooms' quality dots. | WALK's five grading sites stay, and BRIEF §1 holds on the Desk alone. |
| J2 | May `--color-card-edge` box Rooms, pieces, judgments, board tiles, facets, the person record and help topics? This extends US-26 Q5. | **Yes, on `--paper-doc` faces only.** Never on the Document's body, and never on the rail, where it measures 2.62:1. | These units take `--hairline-strong`, which fails WCAG 1.4.11. |
| J3 | Remove the shadows that already ship: `--elevation-sheet` on every `DocSheet`, and the board room's four `shadow-sm`? | **Yes, all five.** The scrim, the stock step and the edge carry depth. The deck owes a side-by-side. | A4 is amended to allow "one sheet shadow", plus a board-room exception. |
| J4 | Should the invoice folio replace Accounts inside one sheet? | **Yes,** with "← Accounts". One sheet at a time. | Three layers stay, and rows bleed through at 390. |
| J5 | Put the job's stage on its paper as one 3 px `--tab-*` rule on the title? | **Yes, once.** Dark values are documented only, per Q13. | Stage colour exists only on the Desk. |
| J6 | Bring the board room into the house system? | **The chrome yes, the canvas never,** as its own late slice. | It stays a third design system. |
| J7 | Keep People's role-coloured avatars? | **Yes.** They say who, not how well. | Ink initials, and People has no colour. |
| J8 | The spec book: a full uplift, or the token pass? | **The token pass, wrapping and the 390 fixes now.** Whether it folds into the Build room is its own story. | A full uplift adds about an M to area 2. |
| J9 | Let the Document's NEXT band wrap past 56 px at 390? | **Yes.** It takes a second line, and the act stays scored (R141). | `LINE_CLIP` keeps breaking a binding rule. |
