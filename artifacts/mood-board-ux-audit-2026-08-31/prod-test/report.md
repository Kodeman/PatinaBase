# Mood Board Suite — Production QA Report (2026-08-31)

Run by an automated QA agent via Chrome against https://app.patina.cloud, signed in as kody@kochaver.com (prod super_admin, Middle Studio). Transcribed by the orchestrator from the agent's report (the agent could not write files).

**Orchestrator's note for readers:** all mutation failures below went through the `apply_board_room_state` RPC — the **project-owned** board save path. This session exercised boards created on a scratch PROJECT. The proposal-owned path (drafting facet on a draft proposal, which saves via different mutations, and where the share dialog may be mounted) is covered in `report-followup.md`. Read both before concluding a defect is global.

## Session summary
- Scope covered: entry points, add-rail sourcing, canvas gestures (JS PointerEvent dispatch), autosave/persistence via network + hard reload, Present mode, Export (PNG + 2 PDFs), Save-as-template + materialize, zoom range, stress-add. Share and mobile-width could not be completed (see Coverage boundaries).
- Scratch objects created: project "ZZ QA Scratch Board Test 2026-08-31" (`f58c66cf-13ac-4903-895c-117b8eb30cb9`), board "Furniture plan by zone" (`157c9066-…`), board "ZZ QA Scratch Template 2026-08-31" (`2fbe7129-…`, materialized), studio template "ZZ QA Scratch Template 2026-08-31".

## Findings

| ID | Severity | Confidence | Area | Summary |
|---|---|---|---|---|
| F1 | P1 | High | Board creation | "Blank board" (top, default option in the New-board picker) fails 100% of the time with `AppError: Project board changes require apply_board_room_state`, exposing an internal RPC name to the user. Patina starter templates work fine from the same dialog. |
| F2 | P1 | High | Multi-select drag | Dragging one member of a multi-item (marquee) selection fails to save — 3× 400 responses (`invalid board fields`, `invalid board item`), UI reverts with a generic toast. Single-item drag/resize/rotate all save fine. |
| F3 | P1 | High | Duplicate | Cmd+D is completely broken — reproduced on both a modified product and a plain unmodified note. Always throws `AppError: invalid board item`, 400 response, change reverted. |
| F4 | P1 | High | Share | No Share entry point exists anywhere on the project-board surface: not in the room toolbar, not in "More", not in Present mode, not on the Boards list (no per-row menu; right-click does nothing). |
| F5 | P2 | Medium | Board cover thumbnails | Console warning "Mood-board cover generation failed: Edge Function returned a non-2xx status code" fired twice on leaving the room. |
| F6 | P3 | Low-Med | Starter template asset | The "Furniture plan by zone" Patina starter ships with a broken/missing image placeholder item by default (flagged gracefully by the app at export/publish time, but the template asset itself is broken). |

### F1 detail — Blank board creation broken
Repro: Boards facet on a project doc (`/doc/{id}/boards`) → "New board" → "Blank board" card → "CHOOSE". Reproduced twice, identical.
Evidence: console `Error logged: AppError: Project board changes require apply_board_room_state` (chunk `581-c33ddcf2b4577250.js`); toast "Error — Project board changes require apply_board_room_state." No board created; picker modal stays open. Choosing a Patina starter template from the identical dialog works and enters the room.

### F2 detail — Multi-select group drag fails to save
Repro: marquee-select N items → multi-select panel ("N pins", Align/Distribute/Section/Lock/Delete) → drag one selected item.
Evidence: 3× `POST .../rpc/apply_board_room_state` → 400; console `AppError: invalid board fields` (×2), `AppError: invalid board item` (×1); banner "That change was reverted because it could not be saved." Positions did not actually change.

### F3 detail — Duplicate (Cmd+D) broken
Repro 1: resized/rotated bench product → Cmd+D. Repro 2: plain unmodified note → Cmd+D. Identical failures.
Evidence: toast "Error — invalid board item"; `POST .../rpc/apply_board_room_state` → 400 (×2); console stack names the duplicate code path (`page-8b975987489037df.js`).

### F4 detail — No Share entry point
Confirmed absent in: room edit toolbar (Hide sources, Undo, Redo, Fit, Grid, Snap, Tidy, Export, Present, More, Done — read via accessibility tree), the "More" dropdown (Sections management, Trim canvas, Save as template only), Present mode's toolbar (name, project-link chip, Notes toggle, Edit, Done), and the Boards list page. If intentional gating, there's no messaging saying so.

### F5 detail — Cover generation failing
Non-fatal console warning `Mood-board cover generation failed Error: Edge Function returned a non-2xx status code`, fired on exiting Present mode and on `requestExit`. Likely means stale/blank board-list thumbnails.

### F6 detail — Broken starter asset
"Furniture plan by zone" starter includes one item with no image (inspector: "Plan, elevation, or room refer…", IMAGE type). App surfaces it well post-materialization ("1 visual reference needs review-media preparation before this board can be published"; PNG export reported "PNG downloaded with 1 labelled image placeholder") — but the starter asset is broken for every designer who picks it.

**Methodology note (not a product bug):** an early rotate test with a straight-line drag path produced the same 400/revert as F2; a proper circular gesture around the item's center succeeded (0°→180°, saved 204, verified after reload). Test-script artifact — but shows the validation-and-revert path triggers easily.

## What works well (evidence-backed)
1. ⌘K palette — instant "RECENT BOARDS" section; typing "board" returns a rich correctly-scoped cross-project list.
2. New-board picker structure — Blank / 4 Patina starters / "Your studio" (appears once a studio template exists).
3. Add-rail → Library — "Add a product" dialog (Catalog/Library/Captures/Quick-create draft tabs) adds items instantly with a full inspector (Width, Rotation, Section, Forward/Backward/To front/To back, Lock pin, Open product).
4. Notes — "+Note" adds an editable card; text updates live on-canvas and in the inspector title.
5. Canvas gestures — drag, corner resize (260→350), rotate (0°→180°) all persisted server-side (204s, intact after hard reload).
6. Marquee/multi-select — 6 items with a rich panel: Align (6 ways), Distribute (4 ways), Section reassignment, Lock, Delete, shortcut-hint bar.
7. Keyboard nudge — arrow keys moved the selection; 5× `apply_board_room_state` 204s.
8. Present mode — clean chrome removal; placeholders become friendlier captioned tiles; Escape returns cleanly.
9. Export — all 3 kinds succeeded (Composition PNG 2800×1800 2×, Composition PDF, Spec sheet PDF) with clear inline status text.
10. Save as template / materialize — thumbnail + piece count correct; materialization reproduced sections/items/positions/rotation exactly and correctly converted the owner-linked product to a "Promote to project selection" action, matching the dialog's stated behavior.
11. Zoom — smooth ctrl+wheel, correct clamps at 400% and 5%; "Fit" reframes correctly.
12. Archive — custom in-app confirmation (not native `confirm()`), safe and reversible.

## UX observations
1. The most prominent first choice in "New board" ("Blank board", top of dialog) is the one broken path, and it surfaces a raw RPC name — bad first impression.
2. "+Note" and product "Add" drop new items at the same default position — no offset/cascade, no overlap indicator; a note landed directly on top of a just-placed product with zero warning.
3. Resize/rotate handles are small (20×20px), close together, no hover tooltips observed — easy to grab the wrong one at lower zoom.
4. Section placeholders read as plain gray "No image" boxes in edit mode but become friendly captioned tiles only in Present mode — the nicer state isn't discoverable until you present.
5. Export success feedback is a small low-contrast gray line ("PDF downloaded.") — easy to miss.
6. "Save as template" name field pre-fills but isn't select-on-focus — typing appends instead of replacing.
7. No visible +/− zoom buttons — only a "100%" readout and "Fit"; no discoverable zoom for users without scroll-zoom muscle memory.
8. Share has zero presence or messaging anywhere in the room (see F4).
9. Post-materialization banner "1 visual reference needs review-media preparation before this board can be published" is internal-sounding and doesn't link to the item or its "Replace image" action.
10. "Add a product" tab counts ("Personal · 13", "Studio · 0", "Catalog · 1") — nice, but "Studio · 0" can read as "sharing isn't set up" rather than "empty".

## Coverage boundaries (untested)
- File upload, OS drag-drop, clipboard image paste — not automatable.
- Download-to-disk — verified by in-app status/network only.
- URL unfurl — no obvious "paste a product URL" control found in the Library tab; "Quick-create draft" tab unchecked as the possible entry. Needs follow-up.
- Mobile width — `resize_window` reported success but `window.innerWidth` never changed (stayed 1953px); environment limitation, narrow-viewport behavior unverified.
- Undo/redo exact depth; Scans + Feedback rail tabs; Grid/Snap toggles' effect; Palettes rail tab — seen, not exercised.
- **Proposal-owned board path — not tested in this session** (see orchestrator's note; covered in follow-up).

## Cleanup status
- Boards cleaned up via parent-project archive. Scratch project "ZZ QA Scratch Board Test 2026-08-31" **ARCHIVED** (no hard-delete UI exists for boards or projects; archive was the safe reversible action, custom confirmation). Verified gone from `/desk` active list.
- **Cleanup owed:** studio template "ZZ QA Scratch Template 2026-08-31" not yet deleted (its Delete lives in the Board-templates dialog reachable only via a project's Boards facet; agent declined to route through a real client project). Handled in follow-up.
- No share link created (feature absent on this surface). A post-archive time-tracking prompt was discarded, not logged.
