//
//  DesignRequestStatusView.swift
//  Patina
//
//  Detail surface for a submitted design request (route `.designRequests`).
//  Reached from the promoted home card, the "Your Designer" hub row, a
//  notification tap, or the post-submit "Track your request" button.
//
//  Shows the current stage hero, a quiet three-step timeline, a "what you
//  sent" recap, the matched designer (with a jump to Messages), any previous
//  requests, and — on a terminal stage — a way to start a new request. When
//  there are no requests yet it renders the `DesignerConsultationView` landing
//  so the screen never dead-ends. There is deliberately no cancel action: the
//  `leads` UPDATE policy is designer-only (documented follow-up).
//

import SwiftUI

struct DesignRequestStatusView: View {
    let focusLeadId: String?

    @Environment(\.appCoordinator) private var coordinator

    /// The request the user tapped into from "Previous requests" (switches
    /// focus in place). Falls back to the routed `focusLeadId`, then newest.
    @State private var selectedLeadId: UUID?

    /// Booking orchestration for the Match Ceremony pick (R106 §6). Owned here,
    /// not by `MatchIntroductionView`, so its in-flight + failure state survive
    /// the introduced → booked → introduced body swap the optimistic pick drives.
    @State private var booking = MatchBookingModel()

    private var service: DesignRequestStatusService { DesignRequestStatusService.shared }

    private var focused: DesignRequestStatus? {
        let requests = service.requests
        if let selectedLeadId, let match = requests.first(where: { $0.leadId == selectedLeadId }) {
            return match
        }
        if let focusLeadId, let uuid = UUID(uuidString: focusLeadId),
           let match = requests.first(where: { $0.leadId == uuid }) {
            return match
        }
        return requests.first
    }

    private var others: [DesignRequestStatus] {
        guard let focused else { return [] }
        return service.requests.filter { $0.leadId != focused.leadId }
    }

    var body: some View {
        Group {
            if let focused {
                if focused.stage == .introduced {
                    // The "You're matched" moment swaps the whole detail body
                    // (no new route) — R106 §6.
                    MatchIntroductionView(request: focused, booking: booking)
                } else {
                    detail(for: focused)
                }
            } else {
                // No requests yet — the orphaned landing becomes the
                // no-request state so the screen never dead-ends.
                DesignerConsultationView()
            }
        }
        .task { await service.refresh() }
        // Fire `client_held_state_shown` once per lead the first time a held
        // request is rendered here (deduped durably inside the analytics helper).
        .task(id: heldFocusLeadId) {
            if let heldFocusLeadId {
                MatchCeremonyAnalytics.heldStateShownIfNeeded(leadId: heldFocusLeadId)
            }
        }
    }

    /// The focused lead id ONLY when it is at the held stage — the trigger for
    /// the held-state telemetry `.task(id:)`.
    private var heldFocusLeadId: UUID? {
        guard let focused, focused.stage == .held else { return nil }
        return focused.leadId
    }

    // MARK: - Detail

    private func detail(for request: DesignRequestStatus) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 28) {
                if request.stage == .booked {
                    MatchBookedHero(
                        request: request,
                        studioName: heroStudioName(request),
                        onOpenConversation: { openConversation(request) }
                    )
                } else {
                    stageHero(request)
                }
                timeline(request)
                whatYouSent(request)
                // The booked hero already carries a condensed designer + a jump
                // into the conversation, so the generic designer card is skipped.
                if request.designerName != nil && request.stage != .booked {
                    designerCard(request)
                }
                if request.stage.isTerminal {
                    PatinaButton("Start a new request", style: .primary) {
                        coordinator.presentedSheet = .designServices(roomId: nil, preselectedScanIds: [])
                    }
                }
                if !others.isEmpty {
                    previousRequests
                }
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
    }

    // MARK: - Stage hero

    private func stageHero(_ request: DesignRequestStatus) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            PatinaStatusBadge(state: request.stage.badgeState, text: request.stage.badgeTitle)
            Text(request.stage.cardTitle(
                studioName: request.studioName,
                designerName: request.designerName,
                bookedSlotStartsAt: request.introduction?.pickedSlotStartsAt
            ))
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
            Text(request.stage.subtitle(studioName: request.studioName, designerName: request.designerName))
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Timeline

    private enum StepState { case done, current, future }

    private func timeline(_ request: DesignRequestStatus) -> some View {
        let stage = request.stage
        let sentSub = "sent \(request.relativeSubmitted)"
        let studioLabel = request.studioName ?? request.designerName

        // Introduction step — the Match Ceremony reaching the client.
        let introState: StepState
        let introSub: String?
        switch stage {
        case .finding, .closed, .expired:
            introState = .future; introSub = nil
        case .held, .inTouch:
            introState = .current; introSub = nil
        case .introduced, .booked, .matched:
            introState = .done; introSub = studioLabel
        }

        // Discovery step — booking (then holding) the first call.
        let discoveryState: StepState
        let discoverySub: String?
        switch stage {
        case .booked:
            discoveryState = .done
            discoverySub = request.introduction?.pickedSlotStartsAt.map(Self.timelineSlotLabel)
        case .introduced:
            discoveryState = .current; discoverySub = nil
        case .matched:
            discoveryState = .done; discoverySub = nil
        default:
            discoveryState = .future; discoverySub = nil
        }

        return VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Progress")
            timelineRow(title: "Request sent", subtitle: sentSub, state: .done, isLast: false)
            timelineRow(title: "Introduction", subtitle: introSub, state: introState, isLast: false)
            timelineRow(title: "Discovery", subtitle: discoverySub, state: discoveryState, isLast: true)
        }
    }

    /// Compact "Thu, Jul 24 · 2:00 PM" label for the Discovery step's subtitle
    /// (device-local zone). The match screen owns the richer picker formatting.
    private static func timelineSlotLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("EEE MMM d j mm")
        return formatter.string(from: date)
    }

    /// Studio name for the booked hero — the reconciled name, then the
    /// designer's own, then a neutral default. No fetch (booked always has a
    /// resolved designer + name from the reconcile pass).
    private func heroStudioName(_ request: DesignRequestStatus) -> String {
        request.studioName ?? request.designerName ?? "Your designer"
    }

    /// Open the client–designer conversation — the intro thread when known,
    /// else the inbox.
    private func openConversation(_ request: DesignRequestStatus) {
        if let threadId = request.introduction?.threadId {
            coordinator.navigate(to: .threadDetail(threadId: threadId.uuidString))
        } else {
            coordinator.navigate(to: .threadList)
        }
    }

    private func timelineRow(title: String, subtitle: String?, state: StepState, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Circle()
                    .fill(state == .future ? PatinaColors.Text.muted.opacity(0.3) : PatinaColors.clay)
                    .frame(width: 10, height: 10)
                    .overlay(
                        Circle()
                            .stroke(PatinaColors.clay, lineWidth: state == .current ? 2 : 0)
                            .frame(width: 16, height: 16)
                    )
                    .padding(.top, 3)
                if !isLast {
                    Rectangle()
                        .fill(PatinaColors.Text.muted.opacity(0.2))
                        .frame(width: 1)
                        .frame(minHeight: 26)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(state == .future ? PatinaColors.Text.muted : PatinaColors.Text.primary)
                if let subtitle {
                    Text(subtitle)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
            .padding(.bottom, isLast ? 0 : 14)
            Spacer(minLength: 0)
        }
    }

    // MARK: - What you sent

    private func whatYouSent(_ request: DesignRequestStatus) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("What you sent")
            summaryRow("Project", request.projectTypeDisplay)
            if let budget = budgetLabel(request.budgetRange) {
                summaryRow("Budget", budget)
            }
            if let timeline = timelineLabel(request.timeline) {
                summaryRow("Timeline", timeline)
            }
            summaryRow("Scans", "\(request.scanCount) scan\(request.scanCount == 1 ? "" : "s")")
            if let description = request.requestDescription, !description.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Notes")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.muted)
                    Text(description)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 6)
            }
        }
    }

    // MARK: - Designer card

    private func designerCard(_ request: DesignRequestStatus) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 16) {
                Circle()
                    .fill(PatinaGradients.earth)
                    .frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 4) {
                    Text(request.designerName ?? "Your designer")
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    MonoLabel(text: "Your designer")
                }
                Spacer(minLength: 0)
            }
            if request.stage.needsAttention {
                PatinaButton("Open Messages", style: .secondary) {
                    coordinator.navigate(to: .threadList)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Previous requests

    private var previousRequests: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Previous requests")
            ForEach(others) { request in
                Button {
                    selectedLeadId = request.leadId
                } label: {
                    HStack(spacing: PatinaSpacing.sm) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(request.projectTypeDisplay)
                                .font(PatinaTypography.bodySmallMedium)
                                .foregroundStyle(PatinaColors.Text.primary)
                            Text("sent \(request.relativeSubmitted)")
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.muted)
                        }
                        Spacer(minLength: PatinaSpacing.sm)
                        PatinaStatusBadge(state: request.stage.badgeState, text: request.stage.badgeTitle)
                        Image(systemName: "chevron.right")
                            .font(PatinaTypography.uiSmall)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens this request.")
            }
        }
    }

    // MARK: - Reusable bits

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(PatinaTypography.monoMedium)
            .tracking(1)
            .textCase(.uppercase)
            .foregroundStyle(PatinaColors.Text.muted)
            .accessibilityAddTraits(.isHeader)
            .padding(.bottom, PatinaSpacing.xs)
    }

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.muted)
            Spacer()
            Text(value)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 6)
    }

    private func budgetLabel(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        return DesignBudget(rawValue: raw)?.displayName ?? raw
    }

    private func timelineLabel(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        return DesignTimeline(rawValue: raw)?.displayName ?? raw
    }
}
