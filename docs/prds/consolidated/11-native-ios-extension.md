# Native — iOS Capture & Chrome Extension — Consolidated PRD

## 1. Header

**Area**: Native edge surfaces — three distinct client apps feeding one Supabase backend: the original consumer-facing Patina companion iOS app, a new designer-facing Field Capture iOS app, and the Patina Capture Chrome extension.

**Per-sub-feature status:**

| Sub-feature | Status |
|---|---|
| Patina companion app — room scan pipeline (RoomPlan/ARKit "The Walk") | Shipped (wired to prod Supabase — storage + `room_scans`/`room_scan_images` + `confirm-scan-bundle`) |
| Patina companion app — AI Companion (chat) | Partial (edge fns exist; `companion-context` queries a nonexistent table; degrades to canned responses without `CLAUDE_API_KEY`) |
| Patina companion app — StyleQuiz / StyleConversation / StyleReveal, ARPlacement, designer-mode surfaces (Projects/Decisions/Messaging/Receiving) | Shipped (present in-app; consolidation-with-Capture decision not recorded) |
| Field Capture app (designer "specimen" capture) — UI/recognition services (camera, ARKit measure, barcode, OCR, voice, smart-guess) | Shipped (32-screen matrix, merged to main) |
| Field Capture app — sync to backend (`capture-media` upload + `commit_field_capture`) | Planned / in-progress (server side fully built; client-side sync is a local simulation, explicit TODO) |
| Field Capture app — auth ("Sign in with Patina") | Planned (stubbed with `StubWorkspaceAuthorizer`) |
| Field Capture — designer-portal inbox/triage UI for `field_captures` | Planned (no consumer of `field_captures` exists on the web) |
| Chrome extension ("Patina Capture") — capture products/vendors into Supabase | Shipped (v0.1.0, direct-to-Supabase writes, offline outbox) |
| Chrome extension — capture-source attribution (`capture_source='web_extension'`) | Partial (provenance vocabulary exists in 00232 but the extension never sets it) |

**Last reconciled:** 2026-07-06

**Source docs:**
- `docs/specs/_active/mobile-companion.md`
- `docs/specs/_active/mobile-first-launch.md`
- `docs/_archive/specs/_active/patina-companion-dev-spec.md`
- `docs/specs/_active/patina-roomplan-specification.md`
- `docs/specs/_active/product-capture.md`
- `docs/specs/IOS Scann/quiet-conversation-prd.md`
- `docs/specs/IOS Scann/quiet-conversation-screens.html`
- `docs/design/ios-Capture/patina-mobile-ux-flow.html`
- `docs/design/ios-ux-review/index.html`
- `docs/_archive/architecture/ios-development-plan.md`
- `docs/wireframes/mobile-companion-flow.html`
- `docs/wireframes/mobile-immersive-experience.html`
- `docs/wireframes/mobile-immersive-exp-v2.html`
- `docs/wireframes/web-companion.html`
- `apps/mobile/Patina/CLAUDE.md`
- `apps/mobile/Capture/README.md`
- `apps/extension/CLAUDE.md`

## 2. Overview

Patina's "native" edge is three distinct client surfaces feeding one Supabase backend, not a single app:

1. **`apps/mobile/Patina`** — the original consumer-facing SwiftUI "companion" app (~317 Swift files under `Patina/Patina/`). Room capture (RoomPlan/ARKit LiDAR "The Walk"), an AI Companion, style discovery (StyleQuiz/StyleConversation/StyleReveal), AR placement, plus designer-mode surfaces (Projects, Decisions, Messaging, Receiving). This is the app the mobile-companion / roomplan / first-launch / ios-development-plan specs describe, and it is genuinely wired to prod Supabase.

2. **`apps/mobile/Capture`** — a NEW standalone, camera-first *designer* "Field Capture" app (T-03, ~85 Swift files + an embedded `CaptureKit` framework). Turns a physical showroom object into a structured "specimen" (photos, voice note, barcode, AR measurement, venue pin) and is meant to sync it to a server-side inbox. Merged to main (`03537b18`), 32-screen matrix built, but its sync/auth layers are still local simulations — real backend wiring is deferred (see Section 7).

3. **`apps/extension`** — a Plasmo/MV3 Chrome extension ("Patina Capture", v0.1.0) that captures products/vendors while a designer browses and writes them straight into Supabase.

**Primary users:**
- **End clients** — the Patina companion app's walk-first, style-discovery, and AR-placement surfaces, plus its designer-mode surfaces for clients who are also on a project team.
- **Interior designers** — the Field Capture app (specimen capture in showrooms/vendor floors) and the Chrome extension (product/vendor capture while browsing the web), both feeding a designer's personal product library.

**Where it lives:** All three surfaces are native/browser clients of Supabase Cloud Strata, with Supabase Auth as the single session source of truth. None of the three route through the retained NestJS services (`orders`/`media`/`projects`) for capture or sync — everything is direct-to-Supabase (Storage + PostgREST + RPC + edge functions). The Patina companion app is a mature, prod-wired app; the Field Capture app and Chrome extension are the newer, designer-facing investment area, reflecting a pivot in the native roadmap from consumer-first to designer-first tooling.

## 3. As-Built Architecture

### 1. Patina companion app (`apps/mobile/Patina/Patina/`)

- **Backend targeting**: `Services/API/APIConfiguration.swift` — `DeploymentTarget.current` defaults to `.cloud` and consistently targets Supabase Cloud Strata for GoTrue, PostgREST, Storage, Realtime, and Edge Functions. The only runtime override is `.local`, which uses the local Supabase CLI gateway on `127.0.0.1:54321`. `Endpoint` maps GoTrue auth, PostgREST tables, storage, and the three companion edge functions.
- **Scan pipeline (v3)**: `Features/Walk/Services/RoomCaptureService.swift` (RoomPlan+ARKit) → `ScanBundleWriter` (versioned on-disk bundle, `ScanManifest` v3) → `Services/Sync/RoomScanSyncService.swift` + `ArtifactUploader.swift` + `BackgroundScanUploader.swift` + `ScanSyncQueue.swift`. Uploads to the `room-scans` storage bucket and writes real rows into `rooms`, `room_scans`, `room_scan_images` via supabase-swift (confirmed direct `.from("room_scans")`/`.storage.from("room-scans")` calls); hero frames upload to the separate `room-hero-frames` bucket (`heroFrameBucket` in `RoomScanSyncService`).
- **Companion**: `Services/Companion/CompanionAPIClient.swift` (singleton, 3-retry exponential backoff) calls edge functions `companion-context`, `companion-message`, `companion-history` under the caller JWT; `CompanionService`/`ConversationStorageService` manage local state.
- **Other features present**: `Features/QRAuth` (device pairing), `ARPlacement`, `StyleQuiz`/`StyleConversation`/`StyleReveal`, `Decisions`, `Projects`, `Messaging`, `Receiving`, `Recommendations`, `Notifications`, `FirstLaunch`.

### 2. Designer Field Capture app (`apps/mobile/Capture/`)

- **Structure**: app target `Capture/Capture/` (Features per flow: Onboarding, Capture/Viewfinder, Recognition [Code/Measure/SmartGuess/Tag-OCR/Voice], Route S1–S5, Session V1–V3, Specimen, Library, Settings, Account, SystemEntry). Shared frozen substrate in `CaptureKit/` (domain `@Model` `Specimen`, service protocols, state machine `CaptureLifecycle`, navigation, design tokens, Live Activity attributes). `CaptureKitMocks/` conforms every seam for Simulator rendering. Xcode project is **generated** (`scripts/generate_project.rb`).
- **Config**: `App/Configuration/AppConfiguration.swift` → `https://api.patina.cloud`, buckets `capture-media` + `product-images`, app-group `group.cloud.patina.field`, URL scheme `field://`.
- **Recognition services (real)**: `Services/Recognition/*` — `ARKitMeasureService`, `DataScannerCodeService`, `VisionTagOCRService`, `SpeechVoiceNoteService`, `HeuristicSmartGuessService`; camera via `AVFoundationCameraService`; location via `CoreLocationService`; offline-sync Live Activity via `CaptureLiveActivityController`.
- **Sync (SIMULATED)**: `Services/Sync/LocalCaptureSyncService.swift` implements the `CaptureSyncService` seam but `enqueue`/`drain`/`commit`/`route` only mutate the local `CaptureStore` outbox and *simulate* upload progress. The real Supabase Storage upload + `commit_field_capture` RPC is an explicit `TODO(post-validation)` (lines 116–151); no supabase-swift dependency in the target yet.

### 3. Chrome extension (`apps/extension/src/`)

- **Plasmo MV3**, package `@patina/extension` displayName "Patina Capture" v0.1.0. Manifest permissions: activeTab, cookies, storage, contextMenus, scripting, sidePanel, alarms; host `https://*/*` + `http://*/*`; command `capture-product` (Cmd/Ctrl+Shift+S); CSP allows `wasm-unsafe-eval` (tesseract.js OCR).
- **UI**: `sidepanel.tsx` + `panel/` shell/router + `overlays/` (ImageSelect, RecentCaptures, Settings, Decision, CreateProject, Account, Insight) + `screens/` (Snapshot, Extracting, Vendor, Record, Terminal). Content script `contents/extractor.ts`.
- **Data path (direct-to-Supabase)**: `lib/supabase.ts` creates a `@supabase/supabase-js` client with a `chromeStorageAdapter` (chrome.storage.local) so sidepanel + background SW share one session. `background.ts` runs an offline outbox (`capture_queue_v2`, migrated from legacy `capture_queue`) drained on alarms/online/startup; it INSERTs directly into `vendors`, `products` (`layer='personal'`, `owner_user_id`), `product_styles`, and either `project_products` (legacy `saveTarget='project'`) or `proposal_captures` (`saveTarget='proposal'|'inbox'`, statuses assigned/inbox).
- **Auth**: `hooks/use-qr-auth.ts` (QR pairing to mobile) + `lib/portal-cookie.ts` (adopts the portal's Supabase session cookie `sb-<host>-auth-token`). Trade pricing via `hooks/use-trade-account.ts`; update self-check via `lib/update-checker.ts`.

## 4. Data Model

The Field Capture backend (00232–00235) is the newest and most fully server-built piece in this area — modeled closely on the pre-existing room-scan pipeline (resumable-upload columns, artifact-hash merge RPCs, owner-scoped storage policies), but currently has no real client producing rows against it. The room-scan and companion-app tables below are older and already have a live producer (the Patina companion app).

**Field Capture (designer app) — the newest, fully-built server side:**

- **00232** `products_field_capture_origin` — adds `products.capture_source` (CHECK web_extension|portal|field_capture|manual|import, NULL allowed), `capture_provenance` JSONB, `field_capture_id` UUID; partial index; NOT-VALID guard `products_field_capture_requires_source` (field_capture ⇒ personal layer + owner). FK to `field_captures` added in 00233.
- **00233** `field_captures_inbox` — creates `field_captures` (idempotent on `client_capture_id UNIQUE`; status queued→synced→inbox|saved|dismissed; destination library|inbox; full tag/voice/photos/venue/guesses payload; resumable-upload columns `artifacts_sha256`/`upload_progress` mirroring room_scans). RLS: owner full CRUD (`designer_id = auth.uid()`) + active-org members read shared `status='inbox'` rows. `field_captures_guard_routing()` BEFORE-INSERT/UPDATE trigger rejects routing to unowned project/room/org.
- **00234** `capture_media_bucket` — PRIVATE `capture-media` bucket (500MB, heic/jpeg/png/webp + m4a/aac/wav + json), 4 owner-scoped object policies keyed on `(storage.foldername(name))[1] = auth.uid()`; layout `capture-media/<uid>/<client_capture_id>/<artifact>`.
- **00235** `commit_field_capture_rpc` — SECURITY INVOKER state machine: `commit_field_capture(client_capture_id, destination, payload, project_id, room_id, shelf, org_id)` upserts the capture (idempotent, skips already saved/dismissed) and, for destination=library, mints a `draft` personal-library product (`capture_source='field_capture'`, `field_capture_id` back-ref, non-duplicate photo `publicUrl`s → `images`); ANY library-path failure **safe-harbors to inbox** rather than erroring. Plus `route_field_capture`, `dismiss_field_capture`, `merge_capture_artifact_sha256`, `mark_capture_upload_complete`.

**Room scan (companion app):**

- **00014** creates `room_scans`; **00019** roomplan features incl. `user_style_signals`; **00020** `room_scan_associations`; **00027** adds hero-frame columns to `room_scans` (`hero_frame_url`/`hero_frame_score`/…) + a public `room-hero-frames` storage bucket (there is no `hero_frames` table); **00032** `room_scan_images`; **00077** advanced room scan; **00082** `scan_upload_pipeline` (room_scans manifest/heatmap/`artifacts_sha256`/progress columns + RPCs `mark_scan_upload_complete`, `merge_scan_artifact_sha256` + room_scan_images RLS).

**Companion / iOS misc:**

- **00026** `companion_conversations` + `companion_messages` + `get_or_create_conversation()` RPC.
- **00067** `ios_api_endpoints` — `interactions` table + `process_style_quiz` + `get_recommendations` RPCs.
- **00033** `qr_auth_sessions`; **00127** `device_pair_sessions` (QR/device pairing used by both the extension and Patina QRAuth).

**Extension inbox:** **00130** `proposal_captures` (the extension's proposal/inbox landing table); products three-layer columns (`layer`, `owner_user_id`) from **00152**.

## 5. API / Edge / Service Surface

This area has no bespoke Next.js API routes and no NestJS endpoints of its own — every native/extension surface talks to Supabase directly (PostgREST, Storage, RPC, or an edge function), which keeps the client apps thin but means auth/attribution/idempotency logic all lives in the edge functions and RPCs below.

**Edge functions (`supabase/functions/`):**

- `confirm-scan-bundle/index.ts` — JWT-forwarding (no service role); HEADs every non-null `room_scans` artifact URL, cross-checks `photos_manifest_url` ndjson line count vs `room_scan_images` rows, then calls `mark_scan_upload_complete` RPC. Returns 409 with `missingArtifacts` if any fail. Used by the Patina app's uploader.
- `companion-message/index.ts` — service-role client; verifies caller JWT; `get_or_create_conversation` RPC; persists `companion_messages`; calls Anthropic `claude-sonnet-4-20250514` when `CLAUDE_API_KEY` is set, else canned `generateFallbackResponse`. Pulls context from `room_scans`, `products`, `companion_messages`, `user_style_signals`.
- `companion-context/index.ts` — quick-actions/context; queries `room_scans`, `saved_products`, `style_profiles`.
- `companion-history/index.ts` — paginated `companion_messages` history.

**RPCs (SECURITY INVOKER unless noted):** `commit_field_capture`, `route_field_capture`, `dismiss_field_capture`, `merge_capture_artifact_sha256`, `mark_capture_upload_complete` (00235); `mark_scan_upload_complete`, `merge_scan_artifact_sha256` (00082); `get_or_create_conversation` (00026); `process_style_quiz`, `get_recommendations` (00067); `search_products`, `delete_user_account` (referenced by `APIConfiguration`).

**PostgREST direct writes:** the extension SW writes `vendors`/`products`/`product_styles`/`project_products`/`proposal_captures` under the user session; the Patina app reads/writes `profiles`/`rooms`/`room_scans`/`room_scan_images`/`products`/`interactions` via its `*APIClient`s and supabase-swift.

**Not via NestJS:** despite common assumption, `services/projects` contains **no** scan-sync code (grep clean) — all scan sync is Supabase-direct (Storage + `room_scans` + `confirm-scan-bundle`).

## 6. UI Surfaces

**Patina companion app screens** (`apps/mobile/Patina/Patina/Features/*`): Splash/FirstLaunch/Onboarding; Walk (RoomPlan scan) + RoomScan + RoomDetail + Rooms; Companion (conversational overlay); StyleQuiz / StyleConversation / StyleReveal; ARPlacement; ProductDetail / Recommendations / Collections; QRAuth (mobile pairing); Home; Notifications; Account/Profile/Settings; and designer-mode surfaces Designer, Projects, Decisions, Messaging, Receiving. `CompanionAPIClient.screenIdentifier(for:)` enumerates ~40 route→screen mappings (hero_frame, room_list, scan_walk, piece_detail, ar_placement, decision_detail, thread_detail, receive_delivery, …).

**Capture app 32-screen matrix** (`apps/mobile/Capture/Capture/Features/*`, driven by `-CaptureScreen <id>`): Onboarding O1 welcome / O2 connect-workspace / camera-priming / ready; C1 Viewfinder (+ card overlay, framing guides, torch); Recognition N-series (CodeScan, ARMeasure, SmartGuess, Tag-OCR, VoiceNote); Route S1 assign-venue → S2 create-project → S3 destination → S4 saved-terminal → S5 inbox-terminal; Session V1 tray / V2 cull-deck / V3 specimen-detail; Specimen sheet; U-series Library search; T1 Settings; Account; SystemEntry sync-status; Resilience (offline-queue banner, low-light torch).

**Chrome extension surfaces**: side panel shell (`PanelShell`/`PanelRouter`) with regions (Record/Insight/Trade/RouteCommit); screens Snapshot → Extracting → Vendor → Record → Terminal; overlays ImageSelect / RecentCaptures / Settings / Decision / CreateProject / Account / Insight; onboarding tab (`tabs/onboarding.html`, opened on install); three context-menu entries (page/image/selection) + keyboard shortcut, badge count of queued captures.

## 7. Reconciliation & Gaps

### Spec-vs-reality drift and stale/contradictory docs

- ⚠ **`companion-context` queries two nonexistent tables.** `supabase/functions/companion-context/index.ts:87–88` queries `saved_products` and `style_profiles`, **neither of which is created by any migration** — the queries silently return nothing, so companion context is partially broken. (The Aesthete client quiz, 00243, creates the differently-named `client_style_profiles` — not `style_profiles` — so there is no table this legacy function was written against.)
- ⚠ **Inconsistent style-signal source across the two companion functions.** `companion-message` reads `user_style_signals` (00019, a real table) while `companion-context` reads `style_profiles` (which does not exist). Same "style profile" concept, two different table names, only one of which is actually created — no reconciliation between them.
- ⚠ **Spec corpus vs. live thrust have diverged.** The consumer specs (`mobile-companion.md`, `patina-roomplan-specification.md`, `mobile-first-launch.md`, `patina-companion-dev-spec.md`, `ios-development-plan.md`, `quiet-conversation-prd.md`) all describe a WALK-FIRST CLIENT companion app. The current active native investment is the DESIGNER-facing Field Capture app (`apps/mobile/Capture`) + Chrome extension, which none of those specs cover — the spec corpus and the live thrust have diverged.
- ⚠ **Field Capture "backend-connected" claims are ahead of reality.** `apps/mobile/Capture/README.md` and `docs/design/ios-Capture/patina-mobile-ux-flow.html` present the Field Capture app as backend-connected ("Backend: field-capture migrations 00232–00235"), but the app's actual sync (`LocalCaptureSyncService`) and auth (`ConnectWorkspaceScreen` → `StubWorkspaceAuthorizer`) are simulations with the real Supabase calls left as TODOs — "built" means UI/validation-build, not wired.
- ⚠ **Edge hostname migration remains future work.** The `.cloud` branch consistently uses Strata for Auth, REST, Storage, Realtime, and Edge Functions. Moving those compatible paths to `api.patina.cloud` must happen as one reviewed client cutover after the edge route is live; no partial host override remains.
- ⚠ **Extension leaves capture attribution unset.** The extension inserts products WITHOUT setting `capture_source='web_extension'` (`background.ts` products insert), even though migration 00232 defines that exact provenance vocabulary — web-extension captures land unattributed.
- ⚠ **`apps/extension/CLAUDE.md` documents the wrong workspace filter.** References `@strata/extension`, but `package.json` name is `@patina/extension` — the documented dev/build commands are wrong.

### Known gaps / TODOs

- ⚠ **Field Capture app is NOT connected to its backend.** `LocalCaptureSyncService.commit()` has an explicit `TODO(post-validation)` to (1) upload artifacts to the `capture-media` bucket and (2) call `commit_field_capture` keyed on `clientToken`; no supabase-swift dependency exists in the Capture target yet. The 00232–00235 server side is fully built but currently has zero real producers.
- ⚠ **No web/portal consumer of `field_captures` exists anywhere.** A grep across `apps/` + `packages/` finds `field_captures`/`commit_field_capture`/`route_field_capture` only inside the Capture iOS app (and as TODO comments). The designer inbox/triage UI for field captures is unbuilt — there is no `use-field-captures` hook in `packages/supabase`.
- ⚠ **Field Capture auth is stubbed.** `ConnectWorkspaceScreen` uses `StubWorkspaceAuthorizer` with demo workspaces; real "Sign in with Patina" (`ASWebAuthenticationSession` + Supabase OAuth) is deferred.
- ⚠ **Companion AI degrades without a provisioned key.** The AI Companion degrades to canned pattern responses unless `CLAUDE_API_KEY` is provisioned on the edge function; product-quality answers depend on that env being set in prod.
- ⚠ **No consolidation decision between the two iOS apps.** Two parallel iOS apps (`apps/mobile/Patina` consumer companion vs. `apps/mobile/Capture` designer field-capture) coexist with no consolidation decision recorded — unclear which ships to the App Store and whether Patina's companion/style/AR surfaces are still in scope given the designer pivot.
- ⚠ **Extension is pre-1.0 with no dedupe on its capture path.** v0.1.0, and its products insert leaves `capture_source` null; no automated attribution or dedupe against catalog-match on the web-capture path (the `field_captures` payload has `catalog_match_product_id`, the extension path does not).
- ⚠ **`confirm-scan-bundle` + the room_scans upload pipeline have only one producer.** If the companion app is deprecated, this backend surface becomes orphaned — nothing else in the codebase calls it.

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Wire `apps/mobile/Capture`'s `LocalCaptureSyncService` to real Supabase: add supabase-swift, upload artifacts to the `capture-media` bucket (path keyed by `clientToken`), call `commit_field_capture` idempotently, and map remote/product ids + inbox-conflict back into `CaptureStore` (resolves the primary gap). | P0 |
| Build the designer-portal Field Capture inbox: a `use-field-captures` hook + triage UI (keep/commit-to-library/route-to-project/dismiss) consuming `field_captures` + `route_field_capture`/`dismiss_field_capture`, so captured specimens have a home on the web. | P0 |
| Replace the Capture app's `StubWorkspaceAuthorizer` with real Sign-in-with-Patina (`ASWebAuthenticationSession` + Supabase OAuth) and workspace/org selection. | P0 |
| Fix the companion edge functions: point `companion-context` at real tables (both `saved_products` and `style_profiles` are non-existent — replace them, e.g. with `user_style_signals` and the real product/save tables) or formally retire the companion feature if the consumer app is deprecated. | P1 |
| Set `capture_source='web_extension'` (+ `capture_provenance`) on extension product inserts to use the 00232 provenance vocabulary; add catalog-match/dedupe on the web path. | P2 |
| Record a consolidation decision between `apps/mobile/Patina` and `apps/mobile/Capture`; remove stale config (the hardcoded `supabase.co` realtime ref) and fix `apps/extension/CLAUDE.md` filter name. | P2 |

## 9. Status & Deploy

**On main:** All three surfaces. Field-capture backend migrations 00232–00235 are committed; the Capture app was merged to main via `03537b18` (`capture/foundation`). The Patina companion app and the extension are long-lived on main.

**On prod:** Field-capture migrations 00232–00235 are on prod per the tier-1 deploy (commit `cb15fb37`: "prod deploy tier 1 (migrations 00230–00254) done + verified"; prod tip previously 00229). The `capture-media` bucket + commit/route/dismiss RPCs ship with those migrations.

**Not shipped / runtime-unverified:** The Capture iOS app is validation-build only (sync + auth simulated) — nothing writes to `field_captures` in prod yet. The companion edge functions (`companion-context`/`message`/`history`) exist in-repo; their prod deploy state is unverified and `companion-context` references a missing table (`saved_products`). `confirm-scan-bundle` is in-repo and used only by the Patina app. The Chrome extension is v0.1.0 (CWS/self-hosted update URL via `PLASMO_PUBLIC_UPDATE_URL`), not a store release. Per project memory, iOS on-device re-walks were pending and "real OAuth/sync deferred" for Capture.

## 10. Superseded Sources

This consolidated PRD replaces the following documents as the system of record for native iOS/extension capture:

- `docs/_archive/architecture/ios-development-plan.md`
- `docs/_archive/specs/_active/patina-companion-dev-spec.md`
- `docs/wireframes/mobile-companion-flow.html`
- `docs/wireframes/mobile-immersive-experience.html`
- `docs/wireframes/mobile-immersive-exp-v2.html`
- `docs/wireframes/web-companion.html`

The following related documents remain live and are **not** superseded by this PRD — they cover operational/UX detail this consolidated PRD does not replace:

- `apps/mobile/Capture/README.md`
- `docs/design/ios-Capture/patina-mobile-ux-flow.html`
- `docs/specs/IOS Scann/quiet-conversation-prd.md`
- `docs/design/ios-ux-review/index.html`
- `docs/specs/_active/mobile-companion.md`
- `docs/specs/_active/patina-roomplan-specification.md`
- `docs/specs/_active/product-capture.md`
