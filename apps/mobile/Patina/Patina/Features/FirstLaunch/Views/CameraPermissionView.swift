//
//  CameraPermissionView.swift
//  Patina
//
//  Scene 3 of the first-launch flow: Camera permission request.
//  Pre-permission context explaining why camera access is needed.
//

import SwiftUI

/// Camera permission request view
struct CameraPermissionView: View {

    // MARK: - Dependencies

    @StateObject private var permissionService = CameraPermissionService.shared

    // MARK: - Actions

    let onPermissionResult: (CameraPermissionResult) -> Void

    // MARK: - State

    @State private var contentVisible = false
    @State private var showingPrivacySheet = false
    @State private var permissionDenied = false

    var body: some View {
        ZStack {
            // Background
            background

            if permissionDenied {
                deniedContent
            } else {
                prePermissionContent
            }
        }
        .sheet(isPresented: $showingPrivacySheet) {
            PrivacyExplanationSheet()
        }
        .onAppear {
            checkExistingPermission()
            animateEntrance()
        }
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            LivingSceneView(timeOfDay: TimeOfDay.current)
                .blur(radius: 20)

            Color.black.opacity(0.3)
        }
        .ignoresSafeArea()
    }

    // MARK: - Pre-Permission Content

    private var prePermissionContent: some View {
        VStack(spacing: 0) {
            Spacer()

            // Camera icon
            Image(systemName: "camera.fill")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(PatinaColors.clayBeige)
                .padding(.bottom, PatinaSpacing.xl)

            // Message
            VStack(spacing: PatinaSpacing.md) {
                Text("To walk together, I'll need to see through your camera.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)
                    .multilineTextAlignment(.center)

                Text("I only look at the shape of your space — nothing personal.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.xxl)

            // Continue button
            Button(action: requestPermission) {
                Text("Continue")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(PatinaColors.clayBeige)
                    .cornerRadius(PatinaRadius.lg)
            }
            .accessibilityIdentifier("cameraPermission.continueButton")
            .buttonStyle(ScaleButtonStyle())
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.md)

            // Privacy link
            Button(action: { showingPrivacySheet = true }) {
                HStack(spacing: PatinaSpacing.xs) {
                    Text("Privacy: What Patina sees")
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(PatinaColors.Text.muted)

                    Image(systemName: "arrow.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(PatinaColors.Text.muted)
                }
            }
            .accessibilityIdentifier("cameraPermission.privacyLink")
            .padding(.bottom, PatinaSpacing.xxxl)
        }
        .opacity(contentVisible ? 1 : 0)
        .offset(y: contentVisible ? 0 : 30)
    }

    // MARK: - Denied Content

    private var deniedContent: some View {
        VStack(spacing: 0) {
            Spacer()

            // Strata mark
            StrataMarkView(color: PatinaColors.clayBeige, scale: 1.0, breathing: true)
                .frame(height: 40)
                .padding(.bottom, PatinaSpacing.xl)

            // Message
            VStack(spacing: PatinaSpacing.md) {
                Text("No problem.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("When you're ready to walk, I'll be here.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)

                Text("You can enable camera access in Settings anytime.")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.muted)
                    .multilineTextAlignment(.center)
                    .padding(.top, PatinaSpacing.sm)
            }
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.xxl)

            // Open Settings button
            Button(action: openSettings) {
                Text("Open Settings")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(PatinaColors.clayBeige)
                    .cornerRadius(PatinaRadius.lg)
            }
            .buttonStyle(ScaleButtonStyle())
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.md)

            // Explore first button
            Button(action: exploreFirst) {
                Text("Explore first")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(Color.clear)
                    .overlay(
                        RoundedRectangle(cornerRadius: PatinaRadius.lg)
                            .stroke(PatinaColors.Text.muted, lineWidth: 1)
                    )
            }
            .buttonStyle(ScaleButtonStyle())
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.xxxl)
        }
        .transition(.opacity)
    }

    // MARK: - Actions

    private func checkExistingPermission() {
        let result = permissionService.checkStatus()
        switch result {
        case .granted:
            // Already authorized, proceed immediately
            onPermissionResult(.granted)
        case .denied:
            // Already denied, show denied state
            permissionDenied = true
        case .notDetermined:
            // Need to request
            break
        }
    }

    private func requestPermission() {
        HapticManager.shared.impact(.medium)

        Task {
            let result = await permissionService.requestPermission()

            await MainActor.run {
                switch result {
                case .granted:
                    HapticManager.shared.notification(.success)
                    onPermissionResult(.granted)
                case .denied:
                    HapticManager.shared.notification(.error)
                    withAnimation(.easeInOut(duration: 0.3)) {
                        permissionDenied = true
                    }
                case .notDetermined:
                    // Shouldn't happen, but handle gracefully
                    break
                }
            }
        }
    }

    private func openSettings() {
        HapticManager.shared.impact(.light)
        permissionService.openSettings()
    }

    private func exploreFirst() {
        HapticManager.shared.impact(.light)
        onPermissionResult(.denied)
    }

    private func animateEntrance() {
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.2)) {
            contentVisible = true
        }
    }
}

// MARK: - Privacy Explanation Sheet

private struct PrivacyExplanationSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: PatinaSpacing.lg) {
                    // Header
                    VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                        Text("What Patina Sees")
                            .font(PatinaTypography.h2)
                            .foregroundColor(PatinaColors.Text.primary)

                        Text("Your privacy matters to us.")
                            .font(PatinaTypography.body)
                            .foregroundColor(PatinaColors.Text.secondary)
                    }
                    .padding(.bottom, PatinaSpacing.md)

                    // What we see
                    privacySection(
                        icon: "cube.transparent",
                        title: "Room Shape",
                        description: "We use Apple's RoomPlan to understand your room's dimensions — walls, windows, and doors. This helps us suggest furniture that fits your space."
                    )

                    privacySection(
                        icon: "checkmark.shield",
                        title: "What We Don't See",
                        description: "We don't capture photos or video. We don't look at personal items, faces, or any identifying information. The camera data stays on your device."
                    )

                    privacySection(
                        icon: "iphone.and.arrow.forward",
                        title: "On-Device Processing",
                        description: "Room scanning happens entirely on your iPhone using Apple's technology. Only the room dimensions are stored — not images."
                    )

                    privacySection(
                        icon: "trash",
                        title: "Delete Anytime",
                        description: "You can delete your room data at any time from the app. We respect your control over your information."
                    )
                }
                .padding(PatinaSpacing.xl)
            }
            .background(PatinaColors.Background.primary)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(PatinaColors.clayBeige)
                }
            }
        }
    }

    private func privacySection(icon: String, title: String, description: String) -> some View {
        HStack(alignment: .top, spacing: PatinaSpacing.md) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .light))
                .foregroundColor(PatinaColors.clayBeige)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                Text(title)
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.Text.primary)

                Text(description)
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Camera Permission") {
    CameraPermissionView { result in
        print("Permission result: \(result)")
    }
}

#Preview("Privacy Sheet") {
    PrivacyExplanationSheet()
}
