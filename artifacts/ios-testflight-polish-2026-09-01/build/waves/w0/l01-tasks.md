# First Flight · W0 · L0.1 — Build & configuration · task list

Written **before** any code, per `PROGRAM.md` §7 "How a wave runs" step 2.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l01`, branch `first-flight/w0-l01`.
Base `3b7916db1a601ce2877cb9f879fb2ea12f3d98ee`.

Authorities, in order: `rulings-2026-09-02.md` → `PROGRAM.md` §3 W0 · L0.1 + §2 + §7 → `waves/w0/steward.md`.

---

## Standing lines (PROGRAM.md §7 requires all four)

### 1. `IOS_GATE_UDID`

```bash
export IOS_GATE_UDID=8ED58095-6FFA-4411-B715-73C98805C874   # clone ff-w0-l01, L0.1's own
```

Exported for the whole session. Never `booted`. Never another lane's clone
(`BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8` is L0.7's; `973D1724-90BF-4A0A-B02D-481D561547B3` is the
protected review device). This lane's own first task is what makes the gate *refuse* without it.

### 2. The VISION check

*Name any finding in my table whose fix would add or entrench something VISION §6 refuses (tab / zone /
dashboard UI, shadows, red/green status, badges, engagement optimisation, the "AI" label) and say why
it survives.*

Answer, row by row:

- **D1a — `house-first` defaults true.** This is the one row that touches VISION §6 directly: it makes a
  **tab bar** the first-launch root. It survives because it is a *ruled, dated exception* — **D1** makes
  the four-tab root the shipped product for round one and **V7** logs the exception in
  `docs/vision/VISION-DECISIONS.md` (the W0 closer writes it): the iOS app is surface #2 and may use a
  tab bar; The Document (surface #1) still may not. Without V7 this fix would be an integration note to
  Fable, not a commit. The code change itself adds no UI — it changes one resolution default.
- **A2-10 (AccentColor)** — replaces an *undefined* accent (iOS system blue) with the brand's own
  interactive clay. It removes a foreign colour; it adds no status colour, no badge, no red/green.
- **A2-14 / C-29 (LaunchBackground)** — a flat ground colour matching the app canvas. No mark, no
  gradient, no shadow. VISION-neutral.
- **A2-15 / A2-16 (analytics kill switch + error tracking)** — error tracking is crash reporting, not
  engagement optimisation. It reports `$exception`, nothing about attention or retention. The kill
  switch *reduces* what Debug builds report.
- **A2-01 / A2-03 / A2-06 / A2-13 / A2-23 / G-01 / G-02 / A2-02 / A2-12 / A2-22 / A2-07 / A2-24 /
  C7-11 / A2-21** — build configuration, privacy manifests, permission strings, gate script. Nothing a
  tester sees as UI. No §6 surface.

No fix in this lane becomes an integration note to Fable on VISION grounds.

### 3. Notes I must apply

**None received** as of writing. `build/waves/w0/` holds only `steward.md`, `l02b-tasks.md` and L0.5's
three text drafts — no `*-notes.md` addressed to L0.1. The obligations that *do* bind this lane come
from the rulings file, and each is a numbered task below:

| Source | Obligation | Task |
|---|---|---|
| **D1a** | `FeatureFlags` per-flag default table; `house-first` true with no PostHog answer; PostHog `false` still wins | T11 |
| **D4** | `TARGETED_DEVICE_FAMILY = 1` on both targets | T4 |
| **D6** | `IPHONEOS_DEPLOYMENT_TARGET = 26.0` | T4 |
| **D15** | the widget ships its **own** `PrivacyInfo.xcprivacy` | T6 |

### 4. Notes I will send

Exact final text lives in `build/waves/w0/l01-notes.md`. Summary of the four:

| # | To | Subject |
|---|---|---|
| **N1** | **L1-E** (W1, copy) | the seven `NS*UsageDescription` sentences, now in one source (the build settings), for rewriting |
| **N2** | **L1-D** (W1, tokens) | the two asset-catalogue tokens L0.1 created (`AccentColor`, `LaunchBackground`) and the launch mark C-29 still wants |
| **N3** | **L0.6 / Fable** (PostHog) | **D1a vs. "0% rollout" is a live contradiction** — a 0%-rollout `house-first` is cached as `false` and the kill switch turns the tab bar off from launch 2 |
| **N4** | **Fable / R1** | everything in this lane that can only be closed after Kody's archive + export (A2-07, A2-24, G-12) |

---

## Gate, and what each task runs

```bash
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l01
export IOS_GATE_UDID=8ED58095-6FFA-4411-B715-73C98805C874
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release      # must exit 0 (today: exit 65)
apps/mobile/Patina/scripts/ios-gate.sh unit         # must refuse with IOS_GATE_UDID unset
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

`ios-gate.sh archive` is **not** a lane command — R1 Step 2, Kody's machine.
`xcodebuild` / `xcrun simctl` need `dangerouslyDisableSandbox: true`.
The first `xcodebuild` in this worktree fails on `GitCommit.swift` and the second succeeds (A2-08) —
already paid once by the steward.

---

## Tasks

### T1 — `ios-gate.sh`: explicit destination, per-worktree DerivedData, `release` + `archive` tiers  · G-02

Nothing else in this lane can be gated until this lands, and no other lane may run `unit`/`ui`/`all`
until it does (steward §3 rule 2).

1. **Prove the defect first.** `bash -c 'unset IOS_GATE_UDID; …/ios-gate.sh unit'` today resolves a
   destination by scraping `simctl list … | head -1` — record which udid it picks. With four booted
   devices on this machine that is a lane collision waiting to happen (Hard Rule 1 / 8).
2. Implement, verbatim from `PROGRAM.md` §3 L0.1: `sim_destination()` returns
   `platform=iOS Simulator,id=$IOS_GATE_UDID` when set and otherwise prints the two-line error and
   `exit 2`; `DERIVED="$PROJECT_DIR/.build/DerivedData"`; `cmd_release` (Release, `generic/platform=iOS`,
   `CODE_SIGNING_ALLOWED=NO`); `cmd_archive` (Release, `-archivePath …/.build/archives/Patina.xcarchive`,
   `-allowProvisioningUpdates`, **no** `CODE_SIGNING_ALLOWED=NO`); `-derivedDataPath "$DERIVED"` on
   `cmd_build` and `cmd_test` too; `release` and `archive` wired into `main()`'s case and the usage line.
   **`all` stays `build + unit + lint-delta`** — `release` is *not* folded in (L2-G measures the
   whole-module cost in W2).
3. Run: `unset IOS_GATE_UDID; ios-gate.sh unit` → exit 2 with the error. Then with it set → runs on
   `8ED58095-…`. Then `ios-gate.sh release` → still exit 65 (that is T2's failing gate, captured here).
4. `git add apps/mobile/Patina/scripts/ios-gate.sh` ·
   `fix(first-flight): require IOS_GATE_UDID and add release/archive tiers to ios-gate.sh (G-02)`

### T2 — Release compiles  · G-01 (blocker, rank 1 of the program)

1. **Failing gate:** `ios-gate.sh release` → `** BUILD FAILED **`, exit 65, six errors in four files
   (`Product.previewProducts` ×3, `RoomSummary.mockAll`, `DailyStory.preview` ×2).
2. Wrap the `#Preview` block — and only the `#Preview` block — in `#if DEBUG` / `#endif` in
   `AddToRoomSheet.swift`, `DailyStoryCard.swift`, `DailyStoryDetailView.swift`,
   `ProductDetailView.swift`. The fixtures they call are already `#if DEBUG`-gated; the previews were
   not, which is the whole defect.
3. Run: `ios-gate.sh release` → `** BUILD SUCCEEDED **`, exit 0. Then `ios-gate.sh build` (Debug still
   compiles the previews).
4. `git add` the four view files ·
   `fix(first-flight): gate the four #Preview blocks to DEBUG so Release compiles (G-01)`

### T3 — `Config/Version.xcconfig` is the only source of the build number  · A2-01

The mechanic `PROGRAM.md` warns about: the xcconfig alone changes nothing, because target-level settings
resolve **above** it.

1. **Failing test first.** New `PatinaTests/ReleaseConfigurationTests.swift`: `Bundle.main.infoDictionary`
   `CFBundleVersion == "3"`, `CFBundleShortVersionString == "1.0"`, and the appex's `CFBundleVersion`
   (read from `PlugIns/PatinaWidget.appex/Info.plist`) **equals** the app's — ITMS-90473. Run
   `ios-gate.sh unit`: fails, resolved version is `1`.
2. Implement, all three steps or none of them:
   a. write `apps/mobile/Patina/Config/Version.xcconfig` (`CURRENT_PROJECT_VERSION = 3`,
      `MARKETING_VERSION = 1.0`);
   b. **delete** `CURRENT_PROJECT_VERSION` and `MARKETING_VERSION` from **all eight** target
      configurations in `project.pbxproj` (`Patina` Debug/Release, `PatinaWidget` Debug/Release,
      `PatinaTests` Debug/Release, `PatinaUITests` Debug/Release — the project-level pair carries
      neither key, checked);
   c. add one `PBXFileReference` for the xcconfig, put it in the root group, and set
      `baseConfigurationReference` on **all eight** of those configurations — Debug included, or a
      Debug run reports a different version than the archive and the fast proof in step 1 is worthless.
3. Run `ios-gate.sh unit` → `ReleaseConfigurationTests` green, resolved `CFBundleVersion == "3"` on both
   plists. Then `ios-gate.sh release`.
4. `git add apps/mobile/Patina/Config/Version.xcconfig apps/mobile/Patina/Patina.xcodeproj/project.pbxproj apps/mobile/Patina/PatinaTests/ReleaseConfigurationTests.swift` ·
   `fix(first-flight): move the build number to Config/Version.xcconfig and bump to 3 (A2-01)`

### T4 — iPhone-only, deployment target 26.0  · A2-03, C7-11 (D4) · A2-13 (D6)

1. **Failing test:** extend `ReleaseConfigurationTests` — `UIDeviceFamily == [1]` and
   `MinimumOSVersion == "26.0"`. Run: fails (`[1, 2]`, `26.5`).
2. `TARGETED_DEVICE_FAMILY = 1` on all eight configurations; `IPHONEOS_DEPLOYMENT_TARGET = 26.0` at the
   project level and on every target that overrides it (eight sites: `:494 :526 :600 :658 :693 :741
   :772 :794`). Both are **ruled yes** (D4, D6) — no stop-and-ask.
3. Run `ios-gate.sh unit` green, then `ios-gate.sh release`. Confirm the built `.app` no longer carries
   `AppIcon76x76@2x~ipad.png`.
4. `git add apps/mobile/Patina/Patina.xcodeproj/project.pbxproj apps/mobile/Patina/PatinaTests/ReleaseConfigurationTests.swift` ·
   `fix(first-flight): iPhone-only device family and a 26.0 deployment floor (A2-03, C7-11, A2-13)`

### T5 — `ITSAppUsesNonExemptEncryption`  · A2-06

1. **Failing test:** extend `ReleaseConfigurationTests` — `ITSAppUsesNonExemptEncryption` is present and
   `false`. Run: fails, key absent.
2. Add the key to `Patina/Info.plist` (the app uses HTTPS/TLS and Apple/swift-crypto only — exempt).
3. Run `ios-gate.sh unit`.
4. `git add apps/mobile/Patina/Patina/Info.plist apps/mobile/Patina/PatinaTests/ReleaseConfigurationTests.swift` ·
   `fix(first-flight): declare ITSAppUsesNonExemptEncryption=false (A2-06)`

### T6 — Two privacy manifests, not one  · A2-02 (D15)

1. **Failing test first.** New `PatinaTests/PrivacyManifestTests.swift`, **two** subjects: the app's own
   `PrivacyInfo.xcprivacy` at the bundle root, and the appex's at
   `PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy`. For each: `NSPrivacyTracking == false`,
   `NSPrivacyTrackingDomains` empty. App additionally declares `CA92.1` (UserDefaults), `E174.1`
   (DiskSpace) and `C617.1` (FileTimestamp); the widget declares at minimum `CA92.1`. Run: fails, no
   `.xcprivacy` anywhere in the target (only three vendored ones).
2. Write `Patina/PrivacyInfo.xcprivacy` (tracking false, domains empty, collected data types =
   email / user ID / photos-or-videos / product interaction, all Linked and non-Tracking; the three API
   categories above) and `PatinaWidget/PrivacyInfo.xcprivacy`. Both folders are
   `PBXFileSystemSynchronizedRootGroup`s, so no pbxproj edit is needed for membership — assert the copy
   rather than assume it.
3. Run `ios-gate.sh unit`; confirm both files land in the built `.app`.
4. `git add apps/mobile/Patina/Patina/PrivacyInfo.xcprivacy apps/mobile/Patina/PatinaWidget/PrivacyInfo.xcprivacy apps/mobile/Patina/PatinaTests/PrivacyManifestTests.swift` ·
   `fix(first-flight): ship a privacy manifest for the app and the widget appex (A2-02, D15)`

### T7 — One source for the permission strings  · A2-12, G-07

1. **Failing test first.** New `PatinaTests/PermissionStringTests.swift`: every `NS*UsageDescription` the
   app can trigger is present and non-empty in the **merged** plist, and `Patina/Info.plist` on disk
   declares **none** of them (one source, no shadowing). Run: fails — the tracked plist still declares
   five.
2. Move `NSFaceIDUsageDescription` and `NSPhotoLibraryAddUsageDescription` into the build settings as
   `INFOPLIST_KEY_*` (both Patina configs), keeping the wording that ships today; delete the five
   permission keys from `Patina/Info.plist`, leaving `CFBundleURLTypes` and T5's key.
   **Wording is not changed** — L1-E rewrites it (note N1 carries all seven sentences verbatim).
3. Run `ios-gate.sh unit`.
4. `git add apps/mobile/Patina/Patina.xcodeproj/project.pbxproj apps/mobile/Patina/Patina/Info.plist apps/mobile/Patina/PatinaTests/PermissionStringTests.swift` ·
   `fix(first-flight): one source for the permission strings (A2-12, G-07)`

### T8 — Drop the hard-set signing identity  · A2-23

1. Remove `CODE_SIGN_IDENTITY = "Apple Development"` from the four target configurations that pin it
   (`Patina` Debug/Release, `PatinaWidget` Debug/Release) so it inherits under `CODE_SIGN_STYLE =
   Automatic`. There is no unit-testable surface — the proof is Kody's export in R1 (note N4).
2. Run `ios-gate.sh release` and `ios-gate.sh unit` (regression only).
3. `git add apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` ·
   `fix(first-flight): let signing identity inherit under automatic signing (A2-23)`

### T9 — The asset catalogue: accent, launch ground, and the empty appiconset  · A2-10, A2-14, C-29, A2-22

L0.1 owns `Assets.xcassets` for W0; L1-D consumes what this task creates and does not edit the catalogue.

1. Give `AccentColor.colorset` real light/dark values from `PatinaColors` — light `#9F7E48` (`clayDeep`),
   dark `#C4A57B` (`clay`); today the colorset is `{"colors":[{"idiom":"universal"}]}` and
   `assetutil --info` finds no AccentColor in the compiled `Assets.car` at all, so every system control
   tints iOS blue.
2. Add `LaunchBackground.colorset` — light `#FAF7F2` (`offWhite`), dark `#211E1B`
   (`DarkPalette.background`) — and set `INFOPLIST_KEY_UILaunchScreen_UIColorName = LaunchBackground`
   on both Patina configs, so the cold-launch slab is the app's ground and not pure white / pure black.
3. Delete `Patina/Assets.xcassets/AppIcon.appiconset` — three 1024×1024 entries with **no `filename`
   key**, i.e. zero images. `Patina/Resources/AppIcon.icon` is what actually compiles;
   `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` stays and now resolves unambiguously.
4. Run `ios-gate.sh build`, then `assetutil --info` on the rebuilt `Assets.car` to prove `AccentColor`
   and `LaunchBackground` are now *in* the binary and `AppIcon` still is.
5. `git add apps/mobile/Patina/Patina/Assets.xcassets apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` ·
   `fix(first-flight): real accent colour, launch ground, and drop the empty appiconset (A2-10, A2-14, C-29, A2-22)`

### T10 — The analytics kill switch, and crash reporting  · A2-15, A2-16

1. **Failing test first.** New `PatinaTests/AnalyticsKillSwitchTests.swift`: with
   `AppConfiguration.analyticsEnabled == false` (which is what a Debug test run *is*), calling
   `PostHogService.shared.initialize()` must leave `isFeatureFlagSourceLive == false`. Run: fails —
   today `initialize()` bails only on an empty API key, and `Secrets.postHogAPIKey` is set, so a Debug
   run configures a client against the **production** project.
2. Gate `initialize()` on `AppConfiguration.analyticsEnabled` and gate the `PatinaApp.init()` call site
   on it too (A2-15 — `analyticsEnabled` has had zero callers since it was written). Enable PostHog
   error tracking (A2-16): `@_spi(Experimental) import PostHog` and
   `config.errorTrackingConfig.autoCapture = true` — verified against the vendored posthog-ios 3.48.0
   (`PostHogConfig.swift:174-175`, `getIntegrations()` at `:238`).
3. Run `ios-gate.sh unit`, then `ios-gate.sh release` (the `@_spi` import must survive whole-module
   optimisation).
4. `git add apps/mobile/Patina/Patina/App/Configuration/AppConfiguration.swift apps/mobile/Patina/Patina/Services/Analytics/PostHogService.swift apps/mobile/Patina/Patina/PatinaApp.swift apps/mobile/Patina/PatinaTests/AnalyticsKillSwitchTests.swift` ·
   `fix(first-flight): make the analytics kill switch real and turn on error tracking (A2-15, A2-16)`

### T11 — `house-first` is on at first launch  · **D1a**

Read `FeatureFlags.swift`'s header before touching it: resolution is **once at launch, synchronously,
before the root is chosen, held for the session**. That contract does not change — only what a flag
resolves to when PostHog has nothing to say.

1. **Failing test first.** New `PatinaTests/FeatureFlagsDefaultTests.swift`, the four cases D1a names:
   fresh install (no payload, no argument) → `house-first` **true**, the other two false; a PostHog
   payload saying `false` → false (the kill switch); a payload saying `true` → true; `-PatinaFlags`
   naming only `direct-orders` → `house-first` **false** (the argument stays authoritative for every
   flag). Run: three of four fail.
2. Implement: a `Flag` → `Bool` default table (`house-first: true`, `direct-orders: false`,
   `house-widget: false`) consulted **only** when the provider has no answer. That needs a three-state
   provider — `FeatureFlagProvider` answers `Bool?`, `nil` = "PostHog has never been told about this
   key". `PostHogSDK.getFeatureFlagResult` already returns `nil` for an unknown key (verified in the
   vendored SDK, `PostHogSDK.swift:1453,1471`), so the mechanism exists and is not invented here.
   `--uitesting` stays all-off unless named; `-PatinaFlags` stays authoritative in DEBUG.
3. `FeatureFlagsTests.swift` pins the *old* two-state semantics in two of its cases and must be
   re-pinned to the ruling — it is the same file family, no other W0 lane owns it, and leaving it
   untouched leaves the tier red.
4. Run the **whole** `PatinaTests` tier.
5. `git add apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift apps/mobile/Patina/Patina/Services/Analytics/PostHogService.swift apps/mobile/Patina/PatinaTests/FeatureFlagsDefaultTests.swift apps/mobile/Patina/PatinaTests/FeatureFlagsTests.swift` ·
   `feat(first-flight): house-first defaults on when PostHog has no answer (D1a)`

### T12 — `ExportOptions.plist`  · A2-07, A2-24, G-12 (prep for Kody's export)

1. Write `apps/mobile/Patina/scripts/ExportOptions.plist` **exactly** as `PROGRAM.md` §4 Step 3 prints
   it — `app-store-connect`, `export`, `VP22LXHT7L`, `automatic`, symbols up, Swift symbols stripped,
   `manageAppVersionAndBuildNumber` **false** (the build number comes from `Config/Version.xcconfig` and
   nothing else may move it), `generateAppStoreInformation` false.
2. `plutil -lint` it. No unit test — this file is only exercised by Kody's `-exportArchive`.
3. `git add apps/mobile/Patina/scripts/ExportOptions.plist` ·
   `chore(first-flight): add the app-store-connect ExportOptions.plist (A2-07)`

### T13 — Close: the whole tier, the delta lint, the notes, the runbook

1. `ios-gate.sh build` · `ios-gate.sh release` · the whole `PatinaTests` tier on `8ED58095-…` ·
   `ios-gate.sh lint-delta main` · re-prove `unit` refuses with `IOS_GATE_UDID` unset.
2. Write `build/waves/w0/l01-notes.md` (N1–N4, exact final text) with the Write tool — **never** a Bash
   heredoc; the prod-mutation hook pattern-matches inside heredocs and aborts mid-file.
3. Report every Kody-run step as a complete, placeholder-free command.
4. **This file and `l01-notes.md` are NOT committed by this lane.** They live under
   `artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/` in the **main checkout**
   `/Users/kody/Code/patina-merged`, which is where the brief puts them and where no lane may run git
   (Hard Rule 2 — a peer session may be live there). The W0 closer commits `build/waves/w0/` with the
   rest of the wave (PROGRAM.md §7 step 7).

---

## Deviations from this plan, as executed

Recorded rather than silently absorbed.

| task | planned | what actually happened, and why |
|---|---|---|
| **T9** | set `INFOPLIST_KEY_UILaunchScreen_UIColorName = LaunchBackground` (A2-14's fix, verbatim) | The setting **resolves** — `xcodebuild -showBuildSettings` prints it — but this toolchain does not write it through: the merged plist stayed `UILaunchScreen = { UILaunchScreen = {} }` across a forced regeneration. `INFOPLIST_KEY_UILaunchScreen_Generation` was therefore removed from both configurations and `UILaunchScreen` declared directly in `Patina/Info.plist`, which produces `UILaunchScreen = { UIColorName = LaunchBackground }`. Pinned by `ReleaseConfigurationTests.launchScreenHasTheAppGround` and handed to L1-D in N2 so the launch mark goes in the same dict. |
| **T7** | "drop `NSPhotoLibraryUsageDescription` unless the app really reads the library" (A2-12's fix) | The condition is met — there is no `PHPicker` / `PHPhotoLibrary` / `UIImagePickerController` call site anywhere — but the key was **kept**. It is a string a homeowner reads, the brief scopes this task as *moving* the strings to one source with the wording unchanged and names seven of them, and dropping a key is L1-E's call. Filed in N1 with the evidence and the exact one-line follow-up. |
| **T11** | `FeatureFlagsDefaultTests` (new) | Also touched `PatinaTests/FeatureFlagsTests.swift` and `PatinaTests/FeatureFlagMirrorTests.swift`: their stubs conform to `FeatureFlagProvider`, whose one method changed shape, and `FeatureFlagsTests` pinned the old two-state semantics in a case whose name ("no cached payload") became untrue. No other W0 lane owns those files; leaving them would have left the tier red. |
| **T6** | app manifest asserts `CA92.1` + `E174.1` + `C617.1`; widget "at minimum `CA92.1`" | Implemented exactly that split. The widget's `CA92.1` is **conservative, not required**: `PatinaWidget/` and `PatinaWidgetShared/` contain no `UserDefaults`, no disk-space and no file-timestamp call — the appex reads a JSON file out of the App Group container — and `PatinaDesignKit` has none either. `A2-02`'s "it does, via the App Group" does not hold for today's widget code. Over-declaring is safe; under-declaring is ITMS-91053. |

---

## Not this wave, because…

| id | why |
|---|---|
| `A2-07` | The dry-run archive is **Kody's** — it needs an authenticated Xcode account, `-allowProvisioningUpdates` round trips to ASC and a keychain that can prompt. This lane makes `archive` a tier, proves `release`, and hands over. Reported *pending archive*, never done. |
| `A2-24` / `G-12` | `aps-environment: production` can only be read off the **exported** `.app`. Reported *pending export*. The source entitlement stays `development` on purpose — automatic signing rewrites it at export, and changing the source file without seeing an export would be guessing. |
| `A2-21` | Three names for one product: the half that matters is the **ASC record rename** (`Patina Design` → `Patina`), which is L0.5 / Kody. The plist half — `CFBundleURLName = com.patina.app` while the bundle id is `cloud.patina.app` — is cosmetic (`CFBundleURLName` is a label, not a matcher) and the scheme `patina://` is unaffected; changing it is a copy call that belongs with L1-E's naming pass. Filed in N1. |
| `A2-08` / `A2-09` | `wave: W2`, `tier: T1` in `findings.json`. The steward's per-worktree `Secrets.swift` copy and the run-it-twice rule cover W0. Not touched; `.gitignore` lines 53 and 57 are left alone. |
| `A2-20` | Age rating — answered in ASC by L0.5. This lane owns only the note that the app really does ship messaging and UGC. |
