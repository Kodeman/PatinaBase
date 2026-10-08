<!-- provenance: single-shot via local model gateway; response model=claude-gpt-6-sol[1m]; stop_reason=end_turn; usage={"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"input_tokens":73630,"output_tokens":6969}; images=23; generated 2026-10-08T15:41:48.397Z -->

# R3 (GPT-6 Sol): heuristics, cognitive walkthrough and competitor patterns

## 1. Verdict

Give building Pieces its own **room-based workspace**, reached from the Project overview. Keep the quick “Add a line” interaction Leah likes, but let her enter the next line immediately; then let her return to the same list to add specs, products, rooms and rough prices. Procurement should not be the first thing a new line opens. Leah’s raw capture describes the intended sequence plainly: “add a line, add a line, add a line,” then “go back in my line” to fill the details. Today the four lines can be entered, but each closes its sheet; an empty line is stamped `SPECIFIED`; and opening it foregrounds buying and order information (`walk/step2-add-line-sheet-open-1440.jpg`; `walk/step3-line-unfold-1440.jpg`). The proposal below keeps the Project as the overview and makes the work of building its Pieces a legible destination—not another system for Leah’s first hire to learn.

## 2. Heuristic evaluation

**Scale:** S1 blocks the job · S2 costs real time or causes errors · S3 friction · S4 polish. Confidence describes the evidence for the *observation*, not certainty that the proposed design will work.

| Finding | Heuristic | Observation and evidence | Interpretation | Proposal | Severity · confidence |
|---|---|---|---|---|---|
| **R3-1** | Visibility of system status | A newly named line with no product, price or configuration displays `SPECIFIED` on the Project, while the Spec Book calls that selection incomplete (`walk/step3-line-unfold-1440.jpg`; `walk/step4a-spec-book-opened-1440.jpg`; `lib/document/stamp-derivation.ts:104-144`). | The visible stamp describes the goods-status field, not how far the designer has got. A first hire may mistake it for permission to use the line as a finished spec. | Show **Placeholder · needs details** during building; reserve procurement status for buying. Do not change the underlying goods status merely to change its label. | **S2 · high** |
| **R3-2** | Match between system and the real world | Leah works room by room, then backfills. The room-level sheet has only name, count and COM; the opened line leads with The buy, Quote and Order (`components/document/schedule/add-line-sheet.tsx:109-138`; `components/document/line-unfold.tsx:4-5`; `walk/step3-line-unfold-1440.jpg`). | The first input matches her method; the next screen changes the subject before she is ready. | Keep building and buying as separate, clearly named work modes over the same lines. Open a building-line editor from a building list. | **S2 · high** |
| **R3-3** | User control and freedom | A mistaken Sunroom line has no visible remove act, although `archive_project_selection` exists (`walk/step5b-sunroom-line-unfolded-1440.jpg`; `packages/supabase/src/hooks/use-project-ffe-ga.ts:248`). Catalog deletion is likewise unwired (`apps/designer-portal/src/hooks/use-products.ts:189`; `components/document/rooms/library/library-room.tsx`, as verified in `briefing/current-state.md` §1 row 16). | Entering a rough list feels costly if mistakes cannot be undone. | Put **Remove line** beside draft-line editing, with undo or a clear confirmation; explain why released or ordered lines instead require a change. Add a permission-aware duplicate-removal path in the Library. | **S2 · high** |
| **R3-4** | Consistency and standards | Two buttons both say “Add a line”: the section button opens an 11-road intake sheet; the room button opens the three-field quick sheet (`components/document/ffe-section.tsx:1873-1877,874-884`; `components/document/schedule/add-to-project-sheet.tsx:87-119`). | The same label predicts two different tasks. Even Leah has to rediscover which door returns her to the list. | In the building workspace, **Add a line** always means quick entry in the current room. Call the other act **Bring in a piece**. | **S2 · high** |
| **R3-5** | Error prevention | The quick sheet compares the label `Unsorted`, but its caller passes `Not in a room yet`; a line entered in that group is sent to Throughout (`components/document/schedule/add-line-sheet.tsx:60-64`; `components/document/ffe-section.tsx:2679-2684`). The walk did **not** complete a direct test of this path (`walk/WALK.md`, step 11). | A display-string mismatch silently changes the meaning of room assignment. | Pass an explicit assignment value, not a label, and test unassigned, room and Throughout separately. | **S2 · high** |
| **R3-6** | Recognition rather than recall | Room assignment lives in the unfold, spec fields on a separate route, and product filling in a multi-road sheet (`components/document/line-unfold.tsx:346-378`; `components/document/ffe-section.tsx:732-741`; `components/document/schedule/line-card.tsx:551-556`). | The designer must remember where each missing detail lives rather than seeing it beside the line she is finishing. | Use one selected-line panel for room, intent, product, image, spec and planning price; link to the full Spec Book only for publication work. | **S2 · high** |
| **R3-7** | Flexibility and efficiency of use | Four successful Living Room entries each required reopening the sheet after save (`walk/WALK.md`, step 2; `walk/step2-living-room-after-4-lines-1440.jpg`). The automated timings do not establish a human under-one-minute result. | The easiest flow still interrupts Leah’s repeated-entry rhythm. | Save-and-focus the next blank row, with Enter to add and a visible **Done adding** act. Preserve mouse and touch entry; do not depend on a shortcut. | **S2 · high** |
| **R3-8** | Aesthetic and minimalist design | One line’s unfold contains buying, quote, order, movement, money out and receiving before its spec-detail link (`components/document/line-unfold.tsx:218-253,346-428`; `components/document/ffe-section.tsx:732-741`). | Information needed later competes with the small number of fields needed now. Leah’s “so soft and so beige… where the fuck am I?” is also a navigation complaint, not just a color preference. | Give the building workspace a stronger location header and high-contrast room/list hierarchy; hide procurement cells there, without hiding their recorded data. | **S2 · high** |
| **R3-9** | Help users recognize, diagnose and recover from errors | A product placed into a placeholder unconditionally replaces the authored line name with the product name (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:194-196`). The walk’s product picker did not yield a completed swap (`walk/WALK.md`, step 8). | “Hardware, 2 knobs for custom cabinet” can disappear precisely when the real knob is found. There is no obvious recovery in the building flow. | Preserve an editable **What we need** line name beside the linked **Product** name; preview the result before replacement and keep change history. | **S2 · high** |
| **R3-10** | Help and documentation | The Spec Book has a back link, but it is a distinct route with no room-assignment control (`walk/step4a-spec-book-opened-1440.jpg`; `components/document/spec-books/spec-book-workspace.tsx:821,841`). The time hold releases on route unmount according to the verified source (`hooks/document-time-provider.tsx:916-925`); the walk saw a running clock, not a reproduced Log/Discard interruption (`walk/WALK.md`, step 4). | The route relationship and what can be done there need to be explicit. The reported time interruption remains plausible from source and Leah’s account, but was not reproduced in the walk. | Label the destination **Spec Book · prepare issue** and offer **Back to building Pieces**. Keep one project hold across in-project routes; test the popup path before calling it fixed. | **S3 · medium** |
| **R3-11** | Information scent | The Project is a long paper with Pieces below other regions (`walk/step1-project-1440.jpg`; `walk/project-1440-full.jpg`). Its Pieces head can offer “Spec the … unspecified,” billing and “Add a line” together (`walk/step2-living-room-after-4-lines-1440.jpg`). | None of those labels clearly says “build my room list here, then fill it in.” The first hire has to infer a workflow from neighboring acts. | On the overview, make **Build Pieces** a distinct door with a short progress sentence: “4 placeholders to fill · 2 rooms not started.” Return to the same room and line after visiting the overview. | **S2 · high** |

These findings are about the *building* flow. They do not imply that buying, authorization or the Spec Book should be removed from the job.

## 3. Cognitive walkthrough of S1–S8

For each persona and step, **Know / See / Connect / Feedback** answer: *Will they know what to do? See the control? Connect it to their goal? Understand the result?* **Yes**, **Partial** and **No** describe today’s experience, not the proposed one. Leah’s first-person account in `TRANSCRIPT.md` is the primary evidence; where the walk did not complete a test, that limit is stated.

### S1 — Rough in four Living Room lines

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Find room-level **Add a line** | Leah | Yes | Yes | Yes | Yes | She found and praised this act; the room and button are visible (`walk/step1-pieces-1440.jpg`). |
| Find room-level **Add a line** | First hire | Partial | Yes | Partial | Partial | A second, differently functioning “Add a line” exists at the section head (`components/document/ffe-section.tsx:1873-1877,874-884`). |
| Save each line; repeat four times | Leah | Yes | Yes | Yes | Partial | Lines appear in Living Room, but the sheet closes each time. The automated run is not a human time trial (`walk/WALK.md`, step 2). |
| Save each line; repeat four times | First hire | Yes | Yes | Yes | Partial | The saved line appears, but `SPECIFIED` overstates what was entered (`walk/step2-living-room-after-4-lines-1440.jpg`; `walk/step3-line-unfold-1440.jpg`). |

### S2 — One floor or tile in several named rooms

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Add the floor and assign Hall, Living, Dining and Kitchen | Leah | Yes | No | No | No | The sheet offers one room, not a room set. The walk produced four separate floor rows (`walk/step6b-floor-four-rooms-1440.jpg`). |
| Add the floor and assign those rooms | First hire | Partial | No | No | Partial | “Throughout” may look like a shortcut but is factually wrong for Leah’s case; the row shape permits one room or a scope, not several (`supabase/migrations/00434_ffe_privacy_domain_foundation.sql:246-250`). |
| Later revise the shared floor spec | Leah | Yes | No | No | No | Four manually duplicated rows have no shared source of truth (`walk/project-1440-full.jpg`). |
| Later revise the shared floor spec | First hire | Partial | No | No | No | There is no cue that editing one duplicate leaves the others unchanged (`walk/project-1440-full.jpg`). |

### S3 — Replace placeholders with products; outline a shower first

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Name the hardware and shower components before choosing products | Leah | Yes | Yes | Yes | Partial | Quick entry supports her outline, but calls each bare line `SPECIFIED` (`walk/step3-line-unfold-1440.jpg`). |
| Name the hardware and shower components | First hire | Partial | Yes | Partial | No | The stamp gives no reliable indication of what still needs filling (`lib/document/stamp-derivation.ts:104-144`). |
| Find and attach the real knob | Leah | Partial | Partial | Partial | No | “Optional placeholder to fill” is in LineCard, not the opened line (`components/document/schedule/line-card.tsx:551-556`). The walk could not complete a picker selection (`walk/WALK.md`, step 8). |
| Find and attach the real knob | First hire | No | Partial | No | No | The destination’s name overwrite would discard the authored intent, according to the write path; this was source-verified, not walk-verified (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:194-196`). |

### S4 — Attached labor, custom floor and rough per-sq-ft price

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Add wallpaper installation to its wallpaper line | Leah | Yes | No | No | No | Trade Scope is per trade and room prose, without a link to the piece (`supabase/migrations/00423_trade_scope_instrument.sql:144-210`). |
| Add wallpaper installation | First hire | Partial | No | No | No | Nothing in the unfolded wallpaper line suggests an attached labor entry (`walk/step7a-wallpaper-line-unfolded-1440.jpg`). |
| Create the local floor with image, pending plank width and $/sq ft | Leah | Yes | Partial | Partial | No | A custom-piece road exists; the quick sheet has no image or unit, and quantity is an integer count (`components/document/schedule/add-line-sheet.tsx:109-138`; `supabase/migrations/00066_proposal_project_flow_v2.sql:267`). |
| Create and price that floor | First hire | Partial | Partial | Partial | No | The unfolded buying area exposes trade cost and `×1`, not a square-foot calculation (`walk/step3-line-unfold-1440.jpg`; `walk/WALK.md`, step 7). |

### S5 — Remove a mistake and a catalog duplicate

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Remove the erroneous Sunroom line | Leah | Yes | No | No | No | She explicitly asked how; the opened line has no remove control (`walk/step5b-sunroom-line-unfolded-1440.jpg`). |
| Remove the erroneous Sunroom line | First hire | Partial | No | No | No | “Something’s wrong…” is not an intelligible substitute for removing an accidental draft line (`walk/step5b-sunroom-line-unfolded-1440.jpg`). |
| Delete a studio catalog duplicate | Leah | Yes | No | No | No | Delete code exists without a Library caller (`apps/designer-portal/src/hooks/use-products.ts:189`; `components/catalog/delete-product-dialog.tsx:24`). The walk had no studio product on which to test deletion (`walk/step10a-library-1440.jpg`). |
| Delete a studio catalog duplicate | First hire | Partial | No | No | No | Permission and reference consequences need an explanation before deletion; today there is no visible act to explain them (`briefing/current-state.md` §1 row 16). |

### S6 — Move a line between rooms

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Drag the piece onto another room | Leah | Yes | No | No | No | Drag-to-assign was deferred; the walk’s drag attempt hit the wrong project and does **not** verify behavior (`docs/design/the-document/DECISIONS.md:1197-1200`; `walk/WALK.md`, step 9). |
| Drag the piece onto another room | First hire | Partial | No | No | No | No drag handle advertises this action on the captured line (`walk/step3-line-unfold-1440.jpg`). |
| Fall back to changing Room | Leah | Partial | Yes | Yes | Yes | The unfold’s Room select offers a one-line move until authorization soft-locks it (`components/document/line-unfold.tsx:346-378`). |
| Fall back to changing Room | First hire | Partial | Partial | Partial | Partial | They must first know to open a procurement-heavy line to find the room control (`walk/step3-line-unfold-1440.jpg`; `components/document/line-unfold.tsx:346-378`). |

### S7 — Know the current work and get back without a time interruption

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Choose building rather than buying work | Leah | Partial | Partial | No | Partial | She can act, but says she cannot tell “what you need to do when”; the opened line leads with procurement (`walk/step3-line-unfold-1440.jpg`). |
| Choose building rather than buying work | First hire | No | Partial | No | No | There is no single work-stage device; several unrelated controls use “lens” concepts (`briefing/current-state.md` §1 row 23). |
| Edit spec and return to the job | Leah | Partial | Yes | Partial | Partial | Spec Book has a back link, but is a separate workspace with different controls (`walk/step4a-spec-book-opened-1440.jpg`). |
| Edit spec and return to the job | First hire | Partial | Yes | Partial | Partial | The back link names the project, not the room-and-line task they left (`walk/step4a-spec-book-opened-1440.jpg`). |
| Continue project time through that trip | Leah | Yes | Partial | Partial | Partial | Leah reported an intrusive Log/Discard prompt. Source cleanup supports the risk, but the walk did not reproduce the prompt (`hooks/document-time-provider.tsx:916-925`; `walk/WALK.md`, step 4). |
| Continue project time through that trip | First hire | Partial | Partial | No | No | If shown mid-task, “Discard” could reasonably be mistaken for discarding spec edits rather than a time entry (`components/document/log-strip.tsx:193,211`). |

### S8 — Make a painter-only paint and finish schedule

| Step | Persona | Know | See | Connect | Feedback | Evidence / walkthrough consequence |
|---|---|---|---|---|---|---|
| Record each room’s finishes | Leah | Yes | Partial | Partial | Partial | Spec fields can hold an individual piece’s color, but not a painter’s room-by-finish schedule (`walk/step4b-spec-fields-filled-1440.jpg`; `briefing/current-state.md` §1 row 22). |
| Record each room’s finishes | First hire | Partial | Partial | No | No | There is no project-level finish document to direct consistent entry (`supabase/migrations/00131_proposal_palettes.sql:21-58`). |
| Send only the relevant schedule to the painter | Leah | Yes | No | No | No | No designer-portal project finish export is established; Leah explicitly says this document need not live in Patina (`briefing/current-state.md` §1 row 22). |
| Send only that schedule | First hire | Partial | No | No | No | The present Spec Book is not evidence of a painter-only finish issue path (`walk/step4a-spec-book-opened-1440.jpg`). |

The mobile walk reached the Project but did not reach Pieces; none of these walkthrough judgments establishes the proposed workspace’s mobile usability (`walk/pieces-list-390.jpg`; `walk/WALK.md`, Mobile).

## 4. Competitor patterns

**Research limit:** No competitor product was opened or verified for this review. Every positive claim below is **(unverified, from training knowledge)**. **Unknown** means there is not enough basis to characterize that behavior; it does *not* mean the product lacks it. This table is a list of questions and possible comparison points, not evidence for a feature decision.

| Product | Rapid line entry | Placeholders / allowances | One item, many rooms | Labor / installation lines | Units, including sq ft | Item stages / locking | Spec sheets | Paint / finish schedules |
|---|---|---|---|---|---|---|---|---|
| **Programa** | FF&E schedule organized for project entry **(unverified, from training knowledge)**; repeated-entry speed unknown | Unknown | Unknown | Unknown | Unknown | Schedule progress or status tracking **(unverified, from training knowledge)**; locking unknown | Product/spec information can be assembled for a project **(unverified, from training knowledge)**; output controls unknown | Unknown |
| **Studio Designer** | Item-based project specifications and purchasing workflow **(unverified, from training knowledge)**; rapid-entry interaction unknown | Unknown | Unknown | Items can represent more than furnishings in project accounting **(unverified, from training knowledge)**; attachment of installation to a piece unknown | Unknown | Purchasing stages **(unverified, from training knowledge)**; edit locks unknown | Item specification records **(unverified, from training knowledge)**; sheet format unknown | Unknown |
| **Houzz Pro** | Estimate line-item entry **(unverified, from training knowledge)**; room-first FF&E speed unknown | Unknown | Unknown | Service line items in estimates **(unverified, from training knowledge)**; linkage to wallpaper unknown | Unknown | Project and estimate states **(unverified, from training knowledge)**; item locks unknown | Unknown | Unknown |
| **DesignFiles** | Product sourcing into project boards or lists **(unverified, from training knowledge)**; repeated blank-line entry unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Product information associated with project selections **(unverified, from training knowledge)**; issued sheets unknown | Unknown |
| **Mydoma** | Product and project selection workflows **(unverified, from training knowledge)**; repeated-entry speed unknown | Unknown | Unknown | Services can appear in project proposals **(unverified, from training knowledge)**; piece-level attachment unknown | Unknown | Unknown | Product or project spec presentation **(unverified, from training knowledge)**; issued-sheet controls unknown | Unknown |
| **Gather** | FF&E schedule/list workflow **(unverified, from training knowledge)**; blank-line entry speed unknown | Unknown | Unknown | Unknown | Unknown | Selection tracking **(unverified, from training knowledge)**; locking unknown | Product/spec tracking **(unverified, from training knowledge)**; issue format unknown | Unknown |
| **Fohlio** | FF&E schedule workflow **(unverified, from training knowledge)**; repeated-entry speed unknown | Unknown | Unknown | Unknown | Unknown | Item tracking **(unverified, from training knowledge)**; locking unknown | Product data and specification workflow **(unverified, from training knowledge)**; issue format unknown | Unknown |

Before citing any competitor as precedent, run the *same eight tasks* in its current product. In particular, test whether “one item in many rooms” means one shared spec with separate measured quantities, merely copied rows, or one item marked Throughout; those outcomes are materially different.

## 5. Patterns worth stealing, and anti-patterns to avoid

**Worth testing**

- **A persistent room list with a ready next row.** The drawing remains in Leah’s other hand; saving one line should not reset the task. Test four real lines with Leah and time *her* entry, not an automated run (`walk/WALK.md`, step 2).
- **A named intent plus a linked product.** “Hardware, 2 knobs for custom cabinet” and the eventual knob answer different questions. Keep both visible after a fill (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:194-196`).
- **One shared spec, explicit room placements.** A floor can share its image, finish and vendor while Hall and Kitchen retain separate areas and costs. Show the roll-up before anything is released; do not silently order four copies (`supabase/migrations/00434_ffe_privacy_domain_foundation.sql:246-250`).
- **Plain next-work queues:** “Needs a product,” “Needs a price,” “Ready for review.” These describe missing building work without claiming that the goods-status field has changed (`lib/document/stamp-derivation.ts:104-144`).
- **A schedule for its recipient.** If tested at all, the paint/finish output should be room-by-finish and painter-only, not an automatic dump of every Piece or every note. Leah says an external document is acceptable (`TRANSCRIPT.md`, final paint-schedule passage).

**Avoid**

- Replacing the current 11 entry roads with 11 buttons in a new room. Bring-in methods should be secondary to naming a line (`components/document/schedule/add-to-project-sheet.tsx:87-119`).
- A single mandatory stage for the *whole project*. Leah may outline the Primary Bath while pricing the Living Room. Work views should filter the same lines, not force every room through one gate.
- Calling placeholders “specified,” treating Throughout as a room set, or treating a rough price as an approved client price (`lib/document/stamp-derivation.ts:104-144`; `supabase/migrations/00434_ffe_privacy_domain_foundation.sql:246-250`; `supabase/migrations/00692_ffe_line_commercials.sql:31-54`).
- Drag as the only room-move method. Provide a visible **Move to room** control for keyboard, touch and locked-line explanations; drag can be an additional gesture.
- Making the first hire learn procurement to correct a typo. Draft removal, room change and placeholder filling belong where draft lines are built; authorized and ordered changes need their own guarded path (`components/document/line-unfold.tsx:346-378`; `supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:530-558`).

## 6. Recommended shape

**Choose a purpose-built “Build Pieces” workspace**, not another set of controls inside the full Project paper. It uses the existing project lines; it is not a second schedule. The Project remains the overview of approvals, work and money, with a prominent **Build Pieces** entry showing unfinished-building counts. Every workspace header reads **Whole Home Renovation / Build Pieces / Living Room**, with a persistent **← Project overview** link. Returning from the Spec Book should offer **Back to Build Pieces · Living Room · Custom cabinet**. This is a proposed navigation contract, not a claim about today’s routes.

| Screen or mode | Shows | Hides | Primary act |
|---|---|---|---|
| **1. Room list · Outline** | Room names, their lines, counts, an inline blank row and a small “not in a room yet” list. Name and whole-number count are enough to start. Save focuses the next row; **Done adding** ends the run. | Catalog roads, quote/order/receiving cells, publication controls and price requirements. | **Add a line** repeatedly. |
| **2. Selected line · Fill details** | The authored **What we need** name; linked **Product** or “Choose a product”; rooms; image; finish, material, location and notes; quantity with unit; rough cost or allowance clearly marked as planning figures. A wallpaper line can show an attached installation line. | Procurement cells until the user deliberately enters buying work. | **Fill this line**, then **Next unfinished line**. |
| **3. Review · Ready to use** | A room-by-room check of missing product/spec/price details, shared-piece room quantities and totals, plus explicit warnings for unassigned or inconsistent lines. Existing authorization and change boundaries remain authoritative. | The rapid-entry form and unrelated Project regions. | **Review lines for release** or return to a specific line. |
| **4. Buying · existing work** | The current quote, order, movement, money-out and receiving information for lines that have reached that work. | Blank-line entry and building prompts as the leading act. | **Continue the next buying act**. |

Outline and Fill details could be one screen with a selected-line side panel on desktop and a full-width panel on mobile. Review and Buying can be named destinations within the workspace rather than new copies of the data. The important division is **what the designer is doing**, with a visible way back—not a claim that each line passes through one irreversible stage.

**Boundaries to resolve before implementation:** A shared piece needs an explicit placement model and room-level quantity/area rules; labor needs a defined relationship to its material and to Trade Scope; planning prices must not bypass approved client-price or PO restrictions. The existing archive path can serve eligible draft removal, but authorized or ordered lines must explain their change path rather than presenting a misleading Delete act (`supabase/migrations/00434_ffe_privacy_domain_foundation.sql:246-250`; `supabase/migrations/00423_trade_scope_instrument.sql:144-210`; `supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:530-558`; `supabase/migrations/00692_ffe_line_commercials.sql:31-54,74-75`).

**Founder rulings required:** The dedicated workspace departs from the one-paper Project treatment and needs a ruling against **VISION §6’s no-zones** direction. Explicit Outline / Fill details / Review / Buying mode navigation, if rendered as tabs, **breaks VISION §6 no-tabs**; choose named links instead if that ruling is declined. Visible “needs details” labels and unfinished-work counts need a ruling against **VISION V9 “absence is silence”** and, if styled as badges, **VISION §6 no-badges**. Stronger contrast and a less beige workspace need a ruling against the **house-sheet tokens and soft paper aesthetic**. None of these rulings requires Leah or her first hire to learn a new purchasing system: they give the existing lines a simpler place to begin.
