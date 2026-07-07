# Patina Field (T-03)

**Patina Field** is a standalone camera-first iOS app — it turns a physical
object in a showroom into a structured, located, synced **specimen**. Spec:
`docs/design/ios-Capture/patina-mobile-ux-flow.html`. Plan:
`~/.claude/plans/review-the-design-document-greedy-engelbart.md`.

## Architecture

- **`CaptureKit/`** — embedded framework: the frozen shared substrate (domain
  `@Model`s, service protocols, state machine, navigation, design tokens, Live
  Activity attributes). Built by the foundation owner; teams code against it.
- **`CaptureKitMocks/`** — mock conformer for every seam, so all screens render
  in the Simulator without camera/LiDAR/Speech/network.
- **`Capture/`** — the app target (all 51 screens, Features/ per flow).
- `CaptureShareExtension/`, `CaptureWidgets/` — Team F (Phase 1).

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

## Backend

Field-capture migrations `supabase/migrations/00232`–`00235`
(`field_captures` inbox + `capture-media` bucket + `commit_field_capture` RPC).

## Dev loop (Claude Code ↔ Xcode)

Two scripts close the loop between code and a running app. Both regenerate the
project first, so edits to any `.swift` file are picked up automatically.

```bash
# VERIFY — build + unit tests + lint (CI gate)
scripts/capture-gate.sh            # or: build | test | lint

# RUN — generate → build → boot sim → install → launch
scripts/capture-run.sh                    # real entry (viewfinder / onboarding)
scripts/capture-run.sh C5.specimen-sheet  # jump straight to any of the 51 screens
CAPTURE_SIM="iPhone 17 Pro" scripts/capture-run.sh N3.measure

# SWEEP — screenshot every screen (pure simctl, no MCP) → .build/shots/
scripts/capture-shots.sh                  # all 51
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
