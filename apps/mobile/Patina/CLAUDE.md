# Patina iOS App

Native Swift/SwiftUI app for room capture, companion experience, and
furniture discovery. Part of the Patina monorepo — see root `CLAUDE.md`
for the overall Supabase-first architecture.

This is the **client-only** app: designer and trades functionality lives in
the sibling app, `apps/mobile/Capture` ("Patina Field") — see
`apps/mobile/CLAUDE.md` for how the split works.

## Data & auth

- **Auth**: Supabase Auth (GoTrue). Access via `SupabaseClientManager.shared`.
  Never introduce Firebase, NextAuth, Teenybase, or local keychain token
  managers — the app has a single Supabase session source of truth.
- **Database**: Supabase PostgreSQL — Supabase Cloud "Strata" in prod, local
  CLI stack in dev; the per-env URL comes from `Secrets.swift`. PostgREST
  accessed through `RoomsAPIClient`, `ProductAPIClient`, `FeedAPIClient` in
  `Patina/Core/Network/`.
- **Realtime / Storage**: Supabase Realtime + Storage via the supabase-swift
  SDK. Scan artifacts go to the `room-scans` bucket with RLS keyed on
  `{artifactType}/{userId}/{roomId}/...` (see migration `00077`).
- **Analytics**: PostHog via `Services/Analytics/*`.

## Project structure

- Xcode project at `Patina.xcodeproj` (uses `PBXFileSystemSynchronizedRootGroup`
  — new `.swift` files anywhere under `Patina/` are auto-added to the target).
- Swift source under `Patina/Patina/`:
  - `App/` — `PatinaApp.swift`, `Coordinators/AppCoordinator.swift`
  - `Core/` — `Models`, `Network`, `Persistence`, `State`, `Extensions`
  - `Design/` — `Tokens`, `Components`, `Animations`, `Gestures`
  - `Features/` — feature-per-folder (Walk, RoomScan, Home, Companion,
    ARPlacement, StyleQuiz/Conversation/Reveal, Collections, ProductDetail,
    Profile, Recommendations, Rooms, Notifications, DesignServices, Shared,
    Authentication, FirstLaunch)
  - `Services/` — `Auth`, `Sync` (Supabase), `Analytics`, `Companion`, `API`

## Scan pipeline (v2/v3)

- `Features/Walk/Services/RoomCaptureService.swift` — RoomPlan + ARKit LiDAR
  driver.
- `Features/Walk/Services/ScanBundleWriter.swift` writes a versioned
  on-disk bundle at `Application Support/Scans/{scanId}/` tracked by
  `ScanManifest` (currently v3). Artifacts include USDZ, CapturedRoom JSON,
  mesh PLY, ARWorldMap, depth archive, posed photos (HEIC + thumbnails),
  coverage heatmap, annotations.
- `Services/Sync/RoomScanSyncService.swift` uploads the bundle to Supabase
  Storage and writes per-scan metadata into the `room_scans` +
  `room_scan_images` tables.
- See `docs/specs/IOS Scann/` and the root `plans/` directory for the full
  Phase A/B pipeline plan.

## Build & device notes

- Build scheme: `Patina`. Target: iOS 18+, optimized for iOS 26.5 on LiDAR
  iPhone (Pro-line).
- Run on-device for RoomPlan / ARKit / LiDAR. Simulator is useful for
  compile checks and non-AR UI only.
- `apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` is gitignored
  — templated from `Secrets.example.swift`.

## MobAI verification

Use the `controlling-mobile-devices` / `running-smoke-tests` skills (via
MobAI bridge) for on-device smoke tests when changes are observable at
runtime.
