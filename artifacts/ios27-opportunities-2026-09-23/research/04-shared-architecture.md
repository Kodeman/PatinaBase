# 04 — Shared substrate behind the two Patina iOS apps

Read-only survey, 2026-09-23. Every claim is tagged **EVIDENCE** (read in a file, cited),
**INFERENCE** (concluded from evidence), or **ASSUMPTION** (could not confirm here).

Both apps point at the same Supabase project:
`https://bkvcixdmuyejfzcijpdg.supabase.co` — EVIDENCE
`apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift:51` and
`apps/mobile/Capture/Capture/App/Configuration/AppConfiguration.swift:15`.
That ref is Strata (prod).

---

## 1. Shared data model

### How each app talks to Postgres

- **Patina (client)** — two styles side by side: hand-built PostgREST URLs
  (`baseURL.appendingPathComponent("/rest/v1/<table>")`) in `Core/Network/*.swift`,
  and `supabase-swift`'s `.from("<table>")` builder elsewhere. EVIDENCE:
  `apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift:235` (raw path) vs
  `apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient+Pace.swift:34` (`.from("decision_snoozes")`).
  45 files under `apps/mobile/Patina/Patina` import `Supabase` directly. EVIDENCE (grep count).
- **Patina Field (Capture)** — almost entirely `.from()` / `.rpc()` through `supabase-swift`;
  exactly one raw `/rest/v1/` path in the whole app (`projects`). EVIDENCE (grep over
  `apps/mobile/Capture`, 1 hit for `/rest/v1/`, 36 distinct `.from("…")` tables).
  19 files import `Supabase`, and **none of them are in CaptureKit** — CaptureKit is
  SDK-free and protocol-seamed. EVIDENCE: `grep -rl 'import Supabase' Capture/CaptureKit` → empty.

### Entity → app matrix

Legend: R = reads, W = writes (insert/update/upsert/delete or a write RPC), — = no access found.

| Entity / owning table | Patina (client) | Patina Field (Capture) | Evidence |
|---|---|---|---|
| `projects` | R | R + W (insert) | `Patina/Core/Network/ProjectsAPIClient.swift:196,202`; Capture `.from("projects")` ×7 with `.insert(` |
| `project_rooms` | R | R | `ProjectsAPIClient.swift:213`; Capture `.from("project_rooms")` |
| `project_phases` | R | R | `ProjectsAPIClient.swift:225`; Capture grep hit |
| `project_payment_milestones` | R | R | `ProjectsAPIClient.swift:233`; Capture grep hit |
| `rooms` (client's own rooms) | R + W (insert) | R + W (upsert) | `RoomsAPIClient.swift:235,255,267,291`; Capture `.from("rooms")` `.upsert(` |
| `room_scans` | R + W (insert/update/upsert) | W (update/upsert) | Patina `.from("room_scans")` ×12; Capture `.from("room_scans")` ×2 |
| `room_scan_images` | W (insert) | W (upsert) | Patina ×2 insert; Capture `.upsert(` |
| `room_scan_associations` | R + W (insert/update) | — | Patina `.from("room_scan_associations")` ×6 |
| `room_features` | W (insert) | — | Patina `.from("room_features")` |
| `products` | R (`/rest/v1/products`, `rpc/get_recommendations`, `rpc/search_products`) | — (Library search is `u2LibrarySearch`; no direct `products` table hit found) | `Patina/Core/Network/ProductAPIClient.swift:46,150,195` |
| `interactions` | W (insert) | — | `ProductAPIClient.swift:228` |
| `saved_items` | R + W | — | `RoomsAPIClient.swift:340–401` |
| `user_style_signals` | R | — | Patina `.from("user_style_signals")` |
| `client_decisions` / `client_decision_options` | R + W via RPC (`apply_client_decision`, `mark_client_decision_viewed`, `approve_client_signoff`) | R (read-only) | `DecisionsAPIClient.swift:363,375,419,445,479`; Capture `.from("client_decisions").select(` only |
| `decision_comments` | W (insert) | — | Patina `.from("decision_comments")` `.insert(` |
| `decision_snoozes` | R | — | `DecisionsAPIClient+Pace.swift:34` |
| `comms_threads` / `comms_messages` / `comms_thread_participants` | R + W (insert message, PATCH `last_read_at`) | R + W (insert message, `rpc_mark_thread_read`) | `MessagingAPIClient.swift:142,190,211,282`; Capture `.from("comms_messages").insert(` |
| `leads` | W via `rpc/submit_design_request`; status read via `leads` | R | `Patina/Core/Models/SubmittedDesignRequest.swift:29`; Capture `.from("leads").select(` |
| `people_directory`, `people_directory_seats`, `studio_contacts`, `studio_contact_channels`, `studio_channel_consent`, `studio_person_affiliations`, `project_parties`, `project_party_authority`, `project_team_members`, `project_site_access_cards` | — | R (+ W on `studio_contacts`, `project_parties`) | Capture `.from(…)` grep; `CaptureKit/Work/PeopleRoomService.swift` |
| `project_time_entries` | — | W via `rpc("log_time")` | Capture `.rpc("log_time"` ; screen `h1LogTime` (`CaptureScreenID.swift`) |
| `project_tasks`, `margin_notes` | — | W (insert) | Capture `.from("project_tasks").insert(`, `.from("margin_notes").insert(` |
| `project_ffe_items`, `project_ffe_specs` | — | R | Capture `.from(…).select(` |
| `purchase_orders`, `receiving_inspections`, `damage_claims` | — | R + W | Capture `.from(…)` with `.update(` / `.insert(` / `.delete(` |
| `site_requests`, `site_request_items`, `site_request_events`, `site_binder_entries` | — | R | Capture `.from(…).select(` |
| `field_captures` | — | W via `rpc("commit_field_capture")` / `route_field_capture` | `CaptureKit/Sync/FieldCapturePayload.swift:41`; `migrations/00233_field_captures_inbox.sql`, `00235_commit_field_capture_rpc.sql` |
| `profiles` | R + W (update) | R | Patina `.from("profiles")` ×6; Capture ×3 select |
| `profile_presence` | W (upsert) | — | Patina `.from("profile_presence")` |
| `device_push_tokens` | W (upsert/delete) | — | `Patina/App/AppDelegate.swift:20–22` |
| `notification_log` | R + W (mark opened/read) | — | `NotificationsAPIClient.swift:85,107,128` |
| `notification_preferences`, `user_settings`, `user_roles` | R + W | `user_roles` R only | Patina `.upsert(`; Capture `.from("user_roles")` |
| `invoices` | R | — | Patina `.from("invoices")` ×3, `Services/API/InvoicesAPIClient.swift` |
| `direct_orders`, `fulfillment_orders`, `fulfillment_order_items`, `fulfillment_shipments` | R (+ `rpc/create_direct_order`, `rpc/get_direct_order_terms`) | — | `FulfillmentAPIClient.swift:250,261,286,303,313` |
| `editorial_stories` | R | — | `EditorialStoriesAPIClient.swift:120,141` |
| `client_designer_roster` | R | — | `RosterAPIClient.swift:40` |
| `project_documents` | R | — | Patina `.from("project_documents")` ×2 |
| `organization_members` | — | R | Capture `.from("organization_members")` |

**The genuine overlap is narrow.** EVIDENCE: only `projects`, `project_rooms`,
`project_phases`, `project_payment_milestones`, `rooms`, `room_scans`, `room_scan_images`,
`profiles`, `comms_threads/messages` and `client_decisions*` are touched by both binaries.
Everything else is single-app. INFERENCE: the split is exactly the audience split —
Patina owns consumer/commerce tables (saved_items, products, invoices, fulfillment,
editorial), Capture owns studio-operations tables (people, purchase orders, receiving,
time, site requests, FF&E).

### Shared RPC / storage surface

- **Patina RPCs** (15): `apply_client_decision`, `approve_client_signoff`, `client_pick`,
  `create_direct_order`, `get_client_project_selections`, `get_direct_order_terms`,
  `get_recommendations`, `increment_scan_upload_attempt`, `mark_client_decision_viewed`,
  `mark_scan_upload_complete`, `process_style_quiz`, `resolve_studio_identity`,
  `search_products`, `sign_proposal`, `submit_design_request`. EVIDENCE (grep).
- **Capture RPCs** (9): `commit_field_capture`, `create_field_link`,
  `identity_consent_evidence`, `log_time`, `mark_scan_upload_complete`,
  `place_product_in_project`, `record_notice`, `route_field_capture`,
  `rpc_mark_thread_read`. EVIDENCE (grep).
- **Only `mark_scan_upload_complete` is called by both.** EVIDENCE (set intersection of
  the two lists above).
- **Storage buckets**: both write `room-scans`
  (`Patina/Services/Sync/BackgroundScanUploader.swift:169`;
  `Capture/Features/SiteScan/FieldBackgroundScanUploader.swift:200`). Capture also writes
  `capture-media`; Patina also reads `project-documents` and a board bucket
  (`Services/API/ProposalsAPIClient.swift:310–315`).
- **Edge functions**: Patina calls `delete-account`, `companion-context`,
  `companion-message`, `companion-history` (`Services/API/APIConfiguration.swift:245,270–272`)
  plus `confirm-scan-bundle` (`Services/Sync/RoomScanSyncService+AdvancedBundle.swift:296`).
  Capture calls exactly one, via `client.functions.invoke` at
  `Capture/Features/SiteScan/SupabaseSiteScanService.swift:554` (`confirm-scan-bundle`).
  **`confirm-scan-bundle` is the only edge function both apps call.** INFERENCE.

---

## 2. Existing AI services in the backend

### `services/aesthete-inference` (Python / FastAPI) — self-hosted, no external provider

EVIDENCE `services/aesthete-inference/README.md:1–60`, `requirements.txt`.

| Route | What it does | Model | Callers |
|---|---|---|---|
| `POST /embed/text` | 768-d text embedding, task prefixes applied server-side | `nomic-embed-text-v1.5`, int8 ONNX on CPU, pinned rev `e9b6763…` | `aesthete-ask` (`functions/aesthete-ask/index.ts:116–121`), `aesthete-embed-worker`, `catalog-normalizer` |
| `POST /embed/image` | 768-d image embedding (CLS token, CLIP preprocessing) | `nomic-embed-vision-v1.5`, int8 ONNX | `aesthete-embed-worker` (fused product vectors) |
| `POST /fit/taste` + `/fit/taste/backtest` | Bradley–Terry MAP refit of a designer's 94-d taste vector; damped Newton, pure numpy | **no model** — closed-form solver | `aesthete-nightly` (`functions/aesthete-nightly/fit-client.ts`) |
| `POST /convert/usdz-to-glb` | RoomPlan USDZ → archival glTF | `usd-core` + `pygltflib`, no ML | `convert-room-scan-glb` (`functions/convert-room-scan-glb/index.ts:3`) |
| `POST /convert/heic-to-jpeg` | HEIC → JPEG thumb/preview | `pillow-heif`, no ML | `derive-scan-photo-media` (`functions/derive-scan-photo-media/index.ts:168`) |
| `GET /healthz` | open | — | probes |

Auth is `Bearer $INFERENCE_TOKEN`; the worker refuses to start without it. EVIDENCE README.
Every caller degrades gracefully when `INFERENCE_URL`/`INFERENCE_TOKEN` are unset
(EVIDENCE `aesthete-ask/lib.ts:361`, `derive-scan-photo-media/index.ts:248`,
`catalog-normalizer/index.ts` header). ASSUMPTION: whether those secrets are actually set
on Strata today is not determinable from the repo.

### Edge functions that call a hosted LLM (all Anthropic; no OpenAI/Gemini anywhere)

EVIDENCE: `grep -rn 'api.openai.com|gemini|OPENAI_API_KEY' supabase/functions` → 0 hits.

| Function | What it does | Model | Called by | Has a caller? |
|---|---|---|---|---|
| `project-ffe-document-extract` | Sends a PDF (base64 document block) to Claude with a forced tool-use schema, validates rows, commits via `stage_project_ffe_document_extraction` | **`claude-sonnet-5`**, `api.anthropic.com/v1/messages` — `index.ts:45–56` | nothing | **NO CALLER.** EVIDENCE: repo-wide grep for `ffe-document-extract` finds only `supabase/config.toml:628` and the function's own folder; the SQL RPC it calls is granted to `service_role` only (`00444_ffe_service_acl_replay_hardening.sql:22–30`). Fully built, wired to nothing. |
| `aesthete-dna-draft` | Product-DNA structured draft from a product row + ≤3 image URLs; bulk pass, one escalation on low confidence; spend ledger | `claude-haiku-4-5` (`lib.ts:23`) → `claude-sonnet-5` (`lib.ts:24`), via `npm:@anthropic-ai/sdk@0.109.1` (`claude.ts:21`) | `packages/supabase/src/hooks/use-product-dna.ts`; queued through `00240_product_dna.sql` / `00241_aesthete_jobs.sql` | yes (portal hook + cron/outbox) |
| `_shared/field-parse.ts` (library, not a function) | LLM parse of an inbound contractor SMS into a structured field effect via forced tool-use; four intents are handled deterministically first | `claude-haiku-4-5` (`field-parse.ts:60`), direct `fetch` to `api.anthropic.com` (`:501`) | `sms-inbound/pipeline.ts:25` only | yes |
| `companion-message` | Conversational companion reply + quick actions + product suggestions | **`claude-sonnet-4-20250514`** (`index.ts:252`) — a stale model id relative to the others | Patina iOS (`Patina/Services/Companion/CompanionAPIClient.swift`, `Features/Companion/ViewModels/CompanionViewModel.swift`) and `packages/supabase/src/hooks/use-companion.ts` | yes |
| `companion-context` / `companion-history` | Context-aware quick actions; conversation history. No LLM call found in `companion-context/index.ts` | none (rules/SQL) — INFERENCE from reading the header and finding no anthropic fetch | Patina iOS + portal hook | yes |
| `emergence-recommend` | Product recommendations from style signals + room context | none (SQL/heuristic) — INFERENCE, no model call in the file | **nothing** — repo-wide grep for `emergence-recommend` returns zero hits outside its own folder | **NO CALLER** |

### Non-LLM AI/ML-adjacent functions

- `aesthete-ask` — two-rung retrieval: embed the ask (1.5 s budget) → `aesthete_ask_knn`
  vector seam, falling back to FTS with `degraded: true`. EVIDENCE `aesthete-ask/index.ts:1–23`.
  Caller: `packages/supabase/src/hooks/use-engine-ask.ts`, rendered by
  `apps/designer-portal/src/components/document/engine/engine-results.tsx`.
- `aesthete-embed-worker` — drains `aesthete_jobs` for `embed_text` / `embed_fused` /
  `portfolio_embed`; pg_cron every minute (`00241_aesthete_jobs.sql`). EVIDENCE header.
- `aesthete-nightly` — 02:30 cron; BT MAP refit + confidence/drift/starvation phases
  (`00248_aesthete_nightly.sql`). EVIDENCE header.
- `aesthete-drift-audit` — weekly guardrail audit, math in `run_aesthete_drift_audit`
  (00250). EVIDENCE header.
- `catalog-normalizer` — nightly vendor-feed normalizer using the inference sidecar;
  admin-portal upload route enqueues `normalize_feed` tasks. EVIDENCE header +
  `apps/admin-portal/src/app/api/admin/catalog/feed-batches/route.ts`.
- `capture-from-url` — server-side page fetch + extraction (SSRF-guarded), **no model**;
  12 references, heavily used by designer-portal product pickers. EVIDENCE grep.
- `parse-room-scan` — CapturedRoom export → normalized geometry rows (`replace_room_scan_geometry`,
  00337). Pure parsing, no ML. EVIDENCE `parse-room-scan/index.ts:1–17`.

**Copy law worth noting**: `aesthete-ask/index.ts:21–23` states surfaces must say
"the Engine is resting" and **never "error", never "AI"**. EVIDENCE.

### Bottom line for §2

Two LLM capabilities already exist and are **unused**: a Claude-Sonnet-5 PDF→FF&E
extractor with no caller at all, and `emergence-recommend` with no caller. INFERENCE:
the extractor is the single largest piece of already-paid-for AI in the repo that ships
nothing today. Neither iOS app calls any LLM function except `companion-*` (Patina only);
**Patina Field calls zero AI of any kind**. EVIDENCE (grep of Capture for
`functions.invoke` → one hit, `confirm-scan-bundle`).

---

## 3. Shared packages and the seams

### The workspace

`apps/mobile/Mobile.xcworkspace/contents.xcworkspacedata` contains exactly three FileRefs:
`Capture/Capture.xcodeproj`, `Patina/Patina.xcodeproj`, `PatinaDesignKit`. EVIDENCE.
So **yes — both apps are in one Xcode workspace today**, with the design package beside them.

### `PatinaDesignKit` — the only genuinely shared code

- Local SwiftPM package, `swift-tools-version: 6.0`, iOS 17.6 floor, **`.dynamic` library
  on purpose** so it can link into both the Capture app target and the embedded CaptureKit
  framework without duplicate symbols. EVIDENCE `PatinaDesignKit/Package.swift:1–48`.
- Hard rule in its own header: "SwiftUI/UIKit/CoreText ONLY. Never import Supabase,
  PostHog, or any other SDK here." EVIDENCE `Package.swift:11–13`.
- Contents: 13 components, 6 token files, `PatinaFonts`, `HapticManager`, 8 bundled TTFs
  (Inter, Playfair Display, DM Mono). EVIDENCE directory listing.
- Consumers: Patina links it as `XCLocalSwiftPackageReference "../PatinaDesignKit"`
  (`Patina.xcodeproj/project.pbxproj:889–894`); Capture links it into **both** the app and
  CaptureKit via `link_local_package(project, [app, kit], …)`
  (`Capture/scripts/generate_project.rb:283–284`).
- Patina avoids touching hundreds of call sites with a single
  `@_exported import PatinaDesignKit` shim at
  `Patina/Patina/Design/DesignKitReexport.swift:11`. EVIDENCE.
- Reach: 7 Patina files + 13 Capture files import it explicitly. EVIDENCE grep counts.

### `CaptureKit` — shared *within* Patina Field only

- 114 Swift files across 16 folders; `SiteScan` (33) and `Work` (18) dominate. EVIDENCE
  directory counts.
- Framework target `cloud.patina.field.capturekit`, generated by
  `Capture/scripts/generate_project.rb:28`. The Xcode project is regenerated, not
  hand-edited. EVIDENCE.
- **SDK-free by construction**: zero `import Supabase`; it defines ports
  (`ProjectsService`, `MessagingService`, `PeopleRoomService`, `DecisionsReadService`,
  `LeadsService`, `ReceivingService`, `SiteRequestService`, `SiteScanService`) that the app
  target conforms with Supabase implementations, and `CaptureKitMocks` conforms with fakes.
  EVIDENCE: `CaptureKit/Work/*.swift`, generator target `mocks` at `generate_project.rb:29`,
  and `apps/mobile/CLAUDE.md` ("mock conformers for every seam").
- `RouteRegistry` is a string-keyed screen registry so no team edits a shared switch
  (`CaptureKit/Navigation/RouteRegistry.swift:10–37`), and `CaptureScreenID` enumerates
  **76 screens**. EVIDENCE.
- **Patina does not link CaptureKit.** EVIDENCE: `Patina.xcodeproj/project.pbxproj` package
  references are only PatinaDesignKit, supabase-swift, posthog-ios, SwiftLintPlugins
  (lines 343–346).

### `apps/mobile/Patina/backend` — dead scaffolding

A `teenybase` 0.0.10 Cloudflare Worker + D1 template. `wrangler.toml` still carries
`account_id = "YOUR_CLOUDFLARE_ACCOUNT_ID"`, `database_id = "xxxxxx-xxxx-…"`, and
`routes = [{ pattern = "sample.example.com" }]`; `teenybase.ts` is the vendor's sample
`users` table; `worker.ts` returns `{message: 'Hello Hono'}`. EVIDENCE
`backend/wrangler.toml:1–10`, `backend/teenybase.ts:4–6`, `backend/src-backend/worker.ts:23–25`.
Nothing in `apps/` or `packages/` references it. EVIDENCE repo-wide grep for `teenybase`.
INFERENCE: this is abandoned pre-Supabase scaffolding and should be deleted, not extended.

### Could the two apps share more without a rewrite? Concrete seams

**Already aligned (cheap):**
1. `PatinaDesignKit` proves the local-package + workspace pattern works for both build
   systems (hand-written pbxproj on Patina, Ruby generator on Capture). A second local
   package would follow the same two call sites: one `XCLocalSwiftPackageReference` in
   `Patina.xcodeproj`, one `link_local_package` line in `generate_project.rb:251–284`.
   INFERENCE.
2. Both apps already run `URLSessionConfiguration.background` uploaders against the same
   `room-scans` bucket with the same `mark_scan_upload_complete` RPC and the same
   `confirm-scan-bundle` edge function — but in two independent files:
   `Patina/Services/Sync/BackgroundScanUploader.swift` (495 lines) and
   `Capture/Features/SiteScan/FieldBackgroundScanUploader.swift` (344 lines). EVIDENCE
   (wc -l; both reference `storage/v1/object/room-scans/` and
   `storage/v1/object/info/authenticated`). This is the single clearest duplication.
3. The storage-path contract is already centralised on the Capture side only —
   `CaptureKit/SiteScan/RoomScanStoragePath.swift:50–75` documents the bare-bucket-key rule
   that Patina re-derives independently in `Services/Sync/ArtifactUploader.swift:159`.

**Blocked / expensive:**
4. **Deployment-target floor**: Patina's app target is `IPHONEOS_DEPLOYMENT_TARGET = 26.0`
   (EVIDENCE `Patina.xcodeproj/project.pbxproj:494` and every other config), Capture's
   generator pins `18.0` (`generate_project.rb:17`), and PatinaDesignKit floors at 17.6 with
   a comment claiming Patina is at 17.6 — **which is now stale**. EVIDENCE
   `PatinaDesignKit/Package.swift:26–31` vs the pbxproj. Any new shared package must floor
   at 18.0, and the DesignKit comment is wrong.
5. **SPM version skew is real, not cosmetic.** Three different `Package.resolved` files
   pin three different sets:

   | package | Patina.xcodeproj | Capture.xcodeproj | Mobile.xcworkspace |
   |---|---|---|---|
   | supabase-swift | 2.40.0 | **2.55.1** | 2.51.0 |
   | posthog-ios | 3.48.0 | **3.70.1** | 3.64.6 |
   | swift-crypto | 4.2.0 | 4.5.1 | 4.5.0 |
   | swift-clocks | 1.0.6 | 1.1.1 | 1.1.0 |
   | swift-asn1 | 1.5.1 | 1.7.1 | 1.7.1 |
   | xctest-dynamic-overlay | 1.8.1 | 1.13.1 | 1.11.0 |
   | swift-http-types | 1.5.1 | 1.6.0 | 1.6.0 |
   | swift-concurrency-extras | 1.3.2 | 1.4.1 | 1.4.0 |
   | SwiftLintPlugins | 0.63.2 | (not linked) | 0.65.0 |
   | plcrashreporter | 1.12.2 (Patina only) | — | — |

   EVIDENCE: the three `Package.resolved` files. INFERENCE: opening the workspace resolves a
   *third* set that neither app's own project has ever built against — so "build from the
   workspace" is not currently a safe no-op, and any shared networking package would force a
   supabase-swift convergence first (2.40 → 2.55 is 15 minor versions).
6. **Architecture mismatch at the data layer.** Capture's substrate is protocol-seamed and
   SDK-free (CaptureKit imports no Supabase); Patina's 45 Supabase-importing files are
   concrete API clients with no port layer. EVIDENCE greps above. INFERENCE: lifting Patina's
   networking into a shared package is a rewrite of Patina's data layer, not a file move.
   The *reverse* direction is cheap: Patina adopting CaptureKit-style seams file-by-file.

**Best-value shared seams, in order (INFERENCE):**
- (a) a `PatinaScanKit` local package holding the background uploader + storage-path +
  `mark_scan_upload_complete`/`confirm-scan-bundle` contract — two duplicated
  implementations collapse to one, and the path rules already exist in written form;
- (b) an `AppIntents`/shortcuts package — greenfield, so no skew to resolve (see §4);
- (c) nothing at the Supabase-client layer until the SPM pins converge.

---

## 4. Widgets, extensions, App Intents

### What exists

| Unit | State | Evidence |
|---|---|---|
| `PatinaWidget` (Patina) | **Real, shipping.** `com.apple.product-type.app-extension`, bundle id `cloud.patina.app.widget`, `NSExtensionPointIdentifier = com.apple.widgetkit-extension` | `Patina.xcodeproj/project.pbxproj:224,500`; `PatinaWidget/Info.plist` |
| `HouseWidget` | One `StaticConfiguration`, kind `"PatinaHouseWidget"`, families `[.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular]`, display name "Patina" / "What moved on your house." | `PatinaWidget/HouseWidget.swift:12–29` |
| `PatinaWidgetShared` | One file, `HouseWidgetPayload.swift` — Foundation-only, "No WidgetKit, no SwiftUI, no app types", app group `group.cloud.patina.app` | `PatinaWidgetShared/HouseWidgetPayload.swift:26,212` |
| Widget data path | App writes a snapshot and calls `WidgetCenter.shared.reloadTimelines(ofKind:)` | `Patina/Core/Persistence/RecordSnapshotStore.swift:20,121,132` |
| `Capture/CaptureWidgets` | **EMPTY DIRECTORY.** No files, and `generate_project.rb` creates only 5 targets (CaptureKit, CaptureKitMocks, Capture, CaptureTests, CaptureUITests) — no extension target | `ls` → empty; `generate_project.rb:28–30,161,173`; `Capture.xcodeproj/project.pbxproj` productTypes: framework, unit-test, framework, application, ui-testing |
| `Capture/CaptureShareExtension` | **EMPTY DIRECTORY.** Same — no target. (Screen `e3ShareSheet` is enumerated in `CaptureScreenID` but has no extension behind it.) | `ls` → empty; `CaptureKit/Support/CaptureScreenID.swift` |

### `StaticConfiguration`, not `AppIntentConfiguration`

EVIDENCE `HouseWidget.swift:17`. The one shipping widget is **not** user-configurable and
contains **no** interactive `Button(intent:)` / `Toggle(intent:)`.

### App Intents / Siri / Shortcuts / Control Center — **none, in either app**

An exhaustive case-insensitive grep across `Patina`, `Capture`, `PatinaDesignKit` for
`appintents`, `AppShortcutsProvider`, `intentdefinition`, `SiriKit`, `INIntent`,
`ControlWidget`, `.appIntent` over `*.swift`, `*.pbxproj`, `*.rb`, `*.plist` returns
**three hits, all in one file, all of them plain enum cases and UI copy**:
`Capture/Capture/Features/Onboarding/ReadyScreen.swift:14,75,119`. EVIDENCE.

That file is worth reading closely, because it is the strongest signal in the repo:

- The O4 onboarding screen's stated purpose is "Confirms setup and teaches the fastest
  entry — the Action Button" (`ReadyScreen.swift:4–8`).
- Pro devices see "Action Button → Capture / Capture without even unlocking to the app";
  non-Pro devices see "Control Center → Capture / One tap from anywhere in iOS"
  (`ReadyScreen.swift:73–90`).
- The "Set up" button calls `onSetHardwareEntry`, declared as
  `/// Deep-links to Settings › Action Button (deferred; integrator-wired).`
  with default `= {}` (`ReadyScreen.swift:22–23`).
- **`onSetHardwareEntry` and `hardwareEntry` appear nowhere else in the codebase.**
  EVIDENCE: grep excluding `ReadyScreen.swift` → zero hits.

INFERENCE: Patina Field's onboarding promises an Action Button entry and a Control Center
control, and neither exists — no `AppIntent`, no `ControlWidget`, no extension target, and
the "Set up" button is a no-op closure. This is a shipped promise with nothing behind it.

### Live Activities / ActivityKit — attributes exist, renderer does not

- `CaptureKit/LiveActivity/CaptureSyncAttributes.swift:13` defines
  `CaptureSyncAttributes: ActivityAttributes` with a `ContentState` carrying
  `queued / uploading / failed / lastSpecimenTitle / visitLabel / elapsedSeconds / captureCount`.
- Its own header says the shape is **FROZEN** and that "a widget extension **will** render
  it… it is free ONLY while no widget target exists" (`:4–8`). EVIDENCE.
- `Capture/Services/LiveActivity/CaptureLiveActivityController.swift` fully implements
  `Activity.request` / `.update` / `.end`, guarded by `#if canImport(ActivityKit)` and
  `#available(iOS 16.1, *)`, wired into the container at
  `Capture/App/Composition/AppContainer.swift:128` and consumed by
  `Capture/Services/Sync/LocalCaptureSyncService.swift:67,87`.
- INFERENCE: the app **starts** a Live Activity today, but with no widget extension in the
  project there is no Lock Screen / Dynamic Island presentation; the state shape was
  pre-frozen for a "wave 5" that never shipped. The cheapest high-value iOS work in the
  repo is a `CaptureWidgets` extension target rendering the already-frozen attributes —
  the empty directory, the frozen shape, and the generator's `link_local_package` helper
  are all already in place.
- Patina (client) has **no** ActivityKit usage at all. EVIDENCE grep.

### Background execution

- Both apps use `URLSessionConfiguration.background(withIdentifier:)`
  (`Patina/Services/Sync/BackgroundScanUploader.swift:135`;
  `Capture/Features/SiteScan/FieldBackgroundScanUploader.swift:100`).
- **Neither declares `UIBackgroundModes`**, and neither uses `BGTaskScheduler`. EVIDENCE:
  grep over both Info.plists, the pbxproj and the generator → zero hits.

---

## 5. Notifications and deep links

### Push

| | Patina (client) | Patina Field |
|---|---|---|
| `aps-environment` entitlement | `development` — `Patina/Patina/Patina.entitlements` | **absent** — `Capture/Capture/Capture.entitlements` has no `aps-environment` key |
| `UNUserNotificationCenter` delegate | yes, `Patina/App/AppDelegate.swift:47,174` | none — grep for `UNUserNotificationCenter|registerForRemoteNotifications` over `Capture/Capture` + `Capture/CaptureKit` returns **zero** |
| Token upload | hex token → `device_push_tokens` via `PushTokenService` (`AppDelegate.swift:20–22,61–63`) | none |
| Tap routing | `NotificationRouter.resolve(apnsUserInfo:)` + `DecisionPushHandler` (`AppDelegate.swift:125,149`), marks `notification_log.opened_at` (`:165`) | none |
| Server side | `apns-send` edge function stamps `notification_log` `queued → delivered` (`Patina/Core/Network/NotificationsAPIClient.swift:50`) | n/a |

EVIDENCE for all rows. INFERENCE: **Patina Field cannot receive a push notification today.**
It is the designer/trades app — the one whose user is on a job site waiting on a decision,
a delivery, or a client answer — and it has no notification rail at all.
Note `aps-environment = development` on Patina: EVIDENCE, and it means production APNs would
need that flipped (ASSUMPTION: the distribution profile may override it — not verifiable here).

### URL schemes

- Patina: `patina://` (`Patina/Patina/Info.plist`, `CFBundleURLName = com.patina.app`).
  Routes handled: `patina://auth` (+ `/callback`, PKCE and implicit), `patina://room/<uuid>`,
  `patina://piece/<id>`, `patina://today`, `patina://record/<rowId>`. EVIDENCE
  `Patina/App/DeepLinking/DeepLinkHandler.swift:151,157,160,177–191,247,260,314–333`.
- Patina Field: `field://` (`Capture/Capture/Info.plist`, `CFBundleURLName = cloud.patina.field`).
  Routes: `field://screen/<CaptureScreenID>`, `field://capture`, `field://login?v=1&th=<token_hash>`.
  EVIDENCE `Capture/App/DeepLinking/CaptureDeepLink.swift:4,13,35`,
  `Capture/App/Configuration/AppConfiguration.swift:75`, `CaptureKit/Support/PortalLogin.swift:5,18`.
- Cross-scheme: Capture's QR-approve path parses a `patina://` URL and rejects anything else
  (`Capture/Features/QRApprove/SupabasePortalAuthApprovalService.swift:124`). EVIDENCE.

### Universal links / associated domains

- **Both** apps declare `applinks:client.patina.cloud`. EVIDENCE
  `Patina/Patina/Patina.entitlements`, `Capture/Capture/Capture.entitlements`.
- Patina maps `https://client.patina.cloud/<kind>/<id>` for `piece`, `invoices|invoice`,
  `proposals|proposal`, `decisions|decision` (`DeepLinkHandler.swift:271–305`), entering via
  SwiftUI `.onOpenURL` (`PatinaApp.swift:113`). EVIDENCE.
- Capture handles `url.scheme == "https"` at `CaptureDeepLink.swift:25` before its
  `field://` guard, entering via `.onOpenURL` at `Capture/Features/Root/RootView.swift:98–99`.
  INFERENCE: Field claims the **client** portal's domain, not `app.patina.cloud` (the
  designer portal) — that looks like a copy-paste of Patina's entitlement rather than a
  decision. There is no `applinks:app.patina.cloud` anywhere. EVIDENCE (grep).
- Neither app uses `NSUserActivity` / `continueUserActivity` / Handoff. EVIDENCE grep.

### Apple Sign In

Both declare `com.apple.developer.applesignin = [Default]`. EVIDENCE (both entitlements files).

---

## 6. Build and distribution

### Bundle identifiers

| Target | Bundle id | Evidence |
|---|---|---|
| Patina app | `cloud.patina.app` | `Patina.xcodeproj/project.pbxproj:695` |
| PatinaWidget | `cloud.patina.app.widget` | `:500` |
| PatinaTests / PatinaUITests | `com.middlewesetstudio.PatinaTests` / `…UITests` (note the typo, "middlewese") | `:768,808` |
| Patina Field app | `cloud.patina.field` | `generate_project.rb:77` |
| CaptureKit / CaptureKitMocks | `cloud.patina.field.capturekit` / `.capturekitmocks` | `generate_project.rb:53` |
| CaptureTests / CaptureUITests | `cloud.patina.field.tests` / `.uitests` | `generate_project.rb:164,176` |

App groups: `group.cloud.patina.app` (Patina app + widget) and `group.cloud.patina.field`
(Field app only). EVIDENCE: the three entitlements files;
`Patina/Core/Persistence/RecordSnapshotStore.swift:84`,
`Capture/App/Configuration/AppConfiguration.swift:74`,
`CaptureKit/Persistence/CaptureStore.swift:78`.
INFERENCE: the two groups are separate, so nothing is shared between the apps on-device —
correct, since they are different audiences.

### Deployment targets / device family

- Patina: `IPHONEOS_DEPLOYMENT_TARGET = 26.0` on every configuration,
  `TARGETED_DEVICE_FAMILY = 1` (iPhone only), `SUPPORTS_MACCATALYST = NO`. EVIDENCE
  `project.pbxproj:494,505,510` and repeats.
- Patina Field: `DEPLOYMENT = '18.0'` for all targets. EVIDENCE `generate_project.rb:17,36`.
- INFERENCE: Patina is already on an iOS 26 floor, so any iOS-26-era API (interactive
  widgets, control widgets, App Intents' newer surfaces) is available to it with no
  floor change. Field would need a bump from 18.0.

### Versions / archives (local evidence only)

| | Short version | Build | Signing identity seen | Evidence |
|---|---|---|---|---|
| Patina | `1.0` | `3` | `Apple Development: Kody Kochaver` in the archive; `Apple Distribution` (SHA1 `6D94FBA2…`, expires 5/12/27) in the export | `Patina/.build/archives/Patina.xcarchive/Info.plist`; `Patina/.build/export/DistributionSummary.plist` |
| Patina Field | `0.1` | `3` (2026-08-31) and `4` (2026-09-01) | `Apple Development: Kody Kochaver` | `Capture/.build/archives/PatinaField-*.xcarchive/Info.plist` |

`generate_project.rb:87–88` currently sets `CURRENT_PROJECT_VERSION = '6'` /
`MARKETING_VERSION = '0.1'` for the Field app — i.e. the source of truth is ahead of the
newest local archive. EVIDENCE. Team id `VP22LXHT7L` on both. EVIDENCE.
**ASSUMPTION**: actual TestFlight/App Store Connect state is not determinable from this
repo — the only build artifacts on disk are the archives above, and `Capture/README.md:226,317`
describes the archive/export path rather than recording what was uploaded.
`ITSAppUsesNonExemptEncryption = false` is set for Patina only (`Patina/Patina/Info.plist`);
Field has no such key. EVIDENCE.

### Usage-description strings present (= capabilities already permitted)

**Patina** (`Patina.xcodeproj/project.pbxproj:678–689`):
- `LSApplicationCategoryType = public.app-category.shopping`
- `NSCameraUsageDescription` — "Patina uses your camera to walk through your space together and visualize furniture in your room."
- `NSFaceIDUsageDescription` — "Patina uses Face ID to securely confirm sign-in requests from the web"
- `NSMicrophoneUsageDescription` — "Have a voice conversation with Patina about your space and style."
- `NSMotionUsageDescription` — "Patina uses motion data to detect when your device is steady for capturing the best room photos."
- `NSPhotoLibraryAddUsageDescription` — "Patina saves AR previews and room captures to your photo library when you ask"
- `NSPhotoLibraryUsageDescription` — "Save room designs and furniture visualizations to your photo library."
- `NSSpeechRecognitionUsageDescription` — "Speak naturally with Patina instead of typing."
- Orientation: portrait only. **No `NSLocationWhenInUseUsageDescription`.**

**Patina Field** (`generate_project.rb:95–124`): `NSCameraUsageDescription`,
`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`,
`NSPhotoLibraryAddUsageDescription`, `NSPhotoLibraryUsageDescription`,
**`NSLocationWhenInUseUsageDescription`**, `NSMotionUsageDescription`,
`NSFaceIDUsageDescription`; display name "Patina Field"; portrait only;
`UIRequiresFullScreen = YES`.

INFERENCE: Field already holds the location permission Patina lacks — relevant to any
arrival/geofence idea; and both already hold mic + speech, so a voice-driven App Intent
would need no new permission prompt.

---

## 7. Dependency inventory

All three `Package.resolved` files, verbatim. EVIDENCE.

**Patina** (`Patina/Patina.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`) —
declared refs at `project.pbxproj:889–921`: local `../PatinaDesignKit`, supabase-swift
(min 2.5.1), posthog-ios (min 3.48.0), SwiftLintPlugins (min 0.63.2).

| package | version | source |
|---|---|---|
| PatinaDesignKit | local path | `../PatinaDesignKit` |
| supabase-swift | 2.40.0 | github.com/supabase/supabase-swift |
| posthog-ios | 3.48.0 | github.com/PostHog/posthog-ios.git |
| SwiftLintPlugins | 0.63.2 | github.com/SimplyDanny/SwiftLintPlugins |
| plcrashreporter | 1.12.2 | github.com/microsoft/plcrashreporter.git (transitive, PostHog) |
| swift-asn1 | 1.5.1 | apple/swift-asn1 |
| swift-clocks | 1.0.6 | pointfreeco/swift-clocks |
| swift-concurrency-extras | 1.3.2 | pointfreeco/swift-concurrency-extras |
| swift-crypto | 4.2.0 | apple/swift-crypto |
| swift-http-types | 1.5.1 | apple/swift-http-types |
| xctest-dynamic-overlay | 1.8.1 | pointfreeco/xctest-dynamic-overlay |

**Patina Field** (`Capture/Capture.xcodeproj/.../Package.resolved`) — declared in
`generate_project.rb:236–241,283`: supabase-swift (min 2.40.0, **app target only**),
posthog-ios (min 3.48.0, app target only), local PatinaDesignKit (app **and** CaptureKit).
No SwiftLint plugin.

| package | version |
|---|---|
| PatinaDesignKit | local path `../PatinaDesignKit` |
| supabase-swift | 2.55.1 |
| posthog-ios | 3.70.1 |
| swift-asn1 | 1.7.1 |
| swift-clocks | 1.1.1 |
| swift-concurrency-extras | 1.4.1 |
| swift-crypto | 4.5.1 |
| swift-http-types | 1.6.0 |
| xctest-dynamic-overlay | 1.13.1 |

**Mobile.xcworkspace** (`Mobile.xcworkspace/xcshareddata/swiftpm/Package.resolved`):
posthog-ios 3.64.6, supabase-swift 2.51.0, swift-asn1 1.7.1, swift-clocks 1.1.0,
swift-concurrency-extras 1.4.0, swift-crypto 4.5.0, swift-http-types 1.6.0,
SwiftLintPlugins 0.65.0, xctest-dynamic-overlay 1.11.0.

INFERENCE: three resolutions, no convergence. No AI/ML SDK on either app — no
`anthropic`, no CoreML package, no Vision-framework wrapper. Analytics is PostHog on both;
crash reporting (plcrashreporter) reaches Patina only, as a PostHog transitive.

---

## 8. What the designer portal does that the apps don't

38 `page.tsx` routes in `apps/designer-portal/src/app`. EVIDENCE (find). Rooms, and their
mobile coverage:

| Portal surface | Route | Mobile equivalent |
|---|---|---|
| **Desk** (claim cards, ledger rows, roster, boards rollup, reconnect) | `(document)/desk` | **Partial.** Field has `w1Work` (`CaptureScreenID.swift`). Portal desk components alone number ~12 files (`components/document/desk-*.tsx`). |
| **The Document** (open project paper) | `(document)/doc/[id]` | **NONE.** The single most important surface in the product (per `CLAUDE.md`: "The Document is Patina for the next 12 months") has no mobile reader or writer. Field has `p2ProjectDetail`, which is a project list detail, not the paper. |
| Document · plans | `(document)/doc/[id]/plans` | **NONE** |
| Document · spec book | `(document)/doc/[id]/spec-book` | **NONE** (`spec-book-render` edge fn is portal-only) |
| Document · boards | `(document)/doc/[id]/boards` | **NONE** on Field; Patina has `Features/Collections` (consumer saves), not studio mood boards |
| **Drafting** (proposal authoring) | `(document)/drafting/[proposalId]` | **NONE.** Patina has `Features/Proposals` = read/sign only (`rpc("sign_proposal")`) |
| **Compose** (author a catalog piece) | `(document)/compose` | **NONE** (`components/document/compose/composing-page`) |
| **Ceremony** (Arrival Arc match) | `(document)/ceremony/[leadId]` | **NONE** (flag-gated `arrival-arc`) |
| **Boards** (studio mood boards) | `(document)/boards`, `/board/[boardId]` | **NONE** on Field |
| **Library** | `(document)/library`, `/library/[id]`, `/library/judgments` | **Partial.** Field has `u2LibrarySearch` + `Features/Library`. `library/judgments` (taste judgments feeding `aesthete-nightly`) has **no** mobile surface |
| **People** (construction CRM) | `(document)/people` | **Yes.** Field `pr1Roster` / `pr2Person` / `pr3SiteAccess`, `CaptureKit/Work/PeopleRoomService.swift` |
| **Rooms / Room view** | `(document)/rooms`, `/room/[id]`, `/room/[id]/file` | **Partial.** Field captures rooms (`f1ScanSetup`…`f4ScanUpload`); Patina captures + views its own rooms. The portal's Room *File* has no mobile equivalent |
| **Hours ledger / time** | inside the Document (`components/document/hours-ledger.tsx`, `log-time-sheet.tsx`, `pending-time-authorization-band.tsx`) | **Partial.** Field has `h1LogTime` + `rpc("log_time")`. The *ledger* (review, authorize, CSV) is portal-only |
| **Orders book / procurement** | `components/document/orders-ledger.tsx`, `orders-book-{receiving,vendors,week}.tsx`, `po-preview.tsx`, `procurement-trail.tsx` | **Partial.** Field has `g1Arriving`/`g2Inspection`/`g3Outcome` receiving + `purchase_orders` update. Authoring/vendor/week views are portal-only |
| **Schedule / coordination / workflow** | `components/document/schedule/*`, `coordination/*`, `workflow/*` | **NONE** on either app |
| **Invoices (print)** | `invoices/[invoiceId]/print` | Patina reads `invoices` (`Features/Invoices`); no print/author path |
| **Help** | `(document-help)/help/*` | Patina `Features/Help`; Field has none |
| **Engine ask (⌘K / librarian bar)** | `components/document/engine/engine-results.tsx` → `aesthete-ask` | **NONE on either app.** The only semantic-search surface in the product is a desktop keyboard affordance |
| Auth (10 routes), legal, preferences | `auth/*`, `(legal)/*`, `preferences/*` | app-native auth in both |

INFERENCE, the short version: the designer portal is the studio's whole operating surface;
Patina Field covers the *capture and site* half of it and nothing of the *authoring* half —
no Document, no drafting, no compose, no schedule, no engine ask. Per `CLAUDE.md`'s surface
ranking (The Document → iOS → marketplace), the largest mobile gap is that the ranked-first
surface has no mobile presence at all, and the ranked-second surface can't be notified.

---

## Friction points, ranked

1. **Patina Field has no push notifications.** No `aps-environment`, no
   `UNUserNotificationCenter`, no token upload. EVIDENCE §5. The designer/trades app cannot
   be told anything.
2. **Field onboarding promises an Action Button and a Control Center control that do not
   exist.** `ReadyScreen.swift:4–8,22–23,73–90`; `onSetHardwareEntry` is an unwired `{}`.
   Zero `AppIntent` / `ControlWidget` in the repo.
3. **A Live Activity is started but never rendered.** `CaptureLiveActivityController` runs;
   `CaptureWidgets/` is an empty directory with no target; the `ContentState` was frozen
   for a widget that never landed (`CaptureSyncAttributes.swift:4–8`).
4. **`project-ffe-document-extract` — a complete Claude-Sonnet-5 PDF→FF&E extractor with
   zero callers.** EVIDENCE: repo-wide grep finds only `config.toml:628`.
5. **`emergence-recommend` has zero references anywhere.** EVIDENCE grep.
6. **Three divergent SPM resolutions** (Patina 2.40.0 / Field 2.55.1 / workspace 2.51.0 for
   supabase-swift). Building from `Mobile.xcworkspace` uses a set neither app was tested on.
7. **The scan uploader is implemented twice** (495 + 344 lines) against the same bucket, the
   same RPC and the same edge function. EVIDENCE §3.
8. **No App Intents anywhere** — neither app is reachable from Siri, Spotlight, Shortcuts,
   the Action Button or Control Center, despite both already holding mic + speech permissions.
9. **`PatinaDesignKit`'s platform floor comment is stale** — it claims Patina is at 17.6;
   `project.pbxproj:494` says 26.0. Package floor 17.6 vs Field's 18.0.
10. **`apps/mobile/Patina/backend` is dead teenybase scaffolding** with placeholder
    Cloudflare/D1 ids and `sample.example.com`, referenced by nothing.
11. **Field's associated domain is `applinks:client.patina.cloud`** — the *client* portal,
    not `app.patina.cloud`. No app declares the designer portal's domain.
12. **`companion-message` pins `claude-sonnet-4-20250514`** while the rest of the repo is on
    `claude-sonnet-5` / `claude-haiku-4-5`. It is the only LLM the client app touches.
13. **Neither app declares `UIBackgroundModes` or uses `BGTaskScheduler`**, despite both
    running background `URLSession` uploads.
14. **The Document has no mobile surface**, and `aesthete-ask` (the semantic search rail)
    is reachable only from a desktop ⌘K.
15. Patina's test targets carry a typo'd bundle id, `com.middlewesetstudio.PatinaTests`
    (`project.pbxproj:768`).
