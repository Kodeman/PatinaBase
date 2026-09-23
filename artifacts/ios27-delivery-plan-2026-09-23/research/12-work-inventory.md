# Work inventory — iOS 27 delivery program, phases 0–5

Compiled 2026-09-23 against the working tree at `/Users/kody/Code/patina-merged` (branch `main`,
tip `2a51ab9f7`). Every file path below was opened or `grep`-verified first-hand while writing this
document; line numbers are as of that tip and will drift.

Source material: `artifacts/ios27-opportunities-2026-09-23/deck/index.html` (18-section decision
deck), `research/09-fable-redteam.md`, `research/08-astra-challenge.md`, and the four evidence
reports beside them.

## Standing decisions that shape this inventory

1. **No feature flags. None. Anywhere.** Both apps are TestFlight-only. No item below proposes flag
   gating, staged rollout, or a kill switch. Where the deck said "flag-gated", the flag is removed
   and replaced by a named verification gate.
2. **Make the breaking change now.** Renames, schema rewrites, target-structure changes and
   toolchain moves are cheaper today than they will ever be again. Where an incremental and a
   correct end state diverge, the item below specifies the correct end state.
3. Scope is the **iOS applications**. Server and portal work appears only in the `X-*` upstream
   block, owned by a non-iOS team, and is named as a dependency where an iOS item needs it.

## Size key

`XS` ≤ half a day · `S` 1–2 days · `M` 3–5 days · `L` 1–2 weeks (one lane).

## Verification vocabulary

Named once, referenced by handle throughout. **A green gate is the acceptance evidence for the
item; no item is done on a screenshot.**

| Handle | Command |
|---|---|
| `FIELD-GATE` | `apps/mobile/Capture/scripts/capture-gate.sh all` — regenerates the project, builds the app for `iPhone 17`, runs the `CaptureKit` scheme (which hosts `CaptureTests`), `swiftlint --strict`, the FC-R3 forbidden-word sweep and the Principle-4 sweep |
| `FIELD-UI` | `ruby apps/mobile/Capture/scripts/generate_project.rb && xcodebuild test -project apps/mobile/Capture/Capture.xcodeproj -scheme Capture -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:CaptureUITests CODE_SIGNING_ALLOWED=NO` |
| `FIELD-RELEASE` | `ruby apps/mobile/Capture/scripts/generate_project.rb && xcodebuild build -project apps/mobile/Capture/Capture.xcodeproj -scheme Capture -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO` |
| `FIELD-ARCHIVE` | `apps/mobile/Capture/scripts/archive-testflight.sh` |
| `PATINA-GATE` | `IOS_GATE_UDID=<lane clone udid> apps/mobile/Patina/scripts/ios-gate.sh all` (build + `PatinaTests` + lint-delta) |
| `PATINA-UI` | `IOS_GATE_UDID=<lane clone udid> apps/mobile/Patina/scripts/ios-gate.sh ui` |
| `PATINA-RELEASE` | `apps/mobile/Patina/scripts/ios-gate.sh release` |
| `DEVICE` | A physical-device pass per `.claude/skills/patina-ios-verification`. Simulator-green is not acceptance for camera, ActivityKit, APNs, Control Center or on-device speech. |

**Two standing gate defects, relevant to several items below.**

- `FIELD-UI` is **not** part of `FIELD-GATE`. `capture-gate.sh test` runs the `CaptureKit` scheme
  only (`scripts/capture-gate.sh:22`); `CaptureUITests` runs through the `Capture` scheme and is in
  neither `all` nor CI. `CaptureUITests/` contains exactly one file
  (`PeopleRoomUITests.swift`). Any item whose claim is "a designer can now *reach* X" must name
  `FIELD-UI` explicitly, and most such items must add the first UI test that proves it.
- `CaptureTests` is a `:unit_test_bundle` with **no app host** (`scripts/generate_project.rb:161`)
  and there is no `SourcePin` equivalent in Field (grep for `String(contentsOf` across
  `CaptureTests/` returns nothing). Field's copy tests
  (`CaptureTests/FieldVerbCopyTests.swift`) can only pin *value-returning helpers*, never a literal
  inside a SwiftUI view. **P1-05 builds that mechanism**, and several Phase 0 items depend on it for
  a real regression net rather than a manual re-read.

---

# Upstream (non-iOS) — prerequisites owned by another team

These are not iOS work. They are listed because iOS items below block on them and because two of
them are **prerequisites the deck's roadmap does not contain at all** (see "Flagged" at the end).

| id | what | evidence | size | blocks |
|---|---|---|---|---|
| **X-01** | Designer-portal route that posts a PDF to `project-ffe-document-extract` and renders the staged rows for per-row confirmation. Deck phase 2; explicitly non-iOS. | `supabase/functions/project-ffe-document-extract/index.ts`; zero callers repo-wide | M | P2-* (proves the extraction bar before iOS spends a day) |
| **X-02** | **A caller-reachable path that registers an uploaded file as a `source_document` asset.** *Nothing can create the row the extractor requires.* `project_ffe_media_assets` lost its `FOR ALL` policy in `00438_ffe_release_security_hardening.sql:398-403` and is `SELECT`-only for `authenticated`; the sole INSERT path is `register_project_ffe_working_media_source` (`00455_ffe_working_media_registration.sql:52`), which is `REVOKE`d from `authenticated` and `GRANT`ed only to `service_role`; the one edge function that calls it (`supabase/functions/project-review-media/index.ts:43`) hard-codes `p_media_kind: "board_reference"` (`lib.ts:205`). | read first-hand | M | **X-01 and every P2 item** |
| **X-03** | Widen the extractor to accept a captured photo. Four coupled changes: `functions/project-ffe-document-extract/lib.ts:17,54,68` (`contentType: "application/pdf"` literal), `index.ts:52` (`media_type: "application/pdf"`), `get_project_ffe_extract_upload` (`00437_ffe_service_boundaries.sql:134`, `AND asset.content_type = 'application/pdf'`), and `project_ffe_import_batches.source_kind CHECK IN ('csv','xls','xlsx','pdf')` (`00434_ffe_privacy_domain_foundation.sql:393`). New migration ≥ `00660`. Note `register_project_ffe_working_media_source` **already** accepts `image/jpeg|png|webp` (`00455:37`) — only the extractor half is closed. | read first-hand | M | P2-04 … P2-10 |
| **X-04** | **`device_push_tokens` cannot distinguish the two apps.** The table has `platform text default 'ios'` and no bundle/app column (`00335_device_push_tokens.sql:23-31`), and `apns-send` reads a single `APNS_TOPIC` env var (`supabase/functions/apns-send/index.ts:229`) used as the APNs topic for every token. Two bundle ids on one rail needs an `app` column, a backfill, a topic-per-token selection in `apns-send`, and the Field APNs key/topic in Vault. | read first-hand | M | **P3-04, P3-05, P3-08** |
| **X-05** | Decide and build the one Field notification producer (which studio event, which payload, which dedupe key). House rule: no automated external sends; a draft lands `awaiting_review`. Gated on Kody/Leah naming one actually-missed instruction. | deck §"Opportunity 2"; `CLAUDE.md` Agent-OS rules | M | P3-06, P3-07 |
| **X-06** | Define what "the shared direction" **is** as a server projection. **There is no such noun in the client app today** — a grep for `direction` across `apps/mobile/Patina/Patina/` returns only layout, coaching-hint and prose hits. The nearest real thing is the Stage-2 project approval (`Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift`), which already carries an edition, an authority revision and an artifact hash. Either Phase 4 binds to that, or a new projection is specified. Product ruling, not engineering. | read first-hand | S | **all of P4** |
| **X-07** | CI runner image bump `macos-15` → an image carrying Xcode 27, at `.github/workflows/policy-quality.yml:95` and `:104`, plus re-validation of both gate scripts on it. Owned by whoever owns CI; listed again as **P5-11** because the iOS teams cannot land Phase 5 without it. | read first-hand | S | P5-09 … P5-14 |
| **X-08** | Revisit the pinned model id in the family's one live model call: `supabase/functions/companion-message/index.ts:252` → `claude-sonnet-4-20250514`. Red team C7. Not iOS, not blocking, cheap. | read first-hand | XS | — |

---

# PHASE 0 — Repair (Patina Field)

Everything here is a shipped lie or a measured defect. No new capability. **Lane: FIELD-A.** No item
in this phase touches `generate_project.rb` target structure, so it can run concurrently with
Phase 1.

### P0-01 — Wire `onSetHardwareEntry` to Settings at the live call site
The O4 "Set up" button calls a closure that defaults to `{}` and is never passed, so the button is
dead in production.
- **App:** Field
- **Files:** `apps/mobile/Capture/Capture/Features/Onboarding/OnboardingFlowView.swift:102` (the
  live `ReadyScreen(analytics:onStart:)` construction — add `onSetHardwareEntry:`);
  `Capture/Features/Onboarding/OnboardingFlowView.swift` (needs `@Environment(\.openURL)`);
  `Capture/Features/Onboarding/OnboardingFlowView.swift:136` (the harness construction, same fix).
  The pattern to copy is `Capture/Features/Settings/SettingsScreen.swift:196-198`, which already
  opens `UIApplication.openSettingsURLString`.
- **Size:** XS
- **Depends on:** —
- **Verify:** `FIELD-GATE`, plus `DEVICE` — tap "Set up" on O4 and land in iOS Settings.

### P0-02 — Device-derived `hardwareEntry`
`ReadyScreen.swift:18` defaults `hardwareEntry` to `.actionButton` and the live call site never
passes it, so an SE or an iPhone 14 is instructed to map a button it does not have. The non-Pro
branch (`:74-76, :87-93`) is never taken in production.
- **App:** Field
- **Files:** new `apps/mobile/Capture/CaptureKit/CaptureKit/Support/HardwareEntryPolicy.swift` (a
  pure, testable model-identifier → entry mapping); `Capture/Features/Onboarding/OnboardingFlowView.swift:102`;
  `Capture/Features/Onboarding/ReadyScreen.swift:14,18`; new
  `apps/mobile/Capture/CaptureTests/HardwareEntryPolicyTests.swift`.
- **Correctness note, from Astra §S1:** *"Pro" is the wrong axis.* The Action Button ships on
  iPhone 15 Pro / Pro Max, **all** iPhone 16 models including the base 16 and 16 Plus, iPhone 16e,
  iPhone Air and the iPhone 17 family. It is absent from every iPhone 14 and earlier, including
  14 Pro. Encode the device list, not a "Pro" predicate. `ReadyScreen`'s own header comment
  ("Non-Pro devices skip the Action Button tip") is wrong and must be rewritten with the change.
- **Size:** S
- **Depends on:** —
- **Verify:** `FIELD-GATE` (the new `HardwareEntryPolicyTests` is the regression net), plus `DEVICE`
  on one Action-Button device and one without.

### P0-03 — Remove the two defaults that let an unwired call site compile
`var hardwareEntry: HardwareEntry = .actionButton` and `var onSetHardwareEntry: () -> Void = {}` are
the reason P0-01 and P0-02 were shippable bugs. Make both required, so the compiler catches the next
one.
- **App:** Field
- **Files:** `Capture/Features/Onboarding/ReadyScreen.swift:18,23`; the three construction sites
  (`OnboardingFlowView.swift:102,136` and the two `#Preview` blocks at `ReadyScreen.swift:111-119`).
- **Size:** XS
- **Depends on:** P0-01, P0-02
- **Verify:** `FIELD-GATE` (a missing argument is a compile error).

### P0-04 — Correct the "without even unlocking" copy
Two strings promise locked-device capture. `LockedCameraCapture` is a separate extension with no
network and no App Group container, so Field's entire shared-store workflow cannot run there — the
promise is not merely unimplemented, it is unimplementable on this architecture.
- **App:** Field
- **Files:** `Capture/Features/Onboarding/ReadyScreen.swift:74-76` (`subtitle`, `.actionButton`
  case) and `:89-91` (`hardwareCard` detail line). Copy must also survive the FC-R3 sweep
  (no "inbox", no "ai" — `scripts/capture-gate.sh:135-160`) and `patina-brand-voice`.
- **Size:** XS
- **Depends on:** P0-02 (the two branches change together)
- **Verify:** `FIELD-GATE`; pin the new strings in `CaptureTests` once **P1-05** lands.

### P0-05 — Reach Settings (T1), Account (T2), sign-out and workspace switch in a Release build
`CaptureRoute.settings` and `.account` are registered
(`Capture/Features/SystemEntry/SystemSurfaceScreens.swift:40,48`) and navigated to from exactly one
place: `Capture/App/DeepLinking/CaptureDeepLink.swift:119-120`, behind
`verificationHarnessAllowed` (`:256-262`), which is `#if DEBUG` or `!runsRealServices` — false in
any Release build on a device. Sign-out (`Capture/Features/Account/AccountScreen.swift:265`) and the
workspace switch live inside T2, so all four are one entry point.
- **App:** Field
- **Files:** `Capture/Features/Work/WorkDashboardScreen.swift` (the Work realm root, which already
  owns `coordinator.navigate(to: .syncStatus)` at `:308` — the same header is the natural home);
  `Capture/Features/Work/WorkTodayBand.swift` if the entry belongs in the band;
  `Capture/Features/Account/AccountScreen.swift` (a route to T1 from T2, or vice versa);
  new `apps/mobile/Capture/CaptureUITests/SystemSurfaceReachabilityUITests.swift`.
- **Size:** S
- **Depends on:** —
- **Verify:** `FIELD-UI` with the new reachability test, and `FIELD-RELEASE` + `DEVICE` — a Release
  install must reach sign-out without a deep link. `FIELD-GATE` alone **cannot** prove this item.

### P0-06 — Reach the QR approver (Q1 `.qrScan` → Q2 `.qrApprove`) in a Release build
Same defect as P0-05: `CaptureDeepLink.swift:238` is the only navigation into `.qrScan`, and
`Capture/Features/QRApprove/QRScanScreen.swift:81` presents Q2 from inside Q1.
- **App:** Field
- **Files:** `Capture/Features/Settings/SettingsScreen.swift` or
  `Capture/Features/Account/AccountScreen.swift` (the approver is an identity act — it belongs on
  one of those two); `Capture/Features/QRApprove/QRApproveScreens.swift`; the new UI test from
  P0-05.
- **Size:** S
- **Depends on:** P0-05
- **Verify:** `FIELD-UI`, `FIELD-RELEASE`, `DEVICE`.

### P0-07 — Reach the photo-import fallback (R3/E3 `.photoImport`) in a Release build
`CaptureDeepLink.swift:107` is the only `present(.photoImport)`. The place it is *supposed* to
appear is the camera-denied branch: `Capture/Features/Capture/ViewfinderScreen.swift:189-193` draws
`CameraAccessDeniedNotice()` (`:291-317`), which offers only "Open Settings" — a designer with the
camera off has no way to import from Photos at all.
- **App:** Field
- **Files:** `Capture/Features/Capture/ViewfinderScreen.swift:291-317` (add the import action to the
  denied notice); `Capture/Features/Resilience/ResilienceScreens.swift:293-300` (registrar,
  unchanged); the new UI test from P0-05.
- **Size:** S
- **Depends on:** P0-05
- **Verify:** `FIELD-UI`, `FIELD-RELEASE`, `DEVICE` with camera access revoked.

### P0-08 — Stop `SmartGuessSheet.accept()` promoting an unchanged guess to `.manual`
`promotedSource(_:_:)` (`SmartGuessSheet.swift:297-299`) returns `.manual` for any value the
designer did not edit, and `.manual` is defined as **"typed by the designer"**
(`CaptureKit/CaptureKit/Domain/CaptureEnums.swift:46`). One tap on "Looks right" rewrites all four
fields' origin. The dashed provenance chip does not survive acceptance, and no query can later find
the rows that came from one bad batch.
- **App:** Field
- **Files:** `Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift:262-299`;
  `CaptureKit/CaptureKit/Domain/CaptureEnums.swift:45-55`;
  `CaptureKit/CaptureKit/Domain/Specimen.swift:116` (`provenanceRaw`);
  `CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift:122-155`
  (`provenance(for:)` / `setValue(_:for:source:)`);
  `CaptureKit/CaptureKit/Design/ProvenanceBadge.swift`;
  `CaptureKit/CaptureKit/Sync/FieldCapturePayload.swift:209` (the wire contract carries
  `provenanceRaw`); `CaptureTests/SmartGuessTests.swift`.
- **Correct end state (no flag, breaking change taken now):** *origin* and *review state* become two
  separate per-field facts. Origin is immutable once written — a value read by OCR stays `.ocr`
  forever. Confirmation sets a **separate** `confirmedBy`/`confirmedAt` field. `.manual` narrows to
  mean only "a human typed this from nothing"; `.edited` narrows to "a human replaced a
  machine-proposed value", and must record **what the machine proposed**. That is a `Specimen` model
  change and a `FieldCapturePayload` wire change, and it is exactly the kind of change this program
  says to take before release rather than after.
- **Size:** M
- **Depends on:** — (but see **P0-09**: the store has no migration plan)
- **Verify:** `FIELD-GATE` with new `SmartGuessTests` cases asserting (a) accepting four unchanged
  guesses leaves all four origins `.smartGuess`, (b) a corrected field records both the new value
  and the original proposal, (c) `FieldCapturePayload` round-trips both facts. Plus a
  `CaptureStoreMigrationTests` case (P0-09).

### P0-09 — Give `CaptureStore` a versioned schema and a migration plan
Field's store is a bare `Schema([...])` with no `SchemaMigrationPlan`
(`CaptureKit/CaptureKit/Persistence/CaptureStore.swift:80-86`, `:98-108`). The only recovery is the
`didResetIncompatibleStore` ladder (`:60-74`), which **discards the designer's unsynced queue**.
Patina fixed this exact defect with `PatinaSchema.swift`; Field never did. P0-08 adds properties to
`Specimen`, and Phase 3 and 5 will add more.
- **App:** Field
- **Files:** new `CaptureKit/CaptureKit/Persistence/CaptureSchema.swift` (mirroring
  `apps/mobile/Patina/Patina/Core/Persistence/PatinaSchema.swift`);
  `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:80-108`;
  `CaptureTests/CaptureStoreMigrationTests.swift`; `CaptureTests/CaptureStoreLadderTests.swift`.
- **Size:** M
- **Depends on:** —  ·  **blocks:** P0-08, P3-03, P4 parity work
- **Verify:** `FIELD-GATE` with a migration test that opens a V1 store with a V2 schema and asserts
  zero rows lost and `didResetIncompatibleStore == false`.

### P0-10 — Fix the `goldenHour` solid fill under flipping ink
`FieldAffirmationChip` puts `CaptureColor.ink` (dynamic, flips with the scheme) on
`CaptureColor.goldenHour` (static `#E8C547`): 9.01:1 in light, **1.39:1 in dark**.
- **App:** Field
- **Files:** `Capture/Features/Capture/FieldAffirmationChip.swift:20-22`;
  `CaptureKit/CaptureKit/Design/CaptureColor.swift:33`. The fix already exists upstream —
  `PatinaColors.Stamp.goldenHour` (`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:282-284`)
  is `patinaDynamic(light: goldenHourInk, dark: goldenHour)`. Either re-point `CaptureColor` at the
  raised ink, or adopt Patina's 14% wash pattern (`PatinaStatusBadge.swift:40-45`).
- **Size:** XS
- **Depends on:** —
- **Verify:** `FIELD-GATE` plus the new Field contrast suite from **P1-06** (Patina's
  `PatinaTests/PatinaContrast.swift` is the computation to port). `DEVICE` in dark mode.

### P0-11 — Fix the `warning` solid fill under flipping ink
`OfflineQueueBanner`'s queued-count pill: `CaptureColor.ink` on `CaptureColor.warning` (`#D4A574`) →
6.50:1 light, **1.93:1 dark**. There is no `warningInk` in `PatinaColors` — this one needs a raised
token minted, not just re-pointed.
- **App:** Field (token in the shared package)
- **Files:** `Capture/Features/Resilience/OfflineQueueBanner.swift:49-52`;
  `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:100` (add
  `warningInk` beside `goldenHourInk` at `:66`);
  `CaptureKit/CaptureKit/Design/CaptureColor.swift:29`.
- **Size:** S
- **Depends on:** —
- **Verify:** `FIELD-GATE` + P1-06 contrast suite; `PATINA-GATE` (the shared package is linked into
  both apps, so a token addition must not regress Patina's `ContrastTests`); `DEVICE` in dark mode.

### P0-12 — Supply the OCR and scanned-code observations `SmartGuessSheet` already discards
`SmartGuessSheet.swift:209` calls `smartGuess.guess(image:ocr:codes:)` with **`ocr: [], codes: []`**.
The protocol (`CaptureKit/CaptureKit/Recognition/RecognitionServices.swift:156-158`) accepts both,
and Field already runs `VNRecognizeText` (N1) and a code scanner (N2) elsewhere. Both reviewers
named this independently: N5 has a missing-input problem before it has a model problem, and fixing
it is the cheapest accuracy win in the program. **Not in the deck's phase 0 — added here.**
- **App:** Field
- **Files:** `Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift:198-231`;
  `Capture/Features/Recognition/Tag/TagOCRSheet.swift` (where the OCR observations already live);
  `Capture/Services/Recognition/HeuristicSmartGuessService.swift`;
  `CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift`;
  `CaptureTests/SmartGuessTests.swift`.
- **Size:** M
- **Depends on:** P0-08 (origins must be separable before OCR-derived values flow into the sheet, or
  a verbatim `.ocr` read gets laundered into `.smartGuess`)
- **Verify:** `FIELD-GATE` with a test asserting a value that came from an OCR observation keeps
  `.ocr` origin through the sheet, and that the heuristic's output improves on a fixture with tag
  text present. `DEVICE` on a real tag.

**Phase 0 total: 12 items** (deck named 5; 7 added — see Flagged).

---

# PHASE 1 — Foundations (shared)

**Lane: SHARED-A.** P1-01…P1-04 touch both apps' copy and must not run concurrently with a Phase 0
item in the same file; sequence P1-03 after Phase 0 lands. P1-07…P1-09 touch
`generate_project.rb` and `Patina.xcodeproj` and must be a **single serialized item**, never two
lanes (`feedback_capture_pbxproj_regen_worktree_trap`).

### P1-01 — Rule the canonical lexicon (a written decision, not code)
Four collisions, one of them inside a single app one screen apart. Verified counts: 1,559
`specimen`/`Specimen` references across `apps/mobile/Capture`, 739 `piece` references across
`apps/mobile/Patina/Patina`. The **user-facing** Field subset is ~10 strings.
- **The four:** *a furnishing* — `piece` (Patina) vs `specimen` (Field) vs `line`/`piece` (portal).
  *the physical place* — `house`/`space`/`room` vs `site`/`venue`/`room`. *the design firm* —
  `Studio` vs `studio` **and** `workspace`. *the client's own hub* — `"Your Studio"`
  (`Patina/App/Coordinators/Coordinator.swift:149`, `Patina/Features/Navigation/PatinaTab.swift:42`)
  colliding head-on with the design firm's name.
- **App:** Shared (and the portal, informationally)
- **Files:** a new ruling recorded in `docs/vision/VISION-DECISIONS.md`; no code.
- **Size:** XS (the decision) — but it is a **blocking prerequisite**, because everything later
  inherits whichever vocabulary is in place when it ships.
- **Depends on:** Kody's ruling
- **Verify:** the ruling exists and names one canonical term per concept plus the disposition of
  `"Your Studio"`.

### P1-02 — Rename the user-facing Field nouns
Only copy. The 1,000-odd internal `Specimen` type/property identifiers stay.
- **App:** Field
- **Files (the verified user-facing set):**
  `Capture/Features/Capture/ViewfinderControls.swift:251`;
  `Capture/Features/Resilience/ResilienceScreens.swift:86`;
  `Capture/Features/Root/RootView.swift:221`;
  `Capture/Features/Recognition/Tag/TagOCRSheet.swift:101,154`;
  `Capture/Features/Specimen/SpecimenSheetScreen.swift:38,364,374`;
  `Capture/Services/Sync/LocalCaptureSyncService.swift:32`;
  plus the `site`/`venue` copy under `Capture/Features/Route/` and `Capture/Features/Session/`, and
  the `workspace` copy in `Capture/Features/Auth/ConnectWorkspaceScreen.swift` and
  `Capture/Features/Account/AccountScreen.swift`.
  Do **not** touch `CaptureScreenID`, `registryKey`, `accessibilityIdentifier` or
  `analytics.event`/`.screen` strings — `capture-gate.sh:60` filters exactly those, and
  `CaptureScreenIDTests` and the PostHog taxonomy pin them.
- **Size:** M
- **Depends on:** P1-01, P1-05 (so the rename lands with its net)
- **Verify:** `FIELD-GATE` with new lexicon tests from P1-05; `FIELD-UI`.

### P1-03 — Resolve the `"Your Studio"` collision in the client app
Whatever P1-01 rules, one of the two meanings moves.
- **App:** Patina
- **Files:** `Patina/App/Coordinators/Coordinator.swift:78,85,149`;
  `Patina/Features/Navigation/PatinaTab.swift:42`;
  `Patina/Features/Navigation/RouteTabTable.swift:86`;
  `Patina/Features/Home/Views/DailyGreetingHeader.swift:21`;
  `Patina/Features/Profile/Views/StudioHubView.swift:153`;
  `Patina/Features/Help/FirstLaunchTour.swift:329`;
  `Patina/Features/Companion/Models/CompanionContext.swift:195`;
  `PatinaTests/NounConsistencyTests.swift`.
- **Hazard:** `Coordinator.swift:198` holds `analyticsScreenName`, which
  `RouteAnalyticsParityTests.stableRouteScreenNamesAreUnchanged` deliberately freezes so a rename
  cannot silently break a PostHog dashboard. The existing `crossRoom` case
  (`NounConsistencyTests.swift:56-64`) is the pattern: rename `displayName`, pin
  `analyticsScreenName` explicitly.
- **Size:** S
- **Depends on:** P1-01
- **Verify:** `PATINA-GATE` (`NounConsistencyTests` + `RouteAnalyticsParityTests` must both be
  green); `PATINA-UI`.

### P1-04 — Align the portal's designer-facing nouns with the ruling
Informational for the iOS teams; the work is a portal team's.
- **App:** — (upstream, tracked here so the lexicon does not diverge again)
- **Size:** S
- **Depends on:** P1-01
- **Verify:** whatever the portal team's gate is (`pnpm --filter designer-portal type-check` + the
  relevant Playwright spec).

### P1-05 — Port Patina's `SourcePin` mechanism into `CaptureTests`
The enabling item for every copy test in Field. Patina's `PatinaTests/SourcePin.swift` lets a test
read a `.swift` file and assert on a literal inside a view; Field has no equivalent, which is why
`FieldVerbCopyTests.swift` can only pin helper return values.
- **App:** Field
- **Files:** new `apps/mobile/Capture/CaptureTests/SourcePin.swift` (adapted — `CaptureTests` is
  host-less and its bundle resources differ from `PatinaTests`'; resolve the repo root from
  `#filePath` rather than `Bundle`); reference
  `apps/mobile/Patina/PatinaTests/SourcePin.swift`.
- **Size:** S
- **Depends on:** —
- **Verify:** `FIELD-GATE` with a self-test that a renamed file makes the pin **fail** rather than
  silently pass — `NounConsistencyTests.swift:22-25` records that exact prior defect (`RL1E2-15`).

### P1-06 — Port Patina's design-system test suites into `CaptureTests`
Field has 51 test files and none of the four design nets Patina runs.
- **App:** Field
- **Files:** new `CaptureTests/FieldNounConsistencyTests.swift`,
  `CaptureTests/FieldSentenceCaseTests.swift`, `CaptureTests/FieldContrastTests.swift`,
  `CaptureTests/FieldTapTargetTests.swift`, `CaptureTests/CaptureContrast.swift`. Models:
  `apps/mobile/Patina/PatinaTests/NounConsistencyTests.swift`, `SentenceCaseTests.swift`,
  `ContrastTests.swift`, `TapTargetTests.swift`, `PatinaContrast.swift`.
- **Shape rules to carry over verbatim** (`NounConsistencyTests.swift:18-25`): **one `@Test` per
  lexicon row** (a wrapper holding several rows passes on any one recorded failure), and **every
  `SourcePin.read` hoisted out of its wrapper**.
- **Size:** M
- **Depends on:** P1-05, P1-01 (the noun suite needs the ruling)
- **Verify:** `FIELD-GATE`. The contrast suite must fail on P0-10/P0-11's pre-fix values and pass on
  the post-fix ones — run it against the pre-fix tree once to prove it bites.

### P1-07 — Converge the three `supabase-swift` resolutions onto one exact version
Three `Package.resolved` files disagree, and a fourth disagreement sits in the version
*requirements*:

| file | resolved |
|---|---|
| `apps/mobile/Patina/Patina.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` | **2.40.0** |
| `apps/mobile/Mobile.xcworkspace/xcshareddata/swiftpm/Package.resolved` | **2.51.0** |
| `apps/mobile/Capture/Capture.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` | **2.55.1** |

Requirements: Patina declares `upToNextMajorVersion / minimumVersion = 2.5.1`
(`Patina.xcodeproj/project.pbxproj:905-912`) — **almost certainly a typo for `2.51.0`**, and the
reason its resolution sat at 2.40. Field declares `minimum_version: '2.40.0'`
(`Capture/scripts/generate_project.rb:237-238`).
- **App:** Both
- **Files:** `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:905-912`;
  `apps/mobile/Capture/scripts/generate_project.rb:236-241`; all three `Package.resolved` files
  (delete and re-resolve, do not hand-edit).
- **Correct end state:** `exactVersion` on one agreed release in both projects, so a lane cannot
  silently resolve a different client. Same treatment for `posthog-ios`
  (`generate_project.rb:240-241`, minimum `3.48.0`).
- **Size:** S
- **Depends on:** —
- **Hazard:** a serialized item. It rewrites `Patina.xcodeproj/project.pbxproj` **and** re-runs
  Field's generator; no other lane may be mid-edit on either.
- **Verify:** `PATINA-GATE`, `FIELD-GATE`, and `diff` the three resolved files to confirm one
  revision. Then `PATINA-RELEASE` and `FIELD-RELEASE` — an SDK bump that only breaks under
  whole-module optimisation is the classic miss.

### P1-08 — Correct the stale `PatinaDesignKit` floor comment, and set a real floor
`apps/mobile/PatinaDesignKit/Package.swift:22-27` justifies `.iOS("17.6")` with "the Patina app
target's `IPHONEOS_DEPLOYMENT_TARGET` is 17.6". All **8** entries in
`Patina.xcodeproj/project.pbxproj` read `26.0`. The comment is stale and load-bearing.
- **App:** Shared package
- **Files:** `apps/mobile/PatinaDesignKit/Package.swift:20-27`.
- **Correct end state:** floor = Field's `DEPLOYMENT` (18.0, `generate_project.rb:28-30`), the true
  minimum consumer. Do **not** raise Field's floor — the red team (C3) and Astra both establish that
  weak linking plus `@available` reaches an iOS 26/27 API from an 18.0 floor, and a floor bump buys
  nothing while stranding trades' phones.
- **Size:** XS
- **Depends on:** —
- **Verify:** `PATINA-GATE` + `FIELD-GATE` (both consumers link it).

### P1-09 — Delete the two empty, unreferenced extension directories or give them targets
`apps/mobile/Capture/CaptureWidgets/` and `apps/mobile/Capture/CaptureShareExtension/` are empty and
referenced by nothing in `generate_project.rb` (`grep -n new_target` returns five targets, none an
app extension). They read as shipped machinery and are not.
- **App:** Field
- **Files:** both directories; `apps/mobile/Capture/README.md` if it mentions them.
- **Decision:** `CaptureWidgets/` becomes real in **P5-02**. `CaptureShareExtension/` has no item in
  this program — delete it, or open a ticket. Do not leave it.
- **Size:** XS
- **Depends on:** —
- **Verify:** `FIELD-GATE`.

**Phase 1 total: 9 items** (deck named 3).

---

# PHASE 2 — FF&E, the iOS half (Patina Field)

**Lane: FIELD-B.** Every item here is blocked on **X-02** and **X-03**; X-01 should land and clear
its accuracy bar (≥95% SKU and price, ≥90% maker, field-level exact match against a hand-keyed gold
set of three real Middle West vendor PDFs) **before** any of it starts. That is the deck's own
sequencing and it survives the no-flags rule intact: the gate is an accuracy bar, not a flag.

### P2-01 — A project picker for the capture destination
The extractor is keyed on `p_project_id` and authorises via
`_ffe_is_studio_actor(project.designer_id, actor)`. Field has a project cache
(`Capture/Features/Projects/`, `CaptureProjectCache`) but no "send this to project X" step on the
document path.
- **App:** Field
- **Files:** `Capture/Features/Projects/ProjectListScreen.swift`,
  `Capture/Features/Projects/ProjectsSupport.swift`; new
  `Capture/Features/FFEDocument/FFEProjectPicker.swift`;
  `CaptureKit/CaptureKit/Domain/CaptureProjectRef.swift`.
- **Size:** S · **Depends on:** — · **Verify:** `FIELD-GATE`, `FIELD-UI`.

### P2-02 — Document capture mode (multi-page, flattened, deskewed)
A vendor quote is a document, not a specimen photo. Field's viewfinder is built for objects.
- **App:** Field
- **Files:** `Capture/Features/Capture/ViewfinderScreen.swift`,
  `Capture/Features/Capture/ViewfinderControls.swift:194-241` (the mode selector),
  `Capture/Features/Capture/ViewfinderModel.swift`; new
  `Capture/Services/Capture/DocumentScanService.swift` (`VNDocumentCameraViewController`).
- **Size:** M · **Depends on:** P2-01 · **Verify:** `FIELD-GATE`, `DEVICE`.

### P2-03 — Files/Photos import of an existing PDF
The commonest real case: the quote arrived by email and is already on the phone.
- **App:** Field
- **Files:** new `Capture/Features/FFEDocument/FFEDocumentImport.swift`;
  `Capture/Features/Resilience/ResilienceScreens.swift` (the existing import sheet is the pattern);
  `Capture/Info.plist` (no new key — `UIDocumentPickerViewController` needs none).
- **Size:** S · **Depends on:** P2-01 · **Verify:** `FIELD-GATE`, `FIELD-UI`, `DEVICE`.

### P2-04 — Client-side SHA-256 and byte-count of the source
Non-negotiable: the extractor rejects on `source_integrity_failed` unless the registered
`checksum_sha256` and `size_bytes` match the stored bytes exactly
(`project-ffe-document-extract/index.ts:38-41`).
- **App:** Field
- **Files:** new `CaptureKit/CaptureKit/Sync/SourceManifest.swift`; new
  `CaptureTests/SourceManifestTests.swift`.
- **Size:** S · **Depends on:** — · **Verify:** `FIELD-GATE` with a fixture whose hash is asserted
  against `shasum -a 256`.

### P2-05 — Upload to the `project-ffe-working` bucket from Field
A studio co-member may insert directly: `project_ffe_working_studio_insert`
(`00433_ffe_safe_reader_media_compatibility.sql:164-173`) permits `INSERT` to `authenticated` where
the first path segment is a project the actor co-members. Path must be `<projectId>/...`
(`00455:33`, and a `CHECK` on the table at `00433:47`).
- **App:** Field
- **Files:** new `Capture/Services/FFE/FFEDocumentUploadService.swift`;
  `Capture/Services/Sync/LocalCaptureSyncService.swift` (the durable-queue pattern to follow);
  `Capture/App/Composition/AppContainer.swift`.
- **Size:** M · **Depends on:** P2-04 · **Verify:** `FIELD-GATE`, `DEVICE` against a real project.

### P2-06 — Register the upload as a `source_document` asset
- **App:** Field
- **Files:** `Capture/Services/FFE/FFEDocumentUploadService.swift`;
  `Capture/Services/Session/SupabaseSessionService.swift` (the authed edge-function call pattern).
- **Size:** S
- **Depends on:** **X-02** — *this item cannot be written until the upstream endpoint exists.* There
  is no `authenticated`-reachable path today.
- **Verify:** `FIELD-GATE`, `DEVICE`.

### P2-07 — Call `project-ffe-document-extract` and hold the staged batch
- **App:** Field
- **Files:** new `Capture/Services/FFE/FFEExtractionClient.swift`; new
  `CaptureKit/CaptureKit/Domain/FFEImportBatch.swift`,
  `CaptureKit/CaptureKit/Domain/FFEImportRow.swift`; new `CaptureTests/FFEExtractionTests.swift`.
- **Error surface (Astra, and the FC-R3 rule):** the function returns nine distinct error codes
  (`unauthorized`, `invalid_body`, `not_found`, `invalid_source_manifest`, `source_unavailable`,
  `source_integrity_failed`, `extractor_unavailable`, `extraction_failed`, `invalid_extraction`,
  `staging_failed`). Each needs its own truthful, operation-specific line. **"The Engine is
  resting" is one endpoint's copy and does not generalise** — the deck accepted this correction
  explicitly. The word "AI" is forbidden (`capture-gate.sh:157-159`).
- **Size:** M · **Depends on:** P2-06, X-01 (bar cleared), X-03 if the source is a photo
- **Verify:** `FIELD-GATE` with a test per error code; `DEVICE`.

### P2-08 — Offline queue for the document path
Field's door "MUST work offline: never an empty list, never a spinner, never a disabled control." A
document captured in a basement must queue like everything else.
- **App:** Field
- **Files:** `Capture/Services/Sync/LocalCaptureSyncService.swift`;
  new `CaptureKit/CaptureKit/Domain/FFEDocumentOutboxRecord.swift`;
  `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:80-86` (a new `@Model` in the schema);
  `Capture/Features/SystemEntry/SyncStatusScreen.swift` (a sixth queue on U1).
- **Size:** M · **Depends on:** P0-09 (the schema gains a model — without a migration plan this
  resets installed stores), P2-07 · **Verify:** `FIELD-GATE` + a `CaptureStoreMigrationTests` case;
  `DEVICE` in airplane mode.

### P2-09 — The per-row confirmation review screen
Row by row. Nothing bulk. The deck's mock is the contract: each field carries its own origin, its
own evidence reference, and its own confirm act; **unknowns stay unknown and are never filled**.
- **App:** Field
- **Files:** new `Capture/Features/FFEDocument/FFEReviewScreen.swift`,
  `Capture/Features/FFEDocument/FFEReviewRow.swift`,
  `Capture/Features/FFEDocument/FFEDocumentScreens.swift` (registrar, following
  `Capture/Features/SystemEntry/SystemSurfaceScreens.swift`);
  `CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift` (new route + screen id);
  `CaptureKit/CaptureKit/Support/CaptureScreenID.swift`;
  `Capture/Features/Work/WorkDashboardScreen.swift` (the entry point — a Release-reachable one, per
  P0-05's lesson).
- **Hard constraint:** the **single-tap-accepts-everything** button that P0-08 exists to fix must
  not be reintroduced here. A trade price and an SKU are exactly the values the red team says must
  never be bulk-promoted. One confirm per row at minimum; per field for price and SKU.
- **Size:** L · **Depends on:** P0-08, P2-07 · **Verify:** `FIELD-GATE` (row-state tests),
  `FIELD-UI` (the reachability test), `DEVICE`.

### P2-10 — Evidence display: the source page and crop beside each value
`stage_project_ffe_document_extraction` accepts a `page_text` per row
(`00437_ffe_service_boundaries.sql:181-184`). Rendering a *crop* additionally needs page geometry
the extractor does not currently return.
- **App:** Field
- **Files:** `Capture/Features/FFEDocument/FFEReviewRow.swift`; new
  `Capture/Features/FFEDocument/FFESourcePageView.swift` (PDFKit for a PDF source,
  `CaptureImage` for a photo).
- **Scope ruling needed:** ship **page + excerpt text** first (available today). A pixel crop needs
  bounding boxes added to the extractor's tool schema
  (`functions/project-ffe-document-extract/lib.ts`, `extractionTool()`) — that is an **X-03 sibling,
  server-side**, not iOS. Do not let the iOS lane build a crop viewer against data that does not
  exist.
- **Size:** M · **Depends on:** P2-09 · **Verify:** `FIELD-GATE`, `DEVICE`.

**Phase 2 total: 10 items** (all blocked on X-02; six of them on X-03 for the photo path).

---

# PHASE 3 — The Field notification rail (Patina Field)

**Lane: FIELD-C.** P3-01 touches `generate_project.rb`'s entitlements handling and
`Capture.entitlements`; it must not overlap with P1-07 or P5-02.

### P3-01 — Add the APNs entitlement
`Capture/Capture.entitlements` declares exactly three keys: `application-groups`, `applesignin`,
`associated-domains`. There is no `aps-environment`.
- **App:** Field
- **Files:** `apps/mobile/Capture/Capture/Capture.entitlements`;
  `apps/mobile/Capture/scripts/generate_project.rb:82` (`CODE_SIGN_ENTITLEMENTS`, already wired —
  no generator change expected, confirm);
  `apps/mobile/Capture/scripts/archive-testflight.sh` (the App ID gains a capability, so the
  distribution profile must be re-minted — the script's `-allowProvisioningUpdates` path).
- **Also required outside the repo:** enable Push Notifications on the `cloud.patina.field` App ID,
  and add the Field APNs topic. The team `.p8` key is team-wide and works for both bundles; only the
  topic differs. See **X-04**.
- **Size:** S · **Depends on:** — · **Verify:** `FIELD-RELEASE` then `FIELD-ARCHIVE`, and confirm
  `aps-environment` in the built `.app`'s embedded profile. `DEVICE`.

### P3-02 — `UNUserNotificationCenter` registration and the authorization primer
A grep across the whole Capture tree for `aps-environment|UNUserNotificationCenter|registerForRemoteNotifications`
returns **zero**. Patina's implementation is the model, including the rule that registration never
happens at cold launch.
- **App:** Field
- **Files:** new `Capture/App/CaptureAppDelegate.swift` (Field has no app delegate today — check
  `Capture/App/` before assuming); new `Capture/Services/Push/FieldPushService.swift`;
  new `Capture/Features/Push/FieldPushPrimer.swift`. Models:
  `apps/mobile/Patina/Patina/App/AppDelegate.swift:47,63-83,172-210` and
  `Patina/Core/Network/PushTokenService.swift`.
- **Copy:** Field's register is instrumental, not warm. Must pass the FC-R3 sweep.
- **Size:** M · **Depends on:** P3-01 · **Verify:** `FIELD-GATE` with a pure
  `FieldPushAuthorizationPolicy` test (Patina's `PushAuthorizationCopyTests` and
  `NotificationsRowModelTests` show how to keep it host-less); `DEVICE` for the real prompt.

### P3-03 — Durable device-token record
The token must survive a launch so sign-out can delete the right row without a fresh callback.
Patina holds it in `UserDefaults` (`PushTokenService.swift:48`); Field has a SwiftData store and
should use it.
- **App:** Field
- **Files:** new `CaptureKit/CaptureKit/Domain/PushTokenRecord.swift`;
  `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:80-86`.
- **Size:** S · **Depends on:** P0-09 · **Verify:** `FIELD-GATE` + migration test.

### P3-04 — Upload the device token onto the existing rail
- **App:** Field
- **Files:** `Capture/Services/Push/FieldPushService.swift`;
  `Capture/Services/Session/SupabaseSessionService.swift`.
- **Must carry, per Patina's `PushTokenService.swift:14-21`:** hex encoding; per-token
  `environment` derived from the **current embedded provisioning profile**, never from `#if DEBUG`
  (the `device_push_tokens.environment` column comment, `00335:41-44`, says this explicitly and in
  capitals); and the **new app discriminator from X-04**.
- **Size:** S
- **Depends on:** P3-02, P3-03, **X-04** — *without the app column, a Field token is
  indistinguishable from a client token on one rail with one `APNS_TOPIC`, and every Field push will
  be sent with the client app's topic and silently dropped.*
- **Verify:** `DEVICE` + a prod row check per `patina-prod-ops` (read-only).

### P3-05 — Delete the device's token on sign-out
RLS on `device_push_tokens` is owner-only, so the delete must happen **before** the session dies.
- **App:** Field
- **Files:** `Capture/Services/Session/SupabaseSessionService.swift:148-157`;
  `Capture/Features/Account/AccountScreen.swift:265`;
  `Capture/Features/Onboarding/OnboardingFlowView.swift` (`onSignOut`, the second sign-out path).
- **Size:** S · **Depends on:** P3-04, P0-05 (sign-out must be reachable at all)
- **Verify:** `FIELD-GATE`, `DEVICE`.

### P3-06 — Receive and present one notification type
Narrow, permissioned, deduplicated. **Push is never the source of truth** — the in-app pending-work
view (`WorkDashboardScreen`) stays authoritative.
- **App:** Field
- **Files:** `Capture/App/CaptureAppDelegate.swift` (`UNUserNotificationCenterDelegate`
  `willPresent` / `didReceive`); new `Capture/Services/Push/FieldPushPayload.swift`;
  new `CaptureTests/FieldPushPayloadTests.swift`. Model:
  `Patina/App/AppDelegate.swift:172-210` and `Patina/Features/Decisions/DecisionPushHandler.swift`.
- **Size:** M · **Depends on:** P3-02, **X-05** · **Verify:** `FIELD-GATE`; `DEVICE` with a real
  APNs send.

### P3-07 — Deep-link a tapped notification to the record
Field already has a URL scheme and a router — but **no held-deep-link queue**: a link arriving
before the store opens is dropped. Patina closed three findings building one
(`Patina/.../DeepLinkHandler.swift:22-23`).
- **App:** Field
- **Files:** `Capture/App/DeepLinking/CaptureDeepLink.swift:34-53`;
  `CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift`;
  new `Capture/App/DeepLinking/CaptureHeldLink.swift`;
  `Capture/Features/Root/RootView.swift:471-508` (the `phase` machine a held link must wait on).
- **Size:** M · **Depends on:** P3-06 · **Verify:** `FIELD-GATE`, `FIELD-UI`, `DEVICE` from a cold
  launch.

### P3-08 — Notification settings and opt-out in Field's Settings
The deck names this a **hard dependency**: a user who cannot reach Settings cannot turn notifications
off.
- **App:** Field
- **Files:** `Capture/Features/Settings/SettingsScreen.swift` (a new row beside `actionButtonRow`
  at `:189-203`); new `Capture/Features/Settings/FieldNotificationsRowModel.swift`. Model:
  `Patina/Features/Settings/NotificationsRowModel.swift:55-75` — three states read from
  `UNUserNotificationCenter` and nothing else, with the read kept pure for testability.
- **Size:** S · **Depends on:** **P0-05**, P3-02 · **Verify:** `FIELD-GATE`, `FIELD-UI`, `DEVICE`.

### P3-09 — Refuse the badge
`VISION.md` refuses badges and red/green status by name. A notification rail is where a badge count
gets added by reflex. Record the refusal as a test, not a comment.
- **App:** Field
- **Files:** new `CaptureTests/FieldPushRefusalTests.swift` asserting no
  `setBadgeCount`/`applicationIconBadgeNumber` anywhere in `Capture/` or `CaptureKit/`; add the
  grep to `scripts/capture-gate.sh` beside `principle4_sweep()` (`:163-190`), which is the existing
  pattern for exactly this kind of standing refusal.
- **Size:** XS · **Depends on:** P1-05 · **Verify:** `FIELD-GATE`.

**Phase 3 total: 9 items** (deck named 5; P3-03, P3-05, P3-09 added, and P3-04 is split out because
X-04 makes it a two-party item).

---

# PHASE 4 — The client app survives no signal (Patina)

**Lane: PATINA-A.** Nothing in Phase 4 touches Field. It can run fully concurrent with Phases 0–3
in a separate worktree, with the single caveat that P1-03 and P1-07 also touch
`Patina.xcodeproj`/`PatinaTests` — sequence those.

### P4-01 — Bind "the shared direction" to a real record
Resolve **X-06** into a concrete iOS contract before any caching is written.
- **App:** Patina
- **Files:** `Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift` (the Stage-2 project
  approval already carries an edition, an authority revision and an artifact hash — the only
  existing thing with the shape the deck's mock draws, including its "Revision 3" line);
  `Patina/Core/Network/DecisionsAPIClient.swift:113,342`;
  `Patina/Features/Documents/DocumentsViewModel.swift`.
- **Size:** S · **Depends on:** **X-06** · **Verify:** a written contract plus `PATINA-GATE`.

### P4-02 — Version the schema: `PatinaSchemaV2` with a real migration stage
`PatinaMigrationPlan.stages` is `[]` today (`PatinaSchema.swift:50`), and the file's own header says
why that matters. Adding models is where the stage stops being bookkeeping.
- **App:** Patina
- **Files:** `Patina/Core/Persistence/PatinaSchema.swift:24-51`;
  `Patina/Core/Persistence/PersistenceController.swift`;
  new `PatinaTests/PatinaSchemaV2MigrationTests.swift`.
- **Size:** M · **Depends on:** — · **blocks:** P4-03, P4-04
- **Verify:** `PATINA-GATE` with a test that opens a V1 store under V2 and asserts zero rows lost
  and no recovery path taken.

### P4-03 — `SharedDirectionModel` (SwiftData)
The direction, its revision, its artifact hash, its fetch timestamp, its owning user id.
- **App:** Patina
- **Files:** new `Patina/Core/Persistence/Models/SharedDirectionModel.swift`;
  `Patina/Core/Persistence/PatinaSchema.swift`.
- **Size:** S · **Depends on:** P4-01, P4-02 · **Verify:** `PATINA-GATE`.

### P4-04 — `RequestedDecisionModel` (SwiftData)
The next decision being asked of her, and only that one. Not the whole studio rail — the deck's
smallest useful version is explicit, and widening it is how this becomes a quarter.
- **App:** Patina
- **Files:** new `Patina/Core/Persistence/Models/RequestedDecisionModel.swift`;
  `Patina/Core/Persistence/PatinaSchema.swift`;
  `Patina/Features/Decisions/ViewModels/DecisionsListViewModel.swift`.
- **Size:** S · **Depends on:** P4-02 · **Verify:** `PATINA-GATE`.

### P4-05 — Cache-on-fetch
Every successful fetch writes through. No separate sync job.
- **App:** Patina
- **Files:** `Patina/Core/Network/DecisionsAPIClient.swift:342`;
  `Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift`;
  `Patina/Features/Decisions/ViewModels/DecisionDetailViewModel` (in
  `DecisionsViewModel.swift:19-46`);
  `Patina/Features/Documents/DocumentsViewModel.swift`.
- **Size:** M · **Depends on:** P4-03, P4-04 · **Verify:** `PATINA-GATE`.

### P4-06 — Per-user isolation and clear-on-sign-out
The app already has the machinery and the tests that police it:
`Patina/Core/Persistence/LocalStoreOwnership.swift`, `LocalStoreClaim.swift`, `LocalStoreReset.swift`,
and `PatinaTests/SessionIsolationTests.swift:301`, which enumerates the files that must participate.
New models must be added to that list or the isolation net has a hole it will not report.
- **App:** Patina
- **Files:** `Patina/Core/Persistence/LocalStoreOwnership.swift`;
  `Patina/Core/Persistence/LocalStoreReset.swift`;
  `PatinaTests/SessionIsolationTests.swift:301`.
- **Size:** S · **Depends on:** P4-03, P4-04 · **Verify:** `PATINA-GATE`
  (`SessionIsolationTests` must name the new stores).

### P4-07 — Visible freshness
"Last fetched Tue, 4:12pm" — named, not implied, and never a relative age that drifts while the
screen is open.
- **App:** Patina
- **Files:** `Patina/Features/Decisions/Views/DecisionDetailView.swift`;
  `Patina/Features/Documents/DocumentListView.swift`;
  new `Patina/Features/Shared/FreshnessLine.swift`;
  `PatinaTests/SentenceCaseTests.swift`, `PatinaTests/NounConsistencyTests.swift`.
- **Honesty rule to inherit:** `HouseRecord.swift:6-12` — "a row exists only for a real event
  carrying its own real date… the builder never pads, never invents, never counts days at anyone."
- **Size:** S · **Depends on:** P4-05 · **Verify:** `PATINA-GATE`, `PATINA-UI`.

### P4-08 — Revalidate before approve
Nothing consequential commits from cache. The server half already enforces this: the approval RPC
"refuses a payload without the frozen revision"
(`DecisionsAPIClient+ProjectApprovals.swift:247-256`), so the client's job is to revalidate first
and **say so truthfully when it cannot**, rather than letting the submit fail opaquely.
- **App:** Patina
- **Files:** `Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift:436+`;
  `Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift:36-46` (`submitFailure`,
  `lastAttemptedOptionId` — the existing failure-carry machinery, added because "the client tapped
  Approve and nothing at all happened");
  `Patina/Features/Decisions/Views/DecisionDetailView.swift`.
- **Size:** M · **Depends on:** P4-05 · **Verify:** `PATINA-GATE` with a test asserting **zero**
  approvals submitted from an unrevalidated cache, and a test that a revalidation failure produces
  an operation-specific line, not a house sentence.

### P4-09 — Supersession: what the app does when the cache is stale
The deck flags this as a product ruling (Leah's), not an engineering choice. It still needs an
implementation once ruled, and the app must not invent a policy in the meantime.
- **App:** Patina
- **Files:** `Patina/Features/Decisions/Views/DecisionDetailView.swift`;
  `Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift:215` (the existing "A later edition
  took this one's place" state — the server already models supersession);
  new `Patina/Features/Shared/StalenessPolicy.swift`.
- **Size:** S · **Depends on:** P4-07, a ruling · **Verify:** `PATINA-GATE`.

### P4-10 — Truthful offline recovery copy, per operation
Today the studio half degrades to six identical "try that again" cards. Patina has **three** retry
verbs across two apps for one act ("Let's try that again" / "Retry" / "Try again"), two of them in
the same app two directories apart.
- **App:** Patina (and the shared package)
- **Files:** `Patina/Design/Components/PatinaErrorState.swift:14-37`;
  `Patina/Features/Decisions/Views/DecisionDetailView.swift`;
  `Patina/Features/Documents/DocumentListView.swift`;
  `PatinaTests/ErrorVoiceTests.swift`.
- **Rule, accepted in the deck:** name the operation that failed. An expired session, a denied
  permission and a failed upload are different failures and get different sentences.
- **Size:** M · **Depends on:** P4-07 · **Verify:** `PATINA-GATE` (`ErrorVoiceTests` +
  `SentenceCaseTests`), `PATINA-UI`.

**Phase 4 total: 10 items** (deck named 4).

---

# PHASE 5 — Render, then adopt (Patina Field)

**Lane: FIELD-D, and it is the serialization bottleneck.** P5-02…P5-08 all rewrite
`generate_project.rb`'s target graph. **They are one lane, one worktree, one person.** Two agents
editing target structure concurrently will collide on the two-pass UUID fixup
(`feedback_capture_pbxproj_regen_worktree_trap`).

### P5-01 — `NSSupportsLiveActivities`
`Capture/Info.plist` has exactly two keys and this is not one, so
`ActivityAuthorizationInfo().areActivitiesEnabled` is false and
`CaptureLiveActivityController.start()` returns at its guard
(`Capture/Services/LiveActivity/CaptureLiveActivityController.swift:38`). **Nothing is requested
today** — the controller is dead code on device, not a running activity missing a view. The
controller *is* wired (`Capture/App/Composition/AppContainer.swift:128,132` →
`LocalCaptureSyncService.swift:1070,1180,204`), so one line makes the whole path live.
- **App:** Field
- **Files:** `apps/mobile/Capture/scripts/generate_project.rb:95-124` (add
  `s['INFOPLIST_KEY_NSSupportsLiveActivities'] = 'YES'` beside the other nine `INFOPLIST_KEY_*`
  settings — **not** `Capture/Info.plist`, which Xcode merges the generated keys into).
- **Size:** XS
- **Depends on:** —
- **Verify:** `FIELD-GATE`, then `DEVICE`: queue captures offline, confirm
  `CaptureLiveActivityController.isRunning` becomes true and the `ContentState` the uploader feeds
  is correct — **before** anyone designs a presentation. This is the cheapest learning step in the
  whole program.

### P5-02 — Teach `generate_project.rb` to emit an app-extension target
`grep -n new_target scripts/generate_project.rb` returns five targets
(`:28,29,30,161,173`) — CaptureKit, CaptureKitMocks, Capture, CaptureTests, CaptureUITests. **None
is an app extension.** This is the real cost of Phase 5, and it is a week, not a slice.
- **App:** Field
- **Files:** `apps/mobile/Capture/scripts/generate_project.rb` (a new `:app_extension` target;
  its own `INFOPLIST_KEY_*` block; its own `.entitlements` with the
  `group.cloud.patina.field` App Group; a **second** copy-files phase on the app with
  `symbol_dst_subfolder_spec = :plug_ins`, distinct from the existing `:frameworks` phase at
  `:207-212`); new `apps/mobile/Capture/CaptureWidgets/Info.plist`,
  `CaptureWidgets/CaptureWidgets.entitlements`,
  `CaptureWidgets/CaptureWidgetsBundle.swift`.
- **The PatinaDesignKit trap fires here.** The generator's own comment at `:267-271` records that
  `xcodebuild` does **not** auto-embed dynamic package products and the device `.app` dyld-crashed
  until the embed phase was written by hand. A widget extension is a second consumer. The correct
  shape is Patina's: the extension **links** `PatinaDesignKit` and does **not** embed it (the host
  app embeds it once) — `Patina.xcodeproj/project.pbxproj:19-21,66,146,161` shows three link
  entries and one embed entry.
- **Size:** L
- **Depends on:** P1-09 (the directory becomes real), P1-07 (do not have two items rewriting the
  project graph in flight)
- **Verify:** `FIELD-GATE`, `FIELD-RELEASE`, `FIELD-ARCHIVE`, then `DEVICE` install — a dyld crash
  from a missing embed only shows on a device, never in the Simulator.

### P5-03 — Render `CaptureSyncAttributes` on the Lock Screen and the Dynamic Island
`CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift:13` is written and its payload
frozen. Apple requires **all** iPhone presentations — Lock Screen/banner, compact leading, compact
trailing, minimal. "Lock Screen only" is not the complete implementation.
- **App:** Field
- **Files:** new `CaptureWidgets/CaptureSyncActivityWidget.swift`,
  `CaptureWidgets/CaptureSyncActivityViews.swift`;
  `CaptureKit/CaptureKit/LiveActivity/CaptureSyncAttributes.swift` (read-only unless the device pass
  in P5-01 shows the ContentState is wrong).
- **Privacy:** a locked screen must not expose project or specimen titles. Counts and a state, not
  names.
- **Size:** M · **Depends on:** P5-01, P5-02 · **Verify:** `DEVICE` (Simulator cannot show this).

### P5-04 — Honest stale and failed states on the activity
`CaptureLiveActivityController` always passes `staleDate: nil` (`:44,58,66`) and swallows a failed
`Activity.request` into `activity = nil` (`:47-49`). A Live Activity that silently stops updating is
worse than none.
- **App:** Field
- **Files:** `Capture/Services/LiveActivity/CaptureLiveActivityController.swift:35-70`;
  `CaptureWidgets/CaptureSyncActivityViews.swift`;
  `CaptureTests/UploadStateTests.swift`.
- **Size:** S · **Depends on:** P5-03 · **Verify:** `FIELD-GATE`, `DEVICE`.

### P5-05 — An App Intent that opens the capture flow
Foreground, not `LockedCameraCapture`. The intent must have target membership on **both** the app
and the extension — the canonical "Cannot find 'MyIntent' in scope" failure.
- **App:** Field
- **Files:** new `Capture/App/Intents/CaptureSpecimenIntent.swift`;
  `apps/mobile/Capture/scripts/generate_project.rb` (dual target membership);
  `Capture/App/DeepLinking/CaptureDeepLink.swift` (the intent routes through the same entry as
  `field://capture`, `:51-53`).
- **Honesty:** App Intents schema domains are a fixed list with no domain for furniture or field
  work. A custom intent reaches Shortcuts, Spotlight, the Action Button and Control Center. It does
  **not** get free Siri phrasing, and no copy may imply it does.
- **Size:** M · **Depends on:** P5-02 · **Verify:** `FIELD-GATE`, `DEVICE`.

### P5-06 — A `ControlWidget` for Control Center, the Lock Screen and the Action Button
iOS 18 — available at Field's current 18.0 floor, no bump. One control definition, three
placements.
- **App:** Field
- **Files:** new `CaptureWidgets/CaptureControl.swift`;
  `CaptureWidgets/CaptureWidgetsBundle.swift`.
- **Size:** M · **Depends on:** P5-02, P5-05 · **Verify:** `DEVICE` — add the control in Control
  Center and assign it under Settings › Action Button.

### P5-07 — Rewrite the onboarding hardware copy against what actually ships
Once P5-06 exists, O4's instruction stops being a lie of a different kind: the app is now *eligible*
to appear under Settings › Action Button › Controls. **The app still cannot assign the button** —
that is the user's act, and no API does it. The copy must say so.
- **App:** Field
- **Files:** `Capture/Features/Onboarding/ReadyScreen.swift:72-93`;
  `CaptureKit/CaptureKit/Support/HardwareEntryPolicy.swift` (from P0-02);
  the copy tests from P1-05/P1-06.
- **Size:** S · **Depends on:** P0-02, P0-04, P5-06 · **Verify:** `FIELD-GATE`, `DEVICE`.

### P5-08 — Retire `CaptureShareExtension/` or build it
If P1-09 deferred the decision, it is forced here: the generator now knows how to emit an extension,
so "it's hard" is no longer the reason.
- **App:** Field
- **Files:** `apps/mobile/Capture/CaptureShareExtension/`;
  `apps/mobile/Capture/scripts/generate_project.rb`.
- **Size:** XS (delete) / L (build) · **Depends on:** P5-02 · **Verify:** `FIELD-GATE`.

### P5-09 — Install Xcode 27 and the iOS 27 SDK on the dev machine
`xcodebuild -version` → **Xcode 26.6**; `xcodebuild -showsdks` → **iOS 26.5 only**. `Attachment`,
`OCRTool` and `BarcodeReaderTool` are iOS 27 SDK symbols and cannot compile here today. Verified
first-hand, 2026-09-23.
- **App:** both toolchains
- **Files:** none in-repo (a machine action) — but `apps/mobile/Capture/scripts/capture-gate.sh:7`
  hard-codes `SIM="${CAPTURE_SIM:-iPhone 17}"`, which must still resolve on the new toolchain.
- **Note:** there is no compliance deadline. Apple's Upcoming Requirements page still mandates only
  the iOS 26 SDK. Adopting 27 is a choice, which means this can be scheduled rather than rushed.
- **Size:** S · **Depends on:** — · **Verify:** `FIELD-GATE` and `PATINA-GATE` both green on the new
  toolchain **before** any 27-only symbol is written.

### P5-10 — Re-validate both gate scripts on Xcode 27 / Swift 6.4
A toolchain move is where a green gate stops proving anything.
- **App:** both
- **Files:** `apps/mobile/Capture/scripts/capture-gate.sh`;
  `apps/mobile/Patina/scripts/ios-gate.sh`;
  `apps/mobile/Capture/scripts/generate_project.rb` (xcodeproj object version);
  both `.swiftlint.yml` files.
- **Size:** M · **Depends on:** P5-09 · **Verify:** both gates green, and `FIELD-RELEASE` +
  `PATINA-RELEASE` (a Swift-version move that only breaks under WMO is the classic miss).

### P5-11 — Bump the CI runner image
`.github/workflows/policy-quality.yml:95` and `:104` both `runs-on: macos-15`, an image that does
not ship Xcode 26, let alone 27. Both iOS jobs are marked **advisory**, which is why this has been
invisible.
- **App:** CI
- **Files:** `.github/workflows/policy-quality.yml:95,104`.
- **Side finding to settle here (red team C2):** Patina already carries
  `IPHONEOS_DEPLOYMENT_TARGET = 26.0` in all 8 build configurations and CI builds it on `macos-15`.
  Either the `ios-patina` advisory gate is already failing or it is not being triggered. Check
  before bumping, so the bump is not credited with fixing something else.
- **Size:** S · **Depends on:** P5-09, P5-10 · **Verify:** a CI run on a real PR, both iOS jobs
  green — and consider promoting them out of advisory once they are.

### P5-12 — Replace `SFSpeechRecognizer` with `SpeechTranscriber`
iOS 26, **no Apple Intelligence gate**. Field's voice notes today set
`request?.requiresOnDeviceRecognition = onDeviceRecognition` only when the recognizer reports
`supportsOnDeviceRecognition` (`SpeechVoiceNoteService.swift:314-315`) — so where on-device
recognition is unsupported, a private note about a client's budget **leaves the device**. The
file's own comment at `:19` names this: "false exactly where the audio matters most."
- **App:** Field (and later Patina — see P5-13)
- **Files:** `Capture/Services/Recognition/SpeechVoiceNoteService.swift` (all of it — 780+ lines
  built around `SFSpeechRecognizer`'s ~60 s per-request cap and its rotate-the-recognizer
  workaround); `CaptureKit/CaptureKit/Recognition/VoiceRecordingPolicy.swift:4,13`;
  `CaptureTests/VoiceRecordingPolicyTests.swift`, `VoiceAudioWireTests.swift`, `VoiceModeTests.swift`;
  `apps/mobile/Capture/scripts/generate_project.rb:113` (the
  `NSSpeechRecognitionUsageDescription` string may need rewording once nothing leaves the device).
- **The breaking change worth taking:** `SpeechTranscriber`/`SpeechAnalyzer` has no 60-second cap,
  so the entire rotation machinery (`rotate(recognizer:)` at `:697-780`,
  `VoiceRecordingPolicy`'s segment length) **deletes**. Do not port it forward. Availability-gate
  with `@available(iOS 26, *)` and keep the `SFSpeechRecognizer` path for 18–25 rather than raising
  the floor.
- **Size:** L · **Depends on:** P5-09 · **Verify:** `FIELD-GATE`, `DEVICE` with airplane mode on —
  the point of the change is that transcription still works.

### P5-13 — Make good on Patina's microphone promise, or remove the string
`Patina.xcodeproj/project.pbxproj:681` and `:728` declare
`NSMicrophoneUsageDescription = "Have a voice conversation with Patina about your space and style."`
There is no `Speech` import and no `AVAudioEngine` anywhere in the client app, and the Companion's
view model implements the whole conversation while the only view that constructs it calls one
method. A usage string for a capability that does not exist is an App Review risk and a lie.
- **App:** Patina
- **Files:** `Patina.xcodeproj/project.pbxproj:681,728`;
  `Patina/Features/Companion/` (the view model and its single call site).
- **Decision required:** build it with `SpeechTranscriber` (then this is an L), or delete the string
  (XS). **Do not ship the string with nothing behind it.**
- **Size:** XS or L · **Depends on:** P5-09 if built · **Verify:** `PATINA-GATE`, `PATINA-RELEASE`,
  `DEVICE`.

### P5-14 — The narrow tag experiment: category only, behind the existing seam
The one place iOS 27 belongs, sequenced as an experiment. `SmartGuessService`
(`CaptureKit/CaptureKit/Recognition/RecognitionServices.swift:156-158`) already has two
implementations — `HeuristicSmartGuessService` and `StubSmartGuessService` — so a third is a clean
addition.
- **App:** Field
- **Files:** new `Capture/Services/Recognition/FoundationModelsSmartGuessService.swift` (**app
  target only** — `CaptureKit`, `CaptureKitMocks` and the test bundles must not link
  `FoundationModels`, which is what keeps the 18.0 floor viable);
  `Capture/App/Composition/AppContainer.swift` (selection);
  `apps/mobile/Capture/scripts/generate_project.rb:219-241` (weak/optional framework linking);
  new `CaptureTests/SmartGuessComparisonTests.swift`.
- **Hard scope limits, all three from the challenge round and all non-negotiable:**
  1. **Category only.** No `sku`, no `priceTradeCents`, no `priceRetailCents`, no `maker`. A wrong
     colorway costs a tap; a wrong SKU costs a wrong sofa, and a wrong trade price costs margin on
     the stream the company calls its first dollar.
  2. **No floor bump.** `@available(iOS 27, *)` + weak linking. The device cut buys nothing: the set
     that can run it is `iOS 27 ∧ A17 Pro+ ∧ Apple Intelligence enabled ∧ model downloaded`, which
     is strictly smaller than an iOS 26 floor either way.
  3. **`.ocr` and `.code` origins survive.** Routing a scanned UPC through a model and emitting
     `.smartGuess` is a regression in the exact property this program is building. P0-08 and P0-12
     are prerequisites, not niceties.
- **Measurement, not a ship:** field-level accuracy against `HeuristicSmartGuessService` on a
  labelled set, on a physical A17 Pro+ device. `OCRTool` and `BarcodeReaderTool` are documented as
  **unavailable in the Simulator**.
- **Size:** L
- **Depends on:** P5-09, P5-10, P0-08, P0-12, and **the house census** — which phones Leah's crew
  actually carry. That question is already owed and costs one conversation. Running it first would
  settle whether this item has any users at all.
- **Verify:** `FIELD-GATE` (the comparison suite runs against the heuristic with the model path
  unavailable), `FIELD-RELEASE`, `DEVICE` on an A17 Pro+ handset.

**Phase 5 total: 14 items** (deck named 6).

---

# Totals

| Phase | Items |
|---|---|
| Upstream (X, non-iOS prerequisites) | 8 |
| Phase 0 — repair (Field) | 12 |
| Phase 1 — foundations (shared) | 9 |
| Phase 2 — FF&E, iOS half (Field) | 10 |
| Phase 3 — notification rail (Field) | 9 |
| Phase 4 — client offline (Patina) | 10 |
| Phase 5 — render + adopt (Field) | 14 |
| **iOS total (phases 0–5)** | **64** |
| **Grand total incl. upstream** | **72** |

---

# Flagged: mis-scoped or missing a prerequisite

Ten findings from reading the code, ordered by how much they change the plan.

### F-1 — Opportunity 1 has no input path. *Nothing in the repo can create the row the extractor requires.* (blocks X-01 and all of Phase 2)
The deck says the extractor is "deployed, ACL-hardened, SQL-tested" and needs only "one route". It
needs two. `project-ffe-document-extract` opens by calling `get_project_ffe_extract_upload`, which
requires an existing `project_ffe_media_assets` row with `media_kind = 'source_document'` and a
checksum. But `00438_ffe_release_security_hardening.sql:398-403` **dropped** that table's `FOR ALL`
policy and replaced it with `SELECT`-only for `authenticated`; the only INSERT path is
`register_project_ffe_working_media_source` (`00455:52`), `REVOKE`d from `authenticated` and
`GRANT`ed to `service_role` alone; and the one edge function that calls it
(`project-review-media/index.ts:43`) hard-codes `p_media_kind: "board_reference"`
(`project-review-media/lib.ts:205`). **There is no path, from any client, that produces a
`source_document`.** This is `X-02` and it is a whole item the roadmap does not contain.

### F-2 — Phase 2's iOS half needs four server changes before a line of Swift (X-03)
"Field's camera posting to the existing server-side FF&E extractor" reads as an iOS task. The
extractor is PDF-only in four independent places: `lib.ts:17,54,68`, `index.ts:52`
(`media_type: "application/pdf"` literal in the Anthropic call), `get_project_ffe_extract_upload`
(`00437:134`), and `project_ffe_import_batches.source_kind CHECK IN ('csv','xls','xlsx','pdf')`
(`00434:393`). The registration RPC already accepts `image/jpeg|png|webp` (`00455:37`), which makes
the gap look smaller than it is. Sequence X-03 with X-01, not with the iOS lane.

### F-3 — Phase 3 has no way to tell the two apps apart on one push rail (X-04)
The deck calls Field push "an entitlement, a registration, and a token upload onto the device-token
rail the client app already uses. No new backend." But `device_push_tokens` carries
`platform text default 'ios'` and no bundle discriminator (`00335:23-31`), and `apns-send` reads one
`APNS_TOPIC` env var (`index.ts:229`) as the topic for every token it sends to. Two bundle ids on one
rail is a column, a backfill, a topic-per-token selection and a second topic in Vault. There *is* a
new backend. A designer signs in to both apps under the same `auth.users` id, so this is not
hypothetical.

### F-4 — Phase 4 caches a noun that does not exist (X-06)
A grep for `direction` across `apps/mobile/Patina/Patina/` returns layout hits, a coaching hint and
one piece of editorial prose. **There is no "shared direction" model, endpoint or view.** The
deck's own mock draws "Revision 3", which is a real thing — the Stage-2 project approval carries an
edition, an authority revision and an artifact hash
(`DecisionsAPIClient+ProjectApprovals.swift:25,215,247`). Phase 4 should bind to that or specify a
new projection. As written it is an engineering phase waiting on a product noun.

### F-5 — Phase 4 would be the client app's *second* cache, and the deck does not say so
`Patina/Core/Persistence/RecordSnapshotStore.swift` already writes `house-record.json` to the App
Group, per-owner, cleared on sign-out, with row-by-row forward-compatible decoding
(`HouseRecord.swift:283-310`), and `HouseRecord.Kind.decisionAsked` is *already* the "next requested
decision" line on Today. What it caches is the **summary row**, not the record behind it — tapping
through is still a live fetch, and that is the real gap. Adding SwiftData models without saying so
gives the app two caching mechanisms with two freshness stories. Either extend the snapshot rail or
deliberately retire it; do not add the second silently.

### F-6 — Field's store has no migration plan, and four phases add models to it
`CaptureStore.schema` is a bare `Schema([...])` with no `SchemaMigrationPlan`
(`CaptureStore.swift:80-108`). Its only recovery is `didResetIncompatibleStore`, which **discards
the designer's unsynced offline queue** — in the app whose entire design premise is that the queue
survives. Patina fixed this exact defect (`PatinaSchema.swift`, whose header narrates the crash
loop it prevents); Field never did. P0-08, P2-08 and P3-03 all add or change persisted properties.
**P0-09 is a prerequisite the deck's roadmap does not contain.**

### F-7 — "Field has no copy tests at all" is not quite right, and the real gap is more specific
Field has `CaptureTests/FieldVerbCopyTests.swift` and `FieldExperienceTests.swift:313` pins
`FieldCopyAudit.forbiddenWords`. What it lacks is the *mechanism*: there is no `SourcePin`
equivalent, so no Field test can read a `.swift` file and assert on a literal inside a view — only
value-returning helpers can be pinned. Porting `PatinaTests/SourcePin.swift` (**P1-05**) is the
prerequisite for the whole Phase 1 copy-test item, and the deck treats the suite as one thing.

### F-8 — "Reach the six screens" cannot be proven by the gate that will be run
`capture-gate.sh test` runs the `CaptureKit` scheme
(`scripts/capture-gate.sh:22`), whose test target is the **host-less logic bundle** `CaptureTests`.
`CaptureUITests` runs only through the `Capture` scheme, is in neither `all` nor CI, and contains
exactly one file. Reachability in a Release build is precisely what a logic bundle cannot
demonstrate. Every P0-05/06/07 item must name `FIELD-UI` **and** `FIELD-RELEASE`, and someone has to
write Field's second and third UI tests.

### F-9 — Phase 0's Action Button fix is described on the wrong axis
Both `ReadyScreen.swift`'s header comment and the deck say "Non-Pro devices skip the Action Button
tip." Astra's correction (§S1, unsupportedApiAssumptions) is right and the deck did not carry it
into the roadmap: **base iPhone 16 and 16 Plus have an Action Button; no iPhone 14 does, including
14 Pro.** A "Pro" predicate implemented literally would ship the same class of bug the item exists
to fix. P0-02 must encode a device list.

### F-10 — Two items that belong in the roadmap and are not in it
- **The empty-input defect (P0-12).** `SmartGuessSheet.swift:209` calls the guess service with
  `ocr: []` and `codes: []` while the protocol accepts both and the app already computes both. The
  deck names it in prose ("It has a missing-input problem before it has a model problem") and then
  schedules nothing. It is the cheapest accuracy win in the program and it is a Phase 0 repair.
- **Patina's microphone string (P5-13).** `Patina.xcodeproj/project.pbxproj:681,728` promises "a
  voice conversation" and the app has no `Speech` import and no `AVAudioEngine`. The deck's slide 9
  names it under "Patina promises a voice" and the roadmap has no row for it. A usage string with
  nothing behind it is an App Review risk, and this program's whole premise is not shipping
  promises the code does not keep.

### F-11 — The `supabase-swift` convergence hides a typo, not just drift
`Patina.xcodeproj/project.pbxproj:909-910` declares `minimumVersion = 2.5.1` — which is version
**2.5.1**, not 2.51.0, and is why Patina resolved to 2.40.0 while Field resolved to 2.55.1 and the
shared `Mobile.xcworkspace` resolved to 2.51.0. Converging the three `Package.resolved` files
without fixing the requirement will re-diverge on the next resolve. Use `exactVersion` in both
projects.
