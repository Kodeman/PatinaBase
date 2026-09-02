# G — gate runner ledger (Patina iOS TestFlight-polish AUDIT, 2026-09-01)

READ-ONLY run. No code edits, no git writes, no production writes. Machine: Xcode 26.6 (17F113),
`/Applications/Xcode.app`. Test destination: clone **P** `BD8D6AC8-BA6C-484B-B819-6E671FA72D8D`
(tfp-P, booted). Repo tip at run time: `d7287c3f8` (+ the tracked generated file `GitCommit.swift`
rewritten by the Debug build, so the worktree stamps `d7287c3f+`).

All claims below are **compile-green / gate-verified** level. Nothing here is device-verified.

## Artifacts on disk

| what | path |
| --- | --- |
| unit tier log | `artifacts/ios-testflight-polish-2026-09-01/research/G-unit.log` (4.5 MB) |
| UI tier log | `artifacts/ios-testflight-polish-2026-09-01/research/G-ui.log` (265 KB) |
| Release compile log | `artifacts/ios-testflight-polish-2026-09-01/research/G-release.log` (2.6 MB) |
| archive dry-run log | `artifacts/ios-testflight-polish-2026-09-01/research/G-archive.log` (2.8 MB) |
| swiftlint JSON | `artifacts/ios-testflight-polish-2026-09-01/research/G-lint.json` (334 KB) |
| Assets.car dump | `artifacts/ios-testflight-polish-2026-09-01/research/G-assets.json` |
| Release build settings | `artifacts/ios-testflight-polish-2026-09-01/research/G-buildsettings-release.txt` |
| unit xcresult | `artifacts/ios-testflight-polish-2026-09-01/.build/dd-gate/Logs/Test/Test-Patina-2026.09.01_17-57-54--0500.xcresult` (159 MB) |
| Debug DerivedData (steward's) | `artifacts/ios-testflight-polish-2026-09-01/.build/DerivedData` |
| Debug build log (steward's) | `artifacts/ios-testflight-polish-2026-09-01/.build/xcodebuild.log` |

---

## 1. Unit tier — PASS

```
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=BD8D6AC8-BA6C-484B-B819-6E671FA72D8D' \
  -only-testing:PatinaTests -derivedDataPath .../.build/dd-gate
```

- `** TEST SUCCEEDED **`, exit **0**.
- `✔ Test run with 1523 tests in 164 suites passed after 4.733 seconds.`
- **0 failures**, 0 `✘` lines, 163 `✔ Suite` lines, no skipped tests, no Known Issues.
- Matches the 1523-test count recorded by the Daily Return program — nothing has rotted.

Wall clock is the problem, not the result: `IDETestOperationsObserverDebug: 610.538 elapsed --
Testing started completed.` The tests take **4.7 s**; the run takes **610 s** because of

```
IDETestOperationsObserverDebug: Failure collecting diagnostics from simulator:
Timed out after 600.0 seconds while waiting for a response from the invoked process
```

`simctl diagnose -l -b --timeout=600` was spawned by xcodebuild at the end of the run and never
answered, so every run pays a flat 10-minute tax after the last assertion. (Observed once, on a
clone the walkers had been driving; may be device-state-specific → G-10, confidence 0.55.)

Build warnings in this run: **1604** total, **1330** of them
`… this is an error in the Swift 6 language mode`; 169 distinct warning texts.

## 2. UI tier — FAIL (7 of 11)

```
… -only-testing:PatinaUITests …
```

`** TEST FAILED **`, exit **65**. `Executed 11 tests, with 7 failures (0 unexpected) in 113.036 s`.
Total wall clock 146 s — comfortably inside the 20-minute budget; no timeout.

| test | result |
| --- | --- |
| `FirstLaunchUITests.testDriftAction` | **failed** (10.97 s) |
| `FirstLaunchUITests.testHappyPath` | **failed** (9.53 s) |
| `FirstLaunchUITests.testLaunchPerformance` | **failed** (12.27 s) |
| `FirstLaunchUITests.testNotYetPath` | **failed** (9.66 s) |
| `FirstLaunchUITests.testThresholdToWalkInvitationTransition` | **failed** (9.27 s) |
| `FirstLaunchUITests.testThresholdUI` | **failed** (9.71 s) |
| `FirstLaunchUITests.testWalkInvitationUI` | **failed** (9.58 s) |
| `PatinaUITests.testExample` | passed (2.74 s) |
| `PatinaUITests.testLaunchPerformance` | passed (31.48 s) |
| `PatinaUITestsLaunchTests.testLaunch` | passed (3.91 s) |
| `PatinaUITestsLaunchTests.testLaunch` (2nd UI config) | passed (3.92 s) |

All seven failures are the same root cause — the first screen the suite waits for does not exist:

```
PatinaUITests/Helpers/FirstLaunchTestHelpers.swift:99: error:
  -[PatinaUITests.FirstLaunchUITests testHappyPath] : XCTAssertTrue failed - Threshold should appear
PatinaUITests/FirstLaunchUITests.swift:121: error:
  -[PatinaUITests.FirstLaunchUITests testThresholdUI] : XCTAssertTrue failed - Threshold enter button should appear
```

The helper waits on `otherElements["threshold.enterButton"]`. **That accessibility identifier
appears nowhere in the app source** (`grep -rn "threshold.enterButton" apps/mobile/Patina/Patina`
→ 0 hits). The suite is written against the old first-launch spec
(`docs/specs/_active/mobile-first-launch.md`: Threshold → Walk Invitation → Camera Permission →
Walk → Emergence) and asserts literal copy such as `"Every room\ntells a story."`,
`"Shall we walk your space together?"`, `"I'd love to see where you live."`.

`git log -- apps/mobile/Patina/PatinaUITests/FirstLaunchUITests.swift` returns exactly one commit:
`9a3209bf2 chore: initial monorepo setup for Patina platform`. Same for the helpers. The suite has
never been touched since the repo was created, while the first-run flow moved on.

The four passing tests are the **unmodified Xcode template stubs** — `testExample` launches the app
and asserts nothing; `testLaunchPerformance` is `measure { XCUIApplication().launch() }`;
`testLaunch` takes a screenshot. Net: the UI tier currently has **zero passing assertions about
the product**, on exactly the first-run path this TestFlight round exercises.

One usable number fell out of it: `measured [Duration (AppLaunch), s] average: 2.131,
relative standard deviation: 3.698%` — Debug build, simulator, no launch arguments, so it is not a
Release cold-launch figure, but it is the only launch measurement any gate produces.

## 3. Release compile — **FAIL**

```
xcodebuild build … -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

`** BUILD FAILED **`, exit **65**, `(3 failures)`. Six compiler errors, all the same shape:

```
Patina/Features/Home/Views/AddToRoomSheet.swift:98:26:      error: type 'Product'     has no member 'previewProducts'
Patina/Features/Home/Views/AddToRoomSheet.swift:99:28:      error: type 'RoomSummary' has no member 'mockAll'
Patina/Features/Home/Views/DailyStoryCard.swift:132:28:     error: type 'DailyStory'  has no member 'preview'
Patina/Features/Home/Views/DailyStoryDetailView.swift:214:72: error: type 'Product'   has no member 'previewProducts'
Patina/Features/Home/Views/DailyStoryDetailView.swift:214:38: error: type 'DailyStory' has no member 'preview'
Patina/Features/ProductDetail/Views/ProductDetailView.swift:693:40: error: type 'Product' has no member 'previewProducts'
```

Root cause: the fixtures are `#if DEBUG`-gated, the `#Preview` blocks that use them are not.
`ProductModel.swift:361` even says so:

```swift
// `previewProducts` is intentionally `#if DEBUG`-gated and only used by
// SwiftUI `#Preview` blocks. …
#if DEBUG
extension Product { static let previewProducts: [Product] = [ … ]
```

`ENABLE_PREVIEWS = NO` in Release does **not** strip a `#Preview` macro body — it still expands
and type-checks. `SWIFT_COMPILATION_MODE = wholemodule` in Release, so all module-wide errors were
reported in one pass: the break is bounded to **4 files / 6 call sites**.

Census of the whole app (script over all 435 Swift files): 92 `#Preview` blocks, 8 inside
`#if DEBUG`, 84 outside. Cross-checking the 84 against the 18 `#if DEBUG`-declared static members
yields exactly the 4 offending files — the other candidate hits (`InvoiceDetailView`,
`ProjectDetailView`, `StudioIdentityLine`, `DecisionDetailView`, `ThreadDetailView`,
`ProposalDetailView`) all pass the *string literal* `"preview"` as an id, not `.preview`. So
fixing these four files should clear the configuration.

Release-specific warnings: **none**. 222 warning lines / 103 distinct texts in the Release log,
all of which also appear in the Debug log (`comm -13` of the deduped sets is empty). The Release
log is shorter only because the build aborted at the app target's Swift compile.

Two build-phase notes, both configurations:

```
note:    Run script build phase 'Stamp Git SHA' will be run during every build because the option
         to run the script phase "Based on dependency analysis" is unchecked.
warning: Run script build phase 'SwiftLint' will be run during every build because it does not
         specify any outputs.
```

## 4. Full lint — 933 violations (512 warning / **421 error**)

```
cd apps/mobile/Patina && swiftlint lint --quiet --config .swiftlint.yml --reporter json
```

swiftlint 0.63.2, 2.5 s, **exit 2** (error-severity violations present). 144 distinct files.
One config warning: `Found a configuration for 'line_length' rule, but it is disabled in 'disabled_rules'.`

Top 15 rules:

| n | rule | severity split |
| ---: | --- | --- |
| 532 | `identifier_name` | 396 error / 136 warning |
| 67 | `trailing_comma` | warning |
| 59 | `redundant_string_enum_value` | warning |
| 48 | `disallow_font_custom_in_features` (custom, PT-1-1) | warning |
| 30 | `nesting` | warning |
| 26 | `implicit_optional_initialization` | warning |
| 25 | `function_body_length` | 4 error / 21 warning |
| 21 | `modifier_order` | warning |
| 20 | `file_length` | 2 error / 18 warning |
| 18 | `multiple_closures_with_trailing_closure` | warning |
| 13 | `type_body_length` | 4 error / 9 warning |
| 11 | `vertical_parameter_alignment_on_call` | warning |
| 10 | `cyclomatic_complexity` | 3 error / 7 warning |
| 9 | `function_parameter_count` | 3 error / 6 warning |
| 7 | `comma` | warning |

Also: 6 `shorthand_operator` (error), 5 `redundant_nil_coalescing`, 5 `large_tuple`,
4 `switch_case_alignment`, 3 `empty_count` (error), 3 `disallow_raw_print`,
2 `empty_string`, 2 `disallow_dispatchqueue_main_asyncafter`, 2 `opening_brace`,
1 each `static_over_final_class`, `superfluous_disable_command`, `unused_closure_parameter`,
`vertical_whitespace`, `todo`.

Top 15 files:

| n | file |
| ---: | --- |
| 66 | `Patina/Core/Network/RoomsAPIClient.swift` |
| 55 | `Patina/Services/API/ProposalsAPIClient.swift` |
| 49 | `Patina/Services/Sync/Models/RoomScanV2DTOs.swift` |
| 47 | `Patina/Core/Network/ProjectsAPIClient.swift` |
| 38 | `Patina/Core/Network/FulfillmentAPIClient.swift` |
| 30 | `Patina/Services/API/InvoicesAPIClient.swift` |
| 29 | `Patina/Core/Network/DecisionsAPIClient.swift` |
| 29 | `Patina/Core/Network/MessagingAPIClient.swift` |
| 28 | `Patina/Services/Sync/Models/RoomScanSyncDTOs.swift` |
| 22 | `Patina/Services/Analytics/HelpAnalytics.swift` |
| 18 | `Patina/Features/RoomScan/Views/ScanReviewView.swift` |
| 16 | `Patina/Services/Sync/RoomScanSyncService+AdvancedBundle.swift` |
| 14 | `Patina/Features/Conversation/Models/ConversationState.swift` |
| 14 | `Patina/Services/Sharing/ScanSharingService.swift` |
| 13 | `Patina/Features/Walk/Models/ScanManifest.swift` |

All 396 `identifier_name` **errors** are one bucket: snake_case DTO properties
(`designer_id`, `created_at`, `stripe_payment_intent_id`, …) that mirror the Postgres column
names. Benign as code, but they make `swiftlint lint` structurally incapable of exiting 0, which
is why only the `lint-delta` tier is usable (→ G-11).

The three `error`-severity **custom** rules that back the design-system codemods —
`disallow_foregroundcolor`, `disallow_navigation_bar_hidden`, `disallow_cornerradius` — have
**zero hits**. Those sweeps held.

27 of the 933 violations are inside `PatinaTests`/`PatinaUITests`.

Notable individual hits: 3 raw `print()` still in shipping code
(`RoomCaptureService+Instrument.swift:116,123`, `UploadDiagnosticsLog.swift:13`);
2 `DispatchQueue.main.asyncAfter` (`ScanThresholdView.swift:80`, `QRScannerView.swift:362`);
1 unresolved TODO (`AestheteEngineService.swift:189` — "implement once services/aesthe…");
`CompanionOverlay.swift` is 1160 lines (file_length error);
`RoomScanSyncService.swift` class body spans 660 lines.

## 5. Archive dry-run — **FAIL, same compile break**

```
xcodebuild … -configuration Release -destination 'generic/platform=iOS' \
  -archivePath .../.build/Patina.xcarchive archive -allowProvisioningUpdates
```

`** ARCHIVE FAILED **`, exit **65**, `(3 failures)` — identical six errors, same four files.
`.build/Patina.xcarchive` does not exist. **No retry attempted**: the failure is a compile error,
not a signing/provisioning/capabilities error, so a second identical run buys nothing.

Steps 5a–5d of the brief (embedded entitlements of the archived app, its
`CFBundleVersion`/`CFBundleShortVersionString`/`MinimumOSVersion`, `PatinaWidget.appex` inside
`PlugIns`, `PrivacyInfo.xcprivacy` anywhere in the bundle) are therefore **unverifiable** until
G-01 is fixed. Nothing was exported or uploaded.

**Signing did, however, resolve cleanly before the compile failed** — this is the good news:

- Certificates in the keychain: `Apple Development: Kody Kochaver (BD8AHP9A59)` **and**
  `Apple Distribution: Middle West Studio LLC (VP22LXHT7L)`. Both valid.
- The widget target compiled, was packaged, and **signed successfully**:
  `Signing Identity: "Apple Development: Kody Kochaver (BD8AHP9A59)"`,
  `Provisioning Profile: "iOS Team Provisioning Profile: cloud.patina.app.widget"`.
- Both team provisioning profiles are present locally and valid to **2027-08-29**
  (`7cd87e95…` → `VP22LXHT7L.cloud.patina.app.widget`, `c62c6642…` → `VP22LXHT7L.cloud.patina.app`,
  TeamName `Middle West Studio LLC`), 9 profiles on the machine in total.
- App entitlements as processed for the archive:

```
"application-identifier"                = "VP22LXHT7L.cloud.patina.app";
"aps-environment"                       = development;
"com.apple.developer.applesignin"       = ( Default );
"com.apple.developer.associated-domains"= ( "applinks:client.patina.cloud" );
"com.apple.developer.team-identifier"   = VP22LXHT7L;
"com.apple.security.application-groups" = ( "group.cloud.patina.app" );
"get-task-allow"                        = 1;
```

- Widget entitlements: `application-identifier VP22LXHT7L.cloud.patina.app.widget`,
  team id, `group.cloud.patina.app`, `get-task-allow 1`. No stray `aps-environment` — correct.

`aps-environment = development` and `get-task-allow = 1` come from the **development** profile the
archive action selected. With automatic signing, Xcode's export step normally re-signs with an App
Store profile and rewrites both. Flagged as a risk to confirm at export (G-12), not as a proven
defect.

Release build settings relevant to TestFlight (`G-buildsettings-release.txt`) are otherwise
correct: `DEBUG_INFORMATION_FORMAT = dwarf-with-dsym`, `STRIP_INSTALLED_PRODUCT = YES`,
`STRIP_STYLE = all`, `VALIDATE_PRODUCT = YES`, `ENABLE_TESTABILITY = NO`,
`SWIFT_COMPILATION_MODE = wholemodule`, `DEAD_CODE_STRIPPING = YES`, `ENABLE_DEBUG_DYLIB = NO`,
`SKIP_INSTALL = NO`, `ONLY_ACTIVE_ARCH = NO`, `CODE_SIGN_STYLE = Automatic`,
`DEVELOPMENT_TEAM = VP22LXHT7L`, `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`,
`IPHONEOS_DEPLOYMENT_TARGET = 26.5`, `SWIFT_VERSION = 5.0`, `TARGETED_DEVICE_FAMILY = 1,2`.

## 6. Built-app inspection (steward's Debug simulator build)

`…/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app` — **69 MB** total.

Bundle root:

```
__preview.dylib (35K)   _CodeSignature/   AppIcon60x60@2x.png (9.5K)
AppIcon76x76@2x~ipad.png (13K)            Assets.car (1.5M)
Frameworks/PatinaDesignKit.framework      Info.plist (2.2K)
Patina (59K)            Patina.debug.dylib (66M)
PatinaDesignKit_PatinaDesignKit.bundle    PkgInfo
PLCrashReporter_CrashReporter.bundle      PlugIns/PatinaWidget.appex
PostHog_PostHog.bundle  swift-crypto_Crypto.bundle
```

10 largest files (KB): `Patina.debug.dylib` 64536 · `Assets.car` 1420 ·
`Frameworks/PatinaDesignKit.framework/PatinaDesignKit` 1296 ·
`PlugIns/PatinaWidget.appex/PatinaWidget.debug.dylib` 428 ·
`PlugIns/…/Inter-SemiBold.ttf` 320 · `PlugIns/…/Inter-Regular.ttf` 320 ·
`PlugIns/…/Inter-Medium.ttf` 320 · `PatinaDesignKit_…bundle/Inter-SemiBold.ttf` 320 ·
`…/Inter-Regular.ttf` 320 · `…/Inter-Medium.ttf` 320.

**Clean**: no `.DS_Store`, no `.swiftmodule`, `.xcconfig`, `.md`, `.sh`, or `.map` files anywhere in
the bundle. `Patina.debug.dylib` and `__preview.dylib` are Debug-only artifacts
(`ENABLE_DEBUG_DYLIB = NO` in Release), so they do not ship.

`PatinaWidget.appex` **is** correctly inside `PlugIns/`
(`NSExtensionPointIdentifier = com.apple.widgetkit-extension`, bundle id `cloud.patina.app.widget`,
`CFBundleDisplayName = Patina`, `MinimumOSVersion 26.5`, `UIDeviceFamily [1,2]`).

`PrivacyInfo.xcprivacy` in the bundle: **three, all from dependencies** —
`swift-crypto_Crypto.bundle/`, `PLCrashReporter_CrashReporter.bundle/`, `PostHog_PostHog.bundle/`.
**The app itself ships none.** `find apps/mobile -name PrivacyInfo.xcprivacy` shows the sibling app
has one at `apps/mobile/Capture/Capture/PrivacyInfo.xcprivacy`; Patina has no equivalent (→ G-05).

### Icon — correct, and worth saying so

`Info.plist` carries `CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName = AppIcon` with
`CFBundleIconFiles = [AppIcon60x60]`, plus a `CFBundleIcons~ipad` variant. There is no *top-level*
`CFBundleIconName`, which is normal for the Icon Composer pipeline.

`assetutil --info Assets.car` confirms the icon is compiled **from the Icon Composer file**
(`Patina/Resources/AppIcon.icon`), not from flat PNGs:

- three `AppIcon.iconstack` renditions (universal idiom) — the layered composition,
- named layer groups `AppIcon/Group 1_ Background`, `Group 2_ Middleground`, `Group 3_ Foreground`
  (three renditions each),
- `AppIcon_Assets/{Color-1…7, Gradient-1…4, 01-background, 02-strata 1, PSVG}` source assets,
- and all three 1024×1024 phone fallbacks:
  `UIAppearanceAny` (507 KB), `UIAppearanceDark` (536 KB), `ISAppearanceTintable` (377 KB).

Header `Appearances: {ISAppearanceTintable: 10, UIAppearanceAny: 0, UIAppearanceDark: 1,
UIAppearanceLight: 4}`, authored by `Xcode 26.6 (17F113)`. Light / dark / tinted are all present —
the iOS 26 icon contract is fully met. `Assets.car` holds nothing but the app icon (19 asset names).

### Shipped Info.plist keys of note

`CFBundleIdentifier cloud.patina.app` · `CFBundleShortVersionString 1.0` · `CFBundleVersion 1` ·
`MinimumOSVersion 26.5` · `LSApplicationCategoryType public.app-category.shopping` ·
`UIStatusBarHidden true` · `UISupportedInterfaceOrientations [Portrait]` · `UIDeviceFamily [1,2]` ·
`UILaunchScreen {}` · `CFBundleURLSchemes ["patina"]` · no `CFBundleDisplayName` ·
**no `ITSAppUsesNonExemptEncryption`** (→ G-06) · no `UIRequiresFullScreen`.

Permission strings actually shipped come from the `INFOPLIST_KEY_*` build settings, which override
same-named keys in the tracked `Patina/Info.plist` (→ G-07):

| key | shipped (build setting) | dead copy in `Patina/Info.plist` |
| --- | --- | --- |
| `NSCameraUsageDescription` | "Patina uses your camera to walk through your space together and visualize furniture in your room." | "Patina uses the camera to scan QR codes for secure sign-in and to capture your rooms" |
| `NSMicrophoneUsageDescription` | "Have a voice conversation with Patina about your space and style." | "Patina uses the microphone so you can speak with the Companion instead of typing" |
| `NSSpeechRecognitionUsageDescription` | "Speak naturally with Patina instead of typing." | "Patina uses speech recognition to turn your spoken requests into Companion conversations" |
| `NSPhotoLibraryUsageDescription` | "Save room designs and furniture visualizations to your photo library." | — (build setting only) |
| `NSMotionUsageDescription` | "Patina uses motion data to detect when your device is steady for capturing the best room photos." | — (build setting only) |
| `NSPhotoLibraryAddUsageDescription` | "Patina saves AR previews and room captures to your photo library when you ask" | (plist only — ships) |
| `NSFaceIDUsageDescription` | "Patina uses Face ID to securely confirm sign-in requests from the web" | (plist only — ships) |

One more from the build transcript: `appintentsmetadataprocessor … warning: Metadata extraction
skipped. No AppIntents.framework dependency found.` — the app declares no App Intents / App
Shortcuts (→ G-16).

---

## Where the gates themselves stand

`apps/mobile/Patina/scripts/ios-gate.sh` is the project's stated substitute for iOS CI ("There is
no iOS CI. This script is the substitute."). Its tiers:

- `build` → `-configuration Debug`, `generic/platform=iOS Simulator`, `CODE_SIGNING_ALLOWED=NO`
- `unit` / `ui` → `-configuration Debug`
- `lint` → full swiftlint · `lint-delta [BASE]` → per-file regression vs merge-base
- **`all` = build + unit + lint-delta**

`.github/workflows/policy-quality.yml:98` runs `apps/mobile/Patina/scripts/ios-gate.sh all` in the
job `ios-patina` — `name: Patina iOS gate (advisory)`, `runs-on: macos-15`,
`if: needs.plan.outputs.ios_patina == 'true'`. No other workflow invokes `xcodebuild`.

Consequences, and they explain everything above:

1. **No tier anywhere builds `-configuration Release` or runs `archive`.** `grep -nE 'Release|archive|-configuration' scripts/ios-gate.sh` → only two hits, both `Debug`. That is why G-01 reached `main`.
2. **`all` does not include the `ui` tier**, so PatinaUITests has not been run by any gate — which is why a suite that has been red since the initial commit went unnoticed (G-03).
3. **`all` does not include the `lint` tier** either, only `lint-delta`; and `lint` could not pass anyway (exit 2, G-11).
4. The in-project SwiftLint build phase is `swiftlint lint Patina || true` — **it can never fail a build**, and it declares no outputs so it re-runs on every build including archives (G-04).

## What is GOOD (calibration)

- Unit tier is genuinely healthy: 1523 tests / 164 suites, 0 failures, 4.7 s of execution.
- The app icon is a correct, complete iOS 26 Icon Composer build — light, dark **and** tinted, with the layered groups intact. This is the part most apps get wrong.
- The shipped bundle is tidy: no `.DS_Store`, no stray dev files, widget correctly in `PlugIns/`, debug dylibs excluded from Release by configuration.
- Release build settings are exactly right for TestFlight: dSYMs generated, product stripped and validated, testability off, whole-module, dead-code stripping on.
- Both signing certificates exist (including `Apple Distribution: Middle West Studio LLC (VP22LXHT7L)`), both provisioning profiles are present and valid to 2027-08-29, and the widget signed without complaint.
- Entitlements match reality: `applinks:client.patina.cloud` matches the live AASA, and the app group `group.cloud.patina.app` matches on both app and widget.
- The three error-severity design-system custom rules (`disallow_foregroundcolor`, `disallow_cornerradius`, `disallow_navigation_bar_hidden`) have zero hits — those codemod sweeps genuinely landed.
- No Release-only compiler warnings.

## What I could NOT verify, and why

- **Everything downstream of the app target's Release compile**: link step, dSYM emission, widget embedding into the archive, `.xcarchive` layout, embedded entitlements of the *archived* app, the archived `Info.plist`, whether a `PrivacyInfo.xcprivacy` would appear, and IPA packaging. Blocked by G-01.
- **Whether export/upload signing works** (App Store profile creation, `aps-environment` rewrite to production, `get-task-allow` removal). Requires a successful archive plus an export, and export/upload is out of scope for a read-only audit.
- **Whether the 610 s `simctl diagnose` stall is reproducible or specific to clone P's state.** Observed once. A second unit run on a fresh clone would settle it.
- **Real cold-launch time on a Release build / on device.** The only measurement available is 2.131 s from a Debug simulator build.
- **Whether the `FirstLaunchUITests` flow ever existed in the current app.** The identifiers are gone; whether the screens were removed or merely renamed is a first-run-lane question.

---

## Findings

### G-01 — Release configuration does not compile; no TestFlight archive is possible
- **area** testflight-config · **severity** blocker · **testerVisible** true · **confidence** 1.0 · **effort** S
- **where** `apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift:98-99`, `Features/Home/Views/DailyStoryCard.swift:132`, `Features/Home/Views/DailyStoryDetailView.swift:214`, `Features/ProductDetail/Views/ProductDetailView.swift:693`; logs `research/G-release.log:6124-6139`, `research/G-archive.log:6384-6399`
- **evidence** `** BUILD FAILED **` / `** ARCHIVE FAILED **`, exit 65 both times. `error: type 'Product' has no member 'previewProducts'`, `error: type 'RoomSummary' has no member 'mockAll'`, `error: type 'DailyStory' has no member 'preview'` (×6). The fixtures are `#if DEBUG`-gated (`ProductModel.swift:361` — "`previewProducts` is intentionally `#if DEBUG`-gated"); the `#Preview` blocks using them are not. `ENABLE_PREVIEWS = NO` does not strip a `#Preview` body. `.build/Patina.xcarchive` was never created.
- **why it matters** There is no build to give a tester. Every other finding in this audit is downstream of this one.
- **fix** Wrap the four `#Preview` blocks in `#if DEBUG` / `#endif` (or move the fixtures out of the DEBUG gate). Whole-module compilation means all six errors were reported together, so those four files are the whole break. Gate: `xcodebuild build -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO`.

### G-02 — No gate anywhere builds Release or archives, which is how G-01 landed
- **area** tests-gates · **severity** blocker · **testerVisible** false · **confidence** 0.95 · **effort** S
- **where** `apps/mobile/Patina/scripts/ios-gate.sh:50-63`, `.github/workflows/policy-quality.yml:93-99`
- **evidence** `ios-gate.sh` header: "There is no iOS CI. This script is the substitute." `grep -nE 'Release|archive|-configuration' scripts/ios-gate.sh` → two hits, both `-configuration Debug` (lines 52, 61). `cmd_build` is Debug + `generic/platform=iOS Simulator`. The only CI invocation is `policy-quality.yml:98 - run: apps/mobile/Patina/scripts/ios-gate.sh all`, job named "Patina iOS gate (advisory)". No workflow contains any other `xcodebuild`.
- **why it matters** A Release-only compile break is invisible to every gate the team runs, so it sits on `main` until someone tries to ship. It did.
- **fix** Add a `release` tier (`xcodebuild build -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO`) and include it in `all`; ideally an `archive` tier before any TestFlight round.

### G-03 — The entire XCUITest suite is dead: 7/11 fail against a first-run flow that no longer exists, 4 "passes" are Xcode template stubs
- **area** tests-gates · **severity** major · **testerVisible** false · **confidence** 0.95 · **effort** M
- **where** `apps/mobile/Patina/PatinaUITests/FirstLaunchUITests.swift`, `PatinaUITests/Helpers/FirstLaunchTestHelpers.swift:99`; log `research/G-ui.log:1938-2131`
- **evidence** `** TEST FAILED **`, exit 65, `Executed 11 tests, with 7 failures`. All seven: `XCTAssertTrue failed - Threshold should appear` / `Threshold enter button should appear`. The helper waits on `otherElements["threshold.enterButton"]`; `grep -rn "threshold.enterButton" apps/mobile/Patina/Patina` returns **0 hits**. The suite asserts literal copy from the old spec (`"Every room\ntells a story."`, `"Shall we walk your space together?"`). `git log -- PatinaUITests/FirstLaunchUITests.swift` → one commit, `9a3209bf2 chore: initial monorepo setup`. The four passing tests are unedited Xcode templates: `testExample` asserts nothing, `testLaunchPerformance` is `measure { XCUIApplication().launch() }`, `testLaunch` only screenshots.
- **why it matters** The first-run path is precisely what a TestFlight round-one tester exercises, and it has zero automated coverage. It also means the UI tier gives false comfort: someone reading "PatinaUITests exists" would assume otherwise.
- **fix** Either rewrite the suite against the current first-run identifiers (`auth.welcome.guestButton`, `auth.form.emailField`, `companion.intro.later`, …) or delete `FirstLaunchUITests` + helpers and the two template classes, and say plainly that UI coverage is manual. Then add the `ui` tier to `ios-gate.sh all` so it cannot rot again.

### G-04 — The SwiftLint build phase is `|| true`: 421 error-severity violations never fail anything
- **area** tests-gates · **severity** major · **testerVisible** false · **confidence** 0.9 · **effort** S
- **where** `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:408`
- **evidence** `shellScript = "if which swiftlint > /dev/null; then\n cd \"${SRCROOT}\"\n swiftlint lint Patina || true\n…"`. The phase also declares no `outputPaths`, so Xcode emits `warning: Run script build phase 'SwiftLint' will be run during every build because it does not specify any outputs` on every build including archives. Meanwhile `swiftlint lint --config .swiftlint.yml` exits **2** with 421 error-severity violations.
- **why it matters** The project carries a lint configuration that promises to enforce the design-system codemods at `severity: error`, and a build phase that structurally cannot enforce anything. New violations of `disallow_cornerradius` etc. would ship silently.
- **fix** Drop `|| true` once the `identifier_name` bucket is dealt with (G-11), and give the phase an output path so it stops re-running on every build.

### G-05 — App ships no `PrivacyInfo.xcprivacy` (the sibling Capture app has one)
- **area** testflight-config · **severity** major · **testerVisible** false · **confidence** 0.85 · **effort** S
- **where** `apps/mobile/Patina/Patina/` (absent); compare `apps/mobile/Capture/Capture/PrivacyInfo.xcprivacy`
- **evidence** `find apps/mobile -name PrivacyInfo.xcprivacy` finds Capture's manifest and dependency manifests only. In the built app the only three are `swift-crypto_Crypto.bundle/`, `PLCrashReporter_CrashReporter.bundle/`, `PostHog_PostHog.bundle/` — all vendored. The app declares none of its own required-reason API usage (UserDefaults is used throughout for flags/onboarding; file timestamp and disk space APIs are used by the scan/upload paths).
- **why it matters** App Store Connect emails an ITMS-91053 "Missing API declaration" warning on upload. It does not block internal TestFlight today, but it does block App Store review, and the fix is cheapest now while the pattern from Capture can just be copied.
- **fix** Add `Patina/PrivacyInfo.xcprivacy` modelled on Capture's, with `NSPrivacyAccessedAPITypes` entries for the categories actually used, and `NSPrivacyTracking`/`NSPrivacyCollectedDataTypes` reflecting PostHog.

### G-06 — No `ITSAppUsesNonExemptEncryption`: every upload parks in "Missing Compliance"
- **area** testflight-config · **severity** major · **testerVisible** true · **confidence** 0.9 · **effort** S
- **where** `apps/mobile/Patina/Patina/Info.plist` (key absent); confirmed absent in the built app's `Info.plist`
- **evidence** `grep -rn ITSAppUsesNonExemptEncryption apps/mobile/Patina` → no matches. `plutil -p Patina.app/Info.plist` has no such key.
- **why it matters** Without the key, every build lands in App Store Connect needing the export-compliance question answered by hand before it can go to any tester — a manual step per upload, and the one most likely to strand a build the evening Kody invites people.
- **fix** Add `ITSAppUsesNonExemptEncryption = false` (the app uses only HTTPS/standard crypto) to `Patina/Info.plist`.

### G-07 — Permission strings are split-brained: build settings silently override the tracked Info.plist, and the shipped camera string omits QR sign-in
- **area** testflight-config · **severity** major · **testerVisible** true · **confidence** 0.9 · **effort** S
- **where** `apps/mobile/Patina/Patina/Info.plist` vs `INFOPLIST_KEY_NS*UsageDescription` in `Patina.xcodeproj` (dumped to `research/G-buildsettings-release.txt`)
- **evidence** Both `GENERATE_INFOPLIST_FILE = YES` and `INFOPLIST_FILE = Patina/Info.plist` are set; the build settings win. Shipped: `NSCameraUsageDescription = "Patina uses your camera to walk through your space together and visualize furniture in your room."` The tracked plist's different wording — "Patina uses the camera to scan QR codes for secure sign-in and to capture your rooms" — never reaches the binary. Same for microphone and speech recognition (table in §6).
- **why it matters** Two problems. (1) Anyone editing `Patina/Info.plist` to fix permission copy will see no change and no error. (2) The app really does use the camera for QR sign-in (`Features/QRAuth/Views/QRScannerView.swift`), so a tester hitting the QR flow gets a system prompt talking about walking through their space — confusing to them and an accuracy problem for App Review, which requires the purpose string to cover the actual use.
- **fix** Pick one source of truth (build settings, given they already win), delete the shadowed keys from `Patina/Info.plist`, and rewrite the camera string to cover both uses.

### G-08 — Ships as an iPad app (`TARGETED_DEVICE_FAMILY = 1,2`) with no iPad design and portrait-only
- **area** testflight-config · **severity** major · **testerVisible** true · **confidence** 0.8 · **effort** S
- **where** `research/G-buildsettings-release.txt`: `TARGETED_DEVICE_FAMILY = 1,2`; built `Info.plist`: `UIDeviceFamily [1,2]`, `UISupportedInterfaceOrientations [UIInterfaceOrientationPortrait]`, no `UIRequiresFullScreen`
- **evidence** The widget carries `UIDeviceFamily [1,2]` too. The asset catalog does emit an `AppIcon76x76@2x~ipad.png` and a `CFBundleIcons~ipad` entry, but nothing else in the audit suggests an iPad layout exists.
- **why it matters** TestFlight will offer the build to any iPad the tester owns, and a portrait-locked iPhone layout blown up on an 11" display is the single fastest way to look unfinished. On iPadOS 26 it also has to survive the windowing/resize behaviour a portrait-only app without `UIRequiresFullScreen` gets.
- **fix** For round one, set `TARGETED_DEVICE_FAMILY = 1` on both targets so the app is iPhone-only; revisit iPad as a designed surface later.

### G-09 — 1330 Swift-6-mode concurrency warnings in a Swift-5 module; 1604 warnings in one build
- **area** tests-gates · **severity** minor · **testerVisible** false · **confidence** 0.9 · **effort** L
- **where** whole app; counts from `research/G-unit.log`
- **evidence** `grep -c "this is an error in the Swift 6 language mode"` → **1330** of 1604 total warning lines; 169 distinct texts. Largest buckets: `main actor-isolated conformance of 'BuyabilityGate.Refusal' to 'Equatable' cannot be used in nonisolated context` (157), `… 'RemoteInvoice' to 'Decodable'` (111), `… 'AppRoute' to 'Equatable'` (90), `… 'BackgroundScanUploader.VerificationOutcome'` (77), `expression is 'async' but is not marked with 'await'` (38). `SWIFT_VERSION = 5.0`. Also 26 hits of `'usdzData' is deprecated: v1 USDZ-blob sync path` and 21 of supabase-swift's `'database' is deprecated`, plus 22 `no calls to throwing functions occur within 'try' expression`.
- **why it matters** Not a TestFlight blocker, but 1604 warnings means no one can see a *new* warning, which is how G-01 stayed invisible in the logs. The Swift 6 wall is also a hard future migration.
- **fix** Not for this program. Worth a warning-count baseline in `ios-gate.sh` so the number can only go down.

### G-10 — Unit gate costs 610 s of wall clock for 4.7 s of tests (600 s `simctl diagnose` timeout)
- **area** tests-gates · **severity** minor · **testerVisible** false · **confidence** 0.55 · **effort** S
- **where** `research/G-unit.log` tail
- **evidence** `✔ Test run with 1523 tests in 164 suites passed after 4.733 seconds.` then `IDETestOperationsObserverDebug: Failure collecting diagnostics from simulator: Timed out after 600.0 seconds while waiting for a response from the invoked process` then `610.538 elapsed -- Testing started completed.` Process inspection during the stall showed `CoreSimulator/.../simctl diagnose -l -b --timeout=600` as a live child of xcodebuild. The resulting `.xcresult` is 159 MB.
- **why it matters** Every local and CI unit run pays ten minutes after the last assertion, which pushes people to skip the gate.
- **fix** Confirm on a fresh clone first. If reproducible, disable diagnostic collection in the test plan / pass `-disableAutomaticPackageResolution`-style suppression, or erase the clone before the gate. Observed once, on a simulator the walkers had been driving — could be device state.

### G-11 — `swiftlint lint` can never exit 0: 421 error-severity violations, 396 of them snake_case DTO keys
- **area** tests-gates · **severity** minor · **testerVisible** false · **confidence** 0.95 · **effort** M
- **where** `research/G-lint.json`; heaviest in `Patina/Core/Network/*APIClient.swift`, `Patina/Services/Sync/Models/RoomScan*DTOs.swift`
- **evidence** swiftlint exits **2**. 421 errors: 396 `identifier_name` ("Variable name 'designer_id' should only contain alphanumeric and other allowed characters"), 6 `shorthand_operator`, 4 `type_body_length`, 4 `function_body_length`, 3 `empty_count`, 3 `cyclomatic_complexity`, 3 `function_parameter_count`, 2 `file_length`. The snake_case names mirror Postgres columns and are correct code.
- **why it matters** The `lint` tier of `ios-gate.sh` is unusable, so only `lint-delta` runs — and `lint-delta` by construction cannot see a pre-existing problem. It also guarantees the build-phase `|| true` in G-04 can never be removed as-is.
- **fix** Either add `identifier_name: allowed_symbols` / an `excluded` path glob for the DTO/API-client files, or move the wire shapes behind explicit `CodingKeys` with camelCase properties. Then the remaining 25 real errors are worth fixing and the gate can be armed.

### G-12 — `aps-environment: development` is hardcoded and the archive resolved the development profile
- **area** testflight-config · **severity** minor · **testerVisible** true · **confidence** 0.5 · **effort** S
- **where** `apps/mobile/Patina/Patina/Patina.entitlements`; `research/G-archive.log:4650-4657, 5097+`
- **evidence** Entitlements file: `<key>aps-environment</key><string>development</string>`. The archive action processed `"aps-environment" = development;` and `"get-task-allow" = 1;` and signed the widget with `Apple Development: Kody Kochaver (BD8AHP9A59)` under `iOS Team Provisioning Profile: cloud.patina.app.widget`. `CODE_SIGN_IDENTITY = Apple Development` for the Release configuration. An `Apple Distribution: Middle West Studio LLC (VP22LXHT7L)` certificate does exist.
- **why it matters** If a TestFlight build ever ships with the development APNs environment, push notifications silently do nothing for every tester. Xcode's automatic-signing export normally rewrites this to `production`, which is why confidence is only 0.5 — but push is already on Kody's OWED list, so it is worth confirming rather than assuming.
- **fix** After G-01 is cleared, complete an archive and `codesign -d --entitlements :-` the exported app to confirm `aps-environment = production` and no `get-task-allow`. If it does not flip, the entitlements file needs a Release-configuration variant.

### G-13 — The design-kit font bundle is embedded twice (app + widget), duplicating ~1.4 MB of TTFs
- **area** testflight-config · **severity** polish · **testerVisible** false · **confidence** 0.8 · **effort** M
- **where** `Patina.app/PatinaDesignKit_PatinaDesignKit.bundle/` and `Patina.app/PlugIns/PatinaWidget.appex/PatinaDesignKit_PatinaDesignKit.bundle/`
- **evidence** Both bundles carry the same ten TTFs — Inter Regular/Medium/SemiBold (320 KB each), Playfair Display Regular/Medium/Italic (124 KB each), DM Mono Light/Medium/Regular. Eight of the ten largest files in the bundle are these duplicated fonts.
- **why it matters** Invisible on the 69 MB Debug build, but the Release app has no 64 MB debug dylib, so ~1.4 MB of duplicated fonts is a real slice of the download a tester waits on.
- **fix** Have the widget link the app's copy, or ship the widget a trimmed face set (it likely needs one or two weights, not nine).

### G-14 — App declares no App Intents / App Shortcuts
- **area** testflight-config · **severity** polish · **testerVisible** true · **confidence** 0.85 · **effort** L
- **where** build transcript, `research/G-unit.log:23009`
- **evidence** `appintentsmetadataprocessor[…] warning: Metadata extraction skipped. No AppIntents.framework dependency found.`
- **why it matters** No Siri phrase, no Spotlight action, no Shortcuts entry, and the widget cannot offer a configuration intent. For an "Apple-Design-Award polish" bar on iOS 26 this is a visible absence rather than a defect — worth naming so the fix program can decide deliberately rather than by omission.
- **fix** Out of scope for a polish pass; record the decision. If the widget ever needs per-instance configuration it becomes required.

### G-15 — `MinimumOSVersion 26.5` silently excludes any tester not already on 26.5
- **area** testflight-config · **severity** minor · **testerVisible** true · **confidence** 0.6 · **effort** M
- **where** `IPHONEOS_DEPLOYMENT_TARGET = 26.5` in `research/G-buildsettings-release.txt`; built `Info.plist` `MinimumOSVersion 26.5`
- **evidence** Both app and widget carry `MinimumOSVersion 26.5`. `apps/mobile/Patina/CLAUDE.md` still says iOS 18+.
- **why it matters** A tester on 26.4 opens TestFlight and simply does not see the build — no error, no explanation, and Kody finds out by being asked. It matches the stated round-one bar (iPhone 17 Pro, 26.5+), so this is a "confirm it is deliberate" item rather than a defect.
- **fix** Either confirm every invited tester is on 26.5+ before sending invites, or lower the deployment target. Also fix the stale iOS-18 claim in `apps/mobile/Patina/CLAUDE.md`.

### G-16 — `Patina/Generated/GitCommit.swift` is tracked and rewritten by every Debug build
- **area** tests-gates · **severity** polish · **testerVisible** false · **confidence** 0.85 · **effort** S
- **where** `apps/mobile/Patina/Patina/Generated/GitCommit.swift`; phase at `project.pbxproj:428`
- **evidence** File currently reads `public static let sha: String = "d7287c3f+"` — the trailing `+` is the script's own dirty-tree marker, so the file is dirty because the file is dirty. The phase writes into `$SRCROOT` on every Debug build.
- **why it matters** Permanent `git status` noise in a repo whose conventions forbid `git add -A` precisely because of untracked/modified landmines; it makes every worktree look dirty to the next agent. (The Release behaviour — empty SHA, documented at `AppConfiguration.swift:73-79` as deliberate for reproducible App Store builds — is correct and is *not* a finding.)
- **fix** Gitignore the generated file and stop tracking it, or write it into `DERIVED_FILE_DIR` instead of `$SRCROOT`.
