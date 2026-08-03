# MoodBoard acceptance evidence ledger

This ledger is the release gate for the one-time MoodBoard GA. The phase PRDs remain authoritative for criterion wording. Each implementation owner replaces “Unassigned” and “Pending” with a concrete workstream, automated command, runtime/visual probe, and commit or artifact reference.

Statuses: **Pending**, **In progress**, **Passed**, **Adapted**, or **Superseded**. Adapted and superseded entries require the rationale captured in the implementation addendum.

| AC | Requirement | Acceptance criterion | Owner | Status | Evidence |
|---|---|---|---|---|---|
| AC1.1 | R1.1 | Navigating to `/board/<id>` with the flag on renders the editor at full viewport with no desk chrome, no vertical page scroll, and no layout shift after load | Unassigned | Adapted | Always-on GA: verify the route behavior without a flag. |
| AC1.2 | R1.1.5, R1.2.2 | With the flag off, `/board/<id>` redirects to `/drafting/<proposalId>` and the drafting facet renders the legacy inline editor | Unassigned | Superseded | Approved GA decision removes the flag-off redirect/legacy path. |
| AC1.3 | R1.2.5 | A board reached from the drafting strip, from desk recents, and from ⌘K each fires `mood_board_opened` with the correct distinct `source` | Unassigned | Pending | — |
| AC1.4 | R1.2.4 | ⌘K query "board" ranks concrete `board: <name>` entries above the Drafting Room entry, and selecting one navigates to `/board/<id>` | Unassigned | Pending | — |
| AC1.5 | R1.3.2 | Done and Escape both return to the origin; with no valid origin they land on `/drafting/<proposalId>`; with no proposal, `/desk`. A crafted `?from=https://evil.example` is rejected | Unassigned | Pending | — |
| AC1.6 | R1.5.2, R1.5.3, R1.5.5 | Two-finger trackpad scroll pans and never zooms; ⌘+wheel and pinch zoom anchored at the pointer; Space-drag pans | Unassigned | Pending | — |
| AC1.7 | R1.5.4, R1.5.6, R1.5.7 | Zoom clamps at 5% and 400%; `1` fits the composition with a margin; `⌘0` returns to 100% | Unassigned | Pending | — |
| AC1.8 | R1.6.2, R1.6.3 | Dragging an item past the right edge grows `canvas_width` (verified in the DB row) by the overflow plus 240px, and the composition does not visually jump when growth occurs on the left or top | Unassigned | Pending | — |
| AC1.9 | R1.7.1 | Dragging a rail item onto the canvas creates the pin centered at the release point, ±2px, at three different zoom levels | Unassigned | Pending | — |
| AC1.10 | R1.7.3 | Dropping 3 image files at once creates 3 pins laid out from the drop point, with 3 objects under `${ownerId}/boards/${boardId}/` | Unassigned | Pending | — |
| AC1.11 | R1.8.2, R1.8.3, R1.8.5 | Marquee selects every intersecting unlocked item; shift-click toggles; dragging one selected item moves all of them by the same delta | Unassigned | Pending | — |
| AC1.12 | R1.8.6 | A locked item is not marquee-selected, is skipped by ⌘A, and cannot be dragged or resized | Unassigned | Pending | — |
| AC1.13 | R1.9.2, R1.9.3 | Corner-dragging an image pin preserves aspect ratio; Shift releases it; the persisted `width` changes and `height` stays null when only width was set | Unassigned | Pending | — |
| AC1.14 | R1.9.5 | Rotating with Shift snaps to 15°; the persisted `rotation` matches; marquee selection of the rotated item uses its axis-aligned bounding box | Unassigned | Pending | — |
| AC1.15 | R1.10.1, R1.10.3 | Dragging an item to within 6px of another item's left edge shows a guide and snaps; holding Alt suppresses both | Unassigned | Pending | — |
| AC1.16 | R1.10.4 | Turning grid visibility **off** with snap **on** still snaps; turning snap off with the grid visible does not snap | Unassigned | Pending | — |
| AC1.17 | R1.11.1, R1.11.4 | Align-left on a 3-item selection moves all three to the selection bbox's left edge, and a single ⌘Z restores all three | Unassigned | Pending | — |
| AC1.18 | R1.12.3 | A 400px drag produces exactly one undo step; ⌘Z restores the original position; ⇧⌘Z re-applies | Unassigned | Pending | — |
| AC1.19 | R1.12.5, R1.12.6 | Delete an item mid-drag (via context menu on a second item's drag in flight): no write resurrects the deleted item, and no console error appears. Undo restores the deleted item with the same `id` | Unassigned | Pending | — |
| AC1.20 | R1.18.6 | `retiredLayoutItemIdsRef` no longer appears in the codebase and AC1.19 still passes | Unassigned | Pending | — |
| AC1.21 | R1.13.1, R1.13.2 | ⌘D offsets duplicates by 24/24 and selects them; Alt-drag leaves originals in place | Unassigned | Pending | — |
| AC1.22 | R1.13.3, R1.13.4 | Copy a 2-item selection on board A, paste on board B: geometry relationship preserved, product pins keep `product_id` within the same owner and drop it across owners while still rendering | Unassigned | Pending | — |
| AC1.23 | R1.14.1 | Ten rapid arrow-key nudges within 500ms collapse into one undo step totalling 10px | Unassigned | Pending | — |
| AC1.24 | R1.14.4, R1.19.3 | Right-click, keyboard context-menu key, and ⇧F10 all open the same menu; every entry is reachable by arrow keys | Unassigned | Pending | — |
| AC1.25 | R1.15.2, R1.15.3, R1.15.5 | Tidy with 4 items selected rearranges only those 4, preserving reading order, inside the selection bbox origin; with nothing selected it arranges the whole board section by section; one ⌘Z restores every position | Unassigned | Pending | — |
| AC1.26 | R1.16.3 | Dragging an item so its center lands inside a section band writes that band's id to `data.section_id`; dragging it out clears it; no explicit grouping action is required | Unassigned | Pending | — |
| AC1.27 | R1.16.4 | Dragging a section band label moves the band and all members as one undoable command | Unassigned | Pending | — |
| AC1.28 | R1.17.5, non-regression contract | `git diff` shows `BoardCanvas.tsx`, `BoardStatic.tsx`, and `BoardsBlock.tsx` unchanged at the end of Phase 1; the client proposal render and guest share render identically before and after | Unassigned | Adapted | Unified renderer lands before the room; prove cross-surface parity instead of a phase-local byte diff. |
| AC1.29 | R1.18.4 | A project-owned board (`project_id` set, `proposal_id` null) opens in the room, edits, and flushes on exit without throwing a barrier error | Unassigned | Pending | — |
| AC1.30 | R1.19.1, R1.19.2, R1.19.5 | Every item is reachable by Tab; Enter opens the inspector; arrows nudge from keyboard focus; the live region announces selection and undo | Unassigned | Pending | — |
| AC1.31 | R1.19.6 | With `prefers-reduced-motion: reduce`, no zoom/pan easing or inspector animation occurs, and guides still appear | Unassigned | Pending | — |
| AC1.32 | R1.19.4 | Opening the product picker from the rail and closing it leaves body scroll still locked by the room | Unassigned | Pending | — |
| AC1.33 | Analytics | The four Phase 1 events fire with the documented property sets, and `board_done` carries all four `used_*` booleans | Unassigned | Pending | — |
| AC2.1 | R2.1.7 | The same board rendered in Present mode, the client portal, the guest share, and the proposal mirror produces identical pin geometry (screenshot diff within antialiasing tolerance) | Unassigned | Pending | — |
| AC2.2 | R2.1.3 | A board with 3 sections renders 3 labelled bands behind the pins on every client surface; a section with no members renders nothing | Unassigned | Pending | — |
| AC2.3 | R2.1.4 | A board whose canvas was grown to 2400×1600 in Phase 1 scales to fit without clipping on all four surfaces | Unassigned | Pending | — |
| AC2.4 | R2.1.5 | Below the `sm` breakpoint the stacked fallback renders, now with section headings | Unassigned | Pending | — |
| AC2.5 | R2.2.2 | `P` and the top-bar toggle switch to Present; rail, inspector, handles, guides, and grid are all absent; the composition fits with a margin | Unassigned | Pending | — |
| AC2.6 | R2.2.3, R2.2.5 | Edit an item, switch to Present: the change is visible with no reload. Switch back: the item is still selected-able and the undo stack is intact | Unassigned | Pending | — |
| AC2.7 | R2.2.4 | The notes toggle hides `note` pins and does not delete or modify them (DB rows unchanged) | Unassigned | Pending | — |
| AC2.8 | R2.2.6 | Escape in Present returns to Edit; a second Escape exits the room | Unassigned | Pending | — |
| AC2.9 | R2.3.2 | A client with feedback enabled approves a pin; an `item_feedback` row exists with `board_item_id` set and the other two anchors null | Unassigned | Pending | — |
| AC2.10 | R2.3.2 | A `comment` verdict submitted with an empty body is rejected (the `item_feedback_comment_needs_body` CHECK is surfaced as a validation message, not a 500) | Unassigned | Pending | — |
| AC2.11 | R2.3.3 | The guest share render shows **no** verdict affordances even when the share row's stored visibility claims `feedbackEnabled: true` | Unassigned | Pending | — |
| AC2.12 | R2.3.4, R2.3.5 | The designer sees verdict chips anchored to pins in both Edit and Present, and the rail Feedback filter selects and scrolls to the pin | Unassigned | Pending | — |
| AC2.13 | R2.3.6 | Deleting a pin that carries verdicts shows a warning naming the count; after delete the `item_feedback` rows are gone; undo restores the pin but not the feedback | Unassigned | Pending | — |
| AC2.14 | R2.4.2 | Creating a board share returns the raw token exactly once; the DB row stores only a hash; the raw token appears in no log or response thereafter | Unassigned | Pending | — |
| AC2.15 | R2.4.4 | A board share URL renders that board and nothing else. Probing the parent proposal's data through the same token returns nothing | Unassigned | Pending | — |
| AC2.16 | R2.4.3 | A **project-owned** board (no proposal) can be shared, and the resulting link resolves | Unassigned | Pending | — |
| AC2.17 | R2.4.7 | Every pre-existing proposal-scoped share still resolves identically after the migration (test against rows created before the migration in a reset-then-seed run) | Unassigned | Pending | — |
| AC2.18 | R2.4.6 | Revoking a board share makes the link 404; the row's `status` is `revoked` | Unassigned | Pending | — |
| AC2.19 | R2.5.1 | A project surface lists live project-owned boards, each opening in the room | Unassigned | Pending | — |
| AC2.20 | R2.5.2, R2.5.3 | A frozen `project_boards` snapshot renders read-only with no selection, no inspector, no verdict affordances, and throws nothing despite items having no `id` | Unassigned | Pending | — |
| AC2.21 | R2.5.4, R2.5.5 | "Continue in project" produces a live editable project-owned board and navigates into it; a second attempt from the same snapshot offers the existing board instead of creating a duplicate | Unassigned | Pending | — |
| AC2.22 | R2.5.6, R2.5.7 | In the room on a project-owned board, the room chip shows the project, Done returns to the project surface, and exit flush succeeds | Unassigned | Pending | — |
| AC2.23 | R2.6.1 | `board-block.tsx`, `share/[token]/page.tsx`, and `proposal-mirror.tsx` each import `BoardComposition` and contain no local pin-layout logic | Unassigned | Pending | — |
| AC2.24 | R2.6.2 | `BoardStatic` is marked deprecated and has zero imports | Unassigned | Pending | — |
| AC2.25 | Analytics | The five Phase 2 events fire with the documented property sets | Unassigned | Pending | — |
| AC3.1 | R3.1.1.3, R3.1.1.4 | PNG export of a board with all six pin types, 3 sections, and a rotated pin produces an image whose pin positions, sizes, and rotations match a screenshot of `BoardComposition` for the same board within a small pixel tolerance | Unassigned | Pending | — |
| AC3.2 | R3.1.1.2 | Output is exactly `canvas_width × 2` by `canvas_height × 2` for a board under the 8192px cap, and uniformly scaled with a reported factor above it | Unassigned | Pending | — |
| AC3.3 | R3.1.1.5 | Text in the PNG uses the composition's font, verified after `document.fonts.ready`; a forced font-load failure produces system-stack text, not misplaced glyphs | Unassigned | Pending | — |
| AC3.4 | R3.1.1.6 | An image pin whose object is deleted from the bucket exports as a labelled placeholder and the export still completes, with the failure reported | Unassigned | Pending | — |
| AC3.5 | R3.1.1.7 | A 100-pin board exports PNG in under 10s and the UI remains responsive with determinate progress | Unassigned | Pending | — |
| AC3.6 | R3.1.2.1 | `spec-pdf` with `kind: 'board-composition'` returns a PDF whose page reproduces the composition; `kind: 'board'` still returns the tile grid unchanged | Unassigned | Pending | — |
| AC3.7 | R3.1.2.2 | The export menu presents "Composition" and "Spec sheet" as separate, labelled choices | Unassigned | Pending | — |
| AC3.8 | R3.1.2.6 | A board belonging to another designer returns 404 for both PDF kinds — not 403, not a distinguishable error | Unassigned | Pending | — |
| AC3.9 | R3.1.2.5 | The board composition PDF model type has no trade-price, markup, or margin field (verified by type, not by runtime filter) | Unassigned | Pending | — |
| AC3.10 | R3.1.2.8 | Every function importing `_shared/spec-pdf.ts` is enumerated and redeployed together; a stale importer is detectable and was not left behind | Unassigned | Pending | — |
| AC3.11 | R3.2.1–R3.2.4 | Editing a board and waiting 30s produces a cover at `${ownerId}/boards/${boardId}/cover.png`; the launcher strip renders it; a board with no cover renders the fallback | Unassigned | Pending | — |
| AC3.12 | R3.3.1, R3.3.3 | Pasting a product URL creates a placeholder that resolves into a pin with `data.source_url` set and the host shown on the composition | Unassigned | Pending | — |
| AC3.13 | R3.3.1 | A URL that cannot be scraped becomes an editable note carrying the URL — the pin never silently disappears | Unassigned | Pending | — |
| AC3.14 | R3.3.4 | The rail's Captures tab lists extension-created captures; dragging one creates a pin retaining `capture_id` | Unassigned | Pending | — |
| AC3.15 | R3.4.3, R3.4.4 | "Remove background" produces a cutout at a new `-cutout.png` path, swaps `data.image_url`, retains `data.original_image_url`, and Revert restores the original. Both are single ⌘Z steps | Unassigned | Pending | — |
| AC3.16 | R3.4.6 | With no vendor configured (default local dev), the inspector shows **no** Remove background action, and a direct API call returns `background_removal_not_configured` | Unassigned | Pending | — |
| AC3.17 | R3.4.7 | Exceeding the studio cap returns a structured budget error rendered as a readable limit message with the reset date; the vendor is not called | Unassigned | Pending | — |
| AC3.18 | R3.4.8 | The background-removal route is not configured for retry; a simulated timeout does not produce two vendor calls | Unassigned | Pending | — |
| AC3.19 | R3.4.9 | The client never receives any vendor identifier in a response body, header, or error | Unassigned | Pending | — |
| AC3.20 | R3.5.1, R3.5.2 | A 6000px source upload lands as a ≤2400px display image plus a ≤400px thumbnail; the rail uses the thumbnail and the composition uses the display image | Unassigned | Pending | — |
| AC3.21 | R3.5.4 | The orphan sweep dry-run on a seeded fixture lists exactly the unreferenced objects; an image referenced from a second board by paste, from a template, from a frozen `project_boards` snapshot, or as `original_image_url` is **not** listed | Unassigned | Pending | — |
| AC3.22 | R3.5.4 | The sweep deletes nothing on the first pass; a candidate is deleted only after 14 days without a reference; `job_runs` records each run | Unassigned | Pending | — |
| AC3.23 | R3.6.1, R3.6.2 | Save-as-template produces a `board_templates` row with no `product_id`/`capture_id`/`palette_id` anywhere in `items`, and with section names preserved | Unassigned | Pending | — |
| AC3.24 | R3.6.4, R3.6.5 | New-board offers both groups; choosing a seeded starter materializes real `proposal_board_items` rows under the new board and no link back to the template exists | Unassigned | Pending | — |
| AC3.25 | R3.6.6, migration RLS | A studio can rename and delete its own templates; an attempt to delete or modify a `kind = 'seeded'` row is refused by RLS | Unassigned | Pending | — |
| AC3.26 | migration RLS | A member of studio A cannot read, update, or delete a template belonging to studio B | Unassigned | Pending | — |
| AC3.27 | Analytics | The seven Phase 3 events fire with the documented property sets | Unassigned | Pending | — |

## Release-wide evidence

- [ ] All non-superseded rows are Passed or have an explicitly reviewed Adapted result.
- [ ] M1–M8 inputs and the pre-release M2/M3 baseline are queryable.
- [ ] Supabase reset, SQL security tests, and generated types pass from the merged integration branch.
- [ ] Designer/client explicit type checks, portal builds, shared-package gates, media build/tests, and Deno tests pass.
- [ ] Desktop/mobile composition parity covers room, Present, mirror, authenticated client, guest, PNG, PDF, and cover.
- [ ] Keyboard, focus, reduced-motion, touch-target, dense-board, and failure-injection checks pass.
- [ ] Existing proposal/spec-book shares and legacy spec-sheet PDF behavior pass regression probes.
- [ ] iOS Patina decoding and extension capture compatibility are at least compile/simulator verified, with claim level recorded.
- [ ] Production object and behavior probes pass after the ordered deployment.

