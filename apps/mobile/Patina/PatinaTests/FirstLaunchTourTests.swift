//
//  FirstLaunchTourTests.swift
//  PatinaTests
//
//  Swift Testing coverage for `FirstLaunchTour` — the Sprint 3 Stream G9
//  iOS first-launch coachmark orchestrator. Mirrors the web
//  `TourController.test.tsx` shape (state-machine + persistence focus)
//  rather than full render-level smoke tests.
//
//  Scope:
//   * `FirstLaunchTourState` persistence round-trips through the injected
//     UserDefaults stub.
//   * `FirstLaunchTourModel.checkFirstLaunch()` auto-starts on the very
//     first launch, stays dormant for resolved / mid-flight tours.
//   * Imperative actions (`startTour`, `advance`, `complete`, `skip`) walk
//     the step pointer and write the correct persistence payload.
//   * Anchor helpers report the right active anchor.
//   * Public initialisers and the SwiftUI view assemble.
//   * Surface keys for the 4 tour-namespace entries are stable.
//

import SwiftUI
import Testing
@testable import Patina

// MARK: - Stub UserDefaults

/// Minimal in-memory `FirstLaunchTourDefaultsProtocol` implementation so
/// tests can drive persistence without touching the real `.standard`
/// defaults (which would leak state across runs).
final class StubFirstLaunchTourDefaults: FirstLaunchTourDefaultsProtocol, @unchecked Sendable {
    private var storage: [String: Data] = [:]

    func data(forKey defaultName: String) -> Data? {
        storage[defaultName]
    }

    func set(_ value: Any?, forKey defaultName: String) {
        if let data = value as? Data {
            storage[defaultName] = data
        } else if value == nil {
            storage.removeValue(forKey: defaultName)
        }
    }

    func removeObject(forKey defaultName: String) {
        storage.removeValue(forKey: defaultName)
    }
}

@MainActor
struct FirstLaunchTourTests {

    // MARK: - Persistence

    @Test
    func firstLaunchTourState_persistenceRoundTrip() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        // Empty defaults → empty state, NOT resolved.
        let initial = getFirstLaunchTourState("ios-first-launch-tour")
        #expect(initial.completed == nil)
        #expect(initial.abandoned == nil)
        #expect(initial.launched == nil)
        #expect(!initial.isResolved)

        // Write a partial patch.
        setFirstLaunchTourState(
            "ios-first-launch-tour",
            FirstLaunchTourState(launched: true)
        )
        let afterLaunch = getFirstLaunchTourState("ios-first-launch-tour")
        #expect(afterLaunch.launched == true)
        #expect(afterLaunch.completed == nil)
        #expect(!afterLaunch.isResolved)
    }

    @Test
    func firstLaunchTourState_mergeWritePreservesPriorFields() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        // First write — only `launched`.
        setFirstLaunchTourState("k", FirstLaunchTourState(launched: true))
        // Second write — only `completed`. The merge MUST preserve `launched`.
        setFirstLaunchTourState("k", FirstLaunchTourState(completed: true, completedAt: "2026-01-01T00:00:00Z"))

        let merged = getFirstLaunchTourState("k")
        #expect(merged.launched == true)
        #expect(merged.completed == true)
        #expect(merged.completedAt == "2026-01-01T00:00:00Z")
        #expect(merged.isResolved)
    }

    @Test
    func firstLaunchTourState_clearRemovesEntry() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        setFirstLaunchTourState("k", FirstLaunchTourState(completed: true, launched: true))
        clearFirstLaunchTourState("k")

        let after = getFirstLaunchTourState("k")
        #expect(after.launched == nil)
        #expect(after.completed == nil)
        #expect(!after.isResolved)
    }

    @Test
    func firstLaunchTourState_storagePrefixMirrorsWebContract() {
        // The web TOUR_STATE_STORAGE_PREFIX MUST match — cross-platform
        // migrations + analytics dashboards depend on this.
        #expect(firstLaunchTourStateStoragePrefix == "help-system.tour.")
        #expect(firstLaunchTourStorageKey("ios-first-launch-tour") == "help-system.tour.ios-first-launch-tour")
    }

    @Test
    func firstLaunchTourState_isResolvedFlagsBothCompletionAndAbandonment() {
        let completed = FirstLaunchTourState(completed: true)
        let abandoned = FirstLaunchTourState(abandoned: true)
        let neither = FirstLaunchTourState(launched: true)

        #expect(completed.isResolved)
        #expect(abandoned.isResolved)
        #expect(!neither.isResolved)
    }

    // MARK: - First-launch detection

    @Test
    func checkFirstLaunch_autoStartsOnFreshDevice() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        #expect(!model.isActive)

        model.checkFirstLaunch()
        #expect(model.isActive)
        #expect(model.currentStep == 0)

        // The auto-start MUST persist `launched: true` so subsequent
        // launches don't re-trigger.
        let state = getFirstLaunchTourState(model.tourKey)
        #expect(state.launched == true)
    }

    @Test
    func checkFirstLaunch_doesNotRestartCompletedTour() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        // Seed: tour already completed.
        setFirstLaunchTourState(
            FirstLaunchTourModel.defaultTourKey,
            FirstLaunchTourState(completed: true, launched: true)
        )

        let model = FirstLaunchTourModel()
        model.checkFirstLaunch()
        #expect(!model.isActive)
    }

    @Test
    func checkFirstLaunch_doesNotRestartAbandonedTour() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        setFirstLaunchTourState(
            FirstLaunchTourModel.defaultTourKey,
            FirstLaunchTourState(abandoned: true, launched: true, atStep: 1)
        )

        let model = FirstLaunchTourModel()
        model.checkFirstLaunch()
        #expect(!model.isActive)
    }

    @Test
    func checkFirstLaunch_doesNotRestartTourThatLaunchedButNeverResolved() {
        // If the user closed the app mid-tour, we DO NOT re-auto-start on
        // the next launch — spec §4.7 rule 1 ("One-shot per user").
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        setFirstLaunchTourState(
            FirstLaunchTourModel.defaultTourKey,
            FirstLaunchTourState(launched: true)
        )

        let model = FirstLaunchTourModel()
        model.checkFirstLaunch()
        #expect(!model.isActive)
    }

    @Test
    func checkFirstLaunch_isIdempotent() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.checkFirstLaunch()
        let firstStep = model.currentStep
        let wasActive = model.isActive

        // Calling again should not regress the step pointer or
        // re-fire analytics. We can't introspect the analytics
        // singleton without a stub, but state should not regress.
        model.checkFirstLaunch()
        #expect(model.isActive == wasActive)
        #expect(model.currentStep == firstStep)
    }

    // MARK: - Imperative actions

    @Test
    func startTour_setsActiveAndPersistsLaunched() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "manual")
        #expect(model.isActive)
        #expect(model.currentStep == 0)
        #expect(getFirstLaunchTourState(model.tourKey).launched == true)
    }

    @Test
    func advance_walksStepPointer() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "test")

        #expect(model.currentStep == 0)
        model.advance()
        #expect(model.currentStep == 1)
        model.advance()
        #expect(model.currentStep == 2)
    }

    @Test
    func advance_pastLastStepCompletes() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "test")
        // Three steps total (indexes 0, 1, 2). Advance twice — we land on
        // the last step. Advancing again should complete + deactivate.
        model.advance()
        model.advance()
        #expect(model.currentStep == 2)
        #expect(model.isActive)

        model.advance()
        #expect(!model.isActive)
        let state = getFirstLaunchTourState(model.tourKey)
        #expect(state.completed == true)
        #expect(state.completedAt != nil)
        #expect(state.isResolved)
    }

    @Test
    func advance_skipsStepWhoseAnchorNeverMounts() async {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.anchorMountGracePeriod = .milliseconds(20)
        // Zero-room home: greeting + profile mount, but the `.savedHeart`
        // product card never does.
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        #expect(model.currentStep == 0)   // homeGreeting
        model.advance()
        #expect(model.currentStep == 1)   // lands on .savedHeart first…
        // …then auto-skips once the grace window elapses with no mount.
        try? await Task.sleep(for: .milliseconds(120))
        #expect(model.currentStep == 2)   // .profileMonogram (mounted)
        #expect(model.isActive)

        model.advance()
        #expect(!model.isActive)          // completes cleanly
        #expect(getFirstLaunchTourState(model.tourKey).completed == true)
    }

    @Test
    func advance_keepsStepWhoseAnchorMountsLate() async {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.anchorMountGracePeriod = .milliseconds(200)
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        model.advance()
        #expect(model.currentStep == 1)   // .savedHeart, not mounted yet
        // The product card mounts a beat later, inside the grace window — the
        // pending skip must cancel so the coachmark is kept (the regression the
        // async-skip fix guards against).
        try? await Task.sleep(for: .milliseconds(20))
        model.registerAnchor(.savedHeart)
        try? await Task.sleep(for: .milliseconds(260))
        #expect(model.currentStep == 1)   // stayed on .savedHeart
        #expect(model.isActive)
    }

    @Test
    func complete_writesPersistenceAndStops() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "test")
        model.complete()
        #expect(!model.isActive)
        let state = getFirstLaunchTourState(model.tourKey)
        #expect(state.completed == true)
        #expect(state.isResolved)
    }

    @Test
    func skip_writesAbandonmentAndStops() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "test")
        model.advance()                 // Now on step 1.
        #expect(model.currentStep == 1)
        model.skip()

        #expect(!model.isActive)
        let state = getFirstLaunchTourState(model.tourKey)
        #expect(state.abandoned == true)
        #expect(state.atStep == 1)
        #expect(state.isResolved)
    }

    @Test
    func skip_isIgnoredWhenInactive() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        // Not active — skip should be a no-op and NOT write abandonment.
        model.skip()
        let state = getFirstLaunchTourState(model.tourKey)
        #expect(state.abandoned == nil)
        #expect(!state.isResolved)
    }

    // MARK: - Anchor helpers

    @Test
    func isShowingPopover_tracksActiveAnchor() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        // Dormant — nothing should claim any anchor.
        #expect(!model.isShowingPopover(forAnchor: .homeGreeting))
        #expect(!model.isShowingPopover(forAnchor: .savedHeart))
        #expect(!model.isShowingPopover(forAnchor: .profileMonogram))

        model.startTour(triggerSource: "test")
        #expect(model.isShowingPopover(forAnchor: .homeGreeting))
        #expect(!model.isShowingPopover(forAnchor: .savedHeart))
        #expect(!model.isShowingPopover(forAnchor: .profileMonogram))

        model.advance()
        #expect(!model.isShowingPopover(forAnchor: .homeGreeting))
        #expect(model.isShowingPopover(forAnchor: .savedHeart))
        #expect(!model.isShowingPopover(forAnchor: .profileMonogram))

        model.advance()
        #expect(!model.isShowingPopover(forAnchor: .homeGreeting))
        #expect(!model.isShowingPopover(forAnchor: .savedHeart))
        #expect(model.isShowingPopover(forAnchor: .profileMonogram))
    }

    @Test
    func currentStepDescriptor_returnsActiveStepOnly() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "test")
        let descriptor = model.currentStepDescriptor(forAnchor: .homeGreeting)
        #expect(descriptor?.anchor == .homeGreeting)
        #expect(descriptor?.surfaceKey == "ios-app/first-launch-tour/step-1-home")

        // Non-matching anchor → nil.
        #expect(model.currentStepDescriptor(forAnchor: .savedHeart) == nil)
    }

    @Test
    func stepNumberAndTotalSteps_areOneBased() {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.startTour(triggerSource: "test")
        #expect(model.currentStepNumber == 1)
        #expect(model.totalSteps == 3)
        model.advance()
        #expect(model.currentStepNumber == 2)
    }

    // MARK: - Default configuration

    @Test
    func defaultModelUsesCanonicalTourKey() {
        let model = FirstLaunchTourModel()
        #expect(model.tourKey == "ios-first-launch-tour")
        #expect(model.steps.count == 3)
        #expect(model.steps.map(\.anchor) == [.homeGreeting, .savedHeart, .profileMonogram])
    }

    @Test
    func defaultStepsMapToFirstLaunchSurfaceKeys() {
        let steps = FirstLaunchTourModel.defaultSteps
        #expect(steps[0].surfaceKey == SurfaceKeys.IOSApp.FirstLaunchTour.step1Home)
        #expect(steps[1].surfaceKey == SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved)
        #expect(steps[2].surfaceKey == SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile)
    }

    @Test
    func defaultStepsCarryConsumerFallbackCopy() {
        let steps = FirstLaunchTourModel.defaultSteps
        for step in steps {
            #expect(step.fallback != nil, "Step \(step.anchor) is missing fallback copy")
            #expect(step.fallback?.heading.isEmpty == false)
            #expect(step.fallback?.body.isEmpty == false)
            // Body cap per spec §8 — staying under 160 to honor the CMS validator.
            #expect((step.fallback?.body.count ?? 0) <= 160)
        }
    }

    // MARK: - Surface key parity (G9 keys)

    @Test
    func firstLaunchTourSurfaceKeys_areValidFormat() {
        #expect(isSurfaceKey(SurfaceKeys.IOSApp.FirstLaunchTour.root))
        #expect(isSurfaceKey(SurfaceKeys.IOSApp.FirstLaunchTour.step1Home))
        #expect(isSurfaceKey(SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved))
        #expect(isSurfaceKey(SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile))
    }

    @Test
    func firstLaunchTourSurfaceKeys_haveTourNamespace() {
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.root == "ios-app/first-launch-tour")
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.step1Home == "ios-app/first-launch-tour/step-1-home")
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved == "ios-app/first-launch-tour/step-2-saved")
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile == "ios-app/first-launch-tour/step-3-profile")
    }

    @Test
    func firstLaunchTourSurfaceKeys_areInAllKnownSet() {
        // Parity test ensures the registry stays in sync; a quick spot-check
        // here catches the "forgot to add to allKnown" foot-gun before the
        // full parity test runs.
        #expect(SurfaceKeys.allKnown.contains(SurfaceKeys.IOSApp.FirstLaunchTour.root))
        #expect(SurfaceKeys.allKnown.contains(SurfaceKeys.IOSApp.FirstLaunchTour.step1Home))
        #expect(SurfaceKeys.allKnown.contains(SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved))
        #expect(SurfaceKeys.allKnown.contains(SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile))
    }

    // MARK: - SwiftUI view assembly
    //
    // Compile-time proof that the public API surface assembles is provided by
    // the parent target's build (the orchestrator is wired into
    // `DailyRoomView` and `DailyGreetingHeader`). We do NOT evaluate `.body`
    // on a `FirstLaunchTour` here because the type uses `@State` storage (for
    // its `@Observable` model), which is only valid inside SwiftUI's render
    // lifecycle — touching it from an XCTest harness crashes the process with a
    // `SIGTRAP`. Render-level coverage is covered by manual on-device smoke
    // testing per the task brief precedent.

    @Test
    func tourStepHelper_constructsWithFallback() {
        let step = FirstLaunchTourStep(
            surfaceKey: SurfaceKeys.IOSApp.FirstLaunchTour.step1Home,
            anchor: .homeGreeting,
            fallback: (heading: "Hi", body: "There")
        )
        #expect(step.anchor == .homeGreeting)
        #expect(step.fallback?.heading == "Hi")
    }

    @Test
    func firstLaunchTourAnchor_rawValuesAreStable() {
        // Anchor raw values are stable strings — they show up in PostHog
        // breakdowns if we ever capture them as analytics dimensions. Lock
        // them down so a rename forces an explicit migration.
        #expect(FirstLaunchTourAnchor.homeGreeting.rawValue == "home-greeting")
        #expect(FirstLaunchTourAnchor.savedHeart.rawValue == "saved-heart")
        #expect(FirstLaunchTourAnchor.profileMonogram.rawValue == "profile-monogram")
    }
}
