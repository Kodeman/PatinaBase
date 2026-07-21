//
//  CompanionCoachingModelTests.swift
//  PatinaTests
//
//  Swift Testing coverage for `CompanionCoachingModel` — the non-UI foundation
//  of the Companion "living companion" coaching system. Focus is the phase state
//  machine, the intro budget + tour-sequencing gate, and the analytics seam.
//
//  Every test injects a private `UserDefaults(suiteName:)` (cleaned up in a
//  `defer`), a controllable clock, a stubbed tour-state provider, and a
//  capturing `track` closure — so nothing touches `.standard` defaults, the real
//  clock, the real first-launch tour, or PostHog.
//

import Foundation
import Testing
@testable import Patina

// MARK: - Test doubles

/// Captures analytics events emitted through the coaching seam. All access is
/// serialized on the main actor in practice (the model is `@MainActor`).
private final class CoachingEventRecorder: @unchecked Sendable {
    private(set) var events: [CoachingTrackEvent] = []
    func record(_ event: CoachingTrackEvent) { events.append(event) }
}

/// Mutable clock so tests can advance time for the 14-day graduation check.
private final class MutableClock: @unchecked Sendable {
    var current: Date
    init(_ start: Date) { current = start }
    func now() -> Date { current }
}

/// Mutable tour-state holder so `introGate()` polling can observe a state that
/// flips from unresolved to resolved mid-flight.
private final class TourStateBox: @unchecked Sendable {
    var state: FirstLaunchTourState?
    init(_ state: FirstLaunchTourState?) { self.state = state }
    func get() -> FirstLaunchTourState? { state }
}

@MainActor
struct CompanionCoachingModelTests {

    // MARK: - Helpers

    /// A canonical fixed "now" used when a test doesn't care about the clock.
    private static let fixedNow = Date(timeIntervalSince1970: 1_000_000_000)

    private func makeDefaults() -> (UserDefaults, String) {
        let suite = "test.companion.coaching.\(UUID().uuidString)"
        return (UserDefaults(suiteName: suite)!, suite)
    }

    private func makeModel(
        defaults: UserDefaults,
        now: @escaping () -> Date = { CompanionCoachingModelTests.fixedNow },
        tourState: @escaping () -> FirstLaunchTourState? = { FirstLaunchTourState() },
        recorder: CoachingEventRecorder
    ) -> CompanionCoachingModel {
        CompanionCoachingModel(
            defaults: defaults,
            now: now,
            tourState: tourState,
            track: { recorder.record($0) }
        )
    }

    // MARK: - 1. new → learning on first panel expand

    @Test
    func firstPanelExpand_transitionsNewToLearning_andEmits() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        #expect(model.phase == .new)
        #expect(model.markAttention == .full)

        model.recordPanelExpanded()

        #expect(model.phase == .learning)
        #expect(model.markAttention == .ambient)
        #expect(recorder.events == [.phaseChanged(from: "new", to: "learning", navCount: 0)])

        // Second expand is a no-op — no duplicate transition.
        model.recordPanelExpanded()
        #expect(model.phase == .learning)
        #expect(recorder.events.count == 1)
    }

    // MARK: - 2. learning → learned at 3rd navigation

    @Test
    func thirdNavigation_transitionsLearningToLearned_andEmits() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        model.recordPanelExpanded()           // → learning (event 1)
        #expect(model.phase == .learning)

        _ = model.recordCompanionNavigation()  // 1
        #expect(model.phase == .learning)
        _ = model.recordCompanionNavigation()  // 2
        #expect(model.phase == .learning)
        _ = model.recordCompanionNavigation()  // 3 → learned
        #expect(model.phase == .learned)
        #expect(model.markAttention == .calm)

        #expect(recorder.events == [
            .phaseChanged(from: "new", to: "learning", navCount: 0),
            .phaseChanged(from: "learning", to: "learned", navCount: 3),
        ])
    }

    // MARK: - 3. 14-day auto-graduation via lazy phase read

    @Test
    func fourteenDays_autoGraduatesOnLazyPhaseRead() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let clock = MutableClock(CompanionCoachingModelTests.fixedNow)
        let model = makeModel(defaults: defaults, now: { clock.now() }, recorder: recorder)

        model.recordMainSessionStart()   // stamps enteredMainAt = fixedNow
        model.recordPanelExpanded()      // → learning (graduation only from learning)
        #expect(model.phase == .learning)

        // 13 days later — still learning.
        clock.current = CompanionCoachingModelTests.fixedNow.addingTimeInterval(13 * 24 * 60 * 60)
        #expect(model.phase == .learning)

        // 15 days later — lazy read graduates to learned.
        clock.current = CompanionCoachingModelTests.fixedNow.addingTimeInterval(15 * 24 * 60 * 60)
        #expect(model.phase == .learned)
        #expect(recorder.events.last == .phaseChanged(from: "learning", to: "learned", navCount: 0))
    }

    // MARK: - 4. no phase regression

    @Test
    func learnedPhase_doesNotRegress() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        model.recordPanelExpanded()
        _ = model.recordCompanionNavigation()
        _ = model.recordCompanionNavigation()
        _ = model.recordCompanionNavigation()
        #expect(model.phase == .learned)
        let eventCountAtLearned = recorder.events.count

        // Re-expanding the panel must not push the phase backward or re-emit.
        model.recordPanelExpanded()
        #expect(model.phase == .learned)

        // Further navigations must not regress either.
        _ = model.recordCompanionNavigation()
        #expect(model.phase == .learned)
        #expect(recorder.events.count == eventCountAtLearned)
    }

    // MARK: - 5. legacy-key migration

    @Test
    func legacyCoachmarkSeen_migratesToLearning_andSuppressesIntro() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        // Existing user who already dismissed the old panel coachmark.
        defaults.set(true, forKey: "patina.companion.coachmarkSeen")

        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        #expect(model.phase == .learning)
        #expect(model.markAttention == .ambient)
        #expect(model.canShowIntro == false)
        // Migration is a silent seed — no phase-changed event fires.
        #expect(recorder.events.isEmpty)
        // The seed persisted the spent intro budget.
        #expect(defaults.integer(forKey: "patina.companion.coaching.introShownCount") == 2)
        #expect(defaults.string(forKey: "patina.companion.coaching.phase") == "learning")
    }

    // MARK: - 6. intro cap

    @Test
    func introShown_capsAtTwo_thenCannotShow() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        #expect(model.canShowIntro == true)

        model.recordIntroShown(trigger: "first_arrival")
        #expect(model.canShowIntro == true)
        model.recordIntroShown(trigger: "second_session")
        #expect(model.canShowIntro == false)

        #expect(recorder.events == [
            .introShown(trigger: "first_arrival", shownCount: 1),
            .introShown(trigger: "second_session", shownCount: 2),
        ])

        // A third attempt is a no-op — count stays 2, nothing new emitted.
        model.recordIntroShown(trigger: "stuck")
        #expect(recorder.events.count == 2)
        #expect(defaults.integer(forKey: "patina.companion.coaching.introShownCount") == 2)
    }

    // MARK: - 7. introGate sequencing

    @Test
    func introGate_resolvedSnapshot_returnsTrueImmediately() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(
            defaults: defaults,
            tourState: { FirstLaunchTourState(completed: true, launched: true) },
            recorder: recorder
        )

        let result = await model.introGate()
        #expect(result == true)
    }

    @Test
    func introGate_launchedButUnresolvedSnapshot_returnsTrueAfterGrace() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(
            defaults: defaults,
            tourState: { FirstLaunchTourState(launched: true) },
            recorder: recorder
        )
        model.introGateGracePeriod = .milliseconds(20)

        let result = await model.introGate()
        #expect(result == true)
    }

    @Test
    func introGate_freshUser_pollsUntilTourResolves() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let box = TourStateBox(FirstLaunchTourState())   // fresh, unresolved
        let model = makeModel(defaults: defaults, tourState: { box.get() }, recorder: recorder)
        model.introGatePollInterval = .milliseconds(10)
        model.introGateTimeout = .seconds(5)

        let task = Task { await model.introGate() }
        // Let it poll a few times while still unresolved, then resolve.
        try? await Task.sleep(for: .milliseconds(50))
        box.state = FirstLaunchTourState(completed: true, launched: true)

        let result = await task.value
        #expect(result == true)
    }

    @Test
    func introGate_freshUser_timesOutToFalse() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(
            defaults: defaults,
            tourState: { FirstLaunchTourState() },   // never resolves
            recorder: recorder
        )
        model.introGatePollInterval = .milliseconds(5)
        model.introGateTimeout = .milliseconds(40)

        let result = await model.introGate()
        #expect(result == false)
    }

    @Test
    func introGate_honorsCancellation() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(
            defaults: defaults,
            tourState: { FirstLaunchTourState() },   // fresh → would poll indefinitely
            recorder: recorder
        )
        model.introGatePollInterval = .milliseconds(10)
        model.introGateTimeout = .seconds(60)

        let task = Task { await model.introGate() }
        try? await Task.sleep(for: .milliseconds(30))
        task.cancel()
        let result = await task.value
        #expect(result == false)
    }

    // MARK: - 8. first-nav ack exactly once

    @Test
    func firstNavAck_returnedExactlyOnce() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        #expect(model.recordCompanionNavigation() == .showFirstNavAck)
        #expect(model.recordCompanionNavigation() == .none)
        #expect(model.recordCompanionNavigation() == .none)
    }

    @Test
    func firstNavAck_isNotRepeatedAcrossModelReloads() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()

        let model1 = makeModel(defaults: defaults, recorder: recorder)
        #expect(model1.recordCompanionNavigation() == .showFirstNavAck)

        // A fresh process (same persisted defaults) must not re-award the ack.
        let model2 = makeModel(defaults: defaults, recorder: recorder)
        #expect(model2.recordCompanionNavigation() == .none)
    }

    // MARK: - 9. events captured through the seam with correct payloads

    @Test
    func analyticsSeam_capturesEventPayloads() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        model.recordIntroShown(trigger: "stuck")
        model.recordIntroDismissed(action: "later", viewedMs: 1234)
        model.recordReinforcementShown(kind: "panel_coachmark")

        #expect(recorder.events == [
            .introShown(trigger: "stuck", shownCount: 1),
            .introDismissed(action: "later", viewedMs: 1234),
            .reinforcementShown(kind: "panel_coachmark"),
        ])
    }

    // MARK: - Extras: recordMainSessionStart idempotency & panel coachmark gate

    @Test
    func recordMainSessionStart_stampsOnceAndIsIdempotent() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let clock = MutableClock(CompanionCoachingModelTests.fixedNow)
        let model = makeModel(defaults: defaults, now: { clock.now() }, recorder: recorder)

        model.recordMainSessionStart()
        let stamped = defaults.double(forKey: "patina.companion.coaching.enteredMainAt")
        #expect(stamped == CompanionCoachingModelTests.fixedNow.timeIntervalSince1970)

        // Advancing the clock and calling again must not re-stamp.
        clock.current = CompanionCoachingModelTests.fixedNow.addingTimeInterval(999)
        model.recordMainSessionStart()
        #expect(defaults.double(forKey: "patina.companion.coaching.enteredMainAt") == stamped)
    }

    @Test
    func shouldShowPanelCoachmark_gatesOnPhaseAndLegacyKey() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        // New user, legacy key unset → coachmark eligible.
        #expect(model.shouldShowPanelCoachmark == true)

        // Once learned, the coachmark is suppressed.
        model.recordPanelExpanded()
        _ = model.recordCompanionNavigation()
        _ = model.recordCompanionNavigation()
        _ = model.recordCompanionNavigation()
        #expect(model.phase == .learned)
        #expect(model.shouldShowPanelCoachmark == false)
    }

    @Test
    func shouldShowPanelCoachmark_suppressedWhenLegacyKeySet() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(true, forKey: "patina.companion.coachmarkSeen")
        let recorder = CoachingEventRecorder()
        let model = makeModel(defaults: defaults, recorder: recorder)

        // Migrated to .learning (not .learned), but the legacy key still
        // suppresses the panel coachmark.
        #expect(model.phase == .learning)
        #expect(model.shouldShowPanelCoachmark == false)
    }
}
