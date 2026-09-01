# Patina iOS — Sprint Plan

**Date:** 2026-05-30
**Scope:** `apps/mobile/Patina/` (~300 Swift files, iOS 18+ / Swift 6.2, optimised for iOS 26.5)
**Source reports:** [Engineering](./patina-ios-review-engineering.md) · [Visual & UX](./patina-ios-review-design.md) · [Accessibility](./patina-ios-review-accessibility.md) · [Information Architecture](./patina-ios-review-ia.md)
**Audience:** iOS engineers + designer + PM

---

Translates the four review tracks into a 12-week, 6-sprint plan organised by **Epic → Story**. Each story carries an effort estimate, acceptance criteria, source citations from the reviews, and (where useful) example file references.

## How to read this plan

- **Sprint** — a 2-week unit of work. Total plan: 6 sprints / 12 weeks.
- **Epic** — a coherent thread of related work, scoped to deliver a single capability or remove a single class of debt.
- **Story** — a discrete unit a single engineer can pick up and finish, with verifiable acceptance criteria.
- **Effort** — `S` ≤ 2 days · `M` 3–5 days · `L` 1–2 weeks · `XL` ≥ 2 weeks (split before pulling).
- **Source** — which of the four reviews surfaced the issue.

Assumed capacity: **2 iOS engineers + 0.5 designer**. If headcount changes, parallelise within a sprint by epic.

> **Definition of Done** (applies to every story): code merged to `main`, no new SwiftLint warnings in touched files, unit / snapshot tests where relevant, `pnpm prisma:generate` clean if migrations touched, smoke-tested on a LiDAR device for any scan-pipeline changes, screenshot in PR description for any UI change.

---

## Sprint 0 — Stop-the-bleed (Week 1, half-sprint)

A one-week burst focused on the critical foot-guns and accessibility blockers identified across all four reviews. Nothing here is bigger than `M`; everything is high impact-per-hour.

### Epic E1 — Critical safety & a11y blockers

| Story | Title | Effort | Source |
|---|---|---|---|
| **PT-0-1** | Fix `AppCoordinator` default environment value | S | Engineering |
| **PT-0-2** | Label the Companion bubble & header buttons | S | A11y |
| **PT-0-3** | Introduce `clayDeep` + `PatinaColors.Text.interactive` | S | A11y / Design |
| **PT-0-4** | Sweep image-only button labels (top 12 surfaces) | M | A11y |
| **PT-0-5** | Wire `SettingsView` as the actual settings sheet (or delete it) | S | IA |
| **PT-0-6** | Make `.profile` reachable from `DailyGreetingHeader` monogram | S | IA |
| **PT-0-7** | Bump sub-44pt taps on Companion close/help + WalkView top bar | S | A11y / Design |

**PT-0-1 — Fix AppCoordinator default environment value**
- *Why:* `AppCoordinatorKey.defaultValue = AppCoordinator()` instantiates a fresh coordinator (with its own splash task, phase observer, navigation path) whenever the env value is read outside the injected path. Latent foot-gun, single line.
- *Acceptance:*
  - `AppCoordinatorKey.defaultValue` is `nil` in production, returns a documented `.preview` instance in DEBUG only.
  - `@Environment(\.appCoordinator)` accessors trap (DEBUG `fatalError`) if no coordinator is injected, or unwrap an `Optional<AppCoordinator>`.
  - No regressions in `#Preview` blocks; previews explicitly inject a coordinator.
- *Files:* `App/Coordinators/AppCoordinator.swift:666–668`.

**PT-0-2 — Label the Companion bubble & header buttons**
- *Why:* The Companion replaces the tab bar and is the app's only persistent navigator. Currently `companionMark` is made tappable via `.onTapGesture` with no `accessibilityLabel`, no `.isButton` trait, no `accessibilityHint`. VoiceOver users cannot enter the app's primary nav.
- *Acceptance:*
  - `companionMark` carries `.accessibilityElement(children: .ignore)`, `.accessibilityLabel("Companion")`, `.accessibilityHint("Opens actions for \(coordinator.currentScreen.displayName).")`, `.accessibilityAddTraits(.isButton)`.
  - Help (`?`) and close (`x`) buttons in the panel header are 44×44 minimum hit area with explicit `accessibilityLabel`s.
  - VoiceOver demo recorded on PR: focus → speak → activate.
- *Files:* `Features/Companion/Views/CompanionOverlay.swift:191–195, 252–275`.

**PT-0-3 — Introduce `clayDeep` + `Text.interactive` token**
- *Why:* Brand interactive tint `clay` (#C4A57B) scores 2.18:1 on the canonical off-white — fails WCAG AA for text and large UI. Five other brand tokens (sage, terracotta, goldenHour, success, warning) also fail.
- *Acceptance:*
  - `Design/Tokens/PatinaColors.swift` adds `clayDeep = Color(hex: "9F7E48")` (≥ 4.5:1 vs `offWhite`).
  - New nested enum: `PatinaColors.Text { primary, secondary, muted, interactive, inverse }` with `interactive = clayDeep`.
  - Original `clay` retained for decorative use (chip fills, progress strokes on dark surfaces).
  - No call-site sweeps yet — those land in E5-S4.
- *Files:* `Design/Tokens/PatinaColors.swift:20`.

**PT-0-4 — Sweep image-only button labels (top 12 surfaces)**
- *Why:* ~half of the ~44 image-only buttons across the app are unlabeled. Highest-traffic: Collections "+", Walk close, Emergence close, Profile gear, QR scanner close+help, ShareScanSheet, ThreadDetailView send, InputBar send, Recommendations heart, ReceiveDeliveryView remove-photo, RoomItemRow "⋯".
- *Acceptance:*
  - Each of the 12 listed surfaces has `.accessibilityLabel(_:)` on every image-only button.
  - Test via Xcode → Accessibility Inspector audit; zero "missing accessibility label" warnings on those screens.
- *Files:* see Accessibility report §4 for the full list with line numbers.

**PT-0-5 — Wire `SettingsView` as the actual settings sheet (or delete it)**
- *Why:* `.settings` route renders `AccountView` instead. The real `SettingsView` (notifications, haptics, cellular upload) exists only in its own `#Preview`. The word "Settings" lies.
- *Acceptance:*
  - Decision recorded in PR description: either (a) `SettingsView` replaces the sheet binding and `AccountView` becomes a "View account" subscreen reachable from it, or (b) `SettingsView.swift` is deleted and its toggles are absorbed into `AccountView`.
  - In option (a): the `showingSettings` sheet binding mounts `SettingsView`; haptics/notifications/cellular toggles are now reachable.
  - Smoke test: from Companion → Settings, user can toggle haptics and the change persists.
- *Files:* `Features/Settings/Views/SettingsView.swift`, `App/Coordinators/AppCoordinator.swift` (sheet binding), `ContentView.swift`.

**PT-0-6 — Make `.profile` reachable from the monogram**
- *Why:* No view explicitly calls `coordinator.navigate(to: .profile)`; the monogram in `DailyGreetingHeader` is a static label. The first-launch tour anchors a coachmark to "profile monogram" — but the anchor modifier is never applied.
- *Acceptance:*
  - Monogram in `DailyGreetingHeader` becomes a `Button { coordinator.navigate(to: .profile) }`.
  - `.firstLaunchTourAnchor(.profileMonogram)` is applied to the monogram view.
  - Same affordance added to the analogous header chip in `DesignerHomeView`.
  - Smoke test: tap the monogram → ProfileView opens; first-launch tour Step 3 popover anchors correctly.
- *Files:* `Features/Home/Views/DailyGreetingHeader.swift`, `Features/Designer/Views/DesignerHomeView.swift`.

**PT-0-7 — Bump sub-44pt taps on Companion close/help + WalkView top bar**
- *Why:* HIG min hit target = 44×44pt. Current sizes: Companion close/help 28pt, WalkView close/pause ~32pt, BackChevronButton 36pt.
- *Acceptance:*
  - All listed buttons wrap their image in `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())`.
  - Visual size unchanged; only hit area grows.
- *Files:* `Features/Companion/Views/CompanionOverlay.swift:252, 266`; `Features/Walk/Views/WalkView.swift:540`; `Design/Components/BackChevronButton.swift` (if exists, else inline call sites).

---

## Sprint 1 — Foundation: tokens, lint, API hygiene (Weeks 2–3)

Lock down the design system and start the deprecated-API sweep. Codemods first so subsequent sprints can build on a clean base.

### Epic E2 — Design token enforcement

**PT-1-1 — Codemod `Font.custom(...)` → `PatinaTypography.*`** *(M)*
- *Why:* ~159 inline `Font.custom(...)` calls bypass tokens and lose Dynamic Type (zero of them pass `relativeTo:`).
- *Acceptance:*
  - Script (`scripts/codemod-fonts.swift` or `ts-node`) rewrites `Font.custom("PlayfairDisplay-Italic", size: 22)` → nearest `PatinaTypography` token at every call site.
  - For sizes that don't match an existing token, add a token first (PR contains the additions).
  - PostHog screen visual regression diff passes (or hand-checked via MobAI on iPhone 17 Pro Max).
  - `rg -t swift 'Font\.custom\('` in `Features/` returns < 10 hits (all justified, with a `// allow:` comment).
- *Files:* see Engineering report §1d for the file list (Home, Profile, ARPlacement, DailyProductDetail, conversation screens).

**PT-1-2 — Codemod deprecated `clayBeige` / `mochaBrown`** *(S)*
- *Why:* 213 references to deprecated aliases across 15 files. Deprecation is decorative without enforcement.
- *Acceptance:*
  - All call sites updated to current names (`clay`, `mocha`).
  - Deprecated aliases removed from `PatinaColors.swift:97–101`.
  - Zero deprecation warnings on a clean build.
- *Files:* see Engineering report §1c for the call-site list.

**PT-1-3 — Spacing audit & token additions** *(M)*
- *Why:* ~50 raw integer paddings vs ~46 token uses. `xxs` and `xs` are both 4 (duplicate). No 12pt step despite 12 being the most-used raw value.
- *Acceptance:*
  - `PatinaSpacing.swift` adds `xsm: 12`, `mdLarge: 20`; deduplicates `xxs`/`xs`.
  - Codemod replaces matching raw paddings with the new tokens.
  - `rg -t swift '\.padding\([^)]*, *(12|20|24|32)\)' Features/` returns < 20 hits (all justified).
- *Files:* `Design/Tokens/PatinaSpacing.swift`; sweep Features/.

**PT-1-4 — Floor mono font sizes at 10pt** *(S)*
- *Why:* `monoTiny` at 8pt uppercase tracked DM Mono on aged-oak is the legibly-weakest type in the system. `RoomItemRow.swift:36` is 7pt for maker names.
- *Acceptance:*
  - Deprecate `monoTiny` (8pt); add `monoLabel` at 10pt with tracking reduced to 0.3.
  - All `MonoLabel` defaults bumped.
  - `RoomItemRow.swift:36` uses `bodySmall` (14pt) for maker names.
- *Files:* `Design/Tokens/PatinaTypography.swift`; `Design/Components/MonoLabel.swift`; `Features/Rooms/Components/RoomItemRow.swift`.

**PT-1-5 — Add SwiftLint rules: no `Font.custom` in Features/, no image-only Button without label** *(S)*
- *Why:* Codemod without enforcement decays in 2 sprints.
- *Acceptance:*
  - `.swiftlint.yml` adds custom regex rule `disallow_font_custom_in_features` (matches `Font\.custom\(`, restricted to `Features/`).
  - Custom rule `image_button_needs_accessibility_label` (matches `Button .* label: .*Image\(systemName:` without sibling `.accessibilityLabel`).
  - Both rules enforced as warning in CI; promoted to error after Sprint 2.

### Epic E3 — Modern SwiftUI API migration (codemod-able)

**PT-1-6 — Codemod `.foregroundColor(_:)` → `.foregroundStyle(_:)`** *(M)*
- *Why:* 786 calls across 106 files. Deprecated since iOS 17; only `foregroundStyle` interacts correctly with Material, hierarchical styles, gradients, SF Symbol multicolor.
- *Acceptance:*
  - Codemod replaces all call sites.
  - `rg '\.foregroundColor\(' --type swift` returns 0 hits.
  - No visual regressions (the two are runtime-equivalent for `Color` argument).
- *Files:* across `Features/` and `Design/Components/`.

**PT-1-7 — Codemod `.navigationBarHidden(true)` & `.navigationBarTitleDisplayMode(_:)`** *(S)*
- *Why:* 36 + 29 deprecated calls. iOS 16 introduced `.toolbar(.hidden, for: .navigationBar)` and `.toolbarTitleDisplayMode(_:)`.
- *Acceptance:*
  - Codemod replacement; zero remaining hits.
  - `ContentView.swift:190–351` no longer has 21 inline calls.

**PT-1-8 — Codemod `.cornerRadius(_:)` → `.clipShape(RoundedRectangle(cornerRadius:))`** *(S)*
- *Why:* 49 deprecated calls. The same files use `clipShape` elsewhere — project already knows about it.
- *Acceptance:*
  - Codemod replacement; zero remaining hits.

**PT-1-9 — Adopt `@Entry` macro for 4 EnvironmentKeys** *(S)*
- *Why:* `AppCoordinator.swift:666`, `FirstLaunchCoordinator.swift:249`, `FirstLaunchTour.swift:484`, `CameraPermissionService.swift:107` are 6-line boilerplate each. `@Entry` collapses to 1 line.
- *Acceptance:*
  - Each replaced with `@Entry var ...` extension on `EnvironmentValues`.
  - Manual `EnvironmentKey` structs deleted.

---

## Sprint 2 — Accessibility coverage (Weeks 4–5)

Bring the rest of the app up to the standard already set by the Help/StyleConversation/RoomScan islands.

### Epic E5 — Accessibility coverage

**PT-2-1 — Ship `accessibleHitTarget(label:hint:)` modifier + sweep** *(M)*
- *Why:* Need a single project-wide pattern so future PRs default to compliant.
- *Acceptance:*
  - New file `Design/Accessibility/AccessibleHitTarget.swift` per the A11y report §Quick-wins template (label, optional hint, 44×44 min, `.isButton`, `contentShape(Rectangle())`).
  - Applied to `QuickActionChip`, `FilterChip`, `InputBar.sendButton`, every `xmark` close button, every `⋯` row actions button.
  - All buttons listed in A11y report §7 are ≥ 44pt hit area.
- *Files:* new file in `Design/Accessibility/`.

**PT-2-2 — Dynamic Type relativeTo: backfill for 158 inline custom fonts** *(M)*
- *Why:* `rg '\.font\(\.custom\(.*relativeTo' --type swift | wc -l` → 0. Every inline `Font.custom` size won't scale.
- *Acceptance:*
  - All remaining `Font.custom(...)` calls (after PT-1-1's reduction) pass `relativeTo:` matched to the nearest `Font.TextStyle`.
  - `@ScaledMetric` added to spacing values in hero screens (Reveal, SoftLanding, Walk welcome) so layouts hold at `.accessibility3`.
  - Visual test at `.accessibility5` recorded on PR: at minimum no clipping on home, profile, scan review.

**PT-2-3 — Reduce Motion coverage backfill** *(S)*
- *Why:* `RoomScan/*`, Companion's mark, and `StyleReveal` respect Reduce Motion. `PulseAnimation`, `InputBar.VoiceButton`, `MessageBubble`, `TypingIndicator`, `TableItemCard`, `CollectionsView` tab switcher, `QuickActionsBar` don't.
- *Acceptance:*
  - Each listed animation reads `@Environment(\.accessibilityReduceMotion)` and disables the animation (returns `nil` instead of `.spring(...)`).
  - Settings → Accessibility → Reduce Motion ON: smoke-test confirms no repeating pulses, no spring entrances, no Table drift.
- *Files:* see A11y report §6.

**PT-2-4 — Add `accessibilityAction(named:)` to every custom gesture** *(L)*
- *Why:* Zero `accessibilityAction` in the entire codebase. VoiceOver users cannot save/skip a recommendation, position a Table piece, hold a threshold, or trigger Linger reveals.
- *Acceptance:*
  - `RecommendationsView.swift:148–167` swipe-to-save / skip → also `.accessibilityAction(named: "Save") { … }` + `.accessibilityAction(named: "Skip") { … }`.
  - `TableItemCard` drag → `accessibilityAction(named: "Move to…") { … }` opening a destination picker.
  - `HoldGesture` + `LingerGesture` → also handle tap as the accessible alternative when `UIAccessibility.isVoiceOverRunning`.
  - `CompanionPullGesture.companionLongPressGesture` voice activation → `.accessibilityAction(named: "Start voice input")`.
- *Files:* `Design/Gestures/*`; `Features/Recommendations/Views/RecommendationsView.swift`; `Features/Table/Components/TableItemCard.swift`; `Features/Companion/Components/InputBar.swift`.

**PT-2-5 — Combine custom rows into accessibility elements** *(S)*
- *Why:* `MessageBubble`, `TableItemCard`, `RoomItemRow`, `NotificationFeedView.notificationRow`, `CollectionsView` boards, `RecommendationsView.productCard` stack title / subtitle / metadata as separate Text — VoiceOver focus stops on each.
- *Acceptance:*
  - Each row uses `.accessibilityElement(children: .combine)`.
  - Aggregated label includes title + key metadata + state (read/unread, saved/not).
  - VoiceOver demo recorded for one screen per row type.

**PT-2-6 — `accessibilityValue` on custom progress** *(S)*
- *Why:* `rg accessibilityValue` returns nothing. Custom rings/bars in scan HUD, Companion journey ring, Walk progress, HoldGesture are opaque to VoiceOver.
- *Acceptance:*
  - Each custom progress view exposes `.accessibilityValue("\(Int(progress*100)) percent")` and updates as progress changes.
- *Files:* `Features/RoomScan/Shared/Components/ScanHUDView.swift`; `Features/Companion/Views/CompanionOverlay.swift:332–346`; `Features/Walk/Components/WalkProgressIndicator.swift`; `Features/RoomScan/Views/ScanSavedConfirmationView.swift`; `Design/Gestures/HoldGesture.swift`.

**PT-2-7 — Sweep `clay` → `PatinaColors.Text.interactive` at text/icon sites** *(M)*
- *Why:* PT-0-3 introduced the token; this sweeps the call sites.
- *Acceptance:*
  - All text and icon uses of `PatinaColors.clay` migrated to `PatinaColors.Text.interactive` (= `clayDeep`).
  - Decorative backgrounds keep the lighter shade.
  - Axe / Accessibility Inspector contrast scan: zero AA failures on home, profile, scan review, recommendations.

**PT-2-8 — Make notification unread state visible & audible** *(S)*
- *Why:* `notification.isRead ? Color.clear : clay.opacity(0.04)` = 1.03:1 — invisible. No badge, no a11y label change.
- *Acceptance:*
  - Unread row shows a 8pt `clayDeep` dot; background tint bumped to `clayDeep.opacity(0.08)`.
  - Combined accessibility label prefixes "Unread. " for unread rows.
- *Files:* `Features/Notifications/Views/NotificationFeedView.swift:130–176`.

---

## Sprint 3 — Observation migration & route hygiene (Weeks 6–7)

### Epic E4 — Observation migration

**PT-3-1 — Migrate 13 scan-pipeline services from `ObservableObject` to `@Observable`** *(L)*
- *Why:* SwiftUI is running two invalidation systems in the same app. Affected services: `RoomCaptureService`, `WalkNarrationService`, `StyleSignalService`, `RoomScanSyncService`, `FrameCaptureService`, `PosedPhotoService`, `CameraPermissionService`, `DesignServicesService`, `ScanSharingService`, `ARPlacementManager`, + 3 more in the sync pipeline.
- *Acceptance:*
  - Each class drops `: ObservableObject` and `@Published`, gains `@Observable`.
  - Consumers switch from `@StateObject` / `@ObservedObject` to `@State` or direct read.
  - No `@StateObject = SomeSingleton.shared` remains (see PT-3-2).
  - Unit/snapshot tests still pass; smoke-test scan flow on iPhone 17 Pro Max.
- *Files:* `Features/Walk/Services/`; `Features/RoomScan/Shared/Services/`; `Services/Sync/`; `Services/Auth/`.

**PT-3-2 — Remove 5 `@StateObject = SomeSingleton.shared` misuses** *(S)*
- *Why:* `@StateObject` is meant to own the lifetime of a fresh instance; wrapping a singleton inverts the contract and confuses readers.
- *Acceptance:*
  - `WalkView.swift:24`, `PreScanChecklistView.swift:15`, `CameraPermissionView.swift:16`, `ShareScanSheet.swift:34`, `RequestDesignServicesSheet.swift:30` use either `@Environment(...)` or direct `Service.shared` reads in `.task`.

**PT-3-3 — Replace `DispatchQueue.main.asyncAfter` cascades with `Task.sleep`** *(M)*
- *Why:* 30 calls — most in @Observable types — can become structured-concurrency Tasks: cancellable, actor-aware, type-safe.
- *Acceptance:*
  - Worst offenders rewritten first: `RevealView:166,172,179`; `EmergenceViewModel:68,76,93`; `CompanionOverlay:248,303,502`.
  - `rg 'DispatchQueue\.main\.asyncAfter' --type swift Features/` returns < 5 hits (all justified with a comment).
  - `Features/Splash/Views/SplashView.swift:53` 2-second deadline deleted (dead code per `PatinaApp.swift:31–34`).

**PT-3-4 — Annotate `@MainActor` where Observation+threading is implicit** *(S)*
- *Why:* `DailyRoomViewModel` and others run detached Tasks that bounce back through `MainActor.run`. `AppCoordinator.init` schedules a Task only to bridge MainActor.
- *Acceptance:*
  - `DailyRoomViewModel` marked `@MainActor`; internal `MainActor.run` bounces removed.
  - `AppCoordinator` marked `@MainActor` at the class level; `Task { @MainActor in self.observePhaseInputs() }` collapsed to a direct call.
  - 38 `MainActor.run` calls audited — keep where crossing actor boundaries, remove where redundant.

### Epic E6 — Route hygiene

**PT-3-5 — Consolidate scan-flow routes for analytics integrity** *(S)*
- *Why:* PostHog logs three different screen names ("Walk", "Walking", "Re-scan Room") for the same flow. Funnel data is corrupted at entry.
- *Acceptance:*
  - New canonical route `.scanFlow(reason:)` with `reason: ScanReason { fresh, rescan, fromConversation }`.
  - `.walk`, `.walkSession`, `.rescan`, `.scanThreshold`, `.scanFallbackEntry` route to `.scanFlow(...)` with the appropriate reason.
  - PostHog event payload carries `reason`; screen name is constant "Quiet Conversation".

**PT-3-6 — Split `AppRoute` into user-facing + internal flow steps** *(M)*
- *Why:* 44 cases, ~25 user-reachable; `scanWalk`/`scanReview`/`scanSoftLanding`/`scanConversation`/`scanReveal`/`scanFloorPlan` all return `EmptyView()` because the host manages them internally.
- *Acceptance:*
  - New enums: `AppRoute` (≤ 25 cases, all with a real destination) and `InternalFlowStep` (used only inside `QuietConversationFlowHost` for its `@State`).
  - `EmptyView()` destinations deleted.
  - `displayName` map collapsed accordingly.

**PT-3-7 — Surface notifications as a header affordance** *(S)*
- *Why:* Notifications reachable only via the Companion. A user with badged unread can't find the inbox.
- *Acceptance:*
  - `DailyGreetingHeader` + `DesignerHomeView` header rows get a bell icon next to the existing "?" help glyph.
  - Bell shows an unread-count badge driven by `NotificationsViewModel`.
  - Tap navigates to `.notifications`.

**PT-3-8 — Convert 5 boolean sheet flags to a single `.sheet(item:)` pattern** *(M)*
- *Why:* `showingDesignServices`, `showingQRScanner`, `showingSettings`, `showingNewRoom`, `showingMoveItem` are wired with manual `Binding(get:, set:)` blocks at `ContentView.swift:71–108`. Five sheets stacked, racy dismissals.
- *Acceptance:*
  - New `enum PresentedSheet { case settings, qr, designServices(roomId: UUID?), newRoom, moveItem(item: Item) }` on the coordinator.
  - Single `.sheet(item: $coordinator.presentedSheet)` in ContentView.
  - Five `showing*` booleans removed.

**PT-3-9 — Clear sheet flags on `.auth` / `.launching` phase transitions** *(S)*
- *Why:* Open QR scanner + auth event flipping to `.auth` re-presents the sheet over the auth screen on next render.
- *Acceptance:*
  - `recomputePhase()` sets `presentedSheet = nil` on transitions to `.auth` or `.launching`.

---

## Sprint 4 — Dead-code removal & onboarding repair (Weeks 8–9)

### Epic E7 — Dead code removal

Each story is its own small PR (`git rm` + cleanup).

**PT-4-1 — Delete `Features/Threshold/`** *(S)*
- *Why:* `.threshold` is special-cased to redirect to home; the folder is only consumed by the dead `FirstLaunchCoordinator`. Future engineers see "Threshold" in `AppRoute` and assume there's a screen.
- *Acceptance:*
  - Folder deleted; `TimeOfDay` moved to `Design/Tokens/` if still used; `.threshold` route case removed; all references compile clean.

**PT-4-2 — Delete `FirstLaunchCoordinator` + `FirstLaunchState`** *(S)*
- *Why:* Full 8-state machine; never instantiated outside its own files. Actual onboarding is `OnboardingFlowHost`.
- *Acceptance:*
  - Both files deleted; `WalkInvitationView`, `CameraPermissionView`, `RoomNamingView`, `WalkCompleteView` audited: kept only if revived for Walk-First (see PT-4-7) or deleted.

**PT-4-3 — Delete `Features/Conversation/` folder** *(S)*
- *Why:* `ConversationView` is the only destination for `.conversation`, but nothing navigates to `.conversation`. Confused with `StyleConversation` and `Companion` chat.
- *Acceptance:*
  - PM confirms folder is legacy (Slack thread linked in PR).
  - Folder + `.conversation` route deleted.

**PT-4-4 — Delete `EmergenceView`, `EmergenceViewModel`** *(S)*
- *Why:* `.emergence(pieceId:)` routes to `RecommendationsView` or `ProductDetailView`; `EmergenceView` is referenced only by its own preview.
- *Acceptance:*
  - Files deleted; sub-components (`PieceRevealView`, `PieceStoryCard`, `EmergenceActionButtons`) deleted if unused elsewhere.

**PT-4-5 — Delete `Features/Table/` (physics scatter view) — or commit to it** *(M, decision required)*
- *Why:* TableView with three view modes + `TablePhysicsEngine` is implemented; `.table` route renders `CollectionsView`. Beautiful experiment, currently not shipping.
- *Acceptance:*
  - PM/Design decision recorded: ship Table as the canonical "saved items" surface and migrate `.table` route → TableView, OR delete the folder.
  - One PR implements the decision end-to-end.

**PT-4-6 — Delete deprecated `WalkView` v1** *(S)*
- *Why:* `WalkView.syncRoomScan` is marked `@available(*, deprecated, ...)`; used only by its own preview.
- *Acceptance:*
  - `WalkView.swift`, `WalkViewModel`, `MockRoomScanView` audited; deleted once confirmed nothing else imports them.
  - `AppCoordinator.navigate(to: .walk)` continues to route through `QuietConversationFlowHost`.

### Epic E8 — Onboarding & flow repair

**PT-4-7 — Decide & implement onboarding philosophy** *(L, decision required)*
- *Why:* The "Walk-First, 60-seconds-to-magic" idea documented in `FirstLaunchState.swift` is not what ships. Real path: Splash → Auth → Carousel → Style Quiz → empty DailyRoom with one CTA. Style quiz happens before the user has any room.
- *Acceptance:*
  - PM/Design align on either (a) commit to Walk-First (revive a streamlined coordinator: camera permission → walk → reveal → quiz) or (b) keep quiz-first and delete the Walk-First docs.
  - Implementation lands behind a PostHog flag.
  - Funnel metric defined and instrumented: % of new users with ≥1 scan in their first session.

**PT-4-8 — Skip Style Conversation Movement 2 when user already has a profile** *(S)*
- *Why:* A returning user who scans their first room sees the style quiz twice (onboarding + Quiet Conversation).
- *Acceptance:*
  - `QuietConversationFlowHost` checks `StyleProfileStore.shared.currentProfile`; if non-nil, skips Movement 2 and routes Walk → SavedConfirmation → SoftLanding → FloorPlan.
  - "Refine my style" link in Reveal/Profile re-enters Movement 2 on demand.

**PT-4-9 — Add "Save & continue later" affordance to QuietConversationFlowHost** *(M)*
- *Why:* 7-step linear gauntlet with no exit. Users who run out of time lose their scan.
- *Acceptance:*
  - Persistent "Save & continue later" button in the host's chrome.
  - State persists to `ScanManifest` so resuming lands at the same step.
  - Resume entry point in DailyRoom: a "Continue your scan" card if a saved-in-progress scan exists.

**PT-4-10 — Mode-switch chip on DailyRoomView + DesignerHomeView headers** *(S)*
- *Why:* Dual-mode toggle is 3 taps deep (Companion → Settings → Workspace).
- *Acceptance:*
  - For dual-role users only, header shows a "DESIGNER" / "CONSUMER" mono chip next to the help glyph; tap to switch.
  - Switching updates `SettingsService.shared.preferredHomeMode` and re-routes `mainHomeView`.
  - PostHog event `home_mode_switched` captures source = "header".

---

## Sprint 5 — Design-system expansion & iOS-26 fit (Weeks 10–11)

### Epic E9 — Design system expansion

**PT-5-1 — Ship `PatinaCard` component** *(M)*
- *Why:* Every feature builds its own rounded-rect-with-softCream-background-and-pearl-stroke (see `ScanReviewView:233`, `ScanReviewView:478`, `ProfileView:243`).
- *Acceptance:*
  - `Design/Components/PatinaCard.swift` with API: `PatinaCard(style: .surface|.elevated|.outline) { content }`.
  - Three highest-traffic call sites migrated as part of this PR; others tracked in follow-up.

**PT-5-2 — Ship `PatinaTextField`** *(M)*
- *Why:* 18 `TextField(...)` re-rolls of softCream + pearl border.
- *Acceptance:*
  - Component matches the de-facto pattern in `ScanReviewView:228`.
  - Supports label, placeholder, helper text, error state, secure variant.
  - Three highest-traffic call sites migrated.

**PT-5-3 — Ship `PatinaStatusBadge`** *(S)*
- *Why:* Sync status ("Saving", "Saved locally", error) reappears in WalkView, ScanUploadProgressView, others with different visuals.
- *Acceptance:*
  - One component with `.info`, `.success`, `.warning`, `.error` states.
  - Migrate `WalkView.swift:628` + `ScanUploadProgressView`.

**PT-5-4 — Ship `PatinaSheetHeader`** *(S)*
- *Why:* "Discard / title-as-eyebrow / Done" toolbar pattern reappears in every modal (`ScanReviewView:166` etc.).
- *Acceptance:*
  - Component takes title, optional eyebrow, leading + trailing actions.
  - Migrate `ScanReviewView`, `AccountView`, `RequestDesignServicesSheet`.

**PT-5-5 — Ship `PatinaEmptyState`** *(S)*
- *Why:* `DailyRoomEmptyState`, `TableView.emptyState`, others share structure (icon-in-rounded-square + serif headline + body + CTA).
- *Acceptance:*
  - Component takes icon, title, body, optional CTA.
  - Migrate `DailyRoomEmptyState`, `TableView` (if kept), Collections empty.

**PT-5-6 — `PatinaButton` variants: loading, disabled, destructive, icon** *(M)*
- *Why:* Currently no spinner, no destructive variant, no `isEnabled` visual. Every feature reinvents (e.g. `StyleContinueButton`, `WalkErrorView`'s `primaryButton`).
- *Acceptance:*
  - `PatinaButton` adds `isLoading: Bool`, `isEnabled: Bool`, `style: .primary|.secondary|.ghost|.clay|.destructive`, `icon: Image?`.
  - `AuthButton` collapsed into `PatinaButton` variant.
  - Top 3 reinventions migrated.

### Epic E10 — iOS 26 native fit

**PT-5-7 — Adopt Liquid Glass on 6 surfaces that need depth** *(M)*
- *Why:* Zero use of `glassEffect(...)`; 15 `.ultraThinMaterial` are doing the iOS-13 equivalent.
- *Acceptance:*
  - Companion expanded panel, Companion minimal pill, Table header, ProductDetail bottom action bar, Walk top bar, ARPlacement controls all use `.glassEffect(.regular)` (or `.regular.tint(...)`).
  - On-device verification at iOS 26.5.

**PT-5-8 — Adopt `navigationTransition(.zoom(...))` on home → detail morph** *(S)*
- *Why:* Current `matchedGeometryEffect` works but the iOS 18+ zoom is more native.
- *Acceptance:*
  - DailyProductCard → DailyProductDetailView uses `navigationTransition(.zoom(sourceID:in:))`.
  - Verify on device that the existing `matchedGeometryEffect` doesn't conflict.

**PT-5-9 — Ship dark mode for semantic tokens** *(M)*
- *Why:* Every color is hard-coded sRGB. On iOS 26 with system dark mode this looks broken.
- *Acceptance:*
  - `PatinaColors.Background.{primary,secondary}` and `PatinaColors.Text.{primary,secondary,muted,interactive}` use `Color(.init(dynamicProvider:))` with a warm-graphite dark palette (not pure black).
  - All hero screens visually checked in dark mode.
  - Status accent tokens (clay/sage/etc.) audited for dark-mode contrast.

**PT-5-10 — Partial migration to `.sensoryFeedback`** *(S)*
- *Why:* 94 references go through custom `HapticManager`. `sensoryFeedback` binds haptics to state changes declaratively, fits SwiftUI better.
- *Acceptance:*
  - 10 highest-traffic haptic calls migrated to `.sensoryFeedback(.success, trigger: state)` etc.
  - `HapticManager` retained for imperative cases (gesture cancel, etc.).

**PT-5-11 — Sheets: `.presentationCornerRadius(24)` + `.presentationBackgroundInteraction()`** *(S)*
- *Why:* Missing modern sheet polish — Companion panel especially.
- *Acceptance:*
  - All sheets that use `.presentationDetents` also set `.presentationCornerRadius(24)`.
  - Companion panel sets `.presentationBackgroundInteraction(.enabled(upThrough: .medium))` if applicable.

---

## Sprint 6 — Performance, decomposition, polish (Weeks 12+, may need an extra week)

### Epic E11 — Performance & decomposition

**PT-6-1 — Split `RoomScanSyncService` (2564 LOC)** *(XL → split)*
- *Why:* Bus-factor risk; only one engineer holds the whole upload state-machine.
- *Acceptance (slice into 3 PRs):*
  - PR1: extract artifact upload (image, depth, world map, USDZ) into `ArtifactUploader`.
  - PR2: extract retry / queue management into `ScanSyncQueue`.
  - PR3: extract Supabase RPC payload structs into a `Sync/Models/` folder.
  - Resulting `RoomScanSyncService` < 800 LOC; new files < 500 LOC each.

**PT-6-2 — Split `RoomCaptureService` (1177 LOC)** *(L)*
- *Why:* Service + 11 `@Published` + RoomPlan delegate + ARKit + sync, all in one class.
- *Acceptance:*
  - Decomposed into `RoomCaptureSessionDriver` (RoomPlan delegate + AR session), `RoomCaptureAnalyzer` (quality metrics), `RoomCaptureBundleAdapter` (writes to `ScanBundleWriter`).
  - `RoomCaptureService` becomes the façade composing them; < 400 LOC.

**PT-6-3 — Split `ScanReviewView` (1006 LOC)** *(M)*
- *Why:* One view body with hero picker, gallery, notes, scan details, three sheets, save/discard logic.
- *Acceptance:*
  - Extract `ScanReviewHeader`, `HeroPickerSheet`, `PhotoReorderSheet`, `CaptionEditorSheet`, `ScanDetailsSection`.
  - `ScanReviewView` body < 250 LOC.

**PT-6-4 — Split `WalkView` welcome/walking/completed subviews** *(S)*
- *Acceptance:*
  - `welcomeContent`, `walkingContent`, `completedContent` extracted to separate `View` types.

**PT-6-5 — Fix `DateFormatter` per-render allocations** *(S)*
- *Files:* `ProfileView.swift:209`, `TableItemDetailSheet.swift:309`, `RoomProjectView.swift:224`, `RoomSettingsView.swift:204`, `AccountView.swift:252`, `DailyRoomViewModel.swift:59`.
- *Acceptance:*
  - Each site uses a `static let` formatter (or `.formatted(date:time:)` for iOS 15+).

**PT-6-6 — Fix Canvas non-deterministic redraws in `ClayBackground` / `PaperTextureOverlay`** *(S)*
- *Why:* `Canvas` body samples `CGFloat.random` each render → texture twitches on animation.
- *Acceptance:*
  - Texture generated once with a seeded RNG and cached as `Image`, or rendered via `TimelineView(.animation)` with fixed seed.

**PT-6-7 — Replace `UIScreen.main.bounds` with sized container** *(S)*
- *Files:* `RoomCaptureService.swift:160`.
- *Acceptance:*
  - `RoomCaptureView` created with `.zero`; container immediately sizes it.

**PT-6-8 — Audit & reduce `GeometryReader` usage** *(M)*
- *Why:* 18 instances; several can move to `containerRelativeFrame`, `.safeAreaPadding`, `@Environment(\.safeAreaInsets)`.
- *Acceptance:*
  - `CompanionOverlay.swift:84` → `.safeAreaPadding(.bottom, 28)`.
  - `RoomBudgetBar.swift:28` → `Capsule().frame(maxWidth: percent * .infinity)`.
  - `LivingSceneView.swift:25, 96` → single GR (or delete with the Threshold folder).

### Epic E12 — Companion polish

**PT-6-9 — Companion first-launch intro** *(M)*
- *Why:* On first install the brilliant concept is invisible. New users see "What next?" + actions but no explanation.
- *Acceptance:*
  - One-shot coachmark on first Companion expansion: "This is your Companion. Tap any time for what to do next."
  - Dismissal persisted via `SettingsService` / Supabase `help_state`.

**PT-6-10 — Vary "What next?" by context** *(S)*
- *Acceptance:*
  - Title varies by current route: "Where to next?" (home), "Keep scanning?" (mid-walk), "Want a recommendation?" (after a save), etc.
  - Mapping table lives next to `CompanionContextProvider`.

**PT-6-11 — Companion never fully hidden** *(S)*
- *Why:* Hidden during `preScanChecklist`, `floorPlanPreview`, `styleQuiz`. Users lose orientation when they need it most.
- *Acceptance:*
  - In those routes the Companion drops to `.minimal` instead of disappearing.

### Epic E13 — Brand voice & microcopy

**PT-6-12 — Replace 14 "Try Again" strings with brand-voice variants** *(S)*
- *Acceptance:*
  - Strings updated to "Let's try that again" / "Once more" / "Reset and retry" depending on context.

**PT-6-13 — Replace generic loading strings** *(S)*
- *Acceptance:*
  - "Loading…" → "Gathering your scan…" / "Settling in…" / etc., per the report's per-screen recommendations.

**PT-6-14 — Ship `companionSafeArea()` modifier** *(S)*
- *Why:* Every scrollable view appends `Spacer().frame(height: 120)` to clear the Companion. Establish a system modifier so future authors don't have to remember the number.
- *Acceptance:*
  - `Design/Components/CompanionSafeArea.swift` exposes `.companionSafeArea()` modifier.
  - Top 6 scrollable views migrated.

### Epic E14 — Tooling & enforcement

**PT-6-15 — Introduce `PatinaLog` / `os.Logger`** *(M)*
- *Why:* 105 raw `print(...)` calls across Features/App, mixing DEBUG-gated and non-gated.
- *Acceptance:*
  - `PatinaLog` wraps `os.Logger` with categories (`scan`, `auth`, `companion`, etc.).
  - All non-DEBUG-gated `print` calls migrated.
  - Privacy levels (`privacy: .private`) applied to user data.

**PT-6-16 — Replace `NotificationCenter` cross-view bus** *(S)*
- *Why:* `.mockScanCompleted` (Walk) + `.patinaScanRecoveryCandidatesDidAppear` (PatinaApp) are the only such buses; production code uses them.
- *Acceptance:*
  - Each replaced with a typed `@Observable` event publisher injected via `@Environment`.
  - UserDefaults flag at `PatinaApp.swift:93–97` removed in favor of the single channel.

**PT-6-17 — Promote SwiftLint custom rules from warning to error** *(S)*
- *Acceptance:*
  - `disallow_font_custom_in_features`, `image_button_needs_accessibility_label`, plus a new `disallow_foregroundcolor` and `disallow_navigation_bar_hidden` rule are all errors in CI.

---

## Backlog / explicitly deferred

These came up but were intentionally not slotted into a sprint. Decide explicitly rather than letting them drift.

- **B-1.** Separate `Patina Studio` iOS target for designer mode. The IA review's P2 recommendation; touches packaging, CI, App Store listings. Don't start until the rest of the IA is consolidated.
- **B-2.** Retest the iOS 26 NavigationStack destination collapse workaround (`QuietConversationFlowHost.swift:166–169`) on iOS 26.5. If Apple fixed it, collapse the `.fullScreenCover` back to a `step = .review` transition.
- **B-3.** Reconsider 16 named gradients in `PatinaGradients` — collapse to 5 categories OR commit to procedural texture. Pure design call; effort small but needs an aligned designer + engineer pairing day.
- **B-4.** "Match" stat rename to "Resonance" / "Alignment". Brand call; ties into the `HelpTooltip` content; PM should drive.
- **B-5.** Adopt `accessibilityDifferentiateWithoutColor` for unread/read and active-tab indicators.
- **B-6.** Audit `buttonStyle(.plain)` (54 sites) for missing `.accessibilityAddTraits(.isButton)`.
- **B-7.** Voice-input quick-tap alternative for users who can't sustain a long-press (`CompanionPullGesture.companionLongPressGesture`).
- **B-8.** First-launch tour anchor coverage audit (only `savedHeart` is currently wired).
- **B-9.** Magic-link-while-signed-in behavior: treat as a no-op + toast instead of routing through `handleAuthURL`.
- **B-10.** Verify whether the `iOS 26 NavigationStack + ScrollView gesture-recognizer corruption` workaround (the `setCurrentScreen` vs `navigate(to:)` split) is still needed on iOS 26.5.

---

## Sprint summary

| Sprint | Weeks | Theme | Primary epics | Stories | Effort |
|---|---|---|---|---|---|
| 0 | 1 | Stop-the-bleed | E1 | 7 | ~1 week |
| 1 | 2–3 | Foundation | E2, E3 | 9 | 2 weeks |
| 2 | 4–5 | Accessibility coverage | E5 | 8 | 2 weeks |
| 3 | 6–7 | Observation & route hygiene | E4, E6 | 9 | 2 weeks |
| 4 | 8–9 | Dead-code + onboarding | E7, E8 | 10 | 2 weeks |
| 5 | 10–11 | Design system & iOS-26 fit | E9, E10 | 11 | 2 weeks |
| 6 | 12+ | Performance, polish, tooling | E11, E12, E13, E14 | 17 | 2–3 weeks |

**71 stories across 14 epics.** Sprints 0–3 are the safety & hygiene block (must-do). Sprints 4–6 are the brand-leverage block (compounds value over time).

---

## Risks & dependencies

- **Decision-needs (block their stories until resolved):** PT-4-3 (Conversation/ legacy?), PT-4-5 (TableView ship or kill?), PT-4-7 (Walk-First or quiz-first?).
- **Coordination:** PT-1-1 (font codemod) should land before PT-2-2 (Dynamic Type backfill) so the latter operates on a smaller surface.
- **Sequencing:** PT-3-1 (Observation migration) blocks PT-3-2 (StateObject misuse cleanup). Both block PT-6-2 (RoomCaptureService split) since splitting a class is easier under `@Observable`.
- **Device coverage:** Every scan-pipeline story needs an on-device smoke test on a LiDAR iPhone (the LiDAR iPhone 17 Pro Max in Kody's possession is the canonical rig).
- **Analytics regression:** PT-3-5 (route consolidation) changes PostHog screen names. Funnel dashboards owned by PostHog should be updated the same week.

---

*Sprint plan generated from the four parallel review tracks dated 2026-05-30. The full source reports live alongside this file as `patina-ios-review-{engineering,design,accessibility,ia}.md`. A single-page HTML rendering of all five documents can be regenerated locally via `/tmp/patina-ios-review/build_and_serve.py` (serves on `:4346`).*
