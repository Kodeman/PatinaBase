# Wave 0.5 review — TestFlight distribution path (`feat/field-companion-w05`)

Reviewed against `git diff origin/main...origin/feat/field-companion-w05` (13 files,
+1152/-710, dominated by a deterministic `project.pbxproj` UUID-shift). Verification
method: read every changed file at HEAD of both branches, then **empirically
rebuilt** the regenerated Xcode project in an isolated scratch copy (not the
worktree) for Debug and Release / Simulator, twice (with and without a real
`Secrets.xcconfig`), and inspected the built `.app` bundle's `Info.plist` and
`PrivacyInfo.xcprivacy` directly. Evidence beats the implementer's narrative
throughout below.

## Verdict: **MERGE-WITH-FIXES**

Two real fixes needed before merge (both low-effort, both documentation/accuracy,
neither blocks the archive/export mechanism itself, which I proved works). One
open item (codesign identity) can't be verified without Kody's Apple Distribution
certificate and isn't a merge blocker — flag it for a follow-up device/CI check.

---

## 1. Secrets hygiene — HIGHEST PRIORITY

**Clean. No real secret found anywhere in the diff or the regenerated project files.**

- `git diff origin/main...origin/feat/field-companion-w05 | grep -nE "phc_[A-Za-z0-9]{10,}|sbp_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{10,}|supabase\.co|BlitzKey"` — **zero matches**.
- Only `Secrets.xcconfig.example` is tracked (`POSTHOG_API_KEY = phc_REPLACE_WITH_POSTHOG_PROJECT_KEY` — a placeholder, `apps/mobile/Capture/Capture/App/Configuration/Secrets.xcconfig.example:13`). The real `Secrets.xcconfig` is not in the tree (`git ls-tree` on the branch tip shows only the `.example` file next to the pre-existing `Secrets.example.swift`).
- `.gitignore` pattern verified functional, not just present: `apps/mobile/Capture/.gitignore:6` adds `Capture/App/Configuration/Secrets.xcconfig`, and `git check-ignore -v Capture/App/Configuration/Secrets.xcconfig` inside the worktree confirms the match (`apps/mobile/Capture/.gitignore:6:Capture/App/Configuration/Secrets.xcconfig	Capture/App/Configuration/Secrets.xcconfig`).
- Regenerated `Capture.xcodeproj/project.pbxproj` and `Capture.xcscheme` contain no literal keys — only file references and build-setting *names* (`POSTHOG_API_KEY`), never values. Team ID `VP22LXHT7L` and bundle ID `cloud.patina.field` appear (both already public/known, not secrets).

**Finding S1 (informational, not a blocker):** ASC key material (`ASC_KEY_ID`,
`ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH`) is correctly kept as env-var-only, never
written to disk by the script. Good.

---

## 2. Build-time PostHog key mechanism (xcconfig `#include?` + `$(POSTHOG_API_KEY)`)

**Mechanism works — proven empirically, not just read.** I copied the branch's
`apps/mobile/Capture` (plus its sibling `apps/mobile/PatinaDesignKit` local SPM
dependency) into scratch space, ran `ruby scripts/generate_project.rb`, and built:

| Build | Secrets.xcconfig | Result | `Info.plist` `POSTHOG_API_KEY` |
|---|---|---|---|
| Release, iphonesimulator, `CODE_SIGNING_ALLOWED=NO` | absent | **BUILD SUCCEEDED** | `""` (empty string, not the literal `$(POSTHOG_API_KEY)`) |
| Release, same | `POSTHOG_API_KEY = phc_test_fixture_1234567890` | **BUILD SUCCEEDED** | `"phc_test_fixture_1234567890"` |
| Debug, same | present (as above) | **BUILD SUCCEEDED** | `"phc_test_fixture_1234567890"` |

So: both Debug and Release resolve correctly, the `#include?` layering works, and
absence of `Secrets.xcconfig` produces an **empty string**, not an unresolved
`$(...)` token — because `POSTHOG_API_KEY =` (empty) is unconditionally defined
in the base `BuildSettings.xcconfig` (`apps/mobile/Capture/Capture/App/Configuration/BuildSettings.xcconfig:19`), so Xcode's Info.plist variable substitution always has a value to substitute, even if empty.

`generate_project.rb` regen wiring confirmed correct: `app.build_configurations.each do |c| ... c.base_configuration_reference = build_settings_xcconfig_ref` (`apps/mobile/Capture/scripts/generate_project.rb:78-80`) runs inside the loop over **all** the app target's build configurations (Debug and Release both) — verified in the regenerated `project.pbxproj`, which shows exactly two `baseConfigurationReference = 4B6826371A60DDDA411A77F01CC3E554 /* BuildSettings.xcconfig */;` lines (one per configuration).

`AppConfiguration.postHogAPIKey` fails closed correctly (`apps/mobile/Capture/Capture/App/Configuration/AppConfiguration.swift:138-143`): it trims and checks `!fromInfoPlist.isEmpty` before using the Info.plist value, so the empty-string case (no `Secrets.xcconfig`) correctly falls through to the `Secrets.swift`/env-var/`""` chain rather than shipping an empty key to PostHog. **Confirmed empirically above** — this isn't just a code-read, the built bundle actually resolves to `""` and the guard is exercised as designed.

**Finding S2 (Low severity, High confidence) — inaccurate mechanism documentation, in TWO files:**
Both `BuildSettings.xcconfig:6` ("...reaches Info.plist via `INFOPLIST_KEY_*`...") and `BuildSettings.xcconfig:12` (an "empty `INFOPLIST_KEY_POSTHOG_API_KEY`") and `Secrets.xcconfig.example:7` ("...makes it into `INFOPLIST_KEY_POSTHOG_API_KEY` -> Info.plist...") describe the **wrong mechanism**. There is no `INFOPLIST_KEY_POSTHOG_API_KEY` anywhere in this diff — `Info.plist:10-11` uses a **literal** `$(POSTHOG_API_KEY)` substitution against the raw `POSTHOG_API_KEY` build setting (standard Xcode Info.plist variable substitution, independent of `GENERATE_INFOPLIST_FILE`'s `INFOPLIST_KEY_*` auto-population, which only covers Apple's own known keys). This is exactly what `AppConfiguration.swift`'s own comment (lines 128-134) and `generate_project.rb:86-91`'s comment correctly describe — those two are accurate; `BuildSettings.xcconfig` and `Secrets.xcconfig.example` contradict them. Functionally harmless (proven above — the real mechanism works regardless of what the comment claims), but confusing for the next engineer who trusts the xcconfig header over the Swift comment, and worth a one-line fix before merge since it's the exact "here's how this works" doc a teammate reaches for first.

---

## 3. Privacy manifest completeness

**Category coverage looks complete; one reason-code accuracy issue.**

Required-reason API usage found in `Capture/` + `CaptureKit/` + `CaptureKitMocks/`:

- **UserDefaults** (`NSPrivacyAccessedAPICategoryUserDefaults`, declared `CA92.1` — own app/app-group data — `PrivacyInfo.xcprivacy:18`): all live usages are `UserDefaults(suiteName: appGroupID)` or `.standard` — `Capture/Features/Settings/SettingsScreen.swift:17`, `Capture/Services/Session/SupabaseSessionService.swift:36,92`, `Capture/Services/Supabase/SupabaseClientProvider.swift:52`, `CaptureKit/CaptureKit/SiteScan/FieldScanUploadShadowLeg.swift:42-43`, `CaptureKit/CaptureKit/Session/CaptureSessionContext.swift:110,116`. **CA92.1 is the right reason for all of these** — none write data shared outside the app/app group.
- **File timestamp** (`NSPrivacyAccessedAPICategoryFileTimestamp`, declared `C617.1` — display file timestamps to the person using the device — `PrivacyInfo.xcprivacy:26`): three actual call sites use timestamp-category APIs — `CaptureKit/CaptureKit/SiteScan/SiteScanBundleHome.swift:94,105` (`.contentModificationDateKey`, in `sweepOrphans`, an **internal retention sweep** that deletes old scan-bundle directories — never shown to the user), `CaptureKit/CaptureKit/SiteScan/TarArchive.swift:61` and `CaptureKit/CaptureKit/SiteScan/FieldManifestAssembler.swift:85` (both `FileManager.default.attributesOfItem(atPath:)` for `.size` — also internal). The category declaration does cover all three (App Store's automated binary scan only checks that *a* declared reason exists per category used, not per call site), so this **will not block an archive/upload**. But the specific reason chosen, C617.1 ("display... to the person using the device"), doesn't describe any of the three actual uses — none display a timestamp to the user. Apple's approved reason **3B52.1** ("timestamps used only within the app or app group container") matches the real behavior far better.

**Finding P1 (Medium severity, Medium confidence):** `PrivacyInfo.xcprivacy:26` declares reason `C617.1` for the FileTimestamp category, but none of the three actual usages display a timestamp to the user — all three (`SiteScanBundleHome.swift` retention sweep, `TarArchive.swift`/`FieldManifestAssembler.swift` size reads) are internal, in-app-container-only uses. Recommend swapping to `3B52.1`. This won't fail Xcode's static/automated checks (which only validate the category+reason-code pair is one of Apple's approved combinations, not semantic accuracy) but could draw a manual App Review question, and it's simply the more correct declaration regardless.

- No **systemUptime/mach_absolute_time**, **volumeAvailableCapacity/statfs**, or **activeInputModes** usage found anywhere in `Capture/`, `CaptureKit/`, `CaptureKitMocks/` — correctly, and consistently, **not** declared. Good.
- Third-party SDKs (`posthog-ios` >=3.48.0, `supabase-swift` >=2.40.0, both pre-existing dependencies not touched by this diff — `apps/mobile/Capture/scripts/generate_project.rb:203-208`) ship their own bundled `PrivacyInfo.xcprivacy` as SPM resources at those version floors; this is outside the diff's scope and I didn't re-verify the SPM-resolved versions' manifests, but it's not something this PR introduces or needs to fix.

---

## 4. `#if DEBUG` fix around `ResilienceScreens.swift` `#Preview`

**Correct, minimal, and — I confirmed — the only remaining instance of this exact bug class.**

Root cause, confirmed by diffing `origin/main`'s prior version: `apps/mobile/Capture/Capture/Features/Resilience/ResilienceScreens.swift` already gated `import CaptureKitMocks` behind `#if DEBUG` (lines 16-18, pre-existing), but its two `#Preview` blocks at the bottom of the file (which reference `MockSessionProviding()`, a `CaptureKitMocks` type) were **not** gated — a genuine Debug/Release import-vs-usage-scope mismatch. `#Preview` bodies are still type-checked in a normal (non-Previews-canvas) build/archive, so `MockSessionProviding` would be an unresolved symbol in a Release compile. The fix (`+#if DEBUG` / `+#endif` wrapping the two `#Preview`s, diff hunk at `ResilienceScreens.swift:308-329`) closes exactly that gap and nothing else — minimal.

I grepped all 41 `#Preview`-containing files under `Capture/` for `MockSessionProviding`/`CaptureKitMocks` outside `#if DEBUG` guards and individually inspected every hit. **No other file has the mismatched-guard pattern** (import gated, usage not): the other 38 files with `CaptureKitMocks` all wrap **both** the import and the `#Preview` body in one contiguous `#if DEBUG ... #endif` block (e.g. `SettingsScreen.swift:340-359`, `Auth/ConnectWorkspaceScreen.swift:564-574`, etc.).

**Finding D1 (Low severity, High confidence) — pre-existing, out of this diff's blast radius, but worth a follow-up:** Two files, `Capture/Features/Capture/ViewfinderScreen.swift:15` and `Capture/Features/Resilience/LowLightTorchOverlay.swift:13`, import `CaptureKitMocks` **unconditionally** (not `#if DEBUG`-gated) and their `#Preview` blocks (`ViewfinderScreen.swift:208-224`, `LowLightTorchOverlay.swift:117-126`, both referencing `MockCameraService`) are likewise unconditional. Since import and usage scope match, this does **not** break Release (confirmed — see the successful Release build below, which built both files fine), but it's inconsistent with the rest of the codebase's Debug-only-mocks convention and means `CaptureKitMocks` preview/mock code ships unconditionally in every Release binary anyway (which, note, it already does regardless — `generate_project.rb:164-178` embeds `CaptureKitMocks.framework` into the app target for **all** configurations, Debug and Release alike, a pre-existing architecture decision not touched by this diff). Not a merge blocker for Wave 0.5; flag for a later hygiene pass.

**Empirical proof the fix (and the absence of other instances) actually works:** I regenerated the project from the branch's source tree in an isolated scratch copy and built:

```
xcodebuild build -project Capture.xcodeproj -scheme Capture -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' -configuration Release \
  CODE_SIGNING_ALLOWED=NO
...
** BUILD SUCCEEDED **
```

This is Simulator, not a device archive, so it doesn't exercise code signing — but it does exercise `-configuration Release` (which is what makes `#if DEBUG` blocks compile out), so it's a direct, real test of the exact compile-break class this PR's `ResilienceScreens.swift` fix addresses. It passed. `capture-gate.sh all` (`apps/mobile/Capture/scripts/capture-gate.sh:13-16`), by contrast, only ever runs `xcodebuild build` with no `-configuration` flag (defaults to Debug) — **it never builds Release and would not have caught the original bug or proven the fix.** Treat "capture-gate.sh all green" as unrelated evidence for the Release-compile claim; my direct Release build above is what actually substantiates it.

---

## 5. `archive-testflight.sh` / `ExportOptions.plist`

**Solid.** Full read of both files (`apps/mobile/Capture/scripts/archive-testflight.sh`, `apps/mobile/Capture/scripts/ExportOptions.plist`):

- `set -euo pipefail` present (`archive-testflight.sh:46`).
- Per-worktree `DerivedData`: `WORKTREE_HASH="$(echo -n "$CAPTURE_DIR" | shasum -a 256 | cut -c1-12)"` then `DERIVED_DATA="$CAPTURE_DIR/.build/archive-derived-data-$WORKTREE_HASH"` (`:100-103`) — correctly keyed off the checkout's own absolute path, so concurrent worktrees can't collide.
- No hardcoded user paths: `grep -n "/Users/\|\$HOME\|~"` on the script returns nothing.
- `--app-id` upload path is strictly opt-in and gated behind three checks in sequence: `[[ -z "$APP_ID" ]]` early-exits (`:179-182`), then `command -v asc` (`:184-188`) falls back to printing the manual upload command rather than failing. Upload (`asc builds upload ...`, `:191`) only runs if both gates pass.
- No destructive cleanup anywhere (no `rm -rf` of anything outside its own timestamped output dirs, which it only creates, never deletes).
- Exit codes are honest: checks archive dir exists post-archive (`:140-143`), checks a `.ipa` was actually produced post-export (`:171-175`) — doesn't just trust `xcodebuild`'s own exit code.
- `ExportOptions.plist` has **no `signingCertificate` key pin** — only `method`, `teamID`, `signingStyle: automatic`, `uploadSymbols`, `manageAppVersionAndBuildNumber: false`. Confirmed no cert-rotation trap.

**Finding A1 (informational):** the codesign-identity claim ("exported IPA signed `Apple Distribution: Middle West Studio LLC (VP22LXHT7L)`") is **not verifiable in this review environment** — it requires the real Apple Distribution certificate + a provisioning profile for `cloud.patina.field`, neither of which exist in this sandbox. The script and `ExportOptions.plist` are configured consistently with that outcome (automatic signing, correct team ID, `app-store-connect` export method), and the README's explanation of archive-vs-export signing (`README.md:230-238`, "the archive action itself signs with whatever Development identity Automatic signing resolves... `-exportArchive` re-signs with the Distribution identity") is accurate, ordinary Xcode behavior. Recommend the actual signed-IPA codesign check (`codesign -dvv Payload/Capture.app`) be run once on Kody's machine before this is treated as proven, but it's not something I can gate the merge on given the sandbox has no signing identity.

---

## 6. `project.pbxproj` / `.xcscheme` regeneration — nothing dropped

Compared target lists, key references, and entitlements between `origin/main` and `origin/feat/field-companion-w05` tips directly (not just the diff):

- **4 targets in both**: `CaptureKit`, `CaptureKitMocks`, `Capture`, `CaptureTests`. 3 of 4 target UUIDs are byte-identical across branches (`CaptureKit`, `CaptureKitMocks`, `CaptureTests` unchanged); only `Capture` (the app target, the one actually touched by this diff — new `base_configuration_reference` + new `PrivacyInfo.xcprivacy` resource) got a new UUID (`1CB8845B...` → `54CACAEC...`), which is exactly the deterministic, content-driven UUID-shift expected from `xcodeproj` gem regeneration — not a wholesale reshuffle.
- `Secrets.swift` reference count: 4 in both branches (unchanged).
- `Capture.entitlements` reference count: 4 in both; file content itself is **byte-identical** between branches (`com.apple.security.application-groups: group.cloud.patina.field`, Sign in with Apple, associated domains all present, unchanged).
- `CaptureTests` reference count: 17 in both (unchanged).
- `PRODUCT_BUNDLE_IDENTIFIER` count: 8 in both (unchanged).
- New references present only on the branch, as expected: `PrivacyInfo.xcprivacy` (4 occurrences) and `BuildSettings.xcconfig` (4 occurrences) — both absent from `main`.
- `Capture.xcscheme` diff is **exactly** four `BlueprintIdentifier` swaps (`1CB8845B...` → `54CACAEC...`), matching the app target's UUID shift 1:1 — confirmed via direct diff of the scheme file, no other changes.
- `CaptureShareExtension`/`CaptureWidgets` are absent from both (not yet built — matches the README's "Team F (Phase 1)" framing, not a regression).

No target, test target, entitlement, or app-group reference was dropped by the regeneration.

---

## 7. README accuracy vs. actual script/mechanism behavior

The new "Distribution (Wave 0.5, FC-R14)" section (`README.md:213-324`, purely additive per `git diff` — confirmed the diff for this file is `+112/-0`, appended after the pre-existing content) is accurate against what I actually ran:

- The four example invocations (`archive-testflight.sh`, `--skip-export`, `--build-number 7`, `--app-id <ASC_APP_ID>`) all match real flags in the script (`archive-testflight.sh:57-67`).
- The signing explanation (development-signed archive → distribution-signed export) matches standard Xcode `-exportArchive` behavior and is not misleading.
- The "Build-time PostHog key" README subsection is accurate and, notably, **does not repeat** the `INFOPLIST_KEY_POSTHOG_API_KEY` error from Finding S2 — it correctly says "reads `Info.plist`'s `POSTHOG_API_KEY` first" without claiming an `INFOPLIST_KEY_*` path. So the inaccuracy is isolated to the two xcconfig files, not the README.
- The "App Store Connect app record — BLOCKED on Kody" subsection's claim (no ASC app record exists for `cloud.patina.field` yet) is a factual/process claim about external Apple state I can't verify from the repo, but it's consistent with there being no ASC app id anywhere in the diff or scripts (no hardcoded numeric app id found).
- The Privacy manifest subsection describes `CA92.1` and `C617.1` and their rationale — this is where the C617.1 justification is written out in prose ("`contentModificationDateKey` reads in `SiteScanBundleHome`"), and re-reading it against the actual `SiteScanBundleHome.swift:94-105` code confirms my Finding P1 above: the README's own description ("used ... in `SiteScanBundleHome`") is accurate about *where*, but doesn't address that the use is an internal retention sweep, not a user-facing display — the reason-code mismatch is real, not a misreading on my part.

---

## Summary of findings

| ID | Area | Severity | Confidence | Fix before merge? |
|---|---|---|---|---|
| S2 | `BuildSettings.xcconfig:6,12` + `Secrets.xcconfig.example:7` describe the wrong Info.plist mechanism (`INFOPLIST_KEY_*` instead of the actual literal `$(POSTHOG_API_KEY)` substitution) | Low | High | **Yes** — one-comment-block fix, prevents a future engineer chasing the wrong mechanism |
| P1 | `PrivacyInfo.xcprivacy:26` FileTimestamp reason `C617.1` (display-to-user) doesn't match the actual internal-only usage (`SiteScanBundleHome.swift` retention sweep, `TarArchive.swift`/`FieldManifestAssembler.swift` size reads) — `3B52.1` fits | Medium | Medium | **Yes** — cheap one-line swap, more defensible at App Review |
| D1 | `ViewfinderScreen.swift:15,208-224` and `LowLightTorchOverlay.swift:13,117-126` import `CaptureKitMocks` unconditionally instead of `#if DEBUG`-gating like the other 38 `#Preview`-bearing files | Low | High | No — doesn't break the build (proven), pre-existing pattern, follow-up hygiene item |
| A1 | Signed-IPA codesign identity (`Apple Distribution: Middle West Studio LLC`) unverifiable in this sandbox (no cert/profile) | Informational | N/A | No — run `codesign -dvv` on the real export once, on Kody's machine, before treating it as proven |

## What I directly proved (not just read)

- No secret-shaped string anywhere in the diff, and `.gitignore` genuinely excludes `Secrets.xcconfig` (tested with `git check-ignore -v`).
- The xcconfig → Info.plist → `AppConfiguration.postHogAPIKey` chain works end-to-end, for both Debug and Release, both with and without `Secrets.xcconfig` present — by actually building the regenerated project three times in an isolated scratch copy and inspecting the built bundle's `Info.plist`.
- `PrivacyInfo.xcprivacy` lands at the top level of the built `.app` bundle with the exact content committed.
- The `ResilienceScreens.swift` `#if DEBUG` fix is both necessary (confirmed the pre-fix `main` version had the import/usage guard mismatch) and sufficient (a full `-configuration Release` Simulator build of the regenerated project succeeded, and no other file in the tree has the same mismatch pattern).
- `project.pbxproj`/`.xcscheme` regeneration dropped nothing — verified target lists, entitlements content, and key reference counts directly against `origin/main`, not just the diff.

## What I could not verify

- Actual codesign identity on a real exported IPA (no distribution certificate available here).
- ASC-side state (no app record for `cloud.patina.field`) — took the README's claim at face value; nothing in the repo contradicts it.
- Whether the bundled `posthog-ios`/`supabase-swift` SPM package versions actually ship their own `PrivacyInfo.xcprivacy` — out of this diff's scope (versions pre-existing, unchanged), didn't chase it further.
