# R1: interaction and data-model review of building a job's pieces

**Seat:** R1 (Opus 5.5) · **Story:** US-20 · **Date:** 8 October 2026 · **Ticket:** SQ-589
**Inputs read:** `BRIEF.md`, `TRANSCRIPT.md`, `briefing/current-state.md`, `walk/WALK.md` and the screenshots I cite below. I checked the claims against code on `main` @ `7ee6226eb`. I did not read the other seats' files.
**Paths:** Paths are under `apps/designer-portal/src/` unless they start with `supabase/`, `packages/` or `walk/`.

---

## 0. The short version

Leah's diagnosis holds up against the code. The data model already has most of the bones a building workflow needs: a need identity (`project_ffe_selection_threads`), placeholder fill, allowances in the RPC, a parent-line link, soft delete, supersede, and catalog merge columns. Two problems sit on top of that:

1. **The surface reads every line through the buying machine.** It stamps a line Specified the moment you type its name. It offers Bill, Order, Submittals and "Something's wrong" on a line that is only a name.
2. **Five specific places in the model lose or block intent:**
   - The placeholder name is overwritten when the placeholder is filled.
   - A line can sit in only one room.
   - There is no unit of measure.
   - There is no typed link between lines.
   - There is no undo.

The fix is a single derived **stage** that drives what each line shows, plus small additive migrations. No rebuild is needed.

---

## 1. Findings

Each finding gives the observation, then the interpretation. Severity: S1 blocks the job, S2 costs real time or causes errors, S3 friction, S4 polish. Confidence: H, M or L.

### A. Stage and vocabulary: "they're all specified"

**F1 · S2 · H. One state, four words.**
- **Observation.** A line you have only named is described four different ways:
  - The line stamp prints `SPECIFIED` (`walk/step3-line-unfold-1440.jpg`). `deriveLineStamp` falls through to `'specified'` for any default-status row and never looks at `product_id` (`lib/document/stamp-derivation.ts:140-143`).
  - The same section's head counts that line as **unspecified**: `!it.product_id` (`components/document/ffe-section.tsx:1860-1864`). It prints "10 unspecified" and "SPEC THE 10 UNSPECIFIED →" (`walk/step7b-floor-line-unfolded-1440.jpg`).
  - The sheet that created the line said it "lands … as a candidate" (`components/document/schedule/add-line-sheet.tsx:144`).
  - The spec book calls it "Not specified · INCOMPLETE" (`walk/step4b-spec-fields-filled-1440.jpg`).
- **Interpretation.** The paper contradicts itself on one screen, so neither Leah nor a first hire can trust any stage word. F58 ("one derivation, one word per state", `stamp-derivation.ts:147`) is violated across surfaces.

**F2 · S2 · H. A line has seven independent state axes and no composite.**
- **Observation.** The axes are `status`, `design_disposition`, `item_type`, `product_id` null or filled, `assignment_scope`, authorization or PO membership, and `removed_at` (`briefing/current-state.md` §2). There is a seventh I found: `project_ffe_specs.readiness_status`, which takes draft, incomplete, ready or blocked (`supabase/migrations/00380_spec_books_foundation.sql:63-64`). That is the spec book's INCOMPLETE.
- **Interpretation.** Nothing combines these into "where is this line in its life". The surface cannot show "only what is possible now" (S7) because "now" is never computed.

**F3 · S3 · H. Unpriced lines print `$0`.**
- **Observation.** Every rough-in line prints `$0` on its row (`walk/project-1440-full.jpg`, `walk/step3-line-unfold-1440.jpg`). The cause is that `unit_price_cents` defaults to 0, not NULL (`supabase/migrations/00066_proposal_project_flow_v2.sql:268`).
- **Interpretation.** `$0` reads as "priced at zero", not "not priced yet". That is the opposite of what Leah needs for "getting my pricing lined up".

**F4 · S2 · M-H. The section head offers to bill unpriced placeholders.**
- **Observation.** The head offers "BILL 10 UNINVOICED LINES →" when all 10 lines are $0 name-only candidates (`walk/step7b-floor-line-unfolded-1440.jpg`). The filter only excludes a NULL `unit_price_cents` (`ffe-section.tsx:1405-1410`), and the column defaults to 0.
- **Interpretation.** It is a money act on lines that are not yet real. It invites a $0 invoice and teaches the first hire that billing is part of rough-in. I did not click it.

**F5 · S4 · H. "FF&E schedule" still prints unless `one-voice` is on.**
- **Observation.** The head reads "the FF&E schedule, by room" (`walk/step2-add-line-sheet-open-1440.jpg`; `ffe-section.tsx:1847`), and the empty state reads "Build the FF&E schedule" (`ffe-section.tsx:2550`). The spec book calls lines "selections" ("4 SELECTIONS", `walk/step4b-spec-fields-filled-1440.jpg`).
- **Interpretation.** The same object is called a line, a piece and a selection. This is already fixed behind the undeployed `one-voice` flag, except for "selection".

### B. Clicking a line: procurement before anything else

**F6 · S2 · H. A name-only line unfolds into the buying instrument.**
- **Observation.** Unfolding a name-only line shows:
  - The buy, Quote and Order cells, with "Needs a maker · Needs a client price".
  - Submittals, "Record a submittal", Samples, "This piece takes COM".
  - Room select, folio, Bill, Add note, Fold.

  That is 12 or 13 acts (`walk/step3-line-unfold-1440.jpg`, `walk/step5b-sunroom-line-unfolded-1440.jpg`; `components/document/line-unfold.tsx:4-5,218-253,346-428`; count in `briefing/current-state.md` §3).
- **Interpretation.** This is the core of "I don't understand what you need to do when". The surface shows the end of a line's life at the moment it is born.

**F7 · S2 · M-H. "Something's wrong…" is the wrong door for a mistake.**
- **Observation.** "Something's wrong…" is the only destructive-looking link under a line (`walk/step5b-sunroom-line-unfolded-1440.jpg`). It opens `SomethingWrongSheet`, which raises a procurement exception and defaults to `'damage'` (`components/document/buying/exception-overlay.tsx:150-160,803`).
- **Interpretation.** Leah's own question was "What if you click on something and something's wrong?" (`TRANSCRIPT.md:11`). She means *I made a mistake*. The product means *the goods arrived broken*. A first hire who wants to delete a stray line will file a damage exception instead.

**F8 · S3 · H. Spec editing and room editing live on different routes.**
- **Observation.** Spec fields (Finish, Material, Color, Exact location, notes) live only in the spec book (`components/document/spec-books/spec-book-workspace.tsx:424-428`). The room lives only in the unfold's select (`line-unfold.tsx:346-378`). "Edit spec details →" is outside the unfold (`ffe-section.tsx:732-741`).
- **Interpretation.** Leah's step was "add Finish: painted … and put it in Living Room" (`TRANSCRIPT.md:27-35`). That one thought needs two surfaces and a page change.

**F9 · S2 · H. Every sub-route of the Document drops the time hold.**
- **Observation.** `useHoldDocument` is called only in `app/(document)/doc/[id]/page.tsx:1178`. There is **no `layout.tsx` under `doc/[id]/`** (sibling routes are `boards/`, `plans/` and `spec-book/`). Unmounting releases the hold (`hooks/document-time-provider.tsx:916-925`), and the Log / Discard strip appears.
- **Interpretation.** This is the pop-up Leah hit (`TRANSCRIPT.md:33`). It fires on boards and plans too, not only the spec book.

**F10 · S3 · H. The spec book's way back loses your place.**
- **Observation.** The spec book's back link goes to `/doc/${projectId}`, the top of the paper (`spec-book-workspace.tsx:1095-1100`). The way in carries `?ffeItemId=` (`ffe-section.tsx:737`).
- **Interpretation.** After saving a spec Leah lands at the Client approvals header, several screens above her Living Room, and asks "how do I get back to Project?" (`TRANSCRIPT.md:41`). The briefing's "no way back" is slightly wrong: the link exists (`walk/step4b-spec-fields-filled-1440.jpg`, top left). It is small and drops context.

### C. Rapid entry

**F11 · S2 · H. "Add a line" closes after every save.**
- **Observation.**
  - `save()` ends with `reset(); onClose();` (`add-line-sheet.tsx:89-90`).
  - The fields are not inside a `<form>` and there is no key handler (grep for `onSubmit`, `onKeyDown` and `<form` in that file: none). Enter does nothing. Only the name field autofocuses (`:112`).
  - The walk measured four full open → fill → save → close round trips (`walk/WALK.md` step 2).
- **Interpretation.** This is the one surface Leah likes ("I like this: add a line", `TRANSCRIPT.md:61`). It still breaks her rhythm on every line.

**F12 · S2 · H. The "Not in a room yet" group saves lines as Throughout.**
- **Observation.** The sheet tests `roomName === 'Unsorted'` (`add-line-sheet.tsx:62`), but the caller passes `'Not in a room yet'` (`ffe-section.tsx:2683`), so these lines are saved as `'throughout'`. A third label, `Unsorted`, appears in `line-unfold.tsx:368` and `schedule/line-card.tsx:505`.
- **Interpretation.** Leah said "I actually don't have throughout" (`TRANSCRIPT.md:18`). The product creates Throughout lines she never asked for.

**F13 · S3 · H. Two "Add a line" buttons open two different sheets.**
- **Observation.**
  - The section-head "Add a line" (`ffe-section.tsx:1875`) opens an 11-road chooser (`walk/step8a-add-to-the-job-roads-1440.jpg`; `schedule/add-to-project-sheet.tsx:87-119`).
  - The room-level "Add a line" (`ffe-section.tsx:874-884`) opens the 3-field sheet.
  - "Name a need" opens LineCard, which asks for maker, SKU, finish, dimensions, kind, place, design status and board (`walk/step11a-name-a-need-sheet-1440.jpg`).
- **Interpretation.** The more prominent button is the slow one.

**F14 · S3 · M. The room's own acts compete with its lines.**
- **Observation.** Each room repeats "ADD A LINE" and "ADD A CONCEPT RENDER" at roughly the weight of its content (`walk/project-1440-full.jpg`). "Plan the project work", tasks and a Folio sit inside Pieces above the first room (`walk/step7b-floor-line-unfolded-1440.jpg`).
- **Interpretation.** The rooms Leah walks are pushed below the fold by acts that belong to other processes.

**F15 · S2 · M. The page gives no sense of place.**
- **Observation.** Section names are set in 11-12 px letter-spaced grey capitals on beige (`walk/step2-add-line-sheet-open-1440.jpg`). Nothing on screen says which work process you are in.
- **Interpretation.** This is Leah's "so soft and so beige … where the f*** am I?" (`TRANSCRIPT.md:55`). The brief waives canon here.

### D. Rooms

**F16 · S2 · H. A line can sit in only one room.**
- **Observation.** `CHECK ((assignment_scope='room') = (project_room_id IS NOT NULL))` (`supabase/migrations/00434_ffe_privacy_domain_foundation.sql:246-250`). The walk had to create four "White oak floor, satin Bona finish" rows (`walk/project-1440-full.jpg`).
- **Interpretation.** If one copy is filled, priced or specified, the other three drift. Fill and supersede act per row (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:186-207`).

**F17 · S3 · H. You cannot drag a line between rooms.**
- **Observation.** There are no drag handlers on lines. Drag is deferred as "polish debt" (`docs/design/the-document/DECISIONS.md:1197-1200`, I25). Moving a line takes about 3 clicks inside an unfold.
- **Interpretation.** Leah asked for drag in the transcript's second line (`TRANSCRIPT.md:10`). The RPC path for it already exists (`triage_project_ffe_items`, `hooks/use-document-rooms.ts:72-90`).

**F18 · S2 · H. Room is a single column on 33 files.**
- **Observation.** `project_room_id` is read by 33 non-test files across `apps/designer-portal/src`, `packages/supabase/src` and `supabase/functions`. These include the PO sidemark (`supabase/functions/po-send/index.ts:300`), the authorization snapshot (`room_name`, `project_room_id`; `supabase/migrations/00423_trade_scope_instrument.sql:1145-1153`), the client selections RPC (`00435:799-801`) and spec book chapters (`spec-book-workspace.tsx:821,841`).
- **Interpretation.** This sizes any multi-room change (§3).

### E. Placeholders and products

**F19 · S2 · H. Filling a placeholder destroys its intent.**
- **Observation.** `UPDATE … SET product_id = v_product.id, name = v_product.name` (`00435:194-196`). It is still the inner implementation under the wrapper chain in 00439, 00442, 00445 and 00447.
- **Interpretation.** "Hardware, 2 knobs for custom cabinet" becomes "Ribbon & Reed Knob". The count and the cabinet it serves are gone (`TRANSCRIPT.md:49`).

**F20 · S3 · H. The need identity already exists and nothing displays it.**
- **Observation.** `project_ffe_selection_threads` (`00434:194-201`) is a per-need identity. Supersede carries `selection_thread_id` forward (`supabase/migrations/00661_ffe_extract_commercial_confirmation.sql:425`). It has no label column.
- **Interpretation.** This is the natural home for "the need label survives the fill" (§4).

**F21 · S2 · M-H. Supersede drops what the designer wrote.**
- **Observation.** The current `supersede_project_selection` (`00661:374-435`) inserts the replacement with `notes = NULL` (`:424`) and a **fresh, empty** `project_ffe_specs` row (`:429-430`). So Exact location ("see drawings"), client, vendor and install notes do not carry. The children's `parent_ffe_item_id` (COM fabric) keeps pointing at the superseded row.
- **Interpretation.** Swapping a product after authorization silently strips the spec and orphans the COM pair.

**F22 · S2 · M. A signed allowance cannot be filled in place.**
- **Observation.** Placeholder fill refuses any line in a draft, sent or executed authorization (`supabase/migrations/00447_ffe_final_adversarial_hardening.sql:256-269`). Supersede refuses the same (`00661:387-392`, "require void or commercial change authority").
- **Interpretation.** An allowance exists to be filled after the client signs, and both doors are shut. I did not verify whether US-19's "Record a change" routes to a commercial change. **Needs a check.**

**F23 · S3 · H. Allowances work on active projects in the backend. Only the UI is missing.**
- **Observation.** `CreateNamedProjectNeedRequest` already takes `itemType: 'allowance'` and `budgetMinCents`/`budgetMaxCents` (`packages/types/src/ffe.ts:131-139`). The live wrapper validates them (`00447:219-241`) with no project-phase gate.
- **Interpretation.** This **corrects** `briefing/current-state.md` §2c ("unreachable post-activation"). Rough pricing at rough-in needs no migration.

**F24 · S3 · H. Disposition is fixed at birth, and "Alternate" does nothing.**
- **Observation.** Disposition can be chosen only at creation (`line-card.tsx:519-527`) and never edited. "Alternate" has no downstream reader (`briefing/current-state.md` §7.6).
- **Interpretation.** Leah's "options" thinking (A or B for the client) has no working home.

**F25 · S3 · M. There is no way to put an image on a custom or outline line.**
- **Observation.** LineCard's `imageUrl` comes only from a prefill or a pick (`line-card.tsx:219`). The spec book has no upload control (grep for upload or file input in `spec-book-workspace.tsx`: none). The storage already exists: `project_ffe_specs.selected_media` (`00380:53`), and the readiness rule `'image'` checks it (`00435:66`).
- **Interpretation.** The oak floor needs "an image of what that oak floor looks like" (`TRANSCRIPT.md:20`).

### F. Units and labor

**F26 · S2 · H. There is no unit of measure, and quantity is a whole number.**
- **Observation.** `quantity INTEGER NOT NULL DEFAULT 1` (`00066:267`), and the line total is checked as `quantity * unit_price_cents` (`supabase/migrations/00445_ffe_release_authority_and_receiving.sql:59-63`). LineCard's trade cost placeholder says "each" (`walk/step11a-name-a-need-sheet-1440.jpg`). The unfold shows "×1" (`walk/step7b-floor-line-unfolded-1440.jpg`).
- **Interpretation.** You cannot write "$11.50 / sq ft × 1,240 sq ft". Wallpaper (rolls), trim (lin ft) and COM fabric (yards, often 7.5) are all forced into "each".

**F27 · S2 · H. Labor cannot be attached to a line.**
- **Observation.**
  - Trade Scope is a lump sum per trade, written as prose per room, with no FK to lines (`00423:144-210`).
  - The `po_cost_lines` kinds are freight through restocking, with no labor, and they are PO-grain, so they do not exist at rough-in (`supabase/migrations/00704_po_cost_lines_shipments.sql:56-82`).
  - LineCard's "Kind" offers catalog, custom piece, a find and store buy, but not labor (`walk/step11a-name-a-need-sheet-1440.jpg`).
- **Interpretation.** "Wallpaper + install" is not expressible (`TRANSCRIPT.md:16`).

**F28 · S2 · H. The parent link quietly means "COM fabric".**
- **Observation.** `parent_ffe_item_id` is one level deep (`supabase/migrations/00702_com_pair_submittals.sql:147-157`), its column comment says COM (`:104-106`), and it has no kind. The order paper treats **any** line with a parent as COM fabric: `.filter((l): l is FfePairLine => !!l && !!l.parent_ffe_item_id)` (`components/portal/procurement/order-paper/com-slot.tsx:46`). `com-piece.tsx:47-52` does the same.
- **Interpretation.** Reusing the column for labor, components or room children **without a link kind** would print an install line as "fabric for wallpaper" on the order paper. Any proposal in §3-§5 must add the kind first.

### G. Delete, undo and the catalog

**F29 · S1 · H. No line can be removed from the UI.**
- **Observation.** `archive_project_selection` (`00435:521-545`) and `useArchiveProjectSelection` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:248`) have no caller. The RPC demands a reason of at least 5 characters (`:530`) and has no restore counterpart.
- **Interpretation.** A first hire's stray line is permanent, short of SQL, and goes on to the client's paper. Leah: "I can't delete anything" (`TRANSCRIPT.md:39`).

**F30 · S1 (latent) · M-H. Wiring the existing catalog-delete hook would be dangerous.**
- **Observation.**
  - `useDeleteProduct` calls `catalogApi.deleteProduct`, which sends REST `DELETE /products/:id` (`packages/api-client/src/clients/catalog.client.ts:40-41`). The retained services are orders, media and projects, and none of them is a catalog service.
  - The call is wrapped in `withMockData` (`hooks/use-products.ts:193-197`). On any failure that wrapper **returns the mock result as success**, in production too unless `FORCE_LIVE` is set (`lib/mock-data.ts:14-38`).
  - If a hard DELETE did land, `project_ffe_items.product_id … ON DELETE SET NULL` (`00066:261`) would silently turn filled or ordered lines back into placeholders.
  - RLS lets any `member` hard-delete studio products (`supabase/migrations/00584_studio_comember_rls_sweep.sql:1270-1281`).
- **Interpretation.** The briefing's fix sketch §7.2 ("wire `DeleteProductDialog`") would ship a button that reports success while doing nothing, or corrupts live jobs. **Do not wire it as-is.** Merge columns already exist: `products.merged_into_id`, `deleted_at` (`supabase/migrations/00152_three_layer_catalog.sql:55-56`). The original supersede honored them (`00435:560`). The current one checks `_can_read_configurable_product` instead (`00661:397`); I have not verified whether that check honors merges.

### H. Mobile

**F31 · S4 · L. Pieces on mobile is behind a "MORE" bottom bar and was not walked.**
- **Observation.** `walk/pieces-list-390.jpg`.
- **Interpretation.** Rough-in is a desk task. Backfill on site (photos, "see drawings") is not. This needs a human walk.

---

## 2. The piece's life, redesigned

### One derived stage, one word, one set of acts

Add a single derived stage. Compute it in SQL (`ffe_line_stage(project_ffe_items)`, stable, read-only) and mirror it in `stamp-derivation.ts`. Every surface, stamp, head count and filter reads it. Do **not** add a column. The stage is a pure function of facts the row already carries.

| # | Stage (Leah's word) | Derived when | What the line shows | Editable | Locks or refuses |
|---|---|---|---|---|---|
| 0 | **Outline** | `product_id IS NULL`, `item_type='tbd'`, no rough price | Need label, qty + unit, room(s), components, "Fill with a product", rough-price field | Everything; remove with undo | Nothing. **Hidden:** Buy, Quote, Order, Movement, Money out, Receiving, Bill, Submittals, Samples, Something's wrong, Release |
| 1 | **Roughed** (rough price) | Outline + `item_type='allowance'` with `budget_max_cents>0`, or a rough unit price | Same as 0, plus "~$X" (never `$0`) and the room's rough total | Everything | Nothing |
| 2 | **Specified** | `product_id` set, **or** a custom piece with a maker; spec readiness shown as "3 of 6 spec fields" | Product or maker, image, spec fields inline (drawer, same route), trade cost, client price, options A/B | Everything; product swap = in-place fill | Nothing yet |
| 3 | **Ready for the client** | Release eligibility passes (`00445:50-69`: vendor, qty, price or allowance ceiling) | "Release for authorization" includes it | Everything | Bill stays hidden |
| 4 | **Approved** | In an executed authorization (`furnishing_authorization_items.source_ffe_item_id`) | Order cell appears; Buy and Quote | Spec notes, install notes | Product, qty, unit, rooms, client price → **Record a change** (void or supersede). Room select is already soft-locked (`line-unfold.tsx:64`) |
| 5 | **Ordered** | `purchase_order_id IS NOT NULL` | Order, Movement, Money out | Vendor and trade cost only (00692) | Everything else → PO change |
| 6 | **Arriving · Received · Installed** | `status IN (shipped, delivered, installed)`, plus partial and damaged overlays | Receiving, Something's wrong (damage), Install | Receiving facts | Removal refused |

**Overlays on top of the stage:**
- `decision_due`, `damaged` and trade-scope stamps keep their current precedence (`stamp-derivation.ts:109-129`).
- **Options.** `design_disposition` `candidate` or `alternate` becomes the **option set within one need**: lines that share a `selection_thread_id` render as "Option A / Option B". Today the thread is 1:1; a second option joins the first's thread. `not_selected` means removed (hidden, restorable). `superseded` means history.

**Mapping to today's columns:**
- `status` stays the goods machine. Its default `'specified'` (`00066:265`) stops being printed before stage 5. That kills F1 with no migration. `quoted` and `approved` in `status` are already side effects of PO RPCs; leave them.
- `item_type` becomes the stage 0 / 1 / 2 switch: `tbd` = outline, `allowance` = roughed, `fixed` = specified. Fill already flips `tbd → fixed` (`00447:198-199,279`).
- A `line_kind` (§5) separates goods from labor.

**Why this matches Leah.** "As it moves through those stages it becomes more and more locked in" (`TRANSCRIPT.md:11`). Stages 0-3 are freely editable building, 4-6 are progressively locked, and each lock names the act that can still change it.

**Canon:** none broken by the stage itself. It *fulfils* F58. Printing a different stamp color per stage would need a VISION §5/§6 ("no badges") ruling.

---

## 3. Multi-room placement: one piece, many rooms

### The three options compared

| | (a) Join table `project_ffe_placements(ffe_item_id, project_room_id, quantity, area_note, sort_order)` | (b) Parent line + per-room child lines via `parent_ffe_item_id` | (c) Duplicates per room, linked by a group id |
|---|---|---|---|
| **One piece to fill, price or spec** | Yes, one row | Parent holds the spec; children must mirror it | No: N fills, N supersedes, N spec rows that drift |
| **Money lives on** | One row. Unaware consumers **cannot double-count** | Parent **and** children. Every sum must exclude the parent (billing, release, PO, totals, budgets) | N rows. Sums are correct |
| **Authorization** | One item. Snapshot `room_name` becomes "Hall · Living · Dining · Kitchen"; add a `placements` JSON snapshot. Room budgets allocate by placement share | One item per child; works today if the parent is excluded | One item per row; works today |
| **PO** | One PO line, sidemark lists the rooms (`po-send/index.ts:300`). Right for a local floor guy | N PO lines for one delivery | N PO lines; right for tile that ships labelled per room, wrong for a floor |
| **Receiving** | One `received_quantity` (integer, 00150). Per-room receipt is not tracked; fine for site deliveries | N receipts | N receipts |
| **Spec book chapters** | Render the line in each placement's chapter, marked "also in Hall, Dining, Kitchen" | Children appear per room today; the parent needs a home | Appears per room today |
| **Client proposal** | Once per room with that room's qty, or once under "Across rooms". `get_client_project_selections` (`00435:787-808`) must join placements | Per room (children) | Per room |
| **One-level link conflict (F28)** | None: COM, labor and components keep `parent_ffe_item_id` | **Collides.** A per-room child cannot also be a COM fabric or carry labor, because the link is one level (`00702:147-157`) and is read as COM (`com-slot.tsx:46`) | None |
| **What happens to consumers you haven't updated yet** | They show the primary room only. **Wrong place, never wrong money** | They double-count money | They show the right rows, but nothing marks them as one piece |
| **Size** | L (33 consumer files, but they can be updated in phases) | L, with silent money risk | M, with permanent drift risk |

### Recommendation: (a), the join table, done safely

- **Keep `project_room_id` as the primary placement**, and keep `assignment_scope='room'`. The CHECK at `00434:246-250` **does not change**. The placements table holds every room including the primary, with the quantity per room. `line.quantity = sum(placements.quantity)` is maintained by one RPC, `set_line_placements(ffe_item_id, [{roomId, quantity, areaNote}])`.
- **Unaware consumers degrade to the primary room.** This is the deciding property: under (a) a consumer that has not been updated shows a floor in the Hall only, which is visibly incomplete. It never shows $4,600 of floor twice.
- **Phases:**
  1. RPC, Pieces render (the line under each room with "also in …"), spec book chapters.
  2. Client selections, authorization snapshot, PO sidemark, room budget allocation.
- **Locks.** Placements edit freely in stages 0-3. At stage 4 (approved) they lock with qty and price, and change through Record a change.
- **Throughout** stays a valid scope for lines that are genuinely everywhere. "Not in a room yet" stays `unassigned`, and F12 must be fixed regardless.
- **Tile in four rooms where the vendor wants per-room cartons:** the PO renderer can print one sub-line per placement from the same row. That is a rendering choice, not a data split.

**Canon:** DECISIONS `:1038-1039` (a combined "Throughout · unassigned" label) is already drifted. (a) needs no new canon ruling. Showing "also in" chips on each room's copy is a V9 question ("absence is silence" is fine; this is presence).

---

## 4. Placeholders → products

### The need label survives the fill

- **Proposal.** Add `need_label text` to **`project_ffe_selection_threads`** (`00434:194`), not to the line.
  - `create_named_project_need` sets it from the typed name.
  - Fill (`00435:194-196`) and supersede (`00661:425`, which already carries `selection_thread_id`) leave it alone.
- **Why the thread.** It is already "the same need across fills and replacements". Supersession creates a new row, so a column on the line would need copying, and copying is exactly what F21 shows the RPC forgets to do.
- **Why keep overwriting `name`.** `name` keeps becoming the product name, which is correct for the PO and the vendor (a maker does not want "Hardware, 2 knobs" on a PO). The schedule prints:

  > **Hardware, 2 knobs for custom cabinet** — Emtek Ribbon & Reed knob, satin brass · ×2

  The client proposal prints the need label as the line's role. This avoids the briefing's §7.4 option of stopping the overwrite, which would leave POs carrying need text.

### Fill rules, by stage

| Stage | How a placeholder becomes a product | Path |
|---|---|---|
| 0-3 | **Fill in place.** Same row, keeps spec, notes, placements and children. Offered on the line itself ("Fill with a product"), with the need label and qty prefilling the Library search | Existing `place_product_in_project_v2` with `placeholderSelectionId` (`line-card.tsx:551-556`), surfaced from the line instead of hidden in road → LineCard → select |
| 4 (approved) | **Record a change → replace.** Supersede with a void or commercial change | `supersede_project_selection` (`00661:374`), gaining `useSupersedeProjectSelection` as its first caller (`use-project-ffe-ga.ts:263`) |
| 4, line is an **allowance** | **Fill against the allowance.** Must be allowed without voiding the authorization when the filled price ≤ ceiling; over the ceiling, it is a change order. Today both doors refuse (F22) | New guard branch in fill: `item_type='allowance' AND executed AND new price ≤ budget_max` → fill, record the variance |
| 5+ | PO change command | Existing |

**Supersede must carry what the designer wrote** (F21). Change `00661:374-435` to copy, when the product changes:
- `exact_location`, `client_notes`, `trade_notes` and `install_notes` from `project_ffe_specs`
- `notes` (stop writing NULL at `:424`)
- placements
- the children: repoint `parent_ffe_item_id` from old to new

Product-intrinsic fields (SKU, finish, material, dimensions) should **not** be copied when the product changes.

### Outlining components (the shower)

- **Proposal.** Add a light **outline group**: `project_line_groups(id, project_id, project_room_id, name, sort_order)` and `project_ffe_items.line_group_id`. "Primary bath shower" is a heading. "Valve", "trim kit", "shower head", "hand shower", "drain", "niche tile" and "glass" are outline lines in the group, each filled later.
- **Why not a parent line.** A header line carries quantity, price and stage, and every money consumer would have to exclude it (the §3(b) trap; F4 shows the billing filter already miscounts $0 lines). A group has no money, so nothing can double-count it.
- **Why not `parent_ffe_item_id`.** It is one level deep and read as COM (F28). A component that takes labor or COM would collide.
- **Interaction.** In the entry grid, Tab at the start of a name indents the line into the group above; Shift+Tab outdents.
- **Canon:** a group heading inside a room is a new nesting level on the paper and needs a ruling under VISION §6 ("no zones").

---

## 5. Labor and custom per-unit lines

### Unit of measure

- **Now (S).** Add `project_ffe_items.unit text NOT NULL DEFAULT 'each'`, with CHECK `each, sq_ft, lin_ft, roll, yard, box, hour, lot`.
  - Keep the integer quantity. Floors are ordered in whole square feet, wallpaper in rolls and trim in lin ft.
  - Print as "1,240 sq ft × $11.50 / sq ft".
  - Touches: the create and place RPCs (accept `unit`), `set_project_ffe_line_commercials` (`supabase/migrations/00692_ffe_line_commercials.sql:54` allow-list gains `unit` before a PO exists), the PO and spec-book renderers.
- **Later (L, separate decision).** `quantity numeric(12,2)` for COM yardage (7.5 yd). This is high risk: integer math in readiness (`00435:72`, `00445:59-63`), PO totals, integer `received_quantity`, and the TS types (`packages/types/src/ffe.ts:66`). Defer it until a real half-yard bites.

### Labor attached to a line

Options weighed:

| Option | Verdict |
|---|---|
| Child line via `parent_ffe_item_id` | **Yes**, but only after adding a `link_kind` (F28) |
| `po_cost_lines`-style rider | No. PO-grain, it does not exist at rough-in (no PO yet), and it is logistics-typed (`00704:56-82`) |
| Trade Scope link | Later, not at rough-in. Trade Scope is a client-facing lump-sum *contract* per trade (`00423`). A wallpaper install note is not a contract yet |

**Proposal.**
- Add `project_ffe_items.line_kind text NOT NULL DEFAULT 'goods'`, CHECK `goods` or `labor`.
- Add `project_ffe_items.link_kind text`, CHECK `com`, `labor` or `accessory`, required when `parent_ffe_item_id` is set. Backfill `'com'` for every existing parent. `link_ffe_pair` (`00702:108`) takes the kind, and `com-slot.tsx:46` / `com-piece.tsx:47-52` filter on `link_kind='com'`, **in the same release**.
- **Wallpaper + install.**
  - The labor line has `line_kind='labor'`, `link_kind='labor'` and a parent of "Wallpaper, guest bedroom accent wall".
  - Its unit is `roll`, `sq_ft`, `hour` or `lot`, with a rough price.
  - It renders nested under the wallpaper as "↳ Install · 6 rolls × $85".
  - It is released with its piece.
- **When a Trade Scope is engaged** for wallpaper, labor lines of that trade can be **drawn into** it, using the existing `trade_scope_document_id` presence-line column (00423) and stamp branch (`stamp-derivation.ts:124-128`). The rough labor price seeds the scope's allocation. This answers "where does labor live" without inventing a third labor system.
- **Labor lines are never POs to a maker by default.** `create_purchase_order` must skip `line_kind='labor'` unless the installer is the PO vendor (00435:878 path).

### Rough price at rough-in

- **UI only, no migration** (F23). In the entry grid, a "Rough $" column writes an allowance: `itemType:'allowance'`, `budgetMaxCents` = rough × qty. The line moves to stage 1 (Roughed). It prints "~$4,600", and the room head totals "Living Room · ~$18,200 roughed · $0 specified".
- When the line is filled, the allowance ceiling stays as the comparison: "$4,250 vs ~$4,600 roughed". Filling currently flips `item_type` to `fixed` (`00447:279`) but leaves `budget_max_cents` intact, so the variance can be shown.

### Custom per-unit piece (the oak floor)

"A custom piece" plus `unit=sq_ft` plus an image dropped on the line (writing `project_ffe_specs.selected_media`, `00380:53`; F25) plus a few spec fields (finish "satin Bona", plank width "TBD") plus placements in four rooms. One row.

---

## 6. Delete and undo

### Project lines: who may remove what, and when

| Stage | Act | Who | Reason? | Undo | Backend |
|---|---|---|---|---|---|
| 0-3, never shown to the client | **Remove** (Delete key on the row, or a menu on the line) | Any studio member on the project (today's `_ffe_require_studio_project`) | No. Auto-reason "removed while building" | 10 s toast + a "Removed lines" list per room (restorable for the life of the job) | `archive_project_selection` with the minimum-length rule relaxed when no review edition or authorization exists. **New** `restore_project_selection` restores `removed_at`/`removed_by` and the prior disposition |
| 0-3, already in a published client review (`publish_project_review`, `00435:705`) | Remove | Any member | **Yes** (the client may have seen it) | Restore | Existing reason rule |
| 4 Approved | Remove is **refused**, and the act becomes **Record a change → void this line** | Owner or admin, or the project lead | Yes | Through the change record | Existing refusal (`00435:531-539`); the void path |
| 5+ Ordered | Refused → PO change | `can_buy_for_project` (00702) | Yes | No | Existing |

**Also:**
- Removing a parent removes its `link_kind='labor'` children with it, after a prompt. Removing a COM fabric line unlinks it.
- "Something's wrong…" is hidden before stage 5 (F7).

### Studio catalog duplicates: merge, never hard delete

- **New `merge_studio_product(p_duplicate, p_keep)`.** Sets `merged_into_id` and `deleted_at` on the duplicate (columns exist, `00152:55-56`).
  - It **does not touch** project lines that already use the duplicate. Their spec is frozen by contract (`docs/design/spec-books/contracts.md`).
  - The Library, pickers and fill stop offering it.
  - Supersede and fill must refuse merged products. Confirm that `_can_read_configurable_product` (`00661:397`) does.
- **Plain "Remove from Library"** is the same soft delete, `deleted_at` only.
- **Hard DELETE.** Narrow `products_studio_delete` (`00584:1270-1281`) to products with **no `project_ffe_items` reference**, or revoke it outright. A hard delete with `ON DELETE SET NULL` un-fills live lines (F30).
- **Retire or rewrite `useDeleteProduct`** (`hooks/use-products.ts:189`). It goes through REST plus a mock fallback. Do not wire `DeleteProductDialog` until it calls the new RPC.
- **Who:** owner, admin or member, as RLS allows today. Merge suggestions can reuse the unused `duplicate-detection-panel.tsx:180`.

---

## 7. Rapid entry: "add a line, add a line, add a line"

### What it should feel like (the Build lens, a room as a table)

1. **The room is the input.** Each room in Build shows its lines as rows and ends in an empty row with the cursor parked in it. Leah clicks Living Room, or presses ⌘↓ to move to the next room, and types. No sheet, no button.
2. **Typing:**
   - `Custom cabinet ×2` then **Enter** creates the line (optimistic, idempotency key per row, as `add-line-sheet.tsx:69-78` already does). The cursor drops to a new empty row **in the same room**.
   - **Tab** moves name → qty → unit → rough $ → (rooms). Enter from any column commits the line and starts the next.
   - A trailing quantity is parsed only from `×N`, `xN`, `(N)` or `qty N`, never from the middle of a name. "Hardware, 2 knobs for custom cabinet" stays one line, ×1.
3. **Paste a list.** Pasting several lines into the empty row previews "4 lines into Living Room" with the parsed quantities. Enter commits them all, through a new batch RPC or a client loop over `create_named_project_need`; there is already a precedent in `batch_place_library_products_in_project`, `00435:336`.
4. **Components:** Tab at the start of a name indents it into a group (§4). **Fill:** typing `/` in a name searches the Library inline; choosing a result fills the row now, and the need label is kept.
5. **Rooms:**
   - Drag a row onto another room's heading to move it (`triage_project_ffe_items`).
   - ⌥-drag, or a "+ room" chip, to **also** place it there (§3).
   - Multi-select (Shift-click) then drag to move several at once.
6. **Mistakes:** Backspace on an empty name, or ⌘⌫ on a row, removes it with an undo toast (§6).
7. **Backfill.** Clicking a row opens a **right-hand drawer on the same route**. It shows image, product or maker, spec fields, rooms, unit, price, labor and notes, matching the line's stage (§2). It replaces "Edit spec details →" going to the spec book for Build work. The spec book stays the issue-and-preflight instrument.
8. **The time hold** moves to a new `app/(document)/doc/[id]/layout.tsx`, so any Document sub-route keeps the hold (F9). Build work never triggers Log / Discard.

**Target.** S1 (four lines, under a minute) becomes about 4 × (type + Enter), roughly 20 s by hand, without leaving the room.

### Canon rulings this needs

- VISION §6 "no tabs", for a Build / Approve / Buy / Receive lens switch.
- VISION §5 "no zones or badges", for a table with column heads and stage stamps.
- V9 "absence is silence", for empty Unit and Rough $ cells shown on purpose.
- DECISIONS I25, reopening drag.
- The house-sheet tokens, for a higher-contrast Build lens (Leah's "where am I").
- A separate `/doc/[id]/pieces` route versus a lens on `/doc/[id]` is a US-18/19 "one paper" question. With the layout-level time hold, either works.

---

## 8. Data-model delta

| # | Change | Migration risk | RPCs and consumers touched | Size |
|---|---|---|---|---|
| D1 | Derived **stage**: `ffe_line_stage(row)` SQL (stable) + `stamp-derivation.ts` mirror; stamp stops printing Specified before an order; `$0` → "not priced"; Bill filter excludes unpriced outline lines | None (read-only) | `deriveLineStamp`, `ffe-leader.ts`, `ffe-section.tsx:1405,1862`, spec book readiness labels | S |
| D2 | `project_ffe_selection_threads.need_label text`, backfilled from the current line name | Low (additive, nullable) | `create_named_project_need`/`place_product_in_project_v2` set it; Pieces, spec book and client selections read it | S |
| D3 | `project_ffe_items.unit text DEFAULT 'each'` + CHECK | Low | place/create RPCs, `set_project_ffe_line_commercials` allow-list (00692:54), `po-send`, `spec-book-render`, `@patina/types` | S |
| D4 | `project_ffe_items.link_kind` (`com/labor/accessory`), backfill `'com'`; CHECK: present iff `parent_ffe_item_id` is set | Medium: `com-slot.tsx:46` and `com-piece.tsx:47-52` must filter by kind in the same release | `link_ffe_pair` (00702:108), order paper, COM sheet | S |
| D5 | `project_ffe_items.line_kind` (`goods/labor`) | Medium: PO creation must skip labor; release eligibility's vendor rule applies to the installer | `create_purchase_order` (00435:878), release eligibility (00445), stamp, Trade Scope draw-in | M |
| D6 | `project_line_groups` + `project_ffe_items.line_group_id` (outline components) | Low (no money on groups) | new `set_line_group`; Pieces and spec book render | S-M |
| D7 | `project_ffe_placements(ffe_item_id, project_room_id, quantity, area_note, sort_order)`, unique per room; `project_room_id` stays primary; `set_line_placements` RPC | Medium; consumers degrade to primary room (no double-count) | `triage_project_ffe_items`, `get_client_project_selections` (00435:787), authorization snapshot (00423:1145, 00422:608), `po-send` sidemark, spec book chapters, room budgets; 33 files read `project_room_id` | L (phased) |
| D8 | `restore_project_selection(id)` + relax the archive reason when never published or authorized | Low to medium (the audit trail keeps an auto-reason) | `archive_project_selection` (00435:521) | S |
| D9 | Supersede carries designer-authored spec fields, notes, placements and children | Medium (must not copy product-intrinsic fields across products) | `supersede_project_selection` (00661:374) | S |
| D10 | Allowance fill after signature when ≤ ceiling | Medium (commercial authority; needs a ruling with US-19's Record a change) | fill guard (00447:256-269), variance record | M |
| D11 | `merge_studio_product` RPC on the existing `merged_into_id`/`deleted_at`; restrict hard DELETE to unreferenced products; retire the REST `useDeleteProduct` | Medium (RLS narrowing) | `products_studio_delete` (00584:1270), Library and Piece room acts | S-M |
| D12 | Rough price at rough-in = allowance through the existing request fields | None | UI only (`packages/types/src/ffe.ts:136-138`, 00447:238) | S |
| D13 | Batch need creation for paste | Low | new `batch_create_named_project_needs`, or a client loop | S |
| D14 | Time hold at `app/(document)/doc/[id]/layout.tsx` | Low (UI) | `useHoldDocument` (document-time-provider.tsx:916) | S |
| D15 | Image on outline and custom lines writes `project_ffe_specs.selected_media` | Low | existing spec write path | S |
| D16 | `quantity numeric(12,2)` (fractional yards) | **High**: integer math in readiness, PO totals, `received_quantity`, types | many | L, defer |

Out of my lens but noted: the S8 paint and finish schedule would re-key `palette_swatches` (00131, `proposal_id`-scoped) to project + room. That is M; another seat should own it.

---

## Top 5 recommendations

1. **One derived stage drives every word and act on a line (D1, §2).** Outline → Roughed → Specified → Ready → Approved → Ordered → Arriving or Installed. It is a SQL function plus a TS mirror, with no migration.
   - It kills "they're all specified" (F1), `$0`, Bill-on-placeholders (F4) and procurement on rough-in lines (F6, F7).
   - It is the device Leah means by a lens: "I can do this part, I can't do that part".
2. **Make a room a keyboard-first entry table on the same route (§7, D13, D14).**
   - Enter adds the next line in the same room, Tab moves across qty, unit and rough $, paste makes N lines, drag moves a line between rooms.
   - A right-hand drawer replaces the trip to the spec book.
   - The time hold moves to a Document layout.
   - Fix the `'Unsorted'` misroute (F12) the same day.
3. **Placeholders keep their intent (D2, D9, §4).**
   - `need_label` lives on the existing selection thread. Fill in place before approval, from the line itself. Supersede (first UI caller) carries the designer's notes and children.
   - Components are an outline group, not a parent line.
   - Rough price is an allowance through fields that already exist (F23, D12).
4. **One piece, many rooms = the join table with the primary room kept (D7, §3(a)).** Money stays on one row, so consumers you haven't updated show less but never double. Also add `unit` (D3), and labor as a `line_kind='labor'` child under a typed `link_kind` (D4, D5). **Ship `link_kind` before any new use of `parent_ffe_item_id`**, or labor prints as COM fabric (F28).
5. **Removal that is safe by stage, and merge instead of delete (D8, D11, §6).**
   - Remove with undo before the client sees a line, a reason after, Record a change after approval.
   - Merge catalog duplicates through the existing `merged_into_id`.
   - **Do not wire the existing `DeleteProductDialog`/`useDeleteProduct`.** It goes through a REST call with a mock success fallback, and a real hard delete would un-fill live lines through `ON DELETE SET NULL` (F30).
