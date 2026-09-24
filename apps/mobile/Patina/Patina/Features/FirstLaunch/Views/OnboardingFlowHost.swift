//
//  OnboardingFlowHost.swift
//  Patina
//
//  Hosts the post-auth onboarding flow. Rendered as the root view while
//  `AppCoordinator.phase == .onboarding` — i.e., the user is signed in
//  (or in guest mode) but hasn't completed onboarding.
//
//  One path, for everyone: welcome carousel → style quiz → style result →
//  empty DailyRoom. The camera is asked for later, only when the person
//  chooses to scan a room.
//
//  Completion (`AppSettings.hasCompletedOnboarding = true`) is the signal that
//  flips the phase to `.main` via the observation loop in `AppCoordinator`.
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
    }

    @State private var step: Step = .carousel

    var body: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            content
                .transition(.opacity)
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: stepKey)
        // PT-4-7: the funnel denominator, once per launch.
        .onAppear { OnboardingFunnel.shared.beginOnboarding() }
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .carousel:
            OnboardingFlowView(
                onComplete: { advanceToQuiz() },
                // A-05: Skip skips. The quiz is reachable later from the
                // Studio; being made to answer five questions before seeing
                // anything is what the label promised to avoid.
                onSkip: { skipToBrowsing() },
                onSignIn: guestSignInDoor
            )

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
                onSignIn: guestSignInDoor
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

    /// P-18's door, offered only to the reader it is for.
    ///
    /// `W1-C-07`: walk C signed in as `client@patina.dev` — GoTrue logged the
    /// password grant — and the very next frame was this carousel with
    /// `Onboarding.SignInButton` enabled, on page 1, page 2 and the quiz. The
    /// carousel itself is legitimate for a signed-in account that has not
    /// onboarded; a second sign-in door, which clears the guest opt-in and
    /// sends the phase back to `.auth`, is not. `OnboardingFlowView` and
    /// `StyleQuizView` both render nothing when the closure is absent, so nil
    /// is the whole edit. `AuthService` is `@Observable`, so a sign-in that
    /// lands while the carousel is up takes the door with it.
    private var guestSignInDoor: (() -> Void)? {
        AuthService.shared.isAuthenticated ? nil : { returnToSignIn() }
    }

    private func advanceToQuiz() {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
            step = .styleQuiz
        }
    }

    /// Onboarding completion. Flipping the persisted flag triggers the phase
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
        case .styleQuiz: return "quiz"
        case .styleResult: return "result"
        }
    }
}

#Preview {
    OnboardingFlowHost()
        .appCoordinator(AppCoordinator())
}
