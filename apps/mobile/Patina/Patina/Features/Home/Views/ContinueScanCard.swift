//
//  ContinueScanCard.swift
//  Patina
//
//  PT-4-9: "Continue your scan" resume card. Surfaced on the Daily Room when
//  `ScanRecoveryService` finds a saved, in-progress scan bundle on disk that
//  the user never finished (≥ the service's viable photo threshold, manifest
//  not yet finalized). Tapping resumes the Quiet Conversation scan flow.
//

import SwiftUI

struct ContinueScanCard: View {
    /// Number of photos already captured in the saved bundle — gives the user
    /// a sense of how much progress they'd be picking back up.
    let photosCount: Int
    /// When the saved scan was started, for a light "X ago" subtitle.
    let createdAt: Date
    let onContinue: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        // U12: the card's primary action is a real Button carrying a visible
        // "Continue ›" affordance — a whole-card tap gesture announced
        // nothing and offered no cue that the card was live. The dismiss ✕
        // stays a SIBLING button: nesting it inside the primary Button's
        // label would swallow its taps.
        HStack(spacing: PatinaSpacing.xsm) {
            Button(action: onContinue) {
                HStack(spacing: PatinaSpacing.xsm) {
                    ZStack {
                        RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                            .fill(PatinaGradients.earth)
                            .frame(width: 44, height: 44)
                        Image(systemName: "camera.viewfinder")
                            .font(.system(size: 18))
                            .foregroundStyle(PatinaColors.offWhite)
                    }

                    VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
                        Text("Continue your scan")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                        Text("\(photosCount) photo\(photosCount == 1 ? "" : "s") captured · \(relativeStarted)")
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }

                    Spacer(minLength: PatinaSpacing.xs)

                    HStack(spacing: 2) {
                        Text("Continue")
                            .font(PatinaTypography.monoLabel)
                            .tracking(0.4)
                            .textCase(.uppercase)
                            .foregroundStyle(PatinaColors.Text.interactive)
                        Image(systemName: "chevron.right")
                            .font(PatinaTypography.uiSmall)
                            .foregroundStyle(PatinaColors.Text.interactive)
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Continue your saved scan")
            .accessibilityHint("\(photosCount) photos captured. Resumes the room scan you started earlier.")
            .accessibilityIdentifier("DailyRoomView.ContinueScanCard")

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PatinaColors.Text.muted)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss saved scan")
        }
        .padding(PatinaSpacing.xsm)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous)
                .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1)
        )
    }

    private var relativeStarted: String {
        let interval = Date().timeIntervalSince(createdAt)
        if interval < 3600 { return "\(max(1, Int(interval / 60)))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        return "\(Int(interval / 86400))d ago"
    }
}

#Preview {
    ContinueScanCard(
        photosCount: 12,
        createdAt: Date().addingTimeInterval(-5400),
        onContinue: {},
        onDismiss: {}
    )
    .padding(20)
    .background(PatinaColors.Background.primary)
}
