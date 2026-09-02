# First Flight · W0 · L0.1 — integration notes out

Four notes. Each carries the **exact final text** or the exact command; the owning lane applies it as a
numbered task in its own list. An integration note nobody scheduled is not a plan.

Branch `first-flight/w0-l01`, base `3b7916db1`.

---

## N1 → **L1-E** (W1 · copy) — the seven permission sentences

L0.1 moved every `NS*UsageDescription` to **one** source: the
`INFOPLIST_KEY_NS*UsageDescription` build settings on the `Patina` target, Debug **and** Release
(`apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`). `Patina/Info.plist` declares none of them any
more, and `PatinaTests/PermissionStringTests` fails if it ever does again.

**Wording was not touched.** These are the seven strings exactly as they ship today, read out of the
merged as-built plist (`plutil -p …/Patina.app/Info.plist`), for L1-E to rewrite:

| key | shipped sentence |
|---|---|
| `NSCameraUsageDescription` | `Patina uses your camera to walk through your space together and visualize furniture in your room.` |
| `NSFaceIDUsageDescription` | `Patina uses Face ID to securely confirm sign-in requests from the web` |
| `NSMicrophoneUsageDescription` | `Have a voice conversation with Patina about your space and style.` |
| `NSMotionUsageDescription` | `Patina uses motion data to detect when your device is steady for capturing the best room photos.` |
| `NSPhotoLibraryAddUsageDescription` | `Patina saves AR previews and room captures to your photo library when you ask` |
| `NSPhotoLibraryUsageDescription` | `Save room designs and furniture visualizations to your photo library.` |
| `NSSpeechRecognitionUsageDescription` | `Speak naturally with Patina instead of typing.` |

Three things L1-E should know before rewriting:

1. **The build settings win, so L0.1 pastes what you return.** Send the replacement sentences as an
   integration note back to whoever owns `project.pbxproj` in W1; do not edit `Patina/Info.plist` — a
   string added there is read by nobody.
2. **`A2-12`'s own fix line asks for two things this lane did not do**, because both are wording calls,
   not configuration:
   - *"rewrite each string as 'Patina uses X to Y.'"* — the mic and speech strings are imperatives to
     the user (*"Have a voice conversation…"*, *"Speak naturally…"*) rather than statements of use.
     They are the app's first sentence about itself and they read as marketing.
   - *"drop `NSPhotoLibraryUsageDescription` unless the app really reads the library"* — **it does
     not.** `grep -rn "PHPickerViewController\|PHPhotoLibrary\|UIImagePickerController\|PhotosPicker"
     apps/mobile/Patina/Patina/` returns nothing; the only photo-library call site is
     `UIImageWriteToSavedPhotosAlbum` at
     `Patina/Features/ARPlacement/Services/ARPlacementManager.swift:199`, which is *Add*, covered by
     `NSPhotoLibraryAddUsageDescription`. The read string is kept for now so nothing regresses on a
     string a homeowner sees; deleting it is a one-line follow-up and `PermissionStringTests.required`
     is where to drop the key at the same time.
3. **`NSMotionUsageDescription` is real** — `CMMotionManager` at `Features/Walk/Services/`
   `FrameCaptureService.swift:52` and `Features/RoomScan/ViewModels/ScanViewModel.swift:80,555`.
   `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` have **no first-party call
   site today** (`import Speech`, `SFSpeechRecognizer`, `AVAudioEngine`, `requestRecordPermission` all
   return nothing). Kept, because a missing usage string terminates the process the moment the API is
   reached, and the Companion voice path is a live product intention — but they are candidates for the
   same follow-up.

Also in L1-E's naming pass, from `A2-21`: `Patina/Info.plist` still sets
`CFBundleURLName = com.patina.app` while the bundle id is `cloud.patina.app`. It is a label, not a
matcher — the `patina://` scheme is unaffected — so L0.1 left it. The half of A2-21 that matters is the
**App Store Connect rename** (`Patina Design` → `Patina`), which is L0.5 / Kody.

---

## N2 → **L1-D** (W1 · tokens, dark mode, contrast) — two new asset-catalogue tokens

**L0.1 owns `Patina/Assets.xcassets` for W0. L1-D consumes what is there and does not edit the
catalogue.** As of `first-flight/w0-l01` it contains exactly two colorsets and nothing else:

| asset | light | dark | source token |
|---|---|---|---|
| `AccentColor` | `#9F7E48` | `#C4A57B` | `PatinaColors.clayDeep` / `PatinaColors.clay` — i.e. `PatinaColors.Text.interactive` |
| `LaunchBackground` | `#FAF7F2` | `#211E1B` | `PatinaColors.offWhite` / `PatinaColors.DarkPalette.background` — i.e. `PatinaColors.Background.primary` |

What this changes for L1-D's work:

1. **`AccentColor` is now a real global tint.** Before, the colorset was
   `{"colors":[{"idiom":"universal"}]}` — an entry with no `color` value — and
   `xcrun assetutil --info Assets.car` listed **no** `AccentColor` at all, so every untinted system
   affordance drew iOS blue: text caret and selection, alert default button, `Link`, swipe actions,
   `Toggle`, date pickers, sheet grabbers, refresh spinners. `assetutil --info` on the rebuilt
   `Assets.car` now lists `AccentColor` and `LaunchBackground` as `Color` entries alongside the
   `AppIcon` groups. **Re-look at the 25 `.tint(` call sites before adding any more** — several may now
   be redundant, and a `.tint(...)` that repeats the accent is a token drift risk, not a fix.
2. **`C-29` is only half closed.** The launch ground now matches the app in both appearances, which
   removes the pure-white/pure-black slab. C-29 also asks for **the PATINA mark** on the launch screen
   so launch and splash are one continuous image. That needs an image asset that does not exist — the
   Welcome-screen mark is drawn in code, and `Assets.xcassets` has no image set at all. **This is
   L1-D's call and L1-D's asset**, and it must be added to `Patina/Assets.xcassets` plus
   `UILaunchScreen.UIImageName` in `Patina/Info.plist` (see point 3). L0.1 makes no claim about it.
3. **The launch screen is configured in `Patina/Info.plist`, not in a build setting.**
   `INFOPLIST_KEY_UILaunchScreen_UIColorName` *resolves* — `xcodebuild -showBuildSettings` prints
   `INFOPLIST_KEY_UILaunchScreen_UIColorName = LaunchBackground` — but this toolchain does not write it
   through: the merged plist stayed `UILaunchScreen = { UILaunchScreen = {} }` across a forced
   regeneration. So `INFOPLIST_KEY_UILaunchScreen_Generation` was removed from both configurations and
   the dictionary is declared directly:

   ```xml
   <key>UILaunchScreen</key>
   <dict>
       <key>UIColorName</key>
       <string>LaunchBackground</string>
   </dict>
   ```

   which produces `UILaunchScreen => { UIColorName => LaunchBackground }` in the built plist, asserted
   by `ReleaseConfigurationTests.launchScreenHasTheAppGround`. **Add `UIImageName` to that same dict**
   — do not try the build setting.
4. **`AppIcon.appiconset` is gone** (A2-22). `Patina/Resources/AppIcon.icon` is what compiles and
   `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` still points at it. Nothing to do; noted so nobody
   re-creates the empty set.
5. **Not fixed, and not L0.1's:** the built product still emits `AppIcon76x76@2x~ipad.png` and a
   `CFBundleIcons~ipad` key even with `TARGETED_DEVICE_FAMILY = 1`, because the Icon Composer `.icon`
   file declares the pad idiom. `UIDeviceFamily` is `[1]`, which is what validation reads, so this is
   cosmetic. Filed here rather than fixed.

**A colour claim this lane does not make:** the launch flash was verified in the **plist**, not on
glass. Nobody has screenshotted the first 300 ms since the change. That is a walker's job on a
**signed** Debug build — never the `CODE_SIGNING_ALLOWED=NO` product in
`apps/mobile/Patina/.build/DerivedData`.

---

## N3 → **L0.6 (PostHog) and Fable** — ⚠ D1a and "0% rollout" contradict each other

**This is the one note in this set that can silently undo a ruling.**

`PROGRAM.md` §3 L0.6 step 2 says: *"Set each to **0% rollout**, no cohort, no individual overrides for
round one (D1). Do not delete them — `FeatureFlags.resolveAtLaunch()` reads PostHog's cached payload
and a missing key resolves false anyway, but an explicit 0% flag is the auditable state."*

That was written when every flag was fail-closed. **D1a changed the rule underneath it**, and D1a's own
kill-switch clause is what bites:

- D1a: `house-first` resolves **true** when PostHog has **no answer**; *"A PostHog payload that says
  `false` still wins (kill switch)."*
- PostHog's flags payload does not omit a flag that evaluates false — it returns it **with the value
  `false`**. A 0%-rollout flag therefore arrives as an *answer*, not as silence.
- So: **launch 1** (no cached payload) → tab bar on. **Launch 2 onward** (payload cached, `house-first:
  false`) → kill switch fires → **tab bar off**. Every tester loses the four-tab root on their second
  open, and D1 — "house-first is ON for every tester" — is broken by a dashboard setting rather than by
  code.

**What L0.6 should do instead:**

1. `house-first` → **100% rollout, everyone**, active. Not 0%.
2. `direct-orders` → 0%, active. `house-widget` → 0%, active. (Both stay fail-closed, matching D1 and
   the D5 note that the widget renders its snapshot regardless of the flag.)
3. The kill switch is then real and one click: drop `house-first` to 0% and the next launch turns the
   tab bar off with no build.

**The probe that settles it, and it is the one L0.6 already plans.** L0.1 made the resolution log say
which branch answered — `posthog-cache` when PostHog had an opinion about at least one flag,
`defaults` when it had none:

```
[FeatureFlags] resolved via posthog-cache: on=[house-first]
```

Launch the build with **no** `-PatinaFlags` argument, twice (the second launch is the one that reads a
cached payload), and read the line. `defaults` on launch 2 means PostHog is not answering at all;
`posthog-cache` with `house-first` absent from `on=[…]` is the contradiction above, live.

**Fix round, 2026-09-02 — `RL01-02`. That probe could not be run on the build it is about.**
`logResolution`'s body was inside `#if DEBUG`, so the line did not exist in a Release binary at all; and
in a Debug build `AppConfiguration.analyticsEnabled` is false, so the provider always answers nil and
the source could only ever print `defaults`. Between the two, the line could never once have printed
`posthog-cache` — the exact word the probe exists to look for.

It is now emitted **unconditionally at `PatinaLog.ui.notice`**. `notice` is os_log's default level and
the lowest one that survives into a Release log archive, so Console (or
`log stream --predicate 'subsystem == "com.patina.app" AND category == "ui"'`) reads it straight off a
TestFlight device. The `notice` level is new on `PatinaLogger`, added for this; `debug` and `info` are
unchanged and still the right home for everything else.

**It carries no PII, which is what makes shipping it at a persisted level safe.** The message is a
branch name (`launch-arguments` / `posthog-cache` / `defaults`) and the flag **keys** that resolved on —
`house-first`, `direct-orders`, `house-widget`. No user id, no PostHog distinct id, no payload, no
account state. Every other debug-only detail in the file stays gated: `overrideFlags`' `-PatinaFlags`
parsing is still `#if DEBUG`, and the App Group unavailability line is still `.debug`.

**Confidence.** The code side is verified in this worktree; the PostHog side is reasoned from how
PostHog evaluates flags, **not** observed — L0.1 does not touch the PostHog project, read-only or
otherwise. Treat the recommendation as a decision for Kody, and the two-launch probe as the evidence.

Two smaller items for the same lane:

- **A2-16's project half is still open.** L0.1 turned the SDK on
  (`config.errorTrackingConfig.autoCapture = true`, `@_spi(Experimental) import PostHog`). Without
  **Error tracking enabled on PostHog project 326191**, build 1 — the crash-discovery round — still
  reports nothing. Crashes persist to disk and arrive as `$exception` on the *next* launch, so a
  tester who crashes and uninstalls is invisible either way.
- **A2-15's Debug/prod split is closed in code.** `AppConfiguration.analyticsEnabled` is now actually
  gated on, in `initialize()` and at the `PatinaApp` call site, so a Debug launch configures no client
  at all. L0.6 step 5 ("a Debug launch must produce zero events in the live feed") should now pass —
  and note that this also means **flags never resolve from PostHog in Debug**, so a local walk that
  wants the old root must pass `-PatinaFlags ""` or name flags explicitly.
  **`RL01-01` — ACCEPTED as shipped, fix round 2026-09-02.** The consequence the reviewer flagged (a
  Debug build reads `onboarding_walk_first` and `ios_screen_name_v2` as false because
  `PostHogService.isFeatureEnabled` returns false with no client, so every Debug walk sees quiz-first
  onboarding while a Release tester may resolve walk-first from the live payload) is correct and is
  the right trade: keeping PostHog off in Debug is the whole point of A2-15, and the alternative — a
  Debug build reporting into the production project — is the defect. It is carried as a **fact in the
  walker's brief**, not as a code change: runbook **H3** already tells walkers that a Debug walk reads
  `onboarding_walk_first` as false and that this is expected.

---

## N4 → **Fable / R1** — what this lane cannot close, and who closes it

Three rows in L0.1's table are **pending Kody's archive and export**, not done. They are reported at
that level and nowhere claimed as passing.

| id | what is still unproven | closed by |
|---|---|---|
| `A2-07` | the archive path itself — whole-module optimisation over 92k LOC, the `Stamp Git SHA` phase under `CONFIGURATION != Debug`, distribution signing with an embedded appex, `ENABLE_NS_ASSERTIONS=NO`, dSYM emission. `ios-gate.sh release` proves the **compile**; it does not prove the archive. | R1 Step 2 |
| `A2-24` / `G-12` | `aps-environment` in the **exported** `.app`. The source entitlement still says `development` on purpose — automatic signing is expected to rewrite it at export, and changing the source file without having seen an export would be guessing. If the export still says `development`, that is the moment to split Debug/Release entitlements (`C9-20`) and re-archive. | R1 Step 3 |
| `A2-23` | that removing the pinned `CODE_SIGN_IDENTITY = "Apple Development"` actually yields a distribution-signed IPA. | R1 Step 3 |

`ios-gate.sh archive` exists as a tier now and is **not** a lane or steward command — it needs an
authenticated Xcode account, `-allowProvisioningUpdates` round trips to App Store Connect and a
distribution keychain that can prompt.

**One gate-behaviour change every other lane must know:** `ios-gate.sh unit`, `ui` and `all` now
**refuse to run** without `IOS_GATE_UDID`, exiting 2. Before this commit `sim_destination()` scraped
`xcrun simctl list devices available | grep -iE 'iPhone (17|16|Air)' | grep -oE '[0-9A-F-]{36}' |
head -1`, which on this machine resolves to **`973D1724-90BF-4A0A-B02D-481D561547B3` — the protected
review device** (measured, not assumed). Every lane exports its own clone udid; the steward's §3 table
is the source. Every `xcodebuild` invocation in the script also gains
`-derivedDataPath "$PROJECT_DIR/.build/DerivedData"`, so lanes no longer share one tree.

---

## Kody-run steps this lane creates

For the W0 closer to fold into `build/waves/w0/KODY-RUNBOOK.md`. Nothing below was run by an agent.
Every path is absolute and every value is real — no placeholder.

### K-L01-1 · The `A2-07` archive dry run (W0, day 1) — and again as R1 Step 2

```bash
cd /Users/kody/Code/patina-merged
export IOS_GATE_UDID=973D1724-90BF-4A0A-B02D-481D561547B3
apps/mobile/Patina/scripts/ios-gate.sh archive
```

Run it against a checkout that has `first-flight/w0-l01` merged; on `main` as it stands today it dies
at compile (G-01). `IOS_GATE_UDID` is unused by `archive` — it is exported because the same session
runs the other tiers.

### K-L01-2 · Read the archive before exporting it

```bash
A=/Users/kody/Code/patina-merged/apps/mobile/Patina/.build/archives/Patina.xcarchive
plutil -p "$A/Products/Applications/Patina.app/Info.plist" | grep -E 'CFBundleVersion|CFBundleShortVersionString|MinimumOSVersion|UIDeviceFamily|ITSAppUsesNonExemptEncryption|UILaunchScreen'
plutil -p "$A/Products/Applications/Patina.app/PlugIns/PatinaWidget.appex/Info.plist" | grep CFBundleVersion
find "$A/Products/Applications/Patina.app" -name PrivacyInfo.xcprivacy
ls "$A/dSYMs/"
```

Want: `CFBundleVersion 3` on **both** plists · `CFBundleShortVersionString 1.0` ·
`MinimumOSVersion 26.0` · `UIDeviceFamily [1]` · `ITSAppUsesNonExemptEncryption 0` ·
`UILaunchScreen { UIColorName = LaunchBackground }` · `PrivacyInfo.xcprivacy` at **both**
`Patina.app/PrivacyInfo.xcprivacy` and `Patina.app/PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy`
(the vendored `PostHog_PostHog.bundle`, `PLCrashReporter_CrashReporter.bundle` and
`swift-crypto_Crypto.bundle` copies will also be listed — they are not the two that matter).

### K-L01-3 · Export, then read the entitlements — the check that exists nowhere else

```bash
xcodebuild -exportArchive \
  -archivePath /Users/kody/Code/patina-merged/apps/mobile/Patina/.build/archives/Patina.xcarchive \
  -exportOptionsPlist /Users/kody/Code/patina-merged/apps/mobile/Patina/scripts/ExportOptions.plist \
  -exportPath /Users/kody/Code/patina-merged/apps/mobile/Patina/.build/export \
  -allowProvisioningUpdates
```

```bash
E=/Users/kody/Code/patina-merged/apps/mobile/Patina/.build/export
unzip -o -q "$E/Patina.ipa" -d "$E/unzipped"
codesign -d --entitlements :- "$E/unzipped/Payload/Patina.app" 2>/dev/null | grep -E 'aps-environment|get-task-allow|application-identifier|application-groups'
codesign -d --entitlements :- "$E/unzipped/Payload/Patina.app/PlugIns/PatinaWidget.appex" 2>/dev/null | grep -E 'application-identifier|application-groups'
```

Want on the app: `aps-environment = production`, **no** `get-task-allow`,
`VP22LXHT7L.cloud.patina.app`, `group.cloud.patina.app`. On the appex:
`VP22LXHT7L.cloud.patina.app.widget`, `group.cloud.patina.app`, no `aps-environment`.

**If `aps-environment` is still `development`, stop.** Push registers sandbox tokens and the R1 push
round trip silently never arrives. That is the moment to split the Debug/Release entitlements files
(`C9-20`) and re-archive — not to ship and hope.

### K-L01-4 · Confirm the build number is above the floor, before the archive

```bash
~/.blitz/bin/asc builds list --app 6762007888 --paginate
grep -n 'CURRENT_PROJECT_VERSION\|MARKETING_VERSION' /Users/kody/Code/patina-merged/apps/mobile/Patina/Config/Version.xcconfig
```

`CURRENT_PROJECT_VERSION` (3) must be **strictly greater** than every number `builds list` returns.
Today that list holds exactly one row, version `"2"`, uploaded 2026-05-12, `processingState VALID`,
`expired true`.

### K-L01-5 · PostHog project 326191 — see **N3** before setting any rollout

Not a shell command; a dashboard decision, and it is the one that can undo D1. In short:
`house-first` → **100%**, `direct-orders` → 0%, `house-widget` → 0%, and turn **Error tracking** on
for the project or build 1 reports no crashes at all.
