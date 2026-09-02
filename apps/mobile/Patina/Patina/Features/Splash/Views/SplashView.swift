//
//  SplashView.swift
//  Patina
//
//  Splash screen — centered wordmark with strata mark animation
//

import SwiftUI

struct SplashView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var wordmarkOpacity: Double = 0
    @State private var wordmarkOffset: CGFloat = 8
    @State private var strataOpacity: Double = 0
    @State private var hasStalled = false

    var onComplete: () -> Void

    var body: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            VStack(spacing: 16) {
                // PATINA wordmark
                Text("PATINA")
                    .font(PatinaTypography.wordmark)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .tracking(8)
                    .opacity(wordmarkOpacity)
                    .offset(y: wordmarkOffset)

                // Strata mark lines
                VStack(spacing: 4) {
                    splashStrataLine(width: 60, color: PatinaColors.Strata.line1)
                    splashStrataLine(width: 48, color: PatinaColors.Strata.line2)
                    splashStrataLine(width: 36, color: PatinaColors.Strata.line3)
                }
                .opacity(strataOpacity)

                // C1-19: the splash used to be terminal. If auth readiness
                // never lands — the recorded precedent is a failing keychain
                // read, which never yields on `authStateChanges` — this is
                // the only thing that will ever tell the person anything.
                if hasStalled {
                    Text(LaunchWatchdog.stallMessage)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.top, 16)
                        .transition(.opacity)
                        .accessibilityIdentifier("SplashView.StallMessage")
                }
            }
        }
        .onAppear {
            // Reduce Motion: show the wordmark + strata instantly (nil
            // animation applies state in the same frame, no fade/slide).
            //
            // C1-18: the wordmark faded over 2.0s against a 1.5s phase floor,
            // so it was cut short of full opacity every cold launch. The whole
            // animation now finishes inside 1.2s.
            withAnimation(reduceMotion ? nil : .easeOut(duration: 1.2)) {
                wordmarkOpacity = 1
                wordmarkOffset = 0
            }

            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.6).delay(0.4)) {
                strataOpacity = 1
            }

            // Note: the transition out of `.launching` is driven by the phase
            // observer in AppCoordinator (gated on auth readiness +
            // `splashMinimumDeadline`), so this view does not self-complete.
            // The `onComplete` closure is retained for API compatibility but
            // is intentionally not invoked here.
        }
        .task {
            try? await Task.sleep(for: .seconds(LaunchWatchdog.stallDeadline))
            guard !Task.isCancelled else { return }
            guard LaunchWatchdog.shouldSurfaceStall(
                elapsed: LaunchWatchdog.stallDeadline,
                isAuthStateReady: AuthService.shared.isAuthStateReady
            ) else { return }
            withAnimation { hasStalled = true }
        }
    }

    private func splashStrataLine(width: CGFloat, color: Color) -> some View {
        Capsule()
            .fill(color)
            .frame(width: width, height: 2)
    }
}

#Preview {
    SplashView(onComplete: {})
}
