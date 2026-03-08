//
//  WalkErrorView.swift
//  Patina
//
//  Error handling views for walk/AR tracking issues.
//

import SwiftUI

/// Error states during the walk
enum WalkError: Equatable {
    case trackingLost
    case insufficientCoverage
    case appBackgrounded
    case permissionDenied
    case deviceUnsupported
}

/// Error view overlay for walk issues
struct WalkErrorOverlay: View {

    let error: WalkError
    let onRetry: () -> Void
    let onSaveProgress: () -> Void
    let onCancel: () -> Void

    @State private var visible = false

    var body: some View {
        VStack {
            Spacer()

            VStack(spacing: PatinaSpacing.lg) {
                // Strata mark
                StrataMarkView(color: PatinaColors.clayBeige, scale: 0.8, breathing: true)
                    .frame(height: 32)

                // Error message
                errorMessage

                // Actions
                actionButtons
            }
            .padding(PatinaSpacing.xl)
            .background(
                RoundedRectangle(cornerRadius: PatinaRadius.xl)
                    .fill(PatinaColors.Background.primary)
                    .shadow(color: .black.opacity(0.3), radius: 20)
            )
            .padding(.horizontal, PatinaSpacing.lg)
            .padding(.bottom, PatinaSpacing.xxxl)
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : 50)
        }
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                visible = true
            }
        }
    }

    // MARK: - Error Message

    @ViewBuilder
    private var errorMessage: some View {
        switch error {
        case .trackingLost:
            VStack(spacing: PatinaSpacing.sm) {
                Text("I lost my bearings for a moment.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("Hold still and I'll try to find my way.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }

        case .insufficientCoverage:
            VStack(spacing: PatinaSpacing.sm) {
                Text("I'd love to see a bit more.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("Mind walking toward the areas I haven't seen yet?")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }

        case .appBackgrounded:
            VStack(spacing: PatinaSpacing.sm) {
                Text("Welcome back.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("Want to pick up where we left off?")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }

        case .permissionDenied:
            VStack(spacing: PatinaSpacing.sm) {
                Text("I understand.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("When you're ready to walk together, you can enable camera access in Settings.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }

        case .deviceUnsupported:
            VStack(spacing: PatinaSpacing.sm) {
                Text("Room scanning isn't available on this device.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("You can still explore Patina and discover pieces that might fit your space.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Action Buttons

    @ViewBuilder
    private var actionButtons: some View {
        switch error {
        case .trackingLost:
            HStack(spacing: PatinaSpacing.md) {
                secondaryButton("Save progress", action: onSaveProgress)
                primaryButton("Try again", action: onRetry)
            }

        case .insufficientCoverage:
            HStack(spacing: PatinaSpacing.md) {
                secondaryButton("Done anyway", action: onSaveProgress)
                primaryButton("Continue", action: onRetry)
            }

        case .appBackgrounded:
            HStack(spacing: PatinaSpacing.md) {
                secondaryButton("Start fresh", action: onCancel)
                primaryButton("Continue walk", action: onRetry)
            }

        case .permissionDenied:
            HStack(spacing: PatinaSpacing.md) {
                secondaryButton("Explore first", action: onCancel)
                primaryButton("Open Settings", action: {
                    CameraPermissionService.shared.openSettings()
                })
            }

        case .deviceUnsupported:
            primaryButton("Continue", action: onCancel)
        }
    }

    // MARK: - Button Helpers

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            HapticManager.shared.impact(.medium)
            action()
        }) {
            Text(title)
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(PatinaColors.offWhite)
                .padding(.horizontal, PatinaSpacing.lg)
                .padding(.vertical, PatinaSpacing.sm)
                .background(PatinaColors.clayBeige)
                .cornerRadius(PatinaRadius.lg)
        }
    }

    private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            HapticManager.shared.impact(.light)
            action()
        }) {
            Text(title)
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)
                .padding(.horizontal, PatinaSpacing.lg)
                .padding(.vertical, PatinaSpacing.sm)
                .background(Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.Text.muted, lineWidth: 1)
                )
        }
    }
}

// MARK: - Preview

#Preview("Tracking Lost") {
    ZStack {
        Color.black.opacity(0.8)
            .ignoresSafeArea()

        WalkErrorOverlay(
            error: .trackingLost,
            onRetry: {},
            onSaveProgress: {},
            onCancel: {}
        )
    }
}

#Preview("Insufficient Coverage") {
    ZStack {
        Color.black.opacity(0.8)
            .ignoresSafeArea()

        WalkErrorOverlay(
            error: .insufficientCoverage,
            onRetry: {},
            onSaveProgress: {},
            onCancel: {}
        )
    }
}

#Preview("App Backgrounded") {
    ZStack {
        Color.black.opacity(0.8)
            .ignoresSafeArea()

        WalkErrorOverlay(
            error: .appBackgrounded,
            onRetry: {},
            onSaveProgress: {},
            onCancel: {}
        )
    }
}
