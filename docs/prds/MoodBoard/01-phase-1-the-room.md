# Phase 1 — The Room

Master PRD: [00-mood-board-prd.md](./00-mood-board-prd.md) ·
Architecture: [04-technical-foundations.md](./04-technical-foundations.md) ·
Next: [Phase 2 — The Audience](./02-phase-2-the-audience.md)

---

## Overview

Phase 1 gives the board a room and a hand. It moves the editor out of the
drafting-room accordion into a dedicated full-viewport route at
`/board/[boardId]`, and implements the convergent 2026 canvas interaction bar on
**the existing data model**.

**Zero schema change.** Every persisted value Phase 1 writes already has a
column: positions and transforms on `proposal_board_items`, canvas dimensions on
`proposal_boards` (`canvas_width`, `canvas_height`, `background_color` — present
since 00179, never written by any UI), section membership in
`proposal_board_items.data.section_id`, section definitions in
`proposal_boards.sections` (00264).

**Flag:** `mood-board-editor`, fail-closed, gated *inside* the component per the
`room-file-view.tsx` pattern (`apps/designer-portal/src/hooks/use-feature-flag.ts`).

**Non-regression contract:** the client render path
(`BoardsBlock` / `BoardComposition` / `ScaledBoardCanvas` in
`packages/patina-design-system/src/components/proposal/BoardsBlock.tsx`) is
**not touched** in Phase 1. It is Phase 2's job. Phase 1 must not change its
behavior, its props, or its output.

---

## Dependencies

| Dependency | Status | Note |
|-----------|--------|------|
| `proposal_boards` / `proposal_board_items` (00179) | shipped | Full column inventory in [04 · Data model](./04-technical-foundations.md#data-model-reference) |
| `sections` JSONB + `status` (00264) | shipped | Section definitions live here; membership does not |
| `useBoard`, `useAddBoardItem`, `useUpdateBoardItem`, `useDeleteBoardItem`, `useSaveBoardLayout`, `useUpsertBoard` (`packages/supabase/src/hooks/use-boards.ts`) | shipped | `useUpsertBoard` is the write path for the auto-grown canvas size |
| `useBufferedAutosave` (`apps/designer-portal/src/hooks/use-buffered-autosave.ts`, `delay = 600`) | shipped | Reused unchanged; see R1.18 |
| `proposal-autosave-registry.ts` structural barrier | shipped | Must be generalized for project-owned board ownership — R1.18 |
| `board-arrange.ts` (`arrangeBoardItems`, `sectionBounds`, `addSection`, `renameSection`, `deleteSection`, `moveSection`, `itemSectionId`, `newSectionId`) | shipped | `arrangeBoardItems` becomes selection-scoped Tidy — R1.15 |
| `board-item-renderer.tsx` (265 lines) | shipped | Pin rendering reused as-is inside the new canvas |
| `board-suggestions-rail.tsx` (185 lines, `find_taught_alternatives` RPC from 00271) | shipped | Re-hosted at the bottom of the left rail |
| `product-picker-modal.tsx` (992 lines, `scope='library'`) | shipped | Launched from the rail; unchanged |
| `full-screen-viewer-shell.tsx` (283 lines — `fixed inset-0 z-[60]`, focus trap, ref-counted body scroll lock) | shipped | Idiom source for focus/scroll behavior; the room is a *route*, not an overlay, so it borrows the pattern rather than the component |
| `(document)/doc/[id]/spec-book/layout.tsx` (7 lines, `return children`) | shipped | Chrome-shedding route idiom to copy verbatim |
| `use-feature-flag.ts` + `NEXT_PUBLIC_FLAG_OVERRIDES` | shipped | Flag gating and e2e override |
| `@dnd-kit/core ^6.3.1`, `framer-motion 12`, `@tanstack/react-virtual`, `react-dropzone`, `zustand ^4.5` | in tree | No new canvas dependency (non-goal N1) |

Not available and not to be added: konva, fabric, moveable, react-rnd,
html2canvas, satori.

---

## Detailed requirements

### R1.1 — The route

**R1.1.1** A route exists at `apps/designer-portal/src/app/(document)/board/[boardId]/page.tsx`.

**R1.1.2** A sibling `layout.tsx` sheds the document chrome by returning
`children` unmodified, exactly as
`apps/designer-portal/src/app/(document)/doc/[id]/spec-book/layout.tsx` does.

**R1.1.3** The page resolves the board via `useBoard(boardId)`. While loading it
renders a skeleton that occupies the full viewport (no layout shift on
resolution). On a not-found or not-permitted board it renders a
not-found state and offers a return to `/desk` — it must not leak whether the id
exists.

**R1.1.4** The room occupies `100dvh` with `overflow: hidden` and
`overscroll-behavior: contain`, honouring
`env(safe-area-inset-top/bottom)`. It sits below the command bar in the z ladder
(50 doc-sheet · 60 full-screen viewers · **70 command bar**) — the room is a
route at the base layer, so ⌘K continues to open above it.

**R1.1.5** The room is gated on `mood-board-editor` **inside** the page
component. When the flag is off the page redirects to
`/drafting/[proposalId]` (or `/desk` if the proposal cannot be resolved). The
route must not 404 when the flag is off — the flag governs the experience, not
the URL's existence.

### R1.2 — Entry points

Ruling #1 (Kody, 2026-08-03): the drafting facet becomes a launcher strip **and**
boards become first-class at desk/document level.

**R1.2.1 — Drafting launcher strip.** `BoardsBuilder`
(`apps/designer-portal/src/components/portal/scope-builder/boards-builder.tsx`,
mounted at
`apps/designer-portal/src/components/document/rooms/drafting/drafting-room.tsx:603`)
renders, when the flag is on, a horizontally scrolling strip of board covers
instead of the inline editor. Each cover shows the board name, item count, and a
cover image; clicking navigates to `/board/[boardId]`. The strip carries a
"New board" affordance that creates a board and navigates straight into the
room.

**R1.2.2 — Flag-off behavior.** With the flag off, `BoardsBuilder` renders the
existing inline `board-editor.tsx` unchanged. Both code paths must build; the
inline editor is not deleted in Phase 1.

**R1.2.3 — Desk/document recents.** A "Recent boards" entry appears at
desk/document level listing the current user's most recently updated boards
(name, room chip, updated-at), each linking to `/board/[boardId]`. Ordering is
by `proposal_boards.updated_at DESC`, limited to 8.

**R1.2.4 — ⌘K entries.** `apps/designer-portal/src/lib/document/registry.tsx`
gains dynamic `board: <name>` entries for the recent boards, each navigating to
`/board/[boardId]`. The existing static `drafting-room` entry
(`registry.tsx:124`, aliases `['drafting','proposal editor','boards','moodboards']`)
keeps its aliases but must no longer be the only result for "board" — a query
of `board` or `moodboard` ranks the concrete board entries above the room entry.

**R1.2.5** Every entry point tags its origin so `mood_board_opened{source}` can
distinguish `drafting_strip`, `desk_recents`, `command_bar`, `direct_url`.

### R1.3 — Exit and return

**R1.3.1** The top bar carries a **Done** control. Escape performs the same
action when no modal, menu, or inline editor has focus.

**R1.3.2** Return target resolution, in order:
1. An explicit `?from=` search param written by in-app navigations (validated
   against an allow-list of same-origin app paths — never an open redirect).
2. `document.referrer`, accepted only when same-origin.
3. `/drafting/[proposalId]` when the board resolves to a proposal.
4. `/desk`.

**R1.3.3** Exiting flushes pending autosaves and blocks navigation until they
resolve or fail (R1.18.4). A failed flush keeps the user in the room and
surfaces the error; it must not silently discard work.

### R1.4 — Editor shell

**R1.4.1 — Top bar** (thin, single row): board name as an inline-rename field
(commit on blur/Enter, revert on Escape, writes via `useUpsertBoard`); a room
chip showing the board's parent room/proposal; an Edit/Present segmented toggle
rendered **disabled with a "Phase 2" affordance suppressed** — i.e. the toggle
is present in the layout only if it is functional, otherwise omitted (no dead
controls); a Share control **omitted** in Phase 1 (arrives in Phase 2 R2.4);
zoom readout with a Fit control; and Done.

**R1.4.2 — Left rail**, tabbed: `Library` · `Captures` · `Uploads` · `Palettes`
· `Scans`. Tab contents reuse the existing sources that `board-editor.tsx`
already wires (`product-picker-modal.tsx` for library, `useRoomScans`,
`usePalettes`, the storage upload path). The rail is collapsible and its
collapsed/expanded state and active tab persist per user in `localStorage`.

**R1.4.3** The suggestions rail (`board-suggestions-rail.tsx`) is pinned to the
bottom of the left rail. It continues to call `find_taught_alternatives` and to
log `suggestion_events` with context `board_rail` — the context string must not
change.

**R1.4.4 — Floating inspector.** The fixed 300px sidebar is removed. On
selection, a floating inspector panel appears anchored near the selection
(flipping to stay in viewport) carrying the type-appropriate controls currently
in the sidebar: size, rotation, lock, z-order, section, delete, plus
type-specific fields (note text, palette swatches, product link, send-to-
schedule). With no selection, no inspector renders.

**R1.4.5** With a multi-selection, the inspector shows only controls valid for
all selected items plus the align/distribute group (R1.11).

### R1.5 — Viewport: pan and zoom

**R1.5.1** The canvas is rendered inside a viewport element that applies a
single transform: `translate(panX, panY) scale(zoom)`. Item coordinates remain
in logical canvas space; nothing else compensates for zoom.

**R1.5.2** Plain wheel and two-finger trackpad scroll **pan** (vertical and
horizontal). This must not zoom.

**R1.5.3** `⌘`/`Ctrl` + wheel zooms. Trackpad pinch (a wheel event with
`ctrlKey` set, which is how browsers deliver pinch) zooms. Zoom is anchored at
the pointer position — the logical point under the cursor stays under the
cursor.

**R1.5.4** Zoom range is **5% – 400%** (0.05–4.0). This is deliberately wider
than the current `BoardCanvas` clamp of 0.1–3.0.

**R1.5.5** Holding `Space` and dragging pans with any tool active. The cursor
changes to a grab/grabbing affordance. Space must not scroll the page or
activate a focused control while the room has focus.

**R1.5.6** Zoom-to-fit is available from the `1` key and from a **Fit** chip in
the top bar. It computes the bounding box of all items (plus section bands) and
sets pan/zoom so the box fits with a 5% margin, clamped to the R1.5.4 range.

**R1.5.7** `⌘0` / `Ctrl+0` resets zoom to 100% at the current pan center.
`⌘+`/`⌘-` step zoom by 10% increments.

**R1.5.8** Pan and zoom are **view state only** — never persisted to the
database, never part of the undo stack. They may be cached in `sessionStorage`
keyed by board id so returning to a board restores the view within a session.

### R1.6 — Auto-growing canvas

**R1.6.1** The canvas has a bounded logical size held in `proposal_boards.canvas_width` /
`canvas_height` (defaults 1200×800). Phase 1 is the first UI to write them.

**R1.6.2** When any committed item's bounding box exceeds the current canvas
bounds, the canvas grows so that every item is contained plus a margin of
**240px** on the exceeded edges. Growth is monotonic within a session — the
canvas never shrinks automatically.

**R1.6.3** Growth on the top or left edges translates the origin: all item
coordinates shift by the growth delta and the pan compensates so the
composition does not visually jump. This is a single undoable command
(R1.12.2).

**R1.6.4** Canvas size writes are debounced at **1000ms** and go through
`useUpsertBoard`. They are structural, not layout — see R1.18.3.

**R1.6.5** A manual "Trim canvas" action in the top-bar overflow menu shrinks
the canvas to the item bounding box plus margin, as one undoable command.

**R1.6.6** Items are no longer clamped to canvas bounds on add. An item dropped
beyond the bounds triggers R1.6.2.

Full model: [04 · Canvas auto-grow](./04-technical-foundations.md#canvas-auto-grow-model).

### R1.7 — Placement

**R1.7.1 — Drop at pointer from the rail.** Dragging an item out of the left
rail and releasing over the canvas creates the pin with its top-left at the
pointer's logical coordinates, offset by half the default width/height so the
drop point is the item's visual center. The current `(n % 8) * 32px` center
cascade is removed.

**R1.7.2 — Click-to-add fallback.** Clicking (not dragging) a rail entry adds
the item at the center of the *current viewport*, not the center of the canvas.

**R1.7.3 — OS file drop.** Dropping one or more image files onto the canvas
uploads each to `proposal-mood-boards` at
`${ownerId}/boards/${boardId}/${uuid}.${ext}` (the existing path from
`board-editor.tsx:1167`) and creates one `image` pin per file. Multiple files
lay out left-to-right from the drop point with a 24px gutter. Upload progress is
shown per file; a failed upload leaves no pin and surfaces an error.

**R1.7.4** Accepted drop types: `image/png`, `image/jpeg`, `image/webp`,
`image/gif`, `image/avif`. Anything else is rejected with a message naming the
accepted types. A per-file size cap of 20MB applies; Phase 3 adds upload-time
downscale (R3.5).

**R1.7.5 — Paste.** `⌘V` with image data on the clipboard uploads and places an
`image` pin at the last-known pointer position (or viewport center if the
pointer has not entered the canvas). `⌘V` with Patina board-item JSON on the
clipboard performs R1.13.3. `⌘V` with a URL is Phase 3 (R3.3) — in Phase 1 it is
a no-op.

**R1.7.6** Every placement path is a single undoable command, including a
multi-file drop (one command, N items).

### R1.8 — Selection

**R1.8.1** Clicking an item selects it exclusively. Clicking empty canvas clears
the selection.

**R1.8.2** Dragging from empty canvas draws a marquee. On release, every item
whose bounding box **intersects** the marquee is selected. Holding Shift during
a marquee adds to the existing selection.

**R1.8.3** Shift-click toggles an item's membership in the selection.

**R1.8.4** `⌘A` selects all unlocked items on the board. `Escape` with a
selection clears it (and only then, at the outermost level, exits the room —
Escape is consumed by the innermost active affordance).

**R1.8.5** Dragging any selected item moves the entire selection by the same
delta, as one command.

**R1.8.6** Locked items (`locked = true`) are not selectable by marquee, are
skipped by `⌘A`, and cannot be moved or resized. They remain clickable to
select-and-unlock via the inspector or context menu.

**R1.8.7** Selection is rendered as an outline plus handles at a *constant
screen size* regardless of zoom — handles do not scale with the canvas.

### R1.9 — Resize and rotate handles

**R1.9.1** A single selection renders 8 resize handles (4 corner, 4 edge) and 1
rotate handle above the top edge.

**R1.9.2** Corner drags on `product`, `capture`, `image`, and `room_scan` pins
preserve aspect ratio by default; holding Shift releases the constraint. Edge
drags on those types set width and let height follow the aspect. `note` and
`palette` pins resize freely on both axes.

**R1.9.3** `height` is nullable in the schema (CSS `auto`). A resize that only
changes width writes `width` and leaves `height` null. A resize that sets an
explicit height writes both. The inspector offers "reset height to auto".

**R1.9.4** Minimum item size is 40×40 logical px. There is no maximum beyond the
canvas growth rule (R1.6).

**R1.9.5** The rotate handle sets `rotation` in degrees. Holding Shift snaps to
15° increments. Rotation is about the item's center. Bounding-box math for
marquee, alignment, and canvas growth uses the **axis-aligned bounding box of
the rotated item**.

**R1.9.6** With a multi-selection, resize handles operate on the selection's
bounding box and scale all members proportionally about the anchor. Rotate is
disabled for multi-selections in Phase 1.

**R1.9.7** Each completed resize or rotate gesture is one undoable command
(the gesture, not each intermediate frame).

### R1.10 — Smart guides and snapping

**R1.10.1** While dragging or resizing, alignment guides appear when the moving
item's edge or center is within **6 screen px** of another item's corresponding
edge or center, or of the canvas center. Guides render as 1px lines at constant
screen width.

**R1.10.2** Equal-spacing hints appear when the gap between the moving item and
a neighbor matches an existing gap in the same axis within the same tolerance,
rendered as paired distance markers.

**R1.10.3** When a guide is active, the item snaps to it. Holding `Alt` during
the gesture suppresses all snapping.

**R1.10.4 — Grid snap is decoupled from grid visibility.** Two independent
settings persist per user in `localStorage`: `showGrid` and `snapToGrid`. Grid
snap, when on, rounds to `gridSize` (default 20). This replaces the current
`BoardCanvas` coupling where snapping only happens when `layout === 'grid'`
(`BoardCanvas.tsx:225-227`).

**R1.10.5** When both smart guides and grid snap are active, the smart guide
wins within its tolerance.

**R1.10.6** Guides are suppressed under `prefers-reduced-motion` only for their
fade animation, not their presence — the guide still appears, it just does not
animate.

### R1.11 — Align and distribute

**R1.11.1** With 2+ items selected, the inspector shows align controls: left,
horizontal center, right, top, vertical center, bottom. Alignment is relative to
the selection bounding box.

**R1.11.2** With 3+ items selected, distribute controls appear: distribute
horizontal centers, distribute vertical centers, distribute with equal
horizontal gaps, distribute with equal vertical gaps.

**R1.11.3** Locked items inside a selection are used as alignment references but
are never moved.

**R1.11.4** Each align or distribute action is one undoable command covering all
moved items.

### R1.12 — Undo and redo

Design and rationale: [04 · Undo/redo command stack](./04-technical-foundations.md#undoredo-command-stack).
This section states the behavior the implementation must exhibit.

**R1.12.1** `⌘Z` / `Ctrl+Z` undoes; `⇧⌘Z` / `Ctrl+Y` redoes. Both are disabled
(and their menu entries greyed) when the respective stack is empty.

**R1.12.2** Every canvas mutation is a command: add, delete, move, resize,
rotate, z-order change, lock toggle, section membership change, section
create/rename/delete/reorder, tidy, align, distribute, duplicate, paste, canvas
grow, canvas trim.

**R1.12.3** A gesture produces exactly one command. Dragging an item 400px does
not produce 400 undo steps. A multi-item operation is one command.

**R1.12.4** Undo depth is 100 commands, held in memory for the life of the room.
Leaving the room discards the stack; the stack is never persisted.

**R1.12.5** Undoing a delete restores the item **with its original id**. The
implementation must re-insert rather than create — see
[04 · Delete and resurrect](./04-technical-foundations.md#delete-and-resurrect).

**R1.12.6** A drag gesture that was in flight when its item was deleted is
dropped and never written. This replaces the `retiredLayoutItemIdsRef` guard in
`board-editor.tsx` (lines 168, 255, 274, 326, 413) with a structural rule: the
command stack is the single authority on item existence.

**R1.12.7** Undo/redo does not undo pan, zoom, selection, rail tab, or any
`localStorage` preference.

**R1.12.8** Text edits inside a `note` pin use the browser's native text undo
while the field has focus; committing the edit pushes one command onto the board
stack.

### R1.13 — Duplicate, copy, paste

**R1.13.1** `⌘D` duplicates the selection, offset by +24/+24 logical px, with
the duplicates selected.

**R1.13.2** `Alt`-dragging a selection leaves the originals in place and moves
duplicates. The duplicate is created at gesture start so guides and snapping
apply to the moving copy.

**R1.13.3** `⌘C` writes the selection to the system clipboard as
`application/json` under a Patina-namespaced envelope carrying item type,
geometry, `data` snapshot, and section name (not section id). `⌘V` on any board
reconstructs them: geometry is preserved relative to the selection's bounding
box, placed at the pointer; a section name that exists on the target board joins
that section, otherwise membership is dropped.

**R1.13.4** Product, capture, palette, and room-scan pins retain their FK
(`product_id`, `capture_id`, `palette_id`) on paste **within the same owner
scope**. Pasting into a board under a different owner drops the FK and keeps the
`data` snapshot, so the pin still renders.

**R1.13.5** Image pins paste by reference to the same storage object — Phase 1
does not copy bytes. (Phase 3's orphan-cleanup job must therefore be
reference-aware; see [R3.5](./03-phase-3-the-reach.md#r35--image-pipeline).)

**R1.13.6** `⌘X` cuts (copy + delete as one command).

### R1.14 — Nudge, z-order, lock, context menu

**R1.14.1** Arrow keys move the selection 1 logical px; `Shift`+arrow moves
10px. A run of nudges within 500ms of each other coalesces into one command.

**R1.14.2** Z-order shortcuts: `⌘]` bring forward, `⌘[` send backward,
`⌘⇧]` bring to front, `⌘⇧[` send to back. These write `z_index`.

**R1.14.3** Dragging an item continues to promote it to `maxZ + 1`, as
`BoardCanvas` does today, and that promotion is part of the drag command.

**R1.14.4** Right-click (and the keyboard context-menu key, and a long-press on
touch) opens a context menu on the selection with: Bring forward / Send backward
/ Bring to front / Send to back · Lock / Unlock · Duplicate · Copy · Cut ·
Delete · Add to section ▸ / Remove from section · type-specific actions
(Send to schedule, Open product, Replace image).

**R1.14.5** `⌘L` toggles lock on the selection. Locked items render a lock
affordance on hover.

**R1.14.6** `Delete` / `Backspace` deletes the selection as one command.

### R1.15 — Tidy

**R1.15.1** A **Tidy** control in the top bar and the `⇧T` shortcut arrange
items into an even grid.

**R1.15.2** Scope: when 2+ items are selected, Tidy arranges **only the
selection**, within the selection's bounding box origin. With no selection (or
one), Tidy arranges the whole board, section by section.

**R1.15.3** Tidy preserves reading order — items are ordered by their current
position (top-to-bottom, then left-to-right, with a row tolerance of half the
median item height) and laid out in that order.

**R1.15.4** Tidy is implemented by evolving `arrangeBoardItems` in
`apps/designer-portal/src/components/portal/scope-builder/board-arrange.ts`
(currently whole-board, section-aware) to accept an explicit item subset and an
origin. Its existing section-grouping behavior is the no-selection path.
`board-arrange.test.ts` must be extended, not replaced.

**R1.15.5** Tidy is one undoable command. Undoing it restores every prior
position exactly.

**R1.15.6** After Tidy, a spacing control appears transiently allowing the gutter
to be adjusted; each adjustment replaces the previous Tidy command rather than
stacking (command coalescing by gesture id).

### R1.16 — Sections with implicit membership

**R1.16.1** Section definitions continue to live in `proposal_boards.sections`
(JSONB, 00264) and membership continues to live in
`proposal_board_items.data.section_id`. **No column is added.**

**R1.16.2** A section renders as a labelled band behind its members, whose
bounds are computed by `sectionBounds` from `board-arrange.ts`, padded.

**R1.16.3 — Implicit membership (FigJam pattern).** Dropping an item so that its
center falls inside a section band sets `data.section_id` to that section.
Dropping it outside every band clears `data.section_id`. There is no "add to
group" step. The band highlights during a drag that would result in joining.

**R1.16.4** Dragging a section band's label moves the band **and every member**
as one command.

**R1.16.5** Section name and color are edited inline on the band label. Create,
rename, delete, and reorder go through the existing `addSection`,
`renameSection`, `deleteSection`, `moveSection` helpers.

**R1.16.6** Deleting a section clears `data.section_id` on its members; the
members are not deleted. This is one undoable command.

**R1.16.7** Sections have no visual presence on client-facing renders in Phase 1
— that changes in [Phase 2 R2.1](./02-phase-2-the-audience.md#r21--the-unified-composition-renderer).

### R1.17 — Component plan

**Decision: build a new `BoardRoomCanvas` in `@patina/design-system`. Leave
`BoardCanvas` and the `BoardsBlock` render path untouched in Phase 1.**

Justification:

- `BoardCanvas.tsx` is built around dnd-kit sensors with a `transform:
  scale(localZoom)` wrapper and no viewport translation. The Phase 1 interaction
  bar needs a pointer-event model over a `translate + scale` viewport with
  marquee, handles, guides, and a command stack. That is a different event
  architecture, not an increment on the existing one.
- `BoardCanvas` is a *shared package* component. Its zoom prop is controlled
  with a re-sync effect (`BoardCanvas.tsx:162-168`) and its drag math divides
  dnd-kit's screen-space transform by the zoom factor (`:409-413`). Rewriting
  those semantics in place puts churn on every existing consumer during a phase
  whose explicit non-regression contract is that the client render must not
  change.
- Two components with one job each — `BoardRoomCanvas` (editing) and
  `BoardComposition` (presenting, which [Phase 2](./02-phase-2-the-audience.md)
  makes the single client render) — is a cleaner end state than one component
  with an `editable` switch.

**Fallback:** if `BoardRoomCanvas` and `BoardCanvas` drift far enough that pin
rendering diverges, extract the shared pin-rendering layer into a common
`BoardPin` module consumed by both, rather than merging the canvases. Retirement
of `BoardCanvas` and `BoardStatic` is tracked as [open item O4](./00-mood-board-prd.md#9-open-items)
and is a Phase 3 cleanup decision, not a Phase 1 one.

**R1.17.1** `BoardRoomCanvas` lives at
`packages/patina-design-system/src/components/BoardRoomCanvas/` with
`BoardRoomCanvas.tsx`, `BoardRoomCanvas.stories.tsx`, `BoardRoomCanvas.test.tsx`,
and an `index.ts`, exported from the package root.

**R1.17.2** It is presentational and controlled: it owns pan/zoom/marquee/handle
*gesture* state and emits semantic events (`onItemsMoved`, `onItemResized`,
`onItemRotated`, `onSelectionChange`, `onItemsDropped`, `onSectionMembership`,
`onCanvasGrow`). It owns **no** persistence, no React Query, no Supabase.

**R1.17.3** Pin bodies are supplied by the consumer via a `renderItem` prop, so
the designer portal keeps `board-item-renderer.tsx` as the source of pin
appearance.

**R1.17.4** The command stack (R1.12) lives in the **designer portal**, not the
design system — the design system component must remain undo-agnostic.

**R1.17.5** `BoardCanvas.tsx`, `BoardStatic.tsx`, and `BoardsBlock.tsx` must be
byte-unchanged at the end of Phase 1.

### R1.18 — Persistence and autosave

**R1.18.1** Layout mutations (x, y, width, height, z_index, rotation) continue to
flow through `useSaveBoardLayout`'s batched upsert, buffered by
`useBufferedAutosave` at `delay = 600`. Phase 1 does not change the delay or the
batching shape.

**R1.18.2** Structural mutations (add, delete, lock, section membership, item
`data` edits, board name) write immediately through their existing hooks
(`useAddBoardItem`, `useDeleteBoardItem`, `useUpdateBoardItem`,
`useUpsertBoard`) — they are not buffered.

**R1.18.3** Canvas size (R1.6) is structural but debounced at 1000ms through
`useUpsertBoard`.

**R1.18.4 — Barrier generalization.** `runProposalAutosaveAction` in
`apps/designer-portal/src/lib/proposal-autosave-registry.ts` keys the structural
barrier on proposal id. Project-owned boards (00272: `project_id` owner leg,
`chk_proposal_boards_owner`) have no proposal. The registry must key on an
**owner ref** — `{ kind: 'proposal' | 'project', id }` — so a project-owned
board's flush barrier works without a proposal in scope. Existing proposal call
sites keep working via a thin adapter; the exported
`runProposalAutosaveAction` signature may be widened but must not break
`resetProposalAutosaveRegistryForTests`.

**R1.18.5** Server refetch continues to be suppressed while the buffer is dirty
(current behavior). The command stack must never be reconciled against a server
snapshot mid-session.

**R1.18.6** `retiredLayoutItemIdsRef` and its five call sites are removed once
R1.12.6 is in place. Removing it before the command stack exists is a
regression.

### R1.19 — Accessibility

**R1.19.1** Every canvas item is a focusable element in DOM order matching
z-order (bottom to top). Tab and Shift+Tab traverse items; Enter opens the
inspector for the focused item.

**R1.19.2** Arrow-key nudge (R1.14.1) works from keyboard focus, not only from
pointer selection.

**R1.19.3** The context menu (R1.14.4) opens from the keyboard context-menu key
and from `⇧F10`, and is fully arrow-navigable.

**R1.19.4** Focus is trapped within the room while it is open, using the
ref-counted pattern from
`apps/designer-portal/src/components/document/overlays/full-screen-viewer-shell.tsx`.
Body scroll is locked with the same ref-counted mechanism so nested overlays
(product picker, context menu) do not release it early.

**R1.19.5** The canvas has `role="application"` with an `aria-label` naming the
board, and a visually hidden live region announcing selection changes, command
results ("3 items tidied"), and undo/redo ("undo: move 3 items").

**R1.19.6** `prefers-reduced-motion: reduce` suppresses zoom/pan easing,
inspector entrance animation, and guide fades. Motion is never load-bearing for
comprehension.

**R1.19.7** All interactive controls have a visible focus ring using the
existing `--color-clay` outline token, and a minimum 44×44px hit target for
top-bar and rail controls. On-canvas handles are exempt from the 44px minimum
but must be at least 10×10px with a 20px pointer-tolerance halo.

### R1.20 — Flag and rollout

**R1.20.1** The flag `mood-board-editor` is created in PostHog, fail-closed,
initially scoped to the author only.

**R1.20.2** The flag is read via `useFeatureFlag` inside the room page (R1.1.5)
and inside `BoardsBuilder` (R1.2.1/R1.2.2). No route-level middleware gating.

**R1.20.3** Local development requires `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true`
plus a key, or `NEXT_PUBLIC_FLAG_OVERRIDES` — otherwise the gated UI is
invisible and will read as a bug.

**R1.20.4** Playwright e2e sets the flag through `NEXT_PUBLIC_FLAG_OVERRIDES`.

---

## Out of scope for Phase 1

| # | Not in Phase 1 | Where it lands |
|---|----------------|----------------|
| — | Presentation mode, Present toggle behavior | [Phase 2 R2.1](./02-phase-2-the-audience.md#r21--the-unified-composition-renderer) |
| — | Any change to the client render (`BoardsBlock`, `BoardComposition`, `ScaledBoardCanvas`, `board-block.tsx`, `share/[token]`, `proposal-mirror.tsx`) | Phase 2 |
| — | Sections visible to clients | [Phase 2 R2.1](./02-phase-2-the-audience.md#r21--the-unified-composition-renderer) |
| — | On-canvas verdicts | [Phase 2 R2.3](./02-phase-2-the-audience.md#r23--on-canvas-verdicts) |
| — | Board-level share; the top-bar Share control | [Phase 2 R2.4](./02-phase-2-the-audience.md#r24--board-scoped-share) |
| — | Project-owned board UI (00272/00273) | [Phase 2 R2.5](./02-phase-2-the-audience.md#r25--project-phase-boards) |
| — | PNG/PDF export, cover thumbnails | [Phase 3 R3.1/R3.2](./03-phase-3-the-reach.md) |
| — | URL paste unfurl (⌘V with a URL is a no-op in Phase 1) | [Phase 3 R3.3](./03-phase-3-the-reach.md#r33--url-unfurl-and-capture-sources) |
| — | Background removal | [Phase 3 R3.4](./03-phase-3-the-reach.md#r34--background-removal) |
| — | Image downscale, thumbnails, orphan cleanup | [Phase 3 R3.5](./03-phase-3-the-reach.md#r35--image-pipeline) |
| — | Templates | [Phase 3 R3.6](./03-phase-3-the-reach.md#r36--board-templates) |
| — | Deleting `board-editor.tsx` / `BoardCanvas` / `BoardStatic` | Phase 3 cleanup, [O4](./00-mood-board-prd.md#9-open-items) |
| — | Realtime presence | [O1](./00-mood-board-prd.md#9-open-items) — Phase 4 or never |

---

## Migrations

**None.** Phase 1 writes only to columns that already exist:

| Write | Column | Migration that created it |
|-------|--------|---------------------------|
| item geometry | `proposal_board_items.x/y/width/height/z_index/rotation/locked` | 00179 |
| section membership | `proposal_board_items.data.section_id` (JSONB key) | 00179 |
| section definitions | `proposal_boards.sections` (JSONB) | 00264 |
| canvas size | `proposal_boards.canvas_width/canvas_height` | 00179 (never written by UI before) |
| board name | `proposal_boards.name` | 00179 |

If Phase 1 discovers a genuine schema need, take the next `NNNNN` at build time
(`ls supabase/migrations/*.sql | sort | tail -1`) and follow the
**patina-db-migrations** skill — do not hardcode a number from this doc.

Because Phase 1 writes `canvas_width`/`canvas_height` for the first time,
`pnpm db:generate` is **not** required (no schema change), but any board created
before Phase 1 will carry the 1200×800 defaults and will grow on first edit.

---

## Analytics

All events go through the portal's PostHog client. Flag exposure for
`mood-board-editor` is captured automatically by `useFeatureFlag`; verify it
appears on the same distinct id as the events below.

| Event | Properties | Fired when |
|-------|-----------|-----------|
| `mood_board_opened` | `source` (`drafting_strip` \| `desk_recents` \| `command_bar` \| `direct_url`), `board_id`, `item_count`, `owner_kind` (`proposal` \| `project`) | The room mounts with a resolved board |
| `item_added` | `type` (`product` \| `capture` \| `image` \| `palette` \| `note` \| `room_scan`), `source` (`rail_drag` \| `rail_click` \| `file_drop` \| `paste` \| `duplicate` \| `suggestion`), `board_id`, `count` | An add command commits |
| `board_arranged` | `scope` (`selection` \| `board`), `item_count`, `board_id` | Tidy commits |
| `board_done` | `duration_ms`, `item_count`, `command_count`, `used_undo`, `used_multiselect`, `used_tidy`, `used_handles`, `board_id` | Done or Escape exits the room |

`board_done.used_*` booleans feed metric **M4**. `duration_ms` feeds **M2**,
`item_count` feeds **M3** — capture the pre-flag baseline for both before
widening the flag.

Do **not** change the `suggestion_events` context string `board_rail` emitted by
`board-suggestions-rail.tsx`; the taught-alternatives funnel depends on it.

---

## Acceptance criteria

Each row is independently verifiable. "AC" numbers map to the requirement they
prove.

| AC | Criterion | Proves |
|----|-----------|--------|
| AC1.1 | Navigating to `/board/<id>` with the flag on renders the editor at full viewport with no desk chrome, no vertical page scroll, and no layout shift after load | R1.1 |
| AC1.2 | With the flag off, `/board/<id>` redirects to `/drafting/<proposalId>` and the drafting facet renders the legacy inline editor | R1.1.5, R1.2.2 |
| AC1.3 | A board reached from the drafting strip, from desk recents, and from ⌘K each fires `mood_board_opened` with the correct distinct `source` | R1.2.5 |
| AC1.4 | ⌘K query "board" ranks concrete `board: <name>` entries above the Drafting Room entry, and selecting one navigates to `/board/<id>` | R1.2.4 |
| AC1.5 | Done and Escape both return to the origin; with no valid origin they land on `/drafting/<proposalId>`; with no proposal, `/desk`. A crafted `?from=https://evil.example` is rejected | R1.3.2 |
| AC1.6 | Two-finger trackpad scroll pans and never zooms; ⌘+wheel and pinch zoom anchored at the pointer; Space-drag pans | R1.5.2, R1.5.3, R1.5.5 |
| AC1.7 | Zoom clamps at 5% and 400%; `1` fits the composition with a margin; `⌘0` returns to 100% | R1.5.4, R1.5.6, R1.5.7 |
| AC1.8 | Dragging an item past the right edge grows `canvas_width` (verified in the DB row) by the overflow plus 240px, and the composition does not visually jump when growth occurs on the left or top | R1.6.2, R1.6.3 |
| AC1.9 | Dragging a rail item onto the canvas creates the pin centered at the release point, ±2px, at three different zoom levels | R1.7.1 |
| AC1.10 | Dropping 3 image files at once creates 3 pins laid out from the drop point, with 3 objects under `${ownerId}/boards/${boardId}/` | R1.7.3 |
| AC1.11 | Marquee selects every intersecting unlocked item; shift-click toggles; dragging one selected item moves all of them by the same delta | R1.8.2, R1.8.3, R1.8.5 |
| AC1.12 | A locked item is not marquee-selected, is skipped by ⌘A, and cannot be dragged or resized | R1.8.6 |
| AC1.13 | Corner-dragging an image pin preserves aspect ratio; Shift releases it; the persisted `width` changes and `height` stays null when only width was set | R1.9.2, R1.9.3 |
| AC1.14 | Rotating with Shift snaps to 15°; the persisted `rotation` matches; marquee selection of the rotated item uses its axis-aligned bounding box | R1.9.5 |
| AC1.15 | Dragging an item to within 6px of another item's left edge shows a guide and snaps; holding Alt suppresses both | R1.10.1, R1.10.3 |
| AC1.16 | Turning grid visibility **off** with snap **on** still snaps; turning snap off with the grid visible does not snap | R1.10.4 |
| AC1.17 | Align-left on a 3-item selection moves all three to the selection bbox's left edge, and a single ⌘Z restores all three | R1.11.1, R1.11.4 |
| AC1.18 | A 400px drag produces exactly one undo step; ⌘Z restores the original position; ⇧⌘Z re-applies | R1.12.3 |
| AC1.19 | Delete an item mid-drag (via context menu on a second item's drag in flight): no write resurrects the deleted item, and no console error appears. Undo restores the deleted item with the same `id` | R1.12.5, R1.12.6 |
| AC1.20 | `retiredLayoutItemIdsRef` no longer appears in the codebase and AC1.19 still passes | R1.18.6 |
| AC1.21 | ⌘D offsets duplicates by 24/24 and selects them; Alt-drag leaves originals in place | R1.13.1, R1.13.2 |
| AC1.22 | Copy a 2-item selection on board A, paste on board B: geometry relationship preserved, product pins keep `product_id` within the same owner and drop it across owners while still rendering | R1.13.3, R1.13.4 |
| AC1.23 | Ten rapid arrow-key nudges within 500ms collapse into one undo step totalling 10px | R1.14.1 |
| AC1.24 | Right-click, keyboard context-menu key, and ⇧F10 all open the same menu; every entry is reachable by arrow keys | R1.14.4, R1.19.3 |
| AC1.25 | Tidy with 4 items selected rearranges only those 4, preserving reading order, inside the selection bbox origin; with nothing selected it arranges the whole board section by section; one ⌘Z restores every position | R1.15.2, R1.15.3, R1.15.5 |
| AC1.26 | Dragging an item so its center lands inside a section band writes that band's id to `data.section_id`; dragging it out clears it; no explicit grouping action is required | R1.16.3 |
| AC1.27 | Dragging a section band label moves the band and all members as one undoable command | R1.16.4 |
| AC1.28 | `git diff` shows `BoardCanvas.tsx`, `BoardStatic.tsx`, and `BoardsBlock.tsx` unchanged at the end of Phase 1; the client proposal render and guest share render identically before and after | R1.17.5, non-regression contract |
| AC1.29 | A project-owned board (`project_id` set, `proposal_id` null) opens in the room, edits, and flushes on exit without throwing a barrier error | R1.18.4 |
| AC1.30 | Every item is reachable by Tab; Enter opens the inspector; arrows nudge from keyboard focus; the live region announces selection and undo | R1.19.1, R1.19.2, R1.19.5 |
| AC1.31 | With `prefers-reduced-motion: reduce`, no zoom/pan easing or inspector animation occurs, and guides still appear | R1.19.6 |
| AC1.32 | Opening the product picker from the rail and closing it leaves body scroll still locked by the room | R1.19.4 |
| AC1.33 | The four Phase 1 events fire with the documented property sets, and `board_done` carries all four `used_*` booleans | Analytics |

---

## Verification plan

There is **no CI**. These are the local gates. See **patina-verification** for
which command actually gates which workspace, and **patina-testing** for the
jest ESM traps in designer-portal.

### Gate commands

| Scope | Command | Gates |
|-------|---------|-------|
| Design system (`BoardRoomCanvas`) | `pnpm --filter @patina/design-system test` | R1.5–R1.11 gesture math, R1.17 |
| Design system build | `pnpm --filter @patina/design-system build` | Package dist that `deploy-portal.sh` will rebuild |
| Designer portal types | `pnpm --filter designer-portal type-check` | R1.17.2 prop contracts, R1.18.4 registry signature widening |
| Designer portal unit | `pnpm --filter designer-portal test` | R1.1–R1.3 route/launcher/return, R1.12 command stack, R1.15 arrange, R1.16 section membership |
| Designer portal build | `pnpm --filter designer-portal build` | The real gate for the portal (do **not** run while `next dev` holds `.next`) |
| Lint | `pnpm --filter designer-portal lint` | Only designer-portal has a working ESLint config |
| E2e | `pnpm --filter designer-portal test:e2e` with `NEXT_PUBLIC_FLAG_OVERRIDES` setting `mood-board-editor` | AC1.1, AC1.6, AC1.11, AC1.18, AC1.25 |

### Automated coverage by layer

**Design-system vitest + stories** (`BoardRoomCanvas.test.tsx`,
`BoardRoomCanvas.stories.tsx`):
- pointer→logical coordinate conversion at zoom 0.05, 1.0, 4.0 (AC1.9)
- zoom-at-pointer invariant: the logical point under the cursor is unchanged
  after a zoom step (AC1.6)
- marquee intersection including rotated items' AABB (AC1.11, AC1.14)
- guide detection tolerance in **screen** px across zoom levels (AC1.15)
- aspect-lock resize math per item type (AC1.13)
- zoom-to-fit bounding box with sections included (AC1.7)
- stories: empty board · dense board (60+ items) · rotated items · sections ·
  multi-selection with handles · reduced-motion

**Designer-portal jest**:
- route: flag-on renders, flag-off redirects (AC1.1, AC1.2)
- return-target resolution table including the open-redirect rejection (AC1.5)
- launcher strip renders covers and the legacy editor when flag-off (AC1.3)
- ⌘K registry ranking (AC1.4)
- command stack: one command per gesture, coalescing, undo/redo, delete-then-
  drag ordering (AC1.18, AC1.19, AC1.23)
- `board-arrange.test.ts` extended for selection-scoped tidy (AC1.25)
- section membership from drop geometry (AC1.26)
- autosave registry with a `project` owner ref (AC1.29)
- analytics: event names and property shape (AC1.33)

Watch the known traps: `jest.mock` with a mismatched path silently no-ops, and
`@portabletext/react` in the import graph throws an ESM `SyntaxError`.

**Playwright e2e** (flag override via env, single-actor to avoid collisions,
no `networkidle` waits):
- open room from drafting strip → drag an item → reload → position persisted
- zoom via ⌘+wheel and fit via `1`
- marquee-select 3 → move → ⌘Z → positions restored
- Tidy on a selection → ⌘Z
- Done returns to drafting

### Manual walk checklist

Automated tests cannot cover trackpad physics or browser gesture delivery. Walk
this before widening the flag:

| # | Check | Chrome/macOS trackpad | Chrome/macOS mouse | Safari/macOS | Chrome/Windows |
|---|-------|:--:|:--:|:--:|:--:|
| 1 | Two-finger scroll pans, does not zoom | ☐ | ☐ | ☐ | ☐ |
| 2 | Pinch zooms, anchored at cursor | ☐ | n/a | ☐ | ☐ |
| 3 | ⌘/Ctrl+wheel zooms | ☐ | ☐ | ☐ | ☐ |
| 4 | Space-drag pans; Space does not scroll the page | ☐ | ☐ | ☐ | ☐ |
| 5 | Handles remain constant screen size at 5% and 400% | ☐ | ☐ | ☐ | ☐ |
| 6 | OS multi-file drop lands at the pointer | ☐ | ☐ | ☐ | ☐ |
| 7 | Clipboard image paste places at pointer | ☐ | ☐ | ☐ | ☐ |
| 8 | ⌘Z/⇧⌘Z (Ctrl+Z/Ctrl+Y on Windows) through 20 mixed commands | ☐ | ☐ | ☐ | ☐ |
| 9 | Right-click menu does not open the browser menu | ☐ | ☐ | ☐ | ☐ |
| 10 | 60+ item board pans and zooms without visible frame drops | ☐ | ☐ | ☐ | ☐ |
| 11 | Client proposal render and guest share look identical to pre-Phase-1 (side-by-side screenshots) | ☐ | ☐ | ☐ | ☐ |

Browse local dev via `localhost`, not `127.0.0.1` — the portal's auth cookie is
host-bound and `127.0.0.1` produces a spurious signed-out state.

