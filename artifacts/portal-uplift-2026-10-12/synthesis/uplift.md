# US-27 W3 · The portal uplift: Direction A on the Desk, card separation across the portal (SQ-805)

**12 October 2026 · base `152eb9646`.** This is the hand-off the deployment team builds from. It changes no product code.

**Inputs:** `BRIEF.md`; `walk/WALK.md`; `review/e1-inventory.md`; `review/d1-system.md` (system seat); `review/d2-areas.md` (UX and IA seat); `review/d3-desk-build.md` (the Desk); `review/d4-audit.md` (critic); US-26 `artifacts/desk-redesign-2026-10-12/`; V18 and V19.

**Conventions.** Code paths are relative to `apps/designer-portal/src/` unless they start with `supabase/`, `packages/` or `docs/`. Line numbers are the seats' citations at `a91a98107`; re-confirm each before editing. ⟦U-Qn⟧ marks a choice that rests on a recommended founder answer in (g). The specimens are built from `specimens/SPEC.md` and gated by `specimens/check.mjs`.

## (a) Thesis

The Desk stopped bleeding together under Direction A because four things happened at once: every unit got an edge that can be seen (1 px `--card-edge`, 3.21:1), every section closed on its own rule, colour moved into one form that only means stage, and depth came from the order of the paper stocks instead of a shadow. **The uplift is those four moves made into seven shared components and one depth ladder, then applied to the other eight areas by a single test: a unit earns a card only when it is one thing someone opens, holds something to do or see now, sits in a set bounded by a rule, and is ranked.** Everything else is a ledger row, a plate with a caption, or text. That test is what stops the portal from becoming the catalogue wall US-26 retired: cards are promotions, capped at six per Section, and the rest is always rows directly beneath them.

**Where the seats agree.** All four seats, and the walk, find the same faults: sections that open on a rule but never close (WALK patterns 2 and 7; D4 inconsistency 2); hairlines doing a boundary's job at 1.4–1.5:1; state graded by colour in People, Rooms, Accounts and Procurement; five header patterns and four empty-state grammars; three sheet stocks; a sheet stacked on a sheet in Money; and the 390 truncations (dock, NEXT, Accounts, ⌘K). All agree the Document stays a paper, Money stays a ledger, the board canvas stays the designer's, and nothing ships a shadow without a founder ruling.

**Where they split, and how this resolves it.**

- **Empty state** (D1 sentence and rule; D2 dashed plate): **D1.** Dashed means "not filled in" and survives only on the A15 placeholder stamp and the canvas's drop zones. One exception: a Section of Cards that empties keeps one card frame for its sentence (US-26 A's close-of-day Today).
- **Rooms' AWAITING DRAWING:** D1's A10 silhouette and ink word, D2's Sections by job, at most three Cards, then rows.
- **Library results, Boards index, judgments** (D1 plate and caption; D2 Cards): **D1's card test** ⟦U-Q20⟧. A job's own boards tab is bounded, so it takes Cards.
- **Help topics** (D1 rows; D2 Cards): **rows.** They are scanned by name and grow.
- **Person record** (D1 lifted in place; D2 a Card): **neither.** A laid paper page view (L1) with "← Studio contacts", so Back and deep links work and nothing bleeds.
- **Note edge** (D1 2 px; D2 3 px oak): **2 px `--edge-note`.** 3 px is the stage width.
- **Avatars** (D1 ink initials; D2 role pigment): **ink initials recommended**, carried as ⟦U-Q15⟧.
- **Header** (D1 one component; D2 three patterns): **one Header line, three placements.** The Desk and every RoomShell page use it on `--paper`, via D2's opaque `room-shell.tsx:138` fix; the Document keeps rail and letterhead, the Header line carrying only back and acts.
- **Contrast** (D1 measured 1.41 and 1.48; D4 cited 1.20 and 1.30 from comments): **D1's measurements govern**; both fail 3:1, so the conclusion stands.

## (b) The system

### Depth ladder

Depth is three cues: **the order of the stocks, the weight of the edge, and the space around a unit.** The nearer the layer, the purer its stock and the heavier its edge. In light, purer is lighter; the dark set inverts (`docs/design/house-sheet/SPEC.md:89-108`), and its stock steps are tiny (1.05–1.30:1), so in dark the edge carries the depth.

| Layer | Holds | Stock light / dark | Edge (ratio on face / on ground) |
|---|---|---|---|
| **L0 Ground** | page, Header line, sections | `--paper` `#FAF7F2` / `#2A2622` | none |
| **L0′ Rail** | the Document's spine | `--rail` `#E8E3DB` / `#3A3530` | the stock step. **Never `--card-edge` on rail** (2.62:1). |
| **L1 Laid paper** | the job paper, a person's record, print, the galley | `--paper-doc` `#FCFAF6` / `#26221E` | the stock step (a region, exempt from 1.4.11) |
| **L2 Card** | a unit that passes the card test | `--paper-doc` | 1 px `--card-edge` **3.21 / 3.13** (dark `#77736E` 3.35 / 3.19); a job card's left side is the 3 px stage rule |
| **L3 Lifted** | the card whose sheet is open | `--paper-lift` `#FFFFFF` / `#1C1A17` | 1 px `--ink-faint` **6.79 / 6.35** (dark 7.95 / 6.87). Never resizes. |
| **L4 Sheet** | act sheets, ledgers, ⌘K | `--veil`, then `--paper-doc` | 1 px `--card-edge`; the face on the veil is **4.16** (dark: the edge, **4.06**) |
| **L4′ Popover** | Ledgers, `⋯` menus | `--paper-doc`, no veil | 1 px `--card-edge` 3.13 |
| **L5 Modal** | an irreversible confirm; the only thing above a sheet | a second `--veil`, then `--paper-doc` | 1 px `--ink` 3.33 (dark 16.41) |

**Focus on every layer:** 2 px `--clay-ink`, offset 2 (5.61–6.00 light; dark `#D8B98A` 8.03–9.28). **Stage edges** (`--tab-*`) reach 4.89–8.20 on every light stock; in dark they take the `--tab-*-edge` companions (4.71–6.22), because the light pigments fall to 1.93–3.02 on dark paper.

### Reconciling D1 with D4

D4 ranked edge contrast fifth and focus tenth from token comments; D1 measured. The reconciled rules:

1. **Hairlines are separators only.** `--doc-ink-border` (1.41) and `--hairline-strong` (1.48) never stand alone as a component boundary. Every component boundary uses `--card-edge` (≥ 3.13) or `--ink-faint` (≥ 5.32 on rail, the one sanctioned edge there). `--rule-mid` (13.53) closes a Section.
2. **Focus is one ring.** 2 px `--clay-ink` everywhere. D4's finding that Library inputs use `outline-none` with a border shift (`capture-sheet.tsx:88-99`) is a defect fixed in S1, not a variant.
3. **Dashed zones carry words.** A dashed drop zone or placeholder is never the only cue; it prints what goes there.
4. **State never rests on colour.** The stage word always prints in ink beside its edge (1.4.1); state is an ink word (U-Q13).
5. **Targets.** 44 px for every act, filter word, name link, fold and Undo.

### Components

Seven, reused unchanged; a variant needs a reason in its area. D1 §(b) holds full anatomy and states; `specimens/shared.css` holds each verbatim.

1. **Section.** Eyebrow (clay ornament, DM Mono 12/16 caps, controls on its baseline), optional `.t-d2` title, body, then **its own** closing `--rule-mid` at full measure. Spacing 48 / 72 / 24 / 12. Never a box; never inside a card or sheet.
2. **Card.** Eyebrow (kind or stage · holder when not yours · freshness), a name link whose upper block is the hit area, lines split by `--rule-hair`, a foot (one act, at most one tertiary) at `margin-top: auto`. `--paper-doc`, 1 px `--card-edge`, 2 px radius; left side `--edge-stage` in `--tab-*` for a job. A plate slot may replace the lines. Grid 3 / 2 / 1-up at 900 / 600. Lifted (L3) while its sheet is open.
3. **Ledger row.** Name (`.t-d4` link), sentence, when, one right-aligned act; columns at ≥ 900 per `globals.css:631-660`, stacking below. A job row carries the `--tick-stage` tick. Full-measure separators. **State is an ink word, never a chip.**
4. **Sheet frame, popover, modal.** One stock for every sheet: `--paper-doc`, 1 px `--card-edge`, 2 px radius (retiring three stocks and the 5 px radius at `doc-sheet.tsx:395`). Mono head with "Put back · Esc"; a foot with at most one filled act. **Never a sheet over a sheet.** Focus traps on the head and returns to the opener, whose unit lifts.
5. **Empty state.** The Section's eyebrow, one sentence with its starting act inline, the closing rule. Never a dashed box, never a rule with nothing above it.
6. **Header line.** One 44 px row on `--paper`: back act when nested, `.t-d2` title, acts at the right (secondary ＋ creates; tertiary Find, ⌘K shown only for a fine pointer), then `.doc-rule-strong`. Sticky only on long lists, then opaque. At 390, two rows with full accessible names (2.5.3).
7. **Stage edge.** A 3 px rule on a job card's left side or a document's title block, or a 2 × 24 px tick beside a row's name. Only on a unit that stands for a job; `CanvasText` in forced colours.

**Supporting parts:** plate and caption (A10; the plate is a picture mat edged in 1 px `--card-edge` per rule 1, with no added fill, padding or radius, so it is not a card), the ink state word, `--edge-note`, facts (`dl`), money rows, house fields and checks, the dock (an L1 bar on a `--hairline-strong` rule).

### Tokens

**Reused** unchanged: the three stocks, `--color-card-edge` (`globals.css:60`), the rules (`:143-145`), `--tab-*` (`:164-169`), `--wash-*-still` (`:187-192`), the text ramp and pigment inks.

**New, each named and justified:**

| Token | Light | Dark (documented, not shipped ⟦U-Q9⟧) | Why |
|---|---|---|---|
| `--card-edge` | `var(--color-card-edge)` | `#77736E` | house short name (`:1906`) |
| `--paper-lift` | `#FFFFFF` (= `--bg-surface`) | `#1C1A17` | L3 |
| `--veil` | `rgba(20,18,16,.55)` | `rgba(0,0,0,.60)` | names `doc-sheet.tsx:377` |
| `--edge-stage` / `--tick-stage` | `3px` / `2px` | same | one width per form |
| `--edge-note` | `2px solid var(--oak)` (4.20 / 4.30) | `2px solid #B39572` | one non-stage note edge |
| `--tab-*-edge` ×6 | unused | `#7D9EC0 #5FA08F #73A374 #A3A75C #B98F5A #CC7A70` | pass on dark paper |

**Retired** on a yes to U-Q12: `--elevation-sheet` and `.doc-elevated`.

### Shadows (the evidence for U-Q12)

`DocSheet` carries `.doc-elevated` (`globals.css:201,359-361`; `doc-sheet.tsx:393`), so **every sheet already ships the one ruled shadow**, as do the margin chips and studio drawer. Unruled A4 breaches, fixed whatever U-Q12 rules: the board room's `shadow-sm` (`components/mood-board/board-room-shell.tsx:178,203,1516,1525`); three modals at `0 32px 80px` (`promote-to-studio-modal.tsx:474`, `nominate-to-catalog-modal.tsx:429`, `bulk-promote-to-studio-modal.tsx:174`); `MilestoneCard.module.css:5`. The ruled shadow reaches 1.16:1; the ladder separates a sheet at 4.16:1. Side-by-side: `review/d1-sketches/sheets.html`, frame "G-Q1".

## (c) The areas

Effort: S ≈ a day, M ≈ a few days, L ≈ a week or more, for one builder, est. "Filled act" means the one R139 terminal the view may hold (V18 Q8).

### Area 1 · The Desk

Built as (d); moments are US-26 M1–M8. It defines the Card, the Section close and the tick, so it goes first. Filled act: none. Effort: L across S0 and S2–S5.

### Area 2 · The Document

- **Moments.** "What's next on this job?" (Leah, then the hire). "Where does the money stand?" "What was handed to me?" (Jordan).
- **Today.** Regions open on `RegionRule` (`components/document/region/region-rule.tsx:17-38`) and close only when the next opens. The hand-off and ceremony quote own lone coloured edges. Rail pigment dots give the walk's highest colour count (15). NEXT clips at 390 (`LINE_CLIP`, `lens-band.tsx:47,439`). The spec book is its own design language.
- **Proposed.** Same order (VISION §5.1). **Each region is a Section that closes on `--rule-mid`**; the double rule stays only where a movement opens. Lines stay rows. The hand-off takes `--edge-note`. **No Cards on the paper body**; the margin note is a Card off the paper, unclamped. The stage once, as a 3 px title rule ⟦U-Q14⟧. Rail words go ink. NEXT wraps at 390 ⟦U-Q19⟧. The spec book takes the token pass: underline tabs, Sections by trade, rows, one stock ⟦U-Q18⟧.
- **Components.** Section, Ledger row, Stage edge, Card (margin only), `--edge-note`, money rows, Header line.
- **Filled act.** None on the paper: the Next act stays a scored secondary in the band (R141) and fills in its sheet. "Run issue checks" goes secondary; the boards tab's sand "New board" goes scored.
- **Risks.** Carding regions makes the dashboard VISION forbids. Moving the close rule changes R126's placement; `region/__tests__/region-rule.test.tsx` must change with intent.
- **Effort: L.** Paper M (`RegionRule` across 8 consumers, title rule, `lens-band.tsx:439`, margin unclamp); spec book M (`spec-books/spec-book-workspace.tsx:1191,1225`, tabs at 424 px on 390); pieces S (13 sub-44 chips).

### Area 3 · Rooms

- **Moments.** "Is this room measured and drawn yet?" "Give me this wall's dimensions while the maker is on the phone."
- **Today.** Room cards on `--doc-ink-border` (`components/document/rooms/room-view/room-card.tsx:41`), each nesting a dashed AWAITING DRAWING plate louder than the room, plus a graded quality dot (`:29,56-57`). The RoomShell head is translucent (`room-shell.tsx:138`), so rows bleed through in every tenant.
- **Proposed.** Sections by job, client in the eyebrow with the job's tick. **At most three room Cards per Section**, plate slot holding the plan or the A10 silhouette with the ink word AWAITING DRAWING; the rest are rows. "Quality good" as an ink word. Room and room file share the Header line; viewer a Section, wall facts rows, notes text.
- **Components.** Section, Card (plate slot), Ledger row, Header line, Stage edge.
- **Filled act.** None.
- **Risks.** Forty scans: the cap and the grouping bound it.
- **Effort: S.** `room-card.tsx:41,56-57`; `room-plan-thumb.tsx:37`; grouping in `rooms-index.tsx`; `room-shell.tsx:138` opaque `--paper` (one line that also fixes People, Library and judgments).

### Area 4 · People

- **Moments.** "How do I reach this person, and what are their rules?" (Chidi Mensah: "Email first. Call for anything over $2,500.") "Is this trade's paperwork on file?" "Who just came in?"
- **Today.** Boxed filter tabs; three boxed state chips per row in PR-v's pigments (`globals.css:1935-1947`); coloured avatars; 72 edges at the fold. The record replaces the directory body with no edge (`people/people-room.tsx:525-545`). 15,787 px at 390.
- **Proposed.** Underline filter words. Inbound first, a Section that closes. The directory a Section of Ledger rows; state as ink words in a column (ON PAPER · NOT ASKED · NOT ON FILE), terracotta-ink only on a blocked or do-not-contact word ⟦U-Q13⟧. Ink-initial avatars ⟦U-Q15⟧. **The record is a laid paper page view** (L1) with "← Studio contacts": his rules, how to reach him, paperwork (compliance stays a table), "On these jobs" as ticked rows. Its sheets stay `DocSheet`.
- **Components.** Section, Ledger row, ink word, Header line, Stage edge, L1 paper.
- **Filled act.** None; "Add contact" is secondary.
- **Risks.** **This reverses a ruling** (PR-v, `globals.css:1937-1938`): U-Q13 rules first. Paging the directory is a separate question.
- **Effort: M.** Chip and tab edges; `STATE_WORD_PIGMENTS` (`@patina/types`) to words; the record wrapper (`people-room.tsx:536-544`); avatars.

### Area 5 · Library

- **Moments.** "Find the piece I used on Holloway." "Is this piece ready to specify?" "What have we judged?"
- **Today.** Pill filters (`components/document/rooms/library/library-toolbar.tsx:226-229`); 8 px-radius white result cards with pigment dots (`library-card.tsx:96,119,128`); white judgment cards; three edge treatments on the piece page; a filled "Ready for a project"; search collapsed to "P" at 390.
- **Proposed.** Search, then one row of underline words for shelf and type: one filter grammar, no pills. **Results and judgments are plate and caption** ⟦U-Q20⟧, each caption naming piece, maker and "Used on Holloway Den" with its tick. Each shelf a Section that closes and folds past one screen. The piece page: facts as `dl`, tags as ink words, "Used on" as ticked rows, "Add to a project" secondary.
- **Components.** Section, plate and caption, Ledger row, Stage edge, Header line, field.
- **Filled act.** None; "＋ Capture" is the scored primary.
- **Risks.** The catalog shelf: the fold bounds it. Capture is the busiest sheet (57 · 26 · 21 · 64 marks).
- **Effort: M.** `library-card.tsx:96,116-139`; `library-toolbar.tsx`; `JudgmentCard`; the piece page; the 390 search width (fix first); `capture-sheet.tsx:88-99` focus.

### Area 6 · Boards

- **Moments.** "Show the client the direction." "Pull pieces onto a board for this room."
- **Today.** The list: dotted filters, hairlined rows. The board room is a third design system: sans type, pills, a filled sand "Save and close" (`board-room-shell.tsx:1322-1323`), four unruled `shadow-sm`s, 44 · 31 · 8 · 74 marks, a toolbar to x = 774 at 390.
- **Proposed.** The list: Sections by job, boards as plate and caption, underline filters. A job's boards tab: its open boards as Cards with a plate slot. The board room ⟦U-Q17⟧: the house Header line (Playfair title, Present and Save and close scored, Share tertiary), tools as a side-panel Section folding behind "Tools" at 390, tags as words, **no shadow**. The canvas and its dashed drop zones stay content, each zone with its word.
- **Components.** Section, plate and caption, Card (tab), Header line, Stage edge.
- **Filled act.** None.
- **Risks.** House chrome must never clip or recolour content. The board room needs a narrow layout, not only a restyle.
- **Effort: L.** List S; board room L (header and toolbar, `Button variant="primary"`, the four shadow sites, tags, 390 layout).

### Area 7 · Making papers

- **Moments.** "Draft the proposal, starting anywhere." "What will the client actually see?" "First meeting with a new lead: accept, nurture, or pass."
- **Today.** 8 px-radius facet cards (`components/document/compose/compose-section.tsx:41-43`) beside a rounded "client's copy"; coloured section dashes; "0 % drafted"; a boxed "+ Add Room" (`portal/scope-builder/rooms-in-scope.tsx:680`). Compose overflows to 421 px at 390. Ceremony boxes Budget and Timeline as tiles.
- **Proposed.** Facets stay **Cards** (few, each opened and filled) on the shared edge, status one word; the open facet keeps the clay ring. The client's copy is a laid paper beside them: depth from stock. "Drafted: scope, concept · To draft: pieces, fees", no percentage. Sections close. "+ Add a room" secondary. Dashes go ink. The stage once, a 3 px `--tab-proposal` title rule. Ceremony: the quote takes `--edge-note`; Budget and Timeline become facts. The galley keeps its segmented sheet.
- **Components.** Card, L1 paper, Section, Stage edge, `--edge-note`, facts.
- **Filled act.** Drafting: "Send to Tom and Ellery Vance", filled only once the draft can send. Galley: the signature. Ceremony: none; Accept and begin is scored.
- **Risks.** Cards beside a preview can read as a form builder; one word of status per facet prevents it.
- **Effort: M.** `compose-section.tsx:41-43,58`; the client's-copy paper; `rooms-in-scope.tsx:680`; ceremony tiles; section dashes; compose meta wrap; galley S.

### Area 8 · Money

- **Moments.** "Who owes us what?" "Record the payment that just landed." "Which makers haven't confirmed our POs?"
- **Today.** Accounts: boxed chips, blue SENT (`accounts/accounts-ledger-page.tsx:32-36`, duplicated at `accounts/invoice-folio.tsx:67-71`), 16 truncations at 390 (from `overlays/doc-sheet.tsx:158`). The folio stacks a second dialog, so three layers show. Procurement: two bleeding filter rows, tilted yellow stamps (`orders-ledger.tsx:115-116`). Print: a rounded filled button.
- **Proposed.** Accounts is a wide sheet: totals as text front matter ("$13,700 is out with clients; $3,800 of it is overdue."), then a Section of Ledger rows with ink state words, closing on `--rule-mid` (`.money-rows` has a top rule only, `globals.css:2157`). **Invoices are never Cards.** The folio replaces Accounts in the same sheet with "← Accounts" ⟦U-Q16⟧. Record the payment is a one-invoice sheet ⟦U-Q6⟧. Procurement: one Section head with two labelled lines of underline words, folding behind "Filter" at 390; stamps become words. Print's act goes secondary.
- **Components.** Sheet frame, Section, Ledger row, money rows, ink state word, facts, field.
- **Filled act.** The record-payment sheet: **"Record $3,400"**, the amount in the label. Nowhere else.
- **Risks.** Carding invoices makes a dashboard; totals without rows fail V11; a non-owner sees no studio totals (V18 Q10).
- **Effort: M.** One ink status map replacing two duplicates; `orders-ledger.tsx:115-116`; the `.money-rows` close; procurement head; folio in place; wrapping. The record-payment sheet is counted in S4.

### Area 9 · Shared chrome

- **Moments.** "Get me to that job" (⌘K). "Stop that email reaching me." "How does this work?"
- **Today.** Five header patterns. Preferences: white `rounded-lg` cards (`app/preferences/page.tsx:433`), native blue checkboxes (`:471`). Help: bordered topic cards. ⌘K ellipsises six times at 390. Keys: 70 keycap edges. The Ledgers popover is rounded on the cream it covers. Three sheet stocks; four empty-state grammars. The dock label truncates (`components/document/mobile/mobile-bar.tsx:400`, `studio-drawer.tsx:309,577`) under the TESTER pill.
- **Proposed.** One Header line everywhere. ⌘K: Sections of rows, job rows ticked, wrapping. Keys: text rows. Preferences: Sections of rows with house checks. Help: Sections of plain rows. One empty state. **One sheet** (`DocSheet`): `--paper-doc`, `--card-edge`, 2 px, no `doc-elevated` ⟦U-Q12⟧, head wrapping at `:158`. The popover square, on `--paper-doc` with the edge. The dock wraps; TESTER sits above it.
- **Components.** All seven.
- **Filled act.** None; chrome never fills.
- **Risks.** `DocSheet` has 68 importers: change the primitive once, never per caller, and walk a sample of sheets at both widths.
- **Effort: M.** `doc-sheet.tsx:158,377,393-395`; `mobile-bar.tsx:400`; `studio-drawer.tsx:309,359-405,577`; preferences `:433,:471`; the help heading; one empty-state component; ⌘K wrap.

### What stays deliberately different

The Document is a paper. Only the Desk has stage-coloured job Cards. The Build room keeps its white drafting stock and A15 stamps (V15 Q2). Money is a ledger. The board canvas is the designer's. Print stays print stock. The galley keeps its sheet. Auth and `(legal)` take the token pass only.

## (d) The Desk

D3 is the build spec; this condenses it. Build from `review/d3-desk-build.md`; where they differ, this section wins.

**The tree.** `DeskPage` (`app/(document)/desk/page.tsx`): the Header line; `hr.doc-rule-strong`; **Today** (`DaySheet`), at most five `DeskJobCard`s holding `SheetLine`s; Today's closing `--rule-mid`; the **ledger** (`DeskRoster`) of `DeskLedgerRow`s; then `RecentBoardsStrip`, `DeskBoardsReactionRollup` and `DeskContents`, unchanged. New files: `components/document/desk-job-card.tsx`; `acts/set-aside-sheet.tsx` ⟦U-Q5⟧; a `record-payment` act kind ⟦U-Q6⟧.

- **Header.** One baseline row; "Record an inquiry" goes from primary (`page.tsx:486`) to secondary; the date moves into Today's eyebrow ⟦U-Q3⟧.
- **DaySheet** drops `jobs`, takes `cards`. The eyebrow "MONDAY 12 OCTOBER · TODAY" with Mine · The studio's on its baseline. Awaiting, Coming back and `THE_REST` move to the ledger; test ids stay.
- **DeskJobCard** is the Card component as an `<article data-stage>` (holder word always printed in the studio's scope; freshness from `timeWord`, `day-sheet.ts:176`), on 1 px `--card-edge` ⟦U-Q1⟧. Six `[data-stage]` rules map `--stage-tab` and `--stage-wash-still` from `--tab-*` and `--wash-*-still`; Care borrows install.
- **SheetLine** keeps its handlers. Only the overdue clause (`desk-roster-derivation.ts:509`) takes `--terracotta-ink` ⟦U-Q10⟧. Settled, it drops its foot and prints muted; someone else's prints "The move is Jordan's." with no act.
- **DeskRoster** takes `{ ledger }`. Retired: `deriveDeskClaims`, "Studio workload", "By team member" (the studio's scope regroups by person), "The work is in motion."
- **DeskLedgerRow:** the five-cell row plus the 2 px tick; an `others` row prints "waiting on {who} since {day}", a `back` row "Back {day}", neither with an act; a row settled today prints muted, in place.
- **No filled act on the Desk.** `e2e/document/action-visibility.spec.ts:156,255-259` change accordingly.

**Data changes** (only the last needs a migration):

1. `groupSheetByJob(lines, rosterJobs): SheetCard[]` in `lib/document/day-sheet.ts`, keyed on `project_id ?? engagement_id`, cards by first line's rank, a hand-off first within a card, stage from the full roster map.
2. `deriveDeskLedger` replaces `custodyGroups` (`desk-roster-derivation.ts:707-730`): **a job in Today never appears in the ledger, in any scope** (triage R1); the drop runs before the by-person regrouping.
3. **Settled lines stay until the next morning** ⟦U-Q2⟧ ⟦U-Q11⟧. `use-need-states.ts:52` selects `updated_at`; a line is settled today if its `actedAt` is today, or its `deferredUntil` / `setAsideUntil` is set and `updatedAt` is today. Undo calls `set_need_state(…, 'clear')` (`supabase/migrations/00765_studio_need_states.sql:132-135`). No migration: the column, policy and grant exist.
4. Deferred and set-aside lines feed Coming back; a line settled today stays on its line.
5. **One meaning of "with others":** the studio owes no act (the need was acted on before today, or the job has no open need but carries a motion chip). A silent overdue invoice or PO with an act owed stays yours. A ledger row prints the job's first open need from the same ranked list, so Today and the ledger agree.
6. `deskJobName(row)`: a lead takes the person's name (F7).
7. A draft saved for the lead marks the need `acted`: "Drafted for Leah · she sees this first".
8. ⟦U-Q4⟧ A teammate's acted state: policy `studio_need_states_select_studio` `FOR SELECT USING (public.is_active_org_member(organization_id))`; the hook selects `user_id` and splits own from teammates' (the primary key is `(user_id, need_key)`). Copy is a fact only: "Jordan drafted this for you · 9:30". Its own frontier review.

### The x4 / x6 inconsistency, resolved

US-26 SPEC §2.2 x4 (11:21) showed Today holding only Thornfield and Ainsley Moore: the morning's settled lines had left, and Thornfield, ranked beyond five at 8:40, had refilled a freed slot. Both break revised Q6. x6 put seven settled lines on six cards, against V18 Q1's five.

**The rule.** Today is the **top five of one ranked list** of open needs and needs settled today. Settling never changes rank, so **no slot ever refills.** A newly arrived need that outranks a line enters Today (M7), and the displaced line moves to the ledger with its state. Needs past five live in Also yours and settle in place there. **Today never shows more than five lines.** A slot frees only when a need is resolved at its source (an invoice paid, a project opened), because then it no longer exists.

- **x4 at 11:21:** the morning's four cards and five settled lines (Holloway 8:42 and 8:47, Linden 9:05, Pell Court 9:12, Ines Calder 9:20) under "Today's lines are handled. What can wait is below." Then the visit line "Ainsley Moore recorded · just now · Open the brief" ⟦U-Q7⟧, then **Also yours** with Ainsley Moore and Thornfield **as rows**. Ainsley, a class-2 inquiry arriving after Ines, does not outrank the fifth line.
- **x6 at 5:50 pm:** the same five settled lines under "Nothing more needs you today."; Also yours with two muted settled rows ("Replied · waiting on Ainsley Moore since 2:40 pm"; "Not today · 4:15 pm · back Tuesday 13 October" with Undo); With others and Coming back as US-26 had them. Thornfield joins Coming back the next morning only across a weekend; on Tuesday it is open again.
- **Redraw** a4, a6 and a12 (US-26 numbering) as this uplift's specimens `frame-desk-p4`, `frame-desk-p6` and `frame-desk-p8` (`specimens/SPEC.md` §2.2).

### States, access and arrival

D3 §(c) and §(e) give every state's copy; build them as written. Settled lines read "{what} · waiting on {who} since {h:mm}", never a ✓, count or "cleared"; no quiet head prints while a feed is unread. At 390 the header is two rows (greeting with Find; then ＋ Inquiry and ＋ Project) so focus order equals visual order. New 44 px targets: the ledger name link, the Show fold, Undo. After an act, focus moves to the settled line with one polite status. The arrival's `data-part="head settle"` moves to the eyebrow's date and card 1 carries the tokens, so `e2e/arrival/play-desk.spec.ts:51-52` stands.

## (e) House-sheet amendments

Against `docs/design/house-sheet/SPEC.md` (1,243 lines at `152eb9646`, unchanged since `a91a98107`). Apply in one docs commit inside S1. Each is marked *(amended §G-n)*. G-1 depends on U-Q1, G-2 on U-Q12, G-11 and G-13 on U-Q13; the rest on nothing.

**G-1 · lines 55–56.** Replace
```
  /* — the one boundary grey (R144). A component boundary answers to 1.4.11's
       3:1, which no hairline reaches. Claim cards ONLY. — */
```
with
```
  /* — the one boundary grey (R144, amended §G-1). A component boundary answers to
       1.4.11's 3:1, which no hairline reaches. Every Card and sheet frame (§G);
       never a ledger row, never on --rail (2.62:1). — */
```

**G-2 · lines 74–76.** Replace
```
  /* — the one depth token. Permitted on a temporary sheet ONLY.
       None of the three specimens uses it. — */
  --elevation-sheet: 0 1px 2px rgba(44, 41, 38, .08);
```
with
```
  /* — no depth token. Depth is stock, edge and veil (amended §G-2, §G). — */
```
If U-Q12 is declined, keep the declaration and replace only the comment's first line with `/* — the one depth token. Permitted on the three R126 sites ONLY: margin chips, the open ledger sheet, the studio drawer.`

**G-3 · after line 86** (`--ease`), insert
```
  /* amended §G-3 */
  --paper-lift: #FFFFFF;  --veil: rgba(20, 18, 16, .55);
  --edge-stage: 3px;  --tick-stage: 2px;  --edge-note: 2px solid var(--oak);
```

**G-4 · after line 106** (`--sage-ink`), insert
```
    /* amended §G-4 */
    --paper-lift: #1C1A17;  --veil: rgba(0, 0, 0, .60);
    --tab-brief-edge: #7D9EC0;  --tab-discovery-edge: #5FA08F;  --tab-direction-edge: #73A374;
    --tab-proposal-edge: #A3A75C;  --tab-project-edge: #B98F5A;  --tab-install-edge: #CC7A70;
    --rule-hair: rgba(242, 237, 230, .14);  --rule-mid: #F2EDE6;  --rule-strong: #F2EDE6;
    --doc-ink-border: rgba(242, 237, 230, .22);
```

**G-5 · line 107.** Replace
```
    /* dark mode keeps the light plate values (amended §F-J) */
```
with
```
    /* a stage PLATE keeps its light value in dark (§F-J); a stage EDGE takes --tab-*-edge (amended §G-5) */
```

**G-6 · line 143.** Replace
```
| `.t-head` | meta | 11px / 1.50 | 500 | .08em | **UPPER** | running heads only |
```
with
```
| `.t-head` | meta | 12px / 16px | 500 | .08em | **UPPER** | running heads and every eyebrow *(amended §G-6)* |
```

**G-7 · after line 139** (`.t-d3`), insert
```
| `.t-d4` | display | 17px / 24px | 500 | 0 | sentence | a ledger-row name *(amended §G-7)* |
```
and on line 157 replace `Nothing else.` with `Nothing else. (\`.t-d4\` added §G-7.)`

**G-8 · line 166.** Replace
```
| Radius | `2px` (marks, small plates), `3px` (image plates, stage plates, the terminal act), `50%` (the 7px mark dot only) |
```
with
```
| Radius | `2px` (marks, small plates), `3px` (image plates, stage plates, the terminal act), `50%` (the 7px mark dot only); `2px` for every card, sheet, popover and modal frame, never 5px *(amended §G-8)* |
```

**G-9 · line 168.** Replace
```
| Shadows | **none.** `box-shadow` must not appear in any specimen file. |
```
with
```
| Shadows | **none, anywhere:** no specimen, stylesheet or component. Depth is the §G ladder. *(amended §G-9)* |
```

**G-10 · lines 513–514.** Replace
```
Room name at `.t-d3`, a floor line at full band width, one sentence. **Never a
rectangle.**
```
with
```
The Section's eyebrow, one sentence, and the Section's closing rule (§G).
**Never a rectangle, never dashed**, except that a Section of Cards which
empties keeps one card frame for its sentence (US-26 A). *(amended §G-10)*
```

**G-11 · lines 592–593.** Replace `no shadows · no pills · no status dots · no` + newline + `badges ·` with
```
no shadows · no pills · no status dots · no
badges · no state chips or coloured state edges on the reading paper (A15
stamps stay on the drafting stock) · no translucent sticky heads · no sheet
over a sheet *(amended §G-11)* ·
```

**G-12 · lines 1011–1012.** Replace `(the plate is the colour; the row stays on cream)` with
```
(the 3px card edge and the 2px row tick are the colour, V19; the row stays on
its stock) *(amended §G-12)*
```

**G-13 · after line 1243**, append
```
## §G · Card, section and depth (US-27, amended 2026-10)

The depth ladder, the seven components, the card test and colour-orients
rules of `artifacts/portal-uplift-2026-10-12/synthesis/uplift.md` (a)–(b), with
PR-v's state pigments reversed: state is an ink word portal-wide, and
terracotta-ink marks only an overdue, blocked or do-not-contact word.

Answers: US-27 BRIEF §4; V19.
```

## (f) Slices

**Every slice.** **Flag: none**, as Direction C's labelling shipped (V18); these are presentation changes on existing data. **Rollback:** revert the slice's commits and redeploy with `./infra/deploy-portal.sh designer` from the last-good commit (patina-deploy; `wrangler rollback` is undocumented in-repo); S5's migration rolls forward only. **Base gate:** `pnpm --filter @patina/designer-portal type-check`, the named `jest` suites, the named specs via `pnpm --filter @patina/designer-portal test:e2e <spec>` on local Supabase with the Hartwell seed, and visual checks at 1440 and 390 (no horizontal scroll, no computed `box-shadow` once U-Q12 rules, no ellipsis, hit boxes ≥ 44 px, forced colours, reduced motion, marks at rest). Each area ships its own 390 fixes.

| Slice | Scope and files | Gate beyond the base | Depends on |
|---|---|---|---|
| **S0 · Desk fix-now F1–F8** | F1 header (`desk/page.tsx:68-76,448-530,486`); F2 section edges (`globals.css:575-583,590-597,605,611,637`; `day-sheet.tsx:204,231-244,252,266`; `desk-roster.tsx:29-30,60,90-91`); F3 lone line link (`day-sheet.tsx:121-136`); F4 footer and quiet copy (`day-sheet.tsx:32,250,264,280`; `desk-ledger-row.tsx:20`; `day-sheet.ts:149`); F5 the same need twice (skip if S0 and S2 ship together); F6 Back keeps the place (`page.tsx:406-423`; `desk-ledger-row.tsx:22-25,51`, `sessionStorage` on history traversal only); F7 `deskJobName`; **F8 the dock wraps portal-wide** (`mobile/mobile-bar.tsx:367,386,400`; `studio-drawer.tsx:309,577`; TESTER above the dock, `tester/tester-widget.tsx:236-238`) | `desk/page.test.tsx`; `day-sheet.test.tsx`; `desk-ledger-row.test.tsx`; e2e `desk-claims`, `desk-error-state`, `action-visibility` | none |
| **S1 · System** | `globals.css`: the new tokens of (b); `.doc-elevated` dropped ⟦U-Q12⟧; the seven components as shared classes; one ink state map. `overlays/doc-sheet.tsx`: one stock, 2 px radius, wrap at `:158`, `--veil` at `:377`. `room-shell.tsx:138` opaque `--paper`, no blur. One empty-state component. Focus ring at `capture-sheet.tsx:88-99`. The unruled shadows (board room ×4, three modals, `MilestoneCard.module.css:5`). The house-sheet amendments (e) | `lib/document/__tests__/shadow-gate.test.ts`, `overlays/doc-sheet-elevation.test.ts`, `margin-item.test.tsx:44` updated to assert zero; a sample of ten `DocSheet` callers walked at both widths | U-Q1, U-Q12 |
| **S2 · Desk model** | §(d) data changes 1, 2, 5, 6, 7 (`day-sheet.ts`, `desk-roster-derivation.ts`, `desk-need-list.ts`, `desk-scope.ts`, `acts/act-draft.tsx`) | `lib/document/__tests__/day-sheet.test.ts`, `desk-roster-derivation.test.ts` | S0 |
| **S3 · Desk cards and ledger** | `desk-job-card.tsx` (new), `day-sheet.tsx`, `desk-roster.tsx`, `desk-ledger-row.tsx`, `globals.css` grid; change 3 settled-in-place (`packages/supabase/src/hooks/use-need-states.ts`) | the above, `packages/supabase` `mapNeedStateRows`; e2e `desk-claims` (`:77-119,121-140,142-181`), `arrival/play-desk` unchanged as the `head` regression, `wp3-screenshots` refreshed | S1, S2; U-Q2, U-Q3, U-Q10, U-Q11 |
| **S4 · Desk acting** | `acts/set-aside-sheet.tsx` ⟦U-Q5⟧; the `record-payment` kind (`acts/act-sheet-kind.ts:38`, `useRecordPayment`) ⟦U-Q6⟧; `overlays/capture-lead-sheet.tsx:129-130` closes onto the Desk ⟦U-Q7⟧ | act tests; Record $3,400 writes through the existing writer and RLS | S3 |
| **S5 · Desk studio scope** | change 8, a new migration (next free number, reserved) and the hook split ⟦U-Q4⟧ | SQL tests for the policy; its own `review-audit-frontier` review; `supabase db push` only on a ship request | S3; U-Q4 yes |
| **S6 · Chrome (9)** | ⌘K, Keys, preferences, help, the popover, the Header line on help and preferences | e2e on ⌘K wrap; preferences check controls keyboard-operable | S1 |
| **S7 · Document (2)** | `region-rule.tsx` close weight; title rule ⟦U-Q14⟧; `lens-band.tsx:439` wrap ⟦U-Q19⟧; margin unclamp; hand-off note edge; rail words; pieces chips; spec book token pass ⟦U-Q18⟧ | `region/__tests__/region-rule.test.tsx` changed with intent; Document e2e | S1 |
| **S8 · Money (8)** | ink status map (`accounts-ledger-page.tsx:32-36`, `invoice-folio.tsx:67-71`, `orders-ledger.tsx:115-116`); folio in place ⟦U-Q16⟧; `.money-rows` close; procurement head; print act | accounts and folio tests; no second dialog in the DOM | S1, S4 |
| **S9 · Making papers (7)** | `compose-section.tsx:41-43,58`; client's copy; `rooms-in-scope.tsx:680`; ceremony; dashes; compose 390 | compose at 390 ≤ 390 px | S1 |
| **S10 · Rooms, People, Library (3/4/5)** | `room-card.tsx`, `room-plan-thumb.tsx`, `rooms-index.tsx`; People filters, state words, avatars, record page view; Library toolbar, plate and caption, piece page, search width | People and Library component tests; 390 search ≥ 240 px | S1; U-Q13 before People, U-Q15, U-Q20 |
| **S11 · Boards list (6)** | list Sections, plate and caption, the boards tab Cards | — | S1 |
| **S12 · Board room (6)** | `board-room-shell.tsx` header, toolbar, tags, 390 layout | 390 toolbar within the canvas | S11; U-Q17 |

## (g) Founder questions

Twenty, for one sitting; rule A first, because S1 waits on it. US-26 Q5–Q15 become U-Q1 to U-Q11 (source id in brackets); D1 G-Q1, D2 J1–J9 and one new question follow, deduplicated. This design assumes every recommended answer.

**A · Depth and edges**

| # | Question | Recommended | If declined |
|---|---|---|---|
| U-Q1 (Q5, J2) | May `--card-edge` box every Card and sheet frame, not only claim cards? | **Yes**, on `--paper-doc` faces only; never on rail or the Document's body. | Cards take `--doc-ink-border` (1.41, fails 1.4.11) or no box; G-1 is dropped. |
| U-Q12 (G-Q1, J3) | Retire the one ruled shadow (`--elevation-sheet`, on every `DocSheet`, the margin chips and the drawer)? | **Yes.** Veil and stock give 4.16:1; the shadow adds 1.16:1. | G-2's alternative; the token stays on three sites. The unruled shadows go either way. |
| U-Q9 (Q13) | Dark mode: documented, not shipped? | **Yes**, in the house sheet only (G-4). | A dark paper set is its own story. |
| U-Q20 (new) | Adopt the card test: a card only for a bounded, ranked set of things opened; unbounded image collections (Library results, the Boards index, judgments) as plate and caption? | **Yes.** It keeps the catalogue wall away. | Those three take Cards, six per Section, rows beneath. |

**B · Colour**

| # | Question | Recommended | If declined |
|---|---|---|---|
| U-Q13 (J1) | Extend V19's "colour orients, never grades" portal-wide? | **Yes.** State words go ink; terracotta-ink only on overdue, blocked or do-not-contact. Reverses PR-v. | Four areas keep grading hues; the rule holds on the Desk alone. |
| U-Q10 (Q14) | Does the 3 px rule ever mean urgency? | **No.** Stage only. | The rule takes the need class's colour. |
| U-Q14 (J5) | Put the job's stage on its paper as one 3 px title rule? | **Yes, once per page.** | Stage colour exists only on the Desk. |
| U-Q15 (J7) | Avatars: role pigment or ink initials? | **Ink initials.** Role is already a word. (D2 recommended pigment.) | Role-coloured discs stay. |
| U-Q8 (Q12) | Give each project its own colour? | **No.** | Direction C's migration, out of scope here. |

**C · The Desk**

| # | Question | Recommended | If declined |
|---|---|---|---|
| U-Q2 (Q6) | Settled lines stay in place and slots never refill? | **Yes**, with Undo; the (d) rule. | Slots refill (`day-sheet.ts:158`); no Undo. |
| U-Q3 (Q7) | Keep both creates in the header; date moves to the eyebrow? | **Yes.** | Create a project file moves to ⌘K and Desk Contents. |
| U-Q4 (Q8) | Let the studio scope see a teammate's acted state (migration + RLS)? | **Yes**, facts only, S5. | Jordan's acted lines read open in the studio's scope. |
| U-Q5 (Q9) | Give Set aside its own door? | **Yes**, `SetAsideSheet`, date and reason required. | Coming back holds deferred lines only. |
| U-Q6 (Q10) | Record the payment as a scoped one-invoice sheet? | **Yes**, "Record $3,400", existing writer. | The act opens the whole ledger. |
| U-Q7 (Q11) | Record an inquiry closes onto the Desk with a visit line? | **Yes.** | It navigates to the brief; no visit line. |
| U-Q11 (Q15) | Show what moved today in place, across reloads? | **Yes**, from the state rows. | Settled lines live in memory for the visit only. |

**D · Areas**

| # | Question | Recommended | If declined |
|---|---|---|---|
| U-Q16 (J4) | The invoice folio replaces Accounts inside one sheet? | **Yes**, with "← Accounts". | Three layers stay; rows bleed through at 390. |
| U-Q17 (J6) | Bring the board room into the house system? | **The chrome yes, the canvas never**, as its own late slice. | It stays a third design system. |
| U-Q18 (J8) | The spec book: token pass now, or a full uplift? | **Token pass, wrapping and 390 fixes now**; folding it into the Build room is its own story. | Adds about an M to S7. |
| U-Q19 (J9) | Let the Document's NEXT band wrap past 56 px at 390? | **Yes**, a second line; the act stays scored. | `LINE_CLIP` keeps breaking wrap-never-truncate. |
