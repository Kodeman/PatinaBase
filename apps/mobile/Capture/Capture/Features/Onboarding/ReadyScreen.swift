//  ReadyScreen.swift
//  Capture
//
//  O4 · Ready — (screen.O4.ready). Confirms setup and teaches the fastest
//  entry this device actually has, while being explicit that the remaining
//  permissions (Mic/Photos/Location) are deferred until their feature is
//  used.
//
//  `hardwareEntry` is derived by the caller from `HardwareEntryPolicy` (a
//  machine-identifier allowlist — Pro vs. non-Pro is NOT the test; the
//  14 Pro has no Action Button) and passed in. There is no Control Center
//  control yet — no `ControlWidget`/`AppIntent` exists anywhere under
//  `apps/mobile/Capture` (that's W3b) — so the non-Action-Button branch
//  says only what is true today: open Patina Field from the Home Screen.

import SwiftUI
import CaptureKit

struct ReadyScreen: View {
    enum HardwareEntry { case actionButton, controlCenter }

    let analytics: any CaptureAnalytics
    /// Which fast entry this device supports, per `HardwareEntryPolicy`.
    let hardwareEntry: HardwareEntry
    /// "Start capturing" → opens the live viewfinder (C1). This is the flow's
    /// completion handoff.
    var onStart: () -> Void = {}
    /// Action Button branch only: opens the real Action Button settings
    /// pane if a deep link exists, otherwise explains where to go. Never
    /// invoked on the Control Center branch — there is nothing to set up
    /// yet.
    var onSetHardwareEntry: () -> Void = {}

    var body: some View {
        OnboardingScaffold {
            VStack(spacing: 0) {
                Spacer(minLength: 16)

                VStack(spacing: 18) {
                    OnboardingGlyph(symbol: "checkmark", tint: CaptureColor.success)

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
        .task { analytics.screen(CaptureScreenID.o4Ready.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.o4Ready.rawValue)
    }

    private var subtitle: String {
        switch hardwareEntry {
        case .actionButton:
            return "Assign the Action Button to Patina Field — it opens straight to the viewfinder."
        case .controlCenter:
            return "Open Patina Field from the Home Screen whenever you're ready to capture."
        }
    }

    @ViewBuilder
    private var hardwareCard: some View {
        HStack(spacing: 14) {
            Image(systemName: hardwareEntry == .actionButton ? "smallcircle.filled.circle" : "square.grid.2x2")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.verdigrisInk)

            VStack(alignment: .leading, spacing: 3) {
                Text(hardwareEntry == .actionButton ? "Action Button → Capture" : "Open from the Home Screen")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(hardwareEntry == .actionButton
                     ? "Opens the viewfinder — you'll still unlock to see it."
                     : "Tap the Patina Field icon to start capturing.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }

            Spacer(minLength: 8)

            if hardwareEntry == .actionButton {
                Button(action: onSetHardwareEntry) {
                    Text("Set up")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.verdigris)
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(CaptureColor.line, lineWidth: 1))
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Action Button") {
    ReadyScreen(analytics: MockCaptureAnalytics(), hardwareEntry: .actionButton)
}

#Preview("Control Center") {
    ReadyScreen(analytics: MockCaptureAnalytics(), hardwareEntry: .controlCenter)
}
#endif
