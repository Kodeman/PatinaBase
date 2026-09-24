# Store-0.1-6: a store written by the shipped Patina Field 0.1 (6)

`CaptureStoreMigrationTests` opens this store with the current schema and
checks that every row survives. It was written by the shipped build's own code,
so it is immutable. Never regenerate it from a later tree, and never "fix" it to
make a test pass. If the current build cannot open it, the fix belongs in the
schema, not here.

## Source

| | |
|---|---|
| Build | Patina Field **0.1 (6)**, the live TestFlight build (ASC build `2868d3ab-6130-46de-99e1-7b53729036b6`) |
| Source commit | `b1447ba7da595c94e724611c28b4e8439267f0dc` ("chore(field): regenerate Capture.xcodeproj at build 6") |
| Simulator | iOS 26.5 (23F77), throwaway clone of iPhone 17, erased before seeding |
| Toolchain | Xcode 27.0 (27A266a), iphonesimulator27.0 SDK, the old commit's own `IPHONEOS_DEPLOYMENT_TARGET` 18.0 |
| Seeded | 2026-09-24 |

**How the commit was established.**

- In `scripts/generate_project.rb`, `CURRENT_PROJECT_VERSION` became `'6'` in
  `e67ba9672` ("bump Patina Field build number to 6"). The history before that
  is `1`, then `3` in `4e5bcf100`, then `6`. Nothing has changed it since, so
  every later commit also says 6.
- `artifacts/hour-tracking-2026-09-11/build/SHIP-REPORT.md` §5 records the
  upload. The branch `hour-tracking/ios` carried `e67ba9672` and `b1447ba7d`,
  and those two commits reached the ship branch in merge `904ef62e8`, whose
  message is "merge the build-6 bump **after the TestFlight upload**". The
  archive was therefore built from that branch tip, `b1447ba7d`.
- `b1447ba7d` only regenerates the `.pbxproj`, and its Swift is identical to
  `e67ba9672`. Current `main` has the same `CaptureKit/Domain` and
  `CaptureKit/Persistence` sources.
- Build 5 was archived 2026-09-13 from the people-room W5 branch
  (`artifacts/people-room-crm-2026-09-11/build/w5-ship-report.md` §5). It is
  **not** captured here.

## How it was made

1. `git archive b1447ba7d apps/mobile/Capture apps/mobile/PatinaDesignKit` was
   extracted into a scratch directory. This was a plain directory, not a
   worktree and not the main checkout. That commit's own `generate_project.rb`
   was run inside it.
2. Two files were added to the scratch copy's `CaptureTests`, and neither was
   ever committed to `b1447ba7d`:
   - `SeedHarness.swift.txt` (this folder), saved as `.txt` so the generator
     does not compile it here.
   - `CaptureStoreFixtureProjection.swift`, byte-identical to the file of that
     name in `CaptureTests` (sha256 `9c235b91…d246`). The manifest and the test
     therefore project rows with the same code.
3. The harness ran as `xcodebuild test -scheme CaptureKit
   -only-testing:CaptureTests/SeedStoreFixture016` on the erased clone. It
   opened the store the way launch does, with `CaptureStore.resilient(persistent:
   true)`, and asserted that the store was empty and nothing was reset. The
   simulator provisions the App Group, so the **App Group rung** answered and
   the store is `<group>/Library/Application Support/default.store`. The
   harness wrote everything through CaptureKit's own write paths:
   - `CaptureOwnerProjectionPolicy.newDraft`
   - `CaptureStore.writeMedia`
   - `addMeasurement`
   - `LocalCaptureSyncService`'s transitions
   - `ContextCaptureService.enqueuePhoto` / `enqueueVoice`
   - `CaptureProjectCache`
   - `SiteScanBundleHome`
   - `VisitCloseOrchestrator.apply` / `TimeEntryOutboxOrchestrator.apply`

   It then wrote `manifest.json`.
4. The files were copied out of the simulator after the test process exited.

**Checkpointing.** No checkpoint was run by hand. The trio in `store/` is exactly
what the old build's process left on disk. SQLite's own auto-checkpoint fired
during seeding (the log shows "WAL checkpoint: Database did checkpoint. Log
size: 1003 checkpointed: 1003"), and the process left `default.store-wal` at 0
bytes. All three files are kept as they were.

## Layout

- `store/default.store`, `store/default.store-wal`, `store/default.store-shm`:
  the SQLite trio.
- `CaptureMedia/`: the media directory, 32 files. It holds:
  - 17 photo HEICs named `<UUID>.heic`
  - 1 context-photo `.jpg`
  - 2 AAC voice segments `voice-<id>-000.m4a` / `-001.m4a`
  - 6 site-delivery payloads `site-delivery-<id>.json`
  - 6 proof HEICs `site-proof-<id>.heic`
- `manifest.json`: what the old build read back after seeding:
  - `rows`: every stored attribute of every row, as `StoreFixtureProjection`
    renders it.
  - `media`: the sha256 of each media file.
  - `labels`: row key to what the row is.
  - `queries`: what the old build's own outbox queries returned.
  - `seededStorePath` / `seededMediaPath`: where the files lived.
- `SeedHarness.swift.txt`: the harness source.

The site-request `payloadPath` and `mediaPaths` are **absolute** paths into the
seeding simulator's App Group container, because that is how the shipped build
stores them. The test resolves them by last path component against the copied
`CaptureMedia/`.

## What the seed created

Two owners share the store:

| Owner | User | Workspace |
|---|---|---|
| A | `0f6a8c52-3d1e-4b7a-9c20-5e8d1f4a7b36` | `a4c1e9d0-7b2f-4e6a-8d35-19f0c2b7e4d8` |
| B | `7d2e4f61-0a9b-4c3d-8e5f-6a1b2c3d4e5f` | `c9e8d7f6-5a4b-4c3d-9e2f-1a0b9c8d7e6f` |

Owner stamps on captures, project refs and scans are lower-case, which is how
`CaptureOwnerIdentity` normalizes them. The two hours queues store `ownerUserID`
upper-case, from `UUID.uuidString`, because that is what the app writes. The
projects are Maple St `3b9f1c2e-…0f13` and High Point `5e2a7c9d-…0e15`, and the
room is Living room `8a1c3e5f-…4c17`. `manifest.json` `labels` maps every row id
below to its description.

**Specimen: 17 rows, with 18 CapturePhoto and 12 CaptureMeasurement.** Every row
has a unique `clientToken`. Ten rows carry both photos and measurements.

- Owner A captures:
  - `draft`: a local draft that was never saved to the outbox.
  - `ready`: saved, but no drain has picked it up yet.
  - `queued`: offline, waiting for signal.
  - `uploading` at 35%.
  - `uploading`, with lifecycle `awaitingConfirmation`: the bytes are up but no
    receipt has arrived.
  - `failed`, with lifecycle `failed`: retryable, `retryCount` 1.
  - `failed`, with lifecycle `rejected`: needs review.
- Owner A captures that are `committed`, with wave-4 write lanes:
  - Placement `pending`; margin, punch and degrade `pending`.
  - Placement `placing`; the three lanes `writing`.
  - Placement `failed`; the three lanes `failed` (retry 1).
  - Placement `placed`; the three lanes `refused`; `placementReplayPending`.
  - Placement `placed`; margin `unwritable` at the retry ceiling (5), punch and
    degrade `unwritable`.
  - Placed with every lane `written`. It is fully settled and not in `outbox()`.
- Owner A context captures, from `ContextCaptureService`:
  - A `ready` detail photo (`.jpg`).
  - A `ready` voice note with two `.m4a` segments.
- Owner B: one `queued` capture.
- No owner: one `ready` legacy row with no owner stamp. It stays quarantined.

**CaptureProjectRef: 4 rows.**

- Owner A: Maple St, High Point, and "Garage studio", which was created offline
  and has no remote id.
- Owner B: High Point.

Filing and visit stamps come from `CaptureProjectCache`.

**ScanUploadRecord: 6 rows, all owner A.** Each is keyed by
`SiteScans/site-scan-<id>`, and there is one per status: `queued`, `uploading`,
`awaitingConfirmation`, `retryableFailure`, `rejected` and `complete`. The
artifact states include `pending`, `uploading`, `uploaded`, `failed` and
`skipped`.

**SiteRequestOutboxRecord: 6 rows.** There is one per state: `queued`,
`uploading`, `awaiting_receipt`, `delivered`, `failed` and `terminal`
(`requestChanged`). Each has a payload JSON and one proof HEIC, and its checksum
is taken over the payload.

**FieldVisitCloseRecord: 8 rows and TimeEntryOutboxRecord: 8 rows, all owner
A.** There is one of each per outcome: `pending`, `writing`, `failed`, `refused`,
`unwritable` (unsatisfiable), `written`, `pending` after a deferral, and
`unwritable` at the retry ceiling. Both billable and non-billable rows are
present. `visitID`/`timeEntryID` and `entryID` are the idempotency keys.

**Queries recorded:**

- `outbox()` returns 14 rows. `outbox(owner:)` returns 12 for A and 1 for B.
- `visitCloseOutbox(owner: A)` returns 8, and 4 of them are drainable when user
  initiated.
- `timeEntryOutbox(owner: A)` returns 8, and 4 of them are drainable when user
  initiated.
- `siteRequestOutbox()` returns 6.
- `scanUploadRecords(owner: A)` returns 5, or 6 with complete records included.
- `scanBundlePathsProtectedFromSweep()` returns 5.

## Not covered

- A store from 0.1 (5) or earlier. Hour tracking's W6 hours queue
  (`TimeEntryOutboxRecord`) and `FieldVisitCloseRecord.billable` shipped in
  build 6 and are already in this store. An upgrade from a pre-W6 store, which
  would add them, is not exercised here.
- A store written on iOS 27. This one was written by the iOS 26.5 SwiftData
  runtime.

## Regenerating

Do not regenerate this fixture. A fixture for a later shipped build goes in a new
`Store-<version>-<build>/` folder, made the same way from that build's archive
commit.
