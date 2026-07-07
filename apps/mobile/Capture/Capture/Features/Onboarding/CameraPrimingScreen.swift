//  CameraPrimingScreen.swift
//  Capture
//
//  O3 · Camera permission priming (screen.O3.camera-priming). A one-line in-app
//  primer over a dimmed viewfinder gives the system camera prompt its context,
//  so consent is informed — camera is the one permission capture truly needs.
//  "Allow" continues; "Don’t allow" reveals the Photos-import fallback (R3/R4).
//
//  The real `AVCaptureDevice` request is owned by the integrator/CameraService;
//  this view only primes and reports the choice through its callbacks.

import SwiftUI
import CaptureKit

struct CameraPrimingScreen: View {
    /// "Allow" (or "Continue" after a decline) → proceed to O4 / live viewfinder.
    var onContinue: () -> Void = {}
    /// "Open Settings" deep-link, surfaced only after a decline.
    var onOpenSettings: () -> Void = {}

    @State private var declined = false

    var body: some View {
        ZStack(alignment: .bottom) {
            dimmedViewfinder
            scrim
            primerCard
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
        }
        .accessibilityIdentifier(CaptureScreenID.o3CameraPriming.rawValue)
    }

    // MARK: Backdrop — a dimmed, inert viewfinder

    private var dimmedViewfinder: some View {
        ZStack {
            LinearGradient(
                colors: [CaptureColor.ink2, CaptureColor.ink],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack {
                HStack {
                    Text("Ready to capture")
                        .font(CaptureType.eyebrow)
                        .foregroundStyle(CaptureColor.paper3.opacity(0.7))
                    Spacer()
                    Button(action: onContinue) {
                        Image(systemName: "xmark")
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.paper3.opacity(0.7))
                    }
                    .accessibilityLabel("Skip")
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                Spacer()

                // Faint framing reticle — the only "chrome" over the scene.
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(CaptureColor.paper3.opacity(0.18), lineWidth: 1.5)
                    .frame(width: 200, height: 200)

                Spacer()

                fauxModeSelector
                    .padding(.bottom, 24)
            }
        }
    }

    private var fauxModeSelector: some View {
        HStack(spacing: 22) {
            ForEach(CameraMode.allCases, id: \.self) { mode in
                Text(mode.rawValue.uppercased())
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(
                        mode == .photo
                            ? CaptureColor.paper3.opacity(0.85)
                            : CaptureColor.paper3.opacity(0.4)
                    )
            }
        }
        .accessibilityHidden(true)
    }

    private var scrim: some View {
        CaptureColor.ink.opacity(0.55).ignoresSafeArea()
    }

    // MARK: Primer

    private var primerCard: some View {
        VStack(spacing: 16) {
            OnboardingGlyph(symbol: "camera.fill")

            VStack(spacing: 8) {
                Text("Patina Field needs the camera")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
                    .multilineTextAlignment(.center)

                Text("It’s used only while you’re capturing — to photograph and measure the piece in front of you.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
            }

            if declined {
                declineFallback
            } else {
                VStack(spacing: 6) {
                    Button("Allow", action: onContinue)
                        .buttonStyle(OnboardingFilledButtonStyle())
                    Button("Don’t allow") { declined = true }
                        .buttonStyle(OnboardingGhostButtonStyle(tint: CaptureColor.ink))
                }
            }
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(CaptureColor.paper3)
        )
    }

    private var declineFallback: some View {
        VStack(spacing: 12) {
            Label("No camera access — you can still import from Photos instead.",
                  systemImage: "photo.on.rectangle.angled")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.rust)
                .multilineTextAlignment(.leading)

            Button("Continue", action: onContinue)
                .buttonStyle(OnboardingFilledButtonStyle(tint: CaptureColor.rust))

            Button("Open Settings", action: onOpenSettings)
                .buttonStyle(OnboardingGhostButtonStyle())
        }
    }
}

#Preview("Primer") {
    CameraPrimingScreen()
}
