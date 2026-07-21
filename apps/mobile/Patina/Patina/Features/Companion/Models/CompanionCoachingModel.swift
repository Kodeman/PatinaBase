//
//  CompanionCoachingModel.swift
//  Patina
//
//  Non-UI foundation for the Companion "living companion" coaching system.
//
//  The Companion orb is the client app's only navigation surface. New users get
//  a richer, more attention-seeking mark plus a one-time wake-up self-intro; as
//  they learn the surface (expanding the panel, navigating, or simply sticking
//  around) the coaching calms down and eventually goes quiet. This model owns
//  that lifecycle — the phase state machine, the intro-sequencing gate, and the
//  analytics seam — so the SwiftUI layer (later tasks) can stay declarative.
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  Phase machine (monotonic — never regresses)                             │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  .new       never expanded the panel                                     │
//  │  .learning  expanded the panel at least once                             │
//  │  .learned   3 companion navigations  OR  14 days since entering main     │
//  │             (the 14-day rule is evaluated LAZILY on `phase` read — no     │
//  │              timers; a learning user graduates the moment `phase` is      │
//  │              read after the window elapses)                              │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  Persistence is raw UserDefaults under the `patina.companion.coaching.` key
//  namespace. The pre-existing `patina.companion.coachmarkSeen` flag (written by
//  `CompanionOverlay`) is treated as a legacy signal: a user who already
//  dismissed the old panel coachmark is migrated straight to `.learning` with a
//  spent intro budget, so existing users never see the new intro or the loud
//  attention pulse. That legacy key keeps its original meaning and is never
//  renamed.
//
//  Testability mirrors `FirstLaunchTourModel` (see `Features/Help/`): every
//  environmental dependency (UserDefaults, clock, tour-state provider, analytics
//  seam) is injected with a production default, and the poll/timeout knobs on
//  `introGate()` are settable for tests — the same idiom as that model's
//  `anchorMountGracePeriod`.
//

import Foundation
import Observation

// MARK: - Coaching phase

/// Where the user sits on the Companion learning curve. Monotonic: the model
/// only ever moves a user forward (`.new` → `.learning` → `.learned`).
public enum CompanionCoachingPhase: String {
    /// Has never expanded the Companion panel.
    case new
    /// Has expanded the panel at least once.
    case learning
    /// Has navigated 3× via the Companion, or 14 days have elapsed since first
    /// entering the main app.
    case learned

    /// Forward-only ordering used to enforce monotonic transitions.
    fileprivate var rank: Int {
        switch self {
        case .new: return 0
        case .learning: return 1
        case .learned: return 2
        }
    }
}

// MARK: - Mark attention

/// How loudly the resting Companion mark should draw attention. Consumed by the
/// UI layer (later tasks) to pick an animation intensity. Maps 1:1 from phase.
public enum MarkAttention {
    /// `.new` — full attention-seeking treatment.
    case full
    /// `.learning` — ambient, gentler treatment.
    case ambient
    /// `.learned` — quiet; the mark has been learned.
    case calm
}

// MARK: - Navigation outcome

/// Result of recording a Companion navigation. Drives the one-time first-nav
/// acknowledgement reinforcement.
public enum NavigationOutcome {
    case none
    /// This was the user's first-ever Companion navigation — show the ack once.
    case showFirstNavAck
}

// MARK: - Analytics seam

/// Analytics events emitted by the coaching model. Kept as a value type so tests
/// can capture payloads through an injected closure without a PostHog stub.
public enum CoachingTrackEvent: Equatable {
    case introShown(trigger: String, shownCount: Int)
    case introDismissed(action: String, viewedMs: Int)
    case phaseChanged(from: String, to: String, navCount: Int)
    case reinforcementShown(kind: String)
}

// MARK: - Model

@MainActor
@Observable
public final class CompanionCoachingModel {

    // MARK: Injected dependencies

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let tourStateProvider: () -> FirstLaunchTourState?

    /// Analytics seam. Defaults to the real `CompanionAnalytics.shared` methods;
    /// tests swap in a capturing closure. Left mutable so a host can re-point it.
    @ObservationIgnored public var track: (CoachingTrackEvent) -> Void

    // MARK: Test-settable timing knobs (introGate)

    /// Grace window applied when the first-launch tour was launched in a prior
    /// process but never resolved (it never auto-restarts). Settable for tests;
    /// mirrors `FirstLaunchTourModel.anchorMountGracePeriod`.
    @ObservationIgnored var introGateGracePeriod: Duration = .seconds(2)

    /// Poll cadence while waiting for a fresh user's tour to resolve. Settable
    /// for tests.
    @ObservationIgnored var introGatePollInterval: Duration = .milliseconds(500)

    /// Overall ceiling on the fresh-user poll before giving up (intro retries
    /// next session). Settable for tests.
    @ObservationIgnored var introGateTimeout: Duration = .seconds(120)

    // MARK: Working state (observation-tracked)

    private var storedPhase: CompanionCoachingPhase
    private var storedIntroShownCount: Int
    private var storedNavCount: Int
    private var storedFirstNavAckSeen: Bool
    private var storedEnteredMainAt: Date?

    // MARK: Process-local bookkeeping

    /// Tour state snapshotted ONCE at init so `introGate()` decides its branch
    /// from a stable reading, independent of later polls.
    @ObservationIgnored private let tourStateSnapshot: FirstLaunchTourState?

    /// Guards `recordMainSessionStart()` against repeat work within a process.
    @ObservationIgnored private var didRecordMainSessionStart = false

    // MARK: Keys

    private enum Keys {
        static let phase = "patina.companion.coaching.phase"
        static let introShownCount = "patina.companion.coaching.introShownCount"
        static let navCount = "patina.companion.coaching.navCount"
        static let firstNavAckSeen = "patina.companion.coaching.firstNavAckSeen"
        static let enteredMainAt = "patina.companion.coaching.enteredMainAt"
        /// Pre-existing key written by `CompanionOverlay` — legacy signal, never
        /// renamed, meaning preserved.
        static let legacyCoachmarkSeen = "patina.companion.coachmarkSeen"
    }

    // MARK: Constants

    /// Companion navigations required to graduate a learning user to `.learned`.
    private static let navigationsToLearned = 3

    /// Days since entering main that auto-graduate a learning user to `.learned`.
    private static let daysToLearned: TimeInterval = 14

    /// Hard cap on how many times the intro may ever be shown.
    private static let introShownCap = 2

    // MARK: Init

    public init(
        defaults: UserDefaults = .standard,
        now: @escaping () -> Date = { Date() },
        tourState: @escaping () -> FirstLaunchTourState? = {
            getFirstLaunchTourState(FirstLaunchTourModel.defaultTourKey)
        },
        track: ((CoachingTrackEvent) -> Void)? = nil
    ) {
        self.defaults = defaults
        self.now = now
        self.tourStateProvider = tourState
        self.track = track ?? CompanionCoachingModel.defaultTrack

        // Snapshot tour state once for intro sequencing (uses the parameter,
        // not `self`, so it's valid before full initialization).
        self.tourStateSnapshot = tourState()

        // Load persisted state, running the one-time legacy migration when no
        // phase has ever been stored.
        if let raw = defaults.string(forKey: Keys.phase),
           let phase = CompanionCoachingPhase(rawValue: raw) {
            self.storedPhase = phase
            self.storedIntroShownCount = defaults.integer(forKey: Keys.introShownCount)
        } else if defaults.bool(forKey: Keys.legacyCoachmarkSeen) {
            // Existing user who already dismissed the old coachmark: skip the
            // intro and the loud attention pulse entirely.
            self.storedPhase = .learning
            self.storedIntroShownCount = CompanionCoachingModel.introShownCap
            defaults.set(CompanionCoachingPhase.learning.rawValue, forKey: Keys.phase)
            defaults.set(CompanionCoachingModel.introShownCap, forKey: Keys.introShownCount)
        } else {
            self.storedPhase = .new
            self.storedIntroShownCount = 0
        }

        self.storedNavCount = defaults.integer(forKey: Keys.navCount)
        self.storedFirstNavAckSeen = defaults.bool(forKey: Keys.firstNavAckSeen)
        if defaults.object(forKey: Keys.enteredMainAt) != nil {
            self.storedEnteredMainAt = Date(
                timeIntervalSince1970: defaults.double(forKey: Keys.enteredMainAt)
            )
        } else {
            self.storedEnteredMainAt = nil
        }
    }

    /// Production analytics dispatch — forwards each seam event to the real
    /// `CompanionAnalytics.shared` methods.
    @MainActor
    private static let defaultTrack: (CoachingTrackEvent) -> Void = { event in
        let analytics = CompanionAnalytics.shared
        switch event {
        case let .introShown(trigger, shownCount):
            analytics.trackIntroShown(trigger: trigger, shownCount: shownCount)
        case let .introDismissed(action, viewedMs):
            analytics.trackIntroDismissed(action: action, viewedMs: viewedMs)
        case let .phaseChanged(from, to, navCount):
            analytics.trackCoachingPhaseChanged(from: from, to: to, navCount: navCount)
        case let .reinforcementShown(kind):
            analytics.trackReinforcementShown(kind: kind)
        }
    }

    // MARK: - Phase

    /// The user's current coaching phase. Reading this LAZILY graduates a
    /// learning user to `.learned` once 14 days have elapsed since they entered
    /// main — no timers involved.
    public var phase: CompanionCoachingPhase {
        if storedPhase == .learning, hasReachedDayGraduation {
            transition(to: .learned)
        }
        return storedPhase
    }

    /// How loudly the resting mark should draw attention, derived from `phase`
    /// (so it reflects lazy graduation too).
    public var markAttention: MarkAttention {
        switch phase {
        case .new: return .full
        case .learning: return .ambient
        case .learned: return .calm
        }
    }

    private var hasReachedDayGraduation: Bool {
        guard let enteredMainAt = storedEnteredMainAt else { return false }
        let elapsed = now().timeIntervalSince(enteredMainAt)
        return elapsed >= CompanionCoachingModel.daysToLearned * 24 * 60 * 60
    }

    /// Move the phase forward, persisting and emitting `phaseChanged`. No-op if
    /// the target is not strictly ahead of the current phase (monotonic guard).
    private func transition(to newPhase: CompanionCoachingPhase) {
        let from = storedPhase
        guard newPhase.rank > from.rank else { return }
        storedPhase = newPhase
        defaults.set(newPhase.rawValue, forKey: Keys.phase)
        track(.phaseChanged(from: from.rawValue, to: newPhase.rawValue, navCount: storedNavCount))
    }

    // MARK: - Session / navigation recording

    /// Record that the user has entered the main app this session. Stamps
    /// `enteredMainAt` the first time it's ever absent; idempotent per process.
    public func recordMainSessionStart() {
        guard !didRecordMainSessionStart else { return }
        didRecordMainSessionStart = true
        guard storedEnteredMainAt == nil else { return }
        let timestamp = now()
        storedEnteredMainAt = timestamp
        defaults.set(timestamp.timeIntervalSince1970, forKey: Keys.enteredMainAt)
    }

    /// Record that the user expanded the Companion panel. The first expansion
    /// transitions `.new` → `.learning`.
    public func recordPanelExpanded() {
        if storedPhase == .new {
            transition(to: .learning)
        }
    }

    /// Record a Companion-driven navigation. Graduates a learning user to
    /// `.learned` on their 3rd navigation, and returns `.showFirstNavAck`
    /// exactly once — on the first-ever navigation.
    @discardableResult
    public func recordCompanionNavigation() -> NavigationOutcome {
        storedNavCount += 1
        defaults.set(storedNavCount, forKey: Keys.navCount)

        if storedPhase == .learning,
           storedNavCount >= CompanionCoachingModel.navigationsToLearned {
            transition(to: .learned)
        }

        guard !storedFirstNavAckSeen else { return .none }
        storedFirstNavAckSeen = true
        defaults.set(true, forKey: Keys.firstNavAckSeen)
        return .showFirstNavAck
    }

    // MARK: - Intro

    /// Whether the intro may be shown right now: only for brand-new users who
    /// haven't spent their intro budget.
    public var canShowIntro: Bool {
        phase == .new && storedIntroShownCount < CompanionCoachingModel.introShownCap
    }

    /// Record that the intro was shown, incrementing the (hard-capped) count and
    /// emitting `companion_intro_shown`.
    public func recordIntroShown(trigger: String) {
        guard storedIntroShownCount < CompanionCoachingModel.introShownCap else { return }
        storedIntroShownCount += 1
        defaults.set(storedIntroShownCount, forKey: Keys.introShownCount)
        track(.introShown(trigger: trigger, shownCount: storedIntroShownCount))
    }

    /// Record that the intro was dismissed, emitting `companion_intro_dismissed`.
    public func recordIntroDismissed(action: String, viewedMs: Int) {
        track(.introDismissed(action: action, viewedMs: viewedMs))
    }

    /// Tour-sequencing gate. The intro must not fight the first-launch tour, so
    /// this awaits until it's safe to present:
    ///
    ///  * tour already resolved (this or a prior process) → clear immediately;
    ///  * tour launched but never resolved in a prior process (it never
    ///    auto-restarts) → short grace, then clear;
    ///  * fresh user (the tour will run this process) → poll until it resolves,
    ///    giving up after the timeout (intro simply retries next session).
    ///
    /// Honors `Task` cancellation, returning `false` when cancelled.
    public func introGate() async -> Bool {
        let snapshot = tourStateSnapshot

        if snapshot?.isResolved == true {
            return true
        }

        if snapshot?.launched == true {
            do {
                try await Task.sleep(for: introGateGracePeriod)
            } catch {
                return false
            }
            return true
        }

        // Fresh user: the tour is expected to run this process. Poll until it
        // resolves or we hit the timeout.
        let clock = ContinuousClock()
        let start = clock.now
        while clock.now - start < introGateTimeout {
            if Task.isCancelled { return false }
            if tourStateProvider()?.isResolved == true {
                return true
            }
            do {
                try await Task.sleep(for: introGatePollInterval)
            } catch {
                return false
            }
        }
        return false
    }

    // MARK: - Reinforcement

    /// Whether the panel coachmark reinforcement should be offered: not yet
    /// learned, and the legacy coachmark hasn't already been seen.
    public var shouldShowPanelCoachmark: Bool {
        phase != .learned && !defaults.bool(forKey: Keys.legacyCoachmarkSeen)
    }

    /// Record that a reinforcement affordance was shown, emitting
    /// `companion_reinforcement_shown`.
    public func recordReinforcementShown(kind: String) {
        track(.reinforcementShown(kind: kind))
    }
}
