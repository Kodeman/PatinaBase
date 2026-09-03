//
//  LaunchWatchdogFallbackTests.swift
//  PatinaTests
//
//  L1-F's half of `C1-19` and `C1-18` — the two constants live in
//  `LaunchWatchdog` (L1-B's file, `Core/State/`), and this suite proves the
//  coordinator obeys them.
//
//  `LaunchWatchdogTests` on L1-B's branch pins the constants themselves and
//  the splash's sentence. This one pins the phase machine: past the deadline
//  an unresolved launch stops returning `.launching`, because a splash the
//  person never leaves is a bug they can only describe as "it never opened".
//
//  It reads `AppCoordinator.launchGate(…)` rather than driving a coordinator:
//  `isAuthStateReady` is set only from inside the `for await` over
//  `authStateChanges`, and in the unit test host that stream HAS resolved —
//  so the one state both findings are about is unreachable through the
//  singleton, and only a pure function can be held to it.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct LaunchWatchdogFallbackTests {

    private let now = Date(timeIntervalSince1970: 1_787_000_000)

    // MARK: - C1-19

    /// Before the deadline, an unresolved launch is still the splash. The
    /// watchdog is a floor under a failure, not a shortcut past a slow network.
    @Test("an unresolved launch is still .launching before the deadline")
    func theWatchdogDoesNotFireEarly() {
        let phase = AppCoordinator.launchGate(
            isAuthStateReady: false,
            now: now,
            launchDeadline: now.addingTimeInterval(1),
            splashMinimumDeadline: now.addingTimeInterval(-1)
        )
        #expect(phase == .launching)
    }

    /// Past it, the app falls through to `.auth`, where there is something to
    /// tap.
    @Test("past the deadline an unresolved launch lands on .auth")
    func theWatchdogFires() {
        let phase = AppCoordinator.launchGate(
            isAuthStateReady: false,
            now: now,
            launchDeadline: now.addingTimeInterval(-0.001),
            splashMinimumDeadline: now.addingTimeInterval(-1)
        )
        #expect(phase == .auth)
    }

    /// The splash floor never outranks the watchdog: an unresolved launch past
    /// the deadline goes to `.auth` even where a floor is still running, or the
    /// two deadlines could deadlock each other.
    @Test("the floor cannot hold a launch the watchdog has released")
    func theWatchdogOutranksTheFloor() {
        let phase = AppCoordinator.launchGate(
            isAuthStateReady: false,
            now: now,
            launchDeadline: now.addingTimeInterval(-1),
            splashMinimumDeadline: now.addingTimeInterval(60)
        )
        #expect(phase == .auth)
    }

    /// A resolved launch is not gated at all once its floor has run — the rest
    /// of `derivePhase()`'s inputs decide.
    @Test("a resolved launch past its floor is not held")
    func aResolvedLaunchIsReleased() {
        let phase = AppCoordinator.launchGate(
            isAuthStateReady: true,
            now: now,
            launchDeadline: now.addingTimeInterval(-1),
            splashMinimumDeadline: now.addingTimeInterval(-1)
        )
        #expect(phase == nil)
    }

    @Test("a resolved launch inside its floor still plays the splash")
    func aResolvedLaunchInsideTheFloorIsHeld() {
        let phase = AppCoordinator.launchGate(
            isAuthStateReady: true,
            now: now,
            launchDeadline: now.addingTimeInterval(-1),
            splashMinimumDeadline: now.addingTimeInterval(0.3)
        )
        #expect(phase == .launching)
    }

    /// The coordinator schedules the recompute itself — nothing else wakes the
    /// phase observer, because `Date()` is not a tracked property. Pinned in
    /// source: the real deadline is 8 s and cannot be waited on in a unit run.
    @Test("the coordinator arms the watchdog at launch")
    func theWatchdogIsArmed() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/App/Coordinators/AppCoordinator.swift")
        )
        #expect(code.contains("private func scheduleLaunchWatchdog()"))
        #expect(code.contains("scheduleLaunchWatchdog()"))
        #expect(code.contains("LaunchWatchdog.stallDeadline"))
        #expect(code.contains("Self.launchGate("))
        // The old unconditional read is what made the splash terminal.
        #expect(code.contains("let splashStillPlaying = Date() < splashMinimumDeadline") == false)
    }

    // MARK: - C1-18

    /// The floor an unresolved launch pays is `LaunchWatchdog`'s, not the 1.5 s
    /// that put ~3 s between a tap and content.
    @Test("the splash floor is the watchdog's, not the old 1.5")
    func theFloorIsTheSharedOne() {
        #expect(
            AppCoordinator.splashMinimumDuration
                == LaunchWatchdog.splashFloor(isAuthStateReady: false)
        )
        #expect(AppCoordinator.splashMinimumDuration < 1.5)
    }

    /// And a fresh coordinator's own deadline is that floor, not a longer one
    /// written separately — one number, one place.
    @Test("a fresh coordinator's splash deadline is that floor")
    func theInitialDeadlineIsTheFloor() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        let remaining = coordinator.splashMinimumDeadline.timeIntervalSinceNow
        #expect(remaining <= LaunchWatchdog.splashFloor(isAuthStateReady: false))
        #expect(remaining > 0)
    }
}
