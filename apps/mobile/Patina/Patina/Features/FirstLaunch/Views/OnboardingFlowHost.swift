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
            OnboardingFlowView(
                onComplete: { advanceToQuiz() },
                onSkip: { advanceToQuiz() }
            )

        case .walkPermission:
            // Reuse the purpose-built camera primer. On grant we hand straight
            // off to the scan flow; on deny we fall back to the quiz-first path
            // so the user still completes onboarding.
            CameraPermissionView { result in
                switch result {
                case .granted:
                    enterWalkFirstScan()
                case .denied, .notDetermined:
                    advanceToQuiz()
                }
            }

        case .styleQuiz:
            StyleQuizView(onComplete: { result in
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
                    step = .styleResult(result)
                }
            })

        case .styleResult(let result):
            StyleResultView(result: result, onViewRecommendations: {
                completeOnboarding()
            })
        }
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
        HapticManager.shared.thresholdCrossed()
        OnboardingFunnel.shared.markWalkFirstScanEntered()
        coordinator.navigate(to: .scanFlow(reason: .fresh))
    }

    /// Quiz-first completion. Flipping the persisted flag triggers the phase
    /// observer in `AppCoordinator`, which moves us into `.main`.
    private func completeOnboarding() {
        AppSettings.shared.hasCompletedOnboarding = true
        AppSettings.shared.hasSeenThreshold = true
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
