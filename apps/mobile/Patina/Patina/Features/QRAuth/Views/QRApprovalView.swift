//
//  QRApprovalView.swift
//  Patina
//
//  Approval screen for QR code authentication.
//  Shows session details and approve/deny options.
//

import SwiftUI

/// Approval view for QR authentication
public struct QRApprovalView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = QRApprovalViewModel()

    let onDismiss: () -> Void

    public init(onDismiss: @escaping () -> Void = {}) {
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            // Background
            PatinaColors.Background.primary
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header with drag indicator
                dragIndicator
                    .padding(.top, PatinaSpacing.md)

                ScrollView {
                    VStack(spacing: PatinaSpacing.xl) {
                        // Icon header
                        headerSection

                        // Session info card
                        sessionInfoCard

                        // Expiry warning (if applicable)
                        if viewModel.isExpiryWarning && !viewModel.isExpired {
                            expiryWarning
                        }

                        // Biometric notice
                        if !viewModel.isExpired {
                            biometricNotice
                        }

                        Spacer(minLength: PatinaSpacing.xl)

                        // Action buttons
                        actionButtons
                    }
                    .padding(PatinaSpacing.lg)
                }
            }

            // Success overlay
            if viewModel.authState == .approved {
                successOverlay
            }

            // Error overlay
            if case .error = viewModel.authState {
                errorOverlay
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .interactiveDismissDisabled(viewModel.isApproving)
        .onChange(of: viewModel.authState) { _, newState in
            if newState == .approved || newState == .denied || newState == .idle {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    handleDismiss()
                }
            }
        }
        .onDisappear {
            viewModel.cleanup()
        }
    }

    // MARK: - Drag Indicator

    private var dragIndicator: some View {
        RoundedRectangle(cornerRadius: 2.5)
            .fill(PatinaColors.Text.muted)
            .frame(width: 36, height: 5)
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Device icons
            HStack(spacing: PatinaSpacing.lg) {
                Image(systemName: "laptopcomputer")
                    .font(.system(size: 36))
                    .foregroundColor(PatinaColors.clayBeige)

                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 20))
                    .foregroundColor(PatinaColors.Text.muted)

                Image(systemName: "iphone")
                    .font(.system(size: 36))
                    .foregroundColor(PatinaColors.clayBeige)
            }

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Sign In Request")
                    .font(PatinaTypography.h2)
                    .foregroundColor(PatinaColors.Text.primary)
                // Contextual help: explains the cross-device sign-in.
                // The browser session is gated on this approval — without
                // a tap on the phone, the browser session never starts.
                HelpInfoIcon(
                    surfaceKey: SurfaceKeys.IOSApp.QRAuth.approval,
                    fallback: "A browser is asking your phone to confirm this is you. Approving signs you in there; denying ends the request. The browser session never starts without your tap.",
                    size: 14
                )
            }

            Text("Confirm this sign-in with your iPhone")
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)
        }
        .padding(.top, PatinaSpacing.lg)
    }

    // MARK: - Session Info Card

    private var sessionInfoCard: some View {
        VStack(spacing: PatinaSpacing.md) {
            if let session = viewModel.session {
                // Browser info
                HStack {
                    Image(systemName: "globe")
                        .foregroundColor(PatinaColors.Text.secondary)

                    Text(session.browserInfo?.displayString ?? "Web browser")
                        .font(PatinaTypography.body)
                        .foregroundColor(PatinaColors.Text.primary)

                    Spacer()
                }

                Divider()

                // Location (if available)
                if let location = session.browserInfo?.location {
                    HStack {
                        Image(systemName: "location")
                            .foregroundColor(PatinaColors.Text.secondary)

                        Text(location)
                            .font(PatinaTypography.body)
                            .foregroundColor(PatinaColors.Text.primary)

                        Spacer()
                    }

                    Divider()
                }

                // Expiry countdown
                HStack {
                    Image(systemName: "clock")
                        .foregroundColor(viewModel.isExpiryWarning ? PatinaColors.Warning.primary : PatinaColors.Text.secondary)

                    if viewModel.isExpired {
                        Text("Expired")
                            .font(PatinaTypography.body)
                            .foregroundColor(PatinaColors.Error.primary)
                    } else {
                        Text("Expires in \(viewModel.formatTime(viewModel.secondsRemaining))")
                            .font(PatinaTypography.body)
                            .foregroundColor(viewModel.isExpiryWarning ? PatinaColors.Warning.primary : PatinaColors.Text.primary)
                    }

                    Spacer()
                }
            }
        }
        .padding(PatinaSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(PatinaColors.Background.secondary)
        )
    }

    // MARK: - Expiry Warning

    private var expiryWarning: some View {
        HStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(PatinaColors.Warning.primary)

            Text("This request will expire soon")
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.Warning.primary)
        }
        .padding(PatinaSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(PatinaColors.Warning.background)
        )
    }

    // MARK: - Biometric Notice

    private var biometricNotice: some View {
        // Wrapped in HelpTooltip so a tap explains why biometric approval is
        // required for QR sign-in — it's the second-factor proof that the
        // person at the browser is the same person holding the device.
        HelpTooltip(
            surfaceKey: SurfaceKeys.IOSApp.QRAuth.biometric,
            fallback: "Face ID or Touch ID acts as the second factor for QR sign-in: the browser proves it's a Patina session, your phone proves it's you. Both are required to finish the handshake."
        ) {
            HStack(spacing: PatinaSpacing.sm) {
                Image(systemName: viewModel.biometricType.iconName)
                    .foregroundColor(PatinaColors.Text.secondary)

                Text(viewModel.biometricType.actionVerb + " to approve")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.Text.secondary)
            }
            .accessibilityLabel("\(viewModel.biometricType.actionVerb) to approve. More information available.")
        }
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        VStack(spacing: PatinaSpacing.md) {
            if viewModel.isExpired {
                // Expired state - only dismiss
                PatinaButton("Close", style: .secondary, action: handleDismiss)
            } else {
                // Approve button
                if viewModel.isApproving {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: PatinaColors.clayBeige))
                        .frame(height: 50)
                } else {
                    PatinaButton("Approve Sign In", style: .primary) {
                        Task {
                            await viewModel.approve()
                        }
                    }
                }

                // Deny button
                Button(action: {
                    viewModel.deny()
                    handleDismiss()
                }) {
                    Text("Deny")
                        .font(PatinaTypography.bodyMedium)
                        .foregroundColor(PatinaColors.Error.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, PatinaSpacing.md)
                }
                .disabled(viewModel.isApproving)
            }
        }
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        ZStack {
            Color.black.opacity(0.7)
                .ignoresSafeArea()

            VStack(spacing: PatinaSpacing.lg) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 72))
                    .foregroundColor(PatinaColors.Success.primary)

                // Wrapped in HelpTooltip so a tap surfaces "what happens next"
                // — the browser session is live, the phone is paired, and
                // the user can close this overlay and return to the browser.
                HelpTooltip(
                    surfaceKey: SurfaceKeys.IOSApp.QRAuth.successState,
                    fallback: "Your browser session is live. You can close this overlay and return to the browser to continue. The phone stays signed in too."
                ) {
                    Text("Signed In")
                        .font(PatinaTypography.h2)
                        .foregroundColor(.white)
                }

                Text("You can now use Patina on your browser")
                    .font(PatinaTypography.body)
                    .foregroundColor(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
            .padding(PatinaSpacing.xl)
        }
        .transition(.opacity)
    }

    // MARK: - Error Overlay

    private var errorOverlay: some View {
        ZStack {
            Color.black.opacity(0.7)
                .ignoresSafeArea()

            VStack(spacing: PatinaSpacing.lg) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 64))
                    .foregroundColor(PatinaColors.Error.primary)

                Text("Sign In Failed")
                    .font(PatinaTypography.h2)
                    .foregroundColor(.white)

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(PatinaTypography.body)
                        .foregroundColor(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                }

                PatinaButton("Try Again", style: .secondary) {
                    viewModel.reset()
                    handleDismiss()
                }
            }
            .padding(PatinaSpacing.xl)
        }
        .transition(.opacity)
    }

    // MARK: - Helpers

    private func handleDismiss() {
        viewModel.reset()
        onDismiss()
        dismiss()
    }
}

// MARK: - Color Extensions for Warning/Error/Success

extension PatinaColors {
    public enum Warning {
        public static let primary = Color(red: 0.95, green: 0.65, blue: 0.2)
        public static let background = Color(red: 0.95, green: 0.65, blue: 0.2).opacity(0.15)
    }

    public enum Error {
        public static let primary = Color(red: 0.9, green: 0.3, blue: 0.3)
        public static let background = Color(red: 0.9, green: 0.3, blue: 0.3).opacity(0.15)
    }

    public enum Success {
        public static let primary = Color(red: 0.3, green: 0.75, blue: 0.4)
        public static let background = Color(red: 0.3, green: 0.75, blue: 0.4).opacity(0.15)
    }
}

// MARK: - Preview

#Preview {
    QRApprovalView()
}
