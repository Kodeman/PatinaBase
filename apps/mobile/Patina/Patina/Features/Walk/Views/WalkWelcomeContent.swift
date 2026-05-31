//
//  WalkWelcomeContent.swift
//  Patina
//
//  Welcome (pre-start) content for the Walk experience (PT-6-4). The breathing
//  companion mark, intro copy, and the swipe-up-to-begin affordance.
//  Behavior-preserving extraction from WalkView.welcomeContent.
//

import SwiftUI

/// The Walk's welcome screen — swipe up to begin.
struct WalkWelcomeContent: View {

    /// Begin the walk (wired to `WalkViewModel.startWalk`).
    let onBegin: () -> Void

    @State private var swipeHintOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            // Top spacer
            Spacer()

            // Main content
            VStack(spacing: PatinaSpacing.xl) {
                // Breathing companion mark
                StrataMarkView(
                    color: PatinaColors.clay,
                    scale: 1.2,
                    breathing: true
                )

                VStack(spacing: PatinaSpacing.md) {
                    Text("The Walk")
                        .font(PatinaTypography.h1)
                        .foregroundStyle(PatinaColors.offWhite)

                    Text("Let's explore your space together.\nI'll observe the light, the shapes, the possibilities.")
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.offWhite.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                        .padding(.horizontal, PatinaSpacing.xl)
                }
            }

            Spacer()

            // Bottom section - Swipe up to begin
            VStack(spacing: PatinaSpacing.lg) {
                // Swipe up indicator
                VStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "chevron.up")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .offset(y: swipeHintOffset)
                        .animation(
                            .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                            value: swipeHintOffset
                        )
                        .onAppear {
                            swipeHintOffset = -8
                        }

                    Text("Swipe up to begin")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.offWhite.opacity(0.7))
                }
                .padding(.bottom, PatinaSpacing.xl)
            }
            .gesture(
                DragGesture(minimumDistance: 50)
                    .onEnded { value in
                        // Swipe up detected (negative height = upward)
                        if value.translation.height < -50 {
                            onBegin()
                        }
                    }
            )
        }
        .padding(.horizontal, PatinaSpacing.lg)
    }
}
