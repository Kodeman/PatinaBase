//
//  DesignRequestStatusCard.swift
//  Patina
//
//  Home-surface promoted card for a SUBMITTED design request — the "after
//  submit, the request should be promoted in visibility" surface. Shares the
//  exact visual idiom of `DesignRequestResumeBanner` (44pt earth-gradient
//  paperplane tile, clay-0.35 stroke, Background.secondary card) with a
//  `PatinaStatusBadge` under the title carrying the current stage.
//
//  Which request (if any) shows is decided by
//  `DesignRequestStatusService.promotedRequest`, not this view. Tapping opens
//  the request detail; the dismiss (x) records the dismissal so the card
//  reappears when the stage advances (terminal dismissal is permanent).
//

import SwiftUI

struct DesignRequestStatusCard: View {
    let request: DesignRequestStatus
    let onOpen: () -> Void
    let onDismiss: () -> Void

    private var stage: DesignRequestStage { request.stage }

    private var title: String {
        stage.cardTitle(
            studioName: request.studioName,
            designerName: request.designerName,
            bookedSlotStartsAt: request.introduction?.pickedSlotStartsAt
        )
    }

    private var subtitle: String {
        "\(request.projectTypeDisplay) · sent \(request.relativeSubmitted)"
    }

    var body: some View {
        // U12: real Button + visible "Open ›" affordance instead of a silent
        // whole-card tap gesture. The dismiss ✕ stays a SIBLING — nested
        // inside the primary Button's label it would never fire.
        HStack(alignment: .top, spacing: PatinaSpacing.xsm) {
            Button(action: onOpen) {
                HStack(alignment: .top, spacing: PatinaSpacing.xsm) {
                    ZStack {
                        RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                            .fill(PatinaGradients.earth)
                            .frame(width: 44, height: 44)
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(PatinaColors.offWhite)
                    }

                    VStack(alignment: .leading, spacing: PatinaSpacing.xxs) {
                        Text(title)
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        PatinaStatusBadge(state: stage.badgeState, text: stage.badgeTitle)
                        Text(subtitle)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }

                    Spacer(minLength: PatinaSpacing.xs)

                    HStack(spacing: 2) {
                        Text("Open")
                            .font(PatinaTypography.monoLabel)
                            .tracking(0.4)
                            .textCase(.uppercase)
                            .foregroundStyle(PatinaColors.Text.interactive)
                        Image(systemName: "chevron.right")
                            .font(PatinaTypography.uiSmall)
                            .foregroundStyle(PatinaColors.Text.interactive)
                    }
                    .padding(.top, 2)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(title)
            .accessibilityValue(stage.subtitle(studioName: request.studioName, designerName: request.designerName))
            .accessibilityHint("Opens your design request to see its progress.")
            .accessibilityIdentifier("DailyRoomView.DesignRequestStatusCard")

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PatinaColors.Text.muted)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss design request status")
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
    DesignRequestStatusCard(
        request: DesignRequestStatus(
            leadId: UUID(),
            statusRaw: "new",
            designerId: nil,
            designerName: nil,
            projectTypeRaw: "full_room",
            budgetRange: nil,
            timeline: nil,
            requestDescription: nil,
            scanCount: 2,
            createdAt: Date().addingTimeInterval(-7200),
            updatedAt: nil,
            dismissedAt: nil,
            dismissedStageRaw: nil
        ),
        onOpen: {},
        onDismiss: {}
    )
    .padding(20)
    .background(PatinaColors.Background.primary)
}
