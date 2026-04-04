//
//  OnboardingFlowView.swift
//  Patina
//
//  3-screen onboarding flow: Philosophy → Promise → Permission
//

import SwiftUI

struct OnboardingFlowView: View {
    @State private var currentPage = 0
    var onComplete: () -> Void
    var onSkip: () -> Void

    private let pages: [OnboardingPage] = [
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
        OnboardingPage(
            title: "We'll need your camera",
            body: "To see your space and place furniture in it. Nothing leaves your device until you choose to share.",
            ctaText: "Let's Begin",
            gradient: PatinaGradients.linen
        ),
    ]

    var body: some View {
        ZStack {
            PatinaColors.offWhite
                .ignoresSafeArea()

            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                    onboardingScreen(page: page, index: index)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut(duration: 0.3), value: currentPage)

            // Skip button (not on last page)
            if currentPage < pages.count - 1 {
                VStack {
                    HStack {
                        Spacer()
                        Button("Skip") {
                            onSkip()
                        }
                        .font(PatinaTypography.uiSmall)
                        .foregroundColor(PatinaColors.agedOak)
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
                } else {
                    // Camera permission illustration
                    cameraIllustration
                }
            }
            .frame(maxWidth: .infinity)
            .frame(maxHeight: .infinity)

            // Bottom half — content
            VStack(spacing: 0) {
                Text(page.title)
                    .font(PatinaTypography.h2)
                    .foregroundColor(PatinaColors.charcoal)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 12)

                Text(page.body)
                    .font(PatinaTypography.uiAction)
                    .foregroundColor(PatinaColors.mocha)
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
                                .fill(PatinaColors.pearl)
                                .frame(width: 8, height: 8)
                        }
                    }
                }
                .padding(.top, 20)

                Spacer()

                // CTA Button
                PatinaButton(page.ctaText, style: .primary) {
                    if currentPage < pages.count - 1 {
                        withAnimation {
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

    private var cameraIllustration: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(PatinaColors.clay.opacity(0.2))
                    .frame(width: 80, height: 80)

                Image(systemName: "camera.fill")
                    .font(.system(size: 32))
                    .foregroundColor(PatinaColors.mocha.opacity(0.6))
            }

            HStack(spacing: 6) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 12))
                    .foregroundColor(PatinaColors.mocha)

                Text("Your room stays private")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.mocha)
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

#Preview {
    OnboardingFlowView(onComplete: {}, onSkip: {})
}
