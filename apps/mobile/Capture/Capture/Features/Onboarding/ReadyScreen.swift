//  ReadyScreen.swift
//  Capture
//
//  O4 · Ready — Action Button (screen.O4.ready). Confirms setup and teaches the
//  fastest entry — the Action Button — while being explicit that the remaining
//  permissions (Mic/Photos/Location) are deferred until their feature is used.
//  Non-Pro devices skip the Action Button tip and surface the Control Center
//  control instead.

import SwiftUI
import CaptureKit

struct ReadyScreen: View {
    enum HardwareEntry { case actionButton, controlCenter }

    /// Pro devices teach the Action Button; others fall back to Control Center.
    var hardwareEntry: HardwareEntry = .actionButton
    /// "Start capturing" → opens the live viewfinder (C1). This is the flow's
    /// completion handoff.
    var onStart: () -> Void = {}
    /// Deep-links to Settings › Action Button (deferred; integrator-wired).
    var onSetHardwareEntry: () -> Void = {}

    var body: some View {
        OnboardingScaffold {
            VStack(spacing: 0) {
                Spacer(minLength: 16)

                VStack(spacing: 18) {
                    OnboardingGlyph(symbol: "checkmark", tint: CaptureColor.verdigris)

                    VStack(spacing: 10) {
                        Text("You’re set")
                            .font(CaptureType.display)
                            .foregroundStyle(CaptureColor.ink)

                        Text(subtitle)
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.inkSoft)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 4)
                    }
                }

                Spacer(minLength: 24)

                hardwareCard

                Spacer(minLength: 16)

                Text("Mic, Photos and Location are requested later — only when a feature needs them.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)

                Spacer(minLength: 24)

                Button("Start capturing", action: onStart)
                    .buttonStyle(OnboardingFilledButtonStyle())
            }
            .padding(.horizontal, 28)
            .padding(.top, 32)
            .padding(.bottom, 24)
        }
        .accessibilityIdentifier(CaptureScreenID.o4Ready.rawValue)
    }

    private var subtitle: String {
        switch hardwareEntry {
        case .actionButton:
            return "Map the Action Button to Patina, and capture without even unlocking to the app."
        case .controlCenter:
            return "Add the Capture control to Control Center and shoot in a single tap."
        }
    }

    private var hardwareCard: some View {
        HStack(spacing: 14) {
            Image(systemName: hardwareEntry == .actionButton ? "smallcircle.filled.circle" : "switch.2")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.brass)

            VStack(alignment: .leading, spacing: 3) {
                Text(hardwareEntry == .actionButton ? "Action Button → Capture" : "Control Center → Capture")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(hardwareEntry == .actionButton
                     ? "Capture without even unlocking to the app."
                     : "One tap from anywhere in iOS.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }

            Spacer(minLength: 8)

            Button(action: onSetHardwareEntry) {
                Text("Set up")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.verdigris)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(CaptureColor.line, lineWidth: 1))
    }
}

#Preview("Action Button") {
    ReadyScreen()
}

#Preview("Control Center") {
    ReadyScreen(hardwareEntry: .controlCenter)
}
