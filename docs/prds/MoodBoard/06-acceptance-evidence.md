# MoodBoard acceptance evidence ledger

**Audit date:** 2026-08-03
**Release state:** **Approved by Kody on 2026-08-03 for direct 100% GA with
explicit release-owner waivers. Five production-only probes remain open and
must be resolved by the ordered deployment verification.**

This is the release gate for the one-time MoodBoard GA. The phase PRDs remain
authoritative for criterion wording. Every row below has a named workstream,
an honest status, and a reproducible evidence ID. Evidence IDs resolve to an
exact path and command in the catalog; “Passed” is used only for an automated
or local-stack behavior that was actually observed.

## Status summary

| Status | Count | Meaning |
|---|---:|---|
| Passed | 43 | The complete criterion was demonstrated by an observed automated or local-stack check. |
| Waived | 31 | Kody approved the named pre-production or manual evidence gap on 2026-08-03 for direct GA. The retained automated evidence remains valid; a waiver is not a pass. |
| In progress | 5 | Implementation and automated evidence exist, but the criterion requires the production deployment probe. |
| Adapted | 5 | The approved/intentional GA architecture supersedes the literal test shape; rationale and replacement evidence are in the row. |
| Superseded | 1 | The approved always-on GA decision removed the flag-off legacy behavior. |
| **Total** | **85** | 33 Phase 1 + 25 Phase 2 + 27 Phase 3. |

No criterion is “Pending” or “Unassigned.”

### Release-owner waiver record

`GA-WAIVER-2026-08-03` applies to all 31 rows marked **Waived**: Kody,
release owner, approved them on 2026-08-03 so the product can move directly to
100% GA. The rationale is that implementation and the automated/local-stack
evidence are complete enough for release, there is no active designer cohort
for a meaningful canary, and the remaining pre-production browser, hardware,
visual, persistence, or served-function observations are non-blocking. Each
row retains the evidence already gathered and names the observation being
waived. This decision does not convert those rows to Passed. AC1.3, AC1.33,
AC2.25, AC3.10, and AC3.27 are excluded because their production observations
remain part of the release probe.

## Evidence command catalog

Commands were run from the repository root unless a row says otherwise.

| ID | Evidence path and exact command | Observed result |
|---|---|---|
| ROOM-E2E | `apps/designer-portal/e2e/mood-board/mood-board-ga.spec.ts` — `set -a; eval "$(supabase status -o env 2>/dev/null)"; set +a; export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"; pnpm --dir apps/designer-portal exec playwright test e2e/mood-board/mood-board-ga.spec.ts --project=chromium --reporter=line`. The helper refuses non-local DB hosts. | 8/8 Chromium tests passed in 1.6m, including DB-backed structural writes, verdict delete/undo, mobile bounds, reduced motion, 44px targets, focus containment, and scroll-lock ref counting. |
| CANVAS-UNIT | `packages/patina-design-system/src/components/BoardRoomCanvas/BoardRoomCanvas.test.tsx` — `pnpm --filter @patina/design-system exec vitest run src/components/BoardRoomCanvas/BoardRoomCanvas.test.tsx`. | 25/25 passed. |
| COMMAND-UNIT | `apps/designer-portal/src/components/portal/scope-builder/board-room-command-engine.test.ts` — `pnpm --filter @patina/designer-portal test -- --runInBand src/components/portal/scope-builder/board-room-command-engine.test.ts`. | 22/22 passed. |
| CONTROLLER-UNIT | `apps/designer-portal/src/components/portal/scope-builder/board-room-controller.test.tsx` — `pnpm --filter @patina/designer-portal test -- --runInBand src/components/portal/scope-builder/board-room-controller.test.tsx`. | 16/16 passed. |
| ROOM-UNIT | Criterion-specific designer tests under `apps/designer-portal/src/**` — `pnpm --filter @patina/designer-portal test -- --runInBand`. | 213 suites / 2025 tests passed. |
| RENDER-UNIT | `packages/patina-design-system/src/components/proposal/BoardsBlock.test.tsx` and `src/mood-board/{geometry,painter}.test.ts` — `pnpm --filter @patina/design-system exec vitest run src/components/proposal/BoardsBlock.test.tsx src/mood-board/geometry.test.ts src/mood-board/painter.test.ts`. | Focused MoodBoard renderer/painter checks passed. |
| EXPORT-VISUAL | `apps/designer-portal/e2e/mood-board/export-parity.visual.pw.ts` — `pnpm --dir apps/designer-portal exec playwright test --config playwright.mood-board-visual.config.ts`. | 1/1 Chromium DOM-versus-painter pixel comparison passed. |
| CLIENT-UNIT | `apps/client-portal/src/components/__tests__/{board-block,proposal-document}.test.tsx` and MoodBoard privacy/analytics tests — `pnpm --filter @patina/client-portal test -- --runInBand src/components/__tests__/board-block.test.tsx src/components/__tests__/proposal-document.test.tsx src/lib/analytics/__tests__/mood-board-events.test.ts src/lib/analytics/__tests__/mood-board-server.test.ts src/lib/analytics/__tests__/posthog-privacy.test.ts`. | 5 suites / 17 focused client/guest renderer, failure-boundary, auth-surface, token-redaction, and telemetry tests passed. |
| SUPABASE-UNIT | Hook tests under `packages/supabase/src/hooks/__tests__` — `pnpm --filter @patina/supabase test`. | 47 files / 576 tests passed. |
| SQL-SHARE | `supabase/tests/mood_boards/share_security_test.sql` — `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/mood_boards/share_security_test.sql`. | Passed, including proposal isolation and true project-owned mint/resolve/revoke. |
| SQL-UPGRADE | `supabase/tests/mood_boards/share_upgrade_test.sh` — `bash supabase/tests/mood_boards/share_upgrade_test.sh`. | Pre-migration proposal share resolved identically after the upgrade. |
| SQL-LINEAGE | `supabase/tests/mood_boards/lineage_and_client_bundle_test.sql` — `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/mood_boards/lineage_and_client_bundle_test.sql`. | Passed. |
| SQL-TEMPLATE | `supabase/tests/mood_boards/template_lifecycle_test.sql` — `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/mood_boards/template_lifecycle_test.sql`. | Passed: sanitization, materialization, seeded immutability, and cross-studio RLS. |
| SQL-MAINT | `supabase/tests/mood_boards/maintenance_quota_test.sql` — `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/mood_boards/maintenance_quota_test.sql`. | Passed. |
| SQL-ATOMIC | `supabase/tests/mood_boards/atomic_room_state_test.sql` — `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/mood_boards/atomic_room_state_test.sql`. | Passed. |
| STORAGE-LIVE | `supabase/tests/mood_boards/storage_lifecycle_integration_test.ts` — after a fresh local reset, `MOOD_BOARD_LOCAL_STACK=1 deno test --config supabase/functions/deno.json --import-map supabase/tests/mood_boards/storage_lifecycle_import_map.json --allow-env --allow-net --allow-read --allow-run supabase/tests/mood_boards/storage_lifecycle_integration_test.ts`. | 1/1 passed in 34s against real local Storage/PostgREST/DB; teardown proved zero fixture residue. |
| CLEANUP-DENO | `supabase/functions/board-asset-cleanup/{core_test,run_test}.ts` — `deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-asset-cleanup/core_test.ts supabase/functions/board-asset-cleanup/run_test.ts`. | 7/7 passed. |
| PDF-DENO | `supabase/functions/_shared/spec-pdf{.importers,,.types}.test.ts` and `supabase/functions/spec-pdf/{core,image-loader}.test.ts` — `deno test --config supabase/functions/deno.json --allow-env --allow-read --allow-net --node-modules-dir=auto supabase/functions/_shared/spec-pdf.importers.test.ts supabase/functions/_shared/spec-pdf.test.ts supabase/functions/_shared/spec-pdf.types.test.ts supabase/functions/spec-pdf/core.test.ts supabase/functions/spec-pdf/image-loader.test.ts`. | 32/32 passed: 24 shared structural checks plus 8 importer/type/core/image checks. |
| EDGE-SSRF | `supabase/functions/capture-from-url/ssrf{,_response_parser,_transport}_test.ts` and `supabase/functions/spec-pdf/image-loader.test.ts` — `deno test --config supabase/functions/deno.json --allow-env --allow-net --allow-read --node-modules-dir=auto supabase/functions/capture-from-url/ssrf_test.ts supabase/functions/capture-from-url/ssrf_response_parser_test.ts supabase/functions/capture-from-url/ssrf_transport_test.ts supabase/functions/spec-pdf/image-loader.test.ts`. | 20/20 passed: vetted-IP connection pinning, per-hop redirect repinning, rebinding refusal, strict HTTP framing/limits, absolute deadline, public-address validation, and PDF image reuse. Hosted Edge transport remains a PROD-PROBE. |
| MEDIA-GATES | `services/media/src/modules/background-removal/*.spec.ts`, `services/media/test/background-removal.e2e-spec.ts` — `pnpm --filter @patina/media test -- --runInBand src/modules/background-removal && pnpm --filter @patina/media test:e2e -- --runInBand test/background-removal.e2e-spec.ts && pnpm --filter @patina/media build`. | Focused background-removal unit 57/57, focused e2e 6/6, and strict Nest build passed. The unrelated full media suite is not claimed green. |
| ANALYTICS-UNIT | Designer `src/lib/analytics/__tests__/mood-board-events.test.ts`; client `src/lib/analytics/__tests__/{mood-board-events,mood-board-server}.test.ts` — `pnpm --filter @patina/designer-portal test -- --runInBand src/lib/analytics/__tests__/mood-board-events.test.ts && pnpm --filter @patina/client-portal test -- --runInBand src/lib/analytics/__tests__/mood-board-events.test.ts src/lib/analytics/__tests__/mood-board-server.test.ts`. | Taxonomy, lineage, renderer success/failure, privacy-safe exception, and server-event tests passed. Production capture is not yet probed. |
| STATIC-CONTRACT | Renderer sources plus `apps/designer-portal/src/lib/document/__tests__/proposal-mirror-contract.test.ts` — `rg -n 'BoardStatic|BoardComposition|BoardsBlock' apps packages/patina-design-system/src && pnpm --filter @patina/designer-portal test -- --runInBand src/lib/document/__tests__/proposal-mirror-contract.test.ts`. | Shared-wrapper/direct-renderer contract passed; legacy `BoardStatic` is absent. |
| MANUAL-GESTURE | Start `pnpm dev:designer`; on a real precision trackpad run AC1.6 at 5%, 100%, and 400%, recording a Playwright trace/video and console log. | Not yet signed off. |
| MANUAL-PARITY | Start `pnpm dev:designer` and `pnpm --filter @patina/design-system storybook`; render the golden fixture on room Present, proposal mirror, authenticated client, guest share, and compare screenshots with the shared fixture. | Not yet signed off. |
| PROD-PROBE | Ordered deployment behavior probe from `05-implementation-addendum.md`: live analytics event inspection, edge-function 200/404 requests, Cloudflare deployment lists, and production object/security checks. | Not run; no production deployment is claimed by this ledger. |

## Phase 1 — The Room

| AC | Requirement | Acceptance criterion | Owner | Status | Evidence |
|---|---|---|---|---|---|
| AC1.1 | R1.1 | Full-viewport `/board/<id>`, no desk chrome/page scroll/layout shift | Room shell — Designer portal | Adapted | Always-on GA removes the flag precondition. ROOM-E2E test “owns the viewport…” passed; the 44px/focus/scroll-lock checks are in the same path. |
| AC1.2 | R1.1.5, R1.2.2 | Flag-off redirect and legacy inline editor | Product architecture | Superseded | Approved one-release GA removes the flag-off path and legacy inline editor. Replacement behavior is AC1.1; see `05-implementation-addendum.md` and ROOM-E2E. |
| AC1.3 | R1.2.5 | Drafting strip, desk recents, and command bar emit distinct open sources | Entry + analytics — Designer portal | In progress | `apps/designer-portal/src/lib/mood-board/navigation.test.ts` via ROOM-UNIT and ANALYTICS-UNIT cover source contracts; PROD-PROBE must observe all three live captures. |
| AC1.4 | R1.2.4 | Command-bar board results outrank Drafting Room and navigate to the board | Desk navigation — Designer portal | Waived | `apps/designer-portal/src/lib/mood-board/navigation.test.ts` via ROOM-UNIT proves ranking/URL construction; interactive command-bar selection remains a release browser probe. |
| AC1.5 | R1.3.2 | Done/Escape origin fallback and malicious `from` rejection | Room navigation — Designer portal | Waived | Navigation unit tests via ROOM-UNIT cover validation/fallback order; browser coverage of every return origin remains. |
| AC1.6 | R1.5.2, R1.5.3, R1.5.5 | Trackpad pan, pointer-anchored command-wheel/pinch zoom, Space-drag | Canvas QA — Design system | Waived | CANVAS-UNIT proves plain-wheel pan and control-wheel anchoring; real pinch/two-finger/Space-drag sign-off is MANUAL-GESTURE. |
| AC1.7 | R1.5.4, R1.5.6, R1.5.7 | 5–400% clamp, `1` fit, `⌘0` 100% | Canvas engine — Design system | Waived | CANVAS-UNIT covers fit-key behavior and ROOM-E2E exercises 5/100/400; the full shortcut/clamp matrix remains a browser probe. |
| AC1.8 | R1.6.2, R1.6.3 | Persist right-edge growth; left/top growth has no visual jump | Canvas persistence — Designer portal | Waived | COMMAND-UNIT and CONTROLLER-UNIT prove atomic growth and pan compensation; a local DB SELECT after all three edge directions remains. |
| AC1.9 | R1.7.1 | Rail drop centers ±2px at three zoom levels | Canvas integration — Designer portal | Passed | CANVAS-UNIT parameterizes 5/100/400%; ROOM-E2E “centers rail drops…” additionally persists the structural write. |
| AC1.10 | R1.7.3 | Three dropped images create three pins and stored objects | Asset pipeline — Designer portal | Adapted | GA stores two bounded derivatives per source: **3 pins / 6 objects**, not 3 raw objects. `apps/designer-portal/src/lib/mood-board-assets/__tests__/upload-board-assets.test.ts` via ROOM-UNIT proves unique display+thumbnail pairs and rollback. |
| AC1.11 | R1.8.2, R1.8.3, R1.8.5 | Marquee/shift selection and equal-delta group drag | Canvas engine — Design system | Waived | CANVAS-UNIT and ROOM-E2E cover click, shift, locked-aware marquee, and selection; an explicit persisted multi-drag delta assertion remains. |
| AC1.12 | R1.8.6 | Locked item excluded from marquee/Select All and cannot transform | Canvas engine — Design system | Waived | CANVAS-UNIT proves selection exclusions; an end-to-end drag+resize refusal for a locked pin remains. |
| AC1.13 | R1.9.2, R1.9.3 | Aspect resize, Shift release, persisted width with null auto-height | Canvas engine — Design system | Waived | CANVAS-UNIT covers aspect/Shift/auto-height math; the final null-height DB row assertion remains. |
| AC1.14 | R1.9.5 | Shift rotation snap, persisted rotation, rotated AABB marquee | Canvas geometry — Design system | Waived | CANVAS-UNIT covers 15° snapping and geometry tests cover AABB; persisted rotation plus browser marquee are still required together. |
| AC1.15 | R1.10.1, R1.10.3 | 6px guide/snap; Alt suppresses both | Canvas geometry — Design system | Waived | CANVAS-UNIT covers guide/snap and Alt suppression; pointer-drag evidence at the exact screen-pixel tolerance remains. |
| AC1.16 | R1.10.4 | Grid visibility and snap preference are independent | Canvas engine — Design system | Passed | CANVAS-UNIT parameterized AC1.16 for both grid-off/snap-on and grid-on/snap-off. |
| AC1.17 | R1.11.1, R1.11.4 | Align-left three items and undo as one command | Command engine — Designer portal | Passed | COMMAND-UNIT AC1.17 passed with exact positions before/after one undo. |
| AC1.18 | R1.12.3 | 400px drag is one undo step with redo | Command engine — Designer portal | Passed | COMMAND-UNIT AC1.18 and ROOM-E2E nudge/undo/redo/reload passed. |
| AC1.19 | R1.12.5, R1.12.6 | Mid-drag delete cannot resurrect; undo restores same ID; no console error | Persistence — Designer portal | Waived | COMMAND-UNIT and CONTROLLER-UNIT prove stale-commit rejection and same-ID resurrection; the exact two-item context-menu race plus console assertion remains. |
| AC1.20 | R1.18.6 | Retired layout-ID workaround absent while AC1.19 core passes | Persistence — Designer portal | Passed | `! rg -n 'retiredLayoutItemIdsRef' apps packages` plus COMMAND-UNIT AC1.19/1.20 passed. |
| AC1.21 | R1.13.1, R1.13.2 | `⌘D` 24/24 duplicate and Alt-drag originals stay | Command engine — Designer portal | Passed | COMMAND-UNIT AC1.21 and ROOM-E2E Alt-drag persistence passed. |
| AC1.22 | R1.13.3, R1.13.4 | Cross-board paste preserves geometry and conditionally strips FKs | Clipboard/ownership — Designer portal | Waived | COMMAND-UNIT AC1.22 proves the owner-aware envelope; a two-board/two-owner live persistence run remains. |
| AC1.23 | R1.14.1 | Ten rapid nudges coalesce into one 10px undo step | Command engine — Designer portal | Passed | COMMAND-UNIT AC1.23 passed. |
| AC1.24 | R1.14.4, R1.19.3 | Pointer and keyboard context menu are identical and arrow-navigable | Accessibility — Design system | Waived | CANVAS-UNIT covers right-click and `Shift+F10` semantic requests; full roving-menu arrow navigation remains a browser probe. |
| AC1.25 | R1.15.2, R1.15.3, R1.15.5 | Selection/whole-board Tidy preserves order and undoes once | Arrange engine — Designer portal | Passed | `apps/designer-portal/src/components/mood-board/board-room-tidy.test.ts` via ROOM-UNIT plus COMMAND-UNIT AC1.25 passed. |
| AC1.26 | R1.16.3 | Section membership derives from center-in-band and clears outside | Sections — Designer portal | Waived | COMMAND-UNIT AC1.26 and CANVAS-UNIT section-bounds behavior passed; persisted enter/leave DB assertions remain. |
| AC1.27 | R1.16.4 | Dragging a band moves it and members as one undoable command | Sections — Designer portal | Passed | CANVAS-UNIT, COMMAND-UNIT, and CONTROLLER-UNIT AC1.27 passed. |
| AC1.28 | R1.17.5 | Phase-local legacy renderer byte diff/non-regression | Unified renderer — Design system | Adapted | The renderer landed as one shared `BoardComposition`/ `BoardsBlock` path, so preserving obsolete files byte-for-byte is not meaningful. RENDER-UNIT and STATIC-CONTRACT replace that check; AC2.1 retains the cross-surface visual sign-off. |
| AC1.29 | R1.18.4 | Project-owned room edits and flushes without barrier error | Project boards — Designer portal | Waived | CONTROLLER-UNIT AC1.29, SUPABASE-UNIT owner hooks, and SQL-ATOMIC cover the owner leg; a routed local-browser project edit/exit remains. |
| AC1.30 | R1.19.1, R1.19.2, R1.19.5 | Tab/Enter/arrows/live-region keyboard contract | Accessibility — Designer portal | Waived | CANVAS-UNIT and ROOM-E2E cover focus-driven arrows, selection, and containment; exhaustive Tab/Enter/live-region announcement capture remains. |
| AC1.31 | R1.19.6 | Reduced motion removes easing/animation while guides remain | Accessibility — Designer portal | Waived | ROOM-E2E verifies bounded mobile room and disabled canvas motion; a guide-visible reduced-motion capture remains. |
| AC1.32 | R1.19.4 | Closing portalled picker preserves room body lock | Accessibility — Designer portal | Passed | ROOM-E2E plus `apps/designer-portal/src/lib/__tests__/full-screen-boundary.test.ts` via ROOM-UNIT prove ref-counted lock/focus behavior. |
| AC1.33 | Analytics | Four Phase 1 events and all Done booleans | Analytics — Designer portal | In progress | ANALYTICS-UNIT proves names/properties and callers; PROD-PROBE must observe real captures and all four `used_*` values. |

## Phase 2 — The Audience

| AC | Requirement | Acceptance criterion | Owner | Status | Evidence |
|---|---|---|---|---|---|
| AC2.1 | R2.1.7 | Present/client/guest/mirror geometry matches visually | Release visual QA | Waived | RENDER-UNIT proves one geometry consumer, but the required four-surface screenshot comparison is MANUAL-PARITY and is not signed off. |
| AC2.2 | R2.1.3 | Three non-empty labelled section bands on every client surface | Unified renderer — Design system | Waived | RENDER-UNIT “shared geometry for non-empty section bands” passed; all-surface screenshot evidence remains under MANUAL-PARITY. |
| AC2.3 | R2.1.4 | Grown 2400×1600 canvas fits unclipped on four surfaces | Unified renderer — Design system | Waived | Shared fit math is covered by RENDER-UNIT; the four viewport captures remain under MANUAL-PARITY. |
| AC2.4 | R2.1.5 | Mobile stacked fallback includes section headings | Unified renderer — Design system | Passed | RENDER-UNIT explicitly covers mobile headings, all six pin types, and display/thumbnail selection. |
| AC2.5 | R2.2.2 | `P`/toggle enters chrome-free Present and fits composition | Present mode — Designer portal | Waived | ROOM-E2E proves edit chrome disappears and CONTROLLER-UNIT proves immutable Present; top-bar toggle plus fit-margin matrix remains. |
| AC2.6 | R2.2.3, R2.2.5 | Live edit survives Present round trip with selection/history | Present mode — Designer portal | Passed | CONTROLLER-UNIT AC2.6 passed without refetch; ROOM-E2E Present return passed. |
| AC2.7 | R2.2.4 | Notes toggle hides without modifying DB rows | Unified renderer — Design system | Waived | RENDER-UNIT proves notes leave desktop/stacked DOM; before/after DB equality remains. |
| AC2.8 | R2.2.6 | Escape leaves Present, then leaves room | Present mode — Designer portal | Passed | CONTROLLER-UNIT escape-ladder test and ROOM-E2E passed. |
| AC2.9 | R2.3.2 | Client verdict writes exactly the board-item anchor | Client feedback — Supabase/client portal | Waived | CLIENT-UNIT and SUPABASE-UNIT cover feedback submission shape; a real client-session DB row assertion remains. |
| AC2.10 | R2.3.2 | Empty comment is client validation, not a 500 | Client feedback — Supabase | Passed | `packages/supabase/src/hooks/__tests__/use-item-feedback.test.ts` via SUPABASE-UNIT proves no write is issued and the validation message surfaces. |
| AC2.11 | R2.3.3 | Guest share never offers verdicts despite stale visibility | Guest renderer — Client portal | Passed | CLIENT-UNIT test “keeps guest-resolved boards non-interactive…” passed. |
| AC2.12 | R2.3.4, R2.3.5 | Designer verdict chips in Edit/Present; filter selects/scrolls | Feedback UI — Designer portal | Passed | ROOM-E2E DB-backed AC2.12 scenario passed in Edit and Present and focused the filtered pin. |
| AC2.13 | R2.3.6 | Delete warns/counts, cascades verdicts, undo restores only pin | Feedback/persistence — Designer portal | Passed | ROOM-E2E DB-backed AC2.13 scenario plus SUPABASE-UNIT pin-feedback invalidation passed. |
| AC2.14 | R2.4.2 | Raw token returned once; only hash persists/logs | Share security — Supabase/designer portal | Passed | `board-share-dialog.test.tsx` via ROOM-UNIT and SQL-SHARE prove one-time raw-token handling and hashed storage. |
| AC2.15 | R2.4.4 | Board token resolves only its board, never parent proposal | Share security — Supabase | Passed | SQL-SHARE exercises resolver allowlisting and proposal-isolation probes. |
| AC2.16 | R2.4.3 | True project-owned board can be shared and resolved | Share security — Supabase | Passed | SQL-SHARE now mints, resolves, and revokes a board with `project_id` set and `proposal_id` null. |
| AC2.17 | R2.4.7 | Pre-migration proposal shares remain compatible | Share migrations — Supabase | Passed | SQL-UPGRADE creates the legacy row before migration replay and resolves it afterward. |
| AC2.18 | R2.4.6 | Revoke produces 404 and persisted revoked status | Share security — Supabase/designer portal | Passed | SQL-SHARE and `board-share-dialog.test.tsx` via ROOM-UNIT cover resolver denial and scoped revoke. |
| AC2.19 | R2.5.1 | Project surface lists live boards and opens each room | Project boards — Designer portal | Waived | `apps/designer-portal/src/components/document/project-mood-boards.test.tsx` via ROOM-UNIT and SUPABASE-UNIT cover listing/URLs; routed browser navigation remains. |
| AC2.20 | R2.5.2, R2.5.3 | Frozen ID-less snapshot is read-only and safe | Project renderer — Designer portal/design system | Passed | Project mood-board unit plus RENDER-UNIT prove ID-less snapshots have no interactive overlays and do not throw. |
| AC2.21 | R2.5.4, R2.5.5 | Continue creates one live board and repeat offers lineage board | Project continuity — Supabase/designer portal | Passed | Project mood-board unit and SQL-LINEAGE prove creation/navigation intent and deduplicated source lineage. |
| AC2.22 | R2.5.6, R2.5.7 | Project chip/Done origin/flush all succeed in routed room | Project room — Designer portal | Waived | CONTROLLER-UNIT AC1.29 proves flush and owner naming; routed chip plus Done-origin browser evidence remains. |
| AC2.23 | R2.6.1 | Three surfaces directly import `BoardComposition`, no local layout | Unified renderer architecture | Adapted | Client and guest intentionally use the shared `BoardsBlock` wrapper, which itself maps `BoardComposition`; mirror imports it directly. STATIC-CONTRACT proves no surface-local layout. |
| AC2.24 | R2.6.2 | `BoardStatic` deprecated with zero imports | Unified renderer architecture | Adapted | Stronger result: `BoardStatic` was deleted, not retained/deprecated. STATIC-CONTRACT confirms no declaration or import remains. |
| AC2.25 | Analytics | Five Phase 2 events and documented properties | Analytics — Designer/client portals | In progress | ANALYTICS-UNIT covers names, owner lineage, server share view, and client-only verdict emission; PROD-PROBE remains. |

## Phase 3 — The Reach

| AC | Requirement | Acceptance criterion | Owner | Status | Evidence |
|---|---|---|---|---|---|
| AC3.1 | R3.1.1.3, R3.1.1.4 | Six-pin/three-section/rotation PNG matches composition | Export rendering — Design system | Passed | EXPORT-VISUAL passed the golden DOM-versus-painter pixel tolerance check. |
| AC3.2 | R3.1.1.2 | Exact 2× output under cap; uniform reported scale above cap | Export rendering — Design system | Passed | RENDER-UNIT painter scale test and `export-board.test.ts` via ROOM-UNIT cover exact dimensions and 8192px scaling. |
| AC3.3 | R3.1.1.5 | Wait for fonts; forced failure uses stable system fallback | Export rendering — Design system | Passed | RENDER-UNIT painter tests cover `document.fonts.ready` ordering and forced rejection fallback. |
| AC3.4 | R3.1.1.6 | Deleted image object becomes labelled placeholder without abort | Export rendering — Designer portal | Waived | RENDER-UNIT and `board-export-dialog.test.tsx` via ROOM-UNIT prove placeholder reporting; deletion from real Storage followed by browser export remains. |
| AC3.5 | R3.1.1.7 | 100 pins export under 10s with progress and responsive yielding | Export rendering — Design system | Passed | RENDER-UNIT 100-image test asserts <10s, bounded concurrency, monotonic determinate progress, and cooperative yields. |
| AC3.6 | R3.1.2.1 | Composition PDF works; legacy board tile PDF unchanged | PDF edge function — Supabase | Waived | PDF-DENO structurally proves both kinds and legacy regression; local served-function HTTP 200/content probes for both payloads remain. |
| AC3.7 | R3.1.2.2 | Export UI separates Composition and Spec sheet | Export UX — Designer portal | Passed | `apps/designer-portal/src/components/mood-board/board-export-dialog.test.tsx` via ROOM-UNIT proves distinct labels and request kinds. |
| AC3.8 | R3.1.2.6 | Other designer receives uniform 404 for both PDF kinds | PDF authorization — Supabase | Passed | PDF-DENO core authorization checks prove exact-owner-only access and indistinguishable 404 responses. |
| AC3.9 | R3.1.2.5 | Composition model type has no internal money fields | PDF model — Supabase | Passed | `supabase/functions/_shared/spec-pdf.types.test.ts` and shared model tests via PDF-DENO reject trade/markup/margin at type and runtime shape levels. |
| AC3.10 | R3.1.2.8 | Every shared-PDF importer enumerated and redeployed | Edge-function release — Supabase | In progress | `spec-pdf.importers.test.ts` via PDF-DENO proves the manifest is exhaustive; PROD-PROBE deployment of every listed importer remains. |
| AC3.11 | R3.2.1–R3.2.4 | 30s cover persists at stable path; launcher/fallback render | Cover lifecycle — Designer portal/Supabase | Passed | STORAGE-LIVE waited the real 30s and verified Storage+DB; `board-cover-art.test.tsx` and lifecycle tests via ROOM-UNIT cover launcher/fallback. |
| AC3.12 | R3.3.1, R3.3.3 | Product URL placeholder resolves with provenance/host | URL unfurl — Designer portal/Supabase | Waived | `url-unfurl.test.ts`, hook tests, and edge extract tests pass via ROOM-UNIT/Deno; one real reachable-site local-stack resolution remains. |
| AC3.13 | R3.3.1 | Failed scrape becomes an editable URL note | URL unfurl — Designer portal | Passed | `apps/designer-portal/src/lib/mood-board/url-unfurl.test.ts` via ROOM-UNIT proves deterministic same-ID note fallback and readable failure. |
| AC3.14 | R3.3.4 | Captures tab lists extension captures; drag retains `capture_id` | Capture integration — Extension/designer portal | Waived | Rail/hook tests and extension payload suite pass; an extension-created local capture dragged to a DB-backed board remains. |
| AC3.15 | R3.4.3, R3.4.4 | Cutout swaps canonical URLs; revert and undo are single steps | Background removal — Media/designer portal | Waived | MEDIA-GATES plus `board-image-inspector-actions.test.tsx` via ROOM-UNIT prove canonical patches/revert; live vendor or deterministic adapter Storage round-trip remains. |
| AC3.16 | R3.4.6 | Unconfigured vendor hides UI and returns structured error | Background removal — Media/designer portal | Passed | MEDIA-GATES and image-inspector tests prove hidden capability and `background_removal_not_configured`. |
| AC3.17 | R3.4.7 | Durable studio cap blocks vendor and shows reset date | Background removal — Media/designer portal | Passed | MEDIA-GATES, SQL-MAINT, and image-inspector quota test prove reservation denial, no vendor call, readable cap/reset. |
| AC3.18 | R3.4.8 | Mutation is not retried after timeout | Background removal — Media/designer portal | Passed | `use-background-removal.test.tsx` via ROOM-UNIT proves retry disabled despite client defaults; MEDIA-GATES proves idempotent reservation behavior. |
| AC3.19 | R3.4.9 | Vendor identity never reaches client response/header/error | Background removal — Media | Passed | MEDIA-GATES unit/e2e response-contract checks passed. |
| AC3.20 | R3.5.1, R3.5.2 | 6000px upload yields ≤2400 display and ≤400 thumbnail, used correctly | Asset pipeline — Designer portal | Waived | Image-preparation/upload tests via ROOM-UNIT and RENDER-UNIT prove bounds and URL selection; a real 6000px browser/Storage fixture remains. |
| AC3.21 | R3.5.4 | Dry-run lists only true orphan across all reference shapes | Asset maintenance — Supabase | Passed | STORAGE-LIVE used real Storage/DB references for second-board paste, template, frozen snapshot, and original URL; CLEANUP-DENO also passed. |
| AC3.22 | R3.5.4 | First pass deletes nothing; 14-day candidate deletes; job run recorded | Asset maintenance — Supabase | Passed | STORAGE-LIVE proved the two-pass/aged-delete/job ledger lifecycle and clean teardown; CLEANUP-DENO passed. |
| AC3.23 | R3.6.1, R3.6.2 | Save template strips live FKs and preserves sections | Templates — Supabase | Passed | SQL-TEMPLATE recursively asserts stripped product/capture/palette/owner references and preserved section snapshot. |
| AC3.24 | R3.6.4, R3.6.5 | Seeded/studio groups materialize real rows with no template link | Templates — Supabase/designer portal | Passed | SQL-TEMPLATE proves fresh board/item materialization; `board-template-dialog.test.tsx` and SUPABASE-UNIT cover both UI/RPC owner legs. |
| AC3.25 | R3.6.6, RLS | Studio template rename/delete works; seeded mutation denied | Templates — Supabase | Passed | SQL-TEMPLATE exercises own-studio management and seeded update/delete refusal under authenticated RLS. |
| AC3.26 | RLS | Studio A cannot read/update/delete studio B template | Templates — Supabase | Passed | SQL-TEMPLATE executes the cross-studio visibility/mutation denial. |
| AC3.27 | Analytics | Seven Phase 3 events and documented properties | Analytics — Designer portal | In progress | ANALYTICS-UNIT proves taxonomy/properties and no-op safety; PROD-PROBE must observe all seven outcomes, including failures. |

## Release-wide gate

- [x] Kody approved direct 100% GA and `GA-WAIVER-2026-08-03` for the 31
  pre-production/manual gaps. Current result: 43 Passed, 31 Waived, 5 In
  progress, 5 Adapted, 1 Superseded.
- [x] M1–M8 release measurement is approved. M2 uses a prospective 30-day and
  50-session baseline, M3 accepts the snapshot proxy before the first 10
  genuine Done boards, and M8 uses the controlled-smoke/prospective policy in
  [07-release-baseline.md](./07-release-baseline.md).
- [x] Local Supabase reset, generated types, MoodBoard SQL suites, and the
  local-stack Storage lifecycle completed successfully.
- [x] Designer explicit type-check, full Jest, focused Chromium; Supabase type
  and Vitest; design-system type/build/focused tests; media build/unit/e2e;
  extension type/build/payload; and iOS simulator compile/decode gates were
  recorded. This does not convert rows with missing runtime observations.
- [x] Four-surface composition parity and real-trackpad protocols are retained
  but explicitly waived for this release (AC2.1 and AC1.6).
- [x] Existing proposal-share upgrade and legacy spec-PDF structural
  regression tests pass locally.
- [x] Remaining pre-production served-function/browser/manual observations are
  retained in their rows and explicitly waived for this release.
- [ ] Production migrations/functions/media/client/designer deployment and
  post-deploy object, security, analytics, and deployment-list probes pass.

## Claim boundary

Direct 100% GA is approved, but no production deployment or production behavior
probe is claimed by this pre-deploy revision. Browser evidence is
Chromium/local-stack unless a row says otherwise. iOS evidence is simulator
compile/focused decoding, not physical-device or live-backend validation. The
client portal's unrelated pre-existing full-suite failures and the
design-system's unrelated Text assertions are not treated as MoodBoard passes
or failures; focused changed-surface gates are named above.
