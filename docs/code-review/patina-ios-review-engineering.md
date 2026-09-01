# Patina iOS — SwiftUI / Swift 6.2 Engineering Review

**Date:** 2026-05-30
**Scope:** `apps/mobile/Patina/Patina/` (~300 Swift files, 64 k LOC, iOS 18+ / Swift 6.2)
**Track:** 1 of 4 (parallel review tracks)
**Companion docs:** [Visual & UX](./patina-ios-review-design.md) · [Accessibility](./patina-ios-review-accessibility.md) · [Information Architecture](./patina-ios-review-ia.md) · [Sprint Plan](./patina-ios-sprint-plan.md)

---

Repo root: `/Users/kody/Code/patina-merged/apps/mobile/Patina/Patina/`
Sampled: 300 Swift files, 64 k LOC total. Read in full: `App/PatinaApp.swift`,
`App/Coordinators/AppCoordinator.swift`, `App/DeepLinking/DeepLinkHandler.swift`,
`ContentView.swift`, `Design/Tokens/PatinaColors.swift`,
`Design/Tokens/PatinaTypography.swift`, `Design/Components/PatinaButton.swift`,
`Design/Components/StrataMarkView.swift`, `Design/Components/ClayBackground.swift`,
and the largest views in Home / Walk / RoomScan / Companion / StyleQuiz /
Profile / Table / QRAuth / ARPlacement. The rest were sampled via `rg`/`grep`
for systemic patterns.

---

## Summary

Prioritized critical → minor.

- **Critical: `AppCoordinatorKey.defaultValue` instantiates a fresh
  `AppCoordinator()` on every read** when no value is injected. This is also
  used as the production default in `EnvironmentValues`, so any subview that
  consults `coordinator` outside the configured environment silently gets a
  *different* coordinator (with its own splash deadline, navigation path,
  phase observer, and Task). Single line, but it's a foot-gun and a known
  SwiftUI antipattern. — `App/Coordinators/AppCoordinator.swift:666–668`.
- **Critical: Deprecated `mochaBrown` / `clayBeige` color tokens still in use
  in 15 files** despite the typed `@available(*, deprecated)` annotation in
  `PatinaColors.swift:97-101`. The deprecations weren't carried through
  consistently, so the design system is half-migrated. Examples:
  `Features/Companion/Views/CompanionSheet.swift:50,55,125,131`,
  `Features/Walk/Views/WalkView.swift:97,161,...`,
  `Design/Animations/BreathingAnimation.swift:96,100`,
  `Features/Authentication/Views/AuthenticationView.swift:101`.
- **High: Mixed Observation worlds — 13 services still expose `@Published`
  on `ObservableObject` and views bind them with `@StateObject` /
  `@ObservedObject`** while view models everywhere else have moved to
  `@Observable`. This means SwiftUI is running two distinct invalidation
  systems in the same app. The biggest offenders are the scan pipeline
  (`RoomCaptureService`, `WalkNarrationService`, `StyleSignalService`,
  `RoomScanSyncService`, `FrameCaptureService`, `PosedPhotoService`) and a
  handful of cross-cutting singletons (`CameraPermissionService`,
  `DesignServicesService`, `ScanSharingService`, `ARPlacementManager`).
- **High: 5 views use `@StateObject private var x = SomeSingleton.shared`**.
  That isn't what `@StateObject` is for — the view becomes the lifetime owner
  of an already-shared instance, and the singleton's state is otherwise
  observed by no one if those views unmount. Examples:
  `Features/Walk/Views/WalkView.swift:24`,
  `Features/Walk/Views/PreScanChecklistView.swift:15`,
  `Features/FirstLaunch/Views/CameraPermissionView.swift:16`,
  `Features/RoomDetail/Views/ShareScanSheet.swift:34`,
  `Features/RoomDetail/Views/RequestDesignServicesSheet.swift:30`.
- **High: 159 inline `.font(.custom(...))` calls** across the Home, Profile,
  ARPlacement, DailyProductDetail and conversation screens bypass the
  centralized `PatinaTypography` tokens. Dynamic Type scaling won't work
  (`relativeTo:` is not provided), and font-name typos are not caught.
  Example clusters: `Features/Home/Views/DailyProductDetailView.swift`
  (8 calls), `Features/Home/Views/DailyStoryDetailView.swift` (6),
  `Features/Profile/Views/ProfileView.swift:51,186,209`.
- **High: 786 calls to `.foregroundColor(...)` across 106 files.**
  `foregroundColor(_:)` is deprecated on iOS 17; `foregroundStyle(_:)` is the
  modern replacement (and is the *only* path that interacts correctly with
  Material, hierarchical styles, gradients, and SF Symbol multicolor
  rendering). The codebase already calls `foregroundStyle` in places —
  `Features/Emergence/Views/EmergenceView.swift:132,136,174,185`,
  `Features/Profile/Views/ProfileView.swift:34` — so the migration is
  understood but unfinished.
- **High: 36 calls to `.navigationBarHidden(true)`** and 29 to
  `.navigationBarTitleDisplayMode(...)`. Both are deprecated since iOS 16 —
  the modern equivalents are `.toolbar(.hidden, for: .navigationBar)` and
  `.toolbarTitleDisplayMode(_:)`. `ContentView.swift:190-351` alone uses
  `navigationBarHidden` 21 times.
- **High: Three views in the scan pipeline are over budget by an order of
  magnitude.** `Features/Walk/Services/RoomCaptureService.swift` (1177 LOC,
  delegate + 5 published outputs in one class),
  `Features/RoomScan/Views/ScanReviewView.swift` (1006 LOC, single view body
  with hero picker, captions, reorder, save, error states),
  `Features/Walk/Views/WalkView.swift` (693 LOC, owns walk + sync +
  question handling + completion + retry). All three would benefit from being
  decomposed into 200–400-line subviews; today they are hard to reason about
  and impossible to render in `#Preview` realistically.
- **Medium: 30 `DispatchQueue.main.asyncAfter` calls** in view models and
  views, often inside `@Observable` types. Most could become
  `Task { try? await Task.sleep(for: .milliseconds(...)) ; ... }` — easier to
  cancel, doesn't escape the actor isolation. Worst offenders:
  `Features/StyleReveal/Views/RevealView.swift:166,172,179`,
  `Features/Emergence/ViewModels/EmergenceViewModel.swift:68,76,93`,
  `Features/Companion/Views/CompanionOverlay.swift:248,303,502`.
- **Medium: 49 uses of `.cornerRadius(_)`** — deprecated since iOS 13 in
  favor of `.clipShape(RoundedRectangle(cornerRadius:))`. Mixed with
  `clipShape(RoundedRectangle(...))` in the same files, so the project knows
  about it.
- **Medium: Singleton-heavy architecture — 50 `static let shared`
  declarations, 437 `.shared` call sites.** Every view fetches the same
  services from the global namespace; nothing is injected. This makes the
  app effectively untestable in isolation and ties view bodies to network
  side-effects.
- **Minor: A few `Task { @MainActor in }` and `await MainActor.run {}` are
  redundant** when wrapping work that is already on a `@MainActor`-isolated
  type. 38 `MainActor.run` calls and 36 `Task { @MainActor in }` callouts —
  many can collapse to plain `Task { }` once the enclosing type or method is
  marked `@MainActor`.

---

## Findings by Dimension

### 1. Modern SwiftUI / Swift 6.2 API hygiene

#### 1a. Deprecated color modifier — `.foregroundColor(_:)`

786 hits across 106 files. Replace with `.foregroundStyle(_:)`. The codebase
already uses both. Examples:
- `Design/Components/PatinaButton.swift:56-67` — `private var foregroundColor: Color`
  returns a `Color` then is applied via `.foregroundColor(foregroundColor)`
  at line 43.
- `Features/Collections/Views/CollectionsView.swift:30,39,57,118,...` — 14
  calls in one file.
- `Features/Projects/Views/ProjectListView.swift:33,71,76,103,...` — 9 calls
  in one file.

Sketch:
```swift
// before
Text("…").foregroundColor(PatinaColors.charcoal)
// after
Text("…").foregroundStyle(PatinaColors.charcoal)
```

#### 1b. Deprecated `navigationBarHidden` / `navigationBarTitleDisplayMode`

- `.navigationBarHidden(true)` × 36, mostly in `ContentView.swift:190-351`.
- `.navigationBarTitleDisplayMode(.inline)` × 29.

Replace with `.toolbar(.hidden, for: .navigationBar)` and
`.toolbarTitleDisplayMode(.inline)` respectively (iOS 17+). They behave
identically on iOS 18 but the deprecated ones can warn under stricter
SwiftSettings.

#### 1c. Deprecated color tokens still in use

`PatinaColors.clayBeige` and `PatinaColors.mochaBrown` are marked
`@available(*, deprecated, renamed: …)` in
`Design/Tokens/PatinaColors.swift:97-101` but the rest of the codebase
never migrated. Files still calling them:

- `Features/Walk/Views/WalkView.swift:97, 161, 222, 498, 522, 526, 534, 581, 633`
- `Features/Companion/Views/CompanionSheet.swift:50, 55, 125, 131`
- `Features/Companion/Views/CompanionAuthPanel.swift:60, 131, 154`
- `Features/Companion/Components/ContextBar.swift:35, 41`
- `Features/Companion/Components/QuickActionsBar.swift:84, 89, 115, 120`
- `Features/Authentication/Views/AuthenticationView.swift:101`
- `Features/Emergence/Views/EmergenceView.swift:106, 132, 136, 174, 185, 191`
- `Design/Animations/BreathingAnimation.swift:96, 100`
- `Design/Components/StrataMarkView.swift:91, 93`
- `Design/Components/ClayBackground.swift:79, 110, 136`

Decide whether to delete the deprecations or actually migrate. Right now
both are true: deprecation is in place and the codebase is generating
deprecation warnings.

#### 1d. `Font.custom(...)` inline — 159 calls, 45 files

`PatinaTypography.swift` centralizes display/body/mono fonts with
`relativeTo:` so Dynamic Type scales. Views bypass it constantly:

- `Features/Home/Views/DailyProductDetailView.swift:99, 158, 169, 173, 180, 225, 239, 274, 299` (9 calls in one view)
- `Features/Home/Views/DailyStoryDetailView.swift:76, 81, 110, 171` (etc.)
- `Features/Profile/Views/ProfileView.swift:51, 186, 209` — heading,
  stat-value, and date use raw `Font.custom("PlayfairDisplay-Medium", size: 22/28)`.
- `Features/Home/Views/DailyGreetingHeader.swift:29, 68`
- `Features/StyleConversation/Shared/Components/StylePillButton.swift:24`,
  `ConversationHeaderView.swift:28, 35, 47`

None of these specify `relativeTo:`, so they will not respond to user
Dynamic Type settings. Add an entry to `PatinaTypography` or apply
`relativeTo:` per site.

#### 1e. Deprecated `cornerRadius(_:)` modifier — 49 calls

iOS 13-era API. Replace with `.clipShape(RoundedRectangle(cornerRadius:))`
(used elsewhere in the same files). Examples:
`Features/Companion/Components/QuickActionsBar.swift:92`,
`Features/FirstLaunch/Views/WalkInvitationView.swift:154`,
`Features/Authentication/Views/AuthenticationView.swift:155`.

#### 1f. `EnvironmentKey` boilerplate vs the `@Entry` macro

Four `EnvironmentKey` definitions with manual `EnvironmentValues` wrappers
exist (`AppCoordinator.swift:666`, `FirstLaunchCoordinator.swift:249`,
`FirstLaunchTour.swift:484`, `CameraPermissionService.swift:107`). Xcode 16
ships the `@Entry` macro that replaces the whole pattern with a one-liner:

```swift
extension EnvironmentValues {
    @Entry var appCoordinator: AppCoordinator = AppCoordinator()
}
```

Not a bug — but the boilerplate is 6 lines per key today and would be 1.

#### 1g. `Task { @MainActor in }` and `MainActor.run` over-isolation

When the enclosing type is `@MainActor`, plain `Task { ... }` already
inherits the actor; the `@MainActor` annotation on the Task is redundant.
Same for `await MainActor.run { ... }` in a method declared on a
`@MainActor` type. Examples that look redundant:

- `Features/Companion/Views/CompanionOverlay.swift:146-155` — `.task { for await ... in supabase.auth.authStateChanges { await MainActor.run { ... } } }`. The view body and `.task` already run on MainActor; the inner `MainActor.run` is unnecessary. Note also `event` is bound but unused — `for await (_, _) in ...`.
- `Features/Home/ViewModels/DailyRoomViewModel.swift:122-170` — the VM is
  `@Observable` but **not** `@MainActor`. Detached `Task { [weak self] in }`
  do work and then bounce back through `MainActor.run { }` to mutate VM
  state. Either mark the class `@MainActor` and drop the bounces, or accept
  the runtime hop and document it. Today it's the worst of both worlds:
  the VM is implicitly main-thread, but the compiler can't enforce that
  under Swift 6 strict concurrency.
- `App/Coordinators/AppCoordinator.swift:106-113` — `init()` is not
  `@MainActor`-isolated but the class is `@Observable` and intended to run
  on main. The `Task { @MainActor in self.observePhaseInputs() }` dance
  exists only to bridge that. Adding `@MainActor` to the class would
  collapse three layers of awareness.

### 2. Data flow

#### 2a. Critical — `AppCoordinator` default value instantiates new coordinator

```swift
// App/Coordinators/AppCoordinator.swift:666–668
private struct AppCoordinatorKey: EnvironmentKey {
    static let defaultValue: AppCoordinator = AppCoordinator()
}
```

This computes a fresh `AppCoordinator()` whenever the environment value is
read in a context that wasn't injected. Because `AppCoordinator.init()`
schedules a Task to set up `observePhaseInputs` and a `splashDeadlineTask`,
every accidental read creates a coordinator with its own auth observer,
phase derivation, and splash timer. Recommended fix: make the default
value `nil`/optional and `fatalError` (in DEBUG) when missing, or use a
non-observing sentinel.

```swift
// recommended sketch
private struct AppCoordinatorKey: EnvironmentKey {
    static let defaultValue: AppCoordinator? = nil
}
extension EnvironmentValues {
    public var appCoordinator: AppCoordinator {
        get { self[AppCoordinatorKey.self] ?? AppCoordinator.preview }
        set { self[AppCoordinatorKey.self] = newValue }
    }
}
```

#### 2b. Mixed observation worlds — `@Observable` and `ObservableObject` co-exist

`@Observable` (modern): 36 files. `ObservableObject` + `@Published`: 13
files, all in the scan / camera / sync pipeline plus a couple of singletons.

This causes:
- A view like `WalkView` declares
  `@StateObject private var captureService = RoomCaptureService()` (line 21),
  but `RoomCaptureService` is `@MainActor public final class … : NSObject,
  ObservableObject` and exposes 11 `@Published` properties (lines 23-44).
  When the same view is opened twice (e.g. from a deep link), `@StateObject`
  re-creates the service.
- `Features/RoomDetail/Views/ShareScanSheet.swift:34` says
  `@StateObject private var sharingService = ScanSharingService.shared`.
  `@StateObject` is meant to *own* the lifetime of a fresh instance. Wrapping
  a singleton bypasses that contract and confuses readers — when the sheet
  closes, the singleton stays alive but SwiftUI thinks it owns it.
- Similarly: `Features/Walk/Views/WalkView.swift:24`
  (`RoomScanSyncService.shared`),
  `Features/Walk/Views/PreScanChecklistView.swift:15`,
  `Features/FirstLaunch/Views/CameraPermissionView.swift:16`,
  `Features/RoomDetail/Views/RequestDesignServicesSheet.swift:30`.

Recommendation: migrate the scan-pipeline `ObservableObject`s to
`@Observable` (a one-pass rewrite — drop `@Published`, drop the protocol),
and rip `@StateObject = .shared` in favour of either `@Environment(...)`
or direct `SomeService.shared` reads in `.onAppear` / `.task`.

#### 2c. State mutation inside view body / view-builder

- `Features/RoomScan/Views/QuietConversationFlowHost.swift:278-285`
  ```swift
  private func ensureConversationViewModel(for session: RoomScanSession) -> StyleConversationViewModel {
      if let existing = conversationViewModel { return existing }
      let vm = StyleConversationViewModel(session: session)
      DispatchQueue.main.async { conversationViewModel = vm }
      return vm
  }
  ```
  Called from inside the view-builder switch at line 229. The
  `DispatchQueue.main.async { conversationViewModel = vm }` is a "purple"
  pattern — mutating `@State` during body evaluation. Move the
  initialization into `.task(id: session.sessionId) { ... }` and bind the
  result.
- `Features/Profile/Views/ProfileView.swift:209-210`
  ```swift
  let formatter = DateFormatter()
  let _ = formatter.dateFormat = "MMM d"
  ```
  Inside `roomCard(_:)`. Creates a new `DateFormatter` per row per render
  (these are expensive to allocate). Hoist to a `static let` on the view or
  cache on the VM. Same pattern in `Features/Table/Views/TableItemDetailSheet.swift:309`,
  `Features/Rooms/Views/RoomProjectView.swift:224`,
  `Features/Rooms/Views/RoomSettingsView.swift:204`,
  `Features/Account/AccountView.swift:252`,
  `Features/Home/ViewModels/DailyRoomViewModel.swift:59`.

#### 2d. Singleton-heavy data access

50 `static let shared` declarations, 437 `.shared` call sites — view bodies
and models reach into global services everywhere. There's no DI layer, so
swapping `RoomScanSyncService` for a mock in tests is impossible without
swizzling. Notable: `ContentView.swift:159-163` reads
`ProfileService.shared.roles` and `SettingsService.shared.preferredHomeMode`
**inside the view-builder** rather than through an environment value or a
`@State` view-model — those reads aren't tracked by Observation so the home
won't refresh if either changes.

#### 2e. `AnyShapeStyle` for trivial branches

`Features/Companion/Components/QuickActionsBar.swift:89-91` uses
`AnyShapeStyle(...)` for a boolean style switch. SwiftUI handles this
natively via `if ... else` in modifiers — no type erasure needed.

### 3. Navigation

- `ContentView.swift` is the single navigation destination switch. It
  branches on 35+ `AppRoute` cases and renders ~7 `EmptyView` placeholders
  for routes handled via sheets (`.qrScanner`, `.qrApproval`, `.settings`,
  `.designServicesRequest`, `.threshold`, `.authentication`, `.newRoom`,
  `.moveItem`, `.roomOptions`, `.scanWalk`, `.scanReview`, ...). The
  comment at `.scanWalk:` (line 299) — "handled inline via
  quietConversationEntry state" — points at a real issue: routing is split
  between `AppCoordinator.navigationPath`, `coordinator.showing*` booleans
  (5 sheet flags), and an internal `Step` enum inside
  `QuietConversationFlowHost`. The intent is sound but the routing
  surface is large and hard to audit.

- The Quiet-Conversation host explicitly notes (line 167-169) that
  "iOS 26 SwiftUI quirk where swapping internal `step` to `.review`
  inside a NavigationStack destination causes the destination view to
  collapse ~700ms after the child view mounts". That is a real iOS 26
  defect Patina has worked around with `.fullScreenCover(item:)`. Worth
  retesting on iOS 26.5 and filing a feedback if it persists, since the
  workaround complicates the back-stack semantics.

- `AppCoordinator.goBack()` (line 406-411) only removes the last
  `NavigationPath` element and warns "we'd track the navigation stack" but
  doesn't — `currentScreen` and `companionContext` stay set to whatever the
  pushed screen was, so a back-tap leaves the Companion sheet showing the
  *forward* screen's quick actions for one frame.

- Sheet dismissal: every coordinator-driven sheet
  (`showingDesignServices`, `showingQRScanner`, `showingSettings`,
  `showingNewRoom`, `showingMoveItem`) is wired with manual `Binding(get:,
  set:)` blocks (`ContentView.swift:71-108`). Could become a single
  `.sheet(item:)` pattern with an enum like
  `enum PresentedSheet { case settings, qr, designServices(roomId: UUID?), … }`
  — would eliminate five sheet modifiers stacked on top of each other and
  the racy "set boolean false from inside the sheet" handshake.

### 4. Performance

#### 4a. View files that should be split

| File | LOC | Notes |
|---|---|---|
| `Features/Walk/Services/RoomCaptureService.swift` | 1177 | Service + 11 `@Published` + RoomPlan delegate + ARKit + sync. Split into `RoomCaptureSessionDriver`, `RoomCaptureAnalyzer`, `RoomCaptureBundleAdapter`. |
| `Features/RoomScan/Views/ScanReviewView.swift` | 1006 | One view body with loading / error / hero picker / reorder / caption sheet / save. Extract `ScanReviewHeader`, `HeroPickerSheet`, `PhotoReorderSheet`, `CaptionEditorSheet`. |
| `Features/Walk/Views/WalkView.swift` | 693 | `welcomeContent`, `walkingContent`, `completedContent` are each ~150 LOC private vars. Split into separate `View` types. |
| `Features/Authentication/Views/AuthenticationView.swift` | 685 | OK but contains both UI and `runUITestAuthBootstrapIfNeeded()` (line 71-95) which doesn't belong in a view. |
| `Features/Help/FirstLaunchTour.swift` | 684 | OK — well-commented, but mixes the `FirstLaunchTourModel`, the modifier, the anchor enum, and the view-extension. Could be 4 files. |
| `Features/Companion/ViewModels/CompanionViewModel.swift` | 646 | Pure model — fine to keep large, but the `screenIdentifier(for:)` switch (lines 174-200+) duplicates the `AppRoute.displayName` mapping that already exists on `AppRoute`. |

#### 4b. `GeometryReader` overuse

18 instances. `GeometryReader` *always* takes all available space and
disables intrinsic sizing of its parent, which causes layout-thrash in
nested containers. A handful look load-bearing (the scanner viewfinder
`QRScannerView.swift:109`, the AR overlay `ARGeometryOverlayView.swift:28`,
the floor-plan preview `ScanFloorPlanPreviewView.swift:81`). Others can
move to `.containerRelativeFrame(...)`, `.matchedGeometryEffect`, or the
new `Layout` protocol:

- `Features/Companion/Views/CompanionOverlay.swift:84` — wraps the whole
  overlay just to read `safeAreaInsets.bottom`. Modern equivalent:
  `@Environment(\.safeAreaInsets)` or `.safeAreaPadding(.bottom, 28)`.
- `Features/Rooms/Components/RoomBudgetBar.swift:28` — reads `geo.size.width`
  to draw a fill — `Capsule().fill(...).frame(maxWidth: percent * .infinity)`
  would do.
- `Features/Threshold/Views/LivingSceneView.swift:25, 96` — two
  GeometryReaders in one file for the same scene.

#### 4c. Non-deterministic `Canvas` redraws

`Design/Components/ClayBackground.swift:67-91` and lines 100-144 draw a
texture by sampling `CGFloat.random(in: ...)` inside `Canvas`. Every body
evaluation regenerates a new random pattern; the texture visibly twitches
on any animation. Either seed the RNG (`var rng = SystemRandomNumberGenerator()`)
and draw once into a cached `Image`, or use `TimelineView(.animation)` with
a fixed seed.

#### 4d. Expensive allocations per render

- 5 sites create `DateFormatter()` per render (§2c above).
- `Features/Profile/Views/ProfileView.swift:209` allocates one per
  row.
- `Features/Home/ViewModels/DailyRoomViewModel.swift:58-62` —
  `greetingDate` is a *computed property* that allocates a new formatter
  every time SwiftUI reads it. Make it a `static let` formatter or a
  cached lazy var.

#### 4e. `UIScreen.main` deprecation hot-path

`Features/Walk/Services/RoomCaptureService.swift:160`
```swift
let view = RoomCaptureView(frame: UIScreen.main.bounds)
```
`UIScreen.main` is deprecated in iOS 16+ — multi-scene safe replacement is
to pass `.zero` and let layout size it, or to read the view's
`window.windowScene.screen.bounds`. `.zero` is fine here because the
container immediately sizes the `RoomCaptureView`.

#### 4f. `RoomCaptureService` lifecycle

`RoomCaptureService` is instantiated via `@StateObject` in `WalkView`
(line 21) *and* in `ScanViewModel.init` (`Features/RoomScan/ViewModels/
ScanViewModel.swift:107`). The QuietConversation host stores its own
copy. There's no shared session, so opening Walk after the scan flow has
already created a service double-allocates the `RoomCaptureView` and may
contend for the AR session. Recommend a single service instance per scan,
owned by the coordinator/host.

### 5. Concurrency

- `Features/Companion/Views/CompanionOverlay.swift:146-155` — the
  `for await (event, _) in supabase.auth.authStateChanges` task discards
  `event` and re-reads `AuthService.shared.isAuthenticated`. Simpler:
  observe `AuthService` directly (it's already `@Observable`) and let
  SwiftUI re-render. Also the `MainActor.run` is redundant — the `.task`
  modifier inherits the view's actor.
- `App/Coordinators/AppCoordinator.swift:121-133` —
  `scheduleSplashDeadlineRecompute()` does `try? await Task.sleep(nanoseconds: …)`
  with manual nanos. Modern API: `try? await Task.sleep(for: .seconds(interval))`.
- `RoomScanSyncService` is `public final class … ObservableObject` (not
  `@MainActor`) but is exposed to SwiftUI views as `@StateObject`. Its 2564
  LOC mix file IO, networking, and SwiftData reads — confirming everything
  is on the right actor without `@MainActor` annotation is borderline
  impossible. Recommend explicit `@MainActor` on the class with `nonisolated`
  carve-outs for the IO actors it already uses internally (the file is
  conscientious about `private nonisolated struct`s for its RPC payloads,
  so the design intent is already there).
- 30 `DispatchQueue.main.asyncAfter` calls (listed in §1g) should mostly be
  Tasks. The pre-Swift-Concurrency pattern leaks: capture cycles aren't
  obvious, cancellation is impossible, and the actor isolation analysis can't
  see them. Specifically dangerous ones:
  - `Features/Companion/Views/CompanionOverlay.swift:248, 303, 502`
    chain `collapseToButton()` → `DispatchQueue.main.asyncAfter(0.3)` →
    coordinator mutation. If the user taps a second action during the 300ms
    delay, the chain doesn't cancel.
  - `Features/Splash/Views/SplashView.swift:53` —
    `DispatchQueue.main.asyncAfter(deadline: .now() + 2.0)` to call
    `onComplete()`. The note in `PatinaApp.swift:31-34` says onComplete
    is a no-op kept only to satisfy the API, so this 2-second deadline is
    dead code that still allocates a dispatch work-item.

- `@unchecked Sendable` is applied to 5 types (`MessagingRealtimeService`,
  `UploadDiagnosticsLog`, `AnyCodable`, `PosedPhotoService.FrameSnapshot`,
  `FirstLaunchTourDefaultsAdapter`). Two — `AnyCodable` and the
  `FrameSnapshot` — are clearly justified (immutable / value-types with
  non-Sendable storage). The two services with `@unchecked Sendable` should
  carry a comment explaining how their internal synchronization works;
  today they don't.

### 6. Code hygiene

#### 6a. File-size budget

Anything over ~500 LOC starts to be hard to review. Files above budget,
ranked: `RoomScanSyncService.swift` (2564), `RoomCaptureService.swift`
(1177), `ScanReviewView.swift` (1006), `WalkView.swift` (693),
`AuthenticationView.swift` (685), `FirstLaunchTour.swift` (684),
`SanityHelpClient.swift` (674), `AppCoordinator.swift` (675),
`CompanionViewModel.swift` (646), `ShareScanSheet.swift` (609),
`QuickAction.swift` (579), `CompanionOverlay.swift` (523).

The very largest (`RoomScanSyncService` and `RoomCaptureService`) are
services, not views — easier to justify, but `RoomScanSyncService` at 2.5
kLOC is fragile-bus-factor: only one engineer realistically holds the
whole upload state-machine in their head at a time.

#### 6b. Layering — view does business logic

- `AuthenticationView.swift:71-95` — `runUITestAuthBootstrapIfNeeded()`
  drives the entire magic-link → OTP flow from inside the view. Best
  practice: push it down to the view model.
- `WalkView.swift:359-411` — `syncRoomScan(roomData:styleSignals:)` runs
  Supabase uploads, retry-queue persistence, and SwiftData store writes
  *from a view method*. The method is even marked
  `@available(*, deprecated, message: "Use RoomScan flow via
  AppCoordinator.scanReview — v1 WalkView is kept only for legacy rows.")`
  but is still being called by `setupCaptureService()` → `onScanComplete`
  at line 341-343. If this is dead code, delete it; if it's live legacy
  code, it shouldn't be in the view.
- `ContentView.swift:158-173` — `mainHomeView` reads role / preference data
  directly from `ProfileService.shared` and `SettingsService.shared`. Move
  to a small `HomeMode` resolver bound to an environment value so it's
  testable and reacts to preference changes.

#### 6c. Dead / vestigial code with comments

- `AppCoordinator.swift:269-275` — `case .threshold:` is a vestigial
  route per the comment; routes through `navigationPath = NavigationPath()`
  but is still in the enum. Consider deleting and migrating callers.
- `ContentView.swift:182, 209, 217, 245, 249, 251, 254, 277, 291, 295, ...`
  — 14 `EmptyView()` destinations. Most reflect sheet-presented routes,
  but `.scanWalk → EmptyView()` with the comment "handled inline via
  quietConversationEntry state" should not be a navigationDestination at
  all if it doesn't actually push anything.
- `WalkView.swift:487-536` — `wallDetectionOverlay` and `cornerMarker` are
  defined but never invoked.
- `Features/RoomScan/Shared/Services/AestheteEngineService.swift:189` —
  `// TODO: implement once services/aesthete-engine/ (FastAPI) is deployed.`
  Per repo CLAUDE.md `aesthete-engine` is "deferred, not deployed", so this
  is a deliberate stub.
- `Features/Receiving/ViewModels/MediaUploadClient.swift:71` —
  `// TODO: confirm endpoint with Kody — using https://media.patina.cloud`.
  Single live TODO worth resolving.

#### 6d. `print` usage (105 calls in Features/App)

All wrapped in `#if DEBUG` in the App layer, but raw `print(...)` in
feature ViewModels: `DailyRoomViewModel.swift:131,164`,
`CompanionViewModel.swift:168`, `WalkView.swift:390,394,406,408`,
`DeepLinkHandler.swift:128`, `RoomCaptureService.swift` (multiple). A
project-wide `PatinaLog` (or `os.Logger`) would centralize this and
respect Console privacy levels.

#### 6e. NotificationCenter as cross-view bus

- `Features/Walk/Views/MockRoomScanView.swift:326` posts `.mockScanCompleted`
  and `Features/Walk/Views/WalkView.swift:247` listens via `.onReceive`.
  Acceptable for a test seam, but it's the only such bus in the app and is
  invoked by production code too.
- `PatinaApp.swift:93-97` posts `.patinaScanRecoveryCandidatesDidAppear`
  alongside a `UserDefaults` flag — two channels for the same event. Pick
  one (the `Notification.Name` is enough; the UserDefaults flag is racy on
  app-launch order).

---

## Patterns worth keeping

- **`@Observable` + `@MainActor` view models** — where it's used (e.g.
  `WalkViewModel`, `ScanViewModel`, `CompanionViewModel`, `ReceiveDeliveryViewModel`,
  `ProductDetailViewModel`) the model is small, clearly isolated, and
  testable. The migration is mostly complete; finishing it is the
  highest-leverage improvement.
- **`AppCoordinator.recomputePhase`** (lines 165-215) uses
  `withObservationTracking` correctly to derive `phase` from inputs, and
  re-registers from a `Task { @MainActor [weak self] }` to keep observing.
  The comments accurately describe Swift Observation semantics.
- **`AppCoordinator.beginSplashTransition`** with its
  `splashMinimumDuration` deadline pattern (lines 237-241) is a clean,
  well-documented solution to the cold-launch auth flicker problem.
- **`ScanViewModel.prepare()` / `teardown()`** lifecycle (lines 125-152)
  is exactly the right shape — set up observation, drop it cleanly,
  emit a final analytics event in `teardown` if the scan wasn't completed.
- **`QuietConversationFlowHost`** consolidates a 5-step scan flow under one
  `@State`-owned model rather than threading associated values through
  `NavigationPath`. The comments explain the iOS 26 quirk that drove the
  fullScreenCover workaround, which is exactly the kind of context to
  preserve.
- **Sendable hygiene in `RoomScanSyncService`** — `private nonisolated
  struct ArtifactShaMergeParams: Encodable, Sendable` (line 178) and the
  rest of the RPC payload structs show the author understands the strict
  concurrency story even though the surrounding class hasn't fully
  migrated.
- **`PatinaTypography`'s `relativeTo:` parameter** (everywhere in
  `Design/Tokens/PatinaTypography.swift`) means the centralized fonts will
  scale with Dynamic Type — the issue is just that views bypass them.
- **`#if DEBUG print(...)` in the coordinator** — well placed, easy to
  remove when adopting `os.Logger`.

---

## Open questions

1. **Is the v1 `WalkView` scan path actually dead?**
   `WalkView.syncRoomScan` is marked `@available(*, deprecated, message: …)`
   and the `QuietConversationFlowHost` is the documented v2 path. But
   `AppCoordinator.navigate(to: .walk)` still routes through
   `quietConversationEntry` (ContentView.swift:218-221), and several
   companion intents (e.g. `walkRoom(nil)` at AppCoordinator:531) call it.
   Can `WalkView` be deleted in full, or does any production surface still
   land on it?

2. **`AppCoordinatorKey.defaultValue = AppCoordinator()` — intentional or
   forgotten?** It's load-bearing for SwiftUI previews (no environment
   injection there) but dangerous in production. Should the default be a
   `preview`/`mock` coordinator that's safe to instantiate vs. the live
   one?

3. **Scan-pipeline `ObservableObject`s — is the legacy `@Published`
   surface still used by anything outside SwiftUI?** If so, leave them.
   If not, migrating to `@Observable` is a 13-file mechanical rewrite that
   would tighten the whole pipeline.

4. **The `iOS 26 NavigationStack destination collapse` workaround**
   (`QuietConversationFlowHost.swift:166-169`) — is this confirmed on
   iOS 26.5? If Apple has fixed it, the `.fullScreenCover(item:)`
   workaround could collapse back to a `step = .review` transition.

5. **`Canvas { ... CGFloat.random(in: ...) ... }` in `ClayBackground`** —
   is the per-frame texture twitch intentional ("organic clay")? If yes,
   document; if not, seed the RNG once.

6. **`@StateObject = SomeSingleton.shared` pattern (5 sites)** — was this
   adopted to get SwiftUI to invalidate on the singleton's `@Published`
   updates? If so, after migrating those services to `@Observable` the
   declaration collapses to a private property and SwiftUI tracks reads
   automatically.

7. **`AppCoordinator` `setCurrentScreen` vs `navigate(to:)`** —
   the doc comment at line 394-399 describes a workaround for an
   "iOS 26 NavigationStack + ScrollView gesture-recognizer corruption".
   How many call sites use `setCurrentScreen` vs `navigate(to:)`, and
   is there an invariant that distinguishes them? Today it looks like
   a tribal-knowledge distinction.
