//
//  LaunchWatchdog.swift
//  Patina
//
//  The deadline that stops the splash being terminal.
//
//  C1-19: `derivePhase()` returns `.launching` whenever
//  `AuthService.isAuthStateReady` is false, and that flag is set only from
//  inside the `for await` over `supabase.auth.authStateChanges`. If the
//  stream never yields — a failing keychain read is the recorded precedent —
//  nothing else sets it, and the splash is where the app ends. A tester
//  cannot describe that beyond "it never opened".
//
//  Two halves share this file so they cannot drift: `SplashView` surfaces the
//  line, and `AppCoordinator` (L1-F) forces `.auth` at the same deadline.
//

import Foundation

enum LaunchWatchdog {

    /// How long a launch may sit unresolved before the app says something.
    /// C1-19 asks for 5–8 s; 8 is the far end, because a cold launch on a
    /// slow network legitimately takes several seconds and a false alarm
    /// teaches people to distrust the message.
    static let stallDeadline: TimeInterval = 8

    /// When the *splash* says it — strictly before the coordinator acts.
    ///
    /// Both halves used `stallDeadline`, and the two clocks do not start
    /// together: `AppCoordinator.launchDeadline` is a stored property
    /// initialised inside `PatinaApp.init()`, before `SplashView`'s body
    /// mounts and its `.task` begins sleeping. So at T+8 s the coordinator
    /// recomputed first, forced `.auth`, tore the splash down and cancelled
    /// the `.task` — and the sentence below was unreachable UI in every
    /// launch it exists for (review `RL1B3-02`).
    ///
    /// A second and a half is wider than the gap between `init()` and the
    /// first frame by a large margin, and still late enough that a slow but
    /// working launch never sees it.
    static let splashSurfaceDeadline: TimeInterval = stallDeadline - 1.5

    /// One line, in the app's voice, naming no vendor and no server.
    static let stallMessage = "We couldn’t reach Patina — try again."

    /// Whether the splash should surface the stall.
    static func shouldSurfaceStall(elapsed: TimeInterval, isAuthStateReady: Bool) -> Bool {
        guard !isAuthStateReady else { return false }
        return elapsed >= splashSurfaceDeadline
    }

    /// How long the splash is held once auth readiness has landed.
    ///
    /// C1-18: the floor was an unconditional 1.5 s applied even when the
    /// session restored instantly, on top of ~1 s of init and a 0.5 s
    /// crossfade — about three seconds to content, with the wordmark's own
    /// 2.0 s fade visibly cut mid-animation. A restored session needs no
    /// cover; an unresolved one gets just enough to hide the flicker.
    static func splashFloor(isAuthStateReady: Bool) -> TimeInterval {
        isAuthStateReady ? 0 : 0.6
    }
}
