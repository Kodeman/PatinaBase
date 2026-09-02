# First Flight — findings by wave and lane

640 findings: the 607 confirmed rows of `research/40-workflow-result.json`, minus 2 folded by root cause (GAP7-03 and GAP7-04 → GAP7B-09), plus 24 ledger-only findings from the two resumed lanes (`research/GAP1.md` → `GAP1B-*`, `research/GAP7.md` → `GAP7B-*`), plus **11 filed by W0 · L0.7's coverage walk** (`L07-01` … `L07-11`, 2026-09-02). Refuted (28) and duplicate (189) rows are out. Machine-readable source of truth: `build/findings.json`.

Wave from tier (T0 → W1, or W0 when the fix is configuration / backend / content / ASC); lane from the finding’s `where` against the owned file sets **as they stood in `build/PLAN-SKELETON.md` §4 when this file was cut**. See **Assignment notes** at the end for every judgement call.

> ## ⚠ REGENERATED FROM `findings.json` ON 2026-09-02 (W0 CLOSE) — FOUR CHANGES ARE IN IT
>
> Lane assignment is unchanged for the original corpus and still authoritative. The wave and tier
> columns below are the ones `build/findings.json` carries, and they fold in four schedule changes made
> after this file was first cut:
>
> 1. **Ruling D12 promotes twelve T1 rows into W1** — `GAP4-02`, `GAP4-03`, `GAP4-25`, `GAP4-16`,
>    `GAP1B-03`, `GAP1B-07`, `GAP1B-08`, `C-23`, `GAP2-24`, `B-15`, `C2-06`, `GAP3-18`. They are marked
>    ⇧D12 in PROGRAM.md's W1 tables and struck from its W2 tables. Their `tier` stays T1;
>    `promotedBy: "D12"` records the move. The ⇧D12 marker itself lives only in PROGRAM.md's tables.
> 2. **Four rows are closed by the production reconciliation of 2026-09-01** — `A3-03`, `A4-03`,
>    `A4-04`, `A3-02`. All four were premised on a migration gap that no longer exists. They are
>    `tier: "closed"`, `wave: "closed"` in `findings.json` and appear in PROGRAM.md §1's reconciliation
>    table, not in any lane table. **`A-101` (the delete-account copy) is NOT closed and stays in L1-A.**
> 3. **Ruling D1 re-tiers twelve rows** (`build/waves/w0/retier-D1.md`). `house-first` is ON for every
>    round-one tester, so the four-tab root is the shipped product: eight flags-off-only rows leave W1
>    for W2 with their tier held (`A1-03`, `A1-04`, `A4-07`, `A-88`, `A-64`, `C-03`, `C-28`, `C9-05`)
>    and four flags-on-only minors rise from T2/W3 to T1/W2 (`A1-13`, `B-52`, `C-34`, `C2-11`). Every
>    finding now carries `rootScope` (`both` 520 · `n/a` 81 · `flags-off-only` 17 · `flags-on-only` 11);
>    the twelve changed rows carry `retieredBy: "D1 2026-09-02"` and a `retierNote`.
> 4. **W0 · L0.7's coverage walk files eleven new rows** (`build/waves/w0/l0.7-coverage-walk.md` §3),
>    placed by the W0 closer on 2026-09-02. Two are blockers: `L07-01` (proposal signing fails with
>    `studio_id_not_designer_studio` when the designer belongs to two active studios — **L0.2 / W1**,
>    the only backend row in W1) and `L07-02` (on the four-tab root the message composer is drawn under
>    the tab bar and cannot be tapped — **L1-F / W1**). Ten of the eleven keep the walker's proposed
>    tier; **`L07-05` alone was promoted** from the walker's T1 to T0/W1, because the finding's own fix
>    line says to apply it in the same wave as `R-03`, which is T0/W1. Every row carries the reason in
>    its `judgeNote`, `sourceLane: "L0.7"`, and `ledger` pointing at the walk.
>
> Current wave totals: **W0 34 · W1 137 · W2 365 · W3 100 · closed 4 = 640.**
> The owned globs the lane column was cut against are superseded by **PROGRAM.md §3**'s glob tables
> (which resolve four contested files, delete a directory that does not exist, and assign the residue).

## Totals

### By wave

| Wave | Findings | blocker | major | minor | polish |
|---|---:|---:|---:|---:|---:|
| **W0** Unblock (days 1–3; the long pole is content) | 34 | 8 | 19 | 7 | 0 |
| **W1** The first five minutes and the daily surfaces (T0 in-app) | 137 | 14 | 119 | 4 | 0 |
| **W2** Build 2, the first tester week (T1) | 365 | 0 | 130 | 195 | 40 |
| **W3** After round one (T2 / cut) | 100 | 0 | 5 | 42 | 53 |
| **Total** | 636 | 22 | 273 | 248 | 93 |

_Plus 4 rows closed by the production reconciliation of 2026-09-01 (`A3-02`, `A3-03`, `A4-03`, `A4-04`; blocker 4) — 640 rows in `findings.json`. They appear in PROGRAM.md §1's reconciliation table, not in any lane table below._

### By lane

| Lane | W0 | W1 | W2 | W3 | Total |
|---|---:|---:|---:|---:|---:|
| L0.1 Build & configuration (iOS, agent) | 18 |  | 9 | 4 | **31** |
| L0.2 Production backend (Kody-run; agent prepares and probes) | 3 | 1 | 3 | 4 | **11** |
| L0.3 The room is not empty (content: Kody + Leah; agent builds the seeding/image pipeline) | 3 |  | 2 | 1 | **6** |
| L0.4 Help & tour content (Sanity; Kody authorizes the writes) | 4 |  | 1 | 1 | **6** |
| L0.5 App Store Connect (Kody-run; agent drafts every text) | 5 |  |  | 1 | **6** |
| L0.6 PostHog (Kody) | 1 |  |  |  | **1** |
| L1-A Welcome, sign-in, onboarding |  | 27 | 41 | 11 | **79** |
| L1-B Data, persistence, resilience |  | 28 | 52 | 11 | **91** |
| L1-C Layout, Companion, Dynamic Type |  | 28 | 125 | 33 | **186** |
| L1-D Tokens, dark mode, contrast, iconography |  | 18 | 51 | 11 | **80** |
| L1-E Copy |  | 18 | 48 | 10 | **76** |
| L1-F Notifications, messaging, widget, deep links |  | 17 | 27 | 12 | **56** |
| L2-G Tests & gates |  |  | 6 | 1 | **7** |
| **Total** | 34 | 137 | 365 | 100 | **636** |

### By tier × severity

| Tier | blocker | major | minor | polish | Total |
|---|---:|---:|---:|---:|---:|
| **T0** | 18 | 138 | 11 | 0 | **167** |
| **T1** | 4 | 130 | 195 | 40 | **369** |
| **T2** | 0 | 5 | 42 | 50 | **97** |
| **cut** | 0 | 0 | 0 | 3 | **3** |
| **Total** | 22 | 273 | 248 | 93 | **636** |

### Tester-visible / effort

- testerVisible: {'True': 521, 'False': 119}
- effort: {'S': 465, 'M': 153, 'L': 22}

---

## W0 — Unblock (days 1–3; the long pole is content) — 34 findings

### W0 · L0.1 Build & configuration (iOS, agent) — 18 findings

_count: 18 · blocker 3 · major 10 · minor 5 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A2-01` | T0/blocker | S | CFBundleVersion 1 is BELOW the build already on App Store Connect — next upload is rejected | apps/mobile/Patina/Patina.xcodeproj/project.pbxproj (CURRENT_PROJECT_VERSION = 1 in all 8 targ… | Bump CURRENT_PROJECT_VERSION to 3 in BOTH the Patina and PatinaWidget configs (they must stay identical or the widget trips ITMS-… |
| `A2-03` | T0/blocker | S | iPad idiom + portrait-only + no UIRequiresFullScreen — iPad multitasking validation error on upload | project.pbxproj TARGETED_DEVICE_FAMILY = "1,2" (both targets, all configs) + INFOPLIST_KEY_UIS… | Set TARGETED_DEVICE_FAMILY = 1 on Patina and PatinaWidget. Honest for a round-1 iPhone 17 Pro audience and removes the whole clas… |
| `G-01` | T0/blocker | S | Release configuration does not compile — no TestFlight archive is possible | apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift:98-99; Features/Home/Views/… | Wrap the four #Preview blocks in #if DEBUG / #endif, or lift the fixtures out of the DEBUG gate. Gate command: xcodebuild build -… |
| `A2-02` | T0/major | M | No PrivacyInfo.xcprivacy while the app uses required-reason APIs — ITMS-91053 at processing | apps/mobile/Patina/Patina/ (no .xcprivacy anywhere); Patina/Core/Persistence/ScanDiskBudget.sw… | Add Patina/PrivacyInfo.xcprivacy: NSPrivacyTracking=false, empty NSPrivacyTrackingDomains, NSPrivacyCollectedDataTypes (email / u… |
| `A2-07` | T0/major | M | The Release/archive path has never been run for this app — the riskiest step is unproven and on the critical… | whole project / release process | Before anything else in the fix program, run one throwaway `xcodebuild archive -destination generic/platform=iOS` + `-exportArchi… |
| `A2-10` ⇢L1-D | T0/major | S | Global accent colour is undefined — system controls tint iOS blue inside a warm Patina palette | Patina/Assets.xcassets/AccentColor.colorset/Contents.json; project.pbxproj ASSETCATALOG_COMPIL… | Give AccentColor a real light/dark value from PatinaColors, or delete the colorset and set `.tint(...)` once on the root WindowGr… |
| `A2-12` ⇢L1-E | T0/major | S | Two competing permission-string sets; build settings silently win and the surviving copy is marketing prose | project.pbxproj INFOPLIST_KEY_NS*UsageDescription (:695-699 Debug, :747-751 Release) vs Patina… | Pick one source (the build settings, since they win), delete the duplicated keys from Info.plist, drop NSPhotoLibraryUsageDescrip… |
| `A2-13` | T0/major | S | Deployment target 26.5 with no 26.5-only code — excludes any tester not yet on that point release | project.pbxproj IPHONEOS_DEPLOYMENT_TARGET = 26.5 (project + both targets); built plist Minimu… | Set 26.0 (matching the only gates in the code) and let a build prove it. A homeowner on 26.0–26.4 currently opens the invite and… |
| `A2-15` ⇢L0.6 | T0/major | S | The analytics kill-switch is dead code — Debug builds report into the production PostHog project | Patina/App/Configuration/AppConfiguration.swift:50-52; Patina/PatinaApp.swift:74-76 | Either delete analyticsEnabled or actually gate on it. Preferred: keep PostHog initialised in Debug but pointed at a separate dev… |
| `A2-16` ⇢L0.6 | T0/major | M | No crash or error reporting in the TestFlight build | Patina/Services/Analytics/PostHogService.swift:58-66 | Enable PostHog error tracking (@_spi(Experimental) import PostHog; config.errorTrackingConfig.autoCapture = true) and turn errorT… |
| `C-29` ⇢L1-D | T0/major | S | The launch screen is a blank rectangle whose colour does not match the app ground, in both appearances | shots/C/04-dark-launch-0.4s.png, 05, 43-light-launch-0.35s.png | Add a launch screen storyboard with the app ground colour and the PATINA mark (the mark already exists on the Welcome screen). |
| `C7-11` ⇢L1-C | T0/major | S | iPad ships as a device family with no iPad design and zero size-class handling in 435 files | Patina.xcodeproj/project.pbxproj:511,543,712,760,781,803 (TARGETED_DEVICE_FAMILY = "1,2"); :69… | Set TARGETED_DEVICE_FAMILY = 1 for round 1. iPad support is a design program, not a build setting. |
| `G-02` ⇢L2-G | T0/major | S | No gate anywhere builds Release or archives, which is how G-01 reached main | apps/mobile/Patina/scripts/ios-gate.sh:50-63; .github/workflows/policy-quality.yml:93-99 | Add a `release` tier to ios-gate.sh (xcodebuild build -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALL… |
| `A2-06` | T0/minor | S | No ITSAppUsesNonExemptEncryption and no encryption declaration — every upload parks in Missing Compliance | apps/mobile/Patina/Patina/Info.plist (key absent); ASC appEncryptionDeclarations | Add <key>ITSAppUsesNonExemptEncryption</key><false/> to Patina/Info.plist. The app uses only HTTPS/TLS plus Apple/swift-crypto fo… |
| `A2-14` ⇢L1-D | T0/minor | S | Launch screen has no declared background — the cold-launch flash does not match the app in either appearance | project.pbxproj INFOPLIST_KEY_UILaunchScreen_Generation = YES with no UIColorName; built plist… | Add a LaunchBackground colorset (light off-white / dark warm-graphite) and set INFOPLIST_KEY_UILaunchScreen_UIColorName = LaunchB… |
| `A2-21` ⇢L1-E | T0/minor | S | Three different names for the same product (Patina Design / Patina / com.patina.app) | ASC app name; built plist CFBundleName; Patina/Info.plist:21 | Decide one. If 'Patina' is the product, rename the ASC record (still PREPARE_FOR_SUBMISSION) so the TestFlight card and the home-… |
| `A2-23` | T0/minor | S | CODE_SIGN_IDENTITY = "Apple Development" is hard-set in the Release configs | project.pbxproj :487 (PatinaWidget Release), :747 (Patina Release) — unconditional, not [sdk=i… | Remove the override (inherit) or scope it CODE_SIGN_IDENTITY[sdk=iphoneos*] = "Apple Distribution" for Release. Combined with a s… |
| `A2-24` ⇢L1-F | T0/minor | S | aps-environment is 'development' in the shipped entitlements — push may register sandbox tokens in TestFlight | Patina/Patina.entitlements:5-6 | Part of the A2-07 dry run: unzip the exported IPA and run `codesign -d --entitlements` on the .app to confirm aps-environment: pr… |

### W0 · L0.2 Production backend (Kody-run; agent prepares and probes) — 3 findings

_count: 3 · blocker 2 · major 1 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-04` | T0/blocker | S | All 24 production profiles — emails, Stripe customer ids, phone, address — are readable by the anon key compi… | pg_policies: public.profiles; probe GET /rest/v1/profiles?select=* with Secrets.supabaseAnonKey | Replace the policy with `USING (auth.uid() = id)` plus an explicit narrow policy (or a SECURITY DEFINER view) for the columns oth… |
| `A3-05` | T0/blocker | S | anon holds SELECT/INSERT/UPDATE/DELETE on notification_preferences and a policy that grants ALL to unauthenti… | pg_policies + has_table_privilege: public.notification_preferences | Drop the policy and rely on service_role's RLS bypass; REVOKE INSERT/UPDATE/DELETE on the table from anon. Then re-probe. The sam… |
| `A3-15` | T0/major | S | tester@patina.cloud's notification feed is four designer-portal messages, one deep-linking to a host the app… | public.notification_log where user_id='86cdd0aa-403c-4154-ae63-69105425e506' | Give the first round a clean, purpose-built client account (consumer role, no designer sequences), or filter the iOS notification… |

### W0 · L0.3 The room is not empty (content: Kody + Leah; agent builds the seeding/image pipeline) — 3 findings

_count: 3 · blocker 1 · major 2 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-02` | T0/blocker | M | U38/U39 lineage: the marketplace returns zero pieces on production | Strata bkvcixdmuyejfzcijpdg — public.get_recommendations / public.get_aesthete_matches / publi… | Run the aesthete catalogue pass over the 8 published products (or seed product_style_spectrum rows) so the matcher returns them.… |
| `A3-21` ⇢L1-B | T0/major | M | The production category vocabulary cannot fill the app's six-category model — every catalog row is 'lighting' | public.products.category; Core/Models/ProductModel.swift:283-297 (ProductCategory + normalizin… | Fold into the catalogue seed (A3-01): cover all six categories, and normalize the stored vocabulary to the enum's raw values so `… |
| `A3-22` ⇢L1-B | T0/major | S | published_at is NULL on all 15 products and quality_score on all catalog rows, so every piece renders as 'new… | public.products; get_recommendations tier CASE; ProductModel.swift (matchLabel, tier); Product… | Set published_at and quality_score as part of the catalogue seed. Reconcile the two match-score defaults so one piece has one num… |

### W0 · L0.4 Help & tour content (Sanity; Kody authorizes the writes) — 4 findings

_count: 4 · blocker 0 · major 4 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-01` ⇢L1-C | T0/major | S | U32: production Sanity still serves the retired tour copy on all three steps | Sanity kv3qrinl/production, three helpContent docs under surfaceKey 'ios-app/first-launch-tour… | Publish the three bodies from artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md to the three surface keys in Sanit… |
| `C5-01` ⇢L1-C | T0/major | S | First-launch tour's LIVE Sanity copy describes a UI that no longer exists, and it overrides the correct in-ap… | apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:274-298 (fallbacks) + :881-905 (… | Update the three Sanity coachmarkContent docs to match defaultSteps' fallbacks (Kody's RESUME already lists this as OWED); or mak… |
| `C5-02` ⇢L1-C | T0/major | M | All six `?` help doors open on 'No help articles yet' — zero ios-app/* help articles exist in production Sani… | DailyRoomView.swift:188, ProfileView.swift:182, YourSpacesView.swift:114, QRScannerView.swift:… | Author the six ios-app/* root articles in Sanity before the invite, or hide the `?` until fetchArticles returns non-empty. |
| `R-10` ⇢L1-B | T0/major | M | The Help sheet renders an HTTP 400 as "No help articles yet … on the way", and tells the reader to pull down… | Today > Help; shots/R/01-preflight-after.png; app log 17:21:58.668 | Fix the malformed GROQ request (the `$sk` param is being sent as part of the query string rather than as `$sk` params), and split… |

### W0 · L0.5 App Store Connect (Kody-run; agent drafts every text) — 5 findings

_count: 5 · blocker 2 · major 1 · minor 2 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A2-04` | T0/blocker | S | Beta App Review details are empty — the external tester group can never be served a build | ASC app 6762007888, betaAppReviewDetails/6762007888 | Fill contact details; set demoAccountRequired=true with a working production account (try tester@patina.cloud / 000000 first); no… |
| `A2-05` | T0/blocker | S | No TestFlight test information (beta description, feedback email) — external submission blocked and testers g… | ASC app 6762007888, betaAppLocalizations | Create the en-US betaAppLocalization (description, feedbackEmail, marketingUrl https://patina.cloud/app, privacyPolicyUrl https:/… |
| `A2-20` ⇢L0.1 | T0/major | S | Age-rating declaration denies messaging and user-generated content that the app ships | ASC ageRatingDeclarations/d405ec23-68bb-4dfd-b971-18a6c4847ac2 | Re-answer the questionnaire honestly — messaging/chat yes (moderated, 1:1 with a professional), user-generated content per Apple'… |
| `A2-18` | T0/minor | S | Zero beta testers registered; both groups were created today and are empty | ASC app 6762007888 | Add Kody and any internal accounts to Internal Patina first and prove the whole chain on an internal build (no Beta App Review),… |
| `A2-19` | T0/minor | S | The only App Store provisioning profile is INVALID and none exists for the widget | ASC signing (bundle ids 47UZT5FK2Y cloud.patina.app, ACZ5623YSY cloud.patina.app.widget) | Let the A2-07 dry-run archive regenerate both; if it fails, delete the INVALID profile and re-archive. Verify the exported embedd… |

### W0 · L0.6 PostHog (Kody) — 1 findings

_count: 1 · blocker 0 · major 1 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-12` | T0/major | S | A4-12: OWED (Kody) — PostHog flags house-first / direct-orders / house-widget never targeted | artifacts/ios-daily-return-2026-08-26/RESUME.md OWED list; apps/mobile/Patina/Patina/Core/Stat… | Kody's call: target the round-one testers in PostHog before the invites go out, or ship the three flags on for 1.0. Config, not c… |

**W0 total: 34** — blocker 8, major 19, minor 7, polish 0.

---

## W1 — The first five minutes and the daily surfaces (T0 in-app) — 137 findings

### W1 · L0.2 Production backend (Kody-run; agent prepares and probes) — 1 findings

_count: 1 · blocker 1 · major 0 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `L07-01` ⇢L1-E | T0/blocker | M | Signing a proposal is impossible when the designer belongs to two active studios — the client is told the sig… | supabase/migrations/00511_public_sd_hardening.sql:2418-2440 (the projects BEFORE INSERT guard'… | Give the activation an unambiguous studio: either carry designer_clients -> studio onto the proposal and pass it to the projects… |

### W1 · L1-A Welcome, sign-in, onboarding — 27 findings

_count: 27 · blocker 3 · major 23 · minor 1 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-101` ⇢L1-E | T0/blocker | S | Delete-account copy scopes deletion to the device only (App Review 5.1.1(v) risk) | Settings → Delete account; shots/A/59-delete-account.png | State that the Patina account and its server data are deleted, name what is retained for legal/financial reasons and for how long… |
| `A3-06` | T0/blocker | S | "Continue with Google" is the first button on the welcome screen and Google is disabled on Strata — the teste… | Features/Authentication/Views/AuthScreenView.swift:82; Services/Auth/AuthService.swift:400-420… | Either enable the Google provider on Strata (client id + secret + redirect) or remove the button from AuthScreenView for this rel… |
| `P-29` | T0/blocker | S | Failed-sign-in error leaks onto the Welcome root, shifts the stack 33 pt, and the mis-tap lands the tester in… | Welcome home + Sign In sheet; shots/P/34-cancel-from-password.png, 35-welcome-shifted-33pt.png… | Never render sheet errors on the auth root; if a root status is needed, reserve its space so nothing moves. Fix P-18 independentl… |
| `A-03` | T0/major | S | Three different icon idioms in three stacked auth buttons | Welcome screen; shots/A/01-cold-t12.png, 68-universal-piece.png | Use Google's official G mark per their branding guidelines and an SF Symbol envelope; strip the glyph from the accessibility labe… |
| `A-05` | T0/major | S | "Skip" on the onboarding carousel does not skip — it lands in the same 5-question quiz | Patina/Features/FirstLaunch/Views/OnboardingFlowHost.swift:83-85; shots/A/02,04 | Either let Skip reach browsable content (with a "take the quiz later" entry point) or rename it "Next"; keep it visible on the la… |
| `A-13` ⇢L1-E | T0/major | S | A dead "Next question →" static text sits 26 pt above the real Continue button | Style quiz Q2; shots/A/08-quiz-q2-selected.png | Remove the static line (or make it the only affordance). |
| `A3-07` | T0/major | S | Sign in with Apple creates the tester as profiles.role = 'designer' | Services/Auth/AuthService.swift:354-383 (signInWithApple); public.handle_new_user() | Pass the same role metadata on the Apple path — supabase-swift's signInWithIdToken has no data: parameter, so follow success with… |
| `A3-16` | T0/major | M | The advertised tester credential (tester@patina.cloud / 000000) does not work in the iOS app — the test-login… | Services/Auth/AuthService.swift:583-601 (verifyOtp); supabase/functions/test-account-login/ind… | Either add the fallback to AuthService.verifyOtp (POST the pair, then verifyOTP with the returned token_hash when the plain path… |
| `B-12` | T0/major | S | A guest has no in-app sign-in route at all — the only action offered is a QR scan | Settings ▸ Account as guest — shots/B/23-guest-account.png, 24-guest-signin-web.png | Add a 'Sign in' / 'Create account' row to Account and Settings for guests that re-presents the auth sheet. |
| `B-13` ⇢L1-C | T0/major | S | The guest Studio's sign-in card offers 'Open settings' instead of a sign-in action | Studio as guest — shots/B/19-guest-studio.png, 75-guest-after-signout.png | Make the CTA 'Sign in' and present the auth sheet directly. |
| `B-21` | T0/major | M | An existing account is forced through the first-run intro and a mandatory 5-question quiz with no back, skip… | After signing in as client@patina.dev on a fresh install — shots/B/30-post-signin.png, 31-afte… | Link onboarding/quiz completion to the account, not the install; add a Back control and an 'I'll do this later' exit on every qui… |
| `C1-04` | T0/major | S | Quiz submit shows nothing for up to 30 seconds — isSubmitting has no reader | Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:160-199; Services/API/APIConfiguration.… | Render a 'Reading your answers…' state off isSubmitting; drop the quiz RPC timeout to ~8s (the local result is already the fallba… |
| `C1-05` | T0/major | S | Welcome screen has no in-flight state for any of its four sign-in buttons | Features/Authentication/Views/AuthScreenView.swift:14-31; ContentView.swift:36-70 | Thread AuthService.shared.isLoading in; disable the stack and spin the pressed row. |
| `C1-14` ⇢L1-C | T0/major | S | Settings → Account is a dead end for a guest, and Settings offers no way to sign in | Features/Settings/Views/SettingsView.swift:61-95; Features/Account/AccountView.swift:109-126,1… | A signed-out Account state that is one sentence and a 'Create your account' button raising presentedSheet = .auth; hide the QR ro… |
| `C1-28` | T0/major | S | Quiz answers survive only an explicit "Save progress & exit" | Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:80-99; StyleQuizView.swift:81-84 | Call saveProgress() on .onDisappear / scenePhase != .active; restore already covers both mounts. |
| `C1-30` | T0/major | S | "Privacy Policy" and "Terms of Service" open the same page | Features/Authentication/Views/AuthScreenView.swift:175-176 | Publish /privacy and point at it; until then render one link labelled 'Terms & Privacy'. |
| `C1-37` | T0/major | S | Six digits entered does not verify, and the green success banner stays up over the red failure | Features/Authentication/Views/AuthenticationView.swift:326-347,352-377; ViewModels/AuthViewMod… | Auto-verify on the sixth digit; clear successMessage when an error lands. |
| `C3-03` ⇢L1-D | T0/major | S | Sign in with Apple is hard-coded `.black` — 1.27:1 on the dark canvas, the button vanishes | Features/Authentication/Views/SignInWithAppleButton.swift:41 | Read @Environment(\.colorScheme) and pass `.signInWithAppleButtonStyle(scheme == .dark ? .white : .black)`. |
| `C3-06` ⇢L1-D | T0/major | S | The auth form's DISABLED state is painted in the brand accent and ENABLED in neutral charcoal — inverted affo… | Features/Authentication/Views/AuthenticationView.swift:519 (submitButton) and :366-370 (OTP Ve… | One filled style (charcoal + Text.inverse) with .opacity(0.4) when disabled. |
| `C5-04` ⇢L1-E | T0/major | S | 'Privacy Policy' on the first screen links to the Terms page; a real /privacy page exists and is never linked | apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:174-175 (termsURL… | privacyURL = URL(string: "https://patina.cloud/privacy")! |
| `C9-08` | T0/major | M | No keyboard-dismiss affordance exists anywhere in the app (numeric pads have no exit) | AuthenticationView.swift:327; RoomBudgetSheet.swift:61; ManualRoomEntryView.swift:65,133; Room… | One shared .keyboardDoneToolbar() applied to every numeric field, .scrollDismissesKeyboard(.interactively) on form scroll views,… |
| `P-02` | T0/major | S | "Continue with email" uses an emoji envelope and "Continue with Google" a plain letter G, on the app's first… | Welcome home, auth.welcome.emailButton / googleButton; shots/P/01-welcome-cold.png | SF Symbol envelope tinted to the ink token; ship the official Google G mark; strip glyphs from accessibility labels. |
| `P-18` | T0/major | M | After one tap on "Look around first", the sign-in screen is unreachable on every later launch and the quiz re… | Guest intro / style quiz; shots/P/14-relaunch2-root.png, 15-skip-destination.png, 16-relaunch3… | Persist quiz progress; put a persistent "I already have an account — Sign in" on every guest onboarding and quiz screen; make the… |
| `P-20` | T0/major | S | An invalid email produces no message at all — the button silently does nothing | Continue with email sheet; shots/P/20-email-malformed.png | Inline validation copy under the field plus a visibly inert disabled state. |
| `P-22` | T0/major | S | After a failed code the success and error banners show at once, and Verify is pushed off the bottom of the sh… | Sign-in code screen; shots/P/26-verify-t0.png, 28-verify-t5.png | One status region that replaces its contents; pin the CTA. |
| `P-30` | T0/major | S | One mechanism, three names — "Continue with email", "sign-in code", "magic link" — and "magic link" is factua… | shots/P/19-email-form.png, 23-code-requested-t0.png, 31-password-sheet.png | One name everywhere. |
| `A-21` | T0/minor | S | The quiz progress bar reads 100 % while the last question is unanswered | Style quiz Q5; shots/A/11-quiz-q5.png, 05 | Base the fraction on answers recorded, not on the index of the question being shown. |

### W1 · L1-B Data, persistence, resilience — 28 findings

_count: 28 · blocker 5 · major 22 · minor 1 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C7-01` | T0/blocker | M | ModelContainer failure is fatalError — no fallback, no MigrationPlan; a build-2 schema change crash-loops eve… | apps/mobile/Patina/Patina/Core/Persistence/PersistenceController.swift:25-48 | Add a SchemaMigrationPlan; on catch, move the old store aside and open a fresh one (or in-memory) behind a designed 'we had to st… |
| `C7-02` | T0/blocker | S | BoardModel is fetched and inserted against a container whose Schema does not contain it (Saved / Collections) | PersistenceController.swift:26-35 vs Core/Models/BoardModel.swift:12-13; Features/Collections/… | Add BoardModel.self to the schema (and to LocalStoreReset), or remove the boards feature from CollectionsView before shipping. |
| `GAP4-02` | T1/blocker | S | The fallback entry screen is a hard dead end: no back, no cancel, and the interactive-pop gesture is dead | ScanFallbackEntryView.swift (whole view) presented from QuietConversationFlowHost.swift:195-20… | Give the host a persistent "Not now" / ✕ that calls leaveFlow(landingOn: .heroFrame), and re-enable the interactive pop for the .… |
| `GAP4-03` | T1/blocker | S | Developer default dimensions are pre-filled and become the tester's real room data | ScanFallbackEntryView.swift:27-28 (length="18", width="14") + :283-287 (isValid); shots/GAP4/1… | Start the fields empty with real placeholders, disable Continue until both are entered, or label the row as a suggestion. |
| `GAP4-25` | T1/blocker | S | BLOCKER: "Rescan" on the floor plan strands the tester on a permanently blank screen; only force-quitting rec… | QuietConversationFlowHost.swift:337-346 (resetForRescan) + :145-152 (bootstrap) + content rout… | Have resetForRescan() call bootstrap() (or set the step directly), and give `.initial` a real loading state instead of a bare bac… |
| `A-34` ⇢L1-D | T0/major | M | Every recommendation scores 40–46 % match after a five-question quiz | Browse pieces; shots/A/14,15,16 | Either rescale/normalise the score so a good match reads as one, or stop showing a percentage and use a qualitative band ("Strong… |
| `A-81` | T0/major | M | Four different counts of "what needs you" on one screen | Daily Room home; shots/A/44-home-signedin.png | Derive every badge from one "needs you" query, or label each count with what it counts. |
| `A3-18` ⇢L0.2 | T0/major | S | Every product fetch pulls two 768-dim vectors the app never decodes — 20.7 KB per row, ~90% waste | Core/Network/ProductAPIClient.swift:113 (productSelect = "*,vendors!products_vendor_id_fkey(..… | Replace `*` with the ~24 columns RawProductWithVendor actually decodes. One-line change, ~10x smaller payload on the Record and o… |
| `B-03` | T0/major | S | A deleted room stays in Studio and the room count never updates | Studio after deleting 'Audit Room B' — shots/B/48-signedin-studio.png, 49-studio-scroll1.png,… | Invalidate/refetch the rooms query and the profile-stats query on room deletion, or drive both from one observable store. |
| `B-04` | T0/major | S | Deleting a room strands the user on the dead detail screen showing a hedged not-found error | Room detail immediately after Delete — shots/B/47-after-delete.png | Pop the navigation stack to the rooms list on successful delete; keep the not-found state only for genuine deep-link misses, and… |
| `C-11` ⇢L1-D | T0/major | M | The same product shows three different match scores in one session: 73%, 57%, 50% | Heirloom Oak Dining Table — shots/C/52-flagson-pieces.png (73%), 11-dark-browse.png (57%), 12-… | Compute the match once against a single scope and pass it through, or label each score with its scope ("73% for your home / 57% f… |
| `C1-19` | T0/major | S | .launching has no timeout: if auth readiness never lands, the splash is terminal | App/Coordinators/AppCoordinator.swift:258-262; Features/Splash/Views/SplashView.swift:55-59 | A 5–8s watchdog that forces .auth with a one-line 'We couldn't reach Patina — try again'. |
| `C4-03` | T0/major | M | Three empty states are indistinguishable from a failed fetch — two of them lie to a client who has data | apps/mobile/Patina/Patina/Features/Rooms/RoomSyncCoordinator.swift:189-197 + Features/Rooms/Vi… | Add lastLoadFailed to both view models and an error branch on the OrderDetailView.swift:41 model, which already distinguishes "we… |
| `C4-12` | T0/major | M | No pull-to-refresh on any of the four tab roots, or on three of four Studio detail screens | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:245 (Today), Features/Rooms/… | Add .refreshable to the four roots wired to the same work their .task blocks do, and to the three detail screens; InvoiceDetailVi… |
| `C4-16` | T0/major | S | supabase-swift reads inherit URLSession.shared timeouts (60 s request / 7-day resource), not the app's 30 s | apps/mobile/Patina/Patina/Core/Network/SupabaseClient.swift:54-63; budgets at Services/API/API… | Pass a configured URLSession into SupabaseClientOptions.GlobalOptions(session:) with timeoutIntervalForRequest = 30 and timeoutIn… |
| `C7-05` | T0/major | S | A fresh CIContext() is constructed per captured hero frame, on the main actor, mid-scan | apps/mobile/Patina/Patina/Features/Walk/Services/FrameCaptureService.swift:17 (@MainActor), :2… | Hoist to one lazily-created CIContext and move the encode off the main actor. |
| `C7-13` | T0/major | S | Telemetry queue re-queues failed batches without bound and rewrites the whole file every 30 s | apps/mobile/Patina/Patina/Services/Analytics/DailyRoomBatchQueue.swift:70-78,81-90,94-101; end… | Cap pending (drop oldest), add backoff on repeated failure, stop persisting on every failed tick. |
| `C7-15` | T0/major | S | A forced GoTrue token refresh runs before every single artifact upload | apps/mobile/Patina/Patina/Services/Sync/BackgroundScanUploader.swift:146-156 | Read auth.session (which refreshes only when expired) once per bundle rather than calling refreshSession() per artifact. |
| `C7-17` | T0/major | S | The U39 all-or-nothing decode still stands on the saved-pieces and single-piece reads | apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:170-174 and :146-148 | Wrap both in FailableDecodable exactly as decodeProducts already does. |
| `L07-05` ⇢L1-C | T0/major | S | The Studio hub shows stale counts as current when the backend is unreachable, with no staleness signal | apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioHubViewModel.swift (the hub's load… | Whatever staleness affordance R-03 lands on Today, apply to StudioHubViewModel in the same wave. VISION §6 constraint carried fro… |
| `R-01` | T0/major | M | Studio asserts the client has nothing (0 decisions, 0 records, no messages) for ~50 s during an outage, under… | Studio screen; shots/R/12a-studio-retry-t50-spinner.png, shots/R/13a-studio-false-empty.png | Never render section empty-states from a failed fetch. Give each Studio section three distinct states (loading / loaded-empty / f… |
| `R-02` | T0/major | M | Cold launch with the backend down silently deletes badge counts, the designer seat and a record row; the bell… | Today; shots/R/16-cold-3.png, 17b-cold-t22.png, 18-cold-today-bottom.png vs 00-preflight-befor… | Persist the last successful badge counts, designer seat and record rows; on a failed refresh keep showing them (optionally dimmed… |
| `R-03` | T0/major | S | Today has no pull-to-refresh and no staleness signal — the only way to recover is to background the app | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:249; shots/R/03a-ptr.png, 03… | Add `.refreshable` to the DailyRoomView ScrollView calling the same sequence as the scenePhase handler, and show a 'last updated'… |
| `R-05` | T0/major | M | Proposal shows a blank page with "One moment…" for 65-185 s before admitting failure | Proposal detail; shots/R/14a-proposal-t2.png … 14d-proposal-t185.png, 15a/15b | Cap the proposal fetch at ~10 s, render the proposal title/summary from the record row that launched it while loading (skeleton,… |
| `B-15` | T1/major | M | The previous account's taste portrait survives sign-out and shows under the Guest avatar | Studio as guest after signing James out — shots/B/75-guest-after-signout.png | Clear the on-device taste portrait, onboarding flags and companion state in the sign-out path, keyed by owner user id. |
| `C2-06` | T1/major | S | Sign-out leaves the previous account's screens on the navigation stack | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:276-280 and :223-225; Patina/C… | In beginSplashTransition() (or on the .main -> .auth/.launching transition) clear navigationPath, screenStack, every tabs stack,… |
| `GAP3-18` | T1/major | M | After sign-out the Guest profile still lists the previous account's rooms | ProfileView / DailyRoomView room rails after AuthService sign-out · shots/GAP3/22-guest-entry.… | Extend the sign-out LocalStoreReset to the room list/room-count sources, or scope those reads by `local_store_owner_user_id` the… |
| `C1-18` | T0/minor | S | The splash holds 1.5s on every cold launch and its own animation never finishes | App/Coordinators/AppCoordinator.swift:77-81,258-262; Features/Splash/Views/SplashView.swift:41… | Bring the wordmark fade to ≤1.2s and drop the floor to ~0.6s (or 0 when isAuthStateReady is already true). |

### W1 · L1-C Layout, Companion, Dynamic Type — 28 findings

_count: 28 · blocker 3 · major 25 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `GAP1B-01` ⇢L1-E | T0/blocker | M | Approve and Cancel are off-screen on the decision consent sheet at accessibility text sizes | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:368-448 (DecisionC… | Replace the fixed [.medium,.large] with a content-driven detent (or .large alone at accessibility sizes via @Environment(\.dynami… |
| `GAP1B-02` | T0/blocker | S | Send is clipped and Cancel is gone on the decision defer sheet at accessibility text sizes | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDeferSheet.swift:26-79, presented a… | As GAP1B-01: content-driven detent plus a pinned bottom button pair. |
| `GAP4-16` ⇢L1-D | T1/blocker | S | The Reveal's only CTA is invisible in light mode: charcoal capsule on a charcoal ground | RevealView.swift:34 (PatinaColors.charcoal ground) + StyleContinueButton.swift:36-40 + PatinaC… | Paint the Reveal with the semantic inverse-surface tokens, or give StyleContinueButton an explicit on-charcoal fill variant. |
| `A-100` | T0/major | S | The Settings sheet has no dismiss control | Settings; shots/A/54, 55 | Add a "Done" toolbar item (or .presentationDragIndicator(.visible)). |
| `A-45` ⇢L1-D | T0/major | S | Back, Share and Save scroll off the top of the product detail | Product detail; shots/A/19-product-detail-scrolled.png | Pin the overlay controls (or collapse them into a real navigation bar with a material) instead of letting them scroll with the he… |
| `A-50` | T0/major | S | The Companion's first-run coach mark covers the menu it is explaining | Companion menu, first open; shots/A/20-companion-menu.png | Anchor the coach mark below the menu (or dim the menu and highlight one row) so the described content stays visible. |
| `A-89` | T0/major | M | The circular Back button floats over scrolling content with no bar or material behind it | Studio, invoice detail, notifications, room detail; shots/A/47-studio-scroll1.png, 50-invoice-… | Give the back control a real navigation bar with a scroll-edge material, or a top content inset. |
| `A-99` | T0/major | S | Switching Appearance back to Light leaves the Settings sheet dark | Settings → Appearance; shots/A/57, 60, 63, 64, 65 | Apply the preferredColorScheme at the window/scene level (or pass it into the sheet's environment) instead of on the presenting v… |
| `A1-14` | T0/major | S | DesignerConsultationView shows a hard-coded placeholder 'Matched Designer' card | apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift:55-75 | Replace the card with the flow's own value proposition, or delete it and let the screen be the hero + 'Start a request'. |
| `B-07` | T0/major | S | The inline help tooltip's text overflows its own bubble top and bottom | Today, small (?) beside 'Good afternoon.' — shots/B/17-guest-inline-help.png | Size the bubble from its text (fixedSize / intrinsic content height) instead of a fixed frame, and add vertical padding. |
| `B-09` | T0/major | S | The first-launch tour's Skip/Next are stock iOS system blue — the only blue in the app | Today, first-launch tour — shots/B/14-guest-today.png, 15-tour-step2.png, 66-relaunch-james.pn… | Set an app-wide .tint to the Patina brown and restyle the tour bubble to the app's card/typography system. |
| `B-10` | T0/major | M | Every coach mark covers the content it is describing | Today tour step 1, Companion first-open card — shots/B/14-guest-today.png, 68-companion-open.p… | Anchor the bubble below/beside its target with a highlight cut-out, or dim everything except the target. |
| `B-27` | T0/major | M | The pinned 'Your Studio' capsule title floats over and hides list content as the page scrolls | Studio — shots/B/19,20,49,57 | Use a real collapsing navigation title with a scroll-edge material, or drop the capsule and inset the content below it. |
| `B-28` | T0/major | S | After a payment failure the Pay button is pushed entirely behind the tab bar and the error panel is clipped | Invoice detail after tapping Pay — shots/B/54-pay-result-b.png + scan_ui | Scroll the failure into view, add a bottom safe-area inset for the tab bar, and keep Pay visible (or make the retry the primary b… |
| `B-60` | T0/major | S | The 'Add a new room' sheet mixes three background materials and two icon systems | Add a new room sheet — shots/B/39-add-room.png | Give the sheet one opaque background at a fixed detent and use the same tile treatment for both rows. |
| `C-05` | T0/major | S | Four "?" controls at three sizes on one header; three share the identical label "More information" | Your Spaces; shots/C/09-dark-spaces.png, 51-flagson-spaces.png | Collapse to one help affordance per screen; give any remaining ones distinct labels naming their subject. |
| `C-06` ⇢L1-D | T0/major | M | Dynamic Type breaks headline text mid-word — "Good / afternoo / n." at XXXL, six fragments at AX sizes | shots/C/30-xxxl-today.png, 35-ax3xl-today.png, 36/37-ax3xl-companion, 38-ax3xl-spaces | Let the header stack switch to a vertical layout above .xxLarge (ViewThatFits / dynamicTypeSize check), and add minimumScaleFacto… |
| `C-18` | T0/major | S | The greeting "?" tooltip clips its own copy at the top AND the bottom, and the trigger is unreachable by Voic… | Today; shots/C/07-dark-greeting-help.png | Size the bubble to its content, make it opaque, and either give the trigger a real accessibility label or delete it (it duplicate… |
| `C5-05` ⇢L1-E | T0/major | S | Settings → 'Help Center' opens a 404 (silently lands on the marketing home page) | apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:153-155 | Point at a page that exists, or remove the row until one does. |
| `C6-18` | T0/major | S | Room-type chips: six in a fixed row, 24pt tall, colour-only selection, no labels | Features/Rooms/Components/RoomTypePillRow.swift:24-45 (used by Name Your Room, Manual Entry an… | Give each chip a 44pt min height, add .isSelected, and let the row wrap (ViewThatFits or a flow layout) at accessibility sizes. |
| `C9-04` | T0/major | M | Twenty hard-coded bottom clearances, none derived from CompanionHearthMetrics | DailyRoomView.swift:371, ProfileView.swift:167, YourSpacesView.swift:97, CrossRoomView.swift:4… | Replace all twenty with CompanionHearthMetrics.pinnedFooterClearance(houseFirst:) (or the reservation modifier where the screen s… |
| `P-34` ⇢L1-A | T0/major | M | At the largest Dynamic Type size the first screen collapses: every button label truncates, text breaks the gu… | Welcome home at content_size accessibility-extra-extra-extra-large; shots/P/40-welcome-ax3xl.p… | ScrollView fallback above .accessibility1; minimumScaleFactor/multi-line button labels; stacked legal links; let the Apple button… |
| `R-06` | T0/major | S | Browse / Recommendations does not fill the screen in its loading, error AND empty states — a cream band float… | apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:59 and :145… | Add `.frame(maxWidth:.infinity, maxHeight:.infinity, alignment:.top)` to the root VStack before the `.background`, so the cream g… |
| `C-23` | T1/major | S | Two different sheet chromes: Settings has no dismiss control and no grabber, Help has both | shots/C/29-dark-settings.png vs 32-xxxl-help-panel.png | Pick one sheet pattern and apply it everywhere; give Settings a Done button. |
| `GAP1B-03` ⇢L1-D | T1/major | M | "Good evening." breaks mid-word on the Today home at accessibility text sizes | Today home header (DailyRoomView) — the greeting shares a horizontal band with the bell/help/S… | Give the greeting the full content width and move the bell/help/Studio cluster to its own row (or a toolbar) at dynamicTypeSize >… |
| `GAP1B-07` ⇢L1-D | T1/major | S | "Cancel" on both decision sheets is a 17.6 pt tap target | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:438-441 and Decisi… | Give .ghost the same 44 pt min height and full-width frame as the other PatinaButton styles. |
| `GAP1B-08` ⇢L1-A | T1/major | S | The auth screen’s text links are all ~15-17 pt tall | Welcome + Sign In screens (Features/Authentication) — measured via idb ui describe-all | .frame(minHeight: 44).contentShape(Rectangle()) on each link. |
| `GAP2-24` | T1/major | S | The "Pay $4,250.00" button starts one point below the fold on an iPhone 17 Pro | Invoice detail — shots/GAP2/51-invoice-detail.png (at rest) vs 52-invoice-detail-bottom.png | Pin the pay button to the bottom safe area (this screen earns a fixed footer), or shorten the sections above it. |

### W1 · L1-D Tokens, dark mode, contrast, iconography — 18 findings

_count: 18 · blocker 1 · major 17 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-01` | T0/blocker | M | Every product surface is empty on production: get_recommendations returns zero rows for every tester | Strata public.products / get_aesthete_matches; ProductAPIClient.swift:80-92 (withholdingUnreso… | Seed a real catalogue: >=30 layer='catalog' status='published' products with brand or vendor, images, price, category and a produ… |
| `A-11` ⇢L1-A | T0/major | M | Full-colour system emoji are the production iconography of the style quiz | Style quiz Q2/Q4/Q5; shots/A/07,08,10,11 | Replace with SF Symbols or the brand's line icons, in a single weight and one colour; strip the glyph from the accessibility labe… |
| `A-36` ⇢L0.3 | T0/major | S | Missing images render as flat colour blocks with no missing-image state | Browse pieces; shots/A/15-browse-scroll1.png, 16 | Add a designed placeholder (brand mark on a tint) plus a shimmer for the loading case, and distinguish loading from permanently-m… |
| `A-73` ⇢L1-A | T0/major | S | White-on-tan primary buttons fail contrast (~2.2:1) | Auth, coach mark, invoice; shots/A/34,38,20,50 | Darken the tan for filled buttons or use ink text on tan; validate every filled-button pairing. |
| `A-90` | T0/major | S | "Pay $4,250.00" is painted in the app's disabled-button tan at ~2.2:1 contrast | Invoice detail; shots/A/50-invoice-bottom.png vs 34/37 | Give enabled/disabled genuinely different treatments (black = enabled, reduced-opacity grey = disabled) and never reuse the accen… |
| `A3-17` ⇢L0.3 | T0/major | M | The three editorial stories have no hero images and claim a 3–5 minute read on ~400-character bodies | public.editorial_stories (3 rows); Core/Network/EditorialStoriesAPIClient.swift | Commission real bodies and hero images for at least these three rows, or compute read_minutes from the body and hide the badge be… |
| `B-18` ⇢L0.3 | T0/major | L | Product photography contradicts the product, and a missing image renders as a bare grey block | Pieces grid and product detail — shots/B/13-guest-home-today.png, 34-signedin-today-b.png, 67-… | Re-shoot/re-map the seeded catalogue imagery, and give the image slot a designed placeholder (mark + product name) instead of an… |
| `C-01` | T0/major | S | Companion orb is invisible in dark mode — hardcoded fill, 1.15:1 against the page | Today/all flags-OFF screens; shots/C/06-dark-launch-2.0s.png vs 00-preflight-before.png | Give the orb an adaptive fill (invert to a light disc in dark mode) or add a border/shadow token. Same fix covers the Companion p… |
| `C-02` | T0/major | S | Companion status line is dark-on-dark in dark mode (1.11:1) while the title stays white | Companion sheet; shots/C/crop-dark-companion-header.png vs crop-light-companion-header.png | The panel is a fixed dark surface; the subtitle uses a colour that flips with the system appearance. Pin the subtitle to the pane… |
| `C-20` | T0/major | S | Dark-mode text contrast fails WCAG on the de-emphasised rows: meta 2.66:1, body 4.27:1 | Today "MOVED" rows; shots/C/06-dark-launch-2.0s.png | Raise the dark-mode de-emphasised ink to ≥4.5:1 (body) and ≥3:1 (meta). |
| `C-27` ⇢L0.3 | T0/major | S | Pieces tab renders a missing product image as a blank cream rectangle, with overlay chrome at 2.01:1 on it | "Wool Kilim Runner"; shots/C/52-flagson-pieces.png | Add a branded image placeholder and a failed-load state; give the overlay chrome a guaranteed scrim so it holds contrast over lig… |
| `C-41` | T0/major | S | Two competing primary-button styles: solid gold vs near-white pill | shots/C/20-dark-proposal-scrolled.png and 23-dark-invoice-bottom.png (gold) vs 10-dark-room.pn… | One primary token; pick a different disabled treatment. |
| `C3-01` | T0/major | M | `pearl` is a light-only hairline used 89x as the app's border/divider colour — 12.8:1 in dark mode where 1.2:… | PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:43 + 89 call sites (PatinaTa… | Add Border.hairline / Border.strong semantic tokens built with Color.patinaDynamic(light: pearl, dark: <graphite +1 notch>), then… |
| `C3-05` | T0/major | M | White/off-white labels on `clay` fills are 2.33:1 across ~15 selected-state controls, including a PatinaButto… | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:94,105; RoomTypePillRow.… | Route filled selection states through FilterChip / PatinaButton(.primary) (charcoal + Text.inverse), or use clayDeep for filled s… |
| `C3-15` | T0/major | M | 46 inline `.font(.custom("Face", size:))` bypass PatinaTypography — and one names PlayfairDisplay-Light, whic… | Features/StyleReveal/Views/RevealView.swift:85 (the bug) and :127; ScanFloorPlanPreviewView.sw… | Ship PlayfairDisplay-Light or change that call to -Regular; promote the 46 inline sites to named PatinaTypography tokens; raise t… |
| `C5-14` ⇢L1-E | T0/major | M | Two money formats ship at once — Today shows $4,200 and $4.2K for the same piece one tap apart | canonical Features/Shared/CurrencyFormatting.swift; bypasses at ProductModel.swift:181-187, Sa… | Route all ten through PatinaCurrency; if a compact 'K' form is wanted, put it inside PatinaCurrency so there is one rule. |
| `P-25` | T0/major | S | The OTP field's placeholder is "000000", exposed as its accessibility value, and a filled field looks almost… | auth.otp.tokenField; shots/P/23-code-requested-t0.png vs 25-code-entered.png | AXValue empty, accessibilityLabel "Sign-in code"; six digit boxes or a clearly distinct filled state; a placeholder that isn't a… |
| `P-35` | T0/major | S | In dark mode the primary CTA is pure black on a near-black ground | Welcome home, appearance dark; shots/P/39-welcome-dark.png | Switch the Apple button style with the colour scheme. |

### W1 · L1-E Copy — 18 findings

_count: 18 · blocker 0 · major 16 · minor 2 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-52` | T0/major | S | The Companion promises a designer and a home to an anonymous guest | Companion menu (guest); shots/A/21-companion-menu-open.png | Branch the Companion copy on auth state; for guests say what signing in would unlock rather than asserting a relationship. |
| `A-60` | T0/major | S | The tour calls the destination "Your profile"; the button it points at says "Studio" | Coach tour step 2; shots/A/26-tour-step2.png | Pick one name for the client's own space and use it in the pill, the tour, the section header and the Companion menu. |
| `A-79` | T0/major | S | The guest→account migration sheet names data the user does not have | Immediately after sign-in; shots/A/42-signed-in-home.png | Compose the sentence from actual counts ("Keep the 1 piece you saved on this phone?"), and omit the sheet entirely when there is… |
| `A3-28` | T0/major | M | 'client', 'homeowner' and 'designer' are three words for two kinds of person in profiles.role | public.profiles.role; handle_new_user(); AuthService.sendMagicLink / signUp | Pick one word, migrate the rows, and flip handle_new_user's COALESCE fallback to that word so an unlabelled signup is never a des… |
| `B-20` | T0/major | S | Room CTA is built as 'for the ' + room name, producing ungrammatical copy | Room detail primary button — shots/B/43-room-detail.png | Drop the article: 'Browse pieces for Audit Room B', or use a fixed label 'Browse pieces for this room'. |
| `B-23` | T0/major | S | 'Your portrait stays on this device' but the quiz answers are POSTed to the backend | Taste Portrait footnote — shots/B/11-quiz-done-a.png, 32-portrait-signedin.png | Either stop sending guest answers, or reword to what is true ('Your portrait is yours — reset it any time in Settings'). |
| `C-22` ⇢L1-C | T0/major | M | "Your studio", "Your profile" and the "Studio" pill all land on one screen, and the promised "Portal" does no… | shots/C/16-dark-studio.png vs 27-dark-profile.png (identical) | Split profile from studio, or relabel the Companion rows to match the single destination and drop the Portal promise. |
| `C-30` | T0/major | S | "1 ROOMS" — pluralisation bug on the profile stat (the accessibility label gets it right) | Studio/profile hub; shots/C/16-dark-studio.png | Use a String.LocalizedStringResource with an inflection rule for the visible label too. |
| `C-38` | T0/major | S | Identical truncated boilerplate on every browse card: "Selected from Patina's room-aware edit for Gu…" | Room-scoped browse grid; shots/C/11-dark-browse.png | Delete the line (as the Pieces tab already does) or move it to a one-time section note. |
| `C4-08` | T0/major | S | AR "Save View" toast prints a Swift enum's default description, module name and all | apps/mobile/Patina/Patina/Features/ARPlacement/Views/ARPlacementView.swift:111-113 | Map to app copy in the view model; and make RoomsAPIError conform to LocalizedError so no other caller can repeat it. |
| `C4-09` | T0/major | M | The design-request send screen prints storage / Postgres error strings to a homeowner | apps/mobile/Patina/Patina/Features/RoomScan/Shared/Components/ScanUploadProgressView.swift:57-… | A ScanUploadFailureCopy mapping upload phase → app sentence; lastError becomes a diagnostic column no view reads. |
| `C5-06` | T0/major | S | Today's headline says 'Good night.' for 8 hours a day, 'Early morning.' at dawn and 'Good day.' at midday | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift:26-41, rendered as… | night → 'Good evening.', day → 'Good afternoon.', dawn → 'Good morning.'; drop the terminal periods. |
| `C5-09` | T0/major | M | Third noun collision — Piece / Product / Item — plus a SwiftUI class name printed as a button label | ItemActionMenu.swift:31 ('View Product Detail'); PatinaDesignKit/.../PatinaEmptyState.swift:66… | 'piece' everywhere in consumer copy (the brand's and the tab's word); ItemActionMenu row → 'See the piece' (the phrase OrderPlace… |
| `C5-10` | T0/major | M | Title Case and sentence case collide inside single screens (Settings, the auth sheet, onboarding) | SettingsView.swift:81 'Sign Out' vs :89 'Delete account' (adjacent rows; same pair AccountView… | Adopt sentence case except proper nouns (what the newer copy already does) and sweep. Settings and the auth sheet are the highest… |
| `C5-11` | T0/major | M | Four spellings of 'Something went wrong', and a raw interpolated error on the design-request send screen | PatinaErrorState.swift:41,49; CompanionAPIModels.swift:291; ScanReviewView.swift:128; DesignRe… | One PatinaErrorState sentence; delete the two raw arms; rewrite .submissionFailed as "We couldn't send your request. Nothing was… |
| `C5-16` ⇢L1-B | T0/major | S | Room rows still print the literal 'UNKNOWN MAKER' that the Browse grid was fixed (SP-10) to suppress | Features/Rooms/Components/RoomItemRow.swift:43 and :89; Features/Rooms/Views/ItemActionMenu.sw… | Give SavedItem the same resolvedMakerName guard and drop the line when nil. |
| `A-06` | T0/minor | S | Apostrophes are mixed within one three-page carousel | Patina/Features/Onboarding/Views/OnboardingFlowView.swift:31,37,57,58 | Sweep every user-facing string for U+2019; add a lint rule. |
| `C5-20` | T0/minor | S | 'Start Your Journey' and 'Join the furniture discovery journey' are brand-voice violations | OnboardingFlowView.swift:32; AuthenticationView.swift:134 | "Let's begin" (already page 3's CTA) and a signup subtitle that says what an account buys. |

### W1 · L1-F Notifications, messaging, widget, deep links — 17 findings

_count: 17 · blocker 1 · major 16 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `L07-02` ⇢L1-C | T0/blocker | S | On the four-tab root the message composer is drawn under the tab bar and cannot be tapped — a round-one clien… | apps/mobile/Patina/Patina/Features/Messaging/Views/ThreadDetailView.swift:58 (composer as the… | Apply the existing seam: .padding(.bottom, CompanionHearthMetrics.pinnedFooterClearance(houseFirst: FeatureFlags.shared.isOn(.hou… |
| `A-63` | T0/major | S | The notifications empty-state "Sign in" button is a circle narrower than its own label | Notifications (guest); shots/A/29-guest-bell.png | Use a capsule with intrinsic width and horizontal padding instead of a fixed square frame + Circle clip. |
| `A-80` ⇢L1-B | T0/major | S | The notifications screen shows its EMPTY state while data is still loading | Notifications, immediately after sign-in; shots/A/43-after-migrate.png vs 45 | Add a loading state (skeleton rows) and only fall through to the empty state once the fetch has resolved with zero rows. |
| `B-16` | T0/major | S | The widget App-Group snapshot is not cleared on sign-out and carries no account identifier | group.cloud.patina.app container — research/B.md §Step 12 | Write an owner user id into the snapshot, and truncate/replace both files with a signed-out placeholder on sign-out, then WidgetC… |
| `C-13` | T0/major | S | The message thread has no header at all — the tester is never told who they are messaging | shots/C/26-dark-messages.png; full describe_screen | Add a conversation header with the designer's name, avatar and project. |
| `C-14` | T0/major | S | The message thread's only content is a system log line, "Project conversation opened." | shots/C/26-dark-messages.png | Replace with a real empty state ("Say hello to Leah — she usually replies within a day") and suppress the audit line. |
| `C2-02` ⇢L1-B | T0/major | S | Universal link arriving before configure(coordinator:) is dropped, yet reported handled | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:64-71 (vs the correct pattern… | Use the same stash-or-open pair the widget branch uses: when coordinator == nil, set pendingRoute = route. |
| `C2-07` | T0/major | S | The bell's unread badge stays stale after reading the feed | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:28,106-108,258; Patina/Featu… | Source the unread count from one shared @Observable service (BadgeCountService is already refreshed on the same triggers), or rel… |
| `C2-09` | T0/major | S | "Turn on notifications" is a silent no-op when authorization was already denied | apps/mobile/Patina/Patina/Services/API/PushTokenService.swift:66-77; Patina/Features/Notificat… | Read notificationSettings().authorizationStatus before asking; on .denied print the equivalent of InvoiceReminder.deniedLine and… |
| `C2-21` ⇢L1-A | T0/major | M | A deep link tapped while signed out is queued invisibly, only drains at .main, and holds one URL | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:94-97,243-246; Patina/App/Deep… | Queue for every non-.main phase, acknowledge it on the auth screen in one line, and hold a small FIFO rather than one slot. |
| `C4-04` | T0/major | S | A failed message send in a conversation is completely silent | apps/mobile/Patina/Patina/Features/Messaging/ViewModels/MessagingViewModel.swift:246-258 + Fea… | Render viewModel.error above the composer regardless of messages.isEmpty, with a Retry that re-sends draft; better, an unsent bub… |
| `GAP7B-02` ⇢L0.6 | T0/major | M | With house-widget OFF — the TestFlight first-launch condition — the PLACED widget stays on "Open Patina to se… | apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift (mirror); WidgetSnapshot.flagOn; Patin… | Ship the widget ungated for the TestFlight round (D5), or hide it from the gallery while the flag is off, or make the no-data car… |
| `GAP7B-03` | T0/major | S | Every row title on the small widget truncates mid-word | PatinaWidget/HouseWidgetViews.swift (small family row titles) | Two-line titles with lineLimit(2) + minimumScaleFactor, or a smaller type ramp for the title. Adding .systemMedium (GAP7B-07) als… |
| `GAP7B-04` | T0/major | M | The whole small widget is one tap target pointed at the FIRST row, so tapping the second row opens the first… | apps/mobile/Patina/PatinaWidget/HouseWidgetViews.swift:38 — .widgetURL(PatinaWidgetLinks.link(… | Either draw one row on systemSmall with a real destination, or make the card’s tap target visibly the whole record ("See what mov… |
| `GAP7B-05` | T0/major | M | The first widget row is a "story" with no route at all, so the widget’s only live tap target lands on Today | house-record.json (row story:a8b3f8a0-… has no route key); App/DeepLinking/DeepLinkHandler.rou… | Give story rows a destination, or exclude rows with no route from the widget projection. |
| `GAP7B-09` ⇢L1-A +GAP7-03,GAP7-04 | T0/major | M | A link tapped while signed out is not queued, not acknowledged, and never arrives — not even after signing in | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:94-97,243-246; App/DeepLinking… | Queue for every non-.main phase, hold a FIFO not one slot, persist the pending destination (App Group/UserDefaults with a short T… |
| `L07-03` ⇢L1-B | T0/major | S | A message that fails to send says nothing for at least a minute, then silently reappears in the composer | apps/mobile/Patina/Patina/Features/Messaging/Views/ThreadDetailView.swift:36 — `} else if let… | Drop the messages.isEmpty condition and render the send error inline above the composer. The invoice screen's failure banner is t… |

**W1 total: 137** — blocker 14, major 119, minor 4, polish 0.

---

## W2 — Build 2, the first tester week (T1) — 365 findings

### W2 · L0.1 Build & configuration (iOS, agent) — 9 findings

_count: 9 · blocker 0 · major 0 · minor 9 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-01` | T1/minor | S | The launch screen is plain white with the status bar hidden; the app is cream with one | Patina.xcodeproj/project.pbxproj:690-691; shots/A/01-cold-t1.png | Ship a LaunchScreen storyboard using the brand background colour (and, ideally, the wordmark) so the launch image and the splash… |
| `A-102` | T1/minor | S | Settings shows no app version or build number, and no feedback entry | Settings, end of list; shots/A/55-settings-scroll.png | Add a footer with CFBundleShortVersionString (CFBundleVersion) and the GitCommit sha, plus a "Send feedback" row that prefills th… |
| `A2-08` | T1/minor | S | GitCommit.swift is gitignored but compiled, and its directory is not a sandbox-declared output — clean-checko… | project.pbxproj "Stamp Git SHA" phase CBE19A312F1D5E34007686CD (:411-429); .gitignore:57; Pati… | Either commit a GitCommit.swift with sha = "" (remove .gitignore:57) and let the Debug-only phase overwrite it, or emit into $(DE… |
| `A2-09` | T1/minor | S | Secrets.swift is gitignored and its example twin is excluded from the target — a clean checkout does not comp… | .gitignore:53; project.pbxproj membershipExceptions = (App/Configuration/Secrets.example.swift… | Keep the key out of git but make the symbol always exist: include a fallback Secrets declaration in the target, or generate Secre… |
| `C7-33` | T1/minor | S | DeploymentTarget is read from the whole UserDefaults search list, not just the argument domain | apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift:25-33 | Read the argument domain explicitly and compile the .local branch out of Release. |
| `C9-07` | T1/minor | S | INFOPLIST_KEY_UIStatusBarHidden = YES is inert; one screen hides the bar anyway | project.pbxproj:691,739; Features/Home/Views/DailyStoryDetailView.swift:51 | Drop INFOPLIST_KEY_UIStatusBarHidden (the app clearly wants the status bar) and decide whether the story-detail hide is intention… |
| `C9-20` | T1/minor | S | aps-environment is `development` in the single shared entitlements file used for Release | apps/mobile/Patina/Patina/Patina.entitlements:6-7 | Confirm what Xcode's distribution export actually writes; if it does not rewrite the value, split Debug/Release entitlements file… |
| `G-07` | T1/minor | S | Permission strings are split-brained: build settings silently override the tracked Info.plist, and the shippe… | apps/mobile/Patina/Patina/Info.plist vs the INFOPLIST_KEY_NS*UsageDescription build settings (… | Pick one source of truth — the build settings already win — delete the shadowed keys from Patina/Info.plist, and rewrite the came… |
| `GAP5-05` | T1/minor | S | RECONCILIATION: UIStatusBarHidden = true is inert on BOTH idioms — A2-11's premise is wrong | shots/GAP5/07-ipad-statusbar-crop.png (iPad) vs 06-phone-statusbar-crop.png (top 160 px of the… | Delete INFOPLIST_KEY_UIStatusBarHidden from both targets; keep the one per-view call. It redirects A2-11: there is nothing to un-… |

### W2 · L0.2 Production backend (Kody-run; agent prepares and probes) — 3 findings

_count: 3 · blocker 0 · major 1 · minor 2 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-14` ⇢L1-B | T1/major | S | fulfillment_orders / _order_items / _shipments have no client SELECT policy — a tester's real order shows not… | pg_policies for the three fulfillment_* tables | Ships with A3-03 (apply 00540). Until then order tracking silently renders empty for a real order — worse than an error. |
| `A3-10` ⇢L1-B | T1/minor | S | client_designer_roster view does not exist on Strata — the app's designer-of-record read 404s | Core/Network/RosterAPIClient.swift:40; GET /rest/v1/client_designer_roster | Ships with A3-03 (apply 00536). Until then the roster call should read as 'no designer yet' rather than an error. |
| `A3-19` | T1/minor | S | vendors is anon-readable including internal trade notes | GET /rest/v1/vendors?select=* with the shipped anon key | Narrow the anon SELECT policy to the three columns the embed needs, or move the embed behind a SECURITY DEFINER view that project… |

### W2 · L0.3 The room is not empty (content: Kody + Leah; agent builds the seeding/image pipeline) — 2 findings

_count: 2 · blocker 0 · major 0 · minor 1 · polish 1_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-25` | T1/minor | M | The 14 non-catalog products are dev captures with placeholder names, hot-linked to third-party retail CDNs | public.products where layer='personal' | Clean or delete before promoting anything to catalog. Mirror images into the product-images bucket (public, already provisioned)… |
| `GAP8-12` ⇢L1-E | T1/polish | S | "4 MIN READ" over a 489-character story | Core/Models/DailyStory.swift:30; supabase/migrations/00143_editorial_stories.sql:151 | Derive read_minutes from the body, or drop the claim until the stories are real. |

### W2 · L0.4 Help & tour content (Sanity; Kody authorizes the writes) — 1 findings

_count: 1 · blocker 0 · major 1 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `GAP8-05` ⇢L1-C | T1/major | S | The first sentence the app says on production is false, and it comes from Sanity | Sanity kv3qrinl/production helpContent _id cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54 (surfaceKey io… | Publish artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md to Sanity before the TestFlight round; it is written and… |

### W2 · L1-A Welcome, sign-in, onboarding — 41 findings

_count: 41 · blocker 0 · major 18 · minor 21 · polish 2_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-14` | T1/major | S | The quiz uses two different advance models across five questions | Style quiz Q1–Q3; shots/A/05,06,07,08,09 | Pick one model (select → Continue) for every question, and show the selection before advancing. |
| `A-25` | T1/major | S | The style-quiz result is a name that was never offered and collides with two of the options | Style reveal; shots/A/05-quiz-q1.png, 13-quiz-result-t1.png | Either name the portraits from a vocabulary disjoint from the option labels, or echo the chosen option in the reveal ("Warm Minim… |
| `A-58` | T1/major | M | A guest has no settings, no help centre, no notifications and no home until the second launch | Whole guest walk; shots/A/02–24 vs 25–29 | Land the guest on the home after the reveal, with the recommendations as one module on it; run the tour on that first arrival. |
| `C1-08` | T1/major | S | Auth fields declare no textContentType: no Passwords autofill, no keychain save, no keyboard flow | Features/Authentication/Views/AuthenticationView.swift:654-707 (AuthTextField), call sites :18… | Add .textContentType per field, a @FocusState chain and .submitLabel(.next/.go). |
| `C1-10` | T1/major | M | The guest→account claim sheet can be requested while another sheet owns the screen, then never presents — and… | Features/Companion/Views/CompanionOverlay.swift:557-563,565-597; Services/Auth/AuthService.swi… | Add `initial: true` to the onChange and hoist the claim onto ContentView so it does not depend on which sheet is mid-animation. |
| `C1-11` | T1/major | S | The emailed link and the typed code give two different first runs — the link skips onboarding entirely | App/DeepLinking/DeepLinkHandler.swift:131-150 (AppSettings.shared.hasCompletedOnboarding = tru… | Set the flag only when the account is not new (gate on an existing StylePreferenceModel / profiles.created_at), or drop it. |
| `C1-12` | T1/major | M | Nothing in the app can set or edit your name, and the one writer writes where the app does not read | Services/Auth/AuthService.swift:388-396; Services/Auth/ProfileService.swift:189-191; Features/… | An editable name row in Account writing both profiles.display_name and user metadata; ask for a name once in onboarding. |
| `C1-15` | T1/major | S | Delete account runs a 30-second network call with no in-flight state | Features/Account/AccountView.swift:86-105,188-204; Features/Settings/Views/SettingsView.swift:… | Read isDeletingAccount — disable the row and swap the label for a ProgressView. |
| `C4-22` | T1/major | S | Magic-link failures land as GoTrue's own sentence on the welcome screen, with no "send me a new code" | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:131-149; Services/Auth/AuthSer… | Detect the failure, route into AuthenticationView(initialMode: .magicLink) pre-filled, and say "That link has expired — we'll sen… |
| `C6-04` | T1/major | S | Auth error and success banners are never announced and use raw system red/green | Features/Authentication/Views/AuthScreenView.swift:65-72; AuthenticationView.swift:147-170 and… | Post an announcement (or move AX focus) when the banner appears, and swap to PatinaColors.error / a darkened success token. |
| `GAP1-10` | T1/major | M | OAuth consent alert exposes the raw Supabase project ref to the user | 'Continue with Google' on the auth home; shots/GAP1/28-oauth-supabase-host.png | Configure a Supabase custom auth domain (e.g. auth.patina.cloud) and point the OAuth callback at it, so ASWebAuthenticationSessio… |
| `GAP1-11` | T1/major | S | Three different icon systems in three adjacent auth buttons, one a colour emoji | Auth home; shots/GAP1/16-decision-rug-overdue.png, 20-coldlink-decision.png, 29-home-ready.png… | SF Symbol 'envelope' tinted to the palette for email; the official Google G asset (or a neutral text-only treatment) for Google. |
| `GAP1B-09` ⇢L1-C | T1/major | S | The Sign In email and password fields have no accessibility label | Sign In sheet (Features/Authentication) — idb ui describe-all returns two TextField nodes (y=3… | Add .accessibilityLabel("Email") / "Password" (or a real label: on PatinaTextField). |
| `GAP3-15` | T1/major | S | The mid-flow sign-in wall's body is the app's first-launch marketing hero | AuthSheet presented from DesignRequestFlowView.swift:92-97 · shots/GAP3/26-auth-wall.png | Give AuthSheet a compact in-context variant: drop the wordmark hero and the "Welcome home / Start with a piece you love" pair whe… |
| `GAP3-17` | T1/major | S | Signing out lands the user in a modal Sign In sheet | SettingsView.SignOutButton flow · shots/GAP3/20-after-signout.png, 21-signed-out.png | Return to the Welcome screen (or the guest home) after a deliberate sign-out; keep the sign-in sheet for session-expiry. |
| `GAP4-09` | T1/major | M | The second style quiz has NO progress indicator, and its whispers misstate the progress | StyleConversationContainerView.swift:47-52 + ConversationHeaderView whisperTop; shots/GAP4/16,… | Reuse the onboarding quiz's footer component verbatim so both quizzes share one progress vocabulary; rewrite the three inaccurate… |
| `GAP4-31` | T1/major | L | The two quizzes produce two different names for the same person's taste, and the second silently overwrites t… | grep -rn "StyleProfileStore.shared" — the only writers are StyleConversationViewModel.swift:22… | One taste model, one name for it, one quiz — have the scan flow reuse the onboarding portrait instead of running a second questio… |
| `GAP8-07` | T1/major | S | The Studio header greets a production tester by their email local part; Apple's captured name is never read | Features/Profile/ViewModels/ProfileViewModel.swift:16-47; Services/Auth/ProfileService.swift:1… | Pass display_name in the OTP/sign-up metadata; in captureAppleName write to profiles (or re-fetch the profile) rather than only t… |
| `A-26` | T1/minor | S | An unlabelled 55 %-filled meter sits in the style reveal and is invisible to VoiceOver | Style reveal; shots/A/13-quiz-result-t1.png | Either label it ("Confidence: 55%") with an accessibilityValue, or remove it. |
| `C1-09` | T1/minor | S | 85 lines of the email flow — including the only 'Enter code instead' button — are unreachable | Features/Authentication/Views/AuthenticationView.swift:176-181 (branch), :222-300 (magicLinkSe… | Delete the branch, the view and the view-model method. |
| `C1-40` | T1/minor | S | The sign-up confirmation link opens the website; the resend's opens the app | Services/Auth/AuthService.swift:441-445 (no redirectTo) vs :514-518 (emailRedirectTo: patina:/… | Pass redirectTo on signUp too and make the panel copy match. |
| `C3-23` | T1/minor | S | presentationCornerRadius(24) is set on 2 of 18 sheets, under a comment claiming it is on all of them | ContentView.swift:124-131 (the two that set it, with `// PT-5-11: every detent sheet sets the… | One patinaSheet() modifier carrying detents, corner radius, grabber policy and background. |
| `C3-26` | T1/minor | S | The auth flow uses vivid system .green/.red where the palette ships designed success/error tokens | Features/Authentication/Views/AuthenticationView.swift:150,153,157 (success banner), :165,167… | Swap to PatinaColors.success / PatinaColors.error and their washes; replace .tint(.white) with a token. |
| `C5-07` | T1/minor | S | Email sign-in promises a 'code', delivers a 'magic link', and tells an iPhone user to 'Click' it | apps/mobile/Patina/Patina/Features/Authentication/Views/AuthenticationView.swift:136 vs :230-2… | One noun ('sign-in code', what verifyOTP consumes), one verb ('Tap'), and a sent-state that describes what GoTrue actually delive… |
| `C5-13` ⇢L1-E | T1/minor | S | The shipped camera permission string never mentions QR sign-in, though the QR scanner triggers it | Patina.xcodeproj/project.pbxproj:683 (Debug) / :731 (Release) INFOPLIST_KEY_NSCameraUsageDescr… | One voice: 'Patina uses your camera to scan a QR code when you sign in on the web, and to capture the shape of your rooms.' Drop… |
| `C5-18` | T1/minor | S | 'Welcome home' greets a first-ever install; the subtitle promises what the primary buttons don't do | apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:53,58 (and :112 f… | A first-visit line, and either promote 'Look around first' or change the subtitle to describe signing in. |
| `C5-19` | T1/minor | S | Onboarding page 2's title promises AR ('See it in your space') while its body describes a scan — and AR never… | apps/mobile/Patina/Patina/Features/Onboarding/Views/OnboardingFlowView.swift:35-38 | Retitle to what the page is about ('Capture the room' / 'Two ways to add a room'). |
| `C6-02` | T1/minor | M | Authentication — the first screen — has zero accessibility labels, traits or hidden marks | Features/Authentication/Views/{AuthenticationView.swift (713 lines), AuthScreenView.swift (185… | Label the welcome and form controls, tag the h3 headings .isHeader, hide the decorative leading icons, and group the magic-link/O… |
| `C6-32` | T1/minor | S | Onboarding hides real copy along with the illustration | Features/Onboarding/Views/OnboardingFlowView.swift:121-137 | Move the two captions out of the hidden illustration, or expose them via the page's accessibility label. |
| `C9-12` | T1/minor | S | Onboarding page 2's illustration is 280 pt tall inside a 190 pt band at accessibility sizes | Features/Onboarding/Views/OnboardingFlowView.swift:255-265 vs :129-135 | Scale the illustration to its band (.scaledToFit() inside the framed ZStack, or make the shapes relative to the passed viewportHe… |
| `GAP1-15` | T1/minor | S | 'Sign in with Apple' label does not scale with Dynamic Type | Sign In sheet at content_size accessibility-extra-large; shots/GAP1/33-axxl-state.png | Let the Apple button's label participate in Dynamic Type, or size the button from the same scaled metric as its neighbours. |
| `GAP3-25` | T1/minor | S | A guest has no in-app door to email/password sign-in | StudioHub guest card ("Open settings"), SettingsView ACCOUNT section, AccountView · shots/GAP3… | Add a "Sign in" row to Settings ACCOUNT (and to the guest AccountView) that presents AuthSheet; make DailyRoomView.SignInLine a b… |
| `GAP3-28` | T1/minor | S | A new account's display name is its raw email local-part | ProfileView header, from the auth profile · shots/GAP3/44-new-user-studio.png | Ask for a first name during onboarding, or fall back to "You" rather than the email local-part. |
| `GAP4-11` | T1/minor | S | The taxonomy and typography differ between the two quizzes that ask the same question | StyleConversationContainerView.swift:96-104 (headers) vs OnboardingFlowView quiz; shots/GAP4/0… | One option vocabulary and one range glyph across every style surface. |
| `GAP4-14` | T1/minor | S | The "choose up to three" cap is enforced silently; the fourth tap does nothing at all | MaterialConnectionView selection cap; shots/GAP4/21-conv-q3-fourth-tap.png | Dim the remaining tiles once the cap is reached, or show "3 of 3 chosen" beside "Choose up to three". |
| `GAP4-17` | T1/minor | S | The Reveal's designed secondary action is dead code; the CTA's own override never existed | RevealView.swift:14, 57, 69-75; QuietConversationFlowHost.swift:259-264 | Either render the secondary action or delete the parameter, the event and the misleading comment. |
| `GAP4-33` | T1/minor | M | "Retake Style Quiz" opens a THIRD style-question surface, with the onboarding taxonomy | ProfileView.swift:154-156 (navigate to .styleQuiz) → ContentView.swift:324 (StyleQuizView); sh… | Collapse the three surfaces into one quiz component with one taxonomy and one result store. |
| `P-03` | T1/minor | S | Terms and Privacy leave the app into full Safari and land on a cookie-consent banner | auth.welcome.termsLink; shots/P/02-terms-link.png, 03-terms-safari-cookiebanner.png | SFSafariViewController (or a native reader) plus an app-scoped legal route with no site chrome and no cookie banner. |
| `P-27` | T1/minor | S | "Sign in with Apple" is offered three times across the auth surface and outweighs each sheet's own primary ac… | shots/P/01-welcome-cold.png, 19-email-form.png, 31-password-sheet.png | Drop the Apple button from the sub-sheets, or demote it. |
| `C1-29` | T1/polish | S | Features/FirstLaunch's coordinator, state machine and metrics are dead code | Features/FirstLaunch/Coordinators/FirstLaunchCoordinator.swift; Models/FirstLaunchState.swift;… | Delete the three files; keep CameraPermissionView and OnboardingFunnel, which the host does use. |
| `GAP3-26` | T1/polish | S | The style quiz states progress three ways in one card | style-quiz progress card · shots/GAP3/37-after-skip.png, 38-quiz-done.png, 39-quiz-q3.png | Keep the bar plus one label; drop the other two. |

### W2 · L1-B Data, persistence, resilience — 52 findings

_count: 52 · blocker 0 · major 23 · minor 24 · polish 5_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-65` | T1/major | M | Nothing the guest just did appears on the home | Guest Daily Room home; shots/A/27-guest-home.png | Add a "Your portrait" module and a "Picked for you" rail to the home, seeded from the quiz. |
| `B-11` | T1/major | S | The first-launch tour re-runs on every auth transition, and its step count changes | Today after sign-in / account switch / sign-out — shots/B/14 ('Step 1 of 2'), 66 ('Step 1 of 3… | Persist tour completion per install (not per session/auth state) and make the step count deterministic. |
| `C1-13` | T1/major | L | A guest's saves, rooms and quiz never reach the account, by construction | Core/Models/SavedItem.swift:125-139; Features/Rooms/RoomSyncCoordinator.swift:54-66; Core/Pers… | On the claim's 'Keep them', enqueue: POST each local TableItemModel to saved_items, POST each remoteId==nil room, and re-POST the… |
| `C4-02` | T1/major | M | No app-wide connectivity awareness — only the scan lane knows the network is gone | apps/mobile/Patina/Patina/Services/Sync/ScanSyncQueue.swift:25,78 | One @Observable Connectivity over NWPathMonitor in Core/State; an offline variant of PatinaErrorState ("You're offline. We'll try… |
| `C7-04` | T1/major | L | ARSession didUpdate retains the ARFrame in an escaping Task and runs the whole capture pipeline on the main a… | apps/mobile/Patina/Patina/Features/Walk/Services/RoomCaptureService.swift:868-901 | Extract pose/timestamp synchronously inside the delegate, hand Sendable values to a dedicated actor, never let the ARFrame escape. |
| `C7-06` | T1/major | M | Launch housekeeping does recursive disk enumeration and multi-hundred-MB directory deletes on the main actor | PatinaApp.swift:112-123; Core/Persistence/ScanDiskBudget.swift:19,110-183; Core/Persistence/Sc… | Make the file passes nonisolated/actor-isolated, return plain values, and touch the ModelContext on the main actor only for mutat… |
| `C7-08` | T1/major | M | Every PostgREST client silently downgrades to anon when the token is missing; RLS then returns [] and the scr… | RoomsAPIClient.swift:211-220 and 204-209; NotificationsAPIClient.swift:43-54; DecisionsAPIClie… | Make the token non-optional for owner-scoped reads: throw .notAuthenticated when absent so the UI can say 'we couldn't reach your… |
| `C7-10` | T1/major | S | Non-LiDAR iPhone: 'Scan with camera' is offered unconditionally and silently becomes a typing form; the unsup… | Features/Rooms/Views/NewRoomSheet.swift:28-37; Features/RoomScan/Views/QuietConversationFlowHo… | Gate the tile on RoomCaptureService.isSupported, or relabel it and explain the device limit when false. |
| `C7-14` | T1/major | S | Launch resume fans out up to 10 unstructured upload tasks (20 concurrent artifact uploads); the in-flight gua… | apps/mobile/Patina/Patina/Services/Sync/RoomScanSyncService+AdvancedBundle.swift:334-340 (the… | Add the Set<UUID> in-flight guard the comment promises and serialise the resume loop. |
| `C7-28` | T1/major | M | The persistent scan queue gives up after three tries, with no backoff and no way for the tester to know or re… | Services/Sync/SyncQueueItem.swift:103-105; Services/Sync/RoomScanSyncService.swift:362-378 | Exponential backoff, a higher cap, and a surfaced 'this scan hasn't been sent' state with a retry. |
| `C9-06` | T1/major | M | Scan and AR are gated to LiDAR-only iPhones; AR is gated more strictly than ARKit needs | Features/RoomScan/Views/QuietConversationFlowHost.swift:151-158; Features/Walk/Services/RoomCa… | Relax supportsAR to ARWorldTrackingConfiguration.isSupported and keep .mesh as the optional upgrade the manager already treats it… |
| `GAP4-01` | T1/major | S | "Scan it" silently becomes a typing form, with no word of explanation | QuietConversationFlowHost.swift:145-152 (bootstrap: RoomCaptureService.isSupported → .fallback… | Tell the truth before the fallback: relabel/disable "Scan it" when isSupported is false, or open the fallback with an honest open… |
| `GAP4-26` | T1/major | M | The second room silently skips the whole "Style Discovery" the button just promised | QuietConversationFlowHost.swift:255-262 (ProfileSkipBridge); shots/GAP4/34-fallback-pass2.png,… | Label the button by what will happen (currentProfile == nil ? "Continue to Style Discovery" : "See your floor plan") and surface… |
| `GAP6-11` | T1/major | M | One piece carries three different match scores on three screens | shots/GAP6/26-browse-pieces.png (73%), 31-product-detail.png (50%), 50-browse-axxl.png (76%) | One resolver for the score, computed once per (piece, room-context) and passed down. |
| `GAP6-15` | T1/major | S | The product bar's 'Saved ✓' button silently un-saves on the next tap | shots/GAP6/31-product-detail.png, 32-detail-saved-tapped.png · Purchase/PurchaseActionBar.swif… | Label the act, not the state ('Add to room' / 'Remove from room'), and confirm or offer undo on removal. |
| `GAP6-21` | T1/major | M | The same piece shows a different maker on the room screen than on Browse and its detail | shots/GAP6/37-room-with-item.png, 38-item-action-menu.png vs 26-browse-pieces.png, 31-product-… | Carry the maker from the product record into SavedItem instead of re-deriving it. |
| `GAP6-28` | T1/major | S | Moving a piece to another room is silent and irreversible | shots/GAP6/39-move-to-another-room.png, 40-after-move.png | Confirmation line naming the destination with an Undo, or animate the row out and show the destination. |
| `GAP6-29` | T1/major | M | The Saved list keeps the old room after a piece is moved | shots/GAP6/41-saved-list.png vs 40-after-move.png | Update the saved_items room mirror inside the move, or derive the Saved footer's room from the item's current room. |
| `GAP8-02` ⇢L0.2 | T1/major | M | The Record — Today's headline block — never mounts for any first-round tester | Features/Home/Models/HouseRecord.swift:271-284,535-548,186; Features/Home/Models/TodayExperien… | Design what the Record says at discovering with an empty house — today it says nothing at all, which is the one option the compos… |
| `GAP8-03` ⇢L0.2 | T1/major | M | NEW THIS WEEK can never render on production — published_at is not on the wire | Features/Home/Views/NewThisWeekRail.swift:24-37; Core/Models/ProductModel.swift:41,68,108; sup… | Apply 00533–00540 to Strata; they are the iOS server contract. Until then no catalogue content can revive the rail. |
| `GAP8-04` ⇢L0.2 | T1/major | M | Even with a catalogue, every product surface stays empty until 00533 or vendor rows land | Core/Network/ProductAPIClient.swift:75-92; Core/Models/ProductModel.swift:222-233; 00246:278 | Ship 00533 so brand reaches the client, or make vendor attachment a publish gate; and move the withheld-count log out of #if DEBU… |
| `R-04` | T1/major | M | After the backend returns, Today settles into a self-contradictory state and stays there | Today; shots/R/19b-unpause-t45-notouch.png + describe_screen | Do not stamp the visit / rebuild the record from a partially failed refresh; treat a refresh with any failed leg as aborted and k… |
| `R-09` | T1/major | M | Four failure surfaces disagree on how long to wait, what to draw and what to say | Today / Browse / Studio / Proposal; §1l of research/R.md | One shared network policy: a single timeout (≈10-12 s) applied to every client including the Supabase paths, and one PatinaErrorS… |
| `A-02` | T1/minor | S | The splash wordmark never reaches full opacity before the splash is dismissed | SplashView.swift:44 vs AppCoordinator.swift:81; shots/A/01-cold-t2.png vs 01-cold-t12.png | Shorten the wordmark fade to ~0.8 s (or raise the gate) so the mark is fully drawn before the cross-fade begins. |
| `A1-07` | T1/minor | S | A whole navigation-intent layer has no call sites (handleIntent / IntentDetector / startRoomScanFlow) | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:578, :663, :679, :691; Feature… | Delete it, or wire the Companion chat rail it was written for. Worth doing early: it makes route-door greps lie — .yourSpaces and… |
| `A2-17` ⇢L0.6 | T1/minor | S | AppTrackingTransparency is linked but never requested; the opt-out branch is unreachable | Patina/Services/Analytics/PostHogService.swift:11, 70-76 | Delete the import and the block. Declare NSPrivacyTracking=false in the new privacy manifest (A2-02) and answer the ASC nutrition… |
| `A2-25` ⇢L0.6 | T1/minor | S | Supabase SDK diagnostics are Debug-only, so the most likely TestFlight failure is invisible in Release | Patina/Core/Network/SupabaseClient.swift:48-52 | Keep the logger in Release but route it through PatinaLog at .error only (no session or request bodies), or capture failures as P… |
| `A4-10` | T1/minor | S | A4-10: "Start fresh" leaves the guest's taste portrait behind | apps/mobile/Patina/Patina/Core/Persistence/LocalStoreReset.swift:83-105 (vs :52) | Call StyleProfileStore.shared.reset() from wipeGuestWork as well. |
| `C-51` | T1/minor | S | Two empty states stacked on the room detail | shots/C/10-dark-room.png | Suppress the stat card when the count is zero, and align the "saved" / "chosen" vocabulary. |
| `C1-23` | T1/minor | S | Session expiry ejects to the welcome screen with no explanation | supabase-swift Sources/Auth/Internal/APIClient.swift:117-123 (sessionCleanupErrorCodes → remov… | Set a one-line notice ('You were signed out — sign in to pick up where you left off') when the .auth arrival carries a pendingRet… |
| `C1-27` | T1/minor | S | The quiz RPC's HTTP status is ignored, so a rejection is parsed as a profile | Core/Network/ProductAPIClient.swift:214-215 vs fetchRecommendations at :60-66 | The same status guard fetchRecommendations already has. |
| `C4-11` | T1/minor | S | Scan review save banner interpolates the thrown error into Patina copy | apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanReviewView.swift:702 | Drop the interpolation; log the raw error. |
| `C4-18` | T1/minor | S | Dead state code: three loading/error states are written and never rendered (one of them costs a network round… | apps/mobile/Patina/Patina/Features/Home/ViewModels/DailyRoomViewModel.swift:87,92,277-315; Fea… | Either wire feedError to a retry row on Today or drop the feed fetch; delete the unreachable ProgressView; surface or delete the… |
| `C7-19` | T1/minor | S | The .launching phase has no watchdog — if the auth stream never emits, the splash plays forever | AppCoordinator.swift:254-266 (derivePhase), :146-165 (one-shot deadline tick); AuthService.swi… | After N seconds without readiness, fall through to .auth with a 'couldn't reach your account' affordance. |
| `C7-25` | T1/minor | S | Force-unwrapped string-interpolated URL with an interpolated piece id, plus a request built and never sent | apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:125-135 | Delete the dead request; build the second with URLComponents/URLQueryItem as fetchProducts(ids:) already does on the next functio… |
| `C7-34` | T1/minor | S | The scan flow identifies its session by identifierForVendor or the literal string 'anonymous', not the signed… | Features/RoomScan/Views/QuietConversationFlowHost.swift:161-166; consumed at Features/RoomScan… | Read AuthService.shared.currentUserId here. |
| `GAP1B-19` | T1/minor | S | Raw PostgREST error text is logged from SettingsService on every launch | SettingsService (Services/Settings) — research/GAP1-crash-02.log | Use .maybeSingle() and treat the empty row as the expected first-run state. |
| `GAP2-14` | T1/minor | M | "ACROSS YOUR PROJECTS" shows one of the tester's three projects with no line for the other two | Budget — shots/GAP2/48-budget.png vs 42-projects-list.png; BudgetViewModel.swift:63-66 | Retitle the header ("Projects with billing") or render a "Nothing billed yet" row for every project. |
| `GAP3-29` | T1/minor | S | Studio group header counts disagree with their own empty copy | StudioHub group rows · shots/GAP3/45-new-user-studio-scrolled.png | Derive the group count from the same source as the body copy, or hide the count when the group is empty. |
| `GAP4-24` | T1/minor | S | The new room is named "Living Room" with no disambiguation from the "Living Room" already in the house | FallbackRoomDraft naming via QuietConversationFlowHost.swift:395-420 (persistFallbackRoom); sh… | Offer a name field (pre-filled with the type), or auto-suffix on collision. |
| `GAP4-32` | T1/minor | S | After the taste reset the profile still shows a portrait-shaped badge, "✦ Style Explorer" | ProfileView / StudioHubView taste pill; shots/GAP4/54-after-exit-quiz.png vs 48-studio.png | Make the empty state invite the quiz ("Take the style quiz →") instead of inventing a name. |
| `GAP5-17` | T1/minor | M | Today shows three rooms; Your Spaces, the profile stat and the Companion all say two | shots/GAP5/17-today-clean.png vs 20-your-spaces.png vs 21-profile.png vs 19b-companion-crop.png | Decide whether Today's YOUR HOUSE includes designer-project rooms that Your Spaces excludes and label the difference, else use on… |
| `GAP6-24` | T1/minor | S | The item menu offers 'View in AR' on every piece; the detail screen gates the same act | shots/GAP6/38-item-action-menu.png · Features/Rooms/Views/ItemActionMenu.swift:30 · Features/P… | Gate the row on the same predicate, and say why when AR is unavailable rather than dead-ending. |
| `GAP6-26` | T1/minor | S | Move/Copy re-asks the question the previous sheet already answered | shots/GAP6/38-item-action-menu.png, 39-move-to-another-room.png | Carry the chosen verb through and title the sheet 'Move to…' / 'Copy to…', or collapse the two menu rows into one that opens this… |
| `R-19` | T1/minor | S | Two E-level SettingsService errors are logged on every launch against a healthy backend | App log 2026-09-01 17:21:38.901 and .907 | Use `.maybeSingle()` (or treat zero rows as a normal empty result) and log at debug, not error, when the row legitimately does no… |
| `R-20` | T1/minor | S | Today's error line is laid out as two loose links rather than a message with an action | Today foot; shots/R/17b-cold-t22.png, 18-cold-today-bottom.png | Reuse PatinaErrorState (or a compact inline variant of it) so all four error surfaces share one composition. |
| `R-22` | T1/minor | S | No way to cancel a long wait, and each filter chip restarts one | Browse; shots/R/07a-browse-t1.png, 08a-retry-t20-spinner.png | Disable or visually quiet the chips while a fetch is in flight, cancel the in-flight task when a new filter is chosen, and shorte… |
| `A1-09` | T1/polish | S | AppCoordinator.hasExistingRooms() is a self-described placeholder | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:282-286 | Delete it, or point it at RoomStore. |
| `C1-33` | T1/polish | S | The phase change is animated twice, with two different curves | ContentView.swift:81; App/Coordinators/AppCoordinator.swift:227-229 | Keep the coordinator's withAnimation and drop the view modifier (or the reverse), once. |
| `GAP2-07` | T1/polish | M | No tracking number, carrier or link on a Shipped order, though the row promises "Where your pieces are" | shots/GAP2/38-order-detail.png; OrderDetailAction.track(label:url:) exists in OrderDetailView.… | When no tracking URL exists, say so in one line rather than leaving the promise unanswered. |
| `GAP2-17` | T1/polish | S | One slow download disables every row in the documents list | DocumentListView.swift:112-119 | Disable only the downloading row and give it a visible "Preparing…" label. |
| `GAP4-27` | T1/polish | S | The fallback form resets to the developer defaults on every visit, making duplicate rooms the default outcome | ScanFallbackEntryView.swift:27-31 (@State seeds); shots/GAP4/34-fallback-pass2.png | Keep the unit reset; drop the fabricated dimensions and the pre-selected room type. |

### W2 · L1-C Layout, Companion, Dynamic Type — 125 findings

_count: 125 · blocker 0 · major 57 · minor 59 · polish 9_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-64` | T0/major | S | The home's only conversion CTA is truncated by the Companion orb at rest | Guest Daily Room home, default scroll position; shots/A/27-guest-home.png vs 28 | Bottom content inset (see A-88); move the sign-in prompt above the editorial card. |
| `A-88` | T0/major | M | The floating Companion orb occludes content on every screen — no bottom content inset anywhere | 8 screens; shots/A/14,18,27,44,46,47,49,50,71,72 | Add a safeAreaInset(edge: .bottom) sized to the orb + caption on every scroll container that hosts it, and drop the caption or mo… |
| `A1-03` | T0/major | S | 'Browse pieces' has no Today door on either root | apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:273-297 (HomeComposition.… | Add a 'Browse pieces' tail to NewThisWeekRail, or restore a marketplace-links row to HomeComposition. |
| `A1-04` | T0/major | S | A guest can save pieces but has no door to Saved except the Companion orb | apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:293; apps/mobile/Patina/P… | Drop isSignedIn from the savedSummary gate, or draw SavedDoorRow unconditionally on Browse. |
| `A4-07` | T0/major | M | U24/U44: the flag-off Today root has no door to Browse pieces or to design help | apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:196-211,273-297; Features… | Either target `house-first` for testers (A4-12), or restore a Browse/Saved affordance and a 'Get design help' row to the flag-off… |
| `C-03` ⇢L1-D | T0/major | M | The fixed Companion orb and its caption overprint live content on every scrollable screen | Messages 26-dark-messages.png; Studio 16/17; Browse 11; Today 30-xxxl; Room 10 | Add a bottom safe-area inset equal to the orb+caption height to every scroll container, or move the caption inside the orb. Note… |
| `C-28` | T0/major | S | On the room detail the orb covers the inner bottom corner of both "Edit dimensions" and "Edit budget" | shots/C/10-dark-room.png | Same bottom-inset fix as C-03. |
| `B-01` | T1/major | M | Companion panel overflows its container and runs through the tab bar at accessibility text sizes | Companion panel, content_size accessibility-extra-large — shots/B/72-axxl-companion.png | Put the panel's rows in a ScrollView, cap the panel height to the safe area minus the tab bar, and let it grow with a max-height… |
| `B-26` | T1/major | S | Four help glyphs crowd the Spaces header, three sharing the accessibility identifier 'questionmark.circle' | Spaces — shots/B/18-guest-spaces.png, 38-signedin-spaces.png | Keep one help entry per screen; give the remaining buttons real identifiers and specific labels. |
| `B-32` | T1/major | S | The tour popover is one AXHeading — Skip and Next are not focusable by VoiceOver | Today first-launch tour — describe_screen, research/B.md §Step 5 | Remove the .accessibilityElement(children:.combine) so the buttons stay separate elements, and post a screen-changed notification… |
| `C2-03` | T1/major | M | Settings "Notifications" toggle is inert on every side (defaults ON, never asks, never honoured) | apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:110-119; Patina/Services/… | Drive the row from notificationSettings().authorizationStatus: .notDetermined -> present the primer; .denied -> one sentence + op… |
| `C3-10` | T1/major | M | The Help panel and first-launch tour are un-branded stock SwiftUI — the only system nav bar and system fonts… | Features/Help/Views/HelpPanelSheet.swift:103-120,161-167,177-181,188-196,248-266; Features/Hel… | Re-skin both with Patina tokens and typography; drop or brand the nav bar; replace .borderedProminent with PatinaButton. |
| `C3-16` | T1/major | L | Status bar hidden app-wide, nav bar hidden everywhere, tab bar hand-rolled opaque — the app opts out of every… | Patina.xcodeproj/project.pbxproj:691,739 (INFOPLIST_KEY_UIStatusBarHidden = YES, Debug+Release… | Drop INFOPLIST_KEY_UIStatusBarHidden and DailyStoryDetailView.swift:51, keeping .statusBar(hidden:) only on the immersive scan/AR… |
| `C4-05` | T1/major | M | Project detail: six of seven reads are try?, so a half-failed load renders as an empty project | apps/mobile/Patina/Patina/Features/Projects/ViewModels/ProjectsViewModel.swift:53-77 | Track which sub-reads returned nil; draw a per-section "couldn't load" row with retry, or a whole-screen partial-load notice on t… |
| `C4-06` | T1/major | S | Decision detail: a failed options fetch shows a question with no answers, no error and no retry | apps/mobile/Patina/Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift:162-180 + Fea… | Distinguish "no options came back" from "options came back blank"; use PatinaErrorState + retry for the first. |
| `C4-17` | T1/major | L | No skeletons anywhere — every loading state is a spinner, and Today has no loading affordance at all | apps/mobile/Patina/Patina/Design/Components/PatinaLoadingState.swift:14-24; Features/Home/View… | A PatinaSkeleton built on redacted(reason: .placeholder), and content-shaped placeholders for the Record, house rail and story on… |
| `C4-19` | T1/major | S | Design-request status shows the "no requests yet" landing while loading, and keeps showing it if the load fai… | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestStatusView.swift:51-66; fetch a… | Add a loading branch gated on service.hasLoaded, and an error+retry branch; Core/State/DesignHelpDestination.swift:36-46 already… |
| `C6-17` | T1/major | M | The purchase bar cannot survive Dynamic Type | Features/Purchase/PurchaseActionBar.swift:39-89 | Wrap the pair in ViewThatFits with a stacked VStack fallback and drop minimumScaleFactor. |
| `C6-23` | T1/major | M | Undersized tap targets, including the app-wide back control | Design/Animations/PatinaTransitions.swift:34-41 (BackChevronButton is 36×36, and it is the bac… | Apply the existing 36-visual/44-thumb pattern from QRScannerView.swift:67-73 (or accessibleHitTarget) to each site, starting with… |
| `C6-27` | T1/major | S | ProductCard's tile variant announces only a price | Features/Shared/Views/ProductCard.swift:150-167 (tile) and :111-146 (list) | Give both variants an explicit combined label of maker + name + price. |
| `C6-28` | T1/major | S | RoomGalleryCard — the Your Spaces card — has no accessibility treatment | Features/Rooms/Components/RoomGalleryCard.swift:18-27 (the Button) and :90-141 (stats) | Combine the card into one element labelled "<room>, <n> items, budget <x>, match <y>%". |
| `C6-29` | T1/major | S | AddToRoomSheet has no accessibility treatment at all | Features/Home/Views/AddToRoomSheet.swift (103 lines, 0 accessibility modifiers) | Label and combine each room row, add .isSelected, tag the heading, and use presentationDragIndicator. |
| `C6-35` | T1/major | S | Companion action rows read a stray chevron and are not combined | Features/Companion/Views/CompanionOverlay.swift:796-834 | Combine the row and label it "<label>. <hint>"; hide the icon and the chevron. |
| `C7-07` | T1/major | S | The scan-recovery disk pass runs twice on every cold launch (app root and Today), with no coalescing | PatinaApp.swift:123 and Features/Home/Views/DailyRoomView.swift:130-134 | One owner (the root); publish the count on ScanEventChannel, which already carries pendingRecoveryCandidateCount, and let Today r… |
| `C9-10` | T1/major | S | LocalStoreClaimSheet is pinned to a single .height(320) detent its content overflows | Features/Collections/Views/LocalStoreClaimSheet.swift:59 | .presentationDetents([.medium, .large]) (or .height(320) plus .large) and wrap the column in a ScrollView. |
| `GAP1-01` ⇢L1-D | T1/major | M | Companion orb overprints live content on both screens the 'N things need your eye' badge leads to | Today home (shots/GAP1/01-today-home.png, 05-relaunch-home.png) and Studio hub (02-companion-o… | Reserve the orb's footprint with a bottom safeAreaInset / content inset (>= orb height + caption + 16) on DailyRoomView and the S… |
| `GAP1-02` | T1/major | S | Consent sheet never shows the price the client is approving | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:368-448 (DecisionC… | Pass the resolved price and the decision title into DecisionConsentSheet and print them under the option name; keep the existing… |
| `GAP1-03` | T1/major | S | Consent and defer sheets pinned to .medium detent, ~40% dead space below the last control | DecisionDetailView.swift:88 (.presentationDetents([.medium, .large])) and :70 for the defer sh… | Use .presentationDetents([.height(<measured>), .large]) sized to the two states (toggle off / signature on), or drive the detent… |
| `GAP1B-05` | T1/major | S | The "Add my signature" toggle did not respond to three synthetic taps | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:399-408 (Toggle(is… | If confirmed by a human tap: give the row .contentShape(Rectangle()) + onTapGesture, or replace the compound label with a plain T… |
| `GAP2-02` | T1/major | S | Every Studio hub row is an AXGenericElement, not a button | Studio hub describe_screen; StudioQueueBuilder.swift row cell | .accessibilityAddTraits(.isButton) on the StudioHub row cell (or make it a Button). |
| `GAP2-25` | T1/major | S | "Remind me the day before it's due" is a 17 pt-tall tap target | Invoice detail — shots/GAP2/51-invoice-detail.png; AX frame {y:387.33, x:24, width:228.33, hei… | .frame(minHeight: 44) + .contentShape(Rectangle()), as OrderDetailView.rowButton already does. |
| `GAP3-01` | T1/major | M | "No scans on this phone yet" contradicts the app's own YOUR ROOMS list one screen earlier | apps/mobile/Patina/Patina/Features/DesignServices/ScanPickerView.swift:116-131 · shots/GAP3/07… | Query the server rooms too: when rooms exist but no local bundle does, say so — "Your rooms are already with Patina; nothing extr… |
| `GAP3-02` | T1/major | S | The scan-picker empty state instructs an action the screen does not offer | apps/mobile/Patina/Patina/Features/DesignServices/ScanPickerView.swift:124 · shots/GAP3/08-des… | Add a secondary "Scan a room" button that pushes the scan flow, or drop the first clause. |
| `GAP3-04` | T1/major | S | Four-step request flow has no step affordance of any kind | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:186 · shots/GAP3… | Add a light "Step n of 3" line (or a hairline progress rule) under the nav title for the three composing steps; leave sending/suc… |
| `GAP3-09` | T1/major | M | No way back from the Review step — the only exit discards the whole request | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:74-79 · shots/GA… | Add a leading Back button (or wrap the steps in real NavigationStack pushes) so `step` can walk backwards; keep Close as the dest… |
| `GAP3-14` | T1/major | L | A sent design request can never be withdrawn or edited | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestStatusView.swift:13-14 (comment… | Ship a client-side withdraw for non-terminal, unclaimed leads (RLS policy + a "Withdraw request" destructive row under the timeli… |
| `GAP3-20` | T1/major | M | The Companion bubble and floating back chevron are drawn over content with no scrim or inset | companion.bubble overlay + patinaScreen back chevron · shots/GAP3/01, 05, 06, 07, 22, 23, 43,… | Add a bottom content inset equal to the bubble's height on every scroll container it floats over, and give the chevron pill an op… |
| `GAP3-21` | T1/major | S | "Matched Designer" placeholder card is shown to a tester with no designer (A1-14 CONFIRMED on screen) | apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift:55-77 · shots… | Delete the card (hero + "Start a request" stand alone), or replace it with an honest promise card: no avatar shape, title "You'll… |
| `GAP3-24` | T1/major | S | The first-run tour popover uses iOS system blue — the only blue in the app | TipKit-style tour popover on DailyRoomView · shots/GAP3/29-guest-relaunch.png, 43-new-user-hom… | Set the tour's tint/button styling to PatinaColors.clay (or restyle with PatinaButton) so the first modal a tester sees is not st… |
| `GAP4-04` | T1/major | S | The two dimension fields have no accessibility label at all | ScanFallbackEntryView.swift:181 (TextField("", text: text)); AX tree on shots/GAP4/13-fallback… | Add .accessibilityLabel("\(title) in \(unit.label)") to each field, or give the TextField its real title and hide it visually. |
| `GAP4-18` ⇢L1-A | T1/major | M | C1-32 CONFIRMED: at accessibility text sizes the aesthetic name renders as unreadable overlapping glyphs | RevealView.swift:79-92 (aestheticName HStack); shots/GAP4/27-reveal-axXL.png, 62-pause-f24.png | Render the name as ONE Text with .minimumScaleFactor and multiline wrapping; drive the letter-by-letter reveal with a per-charact… |
| `GAP4-19` | T1/major | S | VoiceOver reads the aesthetic name thirteen times on the Reveal | RevealView.swift:80-89 (accessibilityLabel applied to the HStack, not merged); AX tree on shot… | Add .accessibilityElement(children: .ignore) — or collapse to one Text, which also fixes GAP4-18. |
| `GAP4-20` | T1/major | S | At accessibility sizes both floor-plan buttons truncate: "Resc…" and "This Loo…" | ScanFloorPlanPreviewView.swift:48-70 (both buttons pinned to .frame(height: 52)); shots/GAP4/2… | Let the buttons grow vertically (.frame(minHeight: 52)), stack them at accessibility sizes, and give the stat labels .minimumScal… |
| `GAP4-23` | T1/major | S | The companion FAB sits on top of the room page's controls (and Today's, and Browse's) | CompanionOverlay FAB resting position; shots/GAP4/32-landing.png, 10-home-scrolled.png, 07-tod… | Give scroll content a bottom inset equal to the FAB height + margin, and keep the FAB clear of any control row. |
| `GAP4-28` | T1/major | M | At accessibility text sizes the five conversation questions overflow the screen — labels run off the right ed… | StyleConversationContainerView.swift:45-75 (fixed VStack, no ScrollView); shots/GAP4/57-conv-q… | Wrap the container body in a ScrollView; give pills lineLimit(2) + fixedSize(horizontal:false, vertical:true) inside a width-cons… |
| `GAP4-29` | T1/major | M | The fallback form degrades at accessibility sizes: mid-word break, ragged tile heights, truncated CTA, non-sc… | ScanFallbackEntryView.swift:88-95 (emoji .system(size:20)), :169 (.frame(width: 104)), :240-26… | Scale the icons with the text, let the grid rows share a height, allow the CTA to grow or shrink its label, and give the tile tit… |
| `GAP6-08` | T1/major | S | Three different help '?' glyphs, at three sizes, crowd the 'Your Spaces' title row | shots/GAP6/24-your-spaces.png, 46-your-spaces-axxl.png | One help affordance per screen at one size, in the standard position. |
| `GAP6-13` | T1/major | S | AddToRoomSheet and ItemActionMenu do not paint their own sheets — translucent bands show the screen behind | shots/GAP6/28-add-to-room-sheet.png, 33-detail-add-to-room-picker.png, 38-item-action-menu.png… | Move the background onto a '.frame(maxWidth:.infinity, maxHeight:.infinity)' container, or use '.presentationBackground'. |
| `GAP6-19` | T1/major | M | The Companion orb and its caption print over live content on every screen | shots/GAP6/00-preflight-before-home.png, 04-studio-hub-settled.png, 24-your-spaces.png, 26-bro… | Reserve a safe-area inset for the orb on every scrolling root and give the caption an opaque plate. |
| `GAP6-20` | T1/major | S | 'OVERDUE' breaks mid-word on the Today home at DEFAULT Dynamic Type | shots/GAP6/36-today-overdue-wrap.png (full-res crop) | Give the meta column a fixed minimum width or allow the row title to compress; never let the status word wrap. |
| `GAP6-33` | T1/major | S | The Today greeting breaks mid-word across five lines at accessibility sizes | shots/GAP6/44-today-axxl.png | Give the greeting a minimumScaleFactor and allow the header to reflow to a column at accessibility sizes; cap the greeting's Dyna… |
| `GAP6-34` | T1/major | S | At accessibility sizes the room screen's three controls all truncate | shots/GAP6/47-room-axxl.png | Let the acts row stack vertically past a size threshold; wrap the CTA to two lines rather than truncating. |
| `GAP6-35` | T1/major | S | ItemActionMenu clips its fixed .medium detent at large text and nothing scrolls — the destructive row is cut… | shots/GAP6/53-item-action-menu-axxl.png, 54-item-menu-axxl-after-swipe-up.png · Features/Rooms… | '.presentationDetents([.medium, .large])' plus a ScrollView around the column; let the header wrap instead of clip. |
| `GAP6-37` | T1/major | S | The match pill collides with the heart and ⋯ controls on every Browse card at large text | shots/GAP6/50-browse-axxl.png, 52-add-to-room-axxl.png | Put the pill and the controls in one HStack with a Spacer instead of two independent overlay alignments. |
| `GAP8-01` ⇢L0.3 | T1/major | S | Today's only content block is a 57-day-old story, and it prints the date | supabase/migrations/00143_editorial_stories.sql:138-175; Features/Home/Views/DailyStoryCard.sw… | Put real dated rows in editorial_stories on Strata (or refresh published_at on a schedule); add the year to the chip when the dat… |
| `GAP8-08` ⇢L0.3 | T1/major | L | Signed-in Today on production is the guest home minus one line | Features/Home/Models/TodayExperience.swift:273-297; Features/Home/Views/DailyRoomView.swift:24… | Design the discovering + empty-house + empty-catalogue home as a first-class state rather than the residue of four if statements;… |
| `GAP8-09` ⇢L0.2 | T1/major | M | Studio on production is five empty boxes, and the one non-zero number on it is wrong | Features/Profile/Views/StudioHubView.swift:32,225-246; Features/Profile/ViewModels/StudioQueue… | Collapse the empty sections into one honest invitation until the client has a designer; make the Conversation badge count threads… |
| `A-38` | T1/minor | S | The "why this piece" line truncates mid-word and repeats verbatim across cards | Browse pieces; shots/A/14-home-t1.png | Shorten the template to two lines, make it card-specific, and reserve the same height on every card. |
| `A-92` ⇢L1-E | T1/minor | S | "Remind me the day before it's due" has no visible control | Invoice detail; shots/A/49-invoice-detail.png | Make it a labelled Toggle with the explanatory line as its footer. |
| `A1-02` | T1/minor | S | On the flags-off root (the TestFlight default) Your Spaces has no home door | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:247-370; doors are Companion… | Give YourHouseRail a 'See all spaces' tail on the flags-off root (or ship round 1 with house-first on). Same one row also un-buri… |
| `A1-10` | T1/minor | M | The full navigation-destination dispatcher is duplicated verbatim across the two roots | apps/mobile/Patina/Patina/ContentView.swift:228-425 vs Features/Navigation/HouseFirstRoot.swif… | For the fix program: every navigation-shaped change must be applied twice until the flag-off root is retired, and only the flag-o… |
| `B-47` | T1/minor | S | An empty section heading leaves a ~140 px void under 'YOUR HOUSE' on the signed-in Today | Today signed in — shots/B/35-signedin-today-top.png, 36 | Render a heading for the populated state, or collapse the slot when the string is empty. |
| `B-52` | T1/minor | S | Re-tapping the active tab does not scroll to top | Today — shots/B/36-signedin-today-mid.png vs 37-today-retap.png | Add a ScrollViewReader keyed off a tab-reselection signal. |
| `C-34` | T1/minor | S | Flags-ON Studio tab: no bottom content inset, so the Invoice row is clipped mid-line by the tab bar | shots/C/53-flagson-studio.png | Add .safeAreaInset for the tab bar and remove the redundant title pill. |
| `C-45` ⇢L1-E | T1/minor | S | The invoice "Pay" button is below the fold with no pinned bar, unlike the product page which pins one | shots/C/22-dark-invoice-detail.png vs 23-dark-invoice-bottom.png; product 12/13 | Pin the pay action; keep one reassurance line. |
| `C-46` | T1/minor | S | On the signature screen the only action is "Sign proposal" — no decline, no way to ask a question | shots/C/20-dark-proposal-scrolled.png | Add "Ask a question" / "Request changes" beside Sign, and hide empty sections. |
| `C1-32` ⇢L1-A | T1/minor | M | The Reveal spells the aesthetic name one letter per view, at a fixed 42pt, in a stack that cannot wrap | Features/StyleReveal/Views/RevealView.swift:80-93,97-119 | One Text with a per-character opacity mask, relativeTo: .largeTitle, and .accessibilityElement(children: .ignore). |
| `C3-27` | T1/minor | M | Scheme-adaptive tokens painted on statically-dark surfaces resolve to their LIGHT values — 3.8:1 on the Compa… | Features/Companion/Views/CompanionOverlay.swift:819,825; QRScannerView.swift (15 dynamic-token… | On statically-dark surfaces use the static light-palette tokens (offWhite, pearl, clay) rather than the adaptive Text.* ones. |
| `C4-13` | T1/minor | M | A refresh that fails while rows are on screen is invisible on all nine list screens | apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:60 (and ProposalListVi… | An inline "Couldn't refresh — showing what we had" chip above the rows when error != nil && !rows.isEmpty. |
| `C4-14` | T1/minor | S | Settings toggles are fire-and-forget: a failed write looks saved, and the reads default to ON | apps/mobile/Patina/Patina/Services/Settings/SettingsService.swift:122-127 (setter), :139-156 a… | Await the write, revert the toggle and show an inline failure on error; render toggles disabled/placeholder until isLoaded. |
| `C5-17` | T1/minor | S | 'You can follow its progress from your home screen' points at iOS, not at Patina | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift:260 (appen… | 'You can follow it on Today.' — and give Today a printed name so the sentence has a referent. |
| `C5-22` | T1/minor | S | The Companion has three self-introductions and one of them is dead code shipping in Release | CompanionIntroBubble.swift:66 ("I'm your Companion."); Services/Companion/CompanionService.swi… | One introduction, one casing; delete CompanionVoice.swift. |
| `C6-08` | T1/minor | S | First-launch tour's Skip / Next / Done are collapsed into rotor custom actions | Features/Help/FirstLaunchTour.swift:874 | Drop children: .combine, or use children: .contain so both buttons stay focusable. |
| `C6-34` | T1/minor | S | Canonical loading and error states are unlabelled and unannounced | Design/Components/PatinaErrorState.swift:19-37 and Design/Components/PatinaLoadingState.swift:… | Hide the icon, combine the block, and announce the message on appear. |
| `C6-36` | T1/minor | S | The Companion first-launch coach mark buries its "Got it" | Features/Companion/Views/CompanionOverlay.swift:705-733 | Drop children: .combine so "Got it" stays focusable. |
| `C6-45` | T1/minor | S | HomeStoryRetryRow puts the 44pt minimum on the row, not the button | Features/Home/Views/HomeStoryRetryRow.swift:30-38 | Move the minHeight inside the Button label, before contentShape. |
| `C9-03` | T1/minor | S | Today's scroll ends in 240 pt of dead canvas (root reservation + a second local 120) | Features/Home/Views/DailyRoomView.swift:371 + ContentView.swift:185 | Delete the local Spacer().frame(height: 120) from DailyRoomView; the root reservation already owns this edge. |
| `C9-09` | T1/minor | S | RoomBudgetSheet: a number pad inside a single fixed .medium detent with no ScrollView | Features/Rooms/Views/RoomBudgetSheet.swift:38-107, presented at Features/Rooms/Views/RoomProje… | .presentationDetents([.medium, .large]), wrap the column in a ScrollView, add the Done toolbar. |
| `C9-11` | T1/minor | S | NewThisWeekRail: 160 pt fixed cards with no accessibility wrap — the only rail without one | Features/Home/Views/NewThisWeekRail.swift:96,116 | Give it the same Layout switch YourHouseRail has, or adopt containerRelativeFrame with the same 200-280 clamp. |
| `C9-15` | T1/minor | S | 78 pt fixed label columns truncate at large text (product spec rows, proposal sign sheet) | Features/ProductDetail/Views/ProductDetailBlocks.swift:123; Features/Proposals/Views/ProposalS… | Replace the fixed width with a Grid/ViewThatFits that stacks label over value once the label no longer fits. |
| `GAP1-05` | T1/minor | S | Deferral acts and the submit-failure recovery acts are un-wrapping HStacks that cannot fit at accessibility s… | DecisionDetailView.swift:306-317 (HStack over DecisionDeferral.allCases) and :147-167 (HStack… | Wrap both in ViewThatFits { HStack{…}; VStack(alignment: .leading){…} }. |
| `GAP1-06` | T1/minor | S | 'Not yet' / 'Neither of these' are naked text links with no affordance | DecisionDetailView.swift:296-322; shots/GAP1/10-decision-detail.png | Give them the secondary/ghost pill treatment already in the kit, or set them on a hairline-topped row. |
| `GAP1-07` | T1/minor | S | 'Choose this' is an oversized slab that unbalances the option card | DecisionDetailView.swift:237-245 (HStack { price; Spacer(); optionAction } with PatinaButton s… | Use a content-sized (secondary/ghost) button on the non-recommended option, or move the CTA to its own full-width row beneath a p… |
| `GAP1-08` | T1/minor | S | Companion promotes 'Your recommendations' while five things need the client's eye | Companion panel on Today; shots/GAP1/06-companion-panel.png; CompanionAreaBuilders.swift studi… | When decisionsRow's count > 0 make it the suggested row on Today too (the builder already has the row); demote or hide a destinat… |
| `GAP1-09` | T1/minor | S | Companion's dimmed backdrop runs under the status bar and collides with the clock | Companion panel over Today; shots/GAP1/06-companion-panel.png | Apply the same top band (or a top scrim gradient) to the Companion's dimming layer. |
| `GAP1-14` | T1/minor | S | Coach tour uses stock-blue system buttons against a clay/sage palette | Welcome tour popover on Today; shots/GAP1/12-consent-signature-on.png | Restyle to the ghost + clay button pair used everywhere else. |
| `GAP1B-04` | T1/minor | S | The "?" help glyph beside the greeting does not scale with Dynamic Type | Today home header | Size the glyph with @ScaledMetric, or use a Label whose symbol inherits the text style. |
| `GAP1B-10` | T1/minor | S | The defer sheet’s note editor has no accessibility label | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDeferSheet.swift:40-48 — TextEditor… | .accessibilityLabel("Your message to your designer"). |
| `GAP2-05` | T1/minor | M | "Report a problem" is a dead tap: no navigation, no sheet, no feedback | Order detail — shots/GAP2/38-order-detail.png → 39-report-a-problem.png (identical); OrderDeta… | Use openURL(url) { accepted in … } and fall back to an in-app contact sheet or clipboard copy with confirmation. |
| `GAP2-08` | T1/minor | M | Project's empty sections render as two orphan negations inside the screen's only outlined box | Project detail — shots/GAP2/44-project-detail.png, 45-project-detail-bottom.png; ProjectDetail… | Fold each missing section into its own titled section using PatinaEmptyState, or omit the section; never stack bare negations in… |
| `GAP2-20` | T1/minor | S | The floating back chevron has no material and clips whatever scrolls under it | shots/GAP2/50-hub-scrolled-to-bottom.png (clearest), 52-invoice-detail-bottom.png, 45-project-… | .regularMaterial circle or a scroll-edge background, or a reserved safe-area inset. |
| `GAP3-03` | T1/minor | S | An internal hard-disk icon is the empty-state symbol for "no room scans" | apps/mobile/Patina/Patina/Features/DesignServices/ScanPickerView.swift:118 · shots/GAP3/08-des… | Use a room/scan symbol (e.g. "viewfinder" or the app's own scan mark) instead. |
| `GAP3-07` | T1/minor | S | Two visually identical chip groups behave differently on re-tap | DesignRequestFlowView+Steps.swift:334-372 (pickerSection vs optionalPickerSection) · shots/GAP… | Either allow deselect in both (and disable "Review" when nothing is chosen — it is already gated on projectType != nil), or diffe… |
| `GAP3-10` | T1/minor | S | The Review step has no heading and roughly 1000 px of dead space | DesignRequestFlowView+Steps.swift:91-134 · shots/GAP3/13-review-step.png | Add a short lead-in ("Here's what your designer will see") and let the summary block centre in the available space rather than pi… |
| `GAP3-12` | T1/minor | S | The success screen offers three exits, two of which do the same thing | DesignRequestFlowView+Steps.swift:246-255 + the toolbar Close · shots/GAP3/17-send-result.png | Hide the toolbar Close on the success step — the two footer buttons are the whole choice. |
| `GAP3-22` | T1/minor | S | The dark editorial hero band stops below the status bar, leaving a cream strip | apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift:30-33, 49 · s… | Move the dark fill to a background that ignores the top safe area (or paint the whole ScrollView), and lift the band's value in d… |
| `GAP3-23` | T1/minor | S | At accessibility-extra-large the consultation card's avatar detaches from the name and the bubble covers text | DesignerConsultationView.swift:56-73 (HStack, .center alignment) · shots/GAP3/49-consultation-… | Use .top alignment for the card HStack and add the bubble's bottom inset (GAP3-20). |
| `GAP4-13` ⇢L1-A | T1/minor | S | Q3's swatch grid has a 3 pt gutter and its CTA sits 0.3 pt off the swatches | MaterialConnectionView grid + StyleConversationContainerView.swift:66-71 (StyleContinueButton… | Use one gutter token across the conversation and give the CTA a real top margin above the answer area. |
| `GAP4-34` | T1/minor | S | At accessibility sizes the auth root truncates its own Terms and Privacy links | Auth welcome screen legal footer; shots/GAP4/49-retake-quiz-axXL.png | Let the consent line wrap to as many lines as it needs and give the two links minimumScaleFactor. |
| `GAP5-01` ⇢L0.1 | T1/minor | S | Rotation is NOT refused: on a landscape iPad the app is pillarboxed in black over half the screen with the st… | iPad landscape · shots/GAP5/03-rotate-right.png, 04-landscape-settled.png, 26-landscape-signed… | TARGETED_DEVICE_FAMILY = 1 (A2-03's own fix) removes the whole class — iPhone-compatibility mode letterboxes deliberately and con… |
| `GAP5-03` ⇢L0.1 | T1/minor | L | Every primary control is a 779 pt-wide slab — the phone layout is stretched, not adapted | Welcome home + onboarding · shots/GAP5/01-welcome-portrait.png, 02-preflight-after.png; measur… | One .frame(maxWidth: ~420) on the shared auth/onboarding stack would make it defensible at any width; for round one the real answ… |
| `GAP5-07` ⇢L0.1 | T1/minor | M | One screen, two width systems: 786 pt option rows above a 340 pt primary button | taste quiz Q2-Q5 · shots/GAP5/12-after-skip.png and scan_ui measurements | One deliberate content-width rule on the shared container resolves both halves — and fixes GAP5-03 at the same time. Cheapest glo… |
| `GAP5-10` ⇢L0.1 | T1/minor | S | The Companion dock's label sits on raw product photography with no scrim | Browse pieces, bottom of screen · shots/GAP5/15c-bottom-dock.png | A material/scrim behind the dock label, or move the count into the button's own surface. |
| `GAP5-24` ⇢L0.1 | T1/minor | M | Stretched list rows put a label and its value ~900 pt apart | Today home NEEDS YOU / MOVED · shots/GAP5/17-today-clean.png | Cap the row content width (the same maxWidth that fixes GAP5-03/07), or stack value under label above a width threshold. |
| `GAP6-01` | T1/minor | S | No visible way out of the number pad on the budget sheet — but the predicted blocker does NOT reproduce | shots/GAP6/17-budget-numberpad-visible.png, 19-dismiss-attempt-tap-inside-sheet.png, 20-dismis… | One shared keyboard Done toolbar on every numeric field; add '.presentationDragIndicator(.visible)'. |
| `GAP6-02` | T1/minor | S | RoomBudgetSheet draws no drag indicator while its sibling sheet hand-draws one | shots/GAP6/15-budget-sheet-no-keyboard.png · Features/Rooms/Views/RoomProjectView.swift:132-13… | Use '.presentationDragIndicator(.visible)' on both and delete the hand-drawn capsules. |
| `GAP6-06` | T1/minor | S | A backdrop tap silently discards a typed budget | shots/GAP6/18-budget-typed-400.png, 22-dismiss-tap-backdrop.png | Add Cancel/Save chrome, and either keep the draft or confirm before discarding. |
| `GAP6-10` | T1/minor | S | 'All Items' is the only right-aligned screen title in the app | shots/GAP6/25-cross-room-all-items.png | Left-align to match every other pushed screen. |
| `GAP6-14` | T1/minor | M | 'Add to room' from the Browse card menu gives no confirmation at all | shots/GAP6/29-after-add-to-room.png (1.5 s), 30-after-add-banner-check.png (0.7 s) · Features/… | Find why addToRoomMessage never renders (state/ownership), and make the card's heart reflect the save immediately. |
| `GAP6-16` | T1/minor | M | The Companion contradicts the screen it is drawn over | shots/GAP6/35-companion-on-detail.png | Feed the Companion the screen's saved state; make the row read Unsave/Saved when it is saved. |
| `GAP6-38` | T1/minor | M | Browse cards lose their content to truncation at accessibility sizes | shots/GAP6/50-browse-axxl.png | One column of full-width cards past a size threshold instead of a two-column grid. |
| `GAP6-40` | T1/minor | S | AddToRoomSheet has one detent and no ScrollView — rooms past the third are unreachable at large text | shots/GAP6/52-add-to-room-axxl.png · Features/Home/Views/AddToRoomSheet.swift:38-58 | '.presentationDetents([.medium, .large])' plus a ScrollView. |
| `GAP6-41` | T1/minor | S | The help '?' glyphs do not scale with Dynamic Type | shots/GAP6/24-your-spaces.png vs 46-your-spaces-axxl.png | Drive the glyph from a relativeTo font so it scales, and enforce a 44 pt hit target. |
| `GAP6-45` | T1/minor | S | The Companion offers 'Rescan room' on a room that was never scanned | shots/GAP6/GAP6.md step (b) — Companion in room context (capture in research/GAP6.md) | Say 'Scan this room' when there is no scan, and gate the saved-pieces row on a non-zero count. |
| `L07-06` | T1/minor | M | Floating chrome is painted over live content on four Studio screens, including a money figure | apps/mobile/Patina/Patina/Design/Components/PatinaScreenChrome.swift:66-80 — the back chevron… | Give the chrome overlay an opaque backing that spans the leading gutter, or reserve it as a safeAreaInset rather than an overlay. |
| `L07-09` | T1/minor | S | At accessibility-extra-large the sign sheet's own labels break mid-word and nothing actionable is on screen a… | apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalSignSheet.swift (the proposalSign.t… | Let the label column size to content (or stack label-over-value at accessibility sizes) and open the sheet at .large when dynamic… |
| `A-48` | T1/polish | S | A grey band sits under the product action bar in the home-indicator safe area | Product detail; shots/A/18-product-detail.png, 19 | Extend the bar's background with .ignoresSafeArea(edges: .bottom) and keep its content inside the safe area. |
| `C5-35` | T1/polish | S | Tour step 3's fallback repeats its own heading in different casing and drops the terminal period | apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:293-296 | body: 'Projects, proposals, invoices and files, in one place.' |
| `GAP2-11` | T1/polish | S | A search field sits above three project rows, and the cards carry nothing that distinguishes them | shots/GAP2/42-projects-list.png | Hide search below a threshold (>=8 projects); put current phase and next date on the card. |
| `GAP3-08` | T1/polish | S | The "Your vision" text field does not read as editable | DesignRequestFlowView+Steps.swift:67-73 · shots/GAP3/09-details-step.png | Darken the field's border a step (or add a focus ring) so the one free-text input in the flow announces itself. |
| `GAP3-16` | T1/polish | S | The Review step's most consequential line is its faintest text | DesignRequestFlowView+Steps.swift:118-122, DesignRequestAuthCopy.reviewHint · shots/GAP3/25-gu… | Promote it to the infoCard treatment already used for the cellular-consent and offline notices (icon + title + body), or at minim… |
| `GAP5-15` ⇢L0.1 | T1/polish | S | Two room cards in the same list have structurally different footers | Your Spaces · shots/GAP5/20-your-spaces.png | Keep the two-column frame and render the missing budget as a designed empty value ('—' or 'No budget set'). |
| `GAP6-04` | T1/polish | S | The raised budget sheet leaves a 236 pt dead band above the keyboard | shots/GAP6/17-budget-numberpad-visible.png | Size the sheet to its content ('.presentationDetents([.height(...)])') so it never carries a third of a screen of nothing. |
| `GAP6-32` | T1/polish | S | The note editor is a ~430 pt box for one sentence, and its placeholder misses the caret baseline | shots/GAP6/42-saved-note-sheet.png, 43-note-sheet-keyboard.png · Features/Collections/Views/Sa… | Cap the editor height and align the overlay to the editor's real text insets. |
| `GAP6-44` | T1/polish | S | Segmented tabs are drawn over an empty state | shots/GAP6/25-cross-room-all-items.png | Hide the segmentation until there is something to segment; settle on one '+' treatment. |

### W2 · L1-D Tokens, dark mode, contrast, iconography — 51 findings

_count: 51 · blocker 0 · major 19 · minor 25 · polish 7_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-96` ⇢L0.3 | T1/major | L | Photography is absent app-wide — rooms, editorial and some products render as flat gradients | Studio, home, browse; shots/A/47,53,27,15,16 | Ship real imagery for seeded rooms/editorial, and a designed fallback for the genuinely image-less case. |
| `B-38` | T1/major | M | Room cards have no imagery and use arbitrary, partly off-palette gradients | Spaces and Today — shots/B/38, 42, 43, 57, 36 | Use the room's scan keyframe/photo where one exists and a single palette-consistent placeholder pattern where it does not. |
| `B-39` | T1/major | S | Room-card captions are mid-brown mono on a mid-brown gradient — very low contrast | Spaces cards — shots/B/38-signedin-spaces.png, 42-room-saved.png | Add a scrim behind the caption block or move the metadata onto the card's cream footer. |
| `C-24` | T1/major | S | "Delete account" has no destructive treatment, and both it and "Sign Out" carry a navigation chevron | shots/C/29-dark-settings.png | Tint destructive rows, drop the chevron on action rows, and move Delete account into its own footer group. |
| `C3-04` | T1/major | M | The Companion orb and panel are charcoal-on-graphite in dark mode (1.15:1) with a light-mode-brown shadow tha… | Features/Companion/Components/CompanionMarkView.swift:163-168; Features/Companion/Components/C… | Make the Companion surface dynamic (charcoal in light, a lighter graphite or glassEffect shell in dark) and pair the shadow with… |
| `C3-08` | T1/major | M | Three icon languages side by side: SF Symbols (mixed fill/outline), Unicode glyphs, and the letter "G" standi… | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:152-162; Features/Authen… | Replace glyph icons with SF Symbols, ship the official Google mark as an asset (their branding guidelines require it), and pick o… |
| `C3-13` | T1/major | M | PatinaButton and 37 hand-rolled buttons use a FIXED height — labels clip at accessibility Dynamic Type | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:70 (.frame(height: 52))… | Change to .frame(minHeight: 52) in PatinaButton and AuthButton, and at the 37 hand-rolled sites. |
| `C3-14` | T1/major | S | PatinaStatusBadge: all four states are 1.9-2.6:1 — a tint label on a 14% wash of the same tint | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaStatusBadge.swift:41-45; used at Matc… | Darken the label tint (or use Text.primary) over the wash, or invert to a filled badge with Text.inverse. |
| `C6-12` | T1/major | M | Text.interactive — the app's link colour — fails WCAG AA in light mode across 111 call sites | PatinaColors.swift:124-126 — clayDeep #9F7E48 | Darken clayDeep for light mode until it clears 4.5:1 against both offWhite and softCream. |
| `C6-13` | T1/major | M | clay state indicators fail the 3:1 non-text contrast floor | PatinaColors.swift:20 — clay #C4A57B, 2.18:1 on the canvas; used as the sole non-textual state… | Use clayDeep (or charcoal) for state indicators and keep clay for decorative fills. |
| `C6-21` | T1/major | S | 8pt and 9pt type still in production | PatinaTypography.monoTiny (8pt, marked @available(*, deprecated) at PatinaTypography.swift:74)… | Retire monoTiny to monoLabel per its own deprecation message and lift the 9pt sites to 10pt. |
| `C6-24` | T1/major | M | Colour-only selection state — .isSelected is used at 6 sites and missing everywhere else | Missing at Features/Collections/Views/CollectionsView.swift:89-107 (Saved/Boards tabs), Rooms/… | Add .accessibilityAddTraits(isSelected ? [.isSelected] : []) at each site. |
| `C7-12` | T1/major | M | Everything expensive at launch is synchronous inside PatinaApp.init(), before the first frame — 18 TTFs, Post… | apps/mobile/Patina/Patina/PatinaApp.swift:63-89; PatinaDesignKit/Sources/PatinaDesignKit/Suppo… | Move font registration and PostHog off the launch path (background task with a main-actor handoff); build the container lazily so… |
| `GAP1-04` | T1/major | M | PatinaButton hard-pins .frame(height: 52) while its label scales with Dynamic Type | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:71-72 (secon… | Replace the fixed height with .frame(minHeight: 52) plus symmetric vertical padding so the capsule can grow; keep 52 as the floor. |
| `GAP4-10` ⇢L1-A | T1/major | M | Q1's four "room photographs" are placeholder gradients, and the VoiceOver label calls them photographs | VisualResonanceView.swift:16 ("Replace these gradients with real photographs when assets land.… | Ship the photography, or ask about palettes here too and drop "photograph" from the accessibility label. |
| `GAP4-12` ⇢L1-A | T1/major | M | Five questions, five different option components | VisualResonanceView / LifestyleRealityView / MaterialConnectionView / InvestmentPerspectiveVie… | Pick one option-row component and one grid metric for the whole conversation; vary only the media inside it. |
| `GAP4-15` ⇢L1-A | T1/major | S | The Reveal's aesthetic name renders in the system font — PlayfairDisplay-Light is not in the bundle | RevealView.swift:83 (.font(.custom("PlayfairDisplay-Light", size: 42))); shots/GAP4/24-pause-t… | Use PlayfairDisplay-Regular at 42 pt, or add the Light .ttf to PatinaDesignKit's resources. |
| `GAP5-18` ⇢L0.1 | T1/major | S | Measured: the story card's MAKER SPOTLIGHT eyebrow is at 1.36:1 contrast — effectively invisible | Today home story card · shots/GAP5/17-today-clean.png, crop 17b-story-eyebrow.png | Move the eyebrow onto the dark end of the gradient, add a scrim, or use the headline's near-white. |
| `GAP7B-11` ⇢L0.3 | T1/major | M | With no photograph, a piece’s hero is a flat brown gradient occupying the top third of the screen | Product detail (Features/ProductDetail) reached by universal link — "Oak Reading Chair", catal… | Seed images before the round (L0.3 / P-36) or give the empty hero a composed treatment: the mark, the maker, and a line that admi… |
| `A-97` | T1/minor | S | Settings icon tiles use five unrelated colours and mark Notifications with the destructive red | Settings; shots/A/54-settings.png, 57 | Pick one neutral tile treatment for all rows and reserve red for destructive actions only; make the palette identical in both app… |
| `B-41` | T1/minor | S | Settings row icon tiles are tinted off-palette — pink, blue, green, orange among tans | Settings sheet — shots/B/21-guest-settings.png, 22, 58 | Tint all tiles from the warm palette; use tone, not hue, to differentiate sections. |
| `C-32` | T1/minor | M | Tab bar is text-only with no icons, colour-only selection, uneven widths and an unlabeled fifth item | shots/C/50-flagson-dark-tabroot.png, 51, 52, 53 | Add icons, an explicit selected indicator, equal widths, and either label the fifth item or move it out of the tab bar. |
| `C-49` | T1/minor | S | The two cards stacked on Your Spaces have different widths, so their right edges do not align | shots/C/09-dark-spaces.png, 51-flagson-spaces.png | Move the "?" inside the card (or delete it, see C-05) and set both cards to the same width. |
| `C-50` | T1/minor | S | The bottom action bar has no material in dark — 1.06:1 against the page | Product detail; shots/C/13-dark-product-scrolled.png | Use a proper bar material with a scroll-edge effect. |
| `C3-18` | T1/minor | M | Haptics: two competing mechanisms, ten feature areas (65 files) with none at all, and the Companion's signatu… | PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift:17-18,28-34,80-82; zero ha… | Add impactSoft.prepare() and impactRigid.prepare(); standardise on .sensoryFeedback; cover the primary act on each money/decision… |
| `C3-24` | T1/minor | M | Missing product photos fall back to a decorative brown gradient with no "no image" signal — a second, unrelat… | Core/Models/ProductModel.swift:236-245 and Core/Models/SavedItem.swift:92-100; rendered at Rec… | Route no-URL products through PatinaAsyncImage's designed placeholder, or overlay the strata mark on the gradient; give the gradi… |
| `C3-29` | T1/minor | S | PatinaTextField's resting border is a 1.05:1 whisper — the field has no visible boundary until focused | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaTextField.swift:38-42; hand-rolled al… | Raise the resting border to a visible dynamic token and adopt the component at the hand-rolled sites. |
| `C3-30` | T1/minor | S | PatinaAsyncImage has no crossfade and no cache — browse-grid photos pop in and re-flash the placeholder on sc… | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:28-57 | Add `.transition(.opacity.animation(.easeOut(duration: 0.2)))` on the success arm (skipped under reduce motion) and a small in-me… |
| `C3-31` | T1/minor | S | Shadow tokens are all light-mode brown with no dark variant, and are outnumbered by raw .shadow() calls | PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaShadows.swift:14,21,28,35,51; 8 raw sites… | Make the shadow colours dynamic (a deeper, higher-opacity value in dark) and route the 8 raw sites through patinaShadow. |
| `C6-11` | T1/minor | M | Text.muted fails WCAG AA in light mode across 265 call sites | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:116-118 — agedOa… | Darken the light-mode agedOak value (roughly #7A6449 clears 4.5:1) and leave the dark palette alone. |
| `C6-33` | T1/minor | S | PatinaButton loses its title while loading | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:57-68 | Keep .accessibilityLabel(title) on the Button and add .accessibilityValue("Loading") while isLoading. |
| `C7-21` | T1/minor | M | Remote images decode at full resolution with no downsampling and no configured URLCache | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:28-56; u… | Configure a shared URLCache at launch and downsample with ImageIO (kCGImageSourceThumbnailMaxPixelSize) to the card size. |
| `GAP2-13` | T1/minor | S | The same two amounts are typeset in two typefaces and two number formats, 300 pt apart, on the Budget screen | Budget — shots/GAP2/48-budget.png, 49-hub-bottom-inset.png | One currency formatter and one numeral face for money app-wide. |
| `GAP3-27` ⇢L1-A | T1/minor | M | Emoji stand in for iconography in the style quiz | style-quiz option rows · shots/GAP3/38-quiz-done.png plus the Q4/Q5 AX trees | Replace with SF Symbols or the design kit's own marks; never mix emoji and glyphs in one list. |
| `GAP4-06` ⇢L1-A | T1/minor | S | Full-colour emoji as the room-type iconography inside a monochrome editorial system | ScanFallbackEntryView.swift:88-95; shots/GAP4/13-fallback-entry.png, 45-fallback-axXL.png | SF Symbols (sofa, bed.double, fork.knife, laptopcomputer, frying.pan, sparkles) tinted with the semantic tokens. |
| `GAP5-02` ⇢L0.1 | T1/minor | M | In landscape the next onboarding page bleeds permanently into the right edge of the column | guest onboarding page 1, landscape · shots/GAP5/04-landscape-settled.png right edge | Derive the page width from the live container width rather than a captured/hard-coded value. |
| `GAP5-04` ⇢L0.1 | T1/minor | M | On the 1210 pt canvas the vertical rhythm collapses into dead space | Welcome home + guest onboarding · shots/GAP5/01-welcome-portrait.png, 02-preflight-after.png | Centre the auth stack vertically and cap the hero band as a proportion of height; or A2-03 for round one. |
| `GAP5-08` ⇢L0.1 | T1/minor | S | Palette swatches lose their meaning at 387 pt: a palette becomes a 3:1 letterbox band | taste quiz Q1 'Which palette feels like home?' · shots/GAP5/12-after-skip.png | Cap the grid's content width, or make the swatch aspect-ratio-locked rather than fixed-height-and-fill-width. |
| `GAP6-03` | T1/minor | S | The disabled Save capsule is the only cold grey in the app | shots/GAP6/15-budget-sheet-no-keyboard.png, 16, 48 · Features/Rooms/Views/RoomBudgetSheet.swif… | Give the disabled state its own palette token (a pale clay fill with muted text). |
| `GAP6-09` | T1/minor | S | The Your Spaces card subtitle is the lowest-contrast text in the app | shots/GAP6/24-your-spaces.png, 46-your-spaces-axxl.png | A scrim behind the card's text block, or move the metadata onto the cream footer. |
| `GAP6-17` | T1/minor | S | A Browse card shipped with no image and no placeholder treatment | shots/GAP6/26-browse-pieces.png, 27-browse-card-menu.png, 29-after-add-to-room.png | A branded placeholder plus a retry for image loads; never leave a bare grey rectangle. |
| `GAP6-22` | T1/minor | S | The room item row and item menu throw away the piece's photograph | shots/GAP6/37-room-with-item.png, 38-item-action-menu.png | Use the product image in SavedItem rows; keep the gradient only as the loading placeholder. |
| `GAP6-27` | T1/minor | S | The 'current room' row in Move/Copy reads as a rendering failure | shots/GAP6/39-move-to-another-room.png | Keep the card background and mark the state with the CURRENT chip alone. |
| `P-24` | T1/minor | S | A giant "#" character is the illustration for the sign-in-code screen | shots/P/23-code-requested-t0.png | A drawn mark, or drop the hero and lead with the heading. |
| `C9-19` | T1/polish | S | Stale deployment-floor comments contradict the project (iOS 18 / 26.2 / 17.6 vs 26.5) | Features/ProductDetail/Views/ProductDetailBlocks.swift:209-210; Features/ARPlacement/Views/ARP… | One true floor, restated nowhere; delete the per-file claims. |
| `GAP2-06` | T1/polish | S | Order-stage ladder: "IN PRODUCTION" and "SHIPPED" labels nearly touch and read as one word | shots/GAP2/37-ordered-list.png, 38-order-detail.png | Centre each label on its segment, shorten to "PRODUCTION", or tighten tracking at this width. |
| `GAP2-26` | T1/polish | S | "Subtotal" and "Total" stacked with the identical amount, and the lesser row gets the accent colour | shots/GAP2/51-invoice-detail.png, 52-invoice-detail-bottom.png | Collapse to a single Total when subtotal == total; give Total the accent when both are shown. |
| `GAP4-07` | T1/polish | S | The units control is the one stock UIKit segmented control in a bespoke screen | ScanFallbackEntryView.swift:164-173 (.pickerStyle(.segmented)); shots/GAP4/13-fallback-entry.p… | Restyle as a two-segment pill in the app's own idiom, or accept the system control everywhere rather than only here. |
| `GAP5-22` ⇢L0.1 | T1/polish | S | house-first tab bar: the 402 pt arithmetic scales to 192 pt cells per word — a web nav bar, not a tab bar | PatinaTabBar under -PatinaFlags house-first,direct-orders,house-widget · shots/GAP5/25-tabbar-… | Derive the trailing slot and inter-item spacing from the container width (which also fixes C9-16's narrow case); make the AX labe… |
| `GAP6-18` | T1/polish | M | Product photography does not match the product | shots/GAP6/26-browse-pieces.png, 41-saved-list.png | Product-on-ground hero per piece; keep the room scene as a secondary image. |
| `GAP6-31` | T1/polish | S | 'Add a note' is styled exactly like the metadata beside it | shots/GAP6/41-saved-list.png · Features/Collections/Views/CollectionsView.swift savedRowFooter | Give it a control treatment (chip or leading glyph) and attach it to the card. |

### W2 · L1-E Copy — 48 findings

_count: 48 · blocker 0 · major 6 · minor 31 · polish 11_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C5-08` | T1/major | M | 'Room' and 'Space' are used interchangeably — sometimes as label and hint on the same row | apps/mobile/Patina/Patina/Features/Companion/Services/CompanionAreaBuilders.swift:115-116,151,… | Pick one noun and sweep; the label/hint pairs above are where the collision is most visible. |
| `GAP2-04` | T1/major | S | Order detail says "Write to the address below" and there is no address below | Order detail — shots/GAP2/38-order-detail.png; copy from service.terms?.paragraph rendered by… | Render the contact under the paragraph in the .contact shape, or change the copy to name the row above it. |
| `GAP4-08` | T1/major | S | The conversation opens by telling the user "YOUR ROOM IS CAPTURED" when nothing was captured | ConversationHeaderView whisperTop on the manual path, from QuietConversationFlowHost.swift:195… | Branch the whisper on session.scanMethod == .manual ("YOUR ROOM, NOTED · LET'S DISCOVER YOUR STYLE"). |
| `GAP4-21` | T1/major | S | The floor plan says "Here's what I see." and reports "0 ITEMS DETECTED" for a room nobody looked at | ScanFloorPlanPreviewView.swift:31-34 (header), :124-131 (statsRow), :48-56 ("Rescan"); shots/G… | Branch header, stat set and button label on session.scanMethod == .manual — "Here's what you told me", drop the detected-items co… |
| `GAP8-10` ⇢L0.3 | T1/major | S | The marketplace's empty state offers the one action that cannot help | Features/Recommendations/Views/RecommendationsView.swift:254-265,69-76 | An empty catalogue is an us-state, not a you-state: say so and drop the CTA. R-06 (the state does not fill the screen) escalates… |
| `L07-04` ⇢L1-C | T1/major | S | An order's responsibility paragraph promises an address that the screen never prints | apps/mobile/Patina/Patina/Features/Orders/Views/OrderDetailView.swift:206-220 renders service.… | Print terms.contact under the paragraph as a selectable mailto row, or change the paragraph to point at 'Report a problem' above… |
| `A-43` | T1/minor | S | "Designers Pick" is missing its apostrophe and a raw slug is shown as a tag | Product detail PROVENANCE; shots/A/19-product-detail-scrolled.png | "Designer's Pick"; map category keys to display names in one place. |
| `A-56` | T1/minor | S | "Ask about this piece" opens a modal whose title and headline disagree | Product detail → Ask about this piece (guest); shots/A/22-guest-ask.png | Give the sheet a contextual headline ("Sign in to ask about the Velvet Club Chair") and a standard nav-bar Cancel. |
| `A-83` | T1/minor | S | "MOVED" is an opaque section header on the home | Daily Room home; shots/A/44-home-signedin.png | Rename to something a homeowner reads ("Recently" / "What's happened") and either explain or remove the grey treatment. |
| `B-40` | T1/minor | S | System language 'TYPED, NOT SCANNED' is shown to homeowners | Spaces cards and room detail — shots/B/38, 42, 43 | Say what it means to the reader: 'Measurements you entered' with a 'Scan this room' action. |
| `B-48` | T1/minor | S | 'MOVED' section header is jargon, and its two rows use different text colours with no legend | Today NEEDS YOU card — shots/B/35-signedin-today-top.png | Rename the section ('Since you were last here'), and either drop the two-tone treatment or label it (read/unread). |
| `B-58` | T1/minor | S | The Companion speaks in first person and exposes internal jargon | Companion panel — shots/B/68-companion-open.png, 69-companion-panel.png | Settle on one voice; replace 'PORTAL' with 'the web'; shorten captions so they fit one line; extend the panel to cover the action… |
| `C-42` | T1/minor | S | Three money formats for the same figure across adjacent screens | shots/C/01 ("budget $9,000"), 09 ("$9.0K", "$0 total"), 22 ("$4,250.00") | One currency formatter with an explicit abbreviation rule. |
| `C-54` | T1/minor | S | The Companion identifies itself two different ways on the same identifier, and its subtitle is squeezed to an… | Product detail vs everywhere else; shots/C/12-dark-product.png, 03-light-companion.png | One Companion component with one label; widen the subtitle measure to the panel. |
| `C3-25` | T1/minor | S | Four different empty-state languages — a tester with no data sees three of them in three taps | PatinaEmptyState (12 uses); ContentUnavailableView at HelpPanelSheet.swift:161; Unicode-glyph… | Route all six hand-rolled empty states through PatinaEmptyState. |
| `C4-24` | T1/minor | S | Pieces' empty-state copy doesn't name the filter that emptied it — and the right copy already exists, unused | apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:257-266 | Branch on activeFilter != all: name the filter and offer "Show all" as the CTA. |
| `C5-12` | T1/minor | S | DesignServicesError's ten sentences use two punctuation conventions in one enum | apps/mobile/Patina/Patina/Services/DesignServices/DesignServicesService.swift:182-208 | Terminal periods on all of them — they are sentences. |
| `C5-15` | T1/minor | S | Money ranges are written four different ways, so the quiz reflects a budget back in a format the user never s… | DesignServicesService.swift:90-92; QuizModels.swift:104-106; StyleQuizViewModel.swift:241-245;… | One range format, echoed verbatim. |
| `C5-21` | T1/minor | S | One destination, three names: the pill says 'Studio', VoiceOver says 'Your Studio', the tour says 'Your profi… | DailyGreetingHeader.swift:13-14; Coordinator.swift:146,149; PatinaTab.swift:30,42; FirstLaunch… | 'Your Studio' everywhere the user can read it, including the Sanity doc; keep 'Profile' as the analytics name only. Overlaps A1-1… |
| `C5-23` | T1/minor | M | 259 straight apostrophes vs 10 curly — and the split runs between adjacent Studio screens | census over research/C5-strings.txt. The 10 curly: CameraPermissionService.swift:19, CameraPer… | Sweep to ’. (The ellipsis is already almost entirely the correct … character — do the same for apostrophes.) |
| `GAP1-12` | T1/minor | S | 'Browse pieces for the {room.name}' prepends a definite article to a user-named room | apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:254 — cta(primary: "Brows… | Drop the article: "Browse pieces for \(room.name)". |
| `GAP1-17` ⇢L0.3 | T1/minor | S | Raw seed token 'Aesthete-Dev-Seed' printed under PROVENANCE on a client-facing product screen | Product detail (Oak Reading Chair); shots/GAP1/19-decision-rug.png | Filter internal pipeline tags out of the provenance chip, or whitelist the values that may be shown to a client. |
| `GAP1B-14` | T1/minor | S | Raw decision_type enum values are shown to the client as pills | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionListView.swift:78-86 — Text(type.ca… | Map the enum to client-facing labels, or drop the pill where it restates the title. |
| `GAP2-03` | T1/minor | S | Accessibility label says "1 categories" — broken pluralisation plus a schema word | Studio hub section headings, describe_screen | ^[\(n) item](inflect: true) and a client-facing noun ("1 thing in progress"). |
| `GAP2-10` | T1/minor | S | Projects list title is a bare count where every sibling screen has a sentence | shots/GAP2/42-projects-list.png | "Your projects" as the title; keep the count as a mono sub-line if it earns its place. |
| `GAP2-12` | T1/minor | S | The same class of figure is "TOTAL" on the projects card and "BUDGET" on the project detail | shots/GAP2/42-projects-list.png vs 44-project-detail.png | Use BUDGET in both places. |
| `GAP2-15` | T1/minor | S | Budget invoice rows lead with the accession number and drop the due date the home screen shows | shots/GAP2/48-budget.png | Lead with "Due Sep 6 · Awaiting payment"; demote INV-2026-0142 to the caption. |
| `GAP3-05` | T1/minor | S | Title Case chips sit beside sentence-case chips in one screenful | DesignServiceType.displayName vs DesignTimeline.displayName, rendered in DesignRequestFlowView… | Pick one case convention for chip labels — sentence case matches the rest of the app's voice — and apply it to DesignServiceType.… |
| `GAP3-11` | T1/minor | S | The success message is three unrelated sentences concatenated at runtime, with a dangling "its" | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift:259-272 ·… | Write two whole sentences per branch instead of concatenating three fragments; replace "its" with "your request". |
| `GAP3-13` | T1/minor | S | The status screen renames the fields the compose flow just collected | DesignRequestStatusView.swift:265,272 vs DesignRequestFlowView+Steps.swift:94-96 · shots/GAP3/… | Use "Help" on both and render the roomless case as "No scan attached" rather than "0 scans". |
| `GAP3-19` | T1/minor | S | The guest Studio card asks for a sign-in and offers "Open settings" | StudioHub.GuestSettingsButton · shots/GAP3/22-guest-entry.png, 23 | Relabel the action "Sign in" and present AuthSheet directly. |
| `GAP4-05` | T1/minor | S | Stepper VoiceOver labels are ungrammatical and the two rows share duplicate AX ids | ScanFallbackEntryView.swift:249,262; AX tree on shots/GAP4/13-fallback-entry.png | Singularise the labels ("Add a window", "Remove a door") and give real ids (scan.fallback.windows.increment, …). |
| `GAP6-07` | T1/minor | S | Room copy leaks capture-pipeline vocabulary to a homeowner | shots/GAP6/14-room-screen.png, 24-your-spaces.png, 47-room-axxl.png | Say it in the person's words ('measurements you typed') or drop the provenance from the subtitle. |
| `GAP6-12` | T1/minor | S | '1 ITEMS' / '1 SAVED PIECES' — the same count is pluralised three ways | shots/GAP6/33-detail-add-to-room-picker.png, 37-room-with-item.png · Features/Home/Views/AddTo… | One pluralised count helper used by all three surfaces. |
| `GAP6-25` | T1/minor | S | Capitalisation flips between Title Case and sentence case inside one flow | shots/GAP6/27-browse-card-menu.png vs 38-item-action-menu.png | Sentence case everywhere; one pass over ItemActionMenu and AddToRoomSheet. |
| `L07-07` ⇢L1-C | T1/minor | S | The Selections block of an $18,500 proposal shows five line items and no money, and nothing on screen says why | apps/mobile/Patina/Patina/Features/Proposals/Views/ProposalDetailBlocks.swift:129-156 prints l… | On the milestone tier print one line under the Selections block — 'Your designer is sharing the scope, not the line prices.' — or… |
| `R-18` | T1/minor | S | Three of the four error messages cannot tell the tester whether the fault is theirs or ours | Browse / Proposal / Today error surfaces; §1l of research/R.md | Branch on URLError.notConnectedToInternet / timedOut and use the Studio's connection wording for those cases; keep the neutral wo… |
| `C1-39` | T1/polish | S | The email-code sheet's header contradicts the panel under it | Features/Authentication/Views/AuthenticationView.swift:116-140 vs :304-323 | Switch the header to 'Check your email' once magicLinkSent is true. |
| `GAP2-19` | T1/polish | S | The hub section titled "Money & documents" contains no documents | Studio hub — shots/GAP2/46-hub-budget-row.png; AX heading "Money & documents, 4 categories" | Title the section for what it holds, or let the documents row render with its empty state. |
| `GAP2-21` | T1/polish | S | Archive says "empty" three ways and its count glyph reads as Ø | Studio hub bottom — shots/GAP2/50-hub-scrolled-to-bottom.png | Hide the count when it is zero (every other section's count is >=1) and keep the sentence. |
| `GAP2-22` | T1/polish | S | Capitalisation flips inside one list: "Retake Style Quiz" beside "Get design help" | Studio hub YOUR PROFILE section — shots/GAP2/50-hub-scrolled-to-bottom.png | "Retake your style quiz". |
| `GAP2-28` | T1/polish | S | Mixed straight and curly apostrophes across adjacent mono eyebrows | AX tree — invoice detail and order detail; shots/GAP2/51-invoice-detail.png, 38-order-detail.p… | Curly everywhere; add a lint rule for ' in user-facing strings. |
| `GAP2-29` | T1/polish | S | Two stacked caption lines under the pay CTA both say "securely" | shots/GAP2/52-invoice-detail-bottom.png | One line: "Opens securely in Safari · card or bank transfer". |
| `GAP3-06` | T1/polish | S | Hyphen-minus used as the range dash in every price and timeline range | DesignBudget.displayName / DesignTimeline.displayName · shots/GAP3/09-details-step.png | Replace "-" with "–" in those display strings. |
| `GAP4-30` | T1/polish | S | ContemplativePauseView is a well-made waiting state, but its "me" is never attributed and it crossfades throu… | ContemplativePauseView.swift:26-45 (copy + dots), :66-100 (runScoring); shots/GAP4/62-pause-f2… | Attribute the voice (companion mark or name), and match the pause's ground to the Reveal's so the dissolve is a fade, not a wash. |
| `GAP6-05` | T1/polish | S | The budget field's placeholder promises a format the field never produces | shots/GAP6/15-budget-sheet-no-keyboard.png, 18-budget-typed-400.png · Features/Rooms/Views/Roo… | Group as the person types, and mute/lighten the placeholder so it cannot pass for a value. |
| `GAP6-43` | T1/polish | S | 'You added the Heirloom Oak Dining Table on Tuesday' for something added fifteen seconds ago | shots/GAP6/37-room-with-item.png | Relative phrasing inside the last day ('just now', 'today'), weekday only beyond it. |
| `R-21` | T1/polish | S | "5 things need your eye" is printed twice on the same Studio screen | Studio; shots/R/11a-studio-t2.png | Suppress the companion caption on any screen whose own header already carries the same count. |

### W2 · L1-F Notifications, messaging, widget, deep links — 27 findings

_count: 27 · blocker 0 · major 5 · minor 18 · polish 4_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C9-05` ⇢L1-C | T0/major | S | The message composer is drawn under the Companion dock — threadDetail never yields | Features/Messaging/Views/ThreadDetailView.swift:28-58,264-289; Design/Components/CompanionSafe… | Add .threadDetail to yieldsToPinnedFooter (dock steps aside to the 44 pt corner mark) and give the composer .safeAreaPadding(.bot… |
| `C2-04` | T1/major | M | A first-round tester can never be asked for notification permission | apps/mobile/Patina/Patina/Features/Notifications/Views/PushPrimerView.swift:84-101; Patina/Fea… | Keep Q7's earned ask, but add a second explicit door: a Settings row that presents the same primer, sharing the once-per-install… |
| `C4-15` | T1/major | S | "Message your designer" is a silent no-op on failure in three places — twice on a failure banner where it's t… | apps/mobile/Patina/Patina/Features/Home/ViewModels/DailyRoomViewModel.swift:445-455 + Features… | Reuse the openThreadFailed state at all three call sites; flip the button label instead of doing nothing. |
| `GAP7-02` +GAP7B-10 | T1/major | M | A universal link tapped while the app is not running is silently dropped about a third of the time | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:62-69; shots/GAP7/32-launchque… | Give the universal-link branch the same pendingRoute stash and replay it from configure(coordinator:). |
| `GAP8-06` ⇢L0.2 | T1/major | S | tester@patina.cloud's bell shows "New pieces for you" with an empty body and a dead tap | Core/Network/NotificationsAPIClient.swift:127-161,224-233; App/DeepLinking/NotificationRouter.… | Read metadata.headline/message alongside title/body; give welcome_series its own bucket instead of falling through to .newRecomme… |
| `A-105` | T1/minor | M | patina:// deep links do nothing — no navigation, no error | xcrun simctl openurl; shots/A/61,62,66,67 | Wire onOpenURL to the router, dismiss any presented sheet before routing, and show a designed "we couldn't find that" state for u… |
| `A-86` | T1/minor | S | Notification rows have inconsistent anatomy and the unread tint does not share a margin | Notifications; shots/A/45-bell-signedin.png | Give every row the same timestamp slot, and inset the tint to the same margin as the separators (or bleed both). |
| `A1-13` | T1/minor | S | Notifications lands on a different tab depending on how it was opened | apps/mobile/Patina/Patina/Features/Navigation/RouteTabTable.swift:55-77 vs App/Coordinators/Ap… | Either route the bell through openExternal, or accept and document it. Only bites once house-first is on. |
| `C-15` | T1/minor | S | The message composer has no accessibility label and exposes its placeholder as the field's value | Messages; AX frame {{30,799.7},{288,17}} | .accessibilityLabel("Message") and use a real placeholder rather than a value; raise the tap target to 44 pt. |
| `C-35` | T1/minor | S | The notification badge grows over its bell and, at accessibility sizes, replaces it entirely | shots/C/30-xxxl-today.png, 35-ax3xl-today.png, 54-flagson-ax3xl-tabbar.png | Cap the badge's scaling relative to its anchor, or move the count into the accessibility label only. |
| `C-53` | T1/minor | S | Notification rows read as run-on sentences and announce a timestamp that is not on screen | Notifications AX tree; shots/C/00-preflight-after.png | Split title/description into label and value, drop the phantom timestamp, add the header trait. |
| `C2-01` | T1/minor | S | A cold-launch notification tap is handled twice (route pushed twice, markOpened twice) | apps/mobile/Patina/Patina/App/AppDelegate.swift:44-46 and :141-155 | Dedupe on notification_log_id, or drop the launchOptions branch entirely — the UNUserNotificationCenterDelegate covers the tap ca… |
| `C2-11` | T1/minor | S | The push primer can present over Spaces / Pieces / Studio on the house-first root | apps/mobile/Patina/Patina/Features/Navigation/HouseFirstRoot.swift:61-82; Patina/Features/Home… | Gate presentPushPrimerIfEarned() on coordinator.tabs.isShowingTodayRoot on the house-first root, exactly as FirstLaunchTour(canAu… |
| `C2-12` | T1/minor | S | The widget gallery preview shows only the empty state | apps/mobile/Patina/PatinaWidget/HouseWidgetProvider.swift:38-45; PatinaWidget/HouseWidget.swif… | Return a fixed sample payload when context.isPreview; the Home Screen path is unchanged, so C5's no-fabricated-rows ruling still… |
| `C2-15` | T1/minor | S | A notification row with no resolvable route draws a chevron and dead-ends on tap | apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:222-227 and… | Draw the chevron only when notification.route != nil and suppress the button highlight for routeless rows. |
| `C2-17` | T1/minor | S | "Mark all read" also flips queued push envelopes to opened | apps/mobile/Patina/Patina/Services/API/NotificationsAPIClient.swift:101-117 | Add status=in.(delivered,unconfirmed,sending) (or exclude queued) to the PATCH filter. |
| `C2-22` | T1/minor | S | A widget tap wipes an in-progress flow on the flag-off root | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:326-331; Patina/App/DeepLinkin… | Treat .heroFrame from an external entry as select/pop-the-home-stack rather than a hard reset, or confirm when the stack top is .… |
| `C4-20` | T1/minor | S | Piece detail paints the error state on the first frame of a deep-linked piece | apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:111-119; Featur… | Initialise isLoading = true when a productId is supplied, or hoist to `if productId != nil && product == nil { loadingView }`. |
| `GAP7-01` +GAP7B-01 | T1/minor | S | The widget gallery card advertises the widget with its empty state | shots/GAP7/41-gallery-preview.png; apps/mobile/Patina/PatinaWidget/HouseWidgetProvider.swift:3… | Return a fixed, clearly-sample payload when context.isPreview; WidgetKit redacts the Home-Screen placeholder anyway, so only the… |
| `GAP7B-06` ⇢L1-E | T1/minor | S | The widget’s eyebrow reads "SINCE TUE" on a Tuesday, for a window that opened the PREVIOUS Tuesday | PatinaWidgetShared/HouseWidgetPayload.swift (eyebrow date logic); sinceDate = 2026-08-25T05:00… | Use a date once the window is older than ~5 days ("SINCE AUG 25"), as the rows already do. |
| `GAP7B-12` ⇢L1-B | T1/minor | S | The widget’s house line changes between launches for no reason the tester can see | widget-snapshot.json houseLine, written from the house rail’s first room (Core/Persistence/Wid… | Order the rail deterministically and pick the house line by a stable rule, not by array order. |
| `GAP7B-15` ⇢L1-C | T1/minor | S | A decision on Today reads "ASKED SEP 1 · OVERDUE" on Sep 1, because its due date precedes the day it was asked | Today NEEDS YOU row (Features/Home) — local row public.client_decisions "Rug color - Natural v… | Clamp/validate due_date >= asked_at where the row is built (and fix the seed), or suppress the OVERDUE stamp when the due date pr… |
| `GAP8-11` ⇢L1-B | T1/minor | S | client_designer_roster 404s on every foreground; profile_presence 404s on every visit | Core/Network/RosterAPIClient.swift:40-61; Services/Auth/ProfileService.swift:150-172; Services… | Apply 00536 and 00538/00539 as part of the 00533–00540 block. Until then the attribution roster is permanently empty and last_see… |
| `B-59` | T1/polish | S | The notification pre-permission sheet has excellent copy in a badly composed layout | After the taste portrait — shots/B/33-signedin-today.png | Centre the block vertically (or top-align it with the buttons pinned to the bottom) and align the buttons to the text. |
| `C5-28` | T1/polish | S | MockNotifications ships outside #if DEBUG with real third-party brand names and a coastal provenance claim | apps/mobile/Patina/Patina/Features/Companion/Services/NotificationManager.swift:137-175 | Delete it, or gate #if DEBUG and reword to Midwest makers. |
| `GAP1-16` | T1/polish | S | Notification rows mix '12h ago' with rows carrying no timestamp at all | Notifications sheet; shots/GAP1/04-decision-list.png | Give every row the same time treatment, or drop it from all of them and lean on the section header. |
| `GAP7-05` | T1/polish | S | A widget row whose subject has since been resolved lands on Today with no explanation | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift route(forWidgetLink:in:); shot… | Carry the row's route token in the widget payload rather than only its id, or say one line when the fallback fires. |

### W2 · L2-G Tests & gates — 6 findings

_count: 6 · blocker 0 · major 0 · minor 5 · polish 1_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-15` | T1/minor | M | A4-15: the in-process account-switch seam is unit-verified only, never walked | artifacts/ios-daily-return-2026-08-26/waves/w6/integration.md §9.7 item 1; waves/w5/walk.md:34… | One scripted account-switch walk (sign out, sign in as the second account, send from a piece) on a simulator with healthy HID del… |
| `C7-16` | T1/minor | L | 236 unique compiler warnings in the app target, 112 of them 'error in the Swift 6 language mode' | artifacts/ios-testflight-polish-2026-09-01/.build/xcodebuild.log (BUILD SUCCEEDED, 0 errors) | Triage the 112 Swift-6 errors before the language-mode bump; fix the five real concurrency ones now; restore .swiftlint.yml reada… |
| `G-03` | T1/minor | M | XCUITest suite is dead: 7/11 fail against a first-run flow that no longer exists; the 4 passes are Xcode temp… | apps/mobile/Patina/PatinaUITests/FirstLaunchUITests.swift; PatinaUITests/Helpers/FirstLaunchTe… | Either rewrite the suite against the live first-run identifiers (auth.welcome.guestButton, auth.form.emailField, companion.intro.… |
| `G-04` | T1/minor | S | SwiftLint build phase is `\|\| true` — 421 error-severity violations never fail anything | apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:408 | Drop the `\|\| true` once the identifier_name bucket is resolved (G-11), and give the phase an output path so it stops re-running… |
| `G-11` | T1/minor | M | `swiftlint lint` can never exit 0: 421 error-severity violations, 396 of them snake_case DTO keys | research/G-lint.json; heaviest in Patina/Core/Network/*APIClient.swift and Patina/Services/Syn… | Add identifier_name `allowed_symbols` or an excluded path glob for the DTO / API-client files (or move wire shapes behind explici… |
| `GAP1-18` | T1/polish | S | Universal link cold-start relaunches the app without launch arguments (tooling caveat for other lanes) | xcrun simctl openurl https://client.patina.cloud/decisions/<id>; shots/GAP1/20-coldlink-decisi… | Any lane using openurl must relaunch with -DeploymentTarget local afterwards; note this in the steward doc. |

**W2 total: 365** — blocker 0, major 130, minor 195, polish 40.

---

## W3 — After round one (T2 / cut) — 100 findings

### W3 · L0.1 Build & configuration (iOS, agent) — 4 findings

_count: 4 · blocker 0 · major 0 · minor 0 · polish 4_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A2-22` | T2/polish | S | Two assets both named AppIcon; the empty .appiconset is a live trap (the .icon is what actually compiles) | Patina/Assets.xcassets/AppIcon.appiconset/Contents.json vs Patina/Resources/AppIcon.icon/ | Delete Patina/Assets.xcassets/AppIcon.appiconset entirely and keep ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon pointing at the .… |
| `A2-28` | T2/polish | S | Test-target bundle ids use a misspelled, different reverse-DNS root | project.pbxproj :795, :817 (com.middlewesetstudio.PatinaTests); :836, :858 (com.middlewesetstu… | Rename to cloud.patina.app.tests / cloud.patina.app.uitests. Cosmetic (test bundles are never uploaded) but it appears in every x… |
| `G-13` | T2/polish | M | Design-kit font bundle embedded twice (app + widget), duplicating ~1.4 MB of TTFs | Patina.app/PatinaDesignKit_PatinaDesignKit.bundle/ and Patina.app/PlugIns/PatinaWidget.appex/P… | Have the widget link the app's copy of the resource bundle, or ship the widget a trimmed face set — a widget needs one or two wei… |
| `G-14` | cut/polish | L | App declares no App Intents / App Shortcuts | build transcript, research/G-unit.log:23009 | Out of scope for a polish pass — record it as a deliberate decision rather than an omission. It becomes required the moment the w… |

### W3 · L0.2 Production backend (Kody-run; agent prepares and probes) — 4 findings

_count: 4 · blocker 0 · major 0 · minor 3 · polish 1_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-12` ⇢L1-B | T2/minor | M | increment_scan_upload_attempt RPC does not exist on Strata and is in no pending migration | Services/Sync/RoomScanSyncService+AdvancedBundle.swift:649; pg_proc | Write the migration (mirror mark_scan_upload_complete's shape and grants: anon+authenticated EXECUTE, non-DEFINER) or drop the ca… |
| `A3-24` ⇢L1-B | T2/minor | M | Guest browsing writes to production: get_recommendations inserts a match_events row per anon call | public.get_recommendations / get_aesthete_matches (both SECURITY DEFINER, anon EXECUTE granted) | Acceptable by design for telemetry, but add a rate limit or sampling gate before a public TestFlight — an anon caller with the sh… |
| `A3-26` | T2/minor | L | 21 SECURITY DEFINER views, one RLS-disabled public table, and leaked-password protection off | get_advisors(security) — 1,207 lints | Not first-round visible, but _comms_backfill_legacy_map and the anon-executable share/revoke room-scan functions deserve a look b… |
| `A3-27` | T2/polish | L | Every RLS policy on every table the app reads re-evaluates auth.uid() per row | get_advisors(performance) — 441 auth_rls_initplan + 1,147 multiple_permissive_policies | Wrap as `(select auth.uid())` in each policy and merge the duplicate permissive policies. One migration, after the catalogue seed… |

### W3 · L0.3 The room is not empty (content: Kody + Leah; agent builds the seeding/image pipeline) — 1 findings

_count: 1 · blocker 0 · major 0 · minor 1 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-20` | T2/minor | M | No vendor is is_patina_catalog and only one product is patina_managed — the buyability gate is structurally c… | public.products / public.vendors; create_direct_order body on Strata | Comes free with a real seeded catalogue (A3-01) — set patina_managed or flag the catalog vendor. Check before anyone turns the di… |

### W3 · L0.4 Help & tour content (Sanity; Kody authorizes the writes) — 1 findings

_count: 1 · blocker 0 · major 0 · minor 1 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-09` | T2/minor | M | 20 of the app's 36 iOS help surface keys have no Sanity document | Features/Help/SurfaceKeys.swift vs Sanity kv3qrinl/production _type=="helpContent" | Author the 20 missing documents, or make the '?' affordance hide itself when the fetch returns nil so a tester never taps into an… |

### W3 · L0.5 App Store Connect (Kody-run; agent drafts every text) — 1 findings

_count: 1 · blocker 0 · major 0 · minor 0 · polish 1_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A2-26` | T2/polish | S | LSApplicationCategoryType (shopping) disagrees with the ASC category (Lifestyle) | project.pbxproj INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.shopping"; ASC… | Align the plist key to public.app-category.lifestyle, and set a secondary ASC category (Shopping is the obvious one) since only t… |

### W3 · L1-A Welcome, sign-in, onboarding — 11 findings

_count: 11 · blocker 0 · major 2 · minor 6 · polish 3_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-71` | T2/major | M | Google sign-in asks the user to trust a raw backend hostname | Continue with Google → ASWebAuthenticationSession consent; shots/A/33-google-real.png | Configure a Supabase custom auth domain (auth.patina.cloud) so the consent dialog names the brand. |
| `C3-07` | T2/major | L | Onboarding illustrations are self-declared placeholders — coloured rectangles on the first three screens afte… | Features/Onboarding/Views/OnboardingFlowView.swift:224 (`// MARK: - Illustrations (placeholder… | Produce three real illustrations (or photography, or a deliberately typographic treatment). Nothing here is salvageable by tokens… |
| `C1-41` | T2/minor | S | The style conversation dead-ends silently if both scoring engines fail | Features/StyleConversation/ViewModels/StyleConversationViewModel.swift:216-241 | An else branch that surfaces a retry, or make the local engine non-throwing. |
| `C1-44` | T2/minor | S | Onboarding completion and the quiz's saved progress are device-global and survive sign-out | App/Coordinators/AppCoordinator.swift:267; Services/Auth/AuthService.swift:479-497; Core/Persi… | Scope both keys per-user, or clear them alongside LocalStoreReset.wipeUserScopedData(). |
| `C4-10` | T2/minor | S | QR approval overlay prints the server's and LocalAuthentication's own words | apps/mobile/Patina/Patina/Features/QRAuth/Services/QRAuthService.swift:225,234-235 → Features/… | Map to app-authored sentences per QRAuthError case; never interpolate a thrown error or a server field. |
| `C6-14` | T2/minor | M | Status colours are decorative rather than legible | PatinaColors.swift:46-66; consumed at Features/Account/AccountView.swift:192 (terracotta "Dele… | Add darker on-light variants of the four status tokens; keep the current values for fills only. |
| `C6-30` | T2/minor | S | AccountView — label/value rows unpaired, headings untagged, zero labels | Features/Account/AccountView.swift:221-227 (sectionHeader), :229-240 (infoRow), :161-180 ("Sig… | Combine each infoRow, tag section headers .isHeader, label the QR row. |
| `P-17` | T2/minor | M | The quiz asks a stranger for their budget as question 4 of 5, before showing a single product | shots/P/12-style-q4.png | Move the budget question after the first browse, or make it skippable with "Not sure yet". |
| `B-46` | T2/polish | S | Account shows the email address where the display name belongs | Account — shots/B/59-account-signedin.png | Show the display name under the avatar and keep the email in its row. |
| `C5-33` | T2/polish | S | The 'use a different email' affordance renders three ways in one flow, one with a raw arrow character | AuthenticationView.swift:294, 400, 492 | One label, one treatment; use a chevron.backward symbol if a direction cue is wanted. |
| `P-32` | T2/polish | S | iOS offers "Save Password?" after a sign-in that failed | shots/P/34-cancel-from-password.png | Only signal a credential to AutoFill after the sign-in succeeds. |

### W3 · L1-B Data, persistence, resilience — 11 findings

_count: 11 · blocker 0 · major 1 · minor 4 · polish 6_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `B-30` | T2/major | L | Three unrelated UIs exist for creating a room | shots/B/40-manual-room.png, 44-room-gear.png, 77-scan-fallback.png | Collapse to one room-attributes component reused by create, edit and the scan fallback. |
| `A1-15` | T2/minor | S | Nine LiDAR-only scan screens are unreachable on a Simulator and on non-LiDAR iPhones | apps/mobile/Patina/Patina/Features/RoomScan/Views/QuietConversationFlowHost.swift:145-153 (boo… | No code fix — a program note. (a) A non-LiDAR tester's whole 'add a room' experience is one typed form, which the visual/copy lan… |
| `C1-21` | T2/minor | S | Sign-out never clears the navigation stack, so the next account remounts the previous one's screen | App/Coordinators/AppCoordinator.swift:206-230,276-280 (only :330 and :694-698 reset the path,… | Clear navigationPath and pop every tab to root inside beginSplashTransition(). |
| `C7-23` | T2/minor | S | DateFormatter constructed per list row and per body evaluation | Features/Collections/Views/SavedRowMeta.swift:20-26; Features/Shared/DateDisplay.swift:26-30;… | static let cached formatters — the codebase already does this correctly elsewhere. |
| `C7-24` | T2/minor | S | isSyncing is cleared by the first of up to ten concurrent bundle uploads | apps/mobile/Patina/Patina/Services/Sync/RoomScanSyncService+AdvancedBundle.swift:77-79 | Use a counter, or derive the flag from the RoomScanPackage rows. |
| `C1-38` | T2/polish | S | SplashView.onComplete is dead and ContentView's comment describes behaviour that does not exist | Features/Splash/Views/SplashView.swift:16,55-59; ContentView.swift:27-34 | Drop the parameter and the comment. |
| `C2-24` | T2/polish | S | reloadTimelines fires on every record save, including when house-widget is off | apps/mobile/Patina/Patina/Core/Persistence/RecordSnapshotStore.swift:98-124,134-150,217-226 | guard flagIsOn() else { return } around the reload calls. |
| `C7-29` | T2/polish | S | A detached Task per telemetry event for the PostHog mirror | apps/mobile/Patina/Patina/Services/Analytics/DailyRoomBatchQueue.swift:55-61 | Batch the PostHog mirror alongside the existing 30 s flush instead of one task per event. |
| `C7-30` | T2/polish | S | Two remaining .first! force unwraps on FileManager.urls(for:in:) | Services/Analytics/DailyRoomBatchQueue.swift:22; Services/Companion/ConversationStorageService… | Guard and degrade to a no-op store. |
| `P-38` | T2/polish | S | A ~450-line CoreData error dump on every first install, and session lookup logged at error level | research/P-log-launch.txt lines 91-529 | Create the App-Group Application Support directory before opening the store; log the expected no-session case at debug. |
| `C7-22` | cut/polish | S | The app's only two print( call sites, in the scan instrument path | apps/mobile/Patina/Patina/Features/Walk/Services/RoomCaptureService+Instrument.swift:116,123 | None required. Leave as-is or route through a DEBUG-only logger helper. |

### W3 · L1-C Layout, Companion, Dynamic Type — 33 findings

_count: 33 · blocker 0 · major 1 · minor 13 · polish 19_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C6-10` | T2/major | L | Half the control-bearing view files carry no accessibility label at all | 61 of the 125 files that contain an interactive control | Treat as a labelled work item per feature rather than one sweep; Authentication, Rooms, ARPlacement, Account and Settings first. |
| `A-27` | T2/minor | S | "Tune this" has the accessible name "Tune your taste portrait" and a pop-up-button role | Style reveal; describe_screen StyleResultView.TuneButton | Make the accessible name start with the visible title, and use the role that matches the presentation. |
| `A1-01` | T2/minor | S | Route .roomSavedItems has no screen door — Companion-only | apps/mobile/Patina/Patina/Features/Companion/Services/CompanionAreaBuilders.swift:164 (sole ca… | Add a row to RoomProjectView's items header: 'N saved in this room ->'. |
| `A1-17` | T2/minor | S | navigate(to: .designerConsultation) is silently rewritten to a different destination | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:293-304 | Correct behaviour (SP-07), wrong label — have the empty states read the same DesignHelpDestination and print 'See your design req… |
| `C-08` | T2/minor | S | Settings row icons are focusable and labelled with raw SF Symbol names — "hand.tap", "circle.lefthalf.filled"… | Settings sheet AX tree; shots/C/29-dark-settings.png | .accessibilityHidden(true) on all decorative row icons; make the row a single accessibility element combining label + switch valu… |
| `C-10` | T2/minor | S | Every product card is announced as a "pop up button", and its rotor actions duplicate ("Save" and "Save to fa… | Browse grid AX tree; shots/C/11-dark-browse.png | Use .isButton, drop the duplicate Save action, and expose the heart's saved/unsaved state as an AXValue. |
| `C6-05` | T2/minor | M | VoiceOver focus is never managed — accessibilityFocused appears 0 times in 66k LOC | whole app — `grep -rn 'accessibilityFocused' Features Design` returns 0 hits | Add @AccessibilityFocusState to the sheets and pushed screens that matter most (auth, purchase, scan review) and focus the title/… |
| `C6-06` | T2/minor | M | The app speaks to VoiceOver exactly once in the entire codebase | only Features/RoomScan/Views/ScanWalkView.swift:127 — UIAccessibility.post(notification: .anno… | Announce transient confirmations and errors — one shared helper called from the toast, error-state and banner views. |
| `C6-07` | T2/minor | M | 27 of 28 pushed screens have no title and no navigation bar, so VoiceOver has no screen heading | Design/Components/PatinaScreenChrome.swift:50 (patinaScreen(title:style:)) and :70 (.toolbar(.… | Pass the canonical screen name to patinaScreen on every call site and give the rendered title .accessibilityAddTraits(.isHeader). |
| `C6-09` | T2/minor | M | Icon-only controls with no accessibility label | Features/ARPlacement/Views/ARPlacementView.swift:35, 57, 132, 140, 165 (six floatingButton(ico… | Add .accessibilityLabel (and a hint where the destination is non-obvious) to each. |
| `C6-19` | T2/minor | M | 127 raw .font(.system(size:)) calls, one with a comment that misstates the behaviour | 127 sites across Features/Design; the misleading one is Features/Help/Views/HelpInfoIcon.swift… | Use .imageScale / a relative Font for symbols, and a PatinaTypography token for the Text cases; correct the HelpInfoIcon comment. |
| `C6-20` | T2/minor | S | lineLimit(1) on user-authored content | Features/Messaging/Views/ThreadListView.swift:153 (thread title) and :157 (message preview); R… | Raise to lineLimit(2)+ on user content, or drop the limit and let the row grow. |
| `C6-26` | T2/minor | S | Settings rows announce their decorative icon and their chevron | Features/Settings/Views/SettingsView.swift:357-391 (settingsRow), :393+ (settingsToggleRow), :… | Hide both images and combine the row into one element. |
| `C9-13` | T2/minor | S | ProfileView room cards keep a 140 pt hero even in the full-width accessibility layout | Features/Profile/Views/ProfileView.swift:362 (used by :286; card frame at :305-306) | Thread `wide` into RoomCardHeroImage (.frame(maxWidth: wide ? .infinity : 140, …)). |
| `A-40` | T2/polish | S | Scrolling content is hard-clipped under the pinned filter bar | Browse pieces; shots/A/16-browse-scroll2.png | Add a material or gradient mask behind the pinned chip row. |
| `A1-05` | T2/polish | S | .emergence(pieceId:) non-nil arm is dead code, duplicated in both roots | apps/mobile/Patina/Patina/ContentView.swift:291-297 and Features/Navigation/HouseFirstRoot.swi… | Collapse .emergence to a payload-free case, or delete the branch in both dispatchers. |
| `A1-08` | T2/polish | S | Two orphan views still compile with no mount (AddedToRoomToast, DesignRequestResumeBanner) | apps/mobile/Patina/Patina/Features/Home/Views/AddedToRoomToast.swift:8; apps/mobile/Patina/Pat… | Delete both, or mount AddedToRoomToast on the add-to-room success path — the 'added to {room}' confirmation currently has no UI. |
| `A1-16` | T2/polish | S | Load-bearing comment is now false: 'the Companion's Saved row is the only route to Saved' | apps/mobile/Patina/Patina/Features/Companion/Services/CompanionActionRows.swift:258-264 | Update the comment when A1-04 is fixed. |
| `B-42` | T2/polish | S | Every grouped Settings card draws a trailing hairline below its last row | Settings sheet — shots/B/21-guest-settings.png, 22-guest-settings-bottom.png | Draw separators between rows only (skip the last index). |
| `C-33` | T2/polish | M | The tab bar ignores Dynamic Type entirely | shots/C/54-flagson-ax3xl-tabbar.png | Adopt the system tab bar, or add a large-content viewer for the custom one. |
| `C3-09` | T2/polish | S | The same `chevron.right` is drawn eight different ways across 20 sites — sizes 11-14, weights regular-semibol… | ProfileView.swift:296(11),:329(13); ProductCard.swift:140(12 medium); StudioHubView.swift:286,… | One `patinaDisclosure()` modifier wrapping Image(systemName:"chevron.right") with a single PatinaTypography font and weight. |
| `C3-19` | T2/polish | M | Motion has no vocabulary: 34+ curve specs and 9 spring configurations against 2 named tokens | App-wide; the only named tokens are Design/Animations/PatinaTransitions.swift:14,18 plus the s… | Four named curves (patinaHero, patinaChrome, patinaSnap, patinaSettle) and a sweep. |
| `C3-32` | T2/polish | S | Companion progress shell's hit region does not match its drawn shape | Features/Companion/Components/CompanionHearthView.swift:212,219 | Pass the same computed radius into contentShape. |
| `C4-27` | T2/polish | S | Purchase responsibility terms fail silently to .unknown | apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:140 and Feature… | Surface the unknown state ("We couldn't load the delivery terms — try again") rather than rendering a screen with a missing parag… |
| `C5-27` | T2/polish | S | A 'Coming soon' stub with a hammer icon still ships in the Release binary | apps/mobile/Patina/Patina/Features/Help/Views/HelpPanelSheet.swift:227-278 | Delete the view with its test; the panel's inline-answer row replaced it. |
| `C5-34` | T2/polish | S | taxShippingDisabled says 'yet' twice in one sentence | apps/mobile/Patina/Patina/Features/Purchase/OrderFailureCopy.swift:172-173 | "Delivery and tax aren't set up for this piece yet, so we can't take payment on it." |
| `C6-37` | T2/polish | S | Reduce Transparency is not handled anywhere, and one site actively defeats it | accessibilityReduceTransparency: 0 occurrences app-wide. 11 files use glassEffect/.ultraThinMa… | Drop the .opacity(0.5) on the material and, on the two browse-card buttons, branch to an opaque fill when accessibilityReduceTran… |
| `C6-39` | T2/polish | S | The hand-rolled tab bar gives no positional context and no per-item identifiers | Features/Navigation/PatinaTabBar.swift:82-117 | Add .accessibilityValue("Tab \(index + 1) of \(PatinaTab.allCases.count)") and an identifier per item. |
| `C6-42` | T2/polish | S | The accessible-gesture work from PT-2-4 guards dead code | Design/Gestures/HoldGesture.swift:143-155 (.holdable), Design/Gestures/LingerGesture.swift:125… | Delete or explicitly park the unused gesture modifiers so the directory stops implying coverage. |
| `C6-47` | T2/polish | S | HelpTooltip triggers are tap gestures wearing a button trait | Features/Help/Views/HelpTooltip.swift:108-111, with the trait supplied by the caller at Featur… | Wrap the trigger in a real Button, keeping the existing label, hint and 44pt frame. |
| `C7-20` | T2/polish | M | Cold-launch request fan-out: roughly a dozen PostgREST round trips before Today settles | Features/Home/Views/DailyRoomView.swift:101-135 (six concurrent .task blocks); PatinaApp.swift… | Sequence the non-urgent reads behind the record paint; consider one composed read for the badge counts. |
| `C9-16` | T2/polish | S | PatinaTabBar's four-word row is arithmetically sized for a 402 pt screen | Features/Navigation/PatinaTabBar.swift:53-70,93-101 | Derive the trailing slot and side padding from the container width, or drop the AX cap to accessibility1 on narrow widths. |
| `C6-22` | cut/polish | L | Adaptive layout is used in one feature only | ViewThatFits appears 3 times, all in Features/Companion/Components/CompanionHearthView.swift:2… | Adopt ViewThatFits on the action bars and chip rows called out in C6-17/C6-18 first. |

### W3 · L1-D Tokens, dark mode, contrast, iconography — 11 findings

_count: 11 · blocker 0 · major 1 · minor 2 · polish 8_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C3-11` | T2/major | L | The design system is largely unadopted: 4 of 13 published components have zero call sites while 111 card surf… | PatinaDesignKit/Sources/PatinaDesignKit/Components/{PatinaCard,MatchPill,PatinaSheetHeader,Cla… | Not itself a TestFlight blocker — it is the root cause of C3-01/05/09/12/22. Track as the follow-on program and fix the tester-vi… |
| `C-07` | T2/minor | M | Bold Text and Increase Contrast have no effect on the app at all | shots/C/40-reducemotion-today.png vs 41-a11ytoggles-today.png; crop-boldtext-compare.png | Add @Environment(\.colorSchemeContrast) and \.legibilityWeight branches to the colour and font tokens; add \.accessibilityReduceT… |
| `C3-12` | T2/minor | L | No radius, padding or button-height scale: 18 distinct raw corner radii, 823 raw paddings, six button heights | App-wide; scale defined at PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaSpacing.swift:… | Ratify a 4pt spacing scale and a 4-step radius scale, then sweep. Large but mechanical. |
| `A-69` | T2/polish | S | ↗ (open-externally) is used as a navigation chevron | Home NEXT MOVE card, Room Settings CTA; shots/A/27-guest-home.png, 72-room-settings.png | chevron.right for in-app navigation; reserve arrow.up.right for links that leave the app. |
| `C1-42` | T2/polish | S | Dead code in the auth button component | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:135-179 | Remove both, or wire iconImage up as part of C1-24. |
| `C3-20` | T2/polish | S | Reduce Motion honoured in 23 of 36 animating files; PressableButtonStyle's scale and the root phase transitio… | ContentView.swift:81; Design/Gestures/LingerGesture.swift; Design/Gestures/HoldGesture.swift;… | Gate the scale effects in PressableButtonStyle and VisualResonanceView on accessibilityReduceMotion. |
| `C3-21` | T2/polish | M | Five separator mechanisms; hand-rolled 1pt hairlines are 3x the weight of a system separator on @3x | 38 sites of Rectangle().fill(PatinaColors.pearl).frame(height: 1); 10 Divider(); SettingsView.… | One patinaSeparator() at 1/displayScale on a dynamic token; retire the other four. |
| `C5-31` | T2/polish | S | PatinaAsyncImage's VoiceOver copy is developer register, and one hint is an empty string | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:92-93 | "Photo didn't load"; omit the empty hint. |
| `GAP7B-14` ⇢L1-C | T2/polish | S | Proposal SELECTIONS rows: five identical placeholder glyphs and uneven row heights | Proposal detail selections list (Features/Proposals) | Product thumbnails (or a smaller mark), and rows that size to their content. |
| `L07-10` | T2/polish | S | Decision state uses red and green (VISION §6) — flagged for a ruling, not asserted as a defect | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift (the responded con… | Kody's ruling first. If the tokens are not an exception, carry the meaning in a word rather than a hue. |
| `L07-11` | T2/polish | S | The first-launch tour's Skip and Next are system blue on a warm palette | the hoisted tour popover on Today (Features/Help/** / the tour host) | Set the popover's .tint to the palette's interactive token. |

### W3 · L1-E Copy — 10 findings

_count: 10 · blocker 0 · major 0 · minor 4 · polish 6_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C-36` | T2/minor | S | "More information available." is baked into non-interactive accessibility labels, and duplicated on two overl… | Studio/profile hub AX tree; shots/C/16-dark-studio.png | Remove the promise from labels that carry no action; hide the sparkle; drop the caps. |
| `C5-24` | T2/minor | S | Two British spellings in shipped copy ('cancelled', 'catalogue') in a US-priced, en-only app | Features/Purchase/OrderFailureCopy.swift:138; Features/Purchase/BuyabilityGate.swift:93; statu… | 'canceled' / 'catalog'. |
| `C5-25` | T2/minor | S | Four ad-hoc date formatters are missing the locale pin the codebase's own rule requires | DailyRoomViewModel.swift:115-119 ('EEEE · MMM d'); ProfileView.swift:26-30 ('MMM d'); Core/Mod… | Pin en_US_POSIX on the four, or move them onto DateDisplay. |
| `C7-27` | T2/minor | S | NetworkError is effectively dead and its descriptions are developer copy | apps/mobile/Patina/Patina/Core/Network/NetworkError.swift:22-43 | Delete it, or give it Patina copy before it acquires readers. |
| `C-56` | T2/polish | S | Mixed capitalisation within single lists, and mono numerals use a slashed zero | shots/C/29-dark-settings.png, 28-dark-profile-bottom.png, 09-dark-spaces.png | Pick sentence case throughout; consider a non-slashed zero for client-facing numerals. |
| `C4-26` | T2/polish | S | Documents open-failure alert repeats its own message, and is the app's only error alert | apps/mobile/Patina/Patina/Features/Documents/DocumentListView.swift:36-46 | Make it an inline row-level failure, or drop the duplicated title. |
| `C5-29` | T2/polish | S | Sign-out alerts use the button label as the title and spend the body on boilerplate | SettingsView.swift:192-198; AccountView.swift:57-62 | 'Sign out of Patina?' / "You'll need to sign in again to see your rooms and saved pieces." |
| `C6-46` | T2/polish | S | MoveOrCopyItemSheet and ManualRoomEntryView speak arrows and multiplication signs | Features/Rooms/Views/MoveOrCopyItemSheet.swift:123-155 and Features/Rooms/Views/ManualRoomEntr… | Hide both glyphs and label the destination rows "Move to <room>". |
| `GAP1B-20` | T2/polish | S | The defer sheet mixes dash styles inside one generated sentence | DecisionDeferral.draft(decisionTitle:), rendered at DecisionDeferSheet.swift:76-78 | Quote the title, or normalise the separator. |
| `GAP1B-21` ⇢L1-D | T2/polish | S | The pre-drafted defer note does not read as editable | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDeferSheet.swift:40-48 | Give the editor a field treatment (border/focus ring) and a one-line hint such as "Edit before you send." |

### W3 · L1-F Notifications, messaging, widget, deep links — 12 findings

_count: 12 · blocker 0 · major 0 · minor 7 · polish 5_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C1-31` | T2/minor | S | A QR deep link silently ejects a guest to the welcome screen | App/DeepLinking/DeepLinkHandler.swift:163-169 | Raise presentedSheet = .auth over the current screen (the AuthSheet pattern U21 established) instead of changing the phase. |
| `C2-08` | T2/minor | S | No app-icon badge in either direction, yet .badge is requested from the user | apps/mobile/Patina/Patina/App/AppDelegate.swift:173; Patina/Services/API/PushTokenService.swif… | Either drop .badge from both the authorization and presentation options, or send aps.badge = attentionCount and clear with setBad… |
| `C2-10` | T2/minor | S | APNs token is not uploaded when a session starts without a background/foreground cycle | apps/mobile/Patina/Patina/Services/API/PushTokenService.swift:130-139,172-185; Patina/PatinaAp… | Call reregisterIfAuthorized() from the auth-state observer the coordinator already runs, or re-attempt the deferred upload from A… |
| `C2-14` | T2/minor | S | Fonts are re-registered inside every widget entry-view init | apps/mobile/Patina/PatinaWidget/HouseWidgetViews.swift:24-27; PatinaWidget/PatinaWidgetBundle.… | Delete the call in init; the bundle's registration already covers the extension process. |
| `C2-16` | T2/minor | S | VoiceOver reads a fabricated arrival time on composed Studio-fallback rows | apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:302-313 vs :… | `if !notification.isStudioFallback { parts.append(notification.timeAgo) }`. |
| `C2-20` | T2/minor | S | An associated https link the router cannot map opens the app and does nothing | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:60-111,217-241; Patina/PatinaA… | When handle returns false for an https URL on the claimed host, open it with UIApplication.shared.open, or route to a "we couldn'… |
| `L07-08` | T2/minor | S | A responded decision stays in the notification feed as 'A decision needs you' | apps/mobile/Patina/Patina/Features/Notifications/** (the feed), fed by the notification rows t… | Mark the decision's notification read (or hide it) when apply_client_decision succeeds. |
| `C2-13` | T2/polish | S | The circular Lock Screen widget carries no information at all | apps/mobile/Patina/PatinaWidget/HouseWidgetViews.swift:178-188 | Drop .accessoryCircular from supportedFamilies, or draw the count/date of the newest MOVED row. |
| `C2-18` ⇢L1-C | T2/polish | S | DecisionPushHandler is dead code shipped in the binary | apps/mobile/Patina/Patina/Features/Decisions/DecisionPushHandler.swift:18-24 | Delete it, or wire it into PatinaAppDelegate and delete the note. |
| `C2-25` | T2/polish | S | Pushes carry no thread-id, category or actions | supabase/functions/apns-send/core.ts:60-73; apps/mobile/Patina/Patina/App/AppDelegate.swift:14… | Send thread-id: <project_id> and a category per entity type; register matching categories with one action each at launch. |
| `C9-14` | T2/polish | S | Message bubbles capped at a hard 280 pt regardless of screen width or text size | Features/Messaging/Views/ThreadDetailView.swift:209 (with Spacer(minLength: 48) at :192,211) | containerRelativeFrame(.horizontal) { w, _ in min(w * 0.78, 420) }, or drop the cap and rely on the 48 pt spacer. |
| `GAP7B-07` | T2/polish | L | Only the small family is offered; medium and large are greyed out in the iOS 26 icon menu | apps/mobile/Patina/PatinaWidget/HouseWidget.swift:23 — supportedFamilies([.systemSmall,.access… | Add .systemMedium — it also solves GAP7B-03 and gives room for two real rows with their own destinations. |

### W3 · L2-G Tests & gates — 1 findings

_count: 1 · blocker 0 · major 0 · minor 1 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C6-38` | T2/minor | M | accessibilityIdentifier coverage is thin and inconsistently named | 182 unique identifiers against 525 control occurrences. Zero in RoomScan (5,675 LOC / 41 contr… | Pick one convention, write it down, and add identifiers to the zero-coverage features that a walk must drive (RoomScan first). |

**W3 total: 100** — blocker 0, major 5, minor 42, polish 53.

---

## Assignment notes

Everything below is a judgement the collator made where the inputs were silent or in conflict. Nothing here
changes a finding's evidence; it records how each one got its `wave`, `lane` and `id`.

### 1. The GAP1 id collision (the one real trap)

`research/40-workflow-result.json` carries **17 confirmed `GAP1-NN` findings** from the FIRST GAP1 instance
(plus `GAP1-13`, refuted). `research/GAP1.md` on disk is the **resumed** instance's ledger and re-numbers its
own 21 findings `GAP1-01…GAP1-21`. **The two numbering schemes collide and mean different things** — json
`GAP1-01` is the Companion-orb overprint; ledger `GAP1-01` is the consent sheet's off-screen Approve/Cancel.

Resolution, following `PLAN-SKELETON.md` §3, which already calls the resumed lane's rows **`GAP1B-`**:

- Every judged json `GAP1-NN` keeps its id.
- Ledger rows with **no** json counterpart are folded in as **`GAP1B-NN`**, keeping the ledger's number
  (`ledgerId` in findings.json records the original label). 13 rows: `GAP1B-01, -02, -03, -04, -05, -07, -08,
  -09, -10, -14, -19, -20, -21`.
- Ledger rows that ARE already in the json were NOT re-added. Crosswalk (ledger → json):
  `GAP1-06 → GAP1-02` (consent shows no price) · `GAP1-11 → GAP1-07` ("Choose this" slab) ·
  `GAP1-12 → GAP1-06` (naked "Not yet" links) · `GAP1-13 → GAP1-03` (detent dead space) ·
  `GAP1-15 → GAP1-01` (orb over the Designer Seat) · `GAP1-16 → GAP1-09` (backdrop under the clock) ·
  `GAP1-17 → GAP1-08` (Companion promotes recommendations) · `GAP1-18 → GAP1-12` (definite-article room CTA).
- Ledger `GAP1-13` (the 40 % dead detent) is **not** the same as json refuted `GAP1-13` (cold launch shows the
  guest home). The refuted row stays out; the ledger row is folded in as json `GAP1-03`, which is confirmed.

**Decoding the skeleton's own `GAP1-` references** (§4 uses the ledger numbering throughout):
`GAP1-01/-02` → `GAP1B-01/-02`; `GAP1-03` (mid-word headline) → `GAP1B-03`; `GAP1-07/-08` (44 pt targets) →
`GAP1B-07/-08`; `GAP1-15` (orb inset) → json `GAP1-01`; `GAP1-18` (room CTA grammar) → json `GAP1-12`.

### 2. GAP7 — one entry per root cause

`research/GAP7.md` holds two instances: `GAP7-01…06` (judged, in the json) and `GAP7B-01…16` (ledger only).
Merged as instructed:

- `GAP7B-01` (gallery card is an empty state) folded into json **`GAP7-01`** — identical root cause
  (`context.isPreview ? nil` in `HouseWidgetProvider`). `GAP7B-01`'s extra observation (the preview's empty
  state is not vertically composed) is carried in the fix text.
- `GAP7B-10` (one cold link in five silently did nothing, confidence 0.5) folded into json **`GAP7-02`**
  (measured 8-run drop rate with the `coordinator?` nil mechanism).
- `GAP7-03` (link at the sign-in wall does nothing) and `GAP7-04` (cold tap loses the destination) folded into
  **`GAP7B-09`**, which covers all three shapes (warm signed-out, cold signed-out, queue never drains) and is a
  T0 major per skeleton §3. Their `mergedIds` are recorded on `GAP7B-09`; the persistence point from `GAP7-04`
  (`pendingDeepLink` is a single in-memory `URL?`) is folded into its fix. **This is the only place where a
  confirmed json row does not appear as its own entry** (629 = 607 − 2 + 13 + 11).
- `GAP7-05` (a row resolved since the widget write) kept separate from `GAP7B-05` (a row type that has no route
  at all): different fixes — acknowledge the fallback vs. exclude routeless rows from the projection.
- Excluded: `GAP7-06` (a json duplicate of `A-108`), `GAP7B-08` and `GAP7B-16` (both marked GOOD, not defects),
  `GAP7B-13` (explicitly "corroborations of findings other lanes already filed — do NOT double-count").

### 3. Tiers for the ledger-only rows

Skeleton §3 fixes seven of them: `GAP1B-01/-02` = T0 blockers; `GAP7B-02/-03/-04/-05/-09` = T0 majors.
For "the rest T1/T2 as written" the ledgers write severity, not tier, so severity was mapped
**major → T1, minor → T1, polish → T2** — the same shape the judged set uses. That puts `GAP1B-20`, `GAP1B-21`,
`GAP7B-07` and `GAP7B-14` in T2/W3 and the other nine in T1/W2.

Arithmetic check against the skeleton: T0 160 + 7 = **167**; T1 350 + 13 − 2 (the GAP7 merges) = **361**;
T2/cut 97 + 4 = **101**. Totals in this file match.

### 4. Wave rule, and why L0.x lanes appear in W2 and W3

Applied exactly as briefed: **T0 → W1**, or **W0** when the lane is one of L0.1–L0.6 (configuration, backend,
content, Sanity, ASC, PostHog); **T1 → W2**; **T2 and cut → W3**. Consequence: 26 T1/T2 configuration, backend
and content findings carry an `L0.x` lane in W2/W3 — the lane names the owner and the file set, the wave names
the round. There is no L0.x work in W2/W3 that must happen before build 1; if the program wants a hard "W0 is
everything Kody touches" rule instead, those 26 rows are the ones to promote.

### 5. Lanes the skeleton does not name an owner for

§4's owned-file sets do not cover `Features/Money`, `Invoices`, `Proposals`, `Orders`, `Purchase`, `Budget`,
`Projects`, `Profile`, `DesignServices`, `Documents`, `Recommendations`, `ARPlacement` — i.e. most of the Studio
and money surfaces, which round one is explicitly about. Rule used, consistent with how the skeleton itself
assigns (`A-90` "Pay" contrast → L1-D; `B-28` payment-failure layout → L1-C; `C4-09` design-request error text →
L1-E): **the concern decides the lane, the folder is the tiebreaker.**

- layout / Dynamic Type / sheet chrome / overlap / tap target → **L1-C**
- colour, contrast, dark mode, typography, iconography, imagery, money formatting → **L1-D**
- loading vs empty vs error, timeouts, decode, counts, sync, persistence → **L1-B**
- the words themselves → **L1-E**
- notifications, messaging, widget, deep links → **L1-F**

The same rule overrides file ownership on the quiz/reveal/onboarding surfaces (`Features/StyleQuiz`,
`StyleConversation`, `StyleReveal`, which L1-A owns): the skeleton itself sends `A-11` ("emoji out of the quiz")
to L1-D, so `GAP4-06/-10/-12/-15`, `GAP3-27` go to L1-D and `GAP4-18/-20/-28/-29/-34`, `C1-32` to L1-C, each with
L1-A in `alsoTouches`. Those lanes must trade integration notes, not files.

### 6. Findings named under two lanes in the skeleton

`A-80` (notifications empty state while loading) is listed under both L1-B and L1-F → primary **L1-F**
(it is the notifications screen), `alsoTouches` L1-B. `C9-05` (composer under the Companion dock) is under both
L1-C and L1-F → primary **L1-F**, `alsoTouches` L1-C. `alsoTouches` is populated for 104 findings in total, from
the skeleton's own cross-references plus the cases below.

### 7. Individual calls worth challenging

- **`G-02`** ("no gate builds Release") is a `tests-gates` finding but was moved to **L0.1 / W0**: the skeleton
  puts "add `release` and `archive` tiers to `ios-gate.sh`" in L0.1, and it gates every other W0 item.
  `alsoTouches` L2-G. It is the only T0 that left L2-G; L2-G is otherwise a pure W2 lane (7 findings).
- **`GAP1B-01/-02` vs json `GAP1-03`** share one root cause (`.presentationDetents([.medium, .large])` on both
  decision sheets) but are kept apart: `GAP1-03` is 40 % dead space at default size (T1), `GAP1B-01/-02` are
  unreachable Approve/Cancel/Send at accessibility sizes (T0 blockers). One fix closes all three.
- **`GAP1B-19` and `R-19`** are the same SettingsService log noise found twice; both kept, cross-noted, fix once.
- **`A-101`** (delete-account copy) and **`C1-30`** (Privacy/Terms same page) carry `area: prod-readiness` but the
  skeleton assigns them to L1-A, so they are **W1**, not W0. Their App-Review consequence is real; if the program
  wants them read as review blockers they belong beside `A2-04`/`A2-05` in L0.5.
- **`A3-21` / `A3-22`** (category vocabulary, `published_at` / `quality_score` NULL) were routed to **L0.3**, not
  L1-B: the skeleton's L0.3 definition already requires "category in the app's vocabulary", `published_at` and
  `quality_score` on the seeded pieces. `alsoTouches` L1-B, because the app-side normalisation is the hedge if
  content slips.
- **`A4-12`** (PostHog flags never targeted) is the only **L0.6** finding; `A2-15`/`A2-16` (kill-switch, error
  tracking) stayed in L0.1 because the skeleton lists them there, with L0.6 in `alsoTouches`.
- **`GAP8-01…12`** are production-emptiness findings whose `where` is app code. They stayed in the app lanes with
  `L0.2`/`L0.3`/`L0.4` in `alsoTouches`; none of them is fixable by code alone.
- **The GAP5 set (13 findings)** is iPad/landscape geometry. All are T1 → W2, but **decision D4 (drop the iPad
  family) makes most of them moot**; the 11 geometry rows carry `alsoTouches: L0.1` (`GAP5-05` is filed to L0.1
  outright, and `GAP5-17` is a room-count mismatch, not geometry). If D4 lands, W2 should re-check them
  before scheduling. `GAP5-05` is a reconciliation, not a defect (it refutes `A2-11`'s premise) and was filed to
  L0.1 alongside `C9-07`, which says the same thing.
- The three `cut` rows (`C6-22`, `C7-22`, `G-14`) are kept and render in W3 alongside T2.
- Ten "dead code / stale comment" findings (`A1-05`, `A1-08`, `A1-09`, `A1-16`, `C1-29`, `C1-38`, `C1-42`,
  `C2-18`, `C5-27`, `C9-19`) are not tester-visible; they are filed by the file they live in, all T1/T2.

### 8. Lanes `kody` and `content` are unused

Every Kody-run item mapped cleanly onto L0.2 (production DB / edge functions), L0.5 (App Store Connect) or L0.6
(PostHog), and every content item onto L0.3 (catalogue, editorial) or L0.4 (Sanity help and tour). Those five
lanes ARE the Kody/content lanes, so a parallel `kody`/`content` bucket would only have split the same work in
two. No finding needed either label.

### 9. The "AI" sweep (VISION §6) — clean, no VIS-01 filed

Case-sensitive `AI` as a word, plus `A.I.`, `artificial intelligence`, `machine learning`, `GPT`, `Claude`,
`LLM`, `the model`, across `research/C5-strings.txt` (the C5 user-facing string inventory, 303 KB) and every
Swift source under `apps/mobile/Patina` (including `PatinaWidget`, `PatinaWidgetShared`, `PatinaDesignKit`),
plus `Info.plist` and `Patina/Resources`:

- `C5-strings.txt`: **zero** occurrences of `AI` as a word, `A.I.`, `artificial intelligence`, `machine
  learning`, `GPT`, `Claude` or `LLM`. One `the model` hit (line 534) is the extracted text of a code comment in
  `Features/Walk/Services/RoomCoverageCoach.swift:18`; the other `the model` lines the grep returns from that
  inventory are `FulfillmentAPIClient.swift` string fragments the pattern straddles, not sentences.
- Swift sources — **8 hits for `AI`, all `//` or `///` comments, none user-visible**:
  `Features/Messaging/ViewModels/MessagingViewModel.swift:6` · `Features/Messaging/Views/ThreadDetailView.swift:6` ·
  `Features/Conversation/Models/ConversationState.swift:43` · `Features/Companion/ViewModels/CompanionViewModel.swift:383` ·
  `Services/Companion/CompanionService.swift:5, :18, :33, :74`.
- `Claude` — **2 hits, both doc comments** on an optional API key:
  `App/Configuration/Secrets.example.swift:26` and `App/Configuration/Secrets.swift:26`.
- `the model` — 26 hits, all comments about SwiftUI/`@Model` view models (`FirstLaunchTour.swift`,
  `RoomHeroCard.swift`, `CompanionCoachingModel.swift`, the PatinaTests suite, …).
- Zero hits in `Info.plist`, `Patina/Resources`, or `PatinaDesignKit`.

**No user-visible occurrence exists, so `VIS-01` was NOT created.** Two caveats for the program: the sweep covers
compiled strings only — the Sanity-hosted tour and help copy (`C5-01`, `A4-01`, `GAP8-05`, `C5-02`) is authored
outside the repo and must be re-checked at L0.4 publish time; and `CompanionService.swift:33/:74` show the app
deliberately withholds fabricated Companion answers from guests, which is the behaviour the vision asks for —
worth keeping when L1-E rewrites Companion copy.
