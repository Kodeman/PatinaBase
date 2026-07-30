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

    // PT-3-2: shared singleton held in `@State` (was `@StateObject = .shared`).
    @State private var permissionService = CameraPermissionService.shared

    // MARK: - Actions

    let onPermissionResult: (CameraPermissionResult) -> Void
    let onManualEntry: () -> Void

    init(
        _ onPermissionResult: @escaping (CameraPermissionResult) -> Void,
        onManualEntry: @escaping () -> Void = {}
    ) {
        self.onPermissionResult = onPermissionResult
        self.onManualEntry = onManualEntry
    }

    // MARK: - State

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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

    // PT-4-1: the atmospheric `LivingSceneView` (and its Unsplash network
    // fetch) was deleted with the Threshold folder. The Walk-First camera
    // primer now uses a static time-of-day gradient — no network image, no
    // blur cost on first launch.
    private var background: some View {
        ZStack {
            LinearGradient(
                colors: TimeOfDay.current.gradientColors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Color.black.opacity(0.52)
        }
        .ignoresSafeArea()
    }

    // MARK: - Pre-Permission Content

    private var prePermissionContent: some View {
        ScrollView {
            VStack(spacing: PatinaSpacing.xl) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 46, weight: .light))
                    .foregroundStyle(PatinaColors.clay)
                    .accessibilityHidden(true)

                VStack(spacing: PatinaSpacing.md) {
                    Text(CameraTrustCopy.purposeTitle)
                        .font(PatinaTypography.patinaVoice)
                        .foregroundStyle(PatinaColors.offWhite)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)

                    Text(CameraTrustCopy.purposeBody)
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.offWhite.opacity(0.92))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 10) {
                    disclosureLine(
                        icon: "iphone",
                        text: CameraTrustCopy.localStorage
                    )
                    disclosureLine(
                        icon: "square.and.arrow.up",
                        text: CameraTrustCopy.sharing
                    )
                }
                .padding(16)
                .background(Color.black.opacity(0.28))
                .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(CameraTrustCopy.localStorage) \(CameraTrustCopy.sharing)")
                .accessibilityIdentifier("cameraPermission.disclosure")

                Button(action: requestPermission) {
                    HStack(spacing: 8) {
                        if permissionService.isRequesting {
                            ProgressView()
                                .tint(PatinaColors.offWhite)
                        }
                        Text(permissionService.isRequesting ? "Waiting for permission…" : "Use camera")
                            .font(PatinaTypography.bodyMedium)
                    }
                    .foregroundStyle(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(PatinaColors.clay)
                    .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
                }
                .disabled(permissionService.isRequesting)
                .accessibilityLabel("Use camera")
                .accessibilityHint("Asks iOS for camera permission, then begins the guided room scan.")
                .accessibilityIdentifier("cameraPermission.continueButton")
                .buttonStyle(ScaleButtonStyle(reduceMotion: reduceMotion))

                Button(action: enterManually) {
                    Text(CameraTrustCopy.manualAction)
                        .font(PatinaTypography.bodyMedium)
                        .foregroundStyle(PatinaColors.offWhite)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .overlay {
                            RoundedRectangle(cornerRadius: PatinaRadius.lg)
                                .stroke(PatinaColors.offWhite.opacity(0.8), lineWidth: 1)
                        }
                }
                .buttonStyle(ScaleButtonStyle(reduceMotion: reduceMotion))
                .accessibilityHint("Skips camera permission and opens the room-details form.")
                .accessibilityIdentifier("cameraPermission.manualEntryButton")

                Button(
                    action: { showingPrivacySheet = true },
                    label: {
                        HStack(spacing: PatinaSpacing.xs) {
                            Text("How scan data is handled")
                                .font(PatinaTypography.bodySmallMedium)
                            Image(systemName: "arrow.right")
                                .font(.system(size: 12, weight: .medium))
                                .accessibilityHidden(true)
                        }
                        .foregroundStyle(PatinaColors.offWhite)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                )
                .accessibilityHint("Opens details about local storage and later upload.")
                .accessibilityIdentifier("cameraPermission.privacyLink")
            }
            .frame(maxWidth: 560)
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.top, 72)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity)
        }
        .opacity(contentVisible ? 1 : 0)
        .offset(y: contentVisible ? 0 : 30)
        .accessibilityIdentifier("cameraPermission.preflight")
    }

    // MARK: - Denied Content

    private var deniedContent: some View {
        ScrollView {
            VStack(spacing: PatinaSpacing.xl) {
                StrataMarkView(
                    color: PatinaColors.clay,
                    scale: 1.0,
                    breathing: !reduceMotion
                )
                .frame(height: 40)
                .accessibilityHidden(true)

                VStack(spacing: PatinaSpacing.md) {
                    Text("The camera can wait.")
                        .font(PatinaTypography.patinaVoice)
                        .foregroundStyle(PatinaColors.offWhite)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)

                    Text("Enter the room’s dimensions and details now, or allow camera access later in Settings.")
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.offWhite.opacity(0.92))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button(action: enterManually) {
                    Text(CameraTrustCopy.manualAction)
                        .font(PatinaTypography.bodyMedium)
                        .foregroundStyle(PatinaColors.offWhite)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .background(PatinaColors.clay)
                        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
                }
                .buttonStyle(ScaleButtonStyle(reduceMotion: reduceMotion))
                .accessibilityHint("Opens the room-details form without camera access.")
                .accessibilityIdentifier("cameraPermission.deniedManualEntryButton")

                Button(action: openSettings) {
                    Text("Open Settings")
                        .font(PatinaTypography.bodyMedium)
                        .foregroundStyle(PatinaColors.offWhite)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .overlay {
                            RoundedRectangle(cornerRadius: PatinaRadius.lg)
                                .stroke(PatinaColors.offWhite.opacity(0.8), lineWidth: 1)
                        }
                }
                .buttonStyle(ScaleButtonStyle(reduceMotion: reduceMotion))
                .accessibilityHint("Opens iOS Settings so you can allow camera access.")
                .accessibilityIdentifier("cameraPermission.openSettingsButton")
            }
            .frame(maxWidth: 560)
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.top, 96)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity)
        }
        .transition(.opacity)
        .accessibilityIdentifier("cameraPermission.deniedState")
    }

    private func disclosureLine(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(PatinaColors.clay)
                .frame(width: 22, height: 22)
                .accessibilityHidden(true)

            Text(text)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.offWhite.opacity(0.94))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Actions

    private func checkExistingPermission() {
        let result = permissionService.checkStatus()
        switch CameraPermissionPolicy.destination(for: result) {
        case .scan:
            // Already authorized, proceed immediately
            onPermissionResult(.granted)
        case .deniedExplanation:
            // Already denied, show denied state
            permissionDenied = true
        case .awaitChoice:
            // Need to request
            break
        case .manualRoomEntry:
            enterManually()
        }
    }

    private func requestPermission() {
        HapticManager.shared.impact(.medium)

        Task {
            let result = await permissionService.requestPermission()

            await MainActor.run {
                switch CameraPermissionPolicy.destination(for: result) {
                case .scan:
                    HapticManager.shared.notification(.success)
                    onPermissionResult(.granted)
                case .deniedExplanation:
                    HapticManager.shared.notification(.error)
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                        permissionDenied = true
                    }
                case .awaitChoice:
                    // Shouldn't happen, but handle gracefully
                    break
                case .manualRoomEntry:
                    enterManually()
                }
            }
        }
    }

    private func openSettings() {
        HapticManager.shared.impact(.light)
        permissionService.openSettings()
    }

    private func enterManually() {
        guard CameraPermissionPolicy.destination(
            for: permissionService.checkStatus(),
            choseManualEntry: true
        ) == .manualRoomEntry else { return }
        HapticManager.shared.impact(.light)
        PostHogService.shared.capture(
            "onboarding_manual_room_selected",
            properties: ["source": "camera_permission"]
        )
        onManualEntry()
    }

    private func animateEntrance() {
        // Reduce Motion: content appears in place instead of springing up.
        withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.8).delay(0.2)) {
            contentVisible = true
        }
    }
}

// MARK: - Privacy Explanation Sheet

private struct PrivacyExplanationSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: PatinaSpacing.lg) {
                    // Header
                    VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                        Text("How your scan is handled")
                            .font(PatinaTypography.h2)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)

                        Text("The camera ask comes before any scan begins.")
                            .font(PatinaTypography.body)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.bottom, PatinaSpacing.md)

                    // What we see
                    privacySection(
                        icon: "viewfinder",
                        title: "What a scan records",
                        description: CameraTrustCopy.purposeBody
                    )

                    privacySection(
                        icon: "iphone",
                        title: "Saved on this iPhone first",
                        description: CameraTrustCopy.localStorage
                    )

                    privacySection(
                        icon: "square.and.arrow.up",
                        title: "Upload happens later",
                        description: CameraTrustCopy.sharing
                    )

                    privacySection(
                        icon: "rectangle.and.pencil.and.ellipsis",
                        title: "Camera is optional",
                        description: "Choose “\(CameraTrustCopy.manualAction)” to add the room type, dimensions, windows, and doors without camera access."
                    )
                }
                .padding(PatinaSpacing.xl)
            }
            .background(PatinaColors.Background.primary)
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .frame(minWidth: 44, minHeight: 44)
                    .accessibilityIdentifier("cameraPermission.privacyDoneButton")
                }
            }
        }
        .accessibilityIdentifier("cameraPermission.privacySheet")
    }

    @ViewBuilder
    private func privacySection(icon: String, title: String, description: String) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                privacyIcon(icon)
                privacyText(title: title, description: description)
            }
            .accessibilityElement(children: .combine)
        } else {
            HStack(alignment: .top, spacing: PatinaSpacing.md) {
                privacyIcon(icon)
                privacyText(title: title, description: description)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func privacyIcon(_ icon: String) -> some View {
        Image(systemName: icon)
            .font(.system(size: 24, weight: .light))
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(width: 32, height: 32)
            .accessibilityHidden(true)
    }

    private func privacyText(title: String, description: String) -> some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
            Text(title)
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            Text(description)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    var reduceMotion: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.97 : 1.0))
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Camera Permission") {
    CameraPermissionView { result in
        PatinaLog.ui.debug("Permission result: \(result)")
    }
}

#Preview("Privacy Sheet") {
    PrivacyExplanationSheet()
}
