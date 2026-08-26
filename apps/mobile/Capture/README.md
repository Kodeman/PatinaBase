# Patina Field (T-03)

**Patina Field** is a standalone iOS app. Today is home — the camera is one
tap away, and it stays home inside a visit — turning a physical object in a
showroom into a structured, located, synced **specimen**. Spec:
`docs/design/ios-Capture/patina-mobile-ux-flow.html`. Plan:
`~/.claude/plans/review-the-design-document-greedy-engelbart.md`.

Phase 2 layered a second surface onto the same app — **Work** — for
designers and trades: a Work dashboard, their projects, open leads,
read-only pending decisions, a messages inbox, on-site PO receiving,
Face-ID-gated QR portal-login approval, and a pro LiDAR site-scan flow that
attaches a scan to a project. The 8 Work flows (19 screens) sit alongside
the original 8 capture flows (33 screens) — one `CaptureScreenID` enum, one
harness, one set of dev-loop scripts drives all 74 built screens.

## Screens

| # | Flow | Screens |
|---|------|---------|
| 0 | First run & permissions | O1 welcome · O2 connect · O3 camera-priming · O4 ready |
| 1 | Entry points | E1 app-icon · E2 system-entry · E3 share-sheet |
| 2 | Core capture | C1 viewfinder · C2 framing · C3 specimen-forms · C4 multi-shot · C5 specimen-sheet |
| 3 | Enrich in place | N1 tag-ocr · N2 scan · N3 measure · N4 voice · N5 smart-guess |
| 4 | Resilience & edges | R1 low-light · R2 ocr-fallback · R3 denied · R4 offline |
| 5 | Route & save | S1 assign · S2 create-project · S3 destination · S4 saved · S5 inbox |
| 6 | Session & review | V1 session-tray · V2 cull · V3 detail |
| 7 | Utilities & settings | U1 sync · U2 library-search · T1 settings · T2 account |
| 8 | Work dashboard | W1 work |
| 9 | Projects | P1 project-list · P2 project-detail |
| 10 | Leads | L1 lead-list · L2 lead-detail |
| 11 | Decisions (read-only) | D1 decision-list · D2 decision-detail |
| 12 | Messages | M1 inbox · M2 thread |
| 13 | Receiving / goods-in | G1 arriving · G2 inspection · G3 outcome |
| 14 | QR portal-login approval | Q1 qr-scan · Q2 qr-approve |
| 15 | Pro site-scan | F1 scan-setup · F1 context · F2 site-scan · F3 scan-review · F4 scan-upload |
| 16 | Site Request P1 | SR01 site-hub → SR12 Binder history · SR13 guest-landing → SR20 returned item |

Flows 0–7 are the original 33 screens; flows 8–15 are the 19 Work-flow
screens added in Phase 2 plus 20 P1 Site Request screens, plus the wave-3
visit-spine screens V0.visit and C6.voice — 74 built — and one reserved
visit-spine id, V4.visit-review, held for wave 4 (75 total). Screen ids are defined once, in
`CaptureKit/CaptureKit/Support/CaptureScreenID.swift`, and are what
`capture-run.sh`, `capture-shots.sh`, and the `-CaptureScreen` launch flag
key off (see Dev loop, below).

## Architecture

- **`CaptureKit/`** — embedded framework: the frozen shared substrate (domain
  `@Model`s, service protocols, state machine, navigation, design tokens, Live
  Activity attributes). Built by the foundation owner; teams code against it.
- **`CaptureKitMocks/`** — mock conformer for every seam, so all screens render
  in the Simulator without camera/LiDAR/Speech/network.
- **`Capture/`** — the app target (Features/ per flow).

## Build

The Xcode project is **generated** from the source tree (re-runnable; teams add
files then regenerate, so `project.pbxproj` is never hand-edited):

```bash
ruby scripts/generate_project.rb
xcodebuild build -project Capture.xcodeproj -scheme Capture \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO
xcodebuild test  -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO
```

Run on mocks (Simulator-safe): launch with `-CaptureUseMocks`.
Real backend calls need `Secrets.swift` (copy from `Secrets.example.swift`).

## Real mode

The app runs on mocks by default in the Simulator, and on real services by
default on a physical device (`AppConfiguration.runsRealServices`).
`-CaptureForceReal` flips a Simulator run to real services without a device;
`-CaptureUseMocks` / `--uitesting` / `-CaptureUITest` force mocks anywhere.

- **Auth** — O2 offers two native sign-in paths (no browser redirect), matching
  the providers Strata enables (`apple` + `email` only): **Sign in with Apple**
  (native `ASAuthorizationController` + nonce → `signInWithIdToken`) and an
  **email one-time-code** (`signInWithOTP(shouldCreateUser:false)` →
  `verifyOTP`). Both run through the `WorkspaceAuthorizing` seam into
  `SupabaseSessionService`, then list the caller's `organizations` as
  workspaces — a workspace **is** an organization. Email uses
  `shouldCreateUser: false`: Field is invite-only, so the app never mints a new
  auth user (designers are provisioned through the portal).
- **Secrets** — `Secrets.swift` (gitignored; copy from `Secrets.example.swift`)
  holds `supabaseAnonKey` (the `api.patina.cloud` anon/publishable key) and
  `postHogAPIKey` (optional — `nil` keeps analytics a no-op and falls back to
  the `POSTHOG_API_KEY` env var).
- **Local-stack overrides** — `-CaptureSupabaseURL <url>` and
  `-CaptureSupabaseAnonKey <key>` launch args point a real-mode run at a
  local Supabase stack instead of `api.patina.cloud`, without editing
  `Secrets.swift`.

## Backend

Field-capture migrations `supabase/migrations/00232`–`00235`
(`field_captures` inbox + `capture-media` bucket + `commit_field_capture` RPC).
Migration `00265_room_scans_project_linkage.sql` adds the Work flows' site-scan
`project_id` / `project_room_id` plus a routing guard, so the F-flow (pro
site-scan) can attach a scan to one of the scanning designer's projects.

## Dev loop (Claude Code ↔ Xcode)

Two scripts close the loop between code and a running app. Both regenerate the
project first, so edits to any `.swift` file are picked up automatically.

```bash
# VERIFY — build + unit tests + lint (CI gate)
scripts/capture-gate.sh            # or: build | test | lint

# RUN — generate → build → boot sim → install → launch
scripts/capture-run.sh                    # real entry (viewfinder / onboarding)
scripts/capture-run.sh C5.specimen-sheet  # jump straight to any built screen
CAPTURE_SIM="iPhone 17 Pro" scripts/capture-run.sh N3.measure

# SWEEP — screenshot every screen (pure simctl, no MCP) → .build/shots/
scripts/capture-shots.sh                  # all 74 built screens
scripts/capture-shots.sh C5 N1 S3         # subset (prefix match)
```

Screen ids are the tail of each `CaptureScreenID` (e.g. `O1.welcome`,
`C1.viewfinder`, `S3.destination`, `U2.library-search`, `T1.settings`).
The `-CaptureScreen <suffix>` flag is read at launch by `AppConfiguration`
→ `CaptureDeepLink.drive`, so a **fresh launch** is required per screen
(the sweep script terminates between shots).

### Driving the live app from Claude Code

Once `capture-run.sh` reports "running", Claude Code drives the booted
simulator through the **blitz-iphone** MCP:

| Step | Tool |
|---|---|
| see the screen | `get_screenshot` |
| read tappable elements + frames | `scan_ui` (region `full`) |
| full element tree | `describe_screen` |
| tap / swipe / type | `device_action` |

**Gotcha:** when a physical iPhone is also connected, the execution context is
*ambiguous* and the default `udid: "booted"` can return an empty tree. Always
pass the explicit simulator **udid** (from `get_execution_context`) to
`scan_ui` / `describe_screen` / `device_action`.

### On-device (camera, ARKit measure, DataScanner, Speech, Live Activity)

These are device-only (simulator renders the UI/fallbacks). One-time setup:

1. Set a signing team on the `Capture` target (the generator builds with
   `CODE_SIGNING_ALLOWED=NO` for the simulator; a device build needs a team).
2. blitz-iphone `setup_device <udid>` builds + installs WebDriverAgent
   (1–3 min) on "Kody's Phone" (dev-mode already on); then drive it exactly
   like the simulator, passing that device's `udid`.

### DEBUG Field raster qualification fixture

The Settings screen exposes a **Diagnostics → Raster fixture** row only in a
Debug build. It exports the exact production keyframe raster path as three local
evidence files (HEIC, canonical native BGRA, and JSON dimensions/intrinsics/
marker coordinates/hashes). It does not capture a room, call the backend, or
exist in a Release build.

Per **R118** the fixture is emitted at this device's **physical capture
resolution** — not at a pinned size. The adjacent **Diagnostics → Capture
profile** row shows the resolution first; it is read off the same
`ARWorldTrackingConfiguration` the Field rig runs (`SharedARCaptureRig
.makeConfiguration()`, which never assigns `videoFormat`, so ARKit's default for
that device and those frame semantics is what production gets). There is no
default profile: on the Simulator the row reads `unavailable` and Generate
fails. Operator procedure, including the mandatory cross-check against a real
scan's `keyframes/keyframe_index.ndjson`:
`docs/design/field-capture/p2-r118-capture-resolution-fixture-runbook.md`.

Use an explicit physical-device UDID throughout — never `booted` or a device
name when a Simulator may also be present:

```bash
cd apps/mobile/Capture
xcrun devicectl list devices
export FIELD_DEVICE_UDID='<physical-device-UDID>'
test -n "$FIELD_DEVICE_UDID"

# One-time prerequisite: set the Capture target's signing team in Xcode.
export FIELD_RASTER_DERIVED="$PWD/.build/raster-fixture-$FIELD_DEVICE_UDID"
xcodebuild build -project Capture.xcodeproj -scheme Capture \
  -configuration Debug \
  -destination "platform=iOS,id=$FIELD_DEVICE_UDID" \
  -derivedDataPath "$FIELD_RASTER_DERIVED" \
  -allowProvisioningUpdates

xcrun devicectl device install app \
  --device "$FIELD_DEVICE_UDID" \
  "$FIELD_RASTER_DERIVED/Build/Products/Debug-iphoneos/Capture.app"

xcrun devicectl device process launch \
  --terminate-existing \
  --device "$FIELD_DEVICE_UDID" \
  cloud.patina.field \
  -CaptureUseMocks -CaptureScreen T1.settings
```

On that physical device, read the **Capture profile** row, then tap **Generate**,
then **Share**, and AirDrop or Save to Files all three
`field-core-image-raster-v1*` artifacts together. They land in
`Documents/field-core-image-raster-v1-<W>x<H>/`, stamped with the profile so two
fixture sets are never confusable. If automation drives those buttons, every
blitz-iphone call must also pass the same explicit `FIELD_DEVICE_UDID`. The
exported JSON hashes the BGRA and HEIC bytes; compare those values after copying
before using the fixture as Linux decoder evidence — at capture resolution the
BGRA file is ~11 MB, so a truncated transfer is a real failure mode.

## Distribution (Wave 0.5, FC-R14)

Archive + export for TestFlight, standing up the path that never existed
before (no `Fastfile`, no CI archive step, no ASC app record — plan
`docs/design/field-companion/field-companion-plan.md` §1.5).

```bash
cd apps/mobile/Capture
scripts/archive-testflight.sh                       # regenerate → archive → export
scripts/archive-testflight.sh --skip-export          # archive only
scripts/archive-testflight.sh --build-number 7       # override CURRENT_PROJECT_VERSION
scripts/archive-testflight.sh --app-id <ASC_APP_ID>  # also upload via `asc builds upload`
```

Signing is automatic (`DEVELOPMENT_TEAM = VP22LXHT7L`, `CODE_SIGN_STYLE =
Automatic`, hardcoded in `generate_project.rb`) and reuses the already-issued
"Apple Distribution: Middle West Studio LLC (VP22LXHT7L)" certificate — the
`archive` action itself signs with whatever Development identity Automatic
signing resolves locally (this is normal Xcode behavior, not a bug: the
intermediate archive is always Development-signed), and `-exportArchive`
re-signs with the Distribution identity for the export options' `teamID`.
Verify with `codesign -dvv Payload/Capture.app` on the exported `.ipa` —
`Authority=Apple Distribution: Middle West Studio LLC (VP22LXHT7L)` and
`TeamIdentifier=VP22LXHT7L`.

Export options: `scripts/ExportOptions.plist` (`method: app-store-connect`,
`teamID: VP22LXHT7L`, automatic signing). DerivedData and archive/export
output live under this checkout's own `.build/` (gitignored, per-worktree —
two worktrees archiving concurrently never collide).

An App Store Connect **Admin**-role API key lets `-allowProvisioningUpdates`
register the `cloud.patina.field` App ID and a distribution provisioning
profile non-interactively, reusing the certificate above rather than minting
a new one. Pass it via env vars (all three or none):

```bash
export ASC_KEY_ID=<key id>
export ASC_ISSUER_ID=<issuer id>
export ASC_PRIVATE_KEY_PATH=<path to .p8>
```

### Build-time PostHog key (FC-R14)

`AppConfiguration.postHogAPIKey` reads `Info.plist`'s `POSTHOG_API_KEY`
first — a **build-time** value, sourced from
`Capture/App/Configuration/BuildSettings.xcconfig` (committed) and its
optional `#include? "Secrets.xcconfig"`. This is the only resolution path
that survives an archive: the `POSTHOG_API_KEY` **environment variable**
fallback (still checked, lower priority) is only ever injected by an Xcode
scheme's **Run** action — never a device install, TestFlight, or CI archive
— so a key set only that way makes the telemetry gate pass on one Mac and
ships silently blind in every real build.

To set a real key for local archiving:

```bash
cp Capture/App/Configuration/Secrets.xcconfig.example \
   Capture/App/Configuration/Secrets.xcconfig
# edit POSTHOG_API_KEY = phc_...   (gitignored; never commit the real value)
```

Without `Secrets.xcconfig`, `POSTHOG_API_KEY` resolves to an empty string in
`BuildSettings.xcconfig`'s default and analytics stays a no-op —
fail-closed, not a build failure.

### App Store Connect app record — BLOCKED on Kody

There is **no App Store Connect app record for `cloud.patina.field`**
(confirmed via `asc apps list --bundle-id cloud.patina.field` → zero
results; the only registered app is `cloud.patina.app`, id `6762007888`).
Creating one requires either the App Store Connect web UI or an interactive
Apple ID sign-in (the `asc-app-create-ui` skill's iris/web-session path) —
this program does not create Apple/ASC credentials or sign in
interactively, so archive + export are as far as it goes without Kody.

1. **Kody**: App Store Connect → Apps → **+** → **New App** — Platform iOS,
   Name "Patina Field" (or similar available name), Primary language
   en-US, Bundle ID `cloud.patina.field` (register it first in the
   Developer portal if the picker doesn't offer it — `-allowProvisioningUpdates`
   already registered the App ID during this program's own archive runs),
   SKU any unique string (e.g. `PatinaField`). Alternatively, run the
   `asc-app-create-ui` skill interactively (it drives Blitz's Apple ID web
   session — not something this program does on its own).
2. Note the numeric **App ID** App Store Connect shows after creation.
3. Run: `scripts/archive-testflight.sh --app-id <APP_ID>` (or, with an
   existing export, `asc builds upload --app <APP_ID> --ipa <path-to-ipa>
   --wait`). Kody can also run interactive ASC steps directly in this
   session with `! <command>`.
4. First build on a new app also prompts App Store Connect for **export
   compliance** (uses standard encryption — HTTPS only, no custom crypto)
   and, before an actual TestFlight *release* (not just an upload), the
   **privacy nutrition labels** (`asc-privacy-nutrition-labels` skill) —
   neither is required to complete an upload itself.

### Privacy manifest

`Capture/PrivacyInfo.xcprivacy` declares the required-reason APIs the app
actually calls: `NSPrivacyAccessedAPICategoryUserDefaults` (reason `CA92.1`
— own app / app-group data only, e.g. `UserDefaults(suiteName:
AppConfiguration.appGroupID)` in `SupabaseSessionService`) and
`NSPrivacyAccessedAPICategoryFileTimestamp` (reason `3B52.1` —
`contentModificationDateKey` reads in `SiteScanBundleHome`, and in
`CaptureStore.receiptedMediaFiles()`, which orders the media-retention sweep
oldest-first). It also declares what the app collects when a real PostHog key
is configured: `NSPrivacyCollectedDataTypeUserID` (the Supabase user id passed
to `identify`, linked, analytics + app functionality — feature flags are keyed
on it) and `NSPrivacyCollectedDataTypeProductInteraction` (screen and event
calls, linked because `identify` ties them to that id). Neither is used for
tracking. This is the manifest, and is separate from the App Store nutrition
labels above. `NSPrivacyTracking`
is `false` with no tracking domains. Re-audit this file if new
required-reason API usage (disk space, system boot time, active keyboards)
is added — App Store rejects an archive whose actual API usage isn't
covered. The four just-in-time usage strings App Store review expects
(`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
`NSSpeechRecognitionUsageDescription`,
`NSLocationWhenInUseUsageDescription`) were already set as
`INFOPLIST_KEY_*` build settings in `generate_project.rb` — verified
present in the exported `.ipa`'s `Info.plist`.
