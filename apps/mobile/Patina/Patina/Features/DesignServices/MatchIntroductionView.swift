//
//  MatchIntroductionView.swift
//  Patina
//
//  The "You're matched" moment (Arrival Arc, R106 §6). Rendered BY
//  `DesignRequestStatusView` when the focused request's stage is `.introduced`
//  — it swaps the detail body, it is not a new route. Everything a homeowner
//  meets at the front door of a designer relationship lives on this one screen,
//  in three movements, in order (mapping to match-ceremony-prototype scene 05):
//
//    i.   The designer card — studio mark, name, one-line credential, portfolio.
//         "She is meeting someone, not receiving a status."
//    ii.  The introduction — the designer's own words, in a warm display
//         register. This message is also the head of the client–designer thread.
//         (No voice note in v1 — Kody's ruling; no player is built.)
//    iii. The time picker — 2–3 tappable slots in the DEVICE's local zone; one
//         tap books it (optimistic → confirmation + add-to-calendar via the
//         booked hero). Escape hatch and a stale state both route to the thread,
//         so the screen never dead-ends.
//
//  Booking orchestration + failure state live in `MatchBookingModel` (owned by
//  the parent, so they survive the introduced → booked → introduced swap).
//

import SwiftUI

struct MatchIntroductionView: View {
    let request: DesignRequestStatus
    let booking: MatchBookingModel

    @Environment(\.appCoordinator) private var coordinator

    /// Resolved for the designer's logo + website only (the name already rides
    /// on `request.studioName`). Best-effort, non-blocking — the card renders
    /// immediately with the Strata mark + resolved name and swaps the logo in
    /// if/when this returns.
    @State private var studioIdentity: StudioIdentity?

    /// Drives the portfolio web hand-off (SFSafariViewController).
    @State private var portfolioTarget: IdentifiableURL?

    private var introduction: IntroductionInfo? { request.introduction }

    /// Studio name fallback chain: the reconciled receipt name → the freshly
    /// resolved identity → the designer's own name → a neutral default.
    private var studioName: String {
        request.studioName ?? studioIdentity?.name ?? request.designerName ?? "Your designer"
    }

    /// Portfolio destination — the introduction's explicit link, else the
    /// resolved studio website. Nil hides the affordance.
    private var portfolioURL: URL? {
        if let raw = introduction?.portfolioUrl, let url = URL(string: raw) { return url }
        if let raw = studioIdentity?.website, let url = URL(string: raw) { return url }
        return nil
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 28) {
                header
                designerCard
                if let introText = introduction?.introText, !introText.isEmpty {
                    introductionMovement(introText)
                }
                timePicker
            }
            .padding(.horizontal, 24)
            .padding(.top, 72)
            .padding(.bottom, 120)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.primary)
        // R04: nav bar is hidden for this destination — pin a back affordance.
        .overlay(alignment: .topLeading) {
            BackChevronButton(style: .light) { coordinator.goBack() }
                .padding(.top, 8)
                .padding(.leading, 18)
        }
        .task(id: request.designerId) {
            guard let designerId = request.designerId else { return }
            studioIdentity = await StudioIdentityService.shared.identity(forDesigner: designerId)
        }
        .fullScreenCover(item: $portfolioTarget) { target in
            SafariView(url: target.url) { portfolioTarget = nil }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: "Your designer")
            Text("You're matched.")
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Movement i · The designer card

    private var designerCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 16) {
                studioMark
                VStack(alignment: .leading, spacing: 3) {
                    Text(studioName)
                        .font(PatinaTypography.h4)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let credential = introduction?.credentialLine, !credential.isEmpty {
                        Text(credential)
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            if let portfolioURL {
                Button {
                    portfolioTarget = IdentifiableURL(url: portfolioURL)
                } label: {
                    HStack(spacing: 4) {
                        Text("Portfolio")
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Portfolio")
                .accessibilityHint("Opens \(studioName)'s portfolio in the browser.")
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1)
        )
    }

    private var studioMark: some View {
        let logoURL = studioIdentity?.logoUrl.flatMap { URL(string: $0) }
        return Group {
            if let logoURL {
                PatinaAsyncImage(url: logoURL, contentMode: .fill)
            } else {
                StrataMarkView(color: PatinaColors.clay, scale: 0.85)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(PatinaColors.Background.primary)
            }
        }
        .frame(width: 52, height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityHidden(true)
    }

    // MARK: - Movement ii · The introduction (her words)

    private func introductionMovement(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            MonoLabel(text: "The introduction")
            Text(text)
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Movement iii · The time picker

    @ViewBuilder
    private var timePicker: some View {
        let slots = introduction?.slots ?? []
        let now = Date()
        let showStale = MatchSlotFormatting.isStale(slots, now: now)
            || booking.failure(for: request.leadId) == .stale

        if showStale {
            staleState
        } else {
            let future = MatchSlotFormatting.futureSlots(slots, now: now)
            VStack(alignment: .leading, spacing: 14) {
                Text(pickHeaderText(slots: slots, hasSlots: !future.isEmpty, now: now))
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.Text.primary)

                ForEach(future) { slot in
                    slotRow(slot)
                }

                if booking.failure(for: request.leadId) == .retry {
                    retryNotice
                }

                escapeHatch
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func pickHeaderText(slots: [IntroductionSlot], hasSlots: Bool, now: Date) -> String {
        guard hasSlots else { return "Pick a time" }
        let minutes = MatchSlotFormatting.pickHeaderDuration(slots, now: now)
        return "Pick a time · \(minutes) minutes"
    }

    private func slotRow(_ slot: IntroductionSlot) -> some View {
        let primary = MatchSlotFormatting.slotLabel(for: slot.startsAt)
        let herTime = MatchSlotFormatting.herTimeLabel(
            for: slot.startsAt,
            designerTimeZoneIdentifier: introduction?.timezone
        )
        return Button {
            booking.book(request: request, slot: slot)
        } label: {
            HStack(spacing: PatinaSpacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(primary)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let herTime {
                        Text(herTime)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                }
                Spacer(minLength: PatinaSpacing.sm)
                Text("Tap to book")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.clay)
                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                    .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(primary)
        .accessibilityHint("Books this discovery call.")
    }

    private var retryNotice: some View {
        HStack(spacing: PatinaSpacing.xs) {
            Image(systemName: "exclamationmark.circle")
            Text("That didn't go through. Tap a time to try again.")
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(PatinaTypography.caption)
        .foregroundStyle(PatinaColors.warning)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var escapeHatch: some View {
        Button {
            openThread()
        } label: {
            Text("None of these work? Propose another time →")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.interactive)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens your conversation to suggest another time.")
    }

    private var staleState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pick a time")
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
            Text("These times have passed — message \(studioName) for fresh ones.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
            PatinaButton("Message \(studioName)", style: .secondary) {
                openThread()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Navigation

    private func openThread() {
        if let threadId = introduction?.threadId {
            coordinator.navigate(to: .threadDetail(threadId: threadId.uuidString))
        } else {
            coordinator.navigate(to: .threadList)
        }
    }
}

#if DEBUG
#Preview("Introduced · 3 slots") {
    MatchIntroductionView(request: .previewIntroduced, booking: MatchBookingModel())
        .environment(\.appCoordinator, AppCoordinator())
}

#Preview("Introduced · stale slots") {
    MatchIntroductionView(request: .previewStale, booking: MatchBookingModel())
        .environment(\.appCoordinator, AppCoordinator())
}
#endif
