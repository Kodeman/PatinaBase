//
//  OnboardingFlowHost.swift
//  Patina
//
//  Hosts the post-auth onboarding flow: welcome carousel → style quiz →
//  style result. Rendered as the root view while
//  `AppCoordinator.phase == .onboarding` — i.e., the user is signed in
//  (or in guest mode) but hasn't completed onboarding.
//
//  Completion (`AppSettings.hasCompletedOnboarding = true`) is the
//  signal that flips the phase to `.main` via the observation loop in
//  `AppCoordinator`. This host does not call any coordinator routing
//  method; it only sets the persisted flag.
//

import SwiftUI

struct OnboardingFlowHost: View {
    @Environment(\.appCoordinator) private var coordinator

    private enum Step {
        case carousel
        case styleQuiz
        case styleResult(StyleProfileResult)
    }

    @State private var step: Step = .carousel

    var body: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            content
                .transition(.opacity)
        }
        .animation(.easeInOut(duration: 0.4), value: stepKey)
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .carousel:
            OnboardingFlowView(
                onComplete: { advanceToQuiz() },
                onSkip: { advanceToQuiz() }
            )

        case .styleQuiz:
            StyleQuizView(onComplete: { result in
                withAnimation(.easeInOut(duration: 0.4)) {
                    step = .styleResult(result)
                }
            })

        case .styleResult(let result):
            StyleResultView(result: result, onViewRecommendations: {
                // Flipping the persisted flag triggers the phase observer
                // in AppCoordinator, which moves us into `.main`.
                AppSettings.shared.hasCompletedOnboarding = true
                AppSettings.shared.hasSeenThreshold = true
                HapticManager.shared.thresholdCrossed()
            })
        }
    }

    private func advanceToQuiz() {
        withAnimation(.easeInOut(duration: 0.4)) {
            step = .styleQuiz
        }
    }

    /// Stable identity for `step` so SwiftUI can animate transitions.
    private var stepKey: String {
        switch step {
        case .carousel: return "carousel"
        case .styleQuiz: return "quiz"
        case .styleResult: return "result"
        }
    }
}

#Preview {
    OnboardingFlowHost()
        .environment(\.appCoordinator, AppCoordinator())
}
