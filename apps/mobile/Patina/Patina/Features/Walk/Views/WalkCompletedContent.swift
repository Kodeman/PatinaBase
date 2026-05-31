//
//  WalkCompletedContent.swift
//  Patina
//
//  Completed content for the Walk experience (PT-6-4). Success mark, completion
//  copy, a local-save status indicator, and the See/Walk-Again actions.
//  Behavior-preserving extraction from WalkView.completedContent.
//
//  Note (PT-4-6): the deprecated v1 remote-sync path (`WalkView.syncRoomScan`)
//  was removed. The status indicator now reflects only local save / camera
//  permission state — there's no remote-upload retry here. The active scan
//  pipeline uploads happen through QuietConversationFlowHost / RoomUploadService.
//

import SwiftUI

/// The Walk's completion screen.
struct WalkCompletedContent: View {

    /// Whether a scan was captured this session (drives the saved indicator).
    let hasScan: Bool
    /// A non-fatal error message (e.g. camera permission), if any.
    let statusError: String?
    /// "See What Emerged" — dismisses the walk.
    let onSeeEmergence: () -> Void
    /// "Walk Again" — resets state for a fresh walk.
    let onWalkAgain: () -> Void

    var body: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Spacer()

            // Success animation
            StrataMarkView(
                color: PatinaColors.clay,
                scale: 1.5,
                breathing: true
            )

            VStack(spacing: PatinaSpacing.md) {
                Text("Walk Complete")
                    .font(PatinaTypography.h2)
                    .foregroundStyle(PatinaColors.offWhite)

                Text("I've observed your space.\nSomething may emerge from what I've seen.")
                    .font(PatinaTypography.body)
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)

                // Save status indicator
                statusView
            }

            Spacer()

            // Actions
            VStack(spacing: PatinaSpacing.md) {
                PatinaButton("See What Emerged", style: .primary) {
                    onSeeEmergence()
                }

                Button {
                    onWalkAgain()
                } label: {
                    Text("Walk Again")
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.offWhite.opacity(0.6))
                }
            }
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.xxxl)
        }
    }

    // MARK: - Status View

    @ViewBuilder
    private var statusView: some View {
        HStack(spacing: PatinaSpacing.sm) {
            if let error = statusError, !error.isEmpty {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                    .font(.system(size: 14))
                Text("Saved locally")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.6))
            } else if hasScan {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.system(size: 14))
                Text("Saved")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.6))
            }
        }
        .padding(.top, PatinaSpacing.sm)
    }
}
