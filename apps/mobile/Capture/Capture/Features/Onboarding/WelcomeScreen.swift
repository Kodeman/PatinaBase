//  WelcomeScreen.swift
//  Capture
//
//  O1 · Welcome (screen.O1.welcome). The first launch: one line of promise,
//  one forward action. Sets the tool's job — the physical world, offline-capable
//  — before asking for anything. Three steps, no carousel to wade through.

import SwiftUI
import CaptureKit

struct WelcomeScreen: View {
    /// "Get started" → begins connect (O2).
    var onGetStarted: () -> Void = {}
    /// "I already have an account" → jumps to sign-in (O2).
    var onSignIn: () -> Void = {}

    var body: some View {
        OnboardingScaffold {
            VStack(spacing: 0) {
                Spacer(minLength: 24)

                VStack(spacing: 22) {
                    OnboardingGlyph(symbol: "diamond.fill")

                    VStack(spacing: 12) {
                        Text("Capture in the room.")
                            .font(CaptureType.display)
                            .foregroundStyle(CaptureColor.ink)
                            .multilineTextAlignment(.center)

                        Text("Showrooms, markets, fabric houses — keep what you find, structured and located, even with no signal.")
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.inkSoft)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 6)
                    }
                }

                Spacer(minLength: 24)

                VStack(spacing: 6) {
                    Button("Get started", action: onGetStarted)
                        .buttonStyle(OnboardingFilledButtonStyle())

                    Button("I already have an account", action: onSignIn)
                        .buttonStyle(OnboardingGhostButtonStyle())
                }
            }
            .padding(.horizontal, 28)
            .padding(.top, 32)
            .padding(.bottom, 24)
        }
        .accessibilityIdentifier(CaptureScreenID.o1Welcome.rawValue)
    }
}

#Preview {
    WelcomeScreen()
}
