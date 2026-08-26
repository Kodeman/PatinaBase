# D7 — Delivery, Verification & Analytics Infrastructure for Patina Field

Scope: `apps/mobile/Capture` (Patina Field, `cloud.patina.field`, scheme `field://`). Read-only research for the field-companion program. Every claim below is evidence-grounded from the repo as of the current checkout (`main`, working tree has uncommitted changes per `git status` at session start) plus one live PostHog query; inferences are marked explicitly.

---

## 1. The exact gate commands

Source: `.agents/skills/patina-ios-verification/SKILL.md`, `apps/mobile/Capture/scripts/capture-gate.sh`, `apps/mobile/Capture/README.md`.

```bash
cd apps/mobile/Capture
scripts/capture-gate.sh build   # regenerate project, xcodebuild build -scheme Capture, iphonesimulator, CODE_SIGNING_ALLOWED=NO
scripts/capture-gate.sh test    # regenerate project, xcodebuild test  -scheme CaptureKit (CaptureTests target, logic tests only)
scripts/capture-gate.sh lint    # swiftlint lint --quiet --strict, IF swiftlint is installed — otherwise prints "… swiftlint not installed; skipping" and still exits 0
scripts/capture-gate.sh all     # build; test; lint (default with no arg)
```

Full text of the script (`apps/mobile/Capture/scripts/capture-gate.sh`): it hardcodes `SIM="${CAPTURE_SIM:-iPhone 17}"`, always calls `ruby scripts/generate_project.rb` before build/test, and lint's pass is conditional on the CI runner having `swiftlint` on `PATH` — there is no repo-pinned/vendored swiftlint binary or Mint/Homebrew-lock file checked, so a runner without it silently "passes" lint. This is the same false-green pattern `patina-verification` warns about for other packages: a green `capture-gate.sh all` does not by itself prove lint ran.

There is **no `type-check`-only command** and no separate `--noEmit` step for Swift — `build` is the only type/compile gate (matches the general iOS pattern; Swift's compiler doesn't offer a NestJS-style noEmit check the repo wraps).

**Screenshot sweep** (`capture-shots.sh`) is a third, non-gating tool: pure `simctl`, no MCP, screenshots all 71 `CaptureScreenID`s (or a prefix-filtered subset) to `.build/shots/`. It is a visual-regression aid, not a pass/fail gate — nothing in the repo diffs its output against a baseline.

## 2. CI coverage reality

Source: `.github/workflows/policy-quality.yml` (the only workflow with iOS jobs — confirmed by grepping all of `.github/workflows/*.yml` for `ios|capture|swift|xcode`; `ai-quality-gate.yml`, despite root `AGENTS.md`/`CLAUDE.md` prose crediting it with "advisory iOS gates," has zero iOS-related lines. The iOS jobs live in `policy-quality.yml`, not `ai-quality-gate.yml` — a real drift between the root doc and the workflow files.).

```yaml
ios-patina:
  name: Patina iOS gate (advisory)
  needs: plan
  if: needs.plan.outputs.ios_patina == 'true'
  runs-on: macos-15
  steps: [checkout, apps/mobile/Patina/scripts/ios-gate.sh all]

ios-capture:
  name: Capture iOS gate (advisory)
  needs: plan
  if: needs.plan.outputs.ios_capture == 'true'
  runs-on: macos-15
  steps: [checkout, apps/mobile/Capture/scripts/capture-gate.sh all]
```

- Trigger condition (`scripts/hooks/core.mjs:364-368`): `ios_capture` flips true iff any changed path in the PR/push diff `startsWith("apps/mobile/Capture/")` — a plain path-prefix check, nothing smarter (doesn't fire for e.g. a shared design-kit package the app also consumes, if that package lives outside `apps/mobile/Capture/`).
- **Named "(advisory)" but nothing in the workflow YAML sets `continue-on-error: true` on either job** — the job step itself is a hard pass/fail like any other GitHub Actions step. Whether a failure actually blocks merge depends on GitHub branch-protection "required checks" configuration, which is not visible from the repo — I could not confirm from the filesystem alone whether "(advisory)" is enforced only by human review discipline (i.e., reviewers are told these can fail) or is genuinely non-blocking at the platform level. **Inference, not confirmed.**
- `integration.yml` (DB reset, SQL tests, edge-function tests, portal e2e) has **zero** iOS content and is `workflow_dispatch`/`workflow_call`/nightly-cron only per root `AGENTS.md` — it never touches Field.
- `deploy-production.yml` is `workflow_dispatch`-only; merging to `main` does not deploy Field (there is no Field "deploy" in the CI sense anyway — see §7).
- **`patina-testing` (`.agents/skills/patina-testing/SKILL.md`, 125 lines) has effectively no iOS content** — grepping it for `swift|xcuitest|xctest|mobile` returns only one line, and that line is about `admin-portal`'s Playwright mobile *viewport* projects (desktop×3/mobile×2/iPad), not iOS app testing. All iOS test guidance lives solely in `patina-ios-verification`; `patina-testing` should not be consulted for Field test-writing.
- No CaptureUITests are wired: a `CaptureUITests/` directory exists on disk but is **empty** (`find … -type f` returns nothing), and `generate_project.rb` only creates three real targets (`CaptureKit`, `CaptureKitMocks`, `Capture`) plus one test target (`CaptureTests`, `:unit_test_bundle`, added at line 129) — there is no `CaptureUITests` bundle target generated at all. So `capture-gate.sh test` only runs CaptureKit **logic** tests (18 files under `CaptureTests/`: `AnchorTests`, `AuthFlowTests`, `CaptureCoreTests`, `CaptureLifecycleTests`, `CaptureMediaPathTests`, `ContextCaptureTests`, `CoverageScorecardTests`, `FieldCapturePayloadTests`, `FieldCompanionPresentationTests`, `FieldExperienceTests`, `FieldPosedPhotoTests`, `FieldRasterEncodingTests`, `FieldScanUploadShadowLegTests`, `ManifestTests`, `MediaUploadIntentClientTests`, `PortalLoginTests`, `ProjectPlacementTests`, `SiteRequestTests`, `UploadStateTests`) — **no UI/XCUITest coverage exists for Field at all**, unlike Patina (client), which has a real `PatinaUITests` XCTest UI target per `patina-ios-verification`.

## 3. What a device pass requires, and who can run it

Source: `patina-ios-verification` steps 6-9, 12; `Capture/README.md` "On-device" section.

- **Compile-green (`capture-gate.sh build`) < sim-verified (`capture-run.sh` + blitz-iphone against a Simulator UDID) < device-verified (physical LiDAR/Pro iPhone).** The skill is explicit: Simulator proves compile/UI-only for hardware surfaces (camera, LiDAR/ARKit, Speech, DataScanner, Live Activity) — Simulator renders fallback UI for these, never the real sensor path.
- Simulator default = `CaptureKitMocks` (no camera/LiDAR/Speech/network needed to render all 71 screens); a physical device defaults to real services (`AppConfiguration.runsRealServices`); `-CaptureForceReal` forces real services in the Simulator (still no real hardware, just live network calls); `-CaptureUseMocks` forces mocks anywhere including a physical device.
- **Device pass mechanics** (`Capture/README.md`): one-time — set a signing team on the `Capture` target (already baked into `generate_project.rb`: `DEVELOPMENT_TEAM = 'VP22LXHT7L'`, "Kody's Apple Dev team," `CODE_SIGN_STYLE = 'Automatic'` — this survives every regen). Then `blitz-iphone setup_device <udid>` builds+installs WebDriverAgent on "Kody's Phone" (1-3 min, dev-mode already on per the doc). After that, drive the physical device exactly like the Simulator via the same blitz-iphone tool surface, always with the explicit device UDID.
- **Who can actually run a device pass**: only whoever holds "Kody's Phone" (or another device enrolled under team `VP22LXHT7L`) and can complete the WebDriverAgent trust/dev-mode dance once. There is no CI device farm, no cloud device lab reference anywhere in the repo — device-verified claims are inherently single-operator today (Kody, or an agent session with `blitz-iphone` access to his phone). This matches project memory's repeated "⚠ owed device walk/pass" pattern across nearly every shipped iOS program.
- **Explicit UDID discipline is load-bearing**: with a physical iPhone connected alongside a booted Simulator, `blitz-iphone`'s default `udid: "booted"` is ambiguous and can silently return an empty UI tree (`Capture/README.md` "Gotcha," and `patina-ios-verification` step 7 / its mistakes table).
- **Skills to load for a device pass**: `patina-ios-verification` (procedure + quality bar), `controlling-mobile-devices` (generic device-automation skill covering the `mcp__blitz-iphone__*` tool surface — `list_devices`/`get_execution_context`/`describe_screen`/`scan_ui`/`device_action`/`get_screenshot`/`launch_app`), `building-with-xcode` (raw `xcodebuild`/archive/signing mechanics if something beyond the wrapper scripts is needed), and `running-smoke-tests` (pass/fail HTML report generation if a device pass needs to produce shareable evidence). None of `.Codex/skills/asc-*` apply — `patina-ios-verification` states directly: "Capture (Patina Field) has no equivalent `.Codex/skills/` directory at all — no scoped ASC skill library exists for it yet."
- **Raster-fixture / capture-resolution runbook** (`Capture/README.md` "DEBUG Field raster qualification fixture," referencing `docs/design/field-capture/p2-r118-capture-resolution-fixture-runbook.md`) is the one documented physical-device evidence-capture procedure with exact `xcrun devicectl` commands (not `blitz-iphone`) — a template worth reusing for any future device-only qualification step the field-companion program needs (e.g. proving background-audio capture actually keeps recording with the screen locked).

## 4. `.xcodeproj` regeneration traps

Source: `generate_project.rb` (read in full), `patina-ios-verification` step 3, `Capture/README.md`.

- **The project is fully generated, never hand-edited.** `generate_project.rb` deletes `Capture.xcodeproj` outright (`FileUtils.rm_rf(PROJECT_PATH)`) and rebuilds it from a `Dir.glob(**/*.swift)` scan of `CaptureKit/`, `CaptureKitMocks/`, and `Capture/`. Any new/removed/renamed `.swift` file requires a regen — `capture-gate.sh` and `capture-run.sh`/`capture-shots.sh` do this automatically; a bare `xcodebuild` invocation does not, and will build against a stale target membership.
- Targets generated: `CaptureKit` (framework), `CaptureKitMocks` (framework), `Capture` (app), `CaptureTests` (`:unit_test_bundle`, linking `CaptureKit` only, no app host). **`CaptureShareExtension/` and `CaptureWidgets/` exist as empty directories on disk and are referenced in prose (`README.md`: "Team F (Phase 1)") but are wired into NO target at all** — `generate_project.rb`'s only `new_target` calls are the four above. Building a share extension or a widget for the field-companion program (e.g. a share-sheet capture entry, or a Live-Activity-style widget) means adding real target-generation code to this script, not just dropping Swift files in those folders.
- Deployment target `18.0` fixed as a Ruby constant (`DEPLOYMENT = '18.0'`); Swift version `5.0` fixed in `common!`. `TARGETED_DEVICE_FAMILY = '1,2'` (iPhone+iPad), `SDKROOT = 'iphoneos'`, `SUPPORTED_PLATFORMS = 'iphoneos iphonesimulator'`.
- Signing: `CODE_SIGN_STYLE = 'Automatic'`, `DEVELOPMENT_TEAM = 'VP22LXHT7L'` baked into every target's build settings by the generator — this is why a device build works out of a fresh regen without per-checkout Xcode signing setup.
- Remote SPM packages are linked **app-target only** by explicit architectural rule (comment in the script): `supabase-swift` (≥2.40.0) and `posthog-ios` (≥3.48.0, `PostHog` product). `CaptureKit`/`CaptureKitMocks`/`CaptureTests` must NOT link these — feature teams code against the `CaptureAnalytics`/session seams, SDK usage stays app-side. A local SPM package, `PatinaDesignKit` (design tokens only, no SDKs), links into both the app and `CaptureKit` (safe because its product is `.dynamic`).
- `Secrets.example.swift` is explicitly excluded from the generated `Capture` group (`exclude: ['Secrets.example.swift']`) so it never accidentally compiles into the app target twice alongside the real `Secrets.swift`.

## 5. `Secrets.swift` handling

Source: `Capture/App/Configuration/Secrets.example.swift`, `Secrets.swift` (present, untracked, in this checkout), `AppConfiguration.swift`, `patina-ios-verification` step 4.

- Gitignored, per-checkout, template `Secrets.example.swift` in the same directory (`Capture/Capture/App/Configuration/`). **Does not follow `git worktree add`** — a fresh worktree needs it copied in manually before any build:
  ```bash
  cp apps/mobile/Capture/Capture/App/Configuration/Secrets.example.swift \
     apps/mobile/Capture/Capture/App/Configuration/Secrets.swift
  ```
- Two fields only: `supabaseAnonKey` (String, required — the `api.patina.cloud` anon/publishable key for Strata) and `postHogAPIKey` (`String?`, optional — `nil` keeps PostHog fully inert). **This checkout's actual `Secrets.swift` has `postHogAPIKey: String? = nil`** — see §6, this is directly why Field analytics currently produces zero events.
- `AppConfiguration.postHogAPIKey` (line ~130) resolves as `Secrets.postHogAPIKey ?? ProcessInfo.processInfo.environment["POSTHOG_API_KEY"] ?? ""` — so a build-time/launch-time env var can supply the key without touching `Secrets.swift`, but **neither `capture-gate.sh` nor `capture-run.sh` nor `capture-shots.sh` nor the CI `policy-quality.yml` job sets `POSTHOG_API_KEY`** — grepped, absent everywhere in the repo's own scripts/workflows. So the env-var fallback is a real seam but currently unused by any repo-owned automation.
- `postHogHost` defaults to `https://us.i.posthog.com`, overridable via `POSTHOG_HOST` env var — same US-cloud host the client app (`Patina`) and the marketing web analytics use (cross-ref project memory's `us-assets.i.posthog.com` CSP note for the web side).
- Contrast: `Patina/` (client app)'s own `Secrets.swift` **does** set a real `postHogAPIKey` — `"phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG"` — which is the exact token for the org's one ingesting PostHog project ("Patina Website", id 326191; confirmed via the PostHog `projects-get` API in §6). This is strong circumstantial evidence that when Field's key IS eventually set, it will point at the same shared project (there is no second, Field-specific PostHog project in the org — the only other project, "Default project" id 325603, has never ingested a single event, `ingested_event: false`).

## 6. Analytics state — PostHog wiring, event catalog, and live-data check

Source: `CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift`, `Capture/Services/Analytics/PostHogCaptureAnalytics.swift`, `AppContainer.swift`, plus a live PostHog `execute-sql` query against the org's only ingesting project.

**The seam.** `CaptureAnalytics` (public protocol in `CaptureKit`, SDK-free) exposes exactly four calls: `screen(name, properties)`, `event(name, properties)`, `identify(userID)`, `identify(userID, properties)`. `AppContainer` wires `PostHogCaptureAnalytics()` in real mode and `MockCaptureAnalytics()` (in `CaptureKitMocks`, no-op) in mock mode. `PostHogCaptureAnalytics` (app-side only, `import PostHog`) does a run-once lazy `isEnabled` check: if `AppConfiguration.postHogAPIKey.isEmpty`, it logs "PostHog disabled — no API key configured; analytics is a no-op" once and every subsequent call is a silent no-op — otherwise it calls `PostHogSDK.shared.setup(...)`, sets `captureScreenViews = false` (screens are sent manually via the seam, not autocaptured), `captureApplicationLifecycleEvents = true`, and registers a super-property `["surface": "field-ios"]` on every event.

**The event catalog (grepped from `.event("...")` call sites across the whole `Capture/` + `CaptureKit/` tree, 75 call sites, 64 distinct event names):**
```
account.sign_in.failed / .started / .succeeded, account.sign_out, account.sync_now,
capture, capture.mode, capture.multishot, capture.open_settings, capture.photo_import,
decisions.open, field.companion_action, field.companion_opened,
leads.open_result, library.open_result, library.scope,
messages.open_thread, messages.send,
N1.merge, N2.use-match, N3.add-dimensions, N4.attach, N5.accept,
projects.open_project,
Q1.detected, Q1.login-detected, Q1.parse-failed, Q2.approve-error, Q2.approve-success, Q2.approve-tapped, Q2.reject,
receiving.inspection_submit,
scan.upload_finish_later, scan.upload_rejected_finish_later,
settings.action_button_rebind,
siteScan.anchor.add, siteScan.anchor.done, siteScan.cancel, siteScan.finish, siteScan.start,
siteScan.upload_failure, siteScan.upload_success,
spec_book.capture_placement.fail, spec_book.capture_placement.ok, spec_book.capture_route_selected,
sync.commit.deferred, sync.commit.fail, sync.commit.ok, sync.drain.done, sync.drain.start,
sync.enqueue, sync.open_row, sync.retry_all, sync.retry_scan, sync.retry_scan_failed,
sync.retry_scan_succeeded, sync.review_scan, sync.route,
work.open, work.open_attention, work.open_browse, work.refresh, work.retry, work.switch_to_camera
```
Plus 7 `.screen("...")` call sites (screen-view tracking is manual per the `captureScreenViews = false` setting above). Identify is wired: `AppContainer.identifyRestoredSession` calls `analytics.identify(uid, properties: ["role": "designer", "platform": "ios"])` once a session is restored.

This is a genuinely rich, already-designed taxonomy — the field-companion program can extend it (new `field.*`/`voice.*`/`companion.*` event names) rather than invent a scheme from scratch.

**Live-data check (the actual finding).** Queried the org's PostHog directly via `mcp__plugin_posthog_posthog__exec` (`execute-sql` against `events`, only project with `ingested_event: true` is "Patina Website" id 326191 — the org has exactly two projects, and the other, "Default project" id 325603, has never ingested anything):

- `properties.$lib = 'posthog-ios'` over the last 90 days: **6,928 events** exist — so *some* iOS app is definitely sending data.
- Breaking that down by the `surface` super-property Field's own code registers (`"surface": "field-ios"`): **100% of those 6,928 events are `surface = 'patina-ios'` (6,017) or `surface = NULL` (911, all before 2026-08-03 — pre-dates the surface tag)**. **Zero rows have `surface = 'field-ios'`.**
- Cross-checked directly by event name: none of `siteScan.start`, `capture.mode`, `work.open`, `Q2.approve-success`, `sync.commit.ok`, `field.companion_opened` exist anywhere in the project's event taxonomy over the last 180 days (PostHog's own taxonomy-warning system flagged all six as unknown event names, zero rows returned).

**Conclusion: Patina Field has never sent a single analytics event to PostHog, at least within the last 180 days, and very likely never (given the `nil` default in `Secrets.example.swift` and this checkout's `Secrets.swift`).** The instrumentation code is fully built and reasonably thorough (64 event names, screen tracking, identify) — the gap is purely operational: nobody has ever shipped a Field build with a real `postHogAPIKey` set. This is a clean, low-risk first move for the field-companion program (set the key, ship one build, confirm `surface = 'field-ios'` rows start appearing) before building anything new on top of the analytics seam.

## 7. Feature-flag mechanism

Source: grep across `apps/mobile/Capture` and `apps/mobile/Patina` for `isFeatureEnabled|FeatureFlag|featureFlag`.

- **Field (`Capture/`) has NO feature-flag mechanism at all today.** Zero matches anywhere in the tree (Swift or otherwise). The `CaptureAnalytics` protocol doesn't even expose an `isFeatureEnabled`-shaped method — only `screen`/`event`/`identify`. Even though `posthog-ios` (which does support remote feature flags) is already linked at the app target and `PostHogSDK.shared` is already initialized in `PostHogCaptureAnalytics`, nothing in the codebase calls `PostHogSDK.shared.isFeatureEnabled(...)` — the capability is present in the SDK but unused and not exposed through the seam.
- **Contrast with `Patina` (client app), which DOES use it**: `AppCoordinator.swift` calls `PostHogService.shared.isFeatureEnabled("ios_screen_name_v2")` directly (not through a shared cross-app abstraction — `Patina` and `Capture` each have their own independent PostHog wrapper). This is the pattern to port if the program wants PostHog-flag-gated Field rollout: extend `CaptureAnalytics` with an `isFeatureEnabled(_:)` method, implement it in `PostHogCaptureAnalytics` (trivial — the SDK already there), and add a matching stub to `MockCaptureAnalytics` (defaulting flags off in Simulator/mock runs, matching the portal convention of fail-closed flags per project memory's `reference_feature_flags.md`).
- **No compile-time flag mechanism either** (no `#if FIELD_COMPANION` -style build-setting-driven conditional compilation scaffold visible in `generate_project.rb` beyond the existing `-Capture*` launch-argument flags, which are a *runtime* dev/test harness, not a rollout mechanism — `-CaptureForceReal`, `-CaptureUseMocks`, `-CaptureScreen <id>`, `--uitesting`/`-CaptureUITest`). Those launch args are useful for internal dev-loop and screenshot sweeps but are not a shippable staged-rollout primitive (a TestFlight/App Store build ships with a fixed launch-argument set, so end users can't be split by them).
- **Bottom line for the program**: any new field-companion capability that should ship gated needs new plumbing — either (a) port the `isFeatureEnabled` pattern from `Patina` onto `CaptureAnalytics`/`PostHogCaptureAnalytics` (fastest, reuses the already-linked SDK), or (b) a bespoke remote-config table read at launch (heavier, no existing precedent in either iOS app). No flag mechanism exists today that a new Field feature could simply flip on.

## 8. Permissions / entitlements checklist for the program's likely asks

Source: `generate_project.rb` `INFOPLIST_KEY_*` settings (the actual, generated Info.plist keys — the on-disk `Capture/Info.plist` only carries the URL-scheme dict, everything else is generated), `Capture/Capture.entitlements`.

**Already present** (verified in `generate_project.rb`, lines ~78-97):
| Key | Value | Covers |
|---|---|---|
| `NSCameraUsageDescription` | "…photograph products and read their labels, barcodes, and dimensions." | Camera |
| `NSMicrophoneUsageDescription` | "Used to record a quick voice note about a piece." | **Microphone — already present**, worded for the existing N4/F2 voice-note flows |
| `NSSpeechRecognitionUsageDescription` | "Transcribes your voice notes on-device." | **Speech recognition — already present** |
| `NSPhotoLibraryAddUsageDescription` / `NSPhotoLibraryUsageDescription` | save / import | Photo library |
| `NSLocationWhenInUseUsageDescription` | "Stamps each capture with the venue where you found it." | **Location — When-In-Use only** |
| `NSMotionUsageDescription` | level guide | Motion |
| `NSFaceIDUsageDescription` | unlock with Face ID | Biometric (used by Q2 QR-approve flow) |

**Already present, entitlements** (`Capture.entitlements`): App Group `group.cloud.patina.field` (shared with `CaptureWidgets`/`CaptureShareExtension` if those ever get built — see §4), `com.apple.developer.applesignin` (`Default`), `com.apple.developer.associated-domains` (`applinks:client.patina.cloud`).

**Not present — needed if the program wants any of these:**
- **Background audio recording** (e.g. capturing a voice note or ambient walkthrough narration with the screen locked or app backgrounded): no `UIBackgroundModes` key of any kind is set anywhere (`generate_project.rb` has zero `UIBackgroundModes` lines; `Info.plist` itself carries only the URL scheme). Today's `SpeechVoiceNoteService` (`AVAudioSession.setCategory(.record, mode: .measurement, options: .duckOthers)`) will stop recording the moment the app backgrounds/locks — confirmed by the absence of an `audio` background mode. Adding this needs both the `UIBackgroundModes: [audio]` Info.plist key (or the newer `BGContinuedProcessingTask` API family) and re-verification that `AVAudioSession` category survives backgrounding.
- **App Intents / Siri / Shortcuts** (e.g. "log a voice note" as a Shortcut, widget, or Lock Screen/Action Button intent — the F1/O flows already reference "Action Button" rebind (`settings.action_button_rebind` event exists) but that is iOS's native customizable-button-to-app-shortcut, NOT the `AppIntents` framework): zero `import AppIntents`/`import Intents` anywhere in the tree, no `NSUserActivityTypes` Info.plist key, no App Intents extension target (and no extension target infrastructure exists at all per §4's `CaptureShareExtension`/`CaptureWidgets` finding — an App Intents-driven widget/Shortcut would need its own generated target, following the same pattern the script would need to grow for those two placeholder directories).
- **"Always" location** (if the program wants geofenced site-visit detection rather than point-in-time "where I captured this"): only `NSLocationWhenInUseUsageDescription` exists; `NSLocationAlwaysAndWhenInUseUsageDescription`/`NSLocationAlwaysUsageDescription` are absent, and there's no `UIBackgroundModes: [location]` either. Apple's App Review bar for Always-location justification is high — worth scoping down to When-In-Use + a manual "I've arrived" affordance unless background geofencing is a hard requirement.
- **Background App Refresh / BGTaskScheduler** for e.g. deferred sync-drain or a background transcription queue: no `BGTaskSchedulerPermittedIdentifiers` key, no `import BackgroundTasks` found.

## 9. Distribution / TestFlight facts

Source: `docs/design/field-capture/m4-pilot-checklist.md`, `docs/ops/wave1-prod-reconciliation-plan.md`, `docs/design/workflow-alignment/HANDOFF.md`, `patina-ios-verification`.

- **No App Store Connect skill library exists for Field.** `patina-ios-verification` states this directly: the 25 `asc-*` skills (`asc-release-flow`, `asc-testflight-orchestration`, `asc-xcode-build`, `asc-metadata-sync`, `asc-crash-triage`, `asc-signing-setup`, etc.) live under `apps/mobile/Patina/.Codex/skills/` and are scoped to the **client** app only. Field has no `.Codex/skills/` directory at all.
- The one place TestFlight is even mentioned for Field (`m4-pilot-checklist.md` line 66) treats it as an **either/or with a direct device install** ("TestFlight or a direct device install; confirm `field://login`…") — i.e. not a committed pipeline, just an acknowledged option for pilot distribution.
- The repo's actual operative pattern for "did this fix ship" is **commit-presence-in-a-build**, not a TestFlight release train: `docs/ops/wave1-prod-reconciliation-plan.md` (§ around line 577-603) gates a prod migration (`00444`/`00471`) on "a Patina Field release containing `cbe88574`" existing and being **archived** (unspecified where/how — no `.ipa`/`.xcarchive` artifact path or CI archive step exists in the repo for Capture), verified via `git merge-base --is-ancestor cbe88574 <release-tag>`. This implies release tags are used informally for Field builds, but there's no workflow file, script, or fastlane config anywhere under `apps/mobile/Capture` that cuts such a tag or archive automatically — it reads as a manual, ad hoc process each time.
- **No `fastlane`, `Fastfile`, or automated archive/export/upload script exists under `apps/mobile/Capture`** (confirmed: `generate_project.rb`/`capture-gate.sh`/`capture-run.sh`/`capture-shots.sh` are the entire `scripts/` directory — none does archive/export/upload). Any TestFlight distribution today would be a fully manual Xcode Organizer archive-and-upload, by whoever has the signing team's App Store Connect access.
- **No evidence in the repo of a `cloud.patina.field` App Store Connect app record actually existing** (no ASC app-id, no bundle-id provisioning doc, nothing under `docs/` naming a Field ASC listing) — this could not be confirmed or ruled out from the filesystem alone; the absence of any `asc-*` Field skill and the "TestFlight or direct install" hedge both point toward "not yet set up," but this is an inference, not a direct finding.

## 10. `patina-parallel-work` relevance for this program

Nothing Field-specific in `patina-parallel-work` itself — it's the general worktree/commit-hygiene skill (worktrees named `agent-<id>` under `.gitignore`'s `agent-*/` rule; `pnpm install` + `pnpm turbo build --filter=<pkg>...` bootstrap; pathspec-only commits; `git merge-base --is-ancestor` before trusting any "is this merged" claim). Two things specifically bite iOS work per that skill and cross-referenced project memory: (1) `Secrets.swift` does not follow `git worktree add` (§5, repeated here because it is the single most common first-build failure for a fresh agent worktree); (2) project memory's `feedback_shared_checkout_subagent_pinning.md` and `feedback_capture_pbxproj_regen_worktree_trap.md` (referenced in memory, not independently re-read this session — flagging as a pointer, not a re-verified claim) note a fresh-worktree `generate_project.rb` regen can drop the gitignored `Secrets.swift` if the copy-in step is skipped or ordered wrong; treat as a known trap to sequence correctly (copy secrets in *before* first regen/build) when dispatching parallel Field-touching agents.

---

## Summary of what's ready vs. missing for the field-companion program

**Ready / reusable as-is:**
- Solid gate scripts (`capture-gate.sh`), dev loop (`capture-run.sh`), and screenshot sweep (`capture-shots.sh`), all self-regenerating.
- A working, non-trivial voice-note-with-transcription stack (`SpeechVoiceNoteService`: on-device `SFSpeechRecognizer` + `AVAudioEngine`, live partial transcripts, audio file retained alongside text) already wired into two flows (N4 specimen capture, F2 site-scan context-capture) — more complete than an older project-memory note ("audio-write seam TODO") suggested; that note describes an earlier state this code has since superseded.
- Microphone + speech-recognition Info.plist strings already shipped.
- A rich, already-designed 64-event PostHog taxonomy and a clean `CaptureAnalytics` seam ready to extend.
- `posthog-ios` SDK already linked and initialized app-side.

**Missing / to build:**
- PostHog is fully wired but **inert in practice** — no build has ever shipped with a real key (0 events in 180 days, live-verified). This is a one-line fix (set `postHogAPIKey`) plus a shipped build, not new engineering.
- **No feature-flag mechanism** for Field (unlike the client app, which already uses PostHog flags) — needs `isFeatureEnabled` added to the `CaptureAnalytics` seam.
- **No UI test coverage** (`CaptureUITests` is an empty, unwired placeholder) and **no CI job runs Field's tests with certainty of enforcement** ("(advisory)" naming with no confirmed non-blocking config).
- **No background-audio, App Intents, "Always" location, or BGTaskScheduler entitlements/keys** — all four are blank slates if the program needs any of them; App Intents in particular needs a new generated extension target (mirroring the still-unbuilt `CaptureShareExtension`/`CaptureWidgets` placeholders) since none of that scaffolding exists in `generate_project.rb` today.
- **No TestFlight pipeline, no fastlane, no confirmed ASC app record, no ASC skill library** for Field — distribution today is manual device installs or an undocumented manual TestFlight upload; this is the biggest gap if the program needs to get builds onto a wider pilot group of designers/trades rather than Kody's own device.

## Files read / cited this session
- `.agents/skills/patina-ios-verification/SKILL.md`
- `.agents/skills/patina-verification/SKILL.md`
- `.agents/skills/patina-testing/SKILL.md`
- `.agents/skills/patina-parallel-work/SKILL.md`
- `apps/mobile/Capture/scripts/capture-gate.sh`, `capture-run.sh`, `capture-shots.sh`, `generate_project.rb`
- `apps/mobile/Capture/README.md`, `apps/mobile/CLAUDE.md`
- `.github/workflows/policy-quality.yml`, `ai-quality-gate.yml` (grep, no hits), `integration.yml` (grep, no hits)
- `scripts/hooks/core.mjs` (iosCapture/iosPatina classification)
- `apps/mobile/Capture/Capture/Info.plist`, `Capture/Capture.entitlements`
- `apps/mobile/Capture/Capture/App/Configuration/{Secrets.example.swift,Secrets.swift,AppConfiguration.swift}`
- `apps/mobile/Capture/Capture/App/Composition/AppContainer.swift`
- `apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift`
- `apps/mobile/Capture/Capture/Services/Analytics/PostHogCaptureAnalytics.swift`
- `apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift`
- `apps/mobile/Capture/Capture/Features/SiteScan/SiteScanContextCapture.swift`
- `apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift` (PostHog flag comparison)
- `docs/design/field-capture/m4-pilot-checklist.md`, `field-capture-p2-package.md`
- `docs/design/workflow-alignment/HANDOFF.md`, `docs/ops/wave1-prod-reconciliation-plan.md` (TestFlight/`cbe88574` grep)
- Live PostHog query via `mcp__plugin_posthog_posthog__exec` against org project "Patina Website" (id 326191) — `projects-get`, `execute-sql` ×3
