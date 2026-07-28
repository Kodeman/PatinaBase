//
//  FirstLaunchTour.swift
//  Patina
//
//  iOS first-launch coachmark tour orchestrator (Sprint 3 / Stream G9).
//
//  Sequences three coachmark popover steps on the Home tab the
//  first time a user opens the app. Mirrors the web `<TourController />`
//  contract in `packages/help-system/src/proactive/TourController/` —
//  same persistence prefix (`help-system.tour.<tourKey>`), same one-shot
//  semantics, same analytics events.
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  How to use                                                              │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │                                                                          │
//  │  Wrap the Home tab content in `FirstLaunchTour { … }` and tag the        │
//  │  individual anchor views with `.firstLaunchTourAnchor(_:)`:              │
//  │                                                                          │
//  │  FirstLaunchTour {                                                       │
//  │      VStack {                                                            │
//  │          GreetingHeader()                                                │
//  │              .firstLaunchTourAnchor(.homeGreeting)                       │
//  │          ProductCard()                                                   │
//  │              .firstLaunchTourAnchor(.addToRoom)                          │
//  │          ProfileMonogram()                                               │
//  │              .firstLaunchTourAnchor(.profileMonogram)                    │
//  │      }                                                                   │
//  │  }                                                                       │
//  │                                                                          │
//  │  The orchestrator owns the binding for each step's popover and decides   │
//  │  which is currently visible. The anchor views render their normal UI;    │
//  │  the `.firstLaunchTourAnchor` modifier attaches a SwiftUI `.popover`     │
//  │  bound to the orchestrator's active step.                                │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  Persistence (see `firstLaunchTourState.swift` + `SupabaseHelpStateAdapter`):
//   • UserDefaults backing (anon / offline fallback), key
//     `help-system.tour.<tourKey>`
//   • Supabase `profiles.help_state` (S4-1) — authoritative for signed-in
//     users. The orchestrator installs the adapter on `enableSupabaseSync`
//     and writes through to both backings so a tour dismissed on one device
//     never re-appears on another.
//   • `completed` OR `abandoned` → tour never auto-starts again
//   • `launched: true` is written on the very first auto-start attempt so the
//     UserDefaults entry doubles as "this device has been opened once"
//
//  Analytics (mirrors `helpEvents.tour.*` per spec §10.1):
//   • help.tour.started        on auto-start  — { tour_key, trigger_source: "first_launch" }
//   • help.tour.step_advanced  on advance     — { tour_key, step_number, step_surface_key }
//   • help.tour.completed      on final next  — { tour_key, duration_ms, steps_viewed }
//   • help.tour.abandoned      on skip / outside-tap during step 1
//                                              — { tour_key, at_step, total_steps }
//
//  iOS adaptation note: SwiftUI's `.popover` dismisses on outside tap and
//  raises the binding back to `false`. We treat any user-initiated dismiss as
//  the equivalent of the web "Skip" action — analytics fire `abandoned` and
//  the tour is marked resolved.
//
//  Tour fires on first visible Home, by design. The host passes
//  `canAutoStart` (see `DailyRoomView`); when Home mounts under a covering
//  route — the post-onboarding landing pushes `.emergence` straight onto the
//  navigation path — the one-shot is DEFERRED rather than burned behind that
//  cover. `.task(id: canAutoStart)` re-fires the check the moment the path
//  empties out and Home is actually on screen.
//

import Auth
import Observation
import Supabase
import SwiftUI

// MARK: - Anchor identifiers

/// Stable identifiers for each tour-step anchor. Used by the orchestrator to
/// gate which anchor view should display the popover for the current step.
public enum FirstLaunchTourAnchor: String, CaseIterable, Sendable {
    /// Home / Daily Room greeting header (step 1).
    case homeGreeting = "home-greeting"
    /// The "+ Add" save affordance on the topmost daily product card (step 2).
    /// The Daily Room ships no heart control — this anchor names the button
    /// that actually exists.
    case addToRoom = "add-to-room"
    /// Profile monogram / avatar entry point (step 3).
    case profileMonogram = "profile-monogram"
}

// MARK: - Step definition

/// One step in the first-launch tour. Pairs a surface key (for Sanity copy +
/// analytics) with an anchor identifier (so the orchestrator knows which view
/// in the subtree should host the popover).
public struct FirstLaunchTourStep: Sendable {
    public let surfaceKey: SurfaceKey
    public let anchor: FirstLaunchTourAnchor
    /// Inline fallback heading + body for CMS misses.
    public let fallback: (heading: String, body: String)?

    public init(
        surfaceKey: SurfaceKey,
        anchor: FirstLaunchTourAnchor,
        fallback: (heading: String, body: String)? = nil
    ) {
        self.surfaceKey = surfaceKey
        self.anchor = anchor
        self.fallback = fallback
    }
}

// MARK: - Orchestrator model

/// Observable model that holds the active-step index + completion flags and
/// exposes the imperative API the host view binds to. Lifted into a class so
/// the modifier and the host share a single source of truth even though the
/// modifier mounts deep inside the subtree.
@MainActor
@Observable
public final class FirstLaunchTourModel {
    /// Unique key used for persistence + analytics. Defaults to
    /// `"ios-first-launch-tour"` (the value the spec calls out).
    public let tourKey: String

    /// Ordered step list. Index 0 is the first popover shown.
    public let steps: [FirstLaunchTourStep]

    /// Zero-based active step index. When `isActive == true` the anchor
    /// matching `steps[currentStep].anchor` displays its popover.
    public private(set) var currentStep: Int = 0

    /// Whether the tour is currently driving any popover. Driven by the
    /// first-launch detector — flips to `true` once on the first launch and
    /// back to `false` after `complete()` or `skip()`.
    public private(set) var isActive: Bool = false

    /// Set of step indexes the user actually viewed. Surfaced as the
    /// `steps_viewed` property on `help.tour.completed`.
    @ObservationIgnored private var viewedSteps: Set<Int> = []

    /// Monotonic clock reading taken on auto-start. Used to compute
    /// `duration_ms` for `help.tour.completed`.
    @ObservationIgnored private var startedAt: Date?

    /// Cached analytics facade so tests can swap in a stub.
    @ObservationIgnored private let analytics: HelpAnalytics

    /// Optional Supabase-backed help-state adapter (S4-1). When non-nil the
    /// model consults the adapter's cached entry before UserDefaults during
    /// first-launch detection, and mirrors every persistence write to
    /// Supabase via `Task { … }`. Set via `enableSupabaseSync(_:)` once the
    /// user is authenticated; anonymous + pre-hydration callers fall back to
    /// UserDefaults only (same behaviour as v1 / Sprint 3).
    @ObservationIgnored private var supabaseAdapter: SupabaseHelpStateAdapter?

    /// Anchors currently mounted in the view tree. The anchor modifier
    /// registers on appear / unregisters on disappear, so the orchestrator can
    /// SKIP a step whose anchor never renders — e.g. the `.addToRoom` product
    /// card doesn't exist for a brand-new user with zero rooms, which used to
    /// strand the tour on an invisible middle step.
    @ObservationIgnored private var mountedAnchors: Set<FirstLaunchTourAnchor> = []

    /// Step indexes dropped because their anchor never mounted. Tracked (not
    /// `@ObservationIgnored`) because the visible "Step X of Y" caption is
    /// derived from it: a skipped step is removed from BOTH the numerator and
    /// the denominator so the caption renumbers ("Step 1 of 2") instead of
    /// leaving a hole the user reads as a bug ("Step 1 of 3" → "Step 3 of 3").
    private var skippedSteps: Set<Int> = []

    /// Becomes `true` the first time any anchor registers. Skip-unmounted logic
    /// only kicks in once the anchor system is live, so a model driven directly
    /// (unit tests, no view tree) keeps the simple sequential advance behavior.
    @ObservationIgnored private var anchorTrackingActive = false

    /// Pending "skip this step if its anchor never mounts" check.
    @ObservationIgnored private var skipTask: Task<Void, Never>?

    /// Grace window given to a step's anchor to mount before the step is
    /// skipped. Covers the async case — e.g. `.addToRoom`'s product card only
    /// mounts after the recommendations feed loads over the network — so a
    /// not-yet-mounted anchor still gets its coachmark, while a truly-absent one
    /// (zero-room user) is skipped once the window elapses. Settable for tests.
    @ObservationIgnored var anchorMountGracePeriod: Duration = .seconds(1.5)

    public init(
        tourKey: String = FirstLaunchTourModel.defaultTourKey,
        steps: [FirstLaunchTourStep] = FirstLaunchTourModel.defaultSteps,
        analytics: HelpAnalytics = .shared
    ) {
        self.tourKey = tourKey
        self.steps = steps
        self.analytics = analytics
    }

    /// Install the Supabase-backed help-state adapter. Caller is responsible
    /// for calling `loadState()` on the adapter prior to this — the model
    /// expects the cache to already reflect cross-device state.
    public func enableSupabaseSync(adapter: SupabaseHelpStateAdapter) {
        self.supabaseAdapter = adapter
    }

    /// Remove the Supabase adapter (on sign-out, for example). Subsequent
    /// writes go to UserDefaults only — the next signed-in session installs
    /// a fresh adapter scoped to the new user.
    public func disableSupabaseSync() {
        self.supabaseAdapter = nil
    }

    /// Canonical default tour key. Matches the value referenced by the
    /// task brief and surfaced in PostHog.
    public static let defaultTourKey: String = "ios-first-launch-tour"

    /// Canonical default step list. Aligned with the Sanity content authored
    /// in Sprint 3 G9.
    public static let defaultSteps: [FirstLaunchTourStep] = [
        FirstLaunchTourStep(
            surfaceKey: SurfaceKeys.IOSApp.FirstLaunchTour.step1Home,
            anchor: .homeGreeting,
            fallback: (
                heading: "Welcome to Patina",
                body: "This is your Daily Room — picks and stories chosen for your space."
            )
        ),
        FirstLaunchTourStep(
            surfaceKey: SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved,
            anchor: .addToRoom,
            fallback: (
                heading: "Save what you love",
                body: "Add pieces to a room with + Add — they follow you everywhere."
            )
        ),
        FirstLaunchTourStep(
            surfaceKey: SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile,
            anchor: .profileMonogram,
            fallback: (
                heading: "Your profile",
                body: "Rooms, saved pieces, and settings live here."
            )
        ),
    ]

    // MARK: - First-launch detection

    /// Inspect persisted state and, if the tour has not yet started or
    /// resolved, kick it off. Idempotent — safe to call multiple times from
    /// `.task` modifiers. The first call to fire the auto-start path writes
    /// `launched: true` so subsequent app launches DO NOT re-trigger the tour
    /// even if the user closed the app before completing it.
    ///
    /// When the Supabase adapter is installed (S4-1), the cross-device cache
    /// is consulted first — a tour resolved on another device skips
    /// auto-start here even if local UserDefaults says fresh user.
    public func checkFirstLaunch() {
        // 1. Supabase cache (cross-device authoritative when present).
        if let adapter = supabaseAdapter {
            // Task spin-up — we read the actor's cached state synchronously
            // via an `await`-bridge to the @MainActor model.
            Task { [weak self] in
                guard let self else { return }
                let entry = await adapter.cachedTourEntry(self.tourKey)
                if entry?.isResolved == true {
                    return
                }
                if entry?.launched == true {
                    return
                }
                self.checkLocalAndStart()
            }
            return
        }
        // 2. UserDefaults only — anon / pre-hydration path.
        checkLocalAndStart()
    }

    /// Local-state branch of the first-launch detector. Pulled out so the
    /// Supabase-cache branch can re-use it after its async check.
    private func checkLocalAndStart() {
        let state = getFirstLaunchTourState(tourKey)
        if state.isResolved { return }
        if state.launched == true {
            // Already shown once but the user closed the app mid-tour. Per
            // spec §4.7 rule 1 ("One-shot per user"), do NOT re-auto-start.
            return
        }
        startTour(triggerSource: "first_launch")
    }

    // MARK: - Imperative actions

    /// Begin the tour from step 0. Writes `launched: true` to UserDefaults
    /// (and Supabase, when sync is enabled) so subsequent launches DO NOT
    /// trigger again. Also fires `help.tour.started`.
    public func startTour(triggerSource: String) {
        guard !isActive else { return }
        setFirstLaunchTourState(tourKey, FirstLaunchTourState(launched: true))
        if let adapter = supabaseAdapter {
            Task { [tourKey] in
                await adapter.setTourEntry(
                    tourKey,
                    patch: HelpStateBlob.TourEntry(launched: true)
                )
            }
        }
        startedAt = Date()
        viewedSteps = [0]
        skippedSteps = []
        currentStep = 0
        isActive = true
        analytics.tourStarted(tourKey: tourKey, triggerSource: triggerSource)
    }

    /// Advance to the next step. If we're already on the final step, this is
    /// treated as `complete()` instead. Fires `help.tour.step_advanced` on a
    /// real advance.
    public func advance() {
        guard isActive else { return }
        guard !steps.isEmpty else { return }
        let nextIndex = currentStep + 1
        guard nextIndex < steps.count else {
            complete()
            return
        }
        currentStep = nextIndex
        viewedSteps.insert(nextIndex)
        analytics.tourStepAdvanced(
            tourKey: tourKey,
            stepNumber: nextIndex,
            stepSurfaceKey: steps[nextIndex].surfaceKey
        )
        // If this step's anchor isn't on screen, don't skip it outright — its
        // view may still be mounting (e.g. `.addToRoom`'s product card while
        // the feed loads). Give it a grace window; the reactive popover binding
        // shows it the moment it mounts, and only if it's STILL absent after the
        // window do we skip forward — which auto-clears the zero-room dead step.
        scheduleSkipIfAnchorNeverMounts(for: nextIndex)
    }

    /// After landing on `index`, wait one grace window; if that step's anchor
    /// still hasn't mounted (and we haven't moved on), advance past it. No-op
    /// when the anchor system isn't live (unit tests) or the anchor is already
    /// mounted.
    private func scheduleSkipIfAnchorNeverMounts(for index: Int) {
        skipTask?.cancel()
        guard anchorTrackingActive else { return }
        guard steps.indices.contains(index) else { return }
        guard !mountedAnchors.contains(steps[index].anchor) else { return }
        let grace = anchorMountGracePeriod
        skipTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: grace)
            guard let self, !Task.isCancelled else { return }
            if self.isActive,
               self.currentStep == index,
               !self.mountedAnchors.contains(self.steps[index].anchor) {
                // Record the drop BEFORE advancing so the next step's caption
                // renders against the shrunken denominator in the same pass.
                self.skippedSteps.insert(index)
                self.advance()
            }
        }
    }

    /// Mark the tour completed and write final persistence. Fires
    /// `help.tour.completed`.
    public func complete() {
        guard isActive else { return }
        skipTask?.cancel()
        let durationMs: Int
        if let startedAt {
            durationMs = max(0, Int(Date().timeIntervalSince(startedAt) * 1000))
        } else {
            durationMs = 0
        }
        analytics.tourCompleted(
            tourKey: tourKey,
            durationMs: durationMs,
            stepsViewed: viewedSteps.count
        )
        let completedAt = ISO8601DateFormatter().string(from: Date())
        setFirstLaunchTourState(
            tourKey,
            FirstLaunchTourState(
                completed: true,
                launched: true,
                completedAt: completedAt
            )
        )
        if let adapter = supabaseAdapter {
            Task { [tourKey] in
                await adapter.setTourEntry(
                    tourKey,
                    patch: HelpStateBlob.TourEntry(
                        completed: true,
                        launched: true,
                        completedAt: completedAt
                    )
                )
            }
        }
        isActive = false
    }

    /// Abandon the tour at the current step. Fires `help.tour.abandoned` and
    /// persists `abandoned: true` so the tour never re-auto-starts.
    public func skip() {
        guard isActive else { return }
        skipTask?.cancel()
        // `steps.count`, not the display-facing `totalSteps` — the event
        // reports the authored tour length so the PostHog funnel denominator
        // stays comparable across users who skipped an unmountable step.
        analytics.tourAbandoned(
            tourKey: tourKey,
            atStep: currentStep,
            totalSteps: steps.count
        )
        let abandonedAt = ISO8601DateFormatter().string(from: Date())
        let atStep = currentStep
        setFirstLaunchTourState(
            tourKey,
            FirstLaunchTourState(
                abandoned: true,
                launched: true,
                atStep: atStep,
                abandonedAt: abandonedAt
            )
        )
        if let adapter = supabaseAdapter {
            Task { [tourKey] in
                await adapter.setTourEntry(
                    tourKey,
                    patch: HelpStateBlob.TourEntry(
                        abandoned: true,
                        launched: true,
                        atStep: atStep,
                        abandonedAt: abandonedAt
                    )
                )
            }
        }
        isActive = false
    }

    // MARK: - Anchor helpers

    /// Record that `anchor`'s view is mounted (called on appear). Lets
    /// `advance()` skip steps whose anchor never renders.
    public func registerAnchor(_ anchor: FirstLaunchTourAnchor) {
        anchorTrackingActive = true
        mountedAnchors.insert(anchor)
        // The current step's anchor mounted within its grace window — cancel the
        // pending skip so its coachmark shows (via the reactive popover binding)
        // instead of being auto-skipped.
        if isActive, steps.indices.contains(currentStep), steps[currentStep].anchor == anchor {
            skipTask?.cancel()
        }
    }

    /// Record that `anchor`'s view left the tree (called on disappear).
    public func unregisterAnchor(_ anchor: FirstLaunchTourAnchor) {
        mountedAnchors.remove(anchor)
    }

    /// Returns `true` when the currently-active step's anchor matches
    /// `anchor`. The `.firstLaunchTourAnchor` modifier reads this to decide
    /// whether to mount its popover.
    public func isShowingPopover(forAnchor anchor: FirstLaunchTourAnchor) -> Bool {
        guard isActive else { return false }
        guard steps.indices.contains(currentStep) else { return false }
        return steps[currentStep].anchor == anchor
    }

    /// Resolve the active step's metadata when the orchestrator is driving
    /// `anchor`. Returns `nil` when the anchor is not the active step.
    public func currentStepDescriptor(forAnchor anchor: FirstLaunchTourAnchor) -> FirstLaunchTourStep? {
        guard isShowingPopover(forAnchor: anchor) else { return nil }
        return steps[currentStep]
    }

    /// One-based position of the active step among the steps the user will
    /// actually be shown, for the "Step X of Y" caption. Steps skipped for a
    /// never-mounted anchor are excluded, so the sequence reads 1, 2, 3… with
    /// no gaps rather than jumping from "Step 1" to "Step 3".
    public var currentStepNumber: Int {
        guard steps.indices.contains(currentStep) else { return 1 }
        return (0...currentStep).filter { !skippedSteps.contains($0) }.count
    }

    /// Presentable step count, for the "Step X of Y" caption — the authored
    /// list minus anything skipped for a missing anchor. Never below 1: the
    /// caption is only rendered while a step is on screen.
    public var totalSteps: Int { max(1, steps.count - skippedSteps.count) }

    /// Whether the active step is the last authored one. Derived from
    /// `steps.count`, NOT the display-facing `totalSteps` — otherwise a skipped
    /// step would make the final popover's button read "Next" and dead-end.
    public var isOnFinalStep: Bool { currentStep >= steps.count - 1 }
}

// MARK: - Orchestrator view

/// SwiftUI host view that wraps a screen's content, owns a
/// `FirstLaunchTourModel`, and exposes it to descendant anchor modifiers via
/// the `\.firstLaunchTourModel` environment value. On first launch the model
/// auto-starts; on every subsequent launch the persisted state is consulted
/// and the tour stays dormant.
///
/// ```swift
/// FirstLaunchTour {
///     HomeContent()
///         .firstLaunchTourAnchor(.homeGreeting)
/// }
/// ```
public struct FirstLaunchTour<Content: View>: View {
    @State private var model: FirstLaunchTourModel
    private let content: () -> Content

    /// Gate on the one-shot auto-start. `false` means "Home is mounted but
    /// something is covering it" — the check is deferred rather than burned,
    /// and `.task(id:)` re-runs it the moment this flips to `true`. Hosts pass
    /// their own visibility signal; see `DailyRoomView`.
    public var canAutoStart: Bool = true

    public init(
        tourKey: String = FirstLaunchTourModel.defaultTourKey,
        steps: [FirstLaunchTourStep] = FirstLaunchTourModel.defaultSteps,
        canAutoStart: Bool = true,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self._model = State(
            wrappedValue: FirstLaunchTourModel(tourKey: tourKey, steps: steps)
        )
        self.canAutoStart = canAutoStart
        self.content = content
    }

    /// Test seam — accepts an externally-constructed model so unit tests can
    /// drive the orchestrator without standing up a `@State` storage.
    public init(
        model: FirstLaunchTourModel,
        canAutoStart: Bool = true,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self._model = State(wrappedValue: model)
        self.canAutoStart = canAutoStart
        self.content = content
    }

    public var body: some View {
        content()
            // `.environment(\.firstLaunchTourModel, …)` is the load-bearing
            // injection — the anchor modifier reads via `@Environment` so
            // previews of anchored views render outside a tour host without
            // crashing. (Pre-migration this also installed `.environmentObject`,
            // but with `@Observable` the optional-keyed `@Environment` value is
            // the single injection path.)
            .environment(\.firstLaunchTourModel, model)
            // `id: canAutoStart` is load-bearing — a plain `.task` runs once at
            // mount and would burn the one-shot while Home sits under a pushed
            // route. Keying on the gate re-runs the check when the cover clears.
            .task(id: canAutoStart) {
                guard canAutoStart else { return }
                // S4-1 — install the Supabase adapter when the user is
                // authenticated. Read once at task spin-up; on sign-in the
                // host view re-mounts because of the auth coordinator's
                // identity-tied root view, which means a fresh `.task`
                // fires and we re-bind to the new user's adapter.
                await Self.installSupabaseAdapterIfAuthenticated(model: model)
                model.checkFirstLaunch()
            }
    }

    /// Helper: read the current Supabase user id and, if present, build +
    /// install the cross-device help-state adapter on `model`. Idempotent —
    /// re-installing for the same user is harmless. Failures (no session,
    /// network blip during hydrate) keep the model on the UserDefaults-only
    /// path, matching the v1 / Sprint 3 behaviour.
    @MainActor
    private static func installSupabaseAdapterIfAuthenticated(
        model: FirstLaunchTourModel
    ) async {
        // `auth.session` throws when there's no signed-in user — that's the
        // "anon" path. We leave the model on UserDefaults-only and bail.
        guard let session = try? await SupabaseClientManager.shared.client.auth.session else {
            return
        }
        let userId = session.user.id.uuidString.lowercased()
        let adapter = SupabaseHelpStateAdapter.withSharedClient(userId: userId)
        await adapter.loadState()
        // Sweep any pre-S4-1 UserDefaults entries up to Supabase so the next
        // launch reads cleanly. Returns 0 when there's nothing to migrate.
        _ = await migrateUserDefaultsHelpStateToSupabase(
            adapter: adapter,
            knownTourKeys: [model.tourKey]
        )
        model.enableSupabaseSync(adapter: adapter)
    }
}

// MARK: - Anchor modifier

/// Environment key for the orchestrator model. Using `@Environment` over
/// `@EnvironmentObject` means descendants outside a `FirstLaunchTour` host
/// (e.g. SwiftUI previews of the anchored subview) DO NOT crash — the model
/// resolves to `nil` and the modifier becomes a structural no-op.
private extension EnvironmentValues {
    @Entry var firstLaunchTourModel: FirstLaunchTourModel? = nil
}

/// Tags a view as the anchor for a specific tour step. When the orchestrator
/// is driving that step, this view hosts a SwiftUI `.popover` rendering a
/// coachmark-style card. When the orchestrator is dormant, missing, or
/// driving a different step, the modifier is a structural no-op.
private struct FirstLaunchTourAnchorModifier: ViewModifier {
    let anchor: FirstLaunchTourAnchor
    @Environment(\.firstLaunchTourModel) private var model: FirstLaunchTourModel?

    func body(content: Content) -> some View {
        content
            // Track this anchor's presence so the orchestrator can skip a step
            // whose anchor never mounts (e.g. `.addToRoom` for a zero-room
            // user) instead of stalling on an invisible popover.
            .onAppear { model?.registerAnchor(anchor) }
            .onDisappear { model?.unregisterAnchor(anchor) }
            .popover(isPresented: isShownBinding, arrowEdge: .top) {
                popoverContent
                    .presentationCompactAdaptation(.popover)
            }
    }

    /// Drives the popover directly off the `@Observable` model. The getter
    /// reads `model.isShowingPopover(forAnchor:)` (a tracked computed value);
    /// because that read happens while SwiftUI evaluates `body`, the modifier
    /// re-renders whenever `isActive`/`currentStep` mutate — no Combine
    /// `objectWillChange` bridge or local `@State` mirror required. The setter
    /// treats a SwiftUI-initiated dismiss (outside tap) as a "skip".
    private var isShownBinding: Binding<Bool> {
        Binding(
            get: { model?.isShowingPopover(forAnchor: anchor) ?? false },
            set: { newValue in
                guard let model else { return }
                if !newValue && model.isShowingPopover(forAnchor: anchor) {
                    model.skip()
                }
            }
        )
    }

    @ViewBuilder
    private var popoverContent: some View {
        if let model, let step = model.currentStepDescriptor(forAnchor: anchor) {
            FirstLaunchTourPopoverCard(
                step: step,
                stepNumber: model.currentStepNumber,
                totalSteps: model.totalSteps,
                isFinalStep: model.isOnFinalStep,
                onNext: { model.advance() },
                onSkip: { model.skip() }
            )
        } else {
            Color.clear.frame(width: 1, height: 1).accessibilityHidden(true)
        }
    }
}

public extension View {
    /// Tag this view as the anchor for the given tour step. The wrapping
    /// `FirstLaunchTour` decides whether to render the popover here based on
    /// the current step. No-op outside a `FirstLaunchTour` ancestor — the
    /// anchored view renders identically in previews and in screens that
    /// don't host the tour.
    func firstLaunchTourAnchor(_ anchor: FirstLaunchTourAnchor) -> some View {
        modifier(FirstLaunchTourAnchorModifier(anchor: anchor))
    }
}

// MARK: - Popover card

/// Visual presentation of a tour step. Pulls live CMS copy from Sanity (via
/// `SanityHelpClient`) and renders the "Step X of Y" header + heading +
/// body + Skip / Next layout. Kept private to this file — the tour is the
/// only coachmark surface the app ships.
private struct FirstLaunchTourPopoverCard: View {
    let step: FirstLaunchTourStep
    let stepNumber: Int
    let totalSteps: Int
    let isFinalStep: Bool
    let onNext: () -> Void
    let onSkip: () -> Void

    @State private var loaded: CoachmarkContent? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Step \(stepNumber) of \(totalSteps)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("FirstLaunchTour.StepIndicator")

            Text(resolvedHeading)
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("FirstLaunchTour.Heading")

            Text(resolvedBody)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("FirstLaunchTour.Body")

            HStack {
                Spacer()
                Button("Skip", role: .cancel, action: onSkip)
                    .accessibilityIdentifier("FirstLaunchTour.SkipButton")

                Button(action: onNext) {
                    Text(isFinalStep ? "Done" : (resolvedCtaLabel ?? "Next"))
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier(isFinalStep ? "FirstLaunchTour.DoneButton" : "FirstLaunchTour.NextButton")
            }
        }
        .padding(16)
        .frame(maxWidth: 320)
        .accessibilityElement(children: .combine)
        .task(id: step.surfaceKey) {
            await loadContent()
        }
    }

    private var resolvedHeading: String {
        loaded?.heading ?? step.fallback?.heading ?? ""
    }

    private var resolvedBody: String {
        loaded?.body ?? step.fallback?.body ?? ""
    }

    private var resolvedCtaLabel: String? {
        loaded?.ctaLabel
    }

    private func loadContent() async {
        do {
            let content = try await SanityHelpClient.shared.fetchContent(
                surfaceKey: step.surfaceKey,
                contentType: HelpContentType.coachmark.rawValue,
                persona: .consumer
            )
            if case let .coachmark(payload) = content {
                loaded = payload
            }
        } catch {
            // Invalid surface key or unexpected error — keep the fallback.
        }
    }
}

// MARK: - Previews

#if DEBUG
#Preview("First-launch tour — active step 1") {
    let model = FirstLaunchTourModel()
    return FirstLaunchTour(model: model) {
        VStack(spacing: 32) {
            Text("Greeting header")
                .padding()
                .background(Color.gray.opacity(0.1))
                .firstLaunchTourAnchor(.homeGreeting)

            Text("Product card with + Add")
                .padding()
                .background(Color.gray.opacity(0.1))
                .firstLaunchTourAnchor(.addToRoom)

            Text("Profile monogram")
                .padding()
                .background(Color.gray.opacity(0.1))
                .firstLaunchTourAnchor(.profileMonogram)
        }
        .padding()
        .task {
            // Force-start for preview only — production gates on UserDefaults.
            model.startTour(triggerSource: "preview")
        }
    }
}
#endif
