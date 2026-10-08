# Building a Job's Pieces: shared brief for every seat

**Date:** 8 October 2026 · **Story:** US-20 · **Commissioned by:** Kody · **Audience for the final deck:** the founding team (Kody, Leah)

## The ask
Leah sat down to enter the items for a real job ("Whole Home Renovation") and got lost. Read `TRANSCRIPT.md` in full before anything else; it is the primary evidence, and the first first-person capture from Leah about item entry.

Her working method is clear:
- She walks her elevations and SketchUp model room by room.
- She types "add a line, add a line, add a line" to rough in everything in a room.
- She comes back later to backfill details, swap placeholders for real products, and line up pricing.

Her diagnosis, in her words: *"The underpinnings are all there… but it's not building the function. It's only presenting you with the function that you need at each step that is missing."* She proposes that the project sheet be **an overview**, with **specific screens or lenses for each work process**, where "I can do this part, I can't do that part, and then your choices of what you can do become much simpler."

**Kody's ask:** evaluate this feedback and recommend a course of action that **simplifies building a project's pieces**. That may deserve **its own purpose-built room**. The team delivers an HTML presentation with visuals and mockups.

**Design constraints are WAIVED for this work.** Patina's canon (VISION §5/§6 no tabs, zones or badges; V9 "absence is silence"; the house-sheet tokens; the soft, beige paper aesthetic) does not bind your proposals. Design what you believe is best for Leah and her first hire. Leah calls today's look "so soft and so beige… where the f*** am I?", so that is in scope to change.

Where a proposal departs from canon, **name the ruling it would need** (for example "breaks VISION §6 no-tabs") so the founders see the trade-off. Never depart from canon silently. VISION §2 still describes the customer: a studio adding its first hands, who "cannot afford a new system to learn".

This is **review and design only.** Do not touch product code, migrations, flags, Sanity or prod. Write only to the paths your seat names under `artifacts/pieces-building-room-2026-10-08/`.

## What recon established (verify; it may be stale)
All paths are under `apps/designer-portal/src/` unless noted.

- **Where pieces live.** The project is a Document at `/doc/[id]` (`app/(document)/doc/[id]/page.tsx`). Its line items are the **Pieces** region (`components/document/ffe-section.tsx`, `FFESection`), one of six regions on the Project paper (Client approvals, Schedule, Pieces, Money, Closing the book, The record; `lib/document/document-index.ts`). Lines are grouped by `RoomHeading` per `project_rooms` row, then "Throughout", then "Not in a room yet".
- **"They're all specified."** `project_ffe_items.status` defaults to `specified` (`supabase/migrations/00066_proposal_project_flow_v2.sql`).
  - There is **no placeholder stage**: a placeholder is a line with `product_id IS NULL`, and it still stamps "Specified" (`lib/document/stamp-derivation.ts`, `components/portal/ffe/stages.ts`).
  - A second axis, `design_disposition` (candidate, selected, alternate, not_selected, superseded; 00434), is ignored by the stamp.
  - Locking: authorization soft-locks the room select (`softLockSentence` in `components/document/line-unfold.tsx`). Cost edits are refused once a line is on a PO (00692). All writes go through RPCs (00435/00438).
- **Clicking a line.** It opens `LineUnfold`: one "Next" act, six procurement cells (The buy, Quote, Order, Movement, Money out, Receiving), a Room `<select>`, a folio, and Bill / Add note / Fold. "Edit spec details →" sits outside the unfold. This is procurement-heavy even while Leah is still roughing in.
- **Per-room "Add a line"** (`components/document/schedule/add-line-sheet.tsx`) takes Line name, How many and a COM checkbox, and creates the line through `create_named_project_need` (00435).
  - It has no price, allowance or unit field.
  - **Bug:** the sheet compares against `'Unsorted'`, but the section passes `'Not in a room yet'`, so a line added there is saved as **Throughout**.
- **Section-level "Add a line"** opens `schedule/add-to-project-sheet.tsx` ("Add to the job"), which offers ten entry paths into `schedule/line-card.tsx`.
- **Placeholder → product.** The line card's "Optional placeholder to fill" overwrites the placeholder's name with the product's name, so the intent ("Hardware, 2 knobs") is lost. `supersede_project_selection` and `useSupersedeProjectSelection` (`packages/supabase/src/hooks/use-project-ffe-ga.ts`) have **no UI**. Allowances (`item_type` fixed, allowance or tbd; budget min/max) can only be authored pre-signature (`components/portal/scope-builder/ffe-schedule-builder.tsx`).
- **Rooms.** A line has exactly **one** room: `project_room_id` plus `assignment_scope` ∈ room, throughout, unassigned (00434). There is no join table, so "throughout" is a scope value, not a set of rooms. The only way to change a room is the unfold's Room select (`hooks/use-document-rooms.ts` `useAssignLineRoom`).
- **Drag between rooms.** Not supported ("DECISIONS I25", deferred).
- **Delete.** The `archive_project_selection` RPC and `useArchiveProjectSelection` exist, but **no UI calls them**. Catalog delete is allowed by RLS (`products_studio_delete`, 00584), but `useDeleteProduct`, `components/catalog/delete-product-dialog.tsx` and `duplicate-detection-panel.tsx` are **unused**. The Library has no delete, merge or archive.
- **Labor and per-unit.**
  - Labor exists only as **Trade Scope** (00423), a lump sum per trade written as prose per room. It **cannot be attached to a line** (for example, wallpaper install).
  - There is **no unit of measure**; quantity is a whole number.
  - Client price can't be typed after activation; only maker and trade cost are editable (`set_project_ffe_line_commercials`).
- **Spec details.** `/doc/[id]/spec-book` (`components/document/spec-books/spec-book-workspace.tsx`) has SKU, Finish, Material, Color/fabric, Exact location, dimensions and notes. You cannot assign a room there. It is a **separate route**, so "how do I get back to Project?".
- **Time-tracker pop-up.** `useHoldDocument` is held only on `doc/[id]/page.tsx`. Navigating to the spec book unmounts it, which writes a time entry and shows `components/document/log-strip.tsx` ("Log" / "Discard").
- **Paint and finish schedule.** No designer-portal surface. `proposal_palettes` / `palette_swatches` (00131) exist pre-signature only, and `useProjectPalette` is unused.
- **"Lens" means five different things in code.** Reading lens, room lens, lens band, lens density, worktable rooms rail. There is no single "you are in stage X; here is what you can do" device.

**Prior art (read what is relevant):**
- `docs/design/project-ffe-workflow/*`
- `docs/design/spec-books/contracts.md`
- `docs/design/spec-book-workflow.html`
- `docs/design/the-document/the-document-schedule-package.md` (R99–R101)
- `artifacts/procurement-buying-review-2026-10-05/research/r2-item-intake.md`, `research/r3-ffe-buyer.md`
- `artifacts/document-running-a-job-2026-10-07/synthesis/direction.md` (US-18; "FF&E schedule" retired as a name; the region is "Pieces")
- `docs/vision/VISION.md`, `docs/vision/VISION-DECISIONS.md`

## Eight acceptance scenarios (Leah's asks)
- **S1 Rough-in.** In the Living Room, enter "Custom cabinet ×2", "Countertop for custom cabinets ×2", "Hardware, 2 knobs for custom cabinet", "Hardware, 4 pulls for custom cabinet" in under a minute, without leaving the list.
- **S2 One piece, many rooms.** The white oak floor (satin Bona finish, plank width TBD, local supplier priced per sq ft) is in the Hall, Living, Dining and Kitchen. The floor tile is in four rooms. Neither is "throughout".
- **S3 Placeholder → product.** "Hardware, 2 knobs" becomes the real knob, and the intent survives. The primary-bath shower is outlined as components, then backfilled.
- **S4 Labor and custom lines.** Wallpaper with an attached labor line. The oak floor priced per square foot by a local vendor, with an image and a few editable fields. Rough pricing "just so I can get my pricing lined up".
- **S5 Remove a mistake.** Delete the sunroom item that shouldn't be there. Delete a duplicate from the studio catalog.
- **S6 Move between rooms.** Drag a piece from one room to another.
- **S7 Where am I and what can I do now.** At each stage of building the pieces, the screen shows only what is possible at that step, and getting back to the project overview is obvious. The time tracker does not interrupt in-project work.
- **S8 Paint and finish schedule.** A room-by-finish document that goes only to the painter. Leah: it "does not have to live in Patina", but "a visual note for everybody that this room is this color" would help.

## Personas
- **Leah:** founder-designer with deep domain expertise and little patience for software. She thinks in rooms and elevations.
- **The first hire:** a junior designer or assistant, competent in the craft, new to the studio's way and to Patina. Often entering lines from Leah's drawings.

## Evidence conventions
- Cite every finding with a `file:line` or a walk screenshot path (`walk/*.jpg`).
- Give each finding a **severity** (S1 blocks the job, S2 costs real time or causes errors, S3 friction, S4 polish) and a **confidence** (high, medium or low). Report every finding; do not filter by severity.
- Separate **observation** (what is there), **interpretation** (why Leah got lost) and **proposal**.
- Voice:
  - Never say "AI", "algorithm", "engine" or "powered by". Patina's intelligence is "designer-taught".
  - No Pledge, and not the tagline "Where Time Adds Value".
  - Avoid "curated", "luxury", "bespoke", "elevated" and "disrupt".
  - Plain words a designer uses: line, piece, room, spec, placeholder, allowance, labor.
- Paths: everything under `artifacts/pieces-building-room-2026-10-08/`.
