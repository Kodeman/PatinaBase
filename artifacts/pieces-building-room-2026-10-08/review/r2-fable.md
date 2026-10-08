# R2 · Product, studio-workflow and vision review — should building pieces be its own room?

**Seat:** R2 (Fable 5.1) · **Story:** US-20 · **Date:** 8 October 2026 · **Ticket:** SQ-590
**Read:** `BRIEF.md`, `TRANSCRIPT.md` (twice), `briefing/current-state.md`, `walk/WALK.md` and every `walk/*.jpg` named below, `docs/vision/VISION.md`, `docs/vision/VISION-DECISIONS.md`. Not read, by instruction: `review/r1-*`, `review/r3-*` (neither exists in this worktree at the time of writing).
**Constraints:** design canon waived for proposals; every departure is named in §9.

## The shape in five lines

1. **Yes, building pieces gets its own working surface** — `/doc/[id]/pieces`, a full-width sheet opened from the Document and closed back to it, sibling of the spec book, whose line editor it absorbs. One place lines are worked; the Document's Pieces region becomes the overview Leah asked for.
2. **Five stages, one standing header:** Rough in · Spec · Price · Present · Release. The stage sets which columns and acts exist; everything else is absent, not folded. Buying (today's unfold) is the sixth stage and stays as built.
3. **Three primitives are missing and no lens fixes them:** one piece in several rooms, a labor line attached to a piece, and a unit with a per-unit price. They need migrations, and they ship before the lenses are worth having.
4. **Fix-now, canon-safe, this job:** Add-a-line stays open; a line can be removed; a placeholder is stamped *Placeholder*, not *Specified*; the time hold survives the spec book; the placeholder's name survives being filled; the two "Add a line" buttons get two names.
5. **Paint and finish schedule: in, minimally** — a per-room surface × finish table with a swatch, printed for the painter, built on the palette shape that already exists; last in the order.

---

## 1. Findings

Severity: S1 blocks the job · S2 costs real time or causes errors · S3 friction · S4 polish. Observation first, then interpretation.

### F1 · The only stage word on the screen measures the buyer's process, not hers — and contradicts itself. **S1 · high**
**Observation.** Every line is born `specified` (`00066:265-266`) and the stamp has no placeholder branch (`stamp-derivation.ts:104-144`). After four name-only lines, the section head reads **"4 unspecified"** and the lead act is **"SPEC THE 4 UNSPECIFIED →"**, while every one of those four lines carries a **SPECIFIED** stamp at $0 (`walk/step2-living-room-after-4-lines-1440.jpg`, `walk/step3-line-unfold-1440.jpg`). The `status` axis is "specified → quoted → approved → ordered → … → installed" (current-state §2a) and is inert until a line has a vendor and a PO.
**Interpretation.** The one word meant to tell Leah where a line is says two opposite things at once and neither is about her work. Her stages are rough-in, spec, price, present, release. The system's stages are the buyer's. This is the root of "where am I": the screen's clock runs on a process she has not started.

### F2 · "The underpinnings are all there" is not true for four of her eight asks. **S1 · high**
**Observation.** One piece in several rooms has no row shape (`00434:246-250`, a CHECK constraint; `walk/step6b-floor-four-rooms-1440.jpg` and `walk/project-1440-full.jpg` show four unrelated "White oak floor, satin Bona finish" rows). Labor cannot attach to a line (Trade Scope `00423` has no FK to `project_ffe_items`). There is no unit of measure (`quantity INTEGER`, `00066:267`; `walk/step7a-wallpaper-line-unfolded-1440.jpg` shows only Maker · Trade cost · ×1). Delete exists as an RPC nothing calls (`archive_project_selection`, zero UI consumers; `walk/step5b-sunroom-line-unfolded-1440.jpg` has no remove act).
**Interpretation.** Leah credits the system with more than it has, because the surface *looks* complete. A lens strategy alone leaves the oak floor as four lines and the wallpaper without its hanger. The lenses are the presentation fix; these are the function fix, and both are needed.

### F3 · A click on a placeholder opens the buyer's desk. **S2 · high**
**Observation.** Unfolding a bare line shows PIECE IN HAND, six cells (The buy · Quote · Order · Movement · Money out · Receiving), Submittals, Samples, SOMETHING'S WRONG…, a Room select, Folio, Bill · Add note · Fold, and "EDIT SPEC DETAILS →" outside the unfold (`walk/step3-line-unfold-1440.jpg`, `walk/step7a-wallpaper-line-unfolded-1440.jpg`; 12–13 acts per current-state §3). After four $0 placeholders the head also offers **"BILL 4 UNINVOICED LINES →"** (`walk/step2-living-room-after-4-lines-1440.jpg`).
**Interpretation.** Billing a line that has no product, maker or price is not a thing anyone does; offering it is the clearest proof that the surface shows every function regardless of step. The unfold is excellent for the buyer (US-16 built it for her) and wrong as the *only* thing a click does.

### F4 · Two buttons say "Add a line"; one is a 3-field sheet, the other is eleven roads. **S2 · high**
**Observation.** The filled dark **ADD A LINE** on the Pieces head opens "ADD TO THE JOB" with From the Library / Paste a link / From a photo / From a vendor's quote / Import a schedule / Bring in a deck / A custom piece / A find / A store buy / … (`walk/step8a-add-to-the-job-roads-1440.jpg`, `walk/step1-pieces-1440.jpg`). The per-room **ADD A LINE** opens Line · How many · COM (`walk/step2-add-line-sheet-open-1440.jpg`), the one surface Leah praised ("I like this: add a line", TRANSCRIPT.md:61).
**Interpretation.** The most prominent act on the region is the one she should not use while roughing in, and it carries the name of the one she should. A first hire will press the dark button.

### F5 · The spec book is a different building, and canon is already broken inside it. **S2 · high**
**Observation.** `/doc/[id]/spec-book` renders a white sheet, a top bar with **WORKBENCH · AUDIENCE PREVIEW · PREFLIGHT · REVISIONS** (tabs), a CHAPTERS rail, READINESS pills (all · incomplete · ready · unassigned · drift), dotted **INCOMPLETE** markers on every line, a filled brown "Save selection", and no room control (`walk/step4a-spec-book-opened-1440.jpg`, `walk/step4c-after-save-selection-1440.jpg`). Entering it unmounts the time hold and fires Log/Discard (`document-time-provider.tsx:916-925`; TRANSCRIPT.md:33 "Discard is what I put in"). Leaving is the global back link (TRANSCRIPT.md:37, "How do I get back to Project?").
**Interpretation.** Leah found the fields "super helpful" (TRANSCRIPT.md:35); what she hated was the seam. The spec book proves two things: a separate working sheet is acceptable to her, and the cost of a separate sheet is entirely in its seams (back, hold, room). It also shows that VISION §6's refusal of tabs and pills is already breached in the Document, silently — the brief's canon question is not hypothetical.

### F6 · Add-a-line closes after every save. **S2 · high**
**Observation.** Four lines took four open → fill → save → close round trips, `sheetStillOpenAfterSave: false` each time (`walk/WALK.md` step 2). The sheet footer says "It lands in Living Room as a candidate — nothing is released until you say so."
**Interpretation.** Her rhythm is "add a line, add a line, add a line, add a line" from an elevation (TRANSCRIPT.md:61). The sheet is right; its lifecycle is wrong. Enter should add and clear.

### F7 · Filling a placeholder destroys its intent. **S2 · high**
**Observation.** `place_product_in_project_v2` sets `name = v_product.name` unconditionally (`00435:194-196`). "Hardware, 2 knobs for custom cabinet" becomes the knob's catalog name.
**Interpretation.** The whole point of her outline-then-backfill method (TRANSCRIPT.md:49-51) is that the outline is the record of *why* this piece is here. The system treats the placeholder as scaffolding to throw away.

### F8 · The designer's own stage axis exists in the database and the surface ignores it. **S2 · medium**
**Observation.** `design_disposition` (candidate · selected · alternate · not_selected · superseded, `00434`) is set only at birth, never changed by any UI, ignored by the stamp, and `alternate` is read by nothing (current-state §2b, §7.6). The quick sheet hard-codes `candidate`.
**Interpretation.** The one axis that *is* her lifecycle (candidate → selected → presented → superseded) was built and then orphaned. The stage lenses should drive this axis, not invent a new one.

### F9 · The Pieces region is the middle third of a 5,000-pixel page, with three unrelated things before the first room. **S3 · high**
**Observation.** Above the rooms sit "Plan the project work" (tasks), "FOLIO + FILE", and "Build the FF&E schedule … OPEN THE SPEC BOOK" (`walk/step1-pieces-1440.jpg`); the subtitle still says "the FF&E schedule, by room" although US-18 retired the name. The full page is Client approvals → Schedule (with the three-template chooser still open) → Pieces → Money → Closing the book → The record (`walk/project-1440-full.jpg`). At 390px the rail is gone and Pieces sits below two regions and a bottom bar reading "IN THIS DOCUMENT · MORE" (`walk/pieces-list-390.jpg`).
**Interpretation.** "This tool has gotten so big" (TRANSCRIPT.md:55) is literally true of the page. A list she wants to work for an hour is sandwiched between regions she is not working. Every room's "ADD A CONCEPT RENDER" beside "ADD A LINE" doubles the acts in the list during rough-in.

### F10 · Nothing standing names the mode. **S3 · high**
**Observation.** "Lens" is five unrelated code concepts (current-state §1 row 23). The closest thing to a lens on screen is **READ BY · ROOM · MAKER · NEXT ACT**, 11px mono at the right edge (`walk/step2-living-room-after-4-lines-1440.jpg`). The left rail names regions (Pieces · 10 LINES) but not what she is doing to them.
**Interpretation.** A reading control that changes grouping is not a mode. There is no device that says "you are roughing in; these are your acts."

### F11 · The reading sentences say untrue things at the empty state. **S3 · medium**
**Observation.** With zero lines the lead sentence reads **"Everything ordered is moving."** with the act **RELEASE THE NEXT ROOM**, and the rail says "Closing the book · 1 CLOSED OUT" (`walk/step1-project-1440.jpg`). The right margin shows the placeholder copy "One client, one paper. The rail on the left says…".
**Interpretation.** On a page whose job is to tell her where she is, the first sentence is a vacuous truth (nothing is ordered, so everything ordered is moving). A new hire reads it literally. Medium confidence that the fixture explains "1 closed out"; high that the sentence is wrong.

### F12 · Visual hierarchy is one weight, one stock. **S3 · high**
**Observation.** Acts, labels, metadata and readings are all 11px mono small caps on beige; the rail is grey 13px on beige; room names are 15px italic serif; the only contrast on the page is the elected lead act and the brown "N unspecified" count (`walk/step1-pieces-1440.jpg`, `walk/step2-living-room-after-4-lines-1440.jpg`). The spec book then switches to white with pills.
**Interpretation.** "So soft and so beige: where am I" is an accurate description. Sameness was the design intent (one scale, one rhythm; absence is silence, V9 P5) and on the *reading* surface it works. On a surface you work for an hour it removes the cues a worker uses: which column am I in, which room is active, what mode is this.

### F13 · Room assignment is a select buried under six cells; "throughout" is being used because rooms were hard. **S3 · medium**
**Observation.** The only way to move a line is the unfold's Room `<select>` (`line-unfold.tsx:346-378`, `walk/step7a-…jpg`). Drag is deferred (DECISIONS I25). Leah: "I started my throughout and my oak floor is actually not throughout" (TRANSCRIPT.md:18).
**Interpretation.** She reached for "throughout" because assigning rooms was the expensive act. Make rooms cheap and "throughout" becomes rare.

### F14 · Three names for one unassigned state, and a misroute. **S4 · high**
**Observation.** "Unsorted" (sheet, LineCard), "Not in a room yet" (section), "Throughout" (what the line actually becomes) — `add-line-sheet.tsx:62` vs `ffe-section.tsx:2679-2684` (current-state §7.1).
**Interpretation.** Small, but it is exactly the kind of thing that makes a first hire distrust the list.

### F15 · The Library picker and catalog delete could not be verified. **S3 · low**
**Observation.** "From the Library" rendered no cards in 8 s; the Library read STUDIO · 0 / PATINA · 25 (`walk/WALK.md` steps 8, 10). Catalog delete is permitted by RLS and wired to nothing (current-state §1 row 16).
**Interpretation.** Leah's first sentence in the transcript is about a catalog duplicate she cannot remove. Treat the delete half as confirmed from code and the picker half as open.

---

## 2. Leah's diagnosis, tested

> "The underpinnings are all there… it's not building the function. It's only presenting you with the function that you need at each step that is missing."

**She is right about the presentation and wrong about the underpinnings.** The screen does show everything at every step (F3, F4, F9), and the one stage device it has is the buyer's (F1). But four of her asks have no function underneath (F2), and the designer's stage axis that does exist is orphaned (F8). The honest restatement: *the buyer's function is built and shown everywhere; the designer's function is half built and shown nowhere.*

Her work, as she described it and as the walk confirms, runs in these processes. Each has one job; what it must show and must hide follows from the job.

| Process | What she is doing | Must be visible and doable | Must be absent |
|---|---|---|---|
| **Rough in** | Walking elevations and the SketchUp model room by room; "add a line, add a line" (TRANSCRIPT.md:24, 42-47, 61). Outlining components ("I need this piece, I need this…", :51). | Room, line name, how many, placeholder stamp; Enter adds and clears; the room's elevation beside the list (per-room folio exists today); remove a line; move a line to a room; one piece into several rooms. | Prices, makers, stamps other than *Placeholder*, the 11-road sheet, Bill, Release, Order, concept renders, the spec fields. |
| **Spec** | Coming back to each line "to add all of the details for this line" (:61); finish/material/color/location/notes (:27-31); an image; filling a placeholder with a product; a custom thing with "a few editable fields" (:20). | The line's own fields inline; image; Library pick or link that *fills* the placeholder without renaming it; COM; a labor line under a piece; room still editable. | Procurement cells, money out, receiving, Bill. Cost may stay collapsed. |
| **Price** | "Just so I can get my pricing lined up" (:16); the oak floor by the square foot from a local guy (:20); labor as its own line (:16). | A table: qty · unit · trade cost · markup · client price · allowance vs fixed; room subtotals and a job total as front matter of the rows (V11). Edit cost and client price here. | Spec prose, images at scale, procurement cells. Money hidden from a seat R1 restricts. |
| **Present** | Choosing what the client sees and in what state (candidate / selected / alternate); what goes on the client page. | Disposition per line, client price only, image, room grouping, what is decided vs open. | Trade cost, maker, internal notes, placeholders that are not for the client. |
| **Release** | Releasing a room or a set of lines for authorization. | Readiness per line with the named blocker (needs a maker, needs a client price — the Order cell already says this), the release ceremony. | Everything editable that the release will soft-lock. |
| **Buy** (after release) | The buyer's process: quote, order, movement, receiving. | Today's unfold, as US-16 built it. | The design acts above. |
| **Paint and finish schedule** | A room-by-finish document that goes only to the painter (:63-65). | See §6. | Everything else; it is its own sheet. |

The test of "only the function you need" is the Release stage's Order cell today: it already says "Not selected yet · Needs a maker · Needs a client price" (`walk/step3-line-unfold-1440.jpg`). That is the right sentence, in the wrong stage.

---

## 3. Its own room, or lenses on the region? Both ways, then a decision

### The case for a dedicated room
- A working surface needs width and density a paper column cannot give: a rough-in table with a fixed room column, a pricing table with six numeric columns. The Pieces region sits in a 900px column mid-page (F9).
- The spec book already *is* a separate route, and Leah accepted it; her complaints were the seams, not the separation (F5). The Document rail already lists four rooms under "Filed with this job" (Plan room · Spec book · Boards · Call sheet), so a working room is established Patina shape, not a new one.
- A standing header can name the mode without fighting six other regions for the reader's eye (F10, F12).
- Leah asked for exactly this: "this project sheet should be more of an overview and there are specific screens you go into" (TRANSCRIPT.md:57).

### The case for lenses inside the existing region
- VISION §2: the studio "cannot afford a new system to learn". A room is a new place.
- The "how do I get back" cost is real and already paid once (F5). A second route risks a third place lines live: the region, the spec book, the room.
- The region already has a reading control ("Read by · room · maker · next act"), a room rail (Hall · Living Room · +5 more) and per-room acts; extending the reading to stages is the smaller change.
- VISION §5.1: one living document, no dashboards, no tabs. A room with a stage header looks like a tab bar.

### Decision: a dedicated working sheet that absorbs the spec book, with stage lenses inside it; the region becomes the overview

**The new-place cost is lower than the everything-at-once cost, and it is lower than it looks because the place already exists.** Leah has already learned "Spec book is where I edit the line". The proposal replaces that room rather than adding one: `/doc/[id]/pieces` absorbs the spec book's line editor as its Spec stage and keeps Preflight / Issue as acts of the Present stage. Net rooms: unchanged. Net places a line lives: one working sheet, one overview. That is fewer than today (region + unfold + spec book + LineCard).

The lens-only path fails on evidence, not taste: a six-column pricing table does not fit the paper column; the region would still sit between Schedule and Money for an hour of work; and the one surface Leah called "super helpful" is already outside the region.

**Getting in.** From the Document's Pieces overview, one act per room — **"Work this room →"** — and one on the region head — **"Work the pieces →"** — open the sheet at that room, in the stage she last used for this job. Per-room "Add a line" stays on the overview for the one-off line.

**Getting back.** A standing **"← Whole Home Renovation"** at the top-left of the sheet (the spec book already has this; keep it), Esc, and the browser back — all three land on the Pieces overview scrolled to the room she left. The time hold is mounted on the sheet's layout so nothing pops (fix-now #3). The sheet is a mode of the Document, and the URL says so.

**The project sheet as overview.** The Pieces region keeps its place in the Document and shrinks to what an overview is: per room, one row — room name · N lines · N placeholders · N priced · N released · room total — and above them the job total as front matter of those rows (V11's test). Three acts: Work the pieces, Add a line (per room), Release for authorization. The task list, folio and "Build the FF&E schedule" preamble leave the region (tasks to Schedule, folio to the room row). The per-line unfold stays available from the overview for the buyer, because US-16 built it there and the buyer's seat reads the Document, not the sheet — but a click on a line on the overview opens the line *in its current stage* on the sheet, and the unfold becomes the Buy stage's reading of that line.

---

## 4. "So soft and so beige: where am I?" — what the sheet does differently

Be concrete. These bind the working sheet only; the Document's reading paper is unchanged.

- **Stage header, standing.** A band at the top, 48px, that never recedes: `WHOLE HOME RENOVATION · PIECES` on the left, the five stages across the middle — **Rough in · Spec · Price · Present · Release** — the current one in ink with a 2px rule beneath, the others in 60% ink, each a target. On the right, the room rail's current room and the count ("Living Room · 5 lines · 4 placeholders"). This is a tab bar in all but name; §9 names the ruling.
- **A different stock, not a different building.** The sheet is a third paper: white, not beige (`--paper-sheet`), with ink at full black for body text. The rule is simple enough to teach in one sentence: *beige is reading, white is working.* The spec book's white was right; its pills and brown buttons were not. One type family, the same three radii, the house-sheet steps — the difference is stock and ink, nothing else.
- **Contrast where the hand is.** The active room's heading sits in ink with a 3px left bar; inactive rooms at 60%. The active row has a 1px ink outline, not a beige tint. Column headings in the sheet are 12px mono caps in ink, not 11px in grey.
- **Density by stage.** Rough in and Price are tables: 40px rows, fixed room column, keyboard moves row to row, Enter adds a line under the cursor's room. Spec is a two-pane: the room's lines left, one line's fields right (the spec book's layout, kept). Present is a card grid at client scale. Release is the table again, with one readiness column.
- **One mode indicator, in three places that agree.** The stage header (what I'm doing), the stamp on each line (where this line is: *Placeholder · Specced · Priced · Presented · Released · Ordered…*), and the overview row's counts. Kill "Specified" as the birth stamp; it means nothing at birth. Kill "N unspecified" vs "SPECIFIED" (F1).
- **Acts carry the stage.** A line in Rough in has exactly three acts: fill it (→ Spec), move it (room), remove it. The buyer's acts do not exist on this sheet until Release; they are not folded, they are absent.

---

## 5. The first hire, entering lines from Leah's elevations

She has the drawings, not the taste. She needs:

- **The elevation beside the list.** Per-room folio already exists (`FOLIO · + FILE` per room, `walk/step1-pieces-1440.jpg`); on the Rough in stage it opens as a pane next to the room's lines, so she reads the elevation and types. "Exact location: see drawings" becomes the default, not a thing she types (TRANSCRIPT.md:30).
- **One "Add a line", kept open.** Line name, how many, Enter. Never the eleven roads; the roads live behind one act on the Spec stage ("Fill from…"), not on the head (F4).
- **A stamp she can trust.** *Placeholder* until there is a product or a spec, so she can see what is done and Leah can see what is hers to check (F1; `walk/WALK.md` persona read).
- **Undo.** Remove a line, with the reason the RPC already requires (`00435:530`); move a line to the right room without opening six cells (F13).
- **No money.** Rough in and Spec show no cost or client price regardless of R1; she is not pricing, and a trade cost she guesses is worse than none (§8 Q7).
- **A way to hand it back.** One act on the room: **"Ready for Leah"** — sets the room's lines to a disposition Leah's Present stage lists first. This is the only new act; it uses `design_disposition` (F8) and sends nothing.

---

## 6. Paint and finish schedule — in, minimally

**In.** It passes the feature test on three of four: surface, The Document; moment, the first hire issuing trade documents while the studio doubles; promise, she won't notice (it prints and leaves). The stream is the subscription floor, not margin — paint is not a marketplace piece. That is enough for a small shape and not enough for a room.

**Shape.** Per room, a **Finishes** table, not a line list: surface (walls · ceiling · trim · doors · millwork · floor · hardware finish · other) × product/colour · sheen · note. One swatch per row (a hex or a photo). The room's wall swatch renders as the "visual note for everybody" on the room heading in the overview and on the client page (TRANSCRIPT.md:63). One act: **Print the paint and finish schedule** — a PDF of every room's table, nothing else on it, addressed to the painter. The existing `palette_swatches.role` enum already has wall/ceiling/trim/floor/metal/textile (`00131:51`); re-scope the palette tables from `proposal_id` to `project_id` and the shape is there. No ordering, no vendor, no pricing in v1; a paint line that is bought goes in Pieces like any store buy (R-PB7).

**Out.** Anything that depends on the project ("sometimes they get really complicated", :65) beyond rows in that table — she keeps her own document for those jobs, and the swatch still shows.

---

## 7. Sequencing — what ships first so Leah feels it on this job

**Fix now (canon-safe, no migration, days):**
1. Add-a-line stays open; Enter adds and clears; Esc closes (F6).
2. **Remove this line** in the unfold, wired to `useArchiveProjectSelection` with the reason prompt; **Delete** on the Library piece, wired to the existing dialog (F2, F15).
3. Mount the time hold on the spec-book layout (F5).
4. Stamp `product_id IS NULL` lines **Placeholder**; stop printing "N unspecified" against "SPECIFIED" (F1).
5. Rename the head's button **Add to the job**; per-room stays **Add a line** (F4).
6. Fix the Unsorted / Not in a room yet misroute and use one name (F14).
7. Stop overwriting `name` on placeholder fill (`00435:194-196`); the product's name shows through the join (F7).
8. A Room select on the spec-book editor, and "Save selection" returns to the line on the Document (F5).

**Next (migrations, one wave):**
9. **One piece, several rooms** — a `project_ffe_item_rooms` join with per-room quantity; "throughout" becomes "every room" as a convenience, not a scope (F2, S2).
10. **Labor on a piece** — a line kind `labor` with `parent_ffe_item_id` (00702 already carries parent linkage for COM pairs); billed on its own line per R-PB7 (F2, S4).
11. **Unit and per-unit price** — `unit` on the line (each · sq ft · lin ft · yd · roll · gal) and a price-per-unit; `custom_fields` as the stopgap if the column waits (F2, S4).
12. **Disposition editable in place** — the Present stage drives `design_disposition`; "Ready for Leah" (F8).

**Then (the sheet):**
13. `/doc/[id]/pieces` with the stage header, Rough in and Spec stages first (Spec absorbs the spec-book editor); the Pieces region becomes the overview.
14. Price, Present, Release stages.

**Last:**
15. Paint and finish schedule (§6).

Items 1–8 are what she feels on *this* job. Items 9–11 are what makes the oak floor one line. The sheet is where "where am I" is answered.

---

## 8. Founder questions

| # | Question | Recommended answer |
|---|---|---|
| Q1 | **Is a stage header a tab bar?** VISION §6 refuses tabs in The Document; V7 scoped the iOS exception. | Rule it as V7 did for iOS: **a working sheet opened from the Document may carry a stage header; the Document's reading paper may not.** Write the test the way V11 did: *a stage that removes acts is a lens; a stage that duplicates content is a tab.* Needs a V-ruling. |
| Q2 | **May the working sheet use a third stock — white, full ink?** V9 P5 fixes three paper stocks and "absence is silence". | Yes. Name it the drafting stock, bind it to working sheets only, and keep type, radii and rhythm from the house sheet. The spec book already runs white; this makes it deliberate. Needs a DECISIONS ruling amending the house-sheet SPEC. |
| Q3 | **Does the spec book survive as its own route?** | No — its line editor becomes the Spec stage; Preflight, Audience preview and Revisions become acts of Present. One fewer place. Needs a DECISIONS ruling (spec-books contracts are "frozen for the pilot"). |
| Q4 | **One line in several rooms: join table, or sibling lines?** Authorization and PO assume one line = one room. | Join table with per-room quantity, and the authorized row stays one row with a room breakdown. Sibling lines are the workaround she has today and they are the problem. Needs a ruling because it touches R8 (editable until on a sent authorization). |
| Q5 | **Is labor a line or Trade Scope?** | A line, attached to its piece, billed on its own line (R-PB7). Trade Scope stays for lump-sum trades with their own agreement. Needs a ruling: which one the first hire is taught. |
| Q6 | **Paint and finish schedule in Patina?** Stream is the floor, not margin. | In, as §6: a per-room table, a swatch, a print. Nothing more until a second studio asks. Log as a V-entry with the feature test answered. |
| Q7 | **Who sees money during rough-in?** R1 says everyone in the studio sees margin by default. | Rough in and Spec show no money for any seat; R1 governs the Price stage. This narrows R1 by stage, not by seat. Needs a one-line amendment. |
| Q8 | **Is "Placeholder" a client-visible word?** Changing the birth stamp changes what the client page may show. | A placeholder is never shown to the client; the Present stage lists only lines with a disposition the designer set. Confirm with Leah; it matches "something to hold space" (TRANSCRIPT.md:49). |
| Q9 | **Does "the studio won't notice Patina" (§4) permit a surface she works in for an hour?** | Yes — the promise is about not being summoned, not about never working. A sheet she opens on purpose, works, and closes is the Document "collecting information when and where you need it". No ruling needed; record the reading. |

---

## 9. Canon departures, named

| Proposal | What it breaks | Ruling needed |
|---|---|---|
| Standing stage header on `/doc/[id]/pieces` | VISION §6 "no tab bars anywhere in The Document" (V7, V9) | New V-ruling, scoped like V7: a working sheet may carry a stage lens; the test in Q1 |
| White drafting stock, full ink, 3px active bar, 1px row outline | V9 P5 house-sheet stocks and "absence is silence" | DECISIONS amendment to `docs/design/house-sheet/SPEC.md` (Q2) |
| Stamps *Placeholder · Specced · Priced · Presented · Released* | Stamp vocabulary derived from `status` (`stamp-derivation.ts`) | DECISIONS ruling on the stamp machine; no VISION conflict |
| Pieces region shrinks to per-room rows with totals | None — passes V11's front-matter test | None; record it |
| Spec book absorbed | `docs/design/spec-books/contracts.md` "frozen for the pilot" | DECISIONS ruling (Q3) |
| "Ready for Leah" act | None | None |
| Paint and finish schedule | VISION §8 feature test is 3 of 4 (stream is the floor) | V-entry logging the test (Q6) |

Nothing here touches the Pledge, pricing copy, the client page's authorship (V9 P1), or the refusal of engagement metrics. The one stage header and the one white sheet are the whole of the canon bill.
