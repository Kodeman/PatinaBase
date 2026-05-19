//
//  FirstLaunchTour.swift
//  Patina
//
//  iOS first-launch coachmark tour orchestrator (Sprint 3 / Stream G9).
//
//  Sequences three `HelpCoachmark`-style popover steps on the Home tab the
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
//  │              .firstLaunchTourAnchor(.savedHeart)                         │
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

import Auth
import Combine
import Supabase
import SwiftUI

// MARK: - Anchor identifiers

/// Stable identifiers for each tour-step anchor. Used by the orchestrator to
/// gate which anchor view should display the popover for the current step.
public enum FirstLaunchTourAnchor: String, CaseIterable, Sendable {
    /// Home / Daily Room greeting header (step 1).
    case homeGreeting = "home-greeting"
    /// Saved (heart) affordance on a daily product card (step 2).
    case savedHeart = "saved-heart"
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
    /// Inline fallback heading + body for CMS misses. Mirrors `HelpCoachmark`'s
    /// fallback contract.
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
public final class FirstLaunchTourModel: ObservableObject {
    /// Unique key used for persistence + analytics. Defaults to
    /// `"ios-first-launch-tour"` (the value the spec calls out).
    public let tourKey: String

    /// Ordered step list. Index 0 is the first popover shown.
    public let steps: [FirstLaunchTourStep]

    /// Zero-based active step index. When `isActive == true` the anchor
    /// matching `steps[currentStep].anchor` displays its popover.
    @Published public private(set) var currentStep: Int = 0

    /// Whether the tour is currently driving any popover. Driven by the
    /// first-launch detector — flips to `true` once on the first launch and
    /// back to `false` after `complete()` or `skip()`.
    @Published public private(set) var isActive: Bool = false

    /// Set of step indexes the user actually viewed. Surfaced as the
    /// `steps_viewed` property on `help.tour.completed`.
    private var viewedSteps: Set<Int> = []

    /// Monotonic clock reading taken on auto-start. Used to compute
    /// `duration_ms` for `help.tour.completed`.
    private var startedAt: Date?

    /// Cached analytics facade so tests can swap in a stub.
    private let analytics: HelpAnalytics

    /// Optional Supabase-backed help-state adapter (S4-1). When non-nil the
    /// model consults the adapter's cached entry before UserDefaults during
    /// first-launch detection, and mirrors every persistence write to
    /// Supabase via `Task { … }`. Set via `enableSupabaseSync(_:)` once the
    /// user is authenticated; anonymous + pre-hydration callers fall back to
    /// UserDefaults only (same behaviour as v1 / Sprint 3).
    private var supabaseAdapter: SupabaseHelpStateAdapter?

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
                body: "Your home design board. Today is what's pinned, Saved is the heart, Profile is settings."
            )
        ),
        FirstLaunchTourStep(
            surfaceKey: SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved,
            anchor: .savedHeart,
            fallback: (
                heading: "Your saved finds",
                body: "Tap the heart on any product to save it — your saves follow you across rooms and devices."
            )
        ),
        FirstLaunchTourStep(
            surfaceKey: SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile,
            anchor: .profileMonogram,
            fallback: (
                heading: "Your account",
                body: "Notifications, scan history, designer access, and sign-out all live here."
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
        if currentStep >= steps.count - 1 {
            complete()
            return
        }
        let nextIndex = currentStep + 1
        currentStep = nextIndex
        viewedSteps.insert(nextIndex)
        analytics.tourStepAdvanced(
            tourKey: tourKey,
            stepNumber: nextIndex,
            stepSurfaceKey: steps[nextIndex].surfaceKey
        )
    }

    /// Mark the tour completed and write final persistence. Fires
    /// `help.tour.completed`.
    public func complete() {
        guard isActive else { return }
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

    /// Zero-based active step, surfaced for the "Step X of Y" caption.
    public var currentStepNumber: Int { currentStep + 1 }

    /// Total step count, surfaced for the "Step X of Y" caption.
    public var totalSteps: Int { steps.count }
}

// MARK: - Orchestrator view

/// SwiftUI host view that wraps a screen's content, owns a
/// `FirstLaunchTourModel`, and exposes it to descendant anchor modifiers via
/// `.environmentObject(...)`. On first launch the model auto-starts; on every
/// subsequent launch the persisted state is consulted and the tour stays
/// dormant.
///
/// ```swift
/// FirstLaunchTour {
///     HomeContent()
///         .firstLaunchTourAnchor(.homeGreeting)
/// }
/// ```
public struct FirstLaunchTour<Content: View>: View {
    @StateObject private var model: FirstLaunchTourModel
    private let content: () -> Content

    public init(
        tourKey: String = FirstLaunchTourModel.defaultTourKey,
        steps: [FirstLaunchTourStep] = FirstLaunchTourModel.defaultSteps,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self._model = StateObject(
            wrappedValue: FirstLaunchTourModel(tourKey: tourKey, steps: steps)
        )
        self.content = content
    }

    /// Test seam — accepts an externally-constructed model so unit tests can
    /// drive the orchestrator without standing up a `@StateObject` storage.
    public init(
        model: FirstLaunchTourModel,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self._model = StateObject(wrappedValue: model)
        self.content = content
    }

    public var body: some View {
        content()
            // `.environment(\.firstLaunchTourModel, …)` is the load-bearing
            // injection — the anchor modifier reads via `@Environment` so
            // previews of anchored views render outside a tour host without
            // crashing. `.environmentObject` is also installed so any future
            // descendant that wants a strongly-typed `@EnvironmentObject`
            // binding can opt in without us threading a second key.
            .environment(\.firstLaunchTourModel, model)
            .environmentObject(model)
            .task {
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
private struct FirstLaunchTourModelKey: EnvironmentKey {
    static let defaultValue: FirstLaunchTourModel? = nil
}

private extension EnvironmentValues {
    var firstLaunchTourModel: FirstLaunchTourModel? {
        get { self[FirstLaunchTourModelKey.self] }
        set { self[FirstLaunchTourModelKey.self] = newValue }
    }
}

/// Tags a view as the anchor for a specific tour step. When the orchestrator
/// is driving that step, this view hosts a SwiftUI `.popover` rendering a
/// coachmark-style card. When the orchestrator is dormant, missing, or
/// driving a different step, the modifier is a structural no-op.
private struct FirstLaunchTourAnchorModifier: ViewModifier {
    let anchor: FirstLaunchTourAnchor
    @Environment(\.firstLaunchTourModel) private var model: FirstLaunchTourModel?
    /// Local mirror of the active flag — needed because `@Environment` doesn't
    /// subscribe to `@Published` changes on its own. We bridge via `onReceive`
    /// to the model's `objectWillChange` publisher.
    @State private var isShown: Bool = false

    func body(content: Content) -> some View {
        content
            .popover(isPresented: $isShown, arrowEdge: .top) {
                popoverContent
                    .presentationCompactAdaptation(.popover)
            }
            .onChange(of: isShown) { _, newValue in
                // SwiftUI flipped the popover off — user tapped outside.
                // Treat as abandoned at the current step.
                guard let model else { return }
                if !newValue && model.isShowingPopover(forAnchor: anchor) {
                    model.skip()
                }
            }
            .onReceive(modelPublisher) { _ in
                refreshIsShown()
            }
            .onAppear { refreshIsShown() }
    }

    /// Publisher that fires whenever the orchestrator's `@Published` state
    /// changes. Falls back to an empty publisher when the model is absent so
    /// `.onReceive` is well-typed in either case.
    private var modelPublisher: AnyPublisher<Void, Never> {
        if let model {
            return model.objectWillChange
                .map { _ in () }
                .eraseToAnyPublisher()
        }
        return Empty(completeImmediately: false).eraseToAnyPublisher()
    }

    private func refreshIsShown() {
        let desired = model?.isShowingPopover(forAnchor: anchor) ?? false
        if desired != isShown {
            isShown = desired
        }
    }

    @ViewBuilder
    private var popoverContent: some View {
        if let model, let step = model.currentStepDescriptor(forAnchor: anchor) {
            FirstLaunchTourPopoverCard(
                step: step,
                stepNumber: model.currentStepNumber,
                totalSteps: model.totalSteps,
                isFinalStep: model.currentStep == model.totalSteps - 1,
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
/// `SanityHelpClient`) and renders the same "Step X of Y" header + heading +
/// body + Skip / Next layout that `HelpCoachmark` ships. Kept private to this
/// file so the coachmark primitive remains the canonical public surface.
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

            Text("Product card with heart")
                .padding()
                .background(Color.gray.opacity(0.1))
                .firstLaunchTourAnchor(.savedHeart)

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
