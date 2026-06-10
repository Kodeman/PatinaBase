//
//  SplashView.swift
//  Patina
//
//  Splash screen — centered wordmark with strata mark animation
//

import SwiftUI

struct SplashView: View {
    @State private var wordmarkOpacity: Double = 0
    @State private var wordmarkOffset: CGFloat = 8
    @State private var strataOpacity: Double = 0

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
            }
        }
        .onAppear {
            // Wordmark fade in + slide up
            withAnimation(.easeOut(duration: 2.0)) {
                wordmarkOpacity = 1
                wordmarkOffset = 0
            }

            // Strata lines fade in after 0.5s delay
            withAnimation(.easeOut(duration: 1.0).delay(0.5)) {
                strataOpacity = 1
            }

            // Note: the transition out of `.launching` is driven by the phase
            // observer in AppCoordinator (gated on auth readiness +
            // `splashMinimumDeadline`), so this view does not self-complete.
            // The `onComplete` closure is retained for API compatibility but
            // is intentionally not invoked here.
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
