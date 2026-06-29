# Patina Field Capture (T-03)

Standalone camera-first iOS app — turns a physical object in a showroom into a
structured, located, synced **specimen**. Spec:
`docs/design/ios-Capture/patina-mobile-ux-flow.html`. Plan:
`~/.claude/plans/review-the-design-document-greedy-engelbart.md`.

## Architecture

- **`CaptureKit/`** — embedded framework: the frozen shared substrate (domain
  `@Model`s, service protocols, state machine, navigation, design tokens, Live
  Activity attributes). Built by the foundation owner; teams code against it.
- **`CaptureKitMocks/`** — mock conformer for every seam, so all screens render
  in the Simulator without camera/LiDAR/Speech/network.
- **`Capture/`** — the app target (all 32 screens, Features/ per flow).
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
