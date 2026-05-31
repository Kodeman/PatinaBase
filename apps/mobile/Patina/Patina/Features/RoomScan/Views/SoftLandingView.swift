//
//  SoftLandingView.swift
//  Patina
//
//  Screen 09: The Soft Landing — 1.2s non-interactive transition between
//  the Walk and the Conversation. Per PRD §4.5.
//
//  Also hosts the returning-user fork: when a StyleProfile already exists,
//  shows a "Use my style / Update my style" prompt instead of auto-advancing.
//

import SwiftUI

public enum SoftLandingOutcome {
    case startConversation
    case skipToFloorPlan(StyleProfileResponse)
}

struct SoftLandingView: View {

    let session: RoomScanSession
    let onOutcome: (SoftLandingOutcome) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var showTransitionText: Bool = false
    @State private var backgroundIsOffWhite: Bool = false
    @State private var hudFadedOut: Bool = false
    @State private var transitionTextFadedOut: Bool = false
    @State private var showReturningUserPrompt: Bool = false
    @State private var existingProfile: StyleProfileResponse?

    var body: some View {
        ZStack {
            // Background crossfades from the dark scan view to Off-White
            (backgroundIsOffWhite ? PatinaColors.offWhite : Color.black)
                .ignoresSafeArea()
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.8), value: backgroundIsOffWhite)

            VStack {
                Spacer()
                if showTransitionText && !transitionTextFadedOut {
                    Text("Now let's talk about you.")
                        .font(PatinaTypography.patinaVoiceLarge)
                        .foregroundStyle(PatinaColors.charcoal.opacity(0.8))
                        .transition(.opacity)
                }
                Spacer()

                if showReturningUserPrompt, let profile = existingProfile {
                    returningUserPrompt(for: profile)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 48)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
        .onAppear {
            existingProfile = StyleProfileStore.shared.currentProfile
            runSequence()
        }
    }

    private func runSequence() {
        // T=0.4: transition text fades in + bg crossfade to off-white
        Task {
            try? await Task.sleep(for: .seconds(0.4))
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
                showTransitionText = true
                backgroundIsOffWhite = true
            }
        }

        // T=0.8: HUD fades out (no-op here since we don't render the HUD,
        // but we keep the timing marker for consistency with PRD §4.5)
        Task {
            try? await Task.sleep(for: .seconds(0.8))
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
                hudFadedOut = true
            }
        }

        // T=1.0: transition text fades out
        Task {
            try? await Task.sleep(for: .seconds(1.0))
            withAnimation(reduceMotion ? nil : .easeIn(duration: 0.2)) {
                transitionTextFadedOut = true
            }
        }

        // T=1.2: advance OR show returning-user prompt
        Task {
            try? await Task.sleep(for: .seconds(1.2))
            if StyleProfileStore.shared.hasCompletedProfile, existingProfile != nil {
                // Returning user — show the fork, don't auto-advance
                withAnimation(reduceMotion ? nil : .spring(response: 0.45)) {
                    showReturningUserPrompt = true
                }
            } else {
                // First time — route straight into the Conversation
                onOutcome(.startConversation)
            }
        }
    }

    private func returningUserPrompt(for profile: StyleProfileResponse) -> some View {
        VStack(spacing: 16) {
            Text("You've done this before.")
                .font(PatinaTypography.patinaVoice)
                .foregroundStyle(PatinaColors.charcoal.opacity(0.8))
            Text("Your style: \(profile.aestheticName)")
                .font(.custom("Inter-Regular", size: 13))
                .foregroundStyle(PatinaColors.agedOak)

            Button(action: { onOutcome(.skipToFloorPlan(profile)) }) {
                Text("Use my style")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(RoundedRectangle(cornerRadius: 26).fill(PatinaColors.charcoal))
            }
            .buttonStyle(.plain)

            Button(action: { onOutcome(.startConversation) }) {
                Text("Update my style")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.charcoal)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 26)
                            .stroke(PatinaColors.charcoal, lineWidth: 1.5)
                    )
            }
            .buttonStyle(.plain)
        }
    }
}
