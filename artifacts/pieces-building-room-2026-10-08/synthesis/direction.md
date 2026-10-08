# Building a Job's Pieces: synthesis and direction

**8 October 2026 · Synthesis (Fable 5.1) of R1 (Opus 5.5), R2 (Fable 5.1) and R3 (GPT-6 Sol)**

**Inputs:**
- `BRIEF.md` and `TRANSCRIPT.md`
- `briefing/current-state.md` (23 recon bullets verified, 21 confirmed outright)
- `walk/WALK.md` and its 24 screenshots (8 of 12 steps trustworthy; steps 8–11 and the 390 captures are not)
- `review/r1-opus.md`, `review/r2-fable.md`, `review/r3-sol.md`

**Weighting.** R1 and R2 checked the code; R3 was produced single-shot through the gateway with no code access and cites `file:line` through the briefing. Where R3 agrees with R1 or R2 it counts as a third voice. Where it stands alone, it is a question, not evidence. Design canon is waived; every departure is a founder question in §6.

## 1. The thesis

> "The underpinnings are all there… but it's not building the function. It's only presenting you with the function that you need at each step that is missing." (`TRANSCRIPT.md:57`)

Leah is right about the second half and wrong about the first. The surface shows the buyer's instrument on every line from the moment a name is typed: a `SPECIFIED` stamp, twelve acts in the unfold, and "BILL 4 UNINVOICED LINES" over four names at $0 (`walk/step2-living-room-after-4-lines-1440.jpg`, `walk/step3-line-unfold-1440.jpg`). So neither she nor a first hire can see what to do now. But four of her eight asks have nothing under them: a floor in four rooms, labor on the wallpaper, a price per square foot, and removing a mistake (R2 F2). The direction is two moves, shipped in one order. First the missing primitives: placements, a unit, a labor line, a need label that survives the fill, a derived stage, and restore. Then a working surface for building, the **Build room**, where *what she is doing* (a lens: Rough in · Spec · Price · Release) chooses the acts on screen, and *where each line is* (a stage word derived from facts the row already carries) chooses what that line can do. The Document's Pieces region becomes the overview she asked for: "this project sheet should be more of an overview and there are specific screens you go into" (`:57`). "Add a line, add a line, add a line" (`:61`) stays exactly as she likes it, and stops closing.

## 2. Agreement and split

### Where the three agree

Each row's claim was made by all three. Severity is the highest any reviewer gave it.

| # | Finding | R1 | R2 | R3 | Sev |
|---|---|---|---|---|---|
| A1 | **A name-only line is stamped SPECIFIED** while the head counts it "unspecified" and the spec book calls it INCOMPLETE. `stamp-derivation.ts:140-143` never reads `product_id`. | F1, F2 | F1 | R3-1 | S1 |
| A2 | **Clicking a line opens the buyer's desk.** Six cells, Submittals, Samples, Bill, "Something's wrong…": 12–13 acts on a line that is only a name (`line-unfold.tsx:218-253,346-428`). | F6, F7 | F3 | R3-2, R3-8 | S2 |
| A3 | **"Add a line" closes after every save**; Enter does nothing (`add-line-sheet.tsx:89-90`, no `<form>`). | F11 | F6 | R3-7 | S2 |
| A4 | **Two buttons say "Add a line."** The dark one opens eleven roads; the room one opens three fields (`ffe-section.tsx:1875` vs `:874-884`). | F13 | F4 | R3-4 | S2 |
| A5 | **"Not in a room yet" lines are saved as Throughout** (`add-line-sheet.tsx:62` vs `ffe-section.tsx:2683`); three labels for one state. | F12 | F14 | R3-5 | S2 |
| A6 | **Filling a placeholder destroys its intent.** `name = v_product.name`, unconditional (`00435:194-196`). | F19 | F7 | R3-9 | S2 |
| A7 | **No line can be removed from the UI.** `archive_project_selection` has no caller (`use-project-ffe-ga.ts:248`). | F29 | F2 | R3-3 | S1 |
| A8 | **One room per line is a data-model gap.** `CHECK` at `00434:246-250`; the walk made four oak-floor rows (`walk/project-1440-full.jpg`). | F16, F18 | F2, F13 | S2 table | S2 |
| A9 | **No unit of measure and no labor on a line.** `quantity INTEGER` (`00066:267`); Trade Scope has no FK to lines (`00423:144-210`). | F26, F27 | F2 | S4 table | S2 |
| A10 | **Spec, room and fill live on three surfaces**: the spec-book route, the unfold's select, LineCard's select. | F8 | F5 | R3-6 | S2 |
| A11 | **The time hold drops on any Document sub-route** (`document-time-provider.tsx:916-925`; no `doc/[id]/layout.tsx`). The walk did not reproduce the popup; Leah did (`TRANSCRIPT.md:33`). | F9 | F5 | R3-10 | S2 |
| A12 | **Nothing on screen names the mode.** "Lens" is five code concepts; the page is one weight on one stock. "So soft and so beige… where am I?" | F15 | F10, F12 | R3-8 | S2 |
| A13 | **Drag between rooms is deferred** (DECISIONS I25) and the only move is three clicks inside the unfold. | F17 | F13 | S6 table | S3 |
| A14 | **Building pieces wants its own working surface, with the Document as the overview.** R1 leaves route-versus-lens open; R2 and R3 choose a route. | §7 | §3 | §6 | — |

### Where they split, and the ruling

| Split | R1 | R2 | R3 | Ruling and reason |
|---|---|---|---|---|
| **What "stage" means** | One derived stage per **line** (Outline → Roughed → Specified → Ready → Approved → Ordered → Arriving), computed from facts; it drives every word and act (§2, D1). | Five work-process stages for the **sheet** (Rough in · Spec · Price · Present · Release), chosen by the designer; line stamps follow. | Four modes (Outline · Fill details · Review · Buying); warns against one mandatory stage for the whole project. | **Both, as two devices.** A **lens** is what she is doing; she picks it; it filters acts. A **stage** is where a line is; it is derived (R1 D1); it filters what that line can do. A line at any stage can sit under any lens, which answers R3's warning. Lens names: Rough in · Spec · Price · Release (R2's Present folds into Release, where disposition is set). Stage words before an order: Placeholder · Roughed · Specced · Ready · Released; after, the goods words as today. |
| **Where the fill lives** | `need_label` on `project_ffe_selection_threads`; `name` keeps becoming the product name, because a PO must carry the product. | Stop overwriting `name` (fix-now #7). | Keep an editable "What we need" beside the linked product. | **R1.** The need identity already exists and survives supersede (`00661:425`); a PO reading "Hardware, 2 knobs" is wrong. Both strings print on the line (R3's shape). |
| **Catalog delete** | **Do not wire** `DeleteProductDialog`: REST `DELETE /products/:id` with no service behind it, `withMockData` reports success on failure (`mock-data.ts:14-38`), and a real delete un-fills live lines via `ON DELETE SET NULL` (F30). Merge instead. | Wire the existing dialog (fix-now #2). | Permission-aware removal. | **R1.** R2's fix-now would ship a button that lies or corrupts. `merge_studio_product` on the existing `merged_into_id`/`deleted_at` (`00152:55-56`); narrow `products_studio_delete`. |
| **Multi-room shape** | Join table, `project_room_id` kept as the primary; money stays on one row, so unaware consumers show less but never double (§3a). | Join table; "throughout" becomes "every room". | One shared spec, explicit placements with per-room area. | **R1's shape, R3's area.** `project_ffe_placements(ffe_item_id, project_room_id, quantity, area_note)`; primary room kept so the `CHECK` and 33 consumers degrade safely. `throughout` stays a scope in data; the Build room never defaults to it. |
| **Labor** | Child line with `line_kind='labor'`, **after** adding `link_kind`, because `com-slot.tsx:46` reads any parent as COM fabric (F28). | Line kind labor on `parent_ffe_item_id`. | "Needs a defined relationship to its material and to Trade Scope." | **R1.** `link_kind` and the COM filters ship in the same release, or an install line prints as fabric on the order paper. Trade Scope draws labor lines in later. |
| **The spec book** | Stays the issue-and-preflight instrument; the Build drawer edits on the same route. | Absorbed into the sheet as the Spec stage (Q3). | Link to the Spec Book only for publication work. | **R1 and R3.** The Build room's Spec lens writes the same `project_ffe_specs` rows; Preflight, Audience preview and Revisions stay where they are. `contracts.md` is "frozen for the pilot" and need not thaw for this. Revisit after slice 3 (Q6). |
| **Money during rough-in** | A "Rough $" column in the entry grid, written as an allowance (F23, D12). | No money in Rough in or Spec for any seat (Q7). | Planning prices "clearly marked as planning figures". | **R1's column, R3's marking.** Leah asked for "the price in general… just so I can get my pricing lined up" in the same pass (`TRANSCRIPT.md:16`). Rough $ is an allowance, printed `~$4,800`, never a trade cost. Trade cost, markup and client price exist only in the Price lens, where R1's seat rule governs. Kept as Q7. |
| **Components (the shower)** | An outline **group** with no money, not a parent line (every money consumer would have to exclude a header). | Not addressed. | Not addressed. | **R1.** `project_line_groups` + `line_group_id`; Tab indents. Slice 4, since the walk had no shower. |
| **Allowance fill after signing** | Both doors refuse today (F22); add a guard branch for ≤ ceiling. | Not addressed. | Planning prices must not bypass approved client price. | **R1, as a founder question (Q12)** tied to US-19's Record a change. |

**Unique catches worth carrying:** the Bill filter excludes only `NULL`, and the column defaults to 0, so $0 names are "uninvoiced" (R1 F4); `$0` should print "Not priced" (R1 F3); the empty-state sentence "Everything ordered is moving" is a vacuous truth (R2 F11); the Library picker rendered no cards and "STUDIO · 0" may explain it (R2 F15, open); supersede writes `notes = NULL` and a fresh empty spec row, orphaning COM children (R1 F21).

## 3. Three directions

All three share one data-model delta (§3.4), because the four missing primitives are gaps in the row, not in the surface. They differ in **where** building happens and **what answers "where am I"**.

### Direction A: The Build room — RECOMMENDED

**The idea.** A working sheet for a job's pieces at `/doc/[id]/pieces`, a sibling of the spec book, opened from the Document and closed back to it. A standing head names the job and the lens. The Document's Pieces region shrinks to an overview: one row per room with counts and a door in. The rule is one sentence: **beige is reading, white is working.**

**Screens and modes.**

| Mode | Shows | Hides |
|---|---|---|
| **The overview** (the Document's Pieces region) | Job total as front matter; one row per room: name · N lines · N placeholders · N specced · rough total · N released; acts `WORK THE PIECES →`, per room `ADD A LINE` (the quick sheet, kept) and `WORK THIS ROOM →`; `RELEASE FOR AUTHORIZATION`; `RECORD A CHANGE`. A room row unfolds to its lines; a released line unfolds to the buyer's instrument as today. | Tasks, the folio preamble, "Build the FF&E schedule", `ADD A CONCEPT RENDER` per room, Bill on unpriced lines, the eleven roads. |
| **Head** (every lens) | `← Whole Home Renovation` · `BUILD THE PIECES` · `Rough in · Spec · Price · Release` with the active lens in full ink and a 2px rule · `Living Room · 6 lines · 4 placeholders`. Esc and browser back land on the overview scrolled to the room you left. | Nothing else. It never recedes. |
| **Room rail** (left) | Every room with its count; the active room in ink with a 3px bar; `Not in a room yet`; `Removed · 1`. | — |
| **Rough in** | Per room, a table: Line · Qty · Unit · Rough $ · stage. The last row is empty with the cursor in it. Enter adds the line and starts the next in the same room. Tab moves across. Paste makes N lines with a preview. `/` searches the Library inline. Tab at the start of a name indents it into a group. A drag handle per row; `Move to room…` in the row menu. Backspace on an empty name or ⌘⌫ removes with a 10-second undo. The room's folio (the elevation) opens as a pane on the right. | Every buying cell, Bill, Release, the roads (behind `BRING IN…` on the Spec lens), spec fields, trade cost, client price. |
| **Spec** | Two panes: the room's lines on the left with stage and "3 of 6 fields"; the selected line's fields on the right: What we need (the need label) · Product or Maker (`FILL WITH A PRODUCT` opens inline search; `BRING IN…` opens the roads) · image drop · Finish · Material · Color · Dimensions · Exact location (default "see drawings") · Notes · Rooms (placement chips with per-room qty, `+ ROOM`) · Unit · `ADD LABOR` · COM. `NEXT UNFINISHED →`. | Money beyond the dim `~` rough figure; procurement; receiving. |
| **Price** | A table: Line · Qty · Unit · Trade cost · Markup · Client price · Rough `~` · variance; labor children indented `↳`; allowance vs fixed; room subtotals; job total as front matter. Edits write trade cost and client price. | Spec prose, images at scale, procurement cells. Seats without money per R1 see the lens absent. |
| **Release** | A table with one readiness column naming the blocker ("Needs a maker", "Needs a client price"); disposition per line (Candidate · Selected · Alternate → what the client sees); per room `READY FOR LEAH` (the first hire's hand-back; writes disposition, sends nothing); the ceremony `Release for authorization` as the filled act with its consequence sentence. | Everything the release will soft-lock, as editable. |

**S1–S8.** S1: four lines in about four Enters, no sheet, under twenty seconds by hand. S2: one oak-floor row with four placement chips carrying square feet; each room's table prints the row with "also in Hall · Dining · Kitchen". S3: `FILL WITH A PRODUCT` on the line; the need label prints above the product name; the shower is a group with six placeholder lines under it. S4: `ADD LABOR` under the wallpaper makes an indented labor line with its own unit and rough price; the oak floor is one custom line with `sq ft`, an image and three fields. S5: remove with undo before release, a reason after a client review, Record a change after approval; catalog duplicates merge. S6: drag a row onto a room heading, or `Move to room…`; Shift-click for several. S7: the head names the lens; the stage word names the line; `←`, Esc and back all return to the overview at the room; the hold lives on the layout so nothing pops. S8: a Finishes table per room (surface × product · sheen · swatch) and `PRINT THE PAINT AND FINISH SCHEDULE`; the wall swatch shows on the room row.

**Data-model delta.** §3.4, nothing beyond it.

**Cost.** Large. The room is four lenses, a keyboard table, a drawer, drag, and the overview rework on the Document; the primitives are a one-wave migration set. Roughly: fix-now in days; primitives two weeks; Rough in + Spec + overview three weeks; Price + Release two weeks.

**Risks.** A third place lines live if the overview keeps too much (mitigated: the overview is rooms, not lines, and a line before release always opens in the room). The lens header reads as tabs. A six-column Price table at 390 needs a stacked rendering. "Work this room" on a 50-room job needs the rail to scroll.

**Canon it breaks.** VISION §6 no tabs (the lens head; Q1). V9 P5 three stocks and "absence is silence" (white drafting stock, full ink, presence of "also in" chips and empty Unit cells; Q2). The stamp machine (new words; Q3). DECISIONS I25 (drag; Q8). The house-sheet tokens (Q2). VISION §6 no zones (a group heading inside a room; Q9).

### Direction B: Lenses on the paper

**The idea.** No new route. The Pieces region of the Document gains a lens strip in its head (`Rough in · Spec · Price · Release`, replacing `READ BY · ROOM · MAKER · NEXT ACT`), and the region's body re-renders by lens. Beige stays. The line's drawer unfolds in place with the fields, not the buying cells, until the line is released.

**Screens and modes.** One screen, four renderings of the region: Rough in is the inline table per room with the same keyboard rules as A; Spec unfolds the selected line in place with the fields (same list as A's right pane); Price is the table; Release is the table with readiness and the ceremony. The region head carries a 3px ink bar and full-ink lens names for contrast, but the page around it stays one weight on one stock. The spec book stays a route for issue work; the hold moves to a layout.

**S1–S8.** S1–S6 as A, inside the region. S7 partly: the lens names the mode, but the region sits mid-page between Schedule and Money in a 900px column, with the band, the letterhead and five other regions competing; "back to the overview" is a scroll, which is a strength and a weakness. S8 as A, a region of its own.

**Data-model delta.** §3.4.

**Cost.** Medium. No route, no overview rework, no rail. The Price table has to fit a 900px column.

**Risks.** The everything-at-once page is unchanged around the region, so "this tool has gotten so big" stands. Tabs inside the reading paper are a worse canon break than on a working sheet. The Price lens at six columns squeezes. The buyer's unfold and the builder's drawer on the same line need a rule for which opens (release decides).

**Canon it breaks.** VISION §6 no tabs, on the reading paper itself (harder to scope than A's Q1). V9 presence. The stamp machine. I25.

### Direction C: Room sheets, no lenses

**The idea.** Leah thinks in rooms and elevations, not in stages. The unit of work is the room. From the overview, `WORK THIS ROOM →` opens one room's sheet at `/doc/[id]/pieces/[roomId]` on white stock with a standing head `← Whole Home Renovation · LIVING ROOM · 6 lines` and previous/next-room acts. One table, one row per line, whose columns grow as the line grows: Name · Qty · Unit always; then product or maker and a spec summary; then rough `~` and price; then the stage word. Clicking a row opens a drawer with every field, grouped under Spec · Rooms · Price · Labor, with the groups beyond the line's stage folded. "Where am I" is answered by the room name. Release and the buying acts stay on the Document.

**S1–S8.** S1 as A. S2 as A (placement chips; the row appears on each room's sheet with "also in"). S3, S4 as A, in the drawer. S5, S6 as A, with "move to the next room" in the row menu since only one room is open. S7: the room is the place; what she can do is folded, not absent, which is R3's warning taken the other way. S8 as A. Pricing the whole job means visiting each room; there is no job-wide Price table.

**Data-model delta.** §3.4.

**Cost.** Medium. One sheet, one drawer, no lens machinery.

**Risks.** A wide all-columns row is the everything-at-once problem in miniature. A first hire sees prices during rough-in. No job-wide pricing or release pass. Two floors across four rooms are edited from any room's sheet, which is right, but the first hire may not know the edit reaches other rooms.

**Canon it breaks.** V9 P5 (white stock). The stamp machine. I25. VISION §6 no zones (the folded groups). No tab question, since there is no lens.

### 3.4 The data-model delta, shared

| # | Change | Risk | Touches | Size |
|---|---|---|---|---|
| D1 | Derived stage `ffe_line_stage(row)` (stable SQL) + `stamp-derivation.ts` mirror; `SPECIFIED` stops printing before an order; `$0` → "Not priced"; Bill excludes unpriced lines | None, read-only | `deriveLineStamp`, `ffe-section.tsx:1405,1862`, spec-book readiness labels | S |
| D2 | `project_ffe_selection_threads.need_label`, backfilled from the current name; fill and supersede leave it alone | Low, additive | `create_named_project_need`, `place_product_in_project_v2` (`00435:194-196`), Pieces, spec book, client selections | S |
| D3 | `project_ffe_items.unit text DEFAULT 'each'` CHECK `each, sq_ft, lin_ft, roll, yard, box, hour, lot`; quantity stays integer | Low | create/place RPCs, `00692:54` allow-list, `po-send`, spec-book render, `@patina/types` | S |
| D4 | `project_ffe_items.link_kind` (`com`, `labor`, `accessory`), backfill `'com'`; required iff `parent_ffe_item_id` set | Medium: `com-slot.tsx:46`, `com-piece.tsx:47-52` filter on kind **in the same release** | `link_ffe_pair` (`00702:108`), order paper, COM sheet | S |
| D5 | `project_ffe_items.line_kind` (`goods`, `labor`); PO creation skips labor unless the installer is the vendor | Medium | `create_purchase_order` (`00435:878`), release eligibility (00445), stamp | M |
| D7 | `project_ffe_placements(ffe_item_id, project_room_id, quantity, area_note, sort_order)`, unique per room; `project_room_id` stays primary; `set_line_placements` RPC; `line.quantity = sum(placements)` | Medium; unaware consumers show the primary room, never double money | Phase 1: Pieces render, spec-book chapters. Phase 2: `get_client_project_selections` (`00435:787`), authorization snapshot (`00423:1145`), `po-send` sidemark, room budgets; 33 files read `project_room_id` | L, phased |
| D8 | `restore_project_selection(id)`; relax the archive reason when never published or authorized | Low | `archive_project_selection` (`00435:521`) | S |
| D9 | Supersede carries designer-authored spec fields, notes, placements and children | Medium | `supersede_project_selection` (`00661:374-435`) | S |
| D6 | `project_line_groups` + `line_group_id` (outline components, no money) | Low | new `set_line_group`; Pieces and spec-book render | S–M |
| D10 | Allowance fill after signature when ≤ ceiling, variance recorded | Medium, commercial authority (Q12) | fill guard (`00447:256-269`) | M |
| D11 | `merge_studio_product` on `merged_into_id`/`deleted_at` (`00152:55-56`); narrow `products_studio_delete` (`00584:1270-1281`) to unreferenced products; retire the REST `useDeleteProduct` | Medium, RLS | Library and Piece-room acts; `duplicate-detection-panel.tsx:180` reused for suggestions | S–M |
| D12 | Rough $ at rough-in = allowance through existing request fields (`packages/types/src/ffe.ts:131-139`, `00447:219-241`) | None, UI only | the entry table | S |
| D13 | Batch need creation for paste (`batch_create_named_project_needs`, precedent `00435:336`) | Low | — | S |
| D14 | Time hold at `app/(document)/doc/[id]/layout.tsx` | Low, UI | `document-time-provider.tsx:916` | S |
| D15 | Image on outline and custom lines writes `project_ffe_specs.selected_media` (`00380:53`) | Low | existing spec write path | S |
| D16 | Palettes re-keyed from `proposal_id` to `project_id` + room (`00131:21-58`); `palette_swatches.role` already has wall/ceiling/trim/floor | Medium | new `project_palettes`; the painter's print | M |
| D17 | `quantity numeric(12,2)` for fractional yards | **High** (integer math in `00435:72`, `00445:59-63`, `received_quantity`, types) | many | L, **deferred** until a half-yard bites |

## 4. Fix-now track

Ship these on this job regardless of direction. Each is canon-safe, needs no migration unless marked, and is cited.

| # | Defect | Where | Fix | Source |
|---|---|---|---|---|
| 1 | Add-a-line closes after every save; Enter does nothing | `components/document/schedule/add-line-sheet.tsx:89-90` (`reset(); onClose();`), no `<form>`/`onKeyDown` in the file | Enter adds and clears, focus back to Line; Esc closes; a `DONE ADDING` act | R1 F11, R2 F6, R3-7 |
| 2 | "Not in a room yet" lines saved as Throughout; three labels for one state | `add-line-sheet.tsx:62` vs `ffe-section.tsx:2679-2684`; `line-unfold.tsx:368`; `line-card.tsx:505` | Pass `assignmentScope` explicitly, never a display string; one label, `Not in a room yet`, in all three places | briefing §7.1, R1 F12, R2 F14, R3-5 |
| 3 | Two buttons named "Add a line" | `ffe-section.tsx:1875` (eleven roads) vs `:882` (three fields) | The head's act reads `ADD TO THE JOB` (the sheet's own title, `add-to-project-sheet.tsx:35`); the room's stays `ADD A LINE` | briefing §7.5, R1 F13, R2 F4, R3-4|
| 4 | Name-only lines stamped SPECIFIED; head counts them "unspecified" | `lib/document/stamp-derivation.ts:140-143`; `ffe-section.tsx:1860-1864` | Stamp `PLACEHOLDER` when `product_id IS NULL` and no maker; the head reads "4 placeholders"; the lead act reads `FILL THE 4 PLACEHOLDERS` | R1 F1, R2 F1, R3-1 |
| 5 | `$0` on every rough line; Bill offered on unpriced names | `00066:268` (`unit_price_cents DEFAULT 0`); `ffe-section.tsx:1405-1410` (filter excludes only `NULL`) | Print "Not priced" for 0 with no product and no allowance; Bill excludes those lines | R1 F3, F4 |
| 6 | No way to remove a line | `line-unfold.tsx:386-428` act group; `useArchiveProjectSelection` `packages/supabase/src/hooks/use-project-ffe-ga.ts:248`; RPC needs a ≥5-char reason (`00435:530`) and refuses authorized/PO lines (`:531-539`) | `REMOVE THIS LINE` in the unfold, with a reason; the refusal sentence names Record a change after approval. Undo waits on D8 | R1 F29, R2 fix-now 2 (line half), R3-3 |
| 7 | Time hold drops on every sub-route | `hooks/document-time-provider.tsx:916-925`; no `app/(document)/doc/[id]/layout.tsx` (siblings `boards/`, `plans/`, `spec-book/`) | Add the layout and call `useHoldDocument` there (D14) | R1 F9, R2 F5, R3-10 |
| 8 | The spec book's way back loses your place; no room there | `spec-book-workspace.tsx:1095-1100` (back to `/doc/${projectId}`); the way in carries `?ffeItemId=` (`ffe-section.tsx:737`); no `project_room_id` write (`:821,841` read only) | Back lands on `/doc/${projectId}#line-${ffeItemId}`; a Room select in the editor via `useAssignLineRoom` (`use-document-rooms.ts:72-90`) | R1 F10, R2 fix-now 8 |
| 9 | "Something's wrong…" under a rough line files a damage exception | `components/document/buying/exception-overlay.tsx:150-160,803` (defaults to `'damage'`) | Hide it until the line is ordered | R1 F7 |
| 10 | Rough price has no home at rough-in | `packages/types/src/ffe.ts:131-139` already takes `itemType:'allowance'`, `budgetMaxCents`; `00447:219-241` validates with no phase gate | A `Rough $` field on the quick sheet writing an allowance; prints `~$4,800` (D12) | R1 F23, F24 correction to briefing §2c |
| 11 | "the FF&E schedule, by room", "Build the FF&E schedule", "selections" | `ffe-section.tsx:1847`, `:2550`; spec book "4 SELECTIONS" | Ship the `one-voice` flag (US-19); rename "selections" to "lines" in the spec book | R1 F5 |
| 12 | Vacuous empty-state sentence | "Everything ordered is moving." with zero lines (`walk/step1-project-1440.jpg`) | Silence, or "Nothing ordered yet." | R2 F11 |
| — | **Do not** wire `DeleteProductDialog`/`useDeleteProduct` | `hooks/use-products.ts:189-197`, `packages/api-client/src/clients/catalog.client.ts:40-41`, `lib/mock-data.ts:14-38`, `00066:261` | Wait for D11 | R1 F30 |

## 5. Slices

The order is chosen so Leah feels it on Whole Home Renovation, not on the next job.

| Slice | What ships | Needs | Why here |
|---|---|---|---|
| **0: Fix-now** (days) | §4 items 1–12 | No ruling except Q3 for the stamp word | Enter-add, remove, Placeholder, no popup: four of her complaints, this week |
| **1: The primitives** (one migration wave) | D1 stage, D2 need label, D3 unit, D4 link kind, D5 labor, D7 placements phase 1, D8 restore, D12 rough $, D13 paste, D14 hold, D15 image | Q4, Q5 | The oak floor becomes one line; the wallpaper gets its hanger; a mistake is undone. Without these the lenses present functions that still do not exist (R2 F2) |
| **2: The Build room, Rough in + Spec** | `/doc/[id]/pieces`, the head, the rail, the keyboard table, the drawer, drag and Move to room, the overview rows on the Document, fill-in-place from the line | Q1, Q2, Q8, Q14 | "Where am I" is answered; "add a line, add a line" has no sheet |
| **3: Price + Release** | The Price table, disposition in place, `READY FOR LEAH`, readiness with named blockers, the ceremony inside the room | Q7, Q13 | Her pricing pass and the first hire's hand-back |
| **4: The second wave** | D7 phase 2 (client selections, authorization snapshot, PO sidemark, budgets), D9 supersede carries, D6 groups, D10 allowance fill, D11 merge | Q9, Q11, Q12 | Each is correctness under the surface; none blocks her feeling the room |
| **5: Paint and finish schedule** | D16, the Finishes table, the print, the wall swatch on the room row | Q10 | Last: 3 of 4 on the feature test, and she said it need not live in Patina |

**Acceptance for every slice:** S1–S8 performed by someone who did not build the job, at 1440 and 390, with the step count, the time by hand for S1, one named refusal met, and the return path to the overview. Slice 2's gate includes a human mobile walk, since the automated one never reached Pieces.

## 6. Founder questions

Decide Q1, Q2, Q3 and Q4 first; the rest can follow slice 0.

| # | Question | Recommended answer |
|---|---|---|
| Q1 | **Is a lens head a tab bar?** VISION §6 refuses tabs anywhere in the Document; V7 scoped the iOS exception. | Rule it as V7 did: **a working sheet opened from the Document may carry a lens head; the reading paper may not.** The test: a lens that removes acts is a lens; a lens that duplicates content is a tab. Direction B fails this test; A passes. |
| Q2 | **May a working sheet use a third stock, white with full ink?** V9 P5 fixes three stocks; the house-sheet tokens bind type and contrast. | Yes. Name it the **drafting stock**, bind it to working sheets, keep the type families, radii and rhythm. The spec book already runs white; this makes it deliberate. |
| Q3 | **New stage words on the stamp:** Placeholder · Roughed · Specced · Ready · Released, derived (D1), before the goods words. | Yes. It fulfils F58 (one derivation, one word). "Placeholder" never reaches the client; the client page lists only lines with a set disposition. |
| Q4 | **One line in several rooms: a join table, with the primary room kept?** Touches R8 (editable until on a sent authorization) and the one-line-one-room assumption in authorization and PO. | Yes, R1 §3a. Placements lock at Released and change through Record a change. The authorized row stays one row with a room breakdown. |
| Q5 | **Is labor a line or Trade Scope?** | A line, attached to its piece with `link_kind='labor'`, released with it, billed on its own line (R-PB7). Trade Scope stays for lump-sum trades with their own agreement and can draw labor lines in. The first hire is taught the line. |
| Q6 | **Does the spec book survive as its own route?** `contracts.md` is frozen for the pilot. | Yes, for now. The Build room's Spec lens edits the same `project_ffe_specs` rows; Preflight, Audience preview and Revisions stay in the spec book. Revisit absorbing it after slice 3. |
| Q7 | **Who sees money in Rough in?** R1 says every studio seat sees margin by default. | Rough $ (an allowance, printed `~`) is visible to every seat in Rough in and Spec; trade cost, markup and client price exist only in Price, governed by R1. One-line amendment. |
| Q8 | **Reopen DECISIONS I25 (drag between rooms)?** | Yes, with `Move to room…` as the visible act for keyboard, touch and locked lines (R3); drag is the extra gesture. |
| Q9 | **A group heading inside a room** (the shower's components) is a new nesting level; VISION §6 refuses zones. | Yes: a heading with no money, no stage and no acts of its own. |
| Q10 | **Paint and finish schedule in Patina?** The feature test passes 3 of 4 (the stream is the floor, not margin). | In, minimally and last: a per-room Finishes table, one swatch, one print addressed to the painter. Nothing more until a second studio asks. Log the test as a V-entry. |
| Q11 | **Catalog duplicates: merge, never hard delete.** Narrow `products_studio_delete` to unreferenced products. | Yes. A hard delete un-fills live lines (`ON DELETE SET NULL`, `00066:261`). |
| Q12 | **May an allowance be filled after signing without voiding the authorization when the price is at or under the ceiling?** | Yes, recording the variance; over the ceiling it is Record a change (US-19). Needs a one-line commercial-authority ruling. |
| Q13 | **`READY FOR LEAH`**, a per-room hand-back act for the first hire that writes `design_disposition` and sends nothing. | Yes. It is the only new act, and it uses the axis that was built and orphaned (R2 F8). |
| Q14 | **The Document's Pieces region becomes per-room overview rows; the buyer's unfold opens only for released lines.** | Yes. Rooms, not lines, are the overview; before release a line opens in the Build room; after release it unfolds on the paper as US-16 built it. |
| Q15 | **"The studio won't notice Patina" (§4) and a sheet she works in for an hour.** | No ruling needed: the promise is about not being summoned. Record the reading. |

## 7. Asks for Leah

- **Time her.** The four Living Room lines, by hand, in the Direction A mockup and then in today's product. The walk's automated 954 ms per line is a floor, not her time.
- **Her words**, so the lens head and the stamp print them: *placeholder* or *hold space* or *outline*; *rough price* or *allowance*; *Rough in · Spec · Price · Release*, or what she calls those passes.
- **The oak floor's quantity.** Square feet per room (Hall 120, Living 320…) or one total? Does the local supplier quote waste on top?
- **Labor's unit.** Is the wallpaper hanger priced per roll, per hour, or a lot? Same for the tile setter.
- **Who may remove.** Can the first hire remove a line she entered this week? Merge a catalog duplicate?
- **The duplicate she couldn't delete.** Which product, so merge is tested on the real pair.
- **A real elevation or SketchUp export** for one room, to seed the folio pane beside the table.
- **The painter's schedule.** Names only, or swatches? Does she want it in Patina at all, given "this does not have to live in Patina" (`TRANSCRIPT.md:63`)?
- **The first hire.** Who is closest to that seat today, for the S1–S8 walk on a job she did not build.
