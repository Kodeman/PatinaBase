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

// MARK: - Deterministic waiting

/// Poll `condition` on the main actor until it holds or `timeout` elapses;
/// returns whether it held.
///
/// A literal `Task.sleep` is NOT a safe way to wait out the tour's anchor-mount
/// grace period. The settle checks are `Task { @MainActor … }` jobs, so a
/// step's grace window only starts counting down once the main actor gets
/// around to *running* that job — while the test's own sleep counts wall clock
/// from the moment it is called. Every `@MainActor` test in this target (two
/// dozen suites) shares that one actor under Swift Testing's parallel
/// execution, so a sibling suite holding the actor for longer than the margin
/// between the two durations pushes the settle past the sleep, and the model
/// looks like it never dropped the unmountable step. Waiting on the model's own
/// observable state instead takes exactly as long as the machine needs and no
/// longer — and a genuine regression still fails loudly: the wait times out,
/// its `#expect` fires, and every assertion after it fires too.
@MainActor
private func waitUntil(
    timeout: Duration = .seconds(10),
    _ condition: () -> Bool
) async -> Bool {
    let deadline = ContinuousClock.now.advanced(by: timeout)
    while ContinuousClock.now < deadline {
        if condition() { return true }
        try? await Task.sleep(for: .milliseconds(5))
    }
    return condition()
}

/// `.serialized` is load-bearing, not cosmetic. Two things these tests drive
/// are process-global rather than per-test:
///
///  * `setFirstLaunchTourDefaults(_:)` swaps a module-level singleton
///    (`FirstLaunchTourDefaultsAdapter.shared`), and every test here restores
///    it in a `defer`. Run in parallel, a sibling's `defer` fires while an
///    `async` test is parked on an `await` — pointing the stub that test just
///    installed back at `UserDefaults.standard` mid-flight.
///  * The main actor. Serializing keeps this suite's own tests out of the queue
///    the tour's settle tasks have to get through (see `waitUntil`).
@Suite(.serialized)
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

    @Test
    func checkFirstLaunch_isSafeToDeferAndRetrigger() {
        // U38: the host gates auto-start on Home being visible, so
        // `.task(id: canAutoStart)` calls `checkFirstLaunch()` again when the
        // covering route pops. That re-fire MUST NOT start a second tour —
        // exactly one `startTour` may run for the life of the model.
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.checkFirstLaunch()
        #expect(model.isActive)
        #expect(model.currentStep == 0)

        // Walk one step so a second `startTour` would be observable — it
        // resets `currentStep` to 0 and re-fires `help.tour.started`.
        model.advance()
        #expect(model.currentStep == 1)

        model.checkFirstLaunch()
        #expect(model.isActive)
        #expect(model.currentStep == 1)   // no restart — still exactly one tour
        #expect(getFirstLaunchTourState(model.tourKey).launched == true)
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
        // A guest with nothing true to say: greeting + Studio door mount,
        // but the record card — which draws only where the record has rows —
        // never does.
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        #expect(model.currentStep == 0)   // homeGreeting
        model.advance()
        #expect(model.currentStep == 1)   // lands on .todayRecord first…
        // …then auto-skips once the grace window elapses with no mount.
        let dropped = await waitUntil { model.currentStep == 2 }
        #expect(dropped, "`.todayRecord` never dropped after its grace window elapsed unmounted")
        #expect(model.currentStep == 2)   // .profileMonogram (mounted)
        #expect(model.isActive)

        model.advance()
        #expect(!model.isActive)          // completes cleanly
        #expect(getFirstLaunchTourState(model.tourKey).completed == true)
    }

    @Test
    func advance_computesMountableStepsBeforeAdvancingInZeroRoomState() async {
        // U32 walk regression: a real launch takes several seconds for a user
        // to read and dismiss the first coachmark — far longer than
        // `anchorMountGracePeriod`. The old implementation only started the
        // "will `.todayRecord` ever mount?" clock once `advance()` had already
        // landed on it, so a fast-reading grace window vs. a slow-reading user
        // produced the SAME `currentStep == 1` intermediate landing either way
        // — the model-level tests above pass under both the old and the new
        // implementation and would NOT have caught the walk's repro. What
        // distinguishes them is what happens when the anchor's fate is ALREADY
        // settled by the time the user taps "Next": the tour must jump
        // straight from step 1 to step 3 in that ONE `advance()` call — never
        // landing on (or leaving a popover slot open against) the mid-tour
        // step whose card doesn't exist for a zero-room user. Landing there
        // anyway, even briefly, is the blank window a competing first-run
        // surface (e.g. the Companion intro) can step into, which is what
        // reads to the user as the tour silently completing.
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.anchorMountGracePeriod = .milliseconds(20)
        // A guest with nothing true to say: greeting + Studio door mount
        // immediately; `.todayRecord` never does (no record card is drawn).
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        #expect(model.currentStepNumber == 1)
        #expect(model.totalSteps == 3)

        // Simulate the user reading step 1 for longer than the grace window
        // BEFORE ever tapping "Next" — the realistic case. Wait on the model's
        // own "this step is settled as unmountable" signal rather than a
        // literal sleep (see `waitUntil`); the ordering under test is
        // "`.todayRecord`'s fate is decided BEFORE advance()", not any particular
        // wall-clock duration.
        let settledBeforeAdvance = await waitUntil { model.totalSteps == 2 }
        #expect(
            settledBeforeAdvance,
            "`.todayRecord` never settled as unmountable — the upfront availability check never ran"
        )
        // Settling a step the tour is not sitting on must not move the pointer
        // on its own; the jump below has to come out of `advance()`.
        #expect(model.currentStep == 0)

        model.advance()

        #expect(model.currentStep == 2)          // straight to .profileMonogram
        #expect(model.currentStepNumber == 2)    // "Step 2 of 2" on first landing
        #expect(model.totalSteps == 2)
        #expect(model.isOnFinalStep)
        #expect(model.isActive)                  // never silently completed

        // The tour still ends cleanly once the user actually finishes it —
        // no leftover, un-shown step haunting `complete()`.
        model.advance()
        #expect(!model.isActive)
        #expect(getFirstLaunchTourState(model.tourKey).completed == true)
    }

    @Test
    func unregisterAnchor_renumbersWhenTheCurrentStepsAnchorDisappearsMidRun() {
        // "Never silently drop a step mid-tour": a step whose anchor vanishes
        // AFTER the tour arrived there (e.g. the feed reloads and the card
        // disappears out from under an open popover) must renumber the
        // remainder immediately, exactly like a step that never mounted —
        // not leave a coachmark pointed at a view that's gone.
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.todayRecord)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        model.advance()
        #expect(model.currentStep == 1)          // .todayRecord, mounted normally
        #expect(model.currentStepNumber == 2)
        #expect(model.totalSteps == 3)

        model.unregisterAnchor(.todayRecord)

        #expect(model.currentStep == 2)          // walked forward automatically
        #expect(model.currentStepNumber == 2)    // renumbered — "Step 2 of 2"
        #expect(model.totalSteps == 2)
        #expect(model.isOnFinalStep)
        #expect(model.isActive)                  // never silently completed
    }

    @Test
    func advance_keepsStepWhoseAnchorMountsLate() async {
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        // This is the one assertion in the suite that can't be waited for — it
        // pins a NON-event ("the step was never dropped"), so proving it needs
        // real time to pass. The grace window is therefore sized generously
        // against main-actor contention rather than trimmed for speed: the beat
        // below has to land inside it even when a sibling suite is sitting on
        // the actor (see `waitUntil`).
        model.anchorMountGracePeriod = .milliseconds(750)
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        model.advance()
        #expect(model.currentStep == 1)   // .todayRecord, not mounted yet
        // The product card mounts a beat later, inside the grace window — the
        // pending skip must cancel so the coachmark is kept (the regression the
        // async-skip fix guards against).
        try? await Task.sleep(for: .milliseconds(20))
        model.registerAnchor(.todayRecord)
        try? await Task.sleep(for: .milliseconds(850))
        #expect(model.currentStep == 1)   // stayed on .todayRecord
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
        #expect(!model.isShowingPopover(forAnchor: .todayRecord))
        #expect(!model.isShowingPopover(forAnchor: .profileMonogram))

        model.startTour(triggerSource: "test")
        #expect(model.isShowingPopover(forAnchor: .homeGreeting))
        #expect(!model.isShowingPopover(forAnchor: .todayRecord))
        #expect(!model.isShowingPopover(forAnchor: .profileMonogram))

        model.advance()
        #expect(!model.isShowingPopover(forAnchor: .homeGreeting))
        #expect(model.isShowingPopover(forAnchor: .todayRecord))
        #expect(!model.isShowingPopover(forAnchor: .profileMonogram))

        model.advance()
        #expect(!model.isShowingPopover(forAnchor: .homeGreeting))
        #expect(!model.isShowingPopover(forAnchor: .todayRecord))
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
        #expect(model.currentStepDescriptor(forAnchor: .todayRecord) == nil)
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
        #expect(!model.isOnFinalStep)
        model.advance()
        #expect(model.currentStepNumber == 2)
        model.advance()
        #expect(model.isOnFinalStep)
    }

    @Test
    func stepCaption_renumbersVisiblyWhenAnAnchorNeverMounts() async {
        // U32: a skipped step must leave the caption self-consistent —
        // "Step 1 of 3" → "Step 2 of 2", never "Step 1 of 3" → "Step 3 of 3"
        // with a step the user reads as missing.
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.anchorMountGracePeriod = .milliseconds(20)
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        #expect(model.currentStepNumber == 1)
        #expect(model.totalSteps == 3)

        model.advance()                                   // lands on .todayRecord
        let renumbered = await waitUntil { model.currentStep == 2 }  // …which never mounts
        #expect(renumbered, "`.todayRecord` never dropped, so the caption never renumbered")

        #expect(model.currentStep == 2)                   // .profileMonogram
        #expect(model.currentStepNumber == 2)             // renumbered, not 3
        #expect(model.totalSteps == 2)                    // denominator shrank
        #expect(model.isOnFinalStep)                      // still the last step
    }

    // MARK: - Default configuration

    @Test
    func defaultModelUsesCanonicalTourKey() {
        let model = FirstLaunchTourModel()
        #expect(model.tourKey == "ios-first-launch-tour")
        #expect(model.steps.count == 3)
        // B-8: step 2 moved off `.addToRoom`, whose view W2 retired.
        #expect(model.steps.map(\.anchor) == [.homeGreeting, .todayRecord, .profileMonogram])
    }

    @Test
    func defaultStepsMapToFirstLaunchSurfaceKeys() {
        let steps = FirstLaunchTourModel.defaultSteps
        #expect(steps[0].surfaceKey == SurfaceKeys.IOSApp.FirstLaunchTour.step1Home)
        #expect(steps[1].surfaceKey == SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved)
        #expect(steps[2].surfaceKey == SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile)
    }

    @Test
    func defaultStepFallbacksMatchTheGlossary() {
        // U32: the fallbacks describe controls that actually exist on Home.
        // Sanity-served copy still overrides these at runtime — these are the
        // offline / CMS-miss strings, and they are design-authority verbatim.
        let steps = FirstLaunchTourModel.defaultSteps
        // B-8, verbatim. Step 1 no longer says "Daily Room" (B-7 c retires the
        // name); step 2 describes the record it now points at; step 3 names the
        // studio rather than a profile reached from a monogram that is gone.
        #expect(steps[0].fallback?.heading == "Welcome to Patina")
        #expect(steps[0].fallback?.body == "This is Today — what moved in your house, and what is waiting on you.")
        #expect(steps[1].fallback?.heading == "What needs you")
        #expect(steps[1].fallback?.body == "Anything waiting on you lands here, dated. Tap a line to go straight to it.")
        #expect(steps[2].fallback?.heading == "Your Studio")
        #expect(steps[2].fallback?.body == "Your studio — projects, proposals, invoices and files")
    }

    @Test
    func defaultStepFallbacksNameNothingTheAppRetired() {
        // B-7(c) retires "Daily Room" in favour of the word already on the
        // screen; W2 retired `DailyProductCard` and with it the "+ Add"
        // capsule step 2 used to name; M1 removed the monogram step 3 named.
        // Each of these was live copy on a shipped build.
        let copy = FirstLaunchTourModel.defaultSteps
            .compactMap { $0.fallback }
            .map { "\($0.heading) \($0.body)" }
            .joined(separator: " ")
            .lowercased()

        #expect(!copy.contains("daily room"))
        #expect(!copy.contains("+ add"))
        #expect(!copy.contains("monogram"))
    }

    @Test
    func everyDefaultStepAnchorHasExactlyOneProductionMount() throws {
        // The defect this whole rewrite starts from: an anchor in the step list
        // that no view carries. The tour drops it silently and runs short —
        // "Step 1 of 2" against a three-step list, seen in four research walks.
        // A second mount would be just as wrong: two popovers, one step.
        let views = SourcePin.swiftFiles(under: "Patina/Features")
            .filter { !$0.hasSuffix("FirstLaunchTour.swift") }
            .compactMap { try? String(contentsOfFile: $0, encoding: .utf8) }

        for step in FirstLaunchTourModel.defaultSteps {
            let mounts = views.reduce(0) { total, source in
                total + SourceScan.code(in: source)
                    .components(separatedBy: ".firstLaunchTourAnchor(.\(step.anchor))")
                    .count - 1
            }
            #expect(
                mounts == 1,
                "anchor .\(step.anchor) is mounted \(mounts) times in production views, not once"
            )
        }
    }

    @Test
    func theTourStillRunsAllThreeStepsWhenEveryAnchorMounts() {
        // The counterpart to the drop tests above: with the record on screen —
        // an activeProject client, which is who the tour's copy is written for
        // — the tour is three steps, numbered 1, 2, 3, and completes on the
        // third.
        let stub = StubFirstLaunchTourDefaults()
        setFirstLaunchTourDefaults(stub)
        defer { resetFirstLaunchTourDefaults() }

        let model = FirstLaunchTourModel()
        model.registerAnchor(.homeGreeting)
        model.registerAnchor(.todayRecord)
        model.registerAnchor(.profileMonogram)
        model.startTour(triggerSource: "test")

        #expect(model.currentStepNumber == 1)
        #expect(model.totalSteps == 3)
        #expect(model.isShowingPopover(forAnchor: .homeGreeting))

        model.advance()
        #expect(model.currentStepNumber == 2)
        #expect(model.totalSteps == 3)
        #expect(model.isShowingPopover(forAnchor: .todayRecord))
        #expect(!model.isOnFinalStep)

        model.advance()
        #expect(model.currentStepNumber == 3)
        #expect(model.isShowingPopover(forAnchor: .profileMonogram))
        #expect(model.isOnFinalStep)

        model.advance()
        #expect(!model.isActive)
        #expect(getFirstLaunchTourState(model.tourKey).completed == true)
    }

    @Test
    func defaultStepFallbacksNameNoHeartControl() {
        // The Daily Room ships a "+ Add" capsule, not a heart. Guard the
        // regression that made step 2 point at a control that never existed.
        for step in FirstLaunchTourModel.defaultSteps {
            #expect(step.fallback?.heading.lowercased().contains("heart") == false)
            #expect(step.fallback?.body.lowercased().contains("heart") == false)
        }
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
        #expect(FirstLaunchTourAnchor.addToRoom.rawValue == "add-to-room")
        #expect(FirstLaunchTourAnchor.todayRecord.rawValue == "today-record")
        // Deliberately NOT renamed with the control it names (steward §7·F):
        // it keys the Sanity document behind step 3.
        #expect(FirstLaunchTourAnchor.profileMonogram.rawValue == "profile-monogram")
    }
}
