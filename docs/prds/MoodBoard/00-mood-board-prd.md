# Mood Board PRD — "A Room for the Board"

Master PRD. Phase specs: [Phase 1](./01-phase-1-the-room.md) ·
[Phase 2](./02-phase-2-the-audience.md) · [Phase 3](./03-phase-3-the-reach.md).
Shared architecture: [Technical foundations](./04-technical-foundations.md).

---

## 1. Context

Patina's mood board already has an unusual amount of machinery behind it. It is
a real freeform canvas (`proposal_board_items` carry `x`, `y`, `width`,
`height`, `z_index`, `rotation`, `locked`) with six pin types, product pins that
retain a price/vendor snapshot and surface price drift, send-to-schedule from a
pin, per-pin client verdicts, a 3-layer library picker, a taught-alternatives
suggestion rail, sections, autosave, clone/activation carry, and guest share.

What it does not have is a room to work in, or a hand that feels like 2026.

### 1.1 The accordion

The mood board is mounted as an accordion facet. The path to it today:

```
/desk → folder → /doc/[id] → work band → /drafting/[proposalId] → scroll → expand "Boards" facet
```

- `BoardsBuilder` is mounted at
  `apps/designer-portal/src/components/document/rooms/drafting/drafting-room.tsx:603`
  inside a `FacetSection`.
- The editor (`board-editor.tsx`, 1644 lines) renders the canvas at
  `max-h-[70vh]` in a two-column grid beside a fixed 300px sidebar.
- There is **no URL for a board**. A board cannot be linked, bookmarked, or
  shared as a working surface.
- ⌘K knows the word: `lib/document/registry.tsx:124` carries aliases
  `['drafting','proposal editor','boards','moodboards']` — but the entry routes
  to the drafting page, not to a board.

The most emotional artifact a designer produces is a drawer inside a form.

### 1.2 The jank list

Verified against the current implementation. Each line is a Phase 1
requirement's reason for existing.

| # | Current behavior | Source |
|---|------------------|--------|
| J1 | Canvas is fixed at 1200×800. `canvas_width` / `canvas_height` / `background_color` columns exist on `proposal_boards`; **no UI sets them**. Items are clamped on add. | 00179; `board-editor.tsx` |
| J2 | Adds drop at canvas center with an `(n % 8) * 32px` cascade — never at the pointer. | `board-editor.tsx` |
| J3 | No multi-select, no marquee, no group move. Selection is a single item. | `BoardCanvas.tsx` |
| J4 | No undo/redo. | — |
| J5 | No copy/paste, no duplicate, no alt-drag. | — |
| J6 | No on-canvas resize or rotate handles. Sizing is S/M/L presets plus a slider in the sidebar inspector. | `board-editor.tsx` |
| J7 | No pan gesture. Zoom exists (`transform: scale`, clamped 0.1–3.0) but there is no viewport translation. | `BoardCanvas.tsx:162-168, 313` |
| J8 | Snap is welded to grid *visibility* — snapping only happens when `layout='grid'`, at `gridSize` 20. A designer who wants alignment help must accept a visible grid. | `BoardCanvas.tsx:225-227` |
| J9 | Sections exist in the data (`data.section_id`, plus a `sections` JSONB column) but are invisible on every client-facing render. | 00264; `BoardsBlock.tsx` |
| J10 | PDF export re-lays the board as a section-grouped tile grid — the composition is discarded at exactly the moment it matters. | `supabase/functions/spec-pdf/index.ts:315` |
| J11 | No PNG export at all. | — |
| J12 | No board-level share. Sharing is proposal-scoped only. | 00266 |
| J13 | Boards vanish at signing. `00272` (project-owned boards) and `00273` (`continue_board_in_project` RPC) shipped; the UI was never built. `useProjectBoards`, `useProjectOwnedBoards`, `useContinueBoardInProject` have **zero mounts**. | `use-boards.ts:720-802` |
| J14 | Images are raw public `getPublicUrl` strings. No thumbnails, no downscale, no orphan cleanup. | `board-editor.tsx:1167` |
| J15 | A guarded race exists between the 600ms layout autosave and item deletion — `retiredLayoutItemIdsRef` filters late drags so deleted items don't resurrect. It works, but it is a ref-based patch over a missing command model. | `board-editor.tsx:168, 255, 274, 326, 413` |

---

## 2. Goals and success metrics

### Goals

| G | Goal | Phase |
|---|------|-------|
| G1 | A board is a place you go, not a drawer you open: addressable route, full viewport, deep-linkable, ⌘K-reachable. | 1 |
| G2 | The canvas obeys the conventions a designer already has in their hands from Figma/FigJam/Canva/Milanote — no relearning. | 1 |
| G3 | Composition survives every downstream surface: what the designer arranged is what the client sees, shares, exports, and prints. | 2, 3 |
| G4 | The board keeps its procurement spine and extends it — verdicts anchored to pins on the client render, boards that live past signing. | 2 |
| G5 | Sourcing into a board is one action from anywhere: rail, drag, OS drop, paste, URL, extension capture. | 1, 3 |

### Success metrics

Measured in PostHog. Events are defined per phase; the flag is
`mood-board-editor` (fail-closed).

| M | Metric | Definition | Target |
|---|--------|-----------|--------|
| M1 | Room adoption | `mood_board_opened` sessions / drafting sessions that touch a board | ≥ 70% of board-touching sessions open the room within 30 days of GA |
| M2 | Session depth | median `board_done.duration` | ≥ 2× the pre-flag median accordion dwell |
| M3 | Composition richness | median `board_done.item_count` per board at Done | +30% vs. pre-flag baseline |
| M4 | Ergonomic uptake | share of `board_done` sessions that fired at least one of undo, multi-select, tidy, or resize-handle | ≥ 50% |
| M5 | Presentation reach | `board_presented` + `board_shared` per activated proposal | ≥ 1 per proposal that has a board |
| M6 | Verdict engagement | boards with ≥ 1 `verdict_given` / boards presented or shared | ≥ 40% |
| M7 | Export fidelity uptake | `board_exported{format}` per board, and the share choosing composition over the spec-sheet tile grid | composition ≥ 70% of board exports |
| M8 | No regression | zero increase in client-render error rate on the proposal board block after the Phase 2 renderer swap | 0 |

Baselines for M2/M3 must be captured **before** the flag is enabled for anyone
beyond the author — see [Phase 1 · Verification plan](./01-phase-1-the-room.md#verification-plan).

---

## 3. Personas

### P1 — The designer, authoring

Works in bursts, often with a client meeting on the calendar. Fluent in Figma or
Canva; arrives with muscle memory (space-drag, ⌘Z, ⌘D, marquee) and is
silently penalized every time it fails. Wants the board to look composed, not
gridded. Needs to get from "I saw a chair" to "it's on the board, at the right
size, next to the rug" without a modal detour.

Primary phases: 1, 3.

### P2 — The client, reviewing

Sees the board on a phone or a laptop, often without an account (guest share).
Does not know what a "section" is but understands "Living Room" as a heading.
Wants to say yes, no, or "what about in blue" against a *specific* piece, not
the board as a whole. Judges the studio by whether the thing they were shown in
the meeting matches the thing in the email.

Primary phase: 2.

### P3 — The project team, post-signing

Procurement and installation staff working after the proposal is activated.
Needs the board as a reference artifact — what was approved, what it looked
like, what got substituted — and needs to keep working on it as rooms evolve.
Today the board freezes into a `project_boards` JSONB snapshot and the UI to
reach it does not exist.

Primary phase: 2.

---

## 4. Competitive context

Four paragraphs, drawn from the design-tool and canvas-tool research. Tools are
named; research uncertainty is carried, not flattened.

**The industry baseline is settled and Patina meets most of it.** Every live
design-industry platform ships the same five things: a freeform project-scoped
canvas, a browser clipper that pulls image + price + vendor + URL from any site,
a client share link with feedback, PDF export, and a marketed board→money
tie-in. Programa is the outlier still leaning on auto-snap, though its July 2026
"Fixed Image Layouts" update is visibly moving toward manual layout control —
the research flags this as *moving toward*, not verified freeform. Per-item
approve/reject with an audit trail is present in four of the six tools surveyed
(DesignFiles, Mydoma, Houzz Pro, Studio Designer). The money tie-in is the most
consistently headline-marketed capability in the whole category: DesignFiles
converts approvals to quotes/invoices/POs "instantly", Houzz Pro "in less than a
minute", Studio Designer sells "no re-entry, no copying between tools". Patina
already has the deepest version of this — pins that carry product identity,
price, vendor, live drift, and send-to-schedule — and it is the reason not to
rebuild the board as a generic canvas.

**The wedge is the editor itself, because nobody has nailed it.** The research's
sharpest finding is that editor depth is a recurring complaint *even among tools
that have a canvas*. Mydoma's board is reportedly called "incredibly limited" by
users who want something closer to Canva; Houzz Pro's is criticized as a
business tool with a board bolted on rather than a creative surface. Background
removal has become table-stakes-adjacent — DesignFiles (auto + lasso), Houzz Pro
(automatic by default), Mydoma (first-party, claimed), and SampleBoard
historically all market it; Programa and Studio Designer conspicuously lack it,
and the research notes its absence "reads as dated". AI-assisted image editing
(DesignFiles "Enhance with AI", Houzz Pro "AI Edit", Studio Designer
"Visualize") is the 2025-26 arms race but is not yet universal. The conclusion:
a genuinely deep, delightful canvas editor is not something any of the six tools
has fully nailed. That is the opening.

**The interaction bar is a convergent convention set, and it is cheap to
adopt.** Milanote, Canva, and FigJam agree on: plain scroll/trackpad pans,
⌘/Ctrl+wheel zooms (do not invert this), Space-drag temporarily pans, marquee
plus shift-click selects, smart guides appear on move and resize, ⌘D and
Alt-drag duplicate, z-order lives on both a shortcut and a right-click menu,
items lock, autosave is continuous and invisible, pasted URLs unfurl, files drop
at the pointer, comments anchor to items, view-only share needs no login, and
export means at minimum PDF and PNG. The research calls smart guides "the single
highest-leverage feels-good investment relative to effort". Two delighters are
worth stealing outright: FigJam's Tidy Up (the most-praised interaction in the
entire research set) and FigJam's Sections, whose membership is *implicit* — you
drag an object over a section and it silently joins, no grouping step. Patina's
schema already stores section membership in `data.section_id`, so the FigJam
pattern is a UI change, not a migration.

**Two competitors are instructive in opposite directions.** Morpholio Board is
page-based, has no live share, and has a genuinely weak sync story — yet it owns
the most polished client presentation mode in the category (live-editable during
a meeting: swap an item and the client sees it happen, then flip between
board / cut-sheet / product-list without leaving presentation), plus "Ava"
auto-generated cut sheets and a shoppable list derived from the same board. The
research names board-to-spec auto-generation the most strategically important
pattern it found, precisely because Patina already half-owns it via
send-to-schedule. FigJam is the mirror image: best-in-class hand-feel, and **no
presentation mode at all** (an open feature request) — craft without a
client-facing story. And SampleBoard, a pure board editor with no business
spine, shut down in December 2023. Craft alone does not win; bad craft is loudly
punished. The synthesis the research recommends — an infinite *edit* canvas with
a bounded *present* mode layered on top — is exactly the Phase 1 / Phase 2 split
in this package.

---

## 5. Scope overview by phase

| Phase | Theme | Schema | Headline scope |
|-------|-------|--------|----------------|
| **1 — The Room** | Make it a place, make it feel right | **none** | `/board/[boardId]` route under `(document)` with a chrome-shedding layout; full-viewport shell (top bar, left rail, floating inspector); the full interaction bar (pan/zoom, marquee, handles, guides, undo, duplicate, nudge, z-order, lock, Tidy, implicit sections); auto-growing canvas persisted to the existing `canvas_width`/`canvas_height` columns; launcher strip in drafting + desk-level entry + ⌘K deep links |
| **2 — The Audience** | One render, everywhere | small, additive | The unified composition renderer consumed by the designer Present toggle, client portal, guest share, and proposal mirror; sections visible to clients; on-canvas verdicts using the existing `item_feedback.board_item_id` anchor; board-scoped share extending `document_shares`; project-phase boards (light up the dead `00272`/`00273` branch) |
| **3 — The Reach** | Leave the room intact | one new table | Composition-true PNG and PDF export; cover thumbnails from the real composition; paste-URL unfurl into the capture pipeline; extension captures surfaced in the rail; background removal behind a media-service endpoint; upload-time downscale/thumbnails plus an orphan-cleanup job; board templates (studio-saved + Patina-seeded) |

Phases are sequential. Phase 2 depends on Phase 1's renderer split; Phase 3
depends on Phase 2's unified renderer as its export source of truth.

---

## 6. User stories

Grouped by epic. Each story carries acceptance criteria. Full, testable
requirements live in the phase docs; these are the demand-side statements the
requirements must satisfy.

### Epic A — The room (Phase 1)

**A1.** As a designer, I can open a board at its own URL and work in the full
viewport.
- Given a board id, `/board/[boardId]` renders the editor with no desk chrome.
- The URL survives reload, bookmark, and paste into another tab.
- Escape or **Done** returns me to where I came from; if the origin is unknown,
  to `/drafting/[proposalId]`, and if that is unknown, to `/desk`.

**A2.** As a designer, I can reach a board from the places I already work.
- The drafting-room Boards facet shows a launcher strip of board covers with
  "new board" and "open in room" affordances.
- The desk/document level lists recent boards.
- ⌘K offers `board: <name>` entries that navigate to `/board/[boardId]`, and the
  existing `boards`/`moodboards` aliases no longer dead-end on the drafting
  page.

**A3.** As a designer, my board is never in an unsaved state I have to think
about.
- No save button exists.
- Layout changes flush within 600ms of the last movement.
- Navigating away, closing the room, or triggering a structural action
  (activate, clone, export) blocks until pending writes land.

### Epic B — The hand (Phase 1)

**B1.** As a designer, I can move around a large board the way I move around any
2026 canvas.
- Plain wheel/trackpad scroll pans; ⌘/Ctrl+wheel and trackpad pinch zoom
  (5%–400%); holding Space and dragging pans with any tool active.
- A Fit control and the `1` key zoom-to-fit the whole composition.
- The canvas grows to contain the composition; its size persists.

**B2.** As a designer, I can select and manipulate more than one thing.
- Drag on empty canvas draws a marquee; shift-click adds and removes from the
  selection; a multi-selection moves as a unit.
- Align and distribute controls appear on multi-selection.
- ⌘D duplicates; Alt-drag duplicates; ⌘C/⌘V copies within and across boards.

**B3.** As a designer, I can size and place pieces precisely on the canvas.
- Corner and edge resize handles appear on selection; product and image pins
  keep aspect ratio by default.
- A rotate handle sets `rotation`.
- Arrow keys nudge 1px, Shift+arrow 10px.
- Smart guides show edge/center alignment and equal-spacing hints while
  dragging and resizing, and snapping is independent of whether the grid is
  visible.

**B4.** As a designer, I can undo anything I just did.
- ⌘Z undoes and ⇧⌘Z redoes every canvas mutation: add, delete, move, resize,
  rotate, z-order, lock, section membership, tidy, and multi-item operations as
  single steps.
- Undoing a delete restores the item; a drag that was in flight when the item
  was deleted never resurrects it.

**B5.** As a designer, I can bring a messy board into order in one action.
- **Tidy** arranges the current selection (or the whole board when nothing is
  selected) into an even grid, preserving reading order, as a single undoable
  step.

**B6.** As a designer, sections organize the board without a grouping ritual.
- Dragging an item over a section band makes it a member; dragging it out
  removes it.
- Sections rename and recolor inline.
- A section band's bounds follow its members.

**B7.** As a designer, I can get material onto the canvas from anywhere.
- Dragging from the left rail drops at the pointer, not the center.
- Dropping OS files onto the canvas uploads them at the drop point, multiple
  files at once.
- Pasting an image from the clipboard places it at the pointer.

**B8.** As a keyboard or assistive-technology user, I can operate the room.
- Every canvas item is reachable by Tab; arrows move the focused item; context
  menus open from the keyboard.
- Focus is trapped inside the room; Escape exits.
- `prefers-reduced-motion` suppresses non-essential animation.

### Epic C — The audience (Phase 2)

**C1.** As a designer, I can present a board to a client without leaving the
room, and keep editing while I do.
- A Present toggle switches the room to full-bleed presentation with the
  composition zoomed to fit.
- Edits made during presentation are visible immediately — presentation is not
  a frozen slideshow.
- Sections render as visible, named bands.

**C2.** As a client, the board I am shown is the board the designer composed.
- The client portal, the guest share page, and the designer's proposal mirror
  all render through the same composition renderer.
- Below the small breakpoint, the stacked fallback continues to render.

**C3.** As a client, I can approve, flag, or comment on a specific piece.
- Verdict affordances anchor to individual pins on the composition.
- Verdicts persist against `item_feedback.board_item_id`.
- Guest renders keep feedback disabled, as today.

**C4.** As a designer, I can send a client a link to just this board.
- A share control in the top bar issues a board-scoped tokenized link.
- The link opens without a login and shows only that board.
- The link is revocable and expirable, like a proposal share.

**C5.** As a project team member, the board survives signing.
- A project surface lists live project-owned boards.
- An activated proposal's frozen board snapshot renders read-only with a
  "continue in project" action.
- Continuing produces a live, editable project-owned board.

### Epic D — The reach (Phase 3)

**D1.** As a designer, I can export the board as I composed it.
- PNG export renders the composition at 2× and downloads.
- PDF export produces a composition-true page; the existing section-grouped
  tile grid remains available as a distinct "spec sheet" variant.
- Board covers are generated from the real composition.

**D2.** As a designer, I can source from a URL without leaving the board.
- Pasting a product URL onto the canvas creates a pin through the existing
  capture pipeline, with the source URL retained on the pin.
- Chrome-extension captures appear in the left rail.

**D3.** As a designer, I can knock the background off an image pin.
- A "Remove background" action on an image or product pin returns a cutout.
- The cutout is stored as a new object; the original is retained and the action
  is revertible.
- When the service is unconfigured, the action is absent or disabled with a
  clear reason — never a silent failure.

**D4.** As a designer, I can start from a template.
- I can save the current board as a template.
- A new board offers Patina-seeded starters and my studio's saved templates.

---

## 7. Non-goals

| # | Not doing | Why |
|---|-----------|-----|
| N1 | A new canvas library (konva, fabric, moveable, react-rnd) | dnd-kit is already in the tree and the interaction model is a viewport transform plus pointer handlers, not a scene graph. Adding a canvas library is bundle cost against the 55MiB Worker deploy gate for no capability we need. |
| N2 | Realtime multiplayer / presence cursors in Phases 1–3 | Only Canva and FigJam clear that bar; **none** of the five design-industry competitors do. Carried as an open item (Phase 4 or never). |
| N3 | A schema rewrite | Phases 1–2 ride the existing model. Phase 1 is zero-migration; Phase 2 is additive only; Phase 3 adds one table. |
| N4 | A separate boards product | The board's value is its wiring into proposals, schedule, and projects. Decoupling it removes the moat. |
| N5 | Pinterest API integration | Deferred. The general URL/clipper path covers most of the need — the same call Programa made with their generic scraper. |
| N6 | AI image generation / "enhance" | The category arms race, but not our differentiator and not costed here. Background removal is in scope; generative editing is not. |
| N7 | 3D board rendering | No use case, and `@react-three/fiber@8` crashes under React 19 in this repo regardless. |
| N8 | Making the public bucket private | Out of scope. The bucket stays public-read; export and background removal are designed around that fact, not against it. |

---

## 8. Risks

Full register with mitigations and owners: [04 · Risk register](./04-technical-foundations.md#risk-register).
The five that shape scope:

| R | Risk | Shape |
|---|------|-------|
| R1 | Phase 2's renderer swap regresses the live client proposal render | The proposal board block is on a revenue path. Mitigated by keeping the Phase 1 client render path untouched and gating the Phase 2 swap behind the same flag with a per-surface rollout. |
| R2 | The command stack and the 600ms autosave batch disagree, producing lost or resurrected items | This is J15 generalized. Addressed structurally in [04 · Undo/redo](./04-technical-foundations.md#undoredo-command-stack). |
| R3 | Export fidelity (fonts, CORS, image scaling) fails quietly and ships a wrong-looking PDF | Mitigated by rendering PDF server-side through the existing `@react-pdf/renderer` path rather than wrapping a client raster, and by a visual-diff checklist. |
| R4 | Background-removal vendor cost or latency makes the feature unusable at volume | Ruling #3 already scopes this as third-party-first behind our own endpoint, with a budget guard and graceful degrade. The in-house path stays open. |
| R5 | No CI means a large multi-phase change lands unverified | Every phase doc names the exact local gate commands; **patina-verification** governs. |

---

## 9. Open items

| # | Item | Disposition |
|---|------|-------------|
| O1 | Realtime presence / multiplayer cursors | **Open.** Phase 4 or never. Revisit after Phase 2 usage shows concurrent-edit collisions. |
| O2 | Pinterest import | Deferred (N5). |
| O3 | Board-to-spec auto-generation (Morpholio "Ava" territory) — emitting a cut sheet or shoppable list from the board | Not scoped in Phases 1–3. `buildSendToScheduleArgs` in `apps/designer-portal/src/lib/scope/board-schedule.ts` is the existing half of it; the deck names it the strategic direction. Revisit after Phase 3. |
| O4 | Whether `BoardCanvas` and `BoardStatic` are deleted or retained after Phase 2 retires their consumers | Decide at Phase 3 cleanup — see [04 · Unified renderer](./04-technical-foundations.md#unified-renderer-plan-phase-2-ruling-2). |
| O5 | Competitive positioning re-check before external messaging | The research window closed with Programa's July 2026 Pinboard update and Studio Designer's May 2026 Design Boards both under five weeks old. Re-verify before any public claim. |
