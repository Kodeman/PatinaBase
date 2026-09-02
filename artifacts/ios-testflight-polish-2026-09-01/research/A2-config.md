# A2 — TestFlight / App Store readiness audit (Patina client app)

Lane: A2 · Date: 2026-09-01 · READ-ONLY (no code edits, no git writes, no ASC mutations)
Target: `apps/mobile/Patina` · bundle `cloud.patina.app` · widget `cloud.patina.app.widget`
Claim level for everything below: **static / build-artifact / ASC-API verified**. Nothing is device-verified. Nothing was archive-verified (see A2-07).

## Evidence sources
- `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` (all 10 XCBuildConfigurations, lines 482–848)
- `apps/mobile/Patina/Patina/Info.plist`, `PatinaWidget/Info.plist`, both `.entitlements`
- **Merged, as-built** `Info.plist` from the most recent Debug build:
  `~/Library/Developer/Xcode/DerivedData/Patina-aggmmvzeszgxfidzlfrcopdjlpbl/Build/Products/Debug-iphonesimulator/Patina.app/Info.plist`
- `xcrun --sdk iphoneos assetutil --info .../Patina.app/Assets.car` (37 entries)
- `otool -L .../Patina.app/Patina.debug.dylib`
- SPM checkouts: `~/Library/Developer/Xcode/DerivedData/Patina-afqugqmhzggbrffwbjallqzvcsov/SourcePackages/checkouts`
- `asc` CLI at `~/.blitz/bin/asc` (auth: config-file key `BlitzKey` / 94TGH56RTB), read-only `list`/`view` calls only. App id **6762007888**.

---

## CHECKLIST

### Project / build settings
| Item | Verdict | Evidence |
|---|---|---|
| App icon actually compiles | **PASS** | `assetutil` shows `AppIcon` Icon Image 1024×1024 for `phone` + `pad`, in default / `UIAppearanceDark` / `ISAppearanceTintable`, plus IconGroup + IconImageStack + vector assets. `AppIcon60x60@2x.png` and `AppIcon76x76@2x~ipad.png` are in the bundle; built plist has `CFBundleIconName = AppIcon`. The Icon Composer `Patina/Resources/AppIcon.icon` is the source that won. |
| `AppIcon.appiconset` (empty, 3 sizes, no filenames) | **FAIL (trap)** | `Patina/Assets.xcassets/AppIcon.appiconset/Contents.json` — three `1024x1024` entries with **no `filename` key**. Dead today; the fallback if the `.icon` is ever removed → silently ships an iconless binary. A2-22 |
| `AccentColor` global tint | **FAIL** | `Patina/Assets.xcassets/AccentColor.colorset/Contents.json` = `{"colors":[{"idiom":"universal"}]}` — no `color` key. `assetutil` on the shipped `Assets.car` returns **no AccentColor entry at all** (only AppIcon\*). `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor` therefore resolves to nothing → global tint = iOS system blue. A2-10 |
| `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | **FAIL (blocker)** | pbxproj: `1.0` / `1` in every config. ASC already holds preReleaseVersion **1.0** with build **"2"**. A2-01 |
| `IPHONEOS_DEPLOYMENT_TARGET 26.5` | **FAIL** | No `@available(iOS 26.5)` anywhere; only four `#available(iOS 26.0, *)` sites (ProductDetailBlocks:213, CompanionOverlay:1141, ARPlacementView:237,248). Built plist `MinimumOSVersion 26.5`. A2-13 |
| `TARGETED_DEVICE_FAMILY "1,2"` + portrait-only | **FAIL (blocker)** | Built plist: `UIDeviceFamily [1,2]`, `UISupportedInterfaceOrientations [UIInterfaceOrientationPortrait]`, **no `UIRequiresFullScreen`** (grep across the whole app tree returns nothing). A2-03 |
| `INFOPLIST_KEY_UIStatusBarHidden = YES` | **FAIL** | Built plist `UIStatusBarHidden = true` → status bar hidden app-wide. Only one code site (`DailyStoryDetailView.swift:51 .statusBar(hidden: true)`) actually wants it. A2-11 |
| `UILaunchScreen_Generation = YES`, no `UIColorName` | **FAIL** | Built plist `UILaunchScreen = { UILaunchScreen = {} }` — empty config, no `UIColorName`, no `UIImageName`. App's own first frame is `SplashView` on `PatinaColors.Background.primary` (off-white light / warm-graphite dark). A2-14 |
| Permission strings — which set wins | **RESOLVED: `INFOPLIST_KEY_*` wins** | Merged built plist carries the **build-setting** wording for camera / microphone / speech; the `Info.plist` wordings for those three are dead. `NSFaceIDUsageDescription` + `NSPhotoLibraryAddUsageDescription` survive (unique to the file); `NSMotionUsageDescription` + `NSPhotoLibraryUsageDescription` come only from build settings. A2-12 |
| `ENABLE_USER_SCRIPT_SANDBOXING = YES` vs "Stamp Git SHA" | **FAIL (clean-checkout blocker)** | Phase `CBE19A312F1D5E34007686CD`, `alwaysOutOfDate = 1`, outputPaths `$(SRCROOT)/Patina/Generated/GitCommit.swift`; script does `mkdir -p "$(dirname "$OUT")"` (the *directory* is not a declared output). `.gitignore:57` ignores the generated file, `git ls-files Patina/Generated/` is empty, and `AppConfiguration.swift:77` compiles `GitCommit.sha`. A2-08 |
| `Secrets.swift` | **PASS on values / FAIL on clean checkout** | `supabaseAnonKey` non-empty (208 chars, JWT-shaped), `postHogAPIKey` non-empty (47 chars, phc_-shaped) — measured by length, never printed. But `.gitignore:53` ignores it, and `Secrets.example.swift` is excluded from the target via `membershipExceptions` (pbxproj:87-94). A2-09 |
| `aps-environment = development` | **RISK** | `Patina/Patina.entitlements:5-6`. `PushTokenService.detectEnvironment` (lines 205-222) parses the embedded `.mobileprovision` per token; its own comment (line 191) says "this project's Release signing has never performed a true distribution archive". A2-24 |
| Associated domains vs live AASA | **PASS** | Entitlement `applinks:client.patina.cloud`; `curl https://client.patina.cloud/.well-known/apple-app-site-association` → HTTP 200 `application/json`, contains `"appID":"VP22LXHT7L.cloud.patina.app","paths":["/piece/*","/invoices/*","/proposals/*","/decisions/*"]`. |
| Sign in with Apple entitlement | **PASS** | `com.apple.developer.applesignin = ["Default"]`; ASC bundle-id `47UZT5FK2Y` has `APPLE_ID_AUTH` with `PRIMARY_APP_CONSENT`. Required because Google OAuth is offered. |
| App Group consistency app ↔ widget | **PASS** | Both entitlements declare `group.cloud.patina.app`; both bundle ids carry the `APP_GROUPS` capability. (The *group identifier* itself cannot be listed through the ASC API — see NOT VERIFIED.) |
| Widget Info.plist / entitlements | **PASS** | Built `.appex` plist: `CFBundleIdentifier cloud.patina.app.widget`, `NSExtensionPointIdentifier com.apple.widgetkit-extension`, `CFBundleDisplayName Patina`, `CFBundleShortVersionString 1.0` / `CFBundleVersion 1` (matches the host — required). |
| `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO` | **PASS (deliberate)** | Also `SUPPORTS_XR_… = NO`, `SUPPORTS_MACCATALYST = NO`. |
| Release `CODE_SIGN_IDENTITY` | **RISK** | `CODE_SIGN_IDENTITY = "Apple Development"` hard-set (unconditional, not `[sdk=iphoneos*]`) in the **Release** configs of both app (pbxproj:747) and widget (pbxproj:487). A2-23 |

### Privacy
| Item | Verdict | Evidence |
|---|---|---|
| App `PrivacyInfo.xcprivacy` | **FAIL (blocker)** | `find apps/mobile/Patina -name "*.xcprivacy"` → nothing. Built `.app` contains only vendored ones (PostHog, PLCrashReporter, swift-crypto). A2-02 |
| Required-reason API: UserDefaults | **USED** | 117 hits across `Patina/` incl. `UserDefaults(suiteName:)` in `FeatureFlags.swift:210`, `LastSeenStore.swift:53`, `RecordOwner.swift:42`. Needs `NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`. |
| Required-reason API: disk space | **USED** | `ScanDiskBudget.swift:211-212` — `.volumeAvailableCapacityForImportantUsageKey`. Needs `NSPrivacyAccessedAPICategoryDiskSpace`. |
| Required-reason API: file timestamp | **LIKELY** | `FileManager.attributesOfItem(atPath:)` at `TarArchive.swift:57`, `ScanBundleWriter.swift:150,187,382` (reads `.size`, but the call resolves through `lstat`). |
| Required-reason API: system boot time / active input modes | **NOT USED** | zero hits for `systemUptime`, `mach_absolute_time`, `activeInputModes`. |
| Third-party manifests | **MIXED** | posthog-ios ✓ (`PostHog/Resources/PrivacyInfo.xcprivacy`, declares ProductInteraction + OtherUsageData, `Tracking=false`, UserDefaults CA92.1), plcrashreporter ✓, swift-crypto ✓ (7). **supabase-swift 2.40.0 ships NO PrivacyInfo.xcprivacy** — its statically-linked API use rolls up into the app's (missing) manifest. |
| `NSPrivacyTracking` / IDFA / ATT | **RISK** | `AppTrackingTransparency.framework` **is linked** (`otool -L`), `PostHogService.swift:11,70-76` reads `ATTrackingManager.trackingAuthorizationStatus`, but nothing ever calls `requestTrackingAuthorization` and there is **no `NSUserTrackingUsageDescription`** → status is permanently `.notDetermined`, so the opt-out branch is dead code. No `AdSupport`/IDFA. A2-17 |
| `ITSAppUsesNonExemptEncryption` | **FAIL** | grep across the app tree → nothing; `asc encryption declarations list --app 6762007888` → `data: []`. A2-06 |
| In-app account deletion (5.1.1(v)) | **PASS** | `AccountDeletionService` wired from `SettingsView.swift:198-233` and `AccountView.swift:76-86`, destructive-role confirm + failure copy. |
| Guest mode | **PASS** | `AppCoordinator.guestModeOptIn` (:92, :235, :264), `ContentView.swift:55 onBrowseAsGuest`, `GuestSessionStore`. |

### Release behaviour
| Item | Verdict | Evidence |
|---|---|---|
| Secrets present for Release | **PASS (this machine only)** | see above. |
| `AppConfiguration.analyticsEnabled` gate | **FAIL — the gate does not exist** | `analyticsEnabled` is declared at `AppConfiguration.swift:50-52` and **referenced nowhere else** (grep across `Patina/` + `PatinaWidget*` returns only the declaration). `PatinaApp.swift:74-76` calls `PostHogService.shared.initialize()` guarded only by `!Self.isUITesting`. So **Debug builds also send to the production PostHog project** (`Secrets.postHogAPIKey`, host `https://us.i.posthog.com`). A2-15 |
| PostHog config | **PARTIAL** | `PostHogService.swift:58-66`: `captureScreenViews=false`, `captureApplicationLifecycleEvents=true`, `sendFeatureFlagEvent=false`, `debug=isDebug`. **Not set:** `errorTrackingConfig.autoCapture` (exists in 3.48 at `PostHogConfig.swift:175,238`, `@_spi(Experimental)`, also remote-config gated), `sessionReplay` (defaults `false`, `PostHogConfig.swift:168`), `captureElementInteractions` (`false`), `personProfiles`, `appGroupIdentifier`. A2-16 |
| `#if DEBUG` audit | **58 files** | Overwhelmingly logging-only. Two that change behaviour: `SupabaseClient.swift:48-52` — the SDK diagnostics logger is **Debug-only**, so a Release keychain/auth failure is silent (deliberate, but it is the one class of failure a TestFlight tester will hit and Kody cannot see); `FeatureFlags.swift:167-177` — `-PatinaFlags` override compiled out of Release (correct: testers get PostHog-only flags). |
| Feature-flag posture for round 1 | **PASS (matches the brief)** | `FeatureFlags.resolveAtLaunch()` runs after PostHog setup; Release has no launch-arg path, so first launch = empty cache = every flag false. |

### App Store Connect (read-only)
| Item | Verdict | Evidence (`asc`) |
|---|---|---|
| App record | **PASS** | `apps list` → id **6762007888**, bundleId `cloud.patina.app`, **name "Patina Design"**, SKU `Strata`, primaryLocale `en-US`, `contentRightsDeclaration: USES_THIRD_PARTY_CONTENT`. |
| Bundle ids registered | **PASS** | `bundle-ids list` → `47UZT5FK2Y cloud.patina.app` and `ACZ5623YSY cloud.patina.app.widget` both exist (UNIVERSAL). |
| Capabilities — app | **PASS** | `bundle-ids capabilities list --bundle 47UZT5FK2Y` → `PUSH_NOTIFICATIONS`, `APP_GROUPS`, `ASSOCIATED_DOMAINS`, `APPLE_ID_AUTH` (+`IN_APP_PURCHASE`, `USERNOTIFICATIONS_COMMUNICATION`, `FONT_INSTALLATION` — unused extras). |
| Capabilities — widget | **PASS** | `ACZ5623YSY` → `APP_GROUPS` (+`IN_APP_PURCHASE`). Sufficient. |
| Certificates | **PASS** | `DISTRIBUTION | Middle West Studio LLC | expires 2027-05-12`; 2× DEVELOPMENT (2026-10-14, 2026-12-20). |
| Profiles | **RISK** | Exactly one: `IOS_APP_STORE | "cloud.patina.app App Store" | **INVALID** | expires 2027-05-12`. **No profile for `cloud.patina.app.widget`.** A2-19 |
| Builds | **1, expired** | `builds list --app 6762007888 --paginate` → single build `9b61ad6c…`, version **"2"**, uploaded 2026-05-12, `processingState VALID`, `expired true` (2026-08-10), `minOsVersion 17.6`, `usesNonExemptEncryption false`. |
| preReleaseVersions | — | `1.0` (IOS). |
| Beta groups | **PARTIAL** | `Internal Patina` (internal, hasAccessToAllBuilds, feedback on) and `MiddleWest Client` (external, feedback on) — **both created 2026-09-01T19:50Z**. |
| Beta testers | **FAIL** | `testflight testers list --app 6762007888` → `data: []`, `paging.total 0`. **Zero testers on the app.** A2-18 |
| Beta App Review detail | **FAIL (blocker for external)** | `testflight review view --app 6762007888` → one `betaAppReviewDetails` record with **`"attributes": {}`** — no contact name/email/phone, no demo account, no review notes. The app requires sign-in. A2-04 |
| Test information (beta description / feedback email) | **FAIL (blocker for external)** | `testflight app-localizations list --app 6762007888` → `data: []`, `total 0`. A2-05 |
| App Information | **PASS** | app-info localization en-US: name "Patina Design", subtitle "Design intelligence for home", `privacyPolicyUrl https://patina.cloud/privacy`. Version 1.0 localization: description, keywords, `marketingUrl https://patina.cloud/app`, `supportUrl https://patina.cloud/contact`, promotionalText. All three URLs return **HTTP 200** (curl). |
| Age rating | **RISK** | `appStoreAgeRating FOUR_PLUS`; declaration has `messagingAndChat: false` and `userGeneratedContent: false` — but the app ships designer↔client messaging (`Patina/Features/Messaging/`) and user room-photo upload. A2-20 |
| Category | **MISMATCH** | ASC primary category **LIFESTYLE**, no secondary. pbxproj `INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.shopping"`. A2-28 |
| Version state | — | appStoreVersion `1.0` in `PREPARE_FOR_SUBMISSION`, copyright "2026 Middle West Studio", releaseType AFTER_APPROVAL. |

---

## FINDINGS

### A2-01 — CFBundleVersion 1 is *below* the build already on ASC → the next upload is rejected
area testflight-config · **blocker** · testerVisible false · confidence 0.95 · effort S
where `Patina.xcodeproj/project.pbxproj` (`CURRENT_PROJECT_VERSION = 1` in all 8 target configs, e.g. :489, :519, :698, :750) + ASC app 6762007888
evidence `asc testflight pre-release list` → `{"version":"1.0","platform":"IOS"}`; `asc builds list` → the only build is `version: "2"`, uploaded 2026-05-12, now expired. The project would produce **1.0 (1)**.
why Kody uploads, waits, and gets "The build version must be higher than the previously uploaded version" / redundant-binary — before any tester exists.
fix Bump `CURRENT_PROJECT_VERSION` to `3` now, in **both** the Patina and PatinaWidget configs (they must stay identical or the widget trips ITMS-90473), and adopt a monotonic scheme — simplest that survives agents: a single `Config/Version.xcconfig` holding `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`, bumped by the archive script. Keep `MARKETING_VERSION 1.0` until the first public release.

### A2-02 — No `PrivacyInfo.xcprivacy` while the app uses required-reason APIs → ITMS-91053 at processing
area testflight-config · **blocker** · testerVisible false · confidence 0.9 · effort M
where `apps/mobile/Patina/Patina/` (no `.xcprivacy` anywhere); `Patina/Core/Persistence/ScanDiskBudget.swift:211`; 117 `UserDefaults` sites
evidence `find … -name "*.xcprivacy"` → nothing in the repo; the built `.app` carries only PostHog's, PLCrashReporter's and swift-crypto's. supabase-swift 2.40.0's checkout has none.
why Apple rejects the upload at processing with "Missing API declaration" — Kody never gets a build into TestFlight.
fix Add `Patina/PrivacyInfo.xcprivacy` with `NSPrivacyTracking=false`, empty `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes` (email/user ID/photos/product interaction — all Linked, non-Tracking), and `NSPrivacyAccessedAPITypes`: UserDefaults `CA92.1`, DiskSpace `E174.1`, FileTimestamp `C617.1`. Add it to the Patina target's Copy Resources (the synchronized group picks it up automatically). Widget needs its own if it touches UserDefaults — it does, via the App Group.

### A2-03 — iPad idiom + portrait-only + no `UIRequiresFullScreen` → iPad multitasking validation error
area testflight-config · **blocker** · testerVisible false · confidence 0.75 · effort S
where pbxproj `TARGETED_DEVICE_FAMILY = "1,2"` (both targets, all configs) + `INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait`
evidence built plist: `UIDeviceFamily [1,2]`, `UISupportedInterfaceOrientations [UIInterfaceOrientationPortrait]`; `grep -rn UIRequiresFullScreen` over the app tree → **no hits**. Classic ITMS-90474; the iOS 26 SDK's always-resizable iPad model makes the orientation requirement stricter, not looser.
why Blocks the upload, and even if it passed, an iPad tester gets a portrait-locked iPhone layout with no iPad design behind it.
fix Set `TARGETED_DEVICE_FAMILY = 1` on Patina **and** PatinaWidget. That is honest for round 1 (iPhone 17 Pro testers) and removes the whole class of iPad validation.

### A2-04 — Beta App Review details are empty → the external group can never be served a build
area testflight-config · **blocker** · testerVisible true · confidence 0.9 · effort S
where ASC app 6762007888, `betaAppReviewDetails/6762007888`
evidence `asc testflight review view --app 6762007888` → `"attributes":{}` — no `contactFirstName/LastName/Email/Phone`, no `demoAccountName/Password`, `demoAccountRequired` unset, no `notes`.
why "MiddleWest Client" is an external group; its first build goes to Beta App Review, which requires contact details and — because the app gates everything behind sign-in — a working demo account. Without them the submission is rejected and the homeowners Kody invited never see the app.
fix Fill contact details; set `demoAccountRequired=true` with a real production account (the brief's `tester@patina.cloud` / code `000000` if it works in-app, else a password account); notes should say the OTP arrives by email and name the guest path.

### A2-05 — No TestFlight test information (beta description, feedback email) → external submission blocked, testers get no context
area testflight-config · **blocker** · testerVisible true · confidence 0.9 · effort S
where ASC app 6762007888, `betaAppLocalizations`
evidence `asc testflight app-localizations list --app 6762007888` → `{"data":[], "meta":{"paging":{"total":0}}}`
why Beta App Review requires a description + feedback email for external testing. Testers also open TestFlight to a blank "What to Test" card — the first impression is an unfinished product.
fix Create the `en-US` betaAppLocalization: description, `feedbackEmail`, `marketingUrl https://patina.cloud/app`, `privacyPolicyUrl https://patina.cloud/privacy`; then per-build `whatsNew` via `builds test-notes create`.

### A2-06 — No `ITSAppUsesNonExemptEncryption`, no encryption declaration → every upload parks in "Missing Compliance"
area testflight-config · **major** · testerVisible false · confidence 0.95 · effort S
where `Patina/Info.plist` (key absent); ASC `appEncryptionDeclarations`
evidence grep for `ITSAppUsesNonExemptEncryption` across the app tree → nothing; `asc encryption declarations list --app 6762007888` → `data: []`. (The May build has `usesNonExemptEncryption:false`, answered by hand in the UI.)
why Each upload needs the question answered in the ASC UI before it can be handed to a group — a silent stall between "uploaded" and "testers can install".
fix Add `<key>ITSAppUsesNonExemptEncryption</key><false/>` to `Patina/Info.plist`. The app uses only HTTPS/TLS plus Apple crypto; swift-crypto is exempt third-party crypto used for standard purposes.

### A2-07 — The Release/archive path has never been run for this app
area testflight-config · **blocker** · testerVisible false · confidence 0.95 · effort M
where whole project
evidence `~/Library/Developer/Xcode/Archives` does not exist; `find ~ -name "*.xcarchive"` finds only `apps/mobile/Capture/.build/archives/PatinaField-*.xcarchive` (the *Field* app); **no `Build/Products/Release*` directory in any of the ~40 `Patina-*` DerivedData trees** — every build on this machine has been `Debug-iphonesimulator` (one `Debug-iphoneos` under `Mobile-*`). `PushTokenService.swift:191` independently states "this project's Release signing has never performed a true distribution archive."
why Everything Release-only is unproven at once: whole-module optimisation over 92k LOC, the Stamp-Git-SHA phase under `CONFIGURATION != Debug`, distribution signing with the widget, `ENABLE_NS_ASSERTIONS=NO`, dSYM generation. The first archive attempt is the riskiest step in the whole program and it sits on the critical path.
fix Before anything else in the fix program: one `xcodebuild archive -destination generic/platform=iOS` + `-exportArchive -exportOptionsPlist` (method `app-store-connect`, automatic signing) purely as a dry run, and read the exported `Payload/Patina.app/embedded.mobileprovision` entitlements to confirm `aps-environment: production`.

### A2-08 — `GitCommit.swift` is gitignored but compiled, and its directory is not a sandbox-declared output → clean-checkout / CI archive fails
area testflight-config · **blocker** · testerVisible false · confidence 0.8 · effort S
where pbxproj "Stamp Git SHA" phase `CBE19A312F1D5E34007686CD` (:411-429); `.gitignore:57`; `Patina/App/Configuration/AppConfiguration.swift:77`
evidence `git ls-files apps/mobile/Patina/Patina/Generated/` → empty; `.gitignore:57 apps/mobile/Patina/Patina/Generated/GitCommit.swift`; the phase declares `outputPaths = ("$(SRCROOT)/Patina/Generated/GitCommit.swift")` but the script's first real action is `mkdir -p "$(dirname "$OUT")"`, and the project sets `ENABLE_USER_SCRIPT_SANDBOXING = YES` in both Debug and Release. On a fresh clone the file is absent when the file-system-synchronized group is resolved, so `GitCommit.sha` is not in scope for `AppConfiguration.swift`.
why Any archive from a clean checkout, a worktree, or CI dies at either the mkdir or the compile. It works today only because the file already exists on this machine.
fix Commit a checked-in `GitCommit.swift` with `sha = ""` (drop it from `.gitignore`) and let the Debug-only phase overwrite it, **or** move the generated file into `$(DERIVED_FILE_DIR)` and add it to the target's source list properly. Also add `$(SRCROOT)/Patina/Generated` to `outputPaths` so the mkdir is sandbox-legal.

### A2-09 — `Secrets.swift` is gitignored and its example twin is excluded from the target → clean checkout does not compile
area testflight-config · **major** · testerVisible false · confidence 0.9 · effort S
where `.gitignore:53`; pbxproj `membershipExceptions = (App/Configuration/Secrets.example.swift, Info.plist)` (:87-94)
evidence `Secrets.swift` holds the only non-empty `supabaseAnonKey` (208 chars) and `postHogAPIKey` (47 chars) — measured with a length probe, never printed. `Secrets.example.swift` is explicitly excluded from the Patina target, so a checkout without `Secrets.swift` has no `Secrets` symbol at all.
why Same class as A2-08: the release is reproducible on exactly one Mac. Compounding: `openAIKey` and `claudeAPIKey` are `nil`, so any Companion path that needs them is dead in every build.
fix Keep the key out of git but make the *symbol* always exist: include `Secrets.example.swift` in the target under `#if !canImport(…)`-free plain fallback, or generate `Secrets.swift` from an xcconfig/env in the archive script. Record the archive prerequisites in `apps/mobile/Patina/CLAUDE.md`.

### A2-10 — Global accent colour is undefined → system controls tint iOS blue inside a warm Patina palette
area visual-system · **major** · testerVisible true · confidence 0.9 · effort S
where `Patina/Assets.xcassets/AccentColor.colorset/Contents.json`; pbxproj `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor`
evidence the colorset is `{"colors":[{"idiom":"universal"}]}` — an entry with **no `color` value**; `assetutil --info` on the shipped `Assets.car` lists 37 entries, **all** of them `AppIcon*` — there is no AccentColor asset in the binary. Only 25 `.tint(` call sites exist across 435 Swift files.
why Every un-tinted system affordance a tester touches — alert default buttons, text-field caret and selection, `Link`, swipe actions, `Toggle`, date pickers, sheet grabbers, refresh spinners, context-menu highlights — renders in iOS system blue against off-white/warm-graphite. It is the single most legible "this is a template app" tell.
fix Give `AccentColor` a real light/dark value from `PatinaColors` (or delete the colorset and set the tint once on the root `WindowGroup` via `.tint(PatinaColors…)`, which also covers the widget).

### A2-11 — Status bar hidden app-wide
area visual-system · **major** · testerVisible true · confidence 0.9 · effort S
where pbxproj `INFOPLIST_KEY_UIStatusBarHidden = YES` (Debug :700, Release :752); built plist `UIStatusBarHidden = true`
evidence exactly one view actually wants it: `Patina/Features/Home/Views/DailyStoryDetailView.swift:51 .statusBar(hidden: true)`.
why On an iPhone 17 Pro the Dynamic Island sits in a blank strip with no clock, battery or signal, in every screen of the app. Testers read it as broken or as a game; Apple's HIG reserves hiding for full-screen media.
fix Delete the build setting from both configs; keep the per-view `.statusBar(hidden: true)` for the immersive story detail only. Re-check top-edge layout afterwards — layouts drawn against a hidden bar may need a safe-area pass.

### A2-12 — Two competing permission-string sets; the build settings silently win, and the surviving copy is marketing prose
area copy · **major** · testerVisible true · confidence 0.95 · effort S
where pbxproj `INFOPLIST_KEY_NS*UsageDescription` (:695-699 Debug, :747-751 Release) vs `Patina/Info.plist:5-14`
evidence the merged, as-built plist proves precedence: camera = "Patina uses your camera to walk through your space together and visualize furniture in your room." (build setting), microphone = "Have a voice conversation with Patina about your space and style." (build setting), speech = "Speak naturally with Patina instead of typing." (build setting). The `Info.plist` wordings for those three — including the one that mentions **QR-code sign-in** — never reach a device. Both `NSPhotoLibraryUsageDescription` (read, from build settings) and `NSPhotoLibraryAddUsageDescription` (add-only, from the file) ship.
why The mic and speech strings are imperatives to the user, not statements of what the app does with the recording — the exact shape reviewers reject under 5.1.1, and a tester reading "Have a voice conversation…" in a system alert learns nothing about whether audio leaves the phone. The camera string also omits QR sign-in, which the app does use the camera for.
fix Pick one source (the build settings, since they win), delete the duplicated keys from `Info.plist`, keep only `NSFaceIDUsageDescription` + the photo key the app actually needs, and rewrite each string as "Patina uses X to Y." Drop `NSPhotoLibraryUsageDescription` unless the app really reads the library.

### A2-13 — Deployment target 26.5 with no 26.5-only code excludes testers who have not updated
area testflight-config · **major** · testerVisible true · confidence 0.85 · effort S
where pbxproj `IPHONEOS_DEPLOYMENT_TARGET = 26.5` (project + both targets); built plist `MinimumOSVersion 26.5`
evidence the only version gates in 435 files are four `#available(iOS 26.0, *)` checks (`ProductDetailBlocks.swift:213`, `CompanionOverlay.swift:1141`, `ARPlacementView.swift:237,248`). No `@available(iOS 26.5)` anywhere. The previously uploaded build shipped at `minOsVersion 17.6`.
why A homeowner on iOS 26.0–26.4 opens the TestFlight invite and reads "requires iOS 26.5 or later" — the invitation dead-ends before launch. 26.5 is a recent point release; a first tester round should not require it.
fix Set 26.0 (matching the only gates in the code) and let a build prove it. If something genuinely needs 26.5, wrap it in `#available` rather than raising the floor.

### A2-14 — Launch screen has no declared background, so the cold-launch flash does not match the app
area visual-system · **major** · testerVisible true · confidence 0.7 · effort S
where pbxproj `INFOPLIST_KEY_UILaunchScreen_Generation = YES`, no `INFOPLIST_KEY_UILaunchScreen_UIColorName`; built plist `UILaunchScreen = { UILaunchScreen = {} }`
evidence the app's own first frame is `Patina/Features/Splash/Views/SplashView.swift:20` painting `PatinaColors.Background.primary` — off-white in light, warm-graphite in dark (`PatinaDesignKit/.../PatinaColors.swift:92-96`). The generated launch screen declares no colour and no image at all.
why Every cold launch — the first thing a tester ever sees — is an undesigned flash before the wordmark. In whichever appearance the system default disagrees with the brand ground, it reads as a white or black stutter.
fix Add a `LaunchBackground` colorset (light off-white / dark warm-graphite) and set `INFOPLIST_KEY_UILaunchScreen_UIColorName = LaunchBackground`. Optionally add the strata mark as `UIImageName` so the launch screen and the splash are one continuous image. Verify by screenshotting the first 300 ms in both appearances.

### A2-15 — The analytics kill-switch is dead code: Debug builds report into production PostHog
area prod-readiness · **major** · testerVisible false · confidence 0.9 · effort S
where `Patina/App/Configuration/AppConfiguration.swift:50-52`; `Patina/PatinaApp.swift:74-76`
evidence `analyticsEnabled` (`AppEnvironment.current != .debug`) has **no callers** — grep across `Patina/` and `PatinaWidget*` returns only the declaration. `PatinaApp.init` calls `PostHogService.shared.initialize()` guarded only by `!Self.isUITesting`, and `PostHogService.initialize()` bails only on an empty key, which is non-empty in every build.
why Every simulator walk by every agent, and Kody's own Debug runs, land in the production PostHog project — polluting the exact funnels the first tester round is meant to measure, and evaluating flags against dev identities. It also means the brief's assumption ("PostHog only in Release") is wrong, so a Debug walk *can* pick up flags.
fix Either delete `analyticsEnabled` or actually gate on it: `if !Self.isUITesting && AppConfiguration.analyticsEnabled { … }`. Preferred: keep PostHog initialised in Debug but pointed at a separate dev project key, so flag behaviour stays testable without polluting prod.

### A2-16 — No crash or error reporting in the TestFlight build
area prod-readiness · **major** · testerVisible false · confidence 0.85 · effort M
where `Patina/Services/Analytics/PostHogService.swift:58-66`
evidence the config sets only `captureScreenViews`, `captureApplicationLifecycleEvents`, `sendFeatureFlagEvent`, `debug`. posthog-ios 3.48 exposes `errorTrackingConfig` (`PostHogConfig.swift:175`, wired at :238 behind `errorTrackingConfig.autoCapture`, `@_spi(Experimental)`, additionally gated by the project's remote `errorTracking` config) and `sessionReplay` (`:168`, default `false`) — neither is touched. PLCrashReporter 1.12.2 ships in the bundle as a posthog dependency but nothing arms it.
why When a homeowner's first session crashes, the only trace is Apple's Organizer crash log (delayed, and dependent on the tester's diagnostics setting). No breadcrumb, no non-fatal capture, no replay. For a first round whose whole purpose is finding rough edges, that is the wrong instrument set.
fix Enable PostHog error tracking (`@_spi(Experimental) import PostHog`; `config.errorTrackingConfig.autoCapture = true`) and turn `errorTracking` on for the project; consider `sessionReplay = true` with masking for the internal group only. Confirm dSYM upload so traces symbolicate.

### A2-17 — AppTrackingTransparency is linked but never used; the opt-out branch is unreachable
area prod-readiness · **minor** · testerVisible false · confidence 0.85 · effort S
where `Patina/Services/Analytics/PostHogService.swift:11, 70-76`
evidence `otool -L Patina.debug.dylib` shows `/System/Library/Frameworks/AppTrackingTransparency.framework/AppTrackingTransparency`. Nothing calls `requestTrackingAuthorization`, and there is no `NSUserTrackingUsageDescription` in the merged plist — so `trackingAuthorizationStatus` is permanently `.notDetermined`, which is neither `.denied` nor `.restricted`, so `optOut()` never runs.
why Dead code that reads like a privacy control. Linking ATT with no purpose string also invites an App Review question about tracking that the app does not do.
fix Delete the import and the block. Declare `NSPrivacyTracking=false` in the new privacy manifest (A2-02) and answer the ASC nutrition label as not-tracking.

### A2-18 — Zero beta testers on the app; both groups were created today and are empty
area testflight-config · **major** · testerVisible true · confidence 0.95 · effort S
where ASC app 6762007888
evidence `asc testflight testers list --app 6762007888` → `data: []`, `paging.total 0`; `metrics app-testers` → `[]`. Groups `Internal Patina` (internal) and `MiddleWest Client` (external) both `createdDate 2026-09-01T19:50Z`.
why Nobody can receive a build. Internal testers also need to be users on the ASC team with the right role, which is a separate, slower step.
fix Add Kody + any internal accounts to `Internal Patina` first and prove the whole chain on an internal build (no Beta App Review), then fill A2-04/A2-05 before touching the external group.

### A2-19 — The only App Store profile is INVALID and none exists for the widget
area testflight-config · **minor** · testerVisible false · confidence 0.8 · effort S
where ASC signing
evidence `asc profiles list` → exactly one profile: `IOS_APP_STORE | "cloud.patina.app App Store" | profileState **INVALID** | expires 2027-05-12`. No `cloud.patina.app.widget` profile at all. Distribution certificate is valid to 2027-05-12.
why Automatic signing normally regenerates both at archive time, but it has to resolve App Groups + Associated Domains + Push + Sign in with Apple for the app *and* App Groups for the widget in one pass — and that pass has never been run (A2-07). An INVALID profile usually means a capability changed after it was issued.
fix Let the dry-run archive regenerate them; if it fails, delete the INVALID profile and re-archive. Verify the exported `embedded.mobileprovision` for both the `.app` and the `.appex`.

### A2-20 — Age-rating declaration denies messaging and user-generated content that the app ships
area prod-readiness · **major** · testerVisible false · confidence 0.7 · effort S
where ASC `ageRatingDeclarations/d405ec23-…`
evidence `messagingAndChat: false`, `userGeneratedContent: false`, `unrestrictedWebAccess: false`, everything else `NONE`, resulting in `FOUR_PLUS`. The app ships `Patina/Features/Messaging/` (designer↔client chat with realtime) and user room-photo capture/upload.
why A mis-declared questionnaire is a review finding and can force an age-rating change mid-review — and TestFlight external review sees the same declaration.
fix Re-answer the questionnaire honestly: messaging/chat yes (moderated, 1:1 with a professional), user-generated content per Apple's definition of what other users can see. Expect the rating to stay low but be defensible.

### A2-21 — Three different names for the same product
area copy · **minor** · testerVisible true · confidence 0.9 · effort S
where ASC app name; built plist `CFBundleName`; `Patina/Info.plist:21`
evidence App Store / TestFlight name is **"Patina Design"**; the home-screen and bundle name is **"Patina"**; the URL type is named `com.patina.app` while the bundle id is `cloud.patina.app`.
why The tester taps a TestFlight card that says "Patina Design" and lands on a home-screen icon that says "Patina". Small, but it is the first naming the product does.
fix Decide one. If "Patina" is the product, rename the ASC record (it is still `PREPARE_FOR_SUBMISSION`); fix the `CFBundleURLName` to `cloud.patina.app` while you are there.

### A2-22 — Two assets both named `AppIcon`; the empty `.appiconset` is a live trap
area testflight-config · **minor** · testerVisible false · confidence 0.9 · effort S
where `Patina/Assets.xcassets/AppIcon.appiconset/Contents.json` vs `Patina/Resources/AppIcon.icon/`
evidence the `.appiconset` declares three 1024×1024 entries (default / dark / tinted) with **no `filename`**. The Icon Composer file is what actually compiles — `assetutil` shows the full light/dark/tinted 1024 set plus IconGroups and the four vectors. So the icon is fine **today**.
why Anyone deleting or renaming the `.icon` (or Xcode preferring the set after a project edit) ships a binary with no icon and no build error — the failure surfaces as an ITMS rejection or a white square on the tester's home screen.
fix Delete `Patina/Assets.xcassets/AppIcon.appiconset` entirely. Keep `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` pointing at the `.icon`.

### A2-23 — `CODE_SIGN_IDENTITY = "Apple Development"` is hard-set in the Release configs
area testflight-config · **minor** · testerVisible false · confidence 0.6 · effort S
where pbxproj :487 (widget Release), :747 (app Release) — unconditional, not `[sdk=iphoneos*]`
evidence both Release configs pin the development identity while `CODE_SIGN_STYLE = Automatic` and `PROVISIONING_PROFILE_SPECIFIER = ""`.
why Xcode's Organizer export normally re-signs a development-signed archive with the distribution identity, so this is usually harmless — but combined with A2-07 (never archived) and a script-driven `-exportArchive`, it is exactly the setting that produces a development-signed IPA and an `aps-environment: development` entitlement in TestFlight.
fix Remove the override (inherit) or scope it `CODE_SIGN_IDENTITY[sdk=iphoneos*] = "Apple Distribution"` for Release; confirm from the exported IPA, not from the setting.

### A2-24 — `aps-environment` is `development` in the shipped entitlements
area notifications · **minor** · testerVisible true · confidence 0.6 · effort S
where `Patina/Patina.entitlements:5-6`
evidence `PushTokenService.detectEnvironment` (:205-222) reads the embedded profile per token and maps `development → sandbox`; its own header comment (:191) records that a true distribution archive has never been produced.
why If the export does not flip the entitlement to `production`, every TestFlight device registers a sandbox token and production APNs sends fail with BadDeviceToken — the tester simply never gets a notification, silently.
fix Part of the A2-07 dry run: unzip the exported IPA and `codesign -d --entitlements` the `.app`; confirm `production`. Then send one real push to a TestFlight install before the round opens.

### A2-25 — Release-only Supabase diagnostics are silent
area prod-readiness · **minor** · testerVisible false · confidence 0.8 · effort S
where `Patina/Core/Network/SupabaseClient.swift:48-52`
evidence `#if DEBUG let logger = SupabaseDiagnosticsLogger() #else let logger: (any SupabaseLogger)? = nil #endif`, with a comment recording that a failing keychain read once stripped `Authorization` off every PostgREST request and stayed invisible without it.
why That is precisely the failure a fresh TestFlight install on a real device is most likely to hit (keychain access group, first-launch entitlement state) — and in Release it produces no log at all, so a tester's "nothing loads" report is undiagnosable.
fix Keep the logger in Release but route it through `PatinaLog` at `.error` only (no session/request bodies), or capture it as a PostHog non-fatal once A2-16 is done.

### A2-26 — `LSApplicationCategoryType` (shopping) disagrees with the ASC category (Lifestyle)
area testflight-config · **polish** · testerVisible false · confidence 0.9 · effort S
where pbxproj `INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.shopping"`; ASC `primaryCategory: LIFESTYLE`, no secondary
evidence `asc apps info relationships primary-category --app 6762007888` → `{"id":"LIFESTYLE"}`.
fix Align to `public.app-category.lifestyle`, and set a secondary ASC category (Shopping is the obvious one) since only the primary is filled.

### A2-27 — SwiftLint runs twice and gates nothing, on every build
area tests-gates · **polish** · testerVisible false · confidence 0.85 · effort S
where pbxproj phase `CBB2D0412F1D5E34007686CD` (:392-409) + package reference `SwiftLintPlugins` (:922-924)
evidence the run-script has empty `inputPaths`/`outputPaths` (so it is always out of date) and ends `swiftlint lint Patina || true`; the SwiftLintPlugins SPM plugin is also declared.
why Two lint passes on every incremental build, neither of which can fail the build — cost with no signal, and it sits *after* the embed phases in the app target.
fix Keep one. If the SPM plugin is wired to the target, delete the run-script phase; otherwise give the phase real input/output file lists and drop `|| true` for a warning-level gate.

### A2-28 — Test-target bundle ids use a different, misspelled reverse-DNS root
area testflight-config · **polish** · testerVisible false · confidence 0.95 · effort S
where pbxproj :795, :817 (`com.middlewesetstudio.PatinaTests`), :836, :858 (`com.middlewesetstudio.PatinaUITests`)
evidence "middlewesetstudio" — the studio is Middle West Studio, and every shipping id is `cloud.patina.*`.
fix Rename to `cloud.patina.app.tests` / `cloud.patina.app.uitests`. Cosmetic (test bundles are never uploaded) but it shows up in every xcodebuild log.

### A2-29 — `UIApplicationSupportsMultipleScenes = true` on a single-window, portrait-only iPhone app
area testflight-config · **minor** · testerVisible false · confidence 0.7 · effort S
where pbxproj `INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES`; built plist `UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes = true`
evidence the app declares one `WindowGroup` (`PatinaApp.swift`) and locks portrait.
why On iPad (while family 2 is still declared, A2-03) this advertises multi-window support the app has never been tested for; it also interacts with the multitasking orientation requirement.
fix Once `TARGETED_DEVICE_FAMILY = 1`, either leave it or set the scene manifest explicitly with `UIApplicationSupportsMultipleScenes = false`.

### A2-30 — `apps/mobile/Patina/CLAUDE.md` states the wrong deployment target
area other · **polish** · testerVisible false · confidence 1.0 · effort S
where `apps/mobile/Patina/CLAUDE.md:56`
evidence "Build scheme: `Patina`. Target: iOS 18+, optimized for iOS 26.5 on LiDAR" vs pbxproj `IPHONEOS_DEPLOYMENT_TARGET = 26.5`.
fix Update alongside whatever A2-13 settles on.

---

## WHAT IS GOOD (calibration)
- **The app icon is real and complete.** Icon Composer source compiles to 1024×1024 light / dark / tinted for both phone and pad, with layered groups and shadows — this is the modern iOS 26 icon done properly, not a flattened PNG.
- **App Information is essentially done.** Name, subtitle, description, keywords, promotional text, privacy policy, support and marketing URLs are all populated for en-US, and all three URLs return HTTP 200.
- **The universal-link chain is coherent end to end**: entitlement `applinks:client.patina.cloud` ↔ a live AASA that lists `VP22LXHT7L.cloud.patina.app` for the four path families the app handles.
- **Bundle identifiers and capabilities are correctly registered on both ids**, including Sign in with Apple with primary-app consent (required because Google OAuth is offered) and matching App Groups on app and widget.
- **Account deletion and guest mode both exist** — the two things Apple most often bounces a first submission for.
- **`PushTokenService.detectEnvironment`** is unusually careful: it derives the APNs environment per token from the embedded profile rather than `#if DEBUG`, with a documented three-rung fallback.
- **Feature-flag posture matches the brief**: `-PatinaFlags` is compiled out of Release, so a TestFlight first launch genuinely has every flag off.
- Distribution certificate valid to 2027-05-12; content-rights declaration set; app-store version record already created.

## NOT VERIFIED (and why)
- **Nothing here is archive-verified.** I did not run `xcodebuild archive` or `-exportArchive`: a Release build would rewrite the gitignored `Patina/Generated/GitCommit.swift` in the shared working tree while other lanes of this audit are running, and the mandate is read-only. A2-03, A2-08, A2-19, A2-23 and A2-24 are therefore *predicted* upload/build outcomes from settings + the merged plist + ASC state, not observed ones. The single highest-value first step of the fix program is a throwaway archive + export to convert them.
- **The App Group identifier `group.cloud.patina.app` itself** cannot be listed through the App Store Connect API (no public endpoint) — only the `APP_GROUPS` *capability* on each bundle id is visible, and both have it. Whether the group exists in the Developer portal and is assigned to both ids is unconfirmed; a failed archive would be the symptom.
- **Launch-screen appearance in dark mode** (A2-14) is reasoned from the built plist (no `UIColorName`), not screenshotted. Four `tfp-*` simulators were booted by other lanes of this audit and I did not touch them.
- **Whether `tester@patina.cloud` / code `000000` works in-app** — not attempted (production account, other lanes own the walks).
- **ITMS error codes** (90474, 91053, 4238) are named from the settings that produce them; the exact code Apple returns under the iOS 26 SDK may differ.
- `asc` calls used were all `list`/`view`. No mutations. One call (`testflight testers list --paginate`) returned a null `data` on the first attempt and `[]` with `total: 0` on the second — the second is reported.
