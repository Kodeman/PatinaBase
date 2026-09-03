//
//  OnboardingFlowHost.swift
//  Patina
//
//  Hosts the post-auth onboarding flow. Rendered as the root view while
//  `AppCoordinator.phase == .onboarding` — i.e., the user is signed in
//  (or in guest mode) but hasn't completed onboarding.
//
//  Two variants (PT-4-7):
//
//    • quiz-first (DEFAULT) — welcome carousel → style quiz → style result →
//      empty DailyRoom. The shipped path.
//    • walk-first (EXPERIMENT, behind the `onboarding_walk_first` PostHog
//      flag) — a camera-permission primer → the Quiet Conversation scan flow
//      (`.scanFlow(reason: .fresh)`, which itself runs walk → reveal → the
//      style conversation). The walk happens FIRST so a new user experiences
//      AR magic in their own space before any quiz.
//
//  Completion (`AppSettings.hasCompletedOnboarding = true`) is the signal that
//  flips the phase to `.main` via the observation loop in `AppCoordinator`.
//  The quiz-first path sets only the persisted flag; the walk-first path sets
//  the flag AND queues a `.scanFlow` push so the user lands mid-walk in
//  `.main` (the navigation path survives the phase flip).
//

import SwiftUI

struct OnboardingFlowHost: View {
    @Environment(\.appCoordinator) private var coordinator
    /// Reduce Motion: step changes cut instantly instead of cross-fading.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Step {
        case carousel
        case styleQuiz
        case styleResult(StyleProfileResult)
        // Walk-First — camera primer shown before routing into the scan flow.
        case walkPermission
    }

    @State private var step: Step = .carousel
    /// PT-4-7: resolved once on appear from the `onboarding_walk_first` flag.
    /// Nil until resolved so the body can hold the neutral background.
    @State private var isWalkFirst: Bool?

    var body: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            content
                .transition(.opacity)
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: stepKey)
        .onAppear(perform: resolveVariant)
    }

    /// PT-4-7: assign the experiment variant exactly once and instrument the
    /// funnel denominator. Walk-First opens on the camera primer; quiz-first
    /// keeps the carousel as the first step.
    private func resolveVariant() {
        guard isWalkFirst == nil else { return }
        let walkFirstEnabled = PostHogService.shared.isFeatureEnabled("onboarding_walk_first")
        let variant = OnboardingFunnel.shared.beginOnboarding(walkFirstEnabled: walkFirstEnabled)
        isWalkFirst = (variant == .walkFirst)
        if variant == .walkFirst {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
                step = .walkPermission
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .carousel:
            // U33: the carousel's closing page promises whatever comes next in
            // THIS variant. Nil (variant not yet resolved) reads as quiz-first,
            // the shipped default — and walk-first replaces the carousel
            // outright in `resolveVariant`, so it never renders the wrong close.
            OnboardingFlowView(
                isWalkFirst: isWalkFirst ?? false,
                onComplete: { advanceToQuiz() },
                // A-05: Skip skips. The quiz is reachable later from the
                // Studio; being made to answer five questions before seeing
                // anything is what the label promised to avoid.
                onSkip: { skipToBrowsing() },
                onSignIn: { returnToSignIn() }
            )

        case .walkPermission:
            // Reuse the purpose-built camera primer. On grant we hand straight
            // off to the scan flow; on deny we fall back to the quiz-first path
            // so the user still completes onboarding.
            CameraPermissionView({ result in
                switch result {
                case .granted:
                    enterWalkFirstScan()
                case .denied, .notDetermined:
                    advanceToQuiz()
                }
            }, onManualEntry: {
                enterManualRoom()
            })

        case .styleQuiz:
            StyleQuizView(
                onComplete: { result in
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
                        step = .styleResult(result)
                    }
                },
                // B-21 / P-18: an exit and a sign-in door on every quiz step.
                // The quiz used to be mandatory with no back, skip or close —
                // including for an account that had already done it.
                onDefer: { skipToBrowsing() },
                onSignIn: { returnToSignIn() }
            )

        case .styleResult(let result):
            StyleResultView(result: result, onViewRecommendations: {
                completeOnboarding()
                coordinator.navigate(to: .emergence(pieceId: nil))
            })
        }
    }

    /// A-05 / B-21 — finish onboarding without the quiz and land in the app.
    private func skipToBrowsing() {
        completeOnboarding()
    }

    /// P-18 — leave the guest flow for the Welcome screen.
    private func returnToSignIn() {
        GuestSessionStore.returnToSignIn(coordinator)
    }

    private func advanceToQuiz() {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
            step = .styleQuiz
        }
    }

    /// PT-4-7: finish onboarding and route the user into the Quiet
    /// Conversation scan flow in one gesture. Setting the flag flips the phase
    /// to `.main`; the queued `.scanFlow` push rides along on the coordinator's
    /// navigation path (which is not cleared by the phase transition), so the
    /// user lands directly in the walk over the freshly-mounted home surface.
    private func enterWalkFirstScan() {
        AppSettings.shared.hasCompletedOnboarding = true
        AppSettings.shared.hasSeenThreshold = true
        // B-21: and against the account, so signing in on a second device
        // (or after a reinstall) does not start the intro over.
        OnboardingCompletion.shared.markCompleted(userId: AuthService.shared.currentUserId)
        HapticManager.shared.thresholdCrossed()
        OnboardingFunnel.shared.markWalkFirstScanEntered()
        coordinator.navigate(to: .scanFlow(reason: .fresh))
    }

    /// A complete non-camera path from the pre-permission screen. The user
    /// enters the main app and lands in the existing manual room-details form;
    /// no permission request, capture session, or upload is started.
    private func enterManualRoom() {
        AppSettings.shared.hasCompletedOnboarding = true
        AppSettings.shared.hasSeenThreshold = true
        // B-21: and against the account, so signing in on a second device
        // (or after a reinstall) does not start the intro over.
        OnboardingCompletion.shared.markCompleted(userId: AuthService.shared.currentUserId)
        HapticManager.shared.thresholdCrossed()
        coordinator.navigate(to: .manualRoomEntry)
    }

    /// Quiz-first completion. Flipping the persisted flag triggers the phase
    /// observer in `AppCoordinator`, which moves us into `.main`.
    private func completeOnboarding() {
        AppSettings.shared.hasCompletedOnboarding = true
        AppSettings.shared.hasSeenThreshold = true
        // B-21: and against the account, so signing in on a second device
        // (or after a reinstall) does not start the intro over.
        OnboardingCompletion.shared.markCompleted(userId: AuthService.shared.currentUserId)
        HapticManager.shared.thresholdCrossed()
    }

    /// Stable identity for `step` so SwiftUI can animate transitions.
    private var stepKey: String {
        switch step {
        case .carousel: return "carousel"
        case .walkPermission: return "walkPermission"
        case .styleQuiz: return "quiz"
        case .styleResult: return "result"
        }
    }
}

#Preview {
    OnboardingFlowHost()
        .environment(\.appCoordinator, AppCoordinator())
}
