//
//  PreScanChecklistView.swift
//  Patina
//
//  Pre-scan checklist with 4 items and camera permission request
//  Shown before starting a room scan per v4 spec
//

import SwiftUI
import AVFoundation
import ARKit

struct PreScanChecklistView: View {
    @Environment(\.appCoordinator) private var coordinator
    @StateObject private var cameraService = CameraPermissionService.shared
    @State private var hasCheckedPermission = false

    var onReadyToScan: () -> Void

    private var cameraReady: Bool {
        cameraService.isAuthorized
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Text("Before we begin")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.top, 56)
                .padding(.horizontal, 24)

            Text("A quick check to get the best results")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.agedOak)
                .padding(.top, 4)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)

            // Checklist items
            VStack(spacing: 12) {
                checklistItem(
                    icon: "sun.max",
                    title: "Good lighting",
                    subtitle: "Natural light works best",
                    isReady: true
                )

                checklistItem(
                    icon: "figure.walk",
                    title: "Clear walking path",
                    subtitle: "Room to move around edges",
                    isReady: true
                )

                checklistItem(
                    icon: "sparkles",
                    title: "Tidy surfaces",
                    subtitle: "Remove clutter from tables",
                    isReady: true
                )

                // Camera permission item
                if cameraReady {
                    checklistItem(
                        icon: "camera",
                        title: "Camera ready",
                        subtitle: "Permission granted",
                        isReady: true
                    )
                } else {
                    Button {
                        Task {
                            await cameraService.requestPermission()
                            hasCheckedPermission = true
                        }
                    } label: {
                        checklistItem(
                            icon: "camera",
                            title: "Camera access needed",
                            subtitle: "Tap to enable",
                            isReady: false
                        )
                    }
                    .buttonStyle(.plain)
                }

                // LiDAR check
                if !supportsLiDAR {
                    checklistItem(
                        icon: "exclamationmark.triangle",
                        title: "No depth sensor",
                        subtitle: "Manual room entry available",
                        isReady: false,
                        isWarning: true
                    )
                }
            }
            .padding(.horizontal, 24)

            Spacer()

            // CTA
            PatinaButton("Ready to Scan", style: .primary) {
                if cameraReady {
                    onReadyToScan()
                } else {
                    Task {
                        let result = await cameraService.requestPermission()
                        if result == .granted {
                            onReadyToScan()
                        }
                    }
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 40)
            .opacity(cameraReady || !hasCheckedPermission ? 1 : 0.5)
        }
        .background(PatinaColors.offWhite)
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: - Checklist Item

    private func checklistItem(
        icon: String,
        title: String,
        subtitle: String,
        isReady: Bool,
        isWarning: Bool = false
    ) -> some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(isReady ? PatinaColors.success.opacity(0.15) :
                            isWarning ? PatinaColors.terracotta.opacity(0.15) :
                            PatinaColors.clay.opacity(0.12))
                    .frame(width: 32, height: 32)

                if isReady {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(PatinaColors.success)
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 14))
                        .foregroundStyle(isWarning ? PatinaColors.terracotta : PatinaColors.clay)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.charcoal)

                Text(subtitle)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.agedOak)
            }

            Spacer()
        }
        .padding(18)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - LiDAR Check

    private var supportsLiDAR: Bool {
        ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }
}

#Preview {
    PreScanChecklistView(onReadyToScan: {})
        .environment(\.appCoordinator, AppCoordinator())
}
