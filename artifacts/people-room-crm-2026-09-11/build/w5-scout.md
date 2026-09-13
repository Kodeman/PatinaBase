# W5 Scout — Patina Field (Capture) for the People Room CRM build

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build` (branch `build/people-room-crm-2026-09-11`)
Scope of this file: read-only reconnaissance. Nothing else in the tree was changed.

All claims below are **static-analysis level** (source/config read, no build run, no
Simulator boot, no device run) unless marked otherwise. Per the iOS verification
skill's ladder: compile-green < sim-verified < device-verified — none of those
levels were attempted in this pass; this is source-reading only.

---

## 1. Work surface navigation + existing project screens

Root: `apps/mobile/Capture/Capture/Features/`. The Work "realm" (Phase 2 designer/
trades surface) sits alongside the original capture realm; `CaptureCoordinator`
switches between them (`coordinator.switchRealm(.camera)` seen in
`Features/Work/WorkDashboardScreen.swift`).

- **W1 · Work dashboard** — `Features/Work/WorkDashboardScreen.swift` (+
  `WorkDashboardModel.swift`, `WorkTodayBand.swift`, `WorkScreens.swift`).
  Sections today: header, load-issue banner, "Today" band (camera/visit
  start-resume-end), "Needs you" / "Waiting on others" attention lists. No
  people/roster affordance.
- **P1 · Project list** — `Features/Projects/ProjectListScreen.swift`.
- **P2 · Project detail** — `Features/Projects/ProjectDetailScreen.swift`
  (route `.project(id)`, screen id `p2ProjectDetail`). One `projectDetail(id:)`
  fetch feeds every section, single spinner, inline failure+retry. Sections
  rendered today, in order: header (name, status chip, client), **Phases**,
  **Milestones**, **FF&E** (grouped by `project_rooms` label), **Rooms**
  (`public.rooms`, the client's physical rooms site-scan attaches to). **No
  People/roster section exists yet** — this is the natural insertion point for
  a project-scoped roster (a new section here, or a sibling screen reached from
  here), per the file's own header comment describing exactly these sections.
- Other Work-flow screens (siblings, not roster-related): **L1/L2** leads
  (`Features/Leads/`), **D1/D2** decisions read-only, **M1/M2** messages
  (`Features/Messages/`), **G1–G3** receiving/goods-in, **Q1/Q2** QR
  portal-login approval (`Features/QRApprove/`), **F1–F4** pro site-scan.

**Screen ids**: `CaptureScreenID.swift` (`CaptureKit/CaptureKit/Support/`) defines
**75 raw-value cases** total (the file's own header comment says so explicitly:
"75 entries... 74 of them reach a built screen today... `v4VisitReview` is the
one remaining reserved id, held for wave 4"). This contradicts two other docs in
the tree, which is worth flagging rather than silently picking one:
  - `apps/mobile/Capture/README.md`'s screen table lists **74 built + 1 reserved
    = 75**, consistent with the enum.
  - `apps/mobile/CLAUDE.md` (one level up) instead says "the 51-screen app
    target" and "8 Work flows added in Phase 2 (18 screens)" — stale, predates
    the SR (Site Request, 20 screens) and visit-spine (`V0`/`C6`/`V4`, 3 ids)
    additions that are already in the enum. Treat the enum + README as
    authoritative; the parent CLAUDE.md numbers are out of date.
  - No `people`/`roster` screen id exists among the 75 — W5 will need to mint a
    new `CaptureScreenID` case (and regenerate/rebuild) if it adds a distinct
    screen rather than a section of P2.
- `scripts/capture-run.sh` takes any of these ids' "suffix" (e.g.
  `P2.project-detail`) via `-CaptureScreen <suffix>`, resolved by
  `CaptureScreenID.sweepSuffix` / `RootView.swift`.

## 2. Data client

- **SDK**: `supabase-swift` (`import Supabase`), one authenticated
  `SupabaseClient` per app instance, provisioned by
  `Capture/Services/Supabase/SupabaseClientProvider.swift` and injected via the
  composition root (`AppContainer`).
- **Types**: hand-written Swift `Codable` structs per feature, **not** a
  generated-types package — e.g. `FieldProject`, `FieldProjectPhase`,
  `FieldMilestone`, `FieldFFEItem`, `FieldProjectRoom`, `FieldProjectDetail` all
  live in `CaptureKit/CaptureKit/Work/ProjectsService.swift` as the protocol +
  DTOs; a private `ProjectRow` decode-shape sits next to the PostgREST call in
  `Capture/Features/Projects/SupabaseProjectsService.swift` and maps to the
  public DTO via `.field`. This mirrors the pattern the Patina (client) app
  uses (`ProjectsAPIClient`), explicitly called out in the file header as the
  reference being mirrored/upgraded from. There is no shared "generated
  database.types.ts"-equivalent for Swift; `packages/supabase/src/database.types.ts`
  is the portals' TS-only generated file and is not consumed by Capture.
- **Query shape**: direct PostgREST reads via `.from("table").select(...)`,
  with embeds (`client:profiles!projects_client_id_fkey(...)`,
  `room:project_rooms!project_room_id(name)`) mirroring designer-portal React
  Query hooks' embed shape 1:1 (the file explicitly cites
  `use-project-v2.ts` / `useProjectFFEItems` as the source of truth to match).
  All audience scoping is RLS server-side — no client-side role filtering
  (comment: "00168 Project participants can view projects").
- **Caching layer**: none observed as a generic cache — no TanStack-Query
  analog. Each screen's `@Observable` model (`ProjectDetailModel`,
  `WorkDashboardModel`) owns one `isLoading`/`errorMessage`/data triple and a
  `hasLoaded` latch so `.task { await model.appear() }` doesn't re-fetch on
  every view re-appear; no cross-screen or on-disk cache of Supabase reads was
  found for the Projects feature.
- **Offline story**: real offline/sync machinery exists but is scoped to
  **capture** writes, not to reads like Projects/roster — `CaptureKit/CaptureKit/Sync/`
  (`CaptureSyncService.swift`, `FieldWriteState.swift`, `FieldCapturePayload.swift`,
  `PunchTaskWrite.swift`, `MarginNoteWrite.swift`, `ProjectPlacement.swift`,
  `CaptureMediaPath.swift`/`CaptureMediaMime.swift`) — a local write-queue +
  media-path/mime model for captures and a couple of other mutating flows
  (punch tasks, margin notes). A roster feature that only reads
  `people_directory`/`project_parties` would have **no existing offline-read
  cache to plug into** — it would follow the Projects pattern (fetch-on-appear,
  no persistence) unless W5 explicitly builds one.
- **Mocks**: `CaptureKitMocks/` provides one mock conformer per service seam so
  every screen renders in the Simulator without network — `WorkMocks.swift`
  (`WorkFixtures`, used by Work-dashboard/Projects/Leads/etc. per
  `ProjectsSupport.swift`'s comment on illustrative status vocab not matching
  real Postgres CHECK constraints), `SiteRequestMocks.swift`, and the shared
  `CaptureKitMocks.swift`. No existing mock for a people/roster service, since
  no such service exists yet.

## 3. Auth — `field://login` token flow + designer session

- Deep link `field://login?v=1&th=<token_hash>` — `th` is a GoTrue **magic-link
  hashed token** for the designer's email, shown as a QR by a signed-in
  designer portal. Two intake paths: `Capture/Features/Auth/PortalLoginScanSheet.swift`
  (in-app camera scan sheet, reachable from O2 "Scan from the portal", with a
  manual-paste fallback field) and `Capture/App/DeepLinking/PortalLoginController.swift`
  (cold-start / external deep link, e.g. iOS Camera app).
- **Parsing + state machine** are SDK-free/pure, in
  `CaptureKit/CaptureKit/Support/PortalLogin.swift`: `PortalLoginToken.parse`
  validates scheme==`field`, host==`login`, `v==1`, and a non-empty `th`;
  `ParseError` cases give user-facing copy for each rejection. Unit-tested in
  `CaptureTests/PortalLoginTests.swift` (Swift Testing, `@testable import
  CaptureKit`).
- **Exchange**: the app calls `verifyOTP(tokenHash:type:.magiclink)` through the
  `WorkspaceAuthorizing` seam — the same seam Sign in with Apple and email-OTP
  use — implemented for real mode by
  `Capture/Services/Session/SupabaseWorkspaceAuthorizer.swift`. Three outcomes
  are handled by `PortalLoginController`: signed-out → sign in; signed in as the
  same account → no-op toast; signed in as a different account → confirm
  dialog before switching (identity is only knowable **after** the exchange,
  since the hashed token carries no recoverable identity up front).
- **Session/workspace**: `Capture/Services/Session/SupabaseSessionService.swift`
  is the real `SessionProviding` — one `supabase-swift` client, cold-launch
  session restore, an `authStateTask` listener, and hydration that lists the
  caller's `organizations` as `workspaces` (a **workspace == an organization**,
  `organizations.id`). `roles` (from a `user_roles → roles.domain` join) are
  informational only, not a hard gate. Active workspace is persisted
  per-user-id in `UserDefaults(suiteName: AppConfiguration.appGroupID)`
  (keys namespaced by normalized user id — old global keys are explicitly
  cleared at `init` so a stale workspace never survives an account switch).
  `CaptureOwnerIdentity(userID:workspaceID:)` is the resolved "owner" every
  RLS-scoped query (e.g. `SupabaseProjectsService`) reads before/after a fetch
  to detect a mid-flight account/workspace change.
- Bottom line for W5: any new roster read (e.g. `project_parties` /
  `people_directory`) should scope by `owner.workspaceID` (== `organizations.id`
  == `studio_id` in the SQL the Projects service already uses) the same way
  `listProjects()`/`projectDetail()` do, not re-derive auth from scratch.

## 4. Existing models touching `project_parties` / `people_directory` / field links

**None found in the iOS app.** `grep -rli "roster\|people_directory\|project_parties\|PartyRole\|ProjectParty"` across all of `apps/mobile/Capture/**/*.swift` returned zero matches. There is no Swift DTO, service protocol, or mock for any of these today — W5 is greenfield on the client side.

Server-side, the tables already exist and are actively evolving (many
migrations in this same worktree, some from the concurrent W2 wave sitting in
`supabase/migrations/`):
- `public.project_parties` (**00212**) — tracked, often login-less "courts" on a
  project: `party_kind` ∈ `gc | vendor | client_rep | other` (widened by
  **00281** to add `sub | installer | receiver`), `display_name`,
  `company_name`, `email`, `phone` (+ `phone_e164`/`sms_consent_status` from
  00281), soft back-links `vendor_id` (→ `vendors`) and `profile_id` (→
  `profiles`, nullable — v1 parties don't log in; a real login later is "a
  flag flip, not a migration"). RLS: project's designer manages all; any
  project team member reads; a party with `profile_id = auth.uid()` reads its
  own project's row. Widened further by later migrations in the list below
  (00624 party window/authority, 00625 site-access cards, 00627 access grants).
- `public.people_directory` (**00221**, later widened by **00420** studio-scope
  + client-read, **00478** has-sent-proposal, **00592** cards/affiliations,
  **00626** v4 seats) — the portal-side "People Room" roster this whole
  program is named after; per 00281's own comment, field/sub/installer/receiver
  parties **fold into this same roster**.
- `public.field_link_tokens` (**00283**, "field_links.sql") — no-auth,
  tokenized access for a party that doesn't log in: only `sha256(token)` is
  stored, `resolve_field_link()` (SECURITY DEFINER) returns a narrow JSONB DTO
  (open tasks, court items, punch list, near deliveries for receiver/gc),
  never raw rows. `create_field_link` revokes+reissues (at most one live token
  per party+project) — same pattern as `document_shares` (00266).
- Portal-side TS reference (not iOS, but the shape W5's DTOs should probably
  mirror): `packages/supabase/src/hooks/use-people.ts` and
  `use-studio-contacts.ts` — these are the designer-portal's existing
  React-Query hooks over the same tables; useful as the "what does the portal
  already show" cross-check before inventing iOS field names.
- `packages/types` has no `project_parties`/`people_directory` domain type
  either (only `field-config.ts` matched, unrelated) — so there's no
  hand-authored `@patina/types` shape to import into Swift; W5's Swift DTOs
  will be original, same as `FieldProject`/`FieldProjectDetail` were.

## 5. Test targets + style

- One iOS test target found: **`CaptureTests`**
  (`apps/mobile/Capture/CaptureTests/`). No separate `CaptureKitTests` bundle
  directory exists on disk (tests for `CaptureKit` code live in `CaptureTests`
  and `@testable import CaptureKit`), though the top-level `README.md`'s build
  snippet references `xcodebuild test ... -scheme CaptureKit` — worth
  confirming against the generated project rather than assuming a second
  physical test bundle.
- **Swift Testing, not XCTest**: `grep -rl "import Testing"` → 47 files;
  `grep -rl "import XCTest"` → 0 files. Style sample
  (`PortalLoginTests.swift`, `ManifestTests.swift`): plain `struct` test types
  (no `XCTestCase` subclass), `@testable import CaptureKit`, `Issue.record(...)`
  for custom failures — idiomatic Swift Testing throughout.

## 6. `Secrets.swift` presence

- **This worktree** (`.codex/worktrees/agent-people-build/apps/mobile/Capture/Capture/App/Configuration/`):
  only `Secrets.example.swift` and `Secrets.xcconfig.example` are present.
  **`Secrets.swift` itself is absent** (gitignored, per-checkout) — a real-mode
  build/run here will not compile against real services until it's supplied.
- **Main checkout** (`/Users/kody/Code/patina-merged/apps/mobile/Capture/Capture/App/Configuration/`):
  `Secrets.swift` **is present**, alongside the same two `.example` files.
- Per the task's standing instruction, this real `Secrets.swift` could be
  copied worktree-ward from the main checkout when the build step actually
  needs it (sandbox disabled for that one copy) — **not done in this scouting
  pass**, since the task was read-only. Note also: mock-mode builds (the
  Simulator default) don't need `Secrets.swift` at all; only `-CaptureForceReal`
  or a device run would.

## 7. App Store Connect / distribution

- **ASC skills location** — the task's stated path
  (`apps/mobile/Patina/.Codex/skills/`) **does not exist**. The real location
  (main checkout, not the worktree) is
  `apps/mobile/Patina/.agents/skills/` (mirrored at `apps/mobile/Patina/.claude/skills/`),
  containing **25** `asc-*` skills: `asc-iap-attach`, `asc-signing-setup`,
  `asc-xcode-build`, `asc-subscription-localization`, `asc-wall-submit`,
  `asc-team-key-create`, `asc-submission-health`, `asc-release-flow`,
  `asc-testflight-orchestration`, `asc-metadata-sync`, `asc-whats-new-writer`,
  `asc-crash-triage`, `asc-revenuecat-catalog-sync`, `asc-localize-metadata`,
  `asc-workflow`, `asc-shots-pipeline`, `asc-aso-audit`, `asc-cli-usage`,
  `asc-build-lifecycle`, `asc-app-create-ui`, `asc-ppp-pricing`,
  `asc-screenshot-resize`, `asc-notarization`, `asc-privacy-nutrition-labels`,
  `asc-id-resolver`. None of these are Capture-specific; per
  `apps/mobile/Capture/README.md` they'd need adapting.
- **Capture bundle id / team** (from `scripts/generate_project.rb`):
  `PRODUCT_BUNDLE_IDENTIFIER = cloud.patina.field` (app target; test target is
  `cloud.patina.field.tests`; a per-feature-team variant pattern
  `cloud.patina.field.#{name}` also exists in the generator for some other
  purpose), `DEVELOPMENT_TEAM = VP22LXHT7L` ("Kody's Apple Dev team — automatic
  device signing survives regen").
- **No ASC app record for `cloud.patina.field` exists**, per
  `apps/mobile/Capture/README.md`'s own "BLOCKED on Kody" section: `asc apps
  list --bundle-id cloud.patina.field` → zero results; the only registered app
  is `cloud.patina.app` (id `6762007888`, the Patina client app). **This is the
  README's own prior claim, not independently re-verified in this pass** (the
  task said not to call ASC yet). Creating one needs the ASC web UI or the
  `asc-app-create-ui` skill's interactive Apple-ID web session — out of scope
  for an unattended program per the README.
- `scripts/ExportOptions.plist` and `scripts/archive-testflight.sh` **do**
  exist for Capture (method `app-store-connect`, `teamID VP22LXHT7L`, automatic
  signing) — so archive+export is standing infrastructure even though no ASC
  app exists yet to upload into. No `Fastfile`/fastlane config found anywhere
  under `apps/mobile/Capture`.
- `~/.blitz/signing` contains only a `cloud.patina.app` subdirectory — **no
  cached signing assets for `cloud.patina.field`** locally.
- `~/.blitz/asc-credentials.json` exists with top-level keys `privateKey`,
  `keyId`, `issuerId` (names only, not read/printed) — an ASC API key of some
  kind is present on this machine, but its scope/role (e.g. whether it's
  Admin, needed for `-allowProvisioningUpdates` to register a new App ID) was
  not checked.

## 8. Devices / simulators (blitz-iphone `list_devices`)

**Zero simulators booted** at scout time (`"simulators": []`). Physical devices
visible (paired, all `wdaRunning: false`; UDIDs verbatim for W5 to pass
explicitly — never `"booted"` per the binding iOS-verification rule):

| Name | Model | Connection | Dev-mode | UDID |
|---|---|---|---|---|
| Kody's Phone | iPhone 17 Pro Max | wifi | **on** | `00008150-00016C8A21DA401C` |
| iPhone | iPhone 13 Pro | wifi | **on** | `00008110-001630212231801E` |
| Kody's Apple Watch | Apple Watch Series 7 | usb | **on** | `00008301-208E5D160C98C02E` |
| Coach-iPhone-A | iPhone 17 | usb | off | `53E65012-9936-4F98-AC20-4D0D62203ECB` |
| Coach-iPhone-B | iPhone 17 | usb | off | `C493F0D3-EF4C-4117-BF07-8585FEADAC41` |
| Coach-iPhone-C | iPhone 17 | usb | off | `18779E41-0688-413E-A430-DD5B046BB678` |
| iPhone 17 | iPhone 17 | usb | off | `C8850509-C7DC-43C5-9226-9446404EE98A` |
| iPhone 17 Pro | iPhone 17 Pro | usb | off | `973D1724-90BF-4A0A-B02D-481D561547B3` |
| iPhone 17 Pro Max | iPhone 17 Pro Max | usb | off | `EDF8B28E-32F2-4DD1-944E-25E3C8538770` |
| iPhone Air | iPhone Air | usb | off | `9DF129E8-F864-4675-BC36-0C3B81962506` |
| iPad Pro 11-inch (M5) | iPad Pro 11-inch (M5) | usb | off | `7C8C092C-7AD4-453C-9CC6-40E0931260AC` |
| Coach-Watch-A / A42 / B / B41 | Apple Watch | usb | off | `1A84A0E1-…`, `F56D11EF-…`, `C42E69C3-…`, `F1012149-…` |

"Kody's Phone" is the real device named in the AGENTS docs for on-device
capture-only flows; it has developer mode on but WebDriverAgent is not
currently installed/running (`setup_device` would need to run first). No
simulator is booted, so `capture-run.sh` (which resolves and boots
`iPhone 17` by default) will boot a fresh one on first use — W5 should re-run
`get_execution_context`/`list_devices` after `capture-run.sh` reports
"running" to get the live udid, per the script's own instructions.

---

## Summary / implications for W5 planning

1. The natural home for a roster UI is a **new section on P2 (`ProjectDetailScreen`)**, matching the existing Phases/Milestones/FF&E/Rooms pattern (one fetch, one spinner, inline error+retry) — or a new screen off it. No existing screen id fits; a new `CaptureScreenID` case will be needed either way, which means `generate_project.rb` must be re-run.
2. There is **no client-side Swift model at all** for `project_parties`/`people_directory`/`field_link_tokens` — this is 100% new DTOs + a new service protocol + a new mock conformer, following the `ProjectsService`/`SupabaseProjectsService`/`WorkMocks` triad exactly.
3. Auth/session plumbing (`SessionProviding`, `owner.workspaceID`) is mature and reusable as-is; no auth work needed beyond scoping the new RLS-backed queries by `workspaceID`.
4. No offline/cache layer exists for read-only data (Projects has none either) — a roster read-only view doesn't need to invent one to match the existing bar, though it also gets no help from `CaptureKit/Sync` if offline access is actually desired.
5. Tests should be Swift Testing style in `CaptureTests`, mirroring `PortalLoginTests.swift`/`ManifestTests.swift`.
6. `Secrets.swift` must be copied into this worktree before any real-mode (non-mock) build/run; mock-mode Simulator work doesn't need it.
7. TestFlight distribution for Capture is otherwise ready (archive/export scripts + signing team configured) but has no ASC app record yet and is explicitly blocked on Kody doing that step interactively — irrelevant to a build-only W5 pass, relevant if W5's report is expected to address shipping.
8. No simulator was booted at scout time; the coach fixture devices are non-simulator physical placeholders — plan on `capture-run.sh` cold-booting `iPhone 17` and re-resolving the udid afterward for blitz-iphone driving.
