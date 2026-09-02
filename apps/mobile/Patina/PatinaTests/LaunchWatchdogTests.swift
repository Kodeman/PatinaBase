//
//  LaunchWatchdogTests.swift
//  PatinaTests
//
//  C1-19 and C1-18, the two halves of the first three seconds.
//
//  C1-19: `.launching` had no deadline. `derivePhase()` returns it whenever
//  `isAuthStateReady` is false, and that flag is set only from inside the
//  `for await` over `authStateChanges`. A stream that never yields — a
//  failing keychain read is the recorded precedent — is a splash the person
//  never leaves, and cannot describe beyond "it never opened".
//  C1-18: ~1 s of init plus an unconditional 1.5 s floor plus a 0.5 s
//  crossfade is about three seconds to content, with the wordmark's own 2.0 s
//  fade cut mid-animation every time.
//
//  `AppCoordinator` is L1-F's file; its half of both — forcing `.auth` at the
//  deadline and dropping the floor — arrives as an integration note and reads
//  the same constants pinned here.
//

import Foundation
import Testing
@testable import Patina

struct LaunchWatchdogTests {

    // MARK: - C1-19

    @Test
    func theDeadlineIsInTheRangeTheFindingAsksFor() {
        #expect(LaunchWatchdog.stallDeadline >= 5)
        #expect(LaunchWatchdog.stallDeadline <= 8)
    }

    @Test
    func nothingIsSurfacedBeforeTheDeadline() {
        #expect(LaunchWatchdog.shouldSurfaceStall(elapsed: 0, isAuthStateReady: false) == false)
        #expect(LaunchWatchdog.shouldSurfaceStall(elapsed: 4.9, isAuthStateReady: false) == false)
        #expect(
            LaunchWatchdog.shouldSurfaceStall(
                elapsed: LaunchWatchdog.stallDeadline - 0.1, isAuthStateReady: false
            ) == false
        )
    }

    @Test
    func theStallIsSurfacedOnceTheDeadlinePassesWithNoReadiness() {
        #expect(
            LaunchWatchdog.shouldSurfaceStall(
                elapsed: LaunchWatchdog.stallDeadline, isAuthStateReady: false
            )
        )
        #expect(LaunchWatchdog.shouldSurfaceStall(elapsed: 600, isAuthStateReady: false))
    }

    /// A slow launch that resolved is not a stall, however long it took.
    @Test
    func aReadyLaunchNeverSurfacesTheStall() {
        for elapsed in [0.0, 8.0, 600.0] {
            #expect(LaunchWatchdog.shouldSurfaceStall(elapsed: elapsed, isAuthStateReady: true) == false)
        }
    }

    /// One line, no vendor, no server, no status code — a homeowner reads it.
    @Test
    func theMessageIsOneHonestLine() {
        let message = LaunchWatchdog.stallMessage
        #expect(message.contains("\n") == false)
        #expect(message.count < 80)
        for forbidden in ["Supabase", "GoTrue", "keychain", "HTTP", "error", "nil"] {
            #expect(message.localizedCaseInsensitiveContains(forbidden) == false)
        }
    }

    @Test
    func theSplashSurfacesIt() throws {
        let source = try SourcePin.read("Patina/Features/Splash/Views/SplashView.swift")
        #expect(source.contains("SplashView.StallMessage"))
        #expect(source.contains("LaunchWatchdog.shouldSurfaceStall("))
        #expect(source.contains("LaunchWatchdog.stallMessage"))
    }

    // MARK: - C1-18

    @Test
    func aRestoredSessionPaysNoSplashFloor() {
        #expect(LaunchWatchdog.splashFloor(isAuthStateReady: true) == 0)
    }

    @Test
    func anUnresolvedLaunchPaysAShortOne() {
        let floor = LaunchWatchdog.splashFloor(isAuthStateReady: false)
        #expect(floor > 0)
        #expect(floor <= 0.6)
        #expect(floor < AppCoordinator.splashMinimumDuration)
    }

    /// The animation has to finish inside the shortest floor the coordinator
    /// can apply, or the wordmark is cut mid-fade again.
    @Test
    func theWordmarkAnimationFinishesInsideTwelveHundredMilliseconds() throws {
        let source = try SourcePin.read("Patina/Features/Splash/Views/SplashView.swift")
        #expect(source.contains(".easeOut(duration: 2.0)") == false)
        #expect(source.contains(".easeOut(duration: 1.2)"))
        // Strata: 0.4 s delay + 0.6 s fade = 1.0 s, inside the wordmark's.
        #expect(source.contains(".easeOut(duration: 0.6).delay(0.4)"))
    }
}
