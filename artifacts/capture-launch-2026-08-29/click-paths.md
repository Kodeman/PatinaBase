# Click-path audit — capture-launch W0-D1

From code only (`src/components/FFESlotPicker.tsx`, `src/panel/CommitBar.tsx`,
`src/overlays/DecisionSheet.tsx`, `src/lib/spec-book-placement.ts`). Baseline:
panel already open on a product page, signed in, extraction already
succeeded (state C2), so the count starts from a populated draft — it does
not include the initial "open the panel" click.

"Interactions" = discrete user actions (one `<select>` change, one text
keystroke sequence into one field, one button click). Two cold-start
columns are given for every project-scoped destination: **no sticky
context** (first capture this session, or after clearing storage) and
**sticky context** (`chrome.storage.local` already holds a
`{ projectId, roomId }` from a prior capture in this session —
`SPEC_BOOK_PLACEMENT_CONTEXT_KEY`, `spec-book-placement.ts:3`).

## Minimum interactions per destination

| Destination | No sticky context | Sticky context | Citations |
|---|---|---|---|
| **Library** (personal library, no project) | **1** — click "Save to library" | **1** — same | `FFESlotPicker.tsx:63-65` (`routeKind` defaults to `'library'` whenever `productId` isn't passed, which is always true on this capture-form surface); `CommitBar.tsx:143-159` (default `run('library')` button) |
| **Project inbox** | **3** — select destination → select project → click Save | **2** — select destination → click Save (project auto-selected from sticky context) | `FFESlotPicker.tsx:213-223` (destination `<select>`), `:227-246` (project `<select>`, required since `currentRoute()` returns `null` without `selectedProjectId` for `project_inbox`, `:136-142`); room is optional for this route kind |
| **Fill existing slot** | **5** — select destination → select project → select room → select slot → click Save | **3** — select destination → select slot → click Save (project *and* room both restored from sticky context, since `SpecBookPlacementContext` carries both) | `FFESlotPicker.tsx:63-65` (route defaults away from `fill_slot` even here — see note below), `:249-269` (room select, required), `:271-288` (slot select, required — `currentRoute()` returns `null` without `selectedSlotId`, `:144-152`) |
| **Create new FF&E line** | **5** — select destination → select project → select room → type category → click Save | **3** — select destination → type category → click Save | `FFESlotPicker.tsx:290-299` (free-text category input, required — `:154-161`); room required same as above |
| **Send to inbox** (personal-library commit target, distinct from "project inbox" route above) | **1** — click "Send to inbox" | **1** — same | `CommitBar.tsx:160-169`; only rendered `!hasProjectPlacement` (i.e. current route is `library`), so this button and the project-inbox *route* are mutually exclusive UI, not two ways to reach the same place |
| **Send as client decision** | **3** — click "Send for client approval →" (opens DEC overlay) → choose client (required) → click "Send to client" | same, **3** (no sticky context for decision targeting) | `CommitBar.tsx:170-177` (overlay trigger); `DecisionSheet.tsx:21` (`canSend` requires `dec.designerClientId`); project/room and title are optional (title falls back to `Approve: {name}` placeholder, `DecisionSheet.tsx:87`) |

## Sticky context: what's actually remembered

`loadSpecBookPlacementContext()`/`saveSpecBookPlacementContext()`
(`spec-book-placement.ts:143-163`) persist only `{ projectId, roomId }` to
`chrome.storage.local`, written every time a project or room `<select>`
changes (`FFESlotPicker.tsx:235`, `:257`). **The route *kind* itself
(`library` / `project_inbox` / `fill_slot` / `create_line`) is never
persisted.** `FFESlotPicker`'s `routeKind` state always initializes to
`assigningExisting ? 'fill_slot' : 'library'` (`:63-65`), and
`assigningExisting` (`!!productId`) is always `false` on this capture-form
surface — `RouteCommitRegion` never passes a `productId`
(`RouteCommitRegion.tsx:47-50`). So **every new capture reopens on
"Library only,"** even immediately after a capture that was routed to
`fill_slot`.

This is why the sticky-context column above still charges a "select
destination" click for `fill_slot`/`create_line`/`project_inbox` even with
project+room remembered: the destination dropdown itself resets every time.
For Marcus's persona (P2 — repeat `fill_slot` into the same room's empty
FF&E lines, 30×/day), that's one throwaway `<select>` interaction *every
single capture*, purely because the app remembers where but not what.

Additionally: `FFESlotPicker` unmounts on every new capture.
`RouteCommitRegion` returns `null` whenever `!draft`
(`RouteCommitRegion.tsx:31`), and `draft` is set to `null` on both
`EXTRACTION_START` and `CAPTURE_NEXT` (`reducer.ts:140-146`, `:468-471`)
before the next `EXTRACTION_SUCCESS` rebuilds it — so `FFESlotPicker` is a
fresh component instance each time, not a persisted one whose props merely
change. Its local state (`routeKind`, `category`, `selectedSlotId`) has no
survival path across captures by construction; only what round-trips
through `chrome.storage.local` (project, room) survives.

## Net read

- **Library** and **send to inbox** are both genuinely one-click, matching
  the "fast path" the CommitBar's default state clearly optimizes for.
- Every project-scoped route costs at least one throwaway click
  (re-picking "Library only" → the real destination) on top of whatever
  selects the destination requires, even at full sticky-context warmth,
  because route kind isn't part of what's remembered.
- `fill_slot` and `create_line` are the most expensive destinations (3
  required selects/inputs even warm), which matters directly for Marcus's
  P2 walk (`walk-sheet.md`) — repeated `fill_slot` saves into the same
  room.
