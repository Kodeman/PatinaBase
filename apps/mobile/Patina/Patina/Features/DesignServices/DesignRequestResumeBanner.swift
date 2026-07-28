//
//  DesignRequestResumeBanner.swift
//  Patina
//
//  Home-surface resume banner for an in-flight design request. Surfaced on
//  the Daily Room when PatinaApp's launch housekeeping finds an active
//  `DesignRequestDraft` past composing (uploading / readyToSubmit /
//  submitting) — a request the user started sending but didn't finish.
//  Tapping reopens the `.designServices` flow, whose bootstrap re-derives the
//  resume-or-discard prompt from the persisted draft. Mirrors the
//  ContinueScanCard (PT-4-9) idiom.
//

import SwiftUI

struct DesignRequestResumeBanner: View {
    let onReview: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        // U12: real Button + visible "Review ›" affordance instead of a
        // silent whole-card tap gesture. The dismiss ✕ stays a SIBLING —
        // nested inside the primary Button's label it would never fire.
        HStack(spacing: PatinaSpacing.xsm) {
            Button(action: onReview) {
                HStack(spacing: PatinaSpacing.xsm) {
                    ZStack {
                        RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                            .fill(PatinaGradients.earth)
                            .frame(width: 44, height: 44)
                        Image(systemName: "paperplane")
                            .font(.system(size: 18))
                            .foregroundStyle(PatinaColors.offWhite)
                    }

                    VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
                        Text("Your design request is almost ready")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                        Text("Review & send")
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }

                    Spacer(minLength: PatinaSpacing.xs)

                    HStack(spacing: 2) {
                        Text("Review")
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
            .accessibilityLabel("Your design request is almost ready")
            .accessibilityHint("Reopens the design request you started so you can review and send it.")
            .accessibilityIdentifier("DailyRoomView.DesignRequestResumeBanner")

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PatinaColors.Text.muted)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss design request reminder")
        }
        .padding(PatinaSpacing.xsm)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous)
                .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1)
        )
    }
}

#Preview {
    DesignRequestResumeBanner(onReview: {}, onDismiss: {})
        .padding(20)
        .background(PatinaColors.Background.primary)
}
