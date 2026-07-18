# Patina Field (T-03)

**Patina Field** is a standalone camera-first iOS app — it turns a physical
object in a showroom into a structured, located, synced **specimen**. Spec:
`docs/design/ios-Capture/patina-mobile-ux-flow.html`. Plan:
`~/.claude/plans/review-the-design-document-greedy-engelbart.md`.

Phase 2 layered a second surface onto the same app — **Work** — for
designers and trades: a Work dashboard, their projects, open leads,
read-only pending decisions, a messages inbox, on-site PO receiving,
Face-ID-gated QR portal-login approval, and a pro LiDAR site-scan flow that
attaches a scan to a project. The 8 Work flows (18 screens) sit alongside
the original 8 capture flows (33 screens) — one `CaptureScreenID` enum, one
harness, one set of dev-loop scripts drives all 71.

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
| 15 | Pro site-scan | F1 scan-setup · F2 site-scan · F3 scan-review · F4 scan-upload |
| 16 | Site Request P1 | SR01 site-hub → SR12 Binder history · SR13 guest-landing → SR20 returned item |

Flows 0–7 are the original 33 screens; flows 8–15 are the 18 Work-flow
screens added in Phase 2 plus 20 P1 Site Request screens (71 total). Screen ids are defined once, in
`CaptureKit/CaptureKit/Support/CaptureScreenID.swift`, and are what
`capture-run.sh`, `capture-shots.sh`, and the `-CaptureScreen` launch flag
key off (see Dev loop, below).

## Architecture

- **`CaptureKit/`** — embedded framework: the frozen shared substrate (domain
  `@Model`s, service protocols, state machine, navigation, design tokens, Live
  Activity attributes). Built by the foundation owner; teams code against it.
- **`CaptureKitMocks/`** — mock conformer for every seam, so all screens render
  in the Simulator without camera/LiDAR/Speech/network.
- **`Capture/`** — the app target (all 71 screens, Features/ per flow).
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
Migration `00258` adds the Work flows' site-scan linkage: `room_scans` gets
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
scripts/capture-run.sh C5.specimen-sheet  # jump straight to any of the 71 screens
CAPTURE_SIM="iPhone 17 Pro" scripts/capture-run.sh N3.measure

# SWEEP — screenshot every screen (pure simctl, no MCP) → .build/shots/
scripts/capture-shots.sh                  # all 71
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
