//
//  MatchBookedHero.swift
//  Patina
//
//  The booked-discovery hero (Arrival Arc, R106 §6). Rendered by
//  `DesignRequestStatusView` in place of the generic stage hero once the
//  request reaches `.booked` — reached instantly on an optimistic pick, or on
//  return to the request later. It confirms the moment: the time, a condensed
//  designer line, add-to-calendar (offered again here), and a jump into the
//  conversation. The stale/error paths never land here — only a committed pick.
//

import SwiftUI

struct MatchBookedHero: View {
    let request: DesignRequestStatus
    /// Resolved studio name (reconciled onto the status), with a neutral default.
    let studioName: String
    /// Opens the client–designer conversation (thread when known, else inbox).
    let onOpenConversation: () -> Void

    private var introduction: IntroductionInfo? { request.introduction }

    /// The picked slot's start — the anchor for the headline + calendar event.
    private var startsAt: Date? { introduction?.pickedSlotStartsAt }

    /// Call length: the picked slot's own duration when we still hold the
    /// offered slots, else any slot's, else a 45-minute default (the offline
    /// reconstruction carries the start but not the slot list).
    private var durationMinutes: Int {
        if let pickedId = introduction?.pickedSlotId,
           let picked = introduction?.slots.first(where: { $0.id == pickedId }) {
            return picked.durationMinutes
        }
        return introduction?.slots.first?.durationMinutes ?? 45
    }

    private var calendarNotes: String {
        "Your first discovery call with \(studioName), booked through Patina."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            PatinaStatusBadge(state: request.stage.badgeState, text: request.stage.badgeTitle)

            Text(request.stage.cardTitle(
                studioName: studioName,
                designerName: request.designerName,
                bookedSlotStartsAt: startsAt
            ))
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            Text(request.stage.subtitle(studioName: studioName, designerName: request.designerName))
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)

            condensedDesigner

            VStack(spacing: 10) {
                if let startsAt {
                    AddToCalendarButton(
                        title: "Discovery call — \(studioName)",
                        startsAt: startsAt,
                        durationMinutes: durationMinutes,
                        notes: calendarNotes
                    )
                }
                PatinaButton("Open the conversation", style: .secondary) {
                    onOpenConversation()
                }
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var condensedDesigner: some View {
        HStack(spacing: 12) {
            StrataMarkView(color: PatinaColors.clay, scale: 0.7)
                .frame(width: 40, height: 40)
                .background(PatinaColors.Background.primary)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(studioName)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                MonoLabel(text: "Your designer")
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

#if DEBUG
#Preview("Booked hero") {
    ScrollView {
        MatchBookedHero(
            request: .previewBooked,
            studioName: "Middle Studio",
            onOpenConversation: {}
        )
        .padding(.horizontal, 24)
        .padding(.top, 72)
    }
    .background(PatinaColors.Background.primary)
}

#Preview("Held copy") {
    let held = DesignRequestStatus.previewHeld
    return VStack(alignment: .leading, spacing: 12) {
        PatinaStatusBadge(state: held.stage.badgeState, text: held.stage.badgeTitle)
        Text(held.stage.cardTitle(studioName: held.studioName, designerName: held.designerName))
            .font(PatinaTypography.h2)
            .foregroundStyle(PatinaColors.Text.primary)
        Text(held.stage.subtitle(studioName: held.studioName, designerName: held.designerName))
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.Text.secondary)
    }
    .padding(24)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(PatinaColors.Background.primary)
}
#endif
