# Technical Foundations

Shared architecture for all three phases. Read this before writing code in any
of them.

Master PRD: [00-mood-board-prd.md](./00-mood-board-prd.md) ·
[Phase 1](./01-phase-1-the-room.md) ·
[Phase 2](./02-phase-2-the-audience.md) ·
[Phase 3](./03-phase-3-the-reach.md)

---

## Contents

- [Current-state map](#current-state-map)
- [Data model reference](#data-model-reference)
- [Undo/redo command stack](#undoredo-command-stack)
- [Canvas auto-grow model](#canvas-auto-grow-model)
- [Export architecture](#export-architecture)
- [Unified renderer plan (Phase 2, Ruling #2)](#unified-renderer-plan-phase-2-ruling-2)
- [Risk register](#risk-register)
- [Cross-phase verification strategy](#cross-phase-verification-strategy)

---

## Current-state map

Line counts as of 2026-08-03; they will drift. Paths are exact.

### Reuse inventory

| Asset | Path | Size | Phase 1 | Phase 2 | Phase 3 |
|-------|------|------|---------|---------|---------|
| Inline board editor | `apps/designer-portal/src/components/portal/scope-builder/board-editor.tsx` | 1644 | **Kept as flag-off path**; behavior mined, not moved | untouched | delete decision ([O4](./00-mood-board-prd.md#9-open-items)) |
| Boards facet host | `apps/designer-portal/src/components/portal/scope-builder/boards-builder.tsx` | 555 | **Rewritten** as the launcher strip (flag-on) / legacy editor (flag-off) | — | — |
| Facet mount point | `apps/designer-portal/src/components/document/rooms/drafting/drafting-room.tsx:603` | — | mount unchanged; child changes | — | — |
| Editor canvas | `packages/patina-design-system/src/components/BoardCanvas/BoardCanvas.tsx` | 474 | **Superseded** by `BoardRoomCanvas`; byte-unchanged | untouched | delete decision |
| Static canvas | `packages/patina-design-system/src/components/BoardCanvas/BoardStatic.tsx` | — | untouched | **deprecated** (no consumers) | delete decision |
| Client composition | `packages/patina-design-system/src/components/proposal/BoardsBlock.tsx` (`BoardsBlock`, `BoardComposition`, `ScaledBoardCanvas`, `StackedBoardItems`, `FeaturedPieces`, `sourceHost`) | 710 | **byte-unchanged** (non-regression contract) | **Extended** — becomes the single client renderer | export source of truth |
| Pin renderer | `apps/designer-portal/src/components/portal/scope-builder/board-item-renderer.tsx` | 265 | **Reused** via `renderItem` prop | — | — |
| Arrange / sections helpers | `apps/designer-portal/src/components/portal/scope-builder/board-arrange.ts` (`arrangeBoardItems`, `sectionBounds`, `itemSectionId`, `newSectionId`, `addSection`, `renameSection`, `deleteSection`, `moveSection`) | 192 | **Evolved** — `arrangeBoardItems` takes a subset + origin (Tidy) | `sectionBounds` shared with the renderer | — |
| Board→schedule helpers | `apps/designer-portal/src/lib/scope/board-schedule.ts` (`buildSendToScheduleArgs`, `computeBoardDrift`, `findScheduleTwin`) | 110 | **Reused** from the inspector | — | the half-built board→spec path ([O3](./00-mood-board-prd.md#9-open-items)) |
| Suggestions rail | `apps/designer-portal/src/components/portal/scope-builder/board-suggestions-rail.tsx` (RPC `find_taught_alternatives`, 00271; logs `suggestion_events` context `board_rail`) | 185 | **Re-hosted** at the rail bottom; context string unchanged | — | — |
| Board hooks | `packages/supabase/src/hooks/use-boards.ts` — 14 exports: `useBoards`, `summarizeBoard`, `useBoard`, `useBoardsWithItems`, `useUpsertBoard`, `useDuplicateBoard`, `useDeleteBoard`, `useAddBoardItem`, `useUpdateBoardItem`, `useDeleteBoardItem`, `useSaveBoardLayout`, `useProjectBoards`, `useProjectOwnedBoards`, `useContinueBoardInProject` | 802 | **Reused**; last three remain dead | **last three mounted** | — |
| Feedback hooks | `packages/supabase/src/hooks/use-item-feedback.ts` (`useBoardFeedback`, `useClientBoardFeedback`) | — | read-only chips | **write path for on-canvas verdicts** | — |
| Buffered autosave | `apps/designer-portal/src/hooks/use-buffered-autosave.ts` (`delay = 600`) | 288 | **Reused unchanged** | — | — |
| Structural barrier | `apps/designer-portal/src/lib/proposal-autosave-registry.ts` (`registerProposalAutosave`, `flushProposalAutosaves`, `runProposalAutosaveAction`, `ProposalAutosaveBarrierError`, `resetProposalAutosaveRegistryForTests`) | 265 | **Generalized** to an owner ref | project-owned boards depend on it | — |
| Retired-item guard | `board-editor.tsx` `retiredLayoutItemIdsRef` (lines 168, 255, 274, 326, 413) | — | **Removed**, replaced by the command stack | — | — |
| Product picker | `apps/designer-portal/src/components/portal/proposals/product-picker-modal.tsx` (`scope='library'`, 3-layer + captures + draft-create, `useCaptureFromUrl`) | 992 | **Reused** from the rail | — | unfurl entry point |
| Full-screen idiom | `apps/designer-portal/src/components/document/overlays/full-screen-viewer-shell.tsx` (`fixed inset-0 z-[60]`, focus trap, ref-counted body scroll lock) | 283 | **Pattern source** (the room is a route, not an overlay) | — | — |
| Chrome-shed route idiom | `apps/designer-portal/src/app/(document)/doc/[id]/spec-book/layout.tsx` (`return children`) | 7 | **Copied verbatim** | — | — |
| Command bar registry | `apps/designer-portal/src/lib/document/registry.tsx:124` (aliases `drafting`, `proposal editor`, `boards`, `moodboards`) | — | **Extended** with dynamic `board: <name>` entries | — | — |
| Feature flag hook | `apps/designer-portal/src/hooks/use-feature-flag.ts` (fail-closed PostHog, `NEXT_PUBLIC_FLAG_OVERRIDES`) | — | gate `mood-board-editor` in-component | — | — |
| Client board block | `apps/client-portal/src/components/board-block.tsx` | 98 | untouched | **swapped to the unified renderer** | — |
| Guest share route | `apps/client-portal/src/app/share/[token]/page.tsx` (server-resolved, RLS bypass via SECURITY DEFINER RPC) | — | untouched | **swapped**; board-scoped shares | — |
| Proposal mirror | `apps/designer-portal/src/components/document/drafting/proposal-mirror.tsx` | 667 | untouched | **swapped** | — |
| Spec PDF function | `supabase/functions/spec-pdf/index.ts` (`kind: 'item' \| 'document' \| 'board'`; board branch at :315) | — | untouched | untouched | **`kind: 'board-composition'` added** |
| Spec PDF renderer | `supabase/functions/_shared/spec-pdf.ts` (`@react-pdf/renderer@4.3.0` on Deno via `npm:`) | 855 | untouched | untouched | **extended** — every importer must be redeployed |
| Verdict chip spec | `apps/designer-portal/src/lib/document/verdict-chip.ts` | — | — | **reused** for on-canvas chips | — |

### Available dependencies

In the tree and usable: `@dnd-kit/core ^6.3.1` (+ `sortable`, `utilities`),
`framer-motion 12`, `@tanstack/react-virtual`, `react-dropzone`,
`zustand ^4.5` (designer-portal), `@react-pdf/renderer@4.3.0` (Deno edge only).

**Not** in the tree and **not to be added**: `konva`, `fabric`, `moveable`,
`react-rnd`, `html2canvas`, `satori`.

Platform: Next 16.2.6 (`--webpack` builds required), React 19.
`@react-three/fiber@8` crashes under React 19 — irrelevant here, no 3D.

### Z ladder

| Layer | z | Note |
|-------|---|------|
| Document sheet | 50 | |
| Full-screen viewers | 60 | The room borrows the *pattern* but is a route at the base layer |
| Command bar | 70 | ⌘K must continue to open above the room |

---

## Data model reference

No new tables in Phases 1–2. One new table in Phase 3.

### `proposal_boards` (00179, extended 00264, 00272)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `proposal_id` | UUID FK | One of the two owner legs |
| `project_id` | UUID FK | The other owner leg (00272) |
| — | CHECK | `chk_proposal_boards_owner` — exactly one owner |
| `name` | TEXT | Inline-renamed in the room top bar |
| `sections` | JSONB | Section **definitions** (00264). Membership is not here. |
| `status` | TEXT | `active` \| `archived` (00264) |
| `canvas_width` | INT | Default 1200. **No UI wrote this before Phase 1.** |
| `canvas_height` | INT | Default 800. Same. |
| `background_color` | TEXT | Default `'#FAF8F5'`. Same. |
| `created_at` / `updated_at` | TIMESTAMPTZ | `updated_at DESC` orders desk recents |

### `proposal_board_items` (00179)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Undo must preserve this on delete/restore |
| `board_id` | UUID FK | |
| `type` | TEXT | CHECK IN (`product`, `capture`, `image`, `palette`, `note`, `room_scan`) |
| `x`, `y` | numeric | Logical canvas coordinates |
| `width` | numeric | Default **240** |
| `height` | numeric | **Nullable** — null means CSS `auto` |
| `z_index` | int | Drag promotes to `maxZ + 1` |
| `rotation` | numeric | Degrees, about the item center |
| `locked` | bool | Not selectable by marquee, not movable |
| `product_id` / `capture_id` / `palette_id` | UUID FK | `ON DELETE SET NULL` — the pin survives, the link does not |
| `image_url` | TEXT | Raw `getPublicUrl` string |
| `content` | TEXT | Note body |
| `data` | JSONB | Snapshot `{ name, price_cents, vendor_name, image_url }`; **section membership is `data.section_id`** — there is no column; Phase 3 adds `source_url` and `original_image_url` keys |

**Two consequences that shape the design:**

1. Section membership living in a JSONB key means implicit membership
   (Phase 1 R1.16.3) is a UI change with **no migration** — but it also means no
   FK integrity between a member and its section. Deleting a section must
   explicitly clear members (R1.16.6); nothing in the database will do it.
2. `height` being nullable means every geometry computation — marquee,
   alignment, canvas growth, export — must resolve a *measured* height for
   auto-height items, not assume the column value. Resolve once per frame from
   the DOM and cache it; do not read layout per item per pointer move.

### `project_boards` (00179, populated by 00180)

Frozen JSONB snapshot created by `activate_proposal_as_project`. **Snapshot
items carry no `id`.** Every renderer that may receive a snapshot must tolerate
missing ids and disable id-dependent affordances (Phase 2 R2.5.3).

### `item_feedback` (00267)

Anchors: exactly one of `proposal_item_id` / `ffe_item_id` / `board_item_id`
(`item_feedback_one_anchor` CHECK). `board_item_id` references
`proposal_board_items(id) ON DELETE CASCADE`. `verdict` CHECK IN (`approved`,
`rejected`, `comment`); a `comment` requires a body
(`item_feedback_comment_needs_body`). Access is mediated by
`item_feedback_gate(...)`. Events land in `item_feedback_events`.

### `document_shares` (00266)

`proposal_id` (NOT NULL today), `token_hash` (UNIQUE, `sha256(raw)` hex — the
raw token exists only in the creator's clipboard), `label`, `visibility` JSONB
(a `ShareVisibility` record), `status` (`active` \| `revoked`), `expires_at`,
`view_count`, `last_viewed_at`, `created_by`. RLS is designer-of-proposal only;
there is **no** client or anon policy. Guests read exclusively through
`resolve_document_share()` (SECURITY DEFINER), which **forces
`feedbackEnabled = false`** on every guest render regardless of what the row
stores. Phase 2 extends this table; that guarantee must survive.

### `board_templates` (Phase 3, new)

Shape and RLS in [Phase 3 · Migrations](./03-phase-3-the-reach.md#migrations).

### Storage

Bucket `proposal-mood-boards` (00131), **public-read**. Upload path
`${ownerId}/boards/${boardId}/${uuid}.${ext}`
(`board-editor.tsx:1167`). URLs stored raw from `getPublicUrl`. No thumbnails
and no orphan cleanup until Phase 3.

Phase 3 adds sibling objects at the same prefix: `-thumb.<ext>`,
`-cutout.png`, and a stable `cover.png` per board.

---

## Undo/redo command stack

The single most consequential piece of Phase 1 architecture. It is specified
here rather than in the phase doc because Phases 2 and 3 both push commands onto
it.

### Position in the stack

```
  user gesture
        │
        ▼
  ┌──────────────┐   commands are the ONLY way local state changes
  │ Command      │   apply() / invert()
  │ stack        │
  └──────┬───────┘
         │ mutated local board state
         ▼
  ┌──────────────┐   layout deltas  ──► useBufferedAutosave (600ms) ──► useSaveBoardLayout
  │ Persistence  │   structural ops  ──► useAddBoardItem / useDeleteBoardItem /
  │ dispatch     │                        useUpdateBoardItem / useUpsertBoard (immediate)
  └──────┬───────┘   canvas size     ──► useUpsertBoard (1000ms debounce)
         │
         ▼
  ┌──────────────┐   runProposalAutosaveAction(ownerRef, fn) blocks structural
  │ Barrier      │   actions until the buffer drains
  └──────────────┘
```

The stack sits **above** persistence. Persistence is unchanged from today: the
same 600ms buffered layout batch, the same immediate structural writes, the same
barrier. Undo does not roll back the database; it produces a new local state and
lets the same persistence path carry it.

### Command shape

```ts
interface BoardCommand {
  id: string;              // gesture id — enables coalescing
  kind: BoardCommandKind;  // 'move' | 'resize' | 'rotate' | 'add' | 'delete' | …
  apply(state: BoardState): BoardState;
  invert(state: BoardState): BoardState;
  // Which persistence lane this command's effect belongs to.
  lane: 'layout' | 'structural' | 'canvas';
  // Item ids the command touches — the authority for R1.12.6.
  touches: string[];
}
```

Rules:

1. **A gesture is a command.** A drag produces one command on pointer-up, not
   one per pointermove. Live movement is *view* state; only the commit enters
   the stack.
2. **Commands are computed, not recorded.** `invert()` is derived from the
   before-state captured at gesture start, so an undo restores exact prior
   geometry rather than re-running an inverse gesture.
3. **Coalescing by gesture id.** Consecutive commands with the same `id` within
   500ms replace rather than stack — this is how a run of arrow-key nudges
   (R1.14.1) and Tidy-then-adjust-spacing (R1.15.6) become one step.
4. **Depth 100, memory only.** Never persisted, discarded on room exit
   (R1.12.4).
5. **The stack is portal-side.** `BoardRoomCanvas` in the design system is
   undo-agnostic; it emits semantic events and the portal turns them into
   commands (R1.17.4). This keeps the design-system component testable without a
   command runtime.

### Integration with the 600ms autosave batch

- A command's local mutation immediately updates the buffer. The buffer flushes
  600ms after the last mutation, exactly as today.
- **Undo is a mutation, not a rollback.** Pressing ⌘Z applies `invert()`, which
  writes the restored geometry into the same buffer. There is no separate undo
  write path and no server-side undo.
- Rapid undo/redo therefore coalesces naturally: ten ⌘Z presses in under 600ms
  produce **one** layout write carrying the final state. This is the correct
  behavior and should not be defeated.
- Server refetch stays suppressed while the buffer is dirty (existing behavior).
  The command stack must never be reconciled against a server snapshot
  mid-session; a mid-session refetch would invalidate every `invert()` closure.

### Integration with the structural barrier

`runProposalAutosaveAction` blocks a structural action (activate, clone, export,
navigation) until pending buffered writes land, throwing
`ProposalAutosaveBarrierError` on failure.

Two changes:

1. **Key on an owner ref, not a proposal id.** `{ kind: 'proposal' | 'project',
   id: string }`. Project-owned boards (00272) have no proposal and today cannot
   participate in the barrier at all. Existing proposal call sites keep working
   through a thin adapter;`resetProposalAutosaveRegistryForTests` must keep its
   current contract so existing tests are unaffected.
2. **Room exit is a structural action.** Done/Escape goes through the barrier
   (R1.3.3). A failed flush keeps the user in the room.

The barrier and the command stack are orthogonal: the barrier governs *when
writes must have landed*, the stack governs *what the local state is*. Neither
reads the other.

### Delete and resurrect

The current guard: `retiredLayoutItemIdsRef` (a `Set<string>` at
`board-editor.tsx:168`) is consulted at four sites to filter out layout
positions and items belonging to a deleted id, and an id is added on delete and
removed on failure (`:413-417`). It works, but it is a side-channel: the
deletion truth lives in a ref that the drag path has to remember to consult.

The command stack replaces it with a structural rule: **the stack is the single
authority on item existence.**

| Situation | Behavior |
|-----------|----------|
| Item deleted while no gesture is in flight | Delete command applies; the item is gone from local state; the buffer drops any pending position for it |
| A drag on item X is in flight when X is deleted | The drag's commit finds X absent from the state the command would apply to; the command is **discarded** and never enters the stack or the buffer (R1.12.6) |
| Undo of a delete | The delete command's `invert()` re-inserts the item **with its original `id`** — the command captured the full row at delete time. Persistence issues an insert specifying the id, not a create-new. This is legal because `id` is a client-generatable UUID PK |
| Redo of that undo | The delete command re-applies; the item leaves again |
| Cascaded `item_feedback` | Does **not** come back (Phase 2 R2.3.6). The delete confirmation warns when the selection carries verdicts |

Why this eliminates the race rather than re-guarding it: a late drag cannot
resurrect an item because a command applies to the state *as it is at commit
time*, and a deleted item is not in that state. There is no set to consult and
no ordering to get right. The `retiredLayoutItemIdsRef` and its five call sites
are deleted (R1.18.6) — but only after the stack is in place.

### What is not undoable

Pan, zoom, selection, rail tab, grid/snap preferences, Present-mode toggle,
export, share creation, background removal *requests* (the resulting image swap
**is** undoable — Phase 3 R3.4.4), and anything persisted outside
`proposal_boards` / `proposal_board_items`.

---

## Canvas auto-grow model

The board has a **bounded logical canvas** (`canvas_width` × `canvas_height`)
inside an **unbounded viewport**. This is the infinite-edit / bounded-present
synthesis the research recommends: the designer never hits a wall while working,
but the artifact that gets presented, shared, and exported has definite edges.

### Invariants

| # | Invariant |
|---|-----------|
| I1 | Every committed item's axis-aligned bounding box lies within `[0, canvas_width] × [0, canvas_height]` |
| I2 | The canvas never shrinks automatically. Shrinking happens only via the explicit **Trim canvas** action (R1.6.5) |
| I3 | Item coordinates are always non-negative; growth on the top or left edge translates the origin rather than admitting negative coordinates |
| I4 | Pan and zoom are never persisted; canvas size always is |
| I5 | A grow or trim is one undoable command |

### Growth algorithm

On each committed geometry change:

1. Compute `bbox` = union of every item's AABB (using measured height for
   auto-height items) and every non-empty section band.
2. If `bbox` fits inside the current canvas, stop.
3. Otherwise compute the per-edge overflow and add a **240px margin** to each
   exceeded edge.
4. For top/left overflow, compute `delta = (dx, dy)` and:
   - translate **every** item by `+delta`,
   - translate section-band geometry with them,
   - increase `canvas_width`/`canvas_height` by `delta` plus the bottom/right
     overflow,
   - adjust `pan` by `-delta * zoom` so nothing appears to move on screen.
5. Emit one `canvas-grow` command carrying the size change and the translation.
6. Persist the new size through `useUpsertBoard`, debounced 1000ms
   (R1.6.4). The item translations ride the normal 600ms layout lane.

### Why origin translation rather than negative coordinates

`x`/`y` are plain numerics with no non-negative constraint, so negative
coordinates would store fine — but every downstream consumer would have to learn
about them: `ScaledBoardCanvas`'s measurement, `sectionBounds`, the PNG painter's
canvas origin, and the PDF page mapping. Keeping the origin at `(0, 0)` means
the composition's coordinate space is identical everywhere and export needs no
offset math. The cost is a bulk translate on top/left growth, which is a batch
the 600ms layout lane already handles well.

### Interaction with the client render

`ScaledBoardCanvas` must scale by the **persisted** canvas dimensions
(Phase 2 R2.1.4), not by an inferred bounding box. If it infers, two boards with
identical compositions but different canvas sizes render at different scales, and
the designer's deliberate whitespace disappears. Whitespace is composition.

### Trim

**Trim canvas** sets the canvas to `bbox` plus the standard margin and
translates items so the origin returns to `(0, 0)`. It is one command, fully
undoable, and never runs automatically.

---

## Export architecture

Phase 3. Requirements: [R3.1](./03-phase-3-the-reach.md#r31--composition-true-export).

### The problem being solved

`spec-pdf`'s board branch (`supabase/functions/spec-pdf/index.ts:315`) rebuilds
the board as a section-grouped tile grid. Every composition decision — where a
piece sits, how large it is, what it sits next to, how much air is around it —
is discarded at the moment the board becomes a deliverable. There is no PNG at
all.

### The decision

| Output | Where it renders | With what |
|--------|-----------------|-----------|
| **PNG** | Client (browser) | A purpose-built painter onto an offscreen `<canvas>` at 2× |
| **PDF (composition)** | Server (`spec-pdf` edge function) | `@react-pdf/renderer@4.3.0`, already in that function, absolute-positioned |
| **PDF (spec sheet)** | Server, unchanged | The existing `kind: 'board'` tile grid, relabelled |

**No new rendering dependency on either side.**

### Why a painter and not `html2canvas`

- Neither `html2canvas` nor `satori` is in the tree. `html2canvas` re-implements
  a CSS subset in JS, carries documented fidelity gaps (fonts, shadows,
  gradients, transforms), and is meaningful bundle weight against the designer
  worker's 55MiB deploy gate.
- The composition is a **closed vocabulary**: six pin types plus section bands.
  A painter over a fixed vocabulary is a few hundred lines of deterministic
  drawing code, and it is exact for the shapes we actually draw.
- The `proposal-mood-boards` bucket is **public-read**, so images load with
  `crossOrigin="anonymous"` and do not taint the canvas. This is the CORS
  question that usually kills client-side raster export, and the bucket's
  existing configuration already answers it.
- The painter shares its geometry with `BoardComposition` — one bounding-box and
  transform model, one fixture, one visual-regression comparison.

**Fallback:** serialize the composition to SVG (`<foreignObject>` with inlined
CSS and base64 images) and rasterize through `Image` → canvas. Take this only if
`note` typography proves disproportionately expensive, and re-verify on Safari
(`foreignObject` has known Safari caveats). Do **not** fall back to adding
`html2canvas`.

### Why PDF renders server-side

- `_shared/spec-pdf.ts` already renders with `@react-pdf/renderer`, which
  supports absolute positioning, transforms, and remote image `src`.
- The **money-never-trade** invariant is structural there: the render-model types
  have no trade-price, markup, or margin field, so a leak is a type error rather
  than a forgotten filter. Wrapping a client-produced raster would move that
  guarantee out of the type system.
- Auth, ownership resolution, and the 404-collapse (not-found and not-owned both
  return 404, so foreign ids are not confirmed) already exist in that function.
- Vector text stays crisp and selectable; a wrapped raster would not.

### Shared geometry contract

Three renderers must agree pixel-for-pixel on the same board:

```
  board row + items + sections
            │
            ▼
   composition geometry model      ← one module, one fixture
     · resolved item boxes (measured height for auto-height)
     · rotation about center
     · section band bounds (sectionBounds)
     · canvas bounds + background
            │
   ┌────────┼────────────────┐
   ▼        ▼                ▼
BoardComposition   PNG painter    PDF composition model
   (DOM)            (canvas 2D)     (@react-pdf, server)
```

The geometry model is the contract. A change to it must update all three, and
the visual-regression test between `BoardComposition` and the painter is the
guard that catches drift in the two client-side renderers. The server renderer
is guarded by the Deno tests plus the manual print walk.

### Cover thumbnails

Covers reuse the PNG painter at 800×600 fit-contain, debounced 30s after the
last structural change and on room exit, written to a **stable** path
`${ownerId}/boards/${boardId}/cover.png` (overwritten, never versioned — a
versioned cover path would generate orphans faster than the sweep clears them).

---

## Unified renderer plan (Phase 2, Ruling #2)

**Ruling #2 (Kody, 2026-08-03):** presentation mode *is* the client render.
Client portal, guest share, and the proposal mirror all move to the new
full-bleed composition renderer. Sections are visible to clients. One render
path.

### End state

```
                  ┌─────────────────────┐
                  │  BoardRoomCanvas    │  editing only
                  │  (design system)    │  pan/zoom/marquee/handles/guides
                  └─────────────────────┘
                            │ Present toggle
                            ▼
   ┌──────────────────────────────────────────────────────┐
   │                 BoardComposition                     │  presenting only
   │              (design system, extended)               │
   │  props: items · sections · canvasW/H · background     │
   │         fit · fullBleed · showNotes · interactive     │
   └───┬───────────┬───────────────┬───────────────┬──────┘
       │           │               │               │
   Present     client portal    guest share    proposal
   (room)      board-block     share/[token]    mirror
```

`ScaledBoardCanvas` stays as the measure-and-scale wrapper inside
`BoardComposition`. `StackedBoardItems` stays as the `<sm` fallback — below the
small breakpoint a scaled composition is unreadable and the stacked list is the
correct render, now with section headings. `FeaturedPieces` stays as the product
detail list beneath the composition; it is not a duplicate render.

`BoardStatic` is deprecated in Phase 2 (no consumers) and deleted or kept in
Phase 3 cleanup ([O4](./00-mood-board-prd.md#9-open-items)).

### Two components, one job each

The Phase 1 decision to build `BoardRoomCanvas` rather than evolve `BoardCanvas`
([R1.17](./01-phase-1-the-room.md#r117--component-plan)) exists precisely so this
end state is reachable: an editing component that knows about gestures and knows
nothing about clients, and a presenting component that knows about clients and
knows nothing about gestures. A single component with an `editable` switch would
carry gesture code into every guest render and would make the Phase 2 swap a
change to the editor.

### Rollout discipline

The client proposal board block is a live revenue surface. Swap one surface at a
time (Phase 2 R2.6.5): designer Present → proposal mirror → client portal →
guest share. Verify each with side-by-side screenshots before the next.

### The non-regression contract

Phase 1 must leave `BoardCanvas.tsx`, `BoardStatic.tsx`, and `BoardsBlock.tsx`
byte-unchanged (R1.17.5). This is not stylistic: it makes "did Phase 1 break the
client render?" answerable by `git diff` rather than by inspection.

---

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Detected by |
|----|------|-----------|--------|-----------|-------------|
| **T1** | Phase 2's renderer swap regresses the live client proposal render | Medium | High — revenue surface | Phase 1 non-regression contract (R1.17.5); per-surface rollout in a fixed order (R2.6.5); shared geometry fixture between editor and renderer | AC2.1, AC2.23; side-by-side screenshot walk |
| **T2** | Command stack and the 600ms buffer disagree — lost edits or resurrected items | Medium | High — silent data loss | Stack sits strictly above persistence; a command applies to state-at-commit; undo is a forward mutation, not a rollback; refetch stays suppressed while dirty | AC1.18, AC1.19, AC1.20 |
| **T3** | Undo restores an item the server never re-accepts (id reuse rejected) | Low | Medium | `id` is a client-generatable UUID PK; restore issues an insert **specifying the id**. Verify against the actual insert path before relying on it | AC1.19 |
| **T4** | Geometry drift between `BoardComposition`, the PNG painter, and the PDF model | Medium | Medium — wrong-looking deliverable | One geometry module, one fixture, three consumers; visual-regression test between DOM and painter | AC3.1; manual print walk |
| **T5** | PNG export tainted-canvas or CORS failure | Low | Medium | Bucket is public-read; `crossOrigin="anonymous"`; failed images degrade to labelled placeholders rather than aborting | AC3.4 |
| **T6** | Font loading race produces mis-metricked export text | Medium | Low | Await `document.fonts.ready` before drawing; system-stack fallback on failure | AC3.3 |
| **T7** | Background-removal vendor cost or latency makes the feature unusable | Medium | Medium | Ruling #3 scopes it third-party-first behind our own endpoint; per-studio and global budget guards as configuration; graceful degrade when unconfigured; no retry on the mutation | AC3.16, AC3.17, AC3.18 |
| **T8** | Orphan sweep deletes a live image | Low | High — irreversible | Reference counting across **all** boards (paste-by-reference), templates, frozen snapshots, and `original_image_url`; 14-day grace; dry-run default; first production runs reviewed by hand | AC3.21, AC3.22 |
| **T9** | `document_shares` migration breaks existing proposal shares | Low | High — client-facing links | Additive only: `scope` defaults to `'proposal'`, `board_id` nullable, CHECK admits both shapes; existing rows untouched; test pre-migration rows explicitly | AC2.17 |
| **T10** | `resolve_document_share()` partial edit silently reverts an earlier fix | Medium | High | RPC head-body discipline (**patina-db-migrations**): recreate the whole body; `DROP` then `CREATE` if the signature changes | SQL scratch script; migration review |
| **T11** | Board share leaks the parent proposal | Low | High | Resolver returns only the board payload for `scope = 'board'`; guest render forced non-interactive | AC2.15 |
| **T12** | RLS on `board_templates` blocks or over-shares across studios | Medium | Medium | Follow the 00316 pattern — co-member policies must use `SECURITY DEFINER` helpers granted `TO authenticated`, or they 42501 | AC3.25, AC3.26 |
| **T13** | `_shared/spec-pdf.ts` edited but not every importer redeployed — stale functions in prod | Medium | Medium | Enumerate importers before deploying; **patina-edge-functions** | AC3.10; behavior probes post-deploy |
| **T14** | Portal deployed with a stale workspace dist (this exact mechanism shipped a `TypeError` to prod once) | Medium | High | Deploy portals **only** via `./infra/deploy-portal.sh <name>`; never `opennextjs-cloudflare build` directly | Post-deploy behavior probes |
| **T15** | Migration number collision from parallel branches | Medium | Low but noisy | Take the next `NNNNN` **at build time**, never from a doc; **patina-parallel-work** for concurrent branches | `pnpm supabase:reset` failing to replay |
| **T16** | Flag-gated UI invisible in local dev, read as a bug | High | Low | `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true` + key, or `NEXT_PUBLIC_FLAG_OVERRIDES`; documented in R1.20.3 | Developer confusion — pre-empt in the phase doc |
| **T17** | Performance collapse on dense boards (200+ pins) at low zoom | Medium | Medium | Constant-screen-size handles; measured heights cached per frame; `@tanstack/react-virtual` available if the rail or canvas needs it; a 60-pin and a 200-pin story in the design system | AC1.9 walk item 10; dense-board story |
| **T18** | No CI means a multi-phase change lands unverified | High | High | Every phase doc names its exact gate commands; **patina-verification** governs; nothing is "done" without a named command's output | The strategy below |

---

## Cross-phase verification strategy

**There is no CI on this repository.** Nothing runs tests, type-checks, or lint
on push or PR, and the docker-publish workflow is dead. Local verification is
the only verification. This section states which command actually gates which
artifact — turbo silently skips workspaces that lack a script, so "the command
passed" and "the thing was checked" are different claims
(**patina-verification**).

### What gates what

| Artifact | The command that actually gates it | Why not something else |
|----------|-----------------------------------|------------------------|
| `packages/patina-design-system` (`BoardRoomCanvas`, `BoardComposition`, the painter) | `pnpm --filter @patina/design-system test` (vitest) **and** `build` | Storybook renders but asserts nothing; `build` is what produces the dist a portal consumes |
| `packages/supabase` hooks | `pnpm --filter @patina/supabase type-check` **and** `build` | The package has thin test coverage; types plus a clean build are the real gate |
| `apps/designer-portal` | `pnpm --filter designer-portal build` is the **hard** gate; `type-check`, `test`, `lint` are the fast ones | Designer-portal's jest has ESM traps and silently-no-op `jest.mock` paths (**patina-testing**); a green suite is not proof the app compiles |
| `apps/client-portal` | `pnpm --filter client-portal type-check` **and** `build` | Only designer-portal has a working ESLint config — do not trust `lint` elsewhere |
| Supabase migrations | `pnpm supabase:reset` (full replay + wired seeds) then `pnpm db:generate` | A migration that applies to a drifted local DB proves nothing; only a full replay does |
| RLS policies | A scratch SQL script run as two distinct authenticated roles | Migration success says nothing about whether the policy admits or denies correctly |
| Edge functions | `supabase functions serve <name>` plus the Deno tests in `supabase/functions/_tests/` | Type-checking Deno code from the monorepo's TS config does not cover it |
| Media service | `pnpm --filter @patina/media test` and `build` | |
| Cross-surface visual parity | Side-by-side screenshots, by hand | No automated tool in this repo compares two live surfaces |
| Deploys | `wrangler deployments list` (oldest-first — read the **bottom**) plus behavior probes | `/version` endpoints return static defaults on the live path and prove nothing |

### Phase gates

A phase is not done until every row below has been run and its output read.

| # | Gate | Phase 1 | Phase 2 | Phase 3 |
|---|------|:--:|:--:|:--:|
| 1 | `pnpm --filter @patina/design-system test` | ● | ● | ● |
| 2 | `pnpm --filter @patina/design-system build` | ● | ● | ● |
| 3 | `pnpm --filter designer-portal type-check` | ● | ● | ● |
| 4 | `pnpm --filter designer-portal test` | ● | ● | ● |
| 5 | `pnpm --filter designer-portal lint` | ● | ● | ● |
| 6 | `pnpm --filter designer-portal build` | ● | ● | ● |
| 7 | `pnpm --filter client-portal type-check` + `build` | — | ● | ● |
| 8 | `pnpm supabase:reset` + `pnpm db:generate` | — | ● | ● |
| 9 | RLS scratch script (two roles) | — | ● | ● |
| 10 | Deno edge-function tests | — | — | ● |
| 11 | `pnpm --filter @patina/media test` + `build` | — | — | ● |
| 12 | Playwright e2e with `NEXT_PUBLIC_FLAG_OVERRIDES` | ● | ● | ● |
| 13 | Visual-regression: painter vs `BoardComposition` | — | — | ● |
| 14 | Manual walk checklist (in the phase doc) | ● | ● | ● |

### Test-authoring traps in this repo

- `jest.mock()` with a path that does not exactly match the import specifier is
  **silently ignored** — the real module runs and the test passes for the wrong
  reason.
- Any suite whose import graph reaches `@portabletext/react` throws an ESM
  `SyntaxError` in designer-portal's jest.
- Playwright: avoid `networkidle` waits (they race a GET-then-POST pattern
  already present in this app); keep a single actor per spec to avoid
  collisions; flag-gated UI is invisible without the env override.
- Never run `next build` while a `next dev` server holds the same `.next` —
  the directory is clobbered and recovery is `rm -rf .next`.
- Browse local dev via `localhost`, not `127.0.0.1` — the auth cookie is
  host-bound.

### Deploy verification

Prod mutations require an explicit user request in the session. When a phase
ships (**patina-deploy**):

1. Migrations: `supabase db push` (CLI is linked to Strata).
2. Edge functions: `supabase functions deploy <name>` — and **every** function
   importing a changed `_shared/*` module in the same pass.
3. Services: `cd infra/<unit>-worker && npx wrangler deploy`.
4. Portals: `./infra/deploy-portal.sh <name>` — **only** this. The script
   rebuilds workspace dists first; skipping that has shipped a stale dist to
   production before.
5. Verify with `wrangler deployments list` (read the bottom) plus behavior
   probes on the actual feature. Not version strings.

