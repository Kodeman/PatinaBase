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
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(PatinaGradients.earth)
                    .frame(width: 44, height: 44)
                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 18))
                    .foregroundStyle(PatinaColors.offWhite)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Continue your scan")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.charcoal)
                Text("\(photosCount) photo\(photosCount == 1 ? "" : "s") captured · \(relativeStarted)")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.agedOak)
            }

            Spacer(minLength: 0)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PatinaColors.agedOak)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss saved scan")
        }
        .padding(12)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture(perform: onContinue)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Continue your saved scan")
        .accessibilityHint("\(photosCount) photos captured. Resumes the room scan you started earlier.")
        .accessibilityIdentifier("DailyRoomView.ContinueScanCard")
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
    .background(PatinaColors.offWhite)
}
