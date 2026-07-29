//
//  OnboardingFlowView.swift
//  Patina
//
//  3-screen onboarding flow: Philosophy → Promise → what happens next.
//
//  U33 — the third page tells the truth about the variant the user is in.
//  Quiz-first (the shipped default) never asks for the camera during
//  onboarding, so it must not close on a camera-permission promise; the
//  camera page belongs to walk-first, which really does ask next.
//  `OnboardingFlowHost` resolves the variant and threads it in.
//

import SwiftUI

struct OnboardingFlowView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var currentPage = 0
    /// PT-4-7 variant signal, resolved by `OnboardingFlowHost`. Only the third
    /// page differs — walk-first heads into a camera ask, quiz-first into the
    /// style quiz.
    var isWalkFirst: Bool = false
    var onComplete: () -> Void
    var onSkip: () -> Void

    private var pages: [OnboardingPage] {
        [
            OnboardingPage(
                title: "Every room tells a story",
                body: "Let's discover yours. Walk your space, uncover your style, and find pieces that grow more beautiful with time.",
                ctaText: "Start Your Journey",
                gradient: PatinaGradients.warm
            ),
            OnboardingPage(
                title: "See it in your space",
                body: "Walk your room. Our camera captures every corner. Then watch as perfectly matched furniture appears right where it belongs.",
                ctaText: "Continue",
                gradient: PatinaGradients.sageGradient
            ),
            isWalkFirst ? Self.cameraPage : Self.quizPage,
        ]
    }

    /// Walk-first close — the very next screen is the camera primer.
    private static let cameraPage = OnboardingPage(
        title: "We'll need your camera",
        body: "To see your space and place furniture in it. Nothing leaves your device until you choose to share.",
        ctaText: "Let's Begin",
        gradient: PatinaGradients.linen
    )

    /// Quiz-first close — the very next screen is the style quiz. The camera
    /// is named only as a later, opt-in step, which is what actually happens.
    private static let quizPage = OnboardingPage(
        title: "Find your style first",
        body: "Five quick questions, then we'll show you pieces that fit. Your camera comes later — only when you choose to scan a room.",
        ctaText: "Let's begin",
        gradient: PatinaGradients.linen
    )

    var body: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                    onboardingScreen(page: page, index: index)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: currentPage)

            // Skip button (not on last page)
            if currentPage < pages.count - 1 {
                VStack {
                    HStack {
                        Spacer()
                        Button("Skip") {
                            onSkip()
                        }
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .padding(.top, 58)
                        .padding(.trailing, 24)
                    }
                    Spacer()
                }
            }
        }
    }

    @ViewBuilder
    private func onboardingScreen(page: OnboardingPage, index: Int) -> some View {
        VStack(spacing: 0) {
            // Top half — illustration area
            ZStack {
                page.gradient

                if index == 0 {
                    // Room illustration placeholder
                    roomIllustration
                } else if index == 1 {
                    // Phone illustration placeholder
                    phoneIllustration
                } else if isWalkFirst {
                    // Camera permission illustration
                    cameraIllustration
                } else {
                    // Quiz-first never asks for the camera during onboarding —
                    // a camera glyph here would promise an ask that doesn't come.
                    styleIllustration
                }
            }
            .frame(maxWidth: .infinity)
            .frame(maxHeight: .infinity)

            // Bottom half — content
            VStack(spacing: 0) {
                Text(page.title)
                    .font(PatinaTypography.h2)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 12)

                Text(page.body)
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .frame(maxWidth: 300)

                // Dots
                HStack(spacing: 8) {
                    ForEach(0..<pages.count, id: \.self) { i in
                        if i == currentPage {
                            Capsule()
                                .fill(PatinaColors.clay)
                                .frame(width: 24, height: 8)
                        } else {
                            Circle()
                                .fill(PatinaColors.Text.muted.opacity(0.25))
                                .frame(width: 8, height: 8)
                        }
                    }
                }
                .padding(.top, 20)

                Spacer()

                // CTA Button
                PatinaButton(page.ctaText, style: .primary) {
                    if currentPage < pages.count - 1 {
                        withAnimation(reduceMotion ? nil : .default) {
                            currentPage += 1
                        }
                    } else {
                        onComplete()
                    }
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 40)
            }
            .padding(.top, 32)
            .frame(maxHeight: .infinity)
        }
    }

    // MARK: - Illustrations (placeholders)

    private var roomIllustration: some View {
        ZStack {
            // Abstract room
            RoundedRectangle(cornerRadius: 12)
                .fill(PatinaColors.pearl.opacity(0.6))
                .frame(width: 240, height: 160)

            // Furniture placeholder
            RoundedRectangle(cornerRadius: 8)
                .fill(PatinaGradients.leather)
                .frame(width: 100, height: 40)
                .offset(x: -20, y: 20)
                .opacity(0.6)

            // Tall item
            RoundedRectangle(cornerRadius: 4)
                .fill(PatinaGradients.wood)
                .frame(width: 36, height: 60)
                .offset(x: 60, y: -10)
                .opacity(0.5)

            // Window
            RoundedRectangle(cornerRadius: 4)
                .stroke(PatinaColors.clay, lineWidth: 2)
                .frame(width: 50, height: 70)
                .offset(x: 40, y: -40)
        }
    }

    private var phoneIllustration: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24)
                .fill(PatinaColors.charcoal.opacity(0.12))
                .frame(width: 140, height: 280)

            RoundedRectangle(cornerRadius: 8)
                .fill(PatinaColors.clay.opacity(0.4))
                .frame(width: 100, height: 140)
                .offset(y: -20)
        }
    }

    private var styleIllustration: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(PatinaColors.clay.opacity(0.2))
                    .frame(width: 80, height: 80)

                Image(systemName: "square.grid.2x2")
                    .font(.system(size: 32))
                    .foregroundStyle(PatinaColors.mocha.opacity(0.6))
            }

            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 12))
                    .foregroundStyle(PatinaColors.mocha)

                Text("Five quick questions")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.mocha)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(PatinaColors.offWhite)
            .clipShape(Capsule())
        }
    }

    private var cameraIllustration: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(PatinaColors.clay.opacity(0.2))
                    .frame(width: 80, height: 80)

                Image(systemName: "camera.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(PatinaColors.mocha.opacity(0.6))
            }

            HStack(spacing: 6) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(PatinaColors.mocha)

                Text("Your room stays private")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.mocha)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(PatinaColors.offWhite)
            .clipShape(Capsule())
        }
    }
}

// MARK: - Model

private struct OnboardingPage {
    let title: String
    let body: String
    let ctaText: String
    let gradient: LinearGradient
}

#Preview("Quiz-first (default)") {
    OnboardingFlowView(onComplete: {}, onSkip: {})
}

#Preview("Walk-first") {
    OnboardingFlowView(isWalkFirst: true, onComplete: {}, onSkip: {})
}
