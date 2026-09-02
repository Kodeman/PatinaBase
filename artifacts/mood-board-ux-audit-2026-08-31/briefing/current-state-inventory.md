# Mood Board Suite — Current-State Inventory (verified 2026-08-31)

Ground truth for the UX audit panel. Compiled from code exploration of `main`. The full-screen board room shipped to 100% GA on 2026-08-03 (main merge `625d8bbdf`), always-on, no feature flag.

## Entry points & routes
- **Full-screen room**: `/board/[boardId]` — `apps/designer-portal/src/app/(document)/board/[boardId]/page.tsx` → `MoodBoardRoom` (`apps/designer-portal/src/components/mood-board/board-room-shell.tsx`, 1,351 lines). Full-viewport (`fixed inset-0`, `h-[100dvh]`).
- **Drafting facet launcher**: proposal drafting page (`.../document/rooms/drafting/drafting-room.tsx`) → "Boards" facet renders `BoardsBuilder` (`.../portal/scope-builder/boards-builder.tsx`, 361 lines) — card grid + "New board" picker (blank / Patina starter templates / studio templates); every open navigates to the room.
- **Project surfaces**: shelf leaf `mood-boards-leaf.tsx`; full region `project-mood-boards.tsx` (533 lines — live project-owned boards via `useProjectOwnedBoards`, frozen proposal-carried boards via `useProjectBoards`, "continue" unfreeze via `useContinueBoardInProject`); standalone narrow-viewport route `/doc/[id]/boards` (`project-boards-view.tsx`); worktable `boards-strip.tsx` (speccing stage).
- **⌘K command bar**: recent boards section (top 4–8) + "board"/"moodboard" query matches (`command-bar.tsx`, `useRecentBoards`).
- **Navigation helper**: `apps/designer-portal/src/lib/mood-board/navigation.ts` — open sources `drafting_strip | desk_recents | command_bar | project_surface | direct_url`, `boardRoomHref()`, allow-listed `?from=` return path.
- **Orphan found**: `recent-boards-strip.tsx` (desk recents strip, `'desk_recents'` source) is built + tested but mounted NOWHERE — the desk-level recents entry from Ruling #1 effectively exists only in ⌘K.

## The room's parts
- **Canvas**: `packages/patina-design-system/src/components/BoardRoomCanvas/BoardRoomCanvas.tsx` (2,232 lines) — fully custom pointer-event gestures (NOT dnd-kit): pan (wheel/Space-drag), zoom 5–400% pointer-anchored, marquee, move/resize (8 handles, aspect-lock by type)/rotate (15° snap), alt-drag duplicate, section bands, long-press touch, reduced-motion. Canvas defaults 1200×800 and auto-grows (`DEFAULT_MOOD_BOARD_CANVAS` in `packages/patina-design-system/src/mood-board/geometry.ts`).
- **Controller**: `.../scope-builder/board-room-controller.tsx` (1,728 lines) — state, undo/redo command engine (`board-room-command-engine.ts`), structural validation, clipboard copy/paste, z-order, context menu, exit-confirm guard. Tidy: `board-room-tidy.ts`.
- **Add rail**: `board-add-rail.tsx` — 7 tabs: project (FFE selections) / library / captures / uploads / palettes / scans / feedback; last tab persisted per board.
- **Item types**: product, capture, image, palette, note, room_scan (`board-item-renderer.tsx`: ImageTile, NoteCard, PaletteStrip, ProductCard, RoomScanTile).
- **Inspector**: `board-room-inspector.tsx` (floating, geometry + rotation + note editing) with per-type action rows: background removal (images), palette actions, send-to-FF&E-schedule (`board-schedule-inspector-action.tsx`).
- **Sections menu**: `board-room-sections-menu.tsx`. Grid/snap/rail-collapsed toggles persist to localStorage.
- **Dialogs**: share (`board-share-dialog.tsx` — view-only links, expiry, revoke), export (`board-export-dialog.tsx` — PNG at selectable scale client-side, `pdf_composition`, `pdf_spec_sheet` via spec-pdf edge fn), template (`board-template-dialog.tsx` — save-as-template, studio-scoped), covers (`board-cover-art.tsx` + lifecycle).
- **URL unfurl**: `use-mood-board-url-unfurl.ts` — paste a vendor URL → product pin.
- **Present mode**: in-room toggle (P key), chrome-free, verdicts visible, Escape returns; double-Escape exit guard for the room itself (post-GA ruling 2026-08-05).

## Data & lifecycle
- Hooks: `packages/supabase/src/hooks/use-boards.ts` (1,143 lines), `use-recent-boards.ts`, `use-board-templates.ts`, `board-verdicts.ts`, `use-document-shares.ts` (board shares).
- Tables/migrations: `proposal_boards`/`proposal_board_items` (00179), activation carry (00180), project-owned live boards (00272) + continue RPC (00273), sections/status (00264), storage+shares (00406), sections/lineage (00407), templates (00408/00409 seeded), asset maintenance (00410 + `board-asset-cleanup` edge fn), atomic room-state RPC (00411), later hardening (00436/00457/00473/00485).
- Autosave: layout buffer 600ms, canvas buffer 1000ms, structural writes immediate behind a write gate; project-owned boards save via atomic whole-state RPC.
- Lifecycle: proposal board → frozen carry on signing (JSONB snapshot) → "continue in project" unfreezes into live project-owned board.
- Client side: guest share `apps/client-portal/src/app/share/[token]/page.tsx` (`resolve_board_share` RPC) renders `BoardComposition` (`packages/patina-design-system/src/components/proposal/BoardsBlock.tsx` — presentation-only, "preview is truth" invariant); authed client `board-block.tsx` has per-pin verdict loop (approve/reject/comment).
- Analytics: rich unconditional PostHog events (`mood-board-events.ts`: opened, item_added, arranged, presented, shared, verdict_given, exported, bg_removed, template_used, url_unfurled, …).

## Known-gap seed list (read ONLY after forming cold findings — per Kody's "fresh look" ruling)
- `docs/prds/MoodBoard/06-acceptance-evidence.md`: 50/85 ACs Passed, **27 Waived, 5 Adapted, 2 In-progress, 1 Superseded**.
- `docs/prds/MoodBoard/README.md` decision log: 4 locked rulings (dual entry points; unified client render; third-party background removal; templates both seeded+studio) + post-GA double-Escape ruling. Open/deferred: realtime presence (Phase 4 or never), Pinterest import (URL unfurl covers), board-to-spec auto-gen, BoardCanvas/BoardStatic deletion timing.
- Non-goals held at GA: no new canvas lib, no realtime multiplayer, no schema rewrite, no separate boards product, no Pinterest API, no AI generative editing, no 3D, public bucket.

## Test coverage (for calibration, not audit scope)
14-test Playwright GA suite (`apps/designer-portal/e2e/mood-board/mood-board-ga.spec.ts`), export-parity visual regression, ~35 unit/component test files across room/rail/inspector/dialogs/hooks.
