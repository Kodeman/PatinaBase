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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
                body: "A guided scan records the room’s shape and a few reference photos on this iPhone. Or enter the room details yourself.",
                ctaText: "Continue",
                gradient: PatinaGradients.sageGradient
            ),
            isWalkFirst ? Self.cameraPage : Self.quizPage
        ]
    }

    /// Walk-first close — the very next screen is the camera primer.
    private static let cameraPage = OnboardingPage(
        title: "Choose how to add your room",
        body: CameraTrustCopy.onboardingSummary,
        ctaText: "See your choices",
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
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                        .padding(.top, 58)
                        .padding(.trailing, 24)
                        .accessibilityHint("Skips the introduction and continues to style questions.")
                        .accessibilityIdentifier("Onboarding.SkipButton")
                    }
                    Spacer()
                }
            }
        }
    }

    @ViewBuilder
    private func onboardingScreen(page: OnboardingPage, index: Int) -> some View {
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    pageIllustration(
                        page,
                        index: index,
                        viewportHeight: proxy.size.height
                    )
                    pageContent(
                        page,
                        index: index,
                        viewportHeight: proxy.size.height
                    )
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityIdentifier("Onboarding.Page.\(index)")
    }

    private func pageIllustration(
        _ page: OnboardingPage,
        index: Int,
        viewportHeight: CGFloat
    ) -> some View {
        ZStack {
            page.gradient
            illustration(for: index)
        }
        .frame(maxWidth: .infinity)
        .frame(
            height: dynamicTypeSize.isAccessibilitySize
                ? 190
                : max(250, viewportHeight * 0.46)
        )
        .accessibilityHidden(true)
    }

    private func pageContent(
        _ page: OnboardingPage,
        index: Int,
        viewportHeight: CGFloat
    ) -> some View {
        VStack(spacing: 0) {
            Text(page.title)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 12)
                .accessibilityAddTraits(.isHeader)

            Text(page.body)
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? 560 : 320)

            pageDots(index: index)
            Spacer(minLength: dynamicTypeSize.isAccessibilitySize ? 28 : 40)
            primaryButton(page, index: index)
        }
        .padding(.horizontal, 28)
        .padding(.top, dynamicTypeSize.isAccessibilitySize ? 24 : 32)
        .padding(.bottom, 40)
        .frame(
            minHeight: dynamicTypeSize.isAccessibilitySize
                ? 0
                : max(300, viewportHeight * 0.50)
        )
    }

    private func pageDots(index: Int) -> some View {
        HStack(spacing: 8) {
            ForEach(0..<pages.count, id: \.self) { pageIndex in
                if pageIndex == currentPage {
                    Capsule()
                        .fill(PatinaColors.clay)
                        .frame(width: 24, height: 8)
                } else {
                    Circle()
                        .fill(PatinaColors.Text.secondary.opacity(0.35))
                        .frame(width: 8, height: 8)
                }
            }
        }
        .padding(.top, 20)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Page \(index + 1) of \(pages.count)")
    }

    private func primaryButton(
        _ page: OnboardingPage,
        index: Int
    ) -> some View {
        PatinaButton(page.ctaText, style: .primary) {
            if currentPage < pages.count - 1 {
                withAnimation(reduceMotion ? nil : .default) {
                    currentPage += 1
                }
            } else {
                onComplete()
            }
        }
        .frame(minHeight: 44)
        .accessibilityIdentifier("Onboarding.PrimaryButton.\(index)")
    }

    @ViewBuilder
    private func illustration(for index: Int) -> some View {
        if index == 0 {
            roomIllustration
        } else if index == 1 {
            phoneIllustration
        } else if isWalkFirst {
            cameraIllustration
        } else {
            styleIllustration
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

                Text("Saved on this iPhone first")
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
