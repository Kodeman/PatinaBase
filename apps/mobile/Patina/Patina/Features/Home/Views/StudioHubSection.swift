//
//  StudioHubSection.swift
//  Patina
//
//  C.1 / R29: the Studio rail — a typography-first hub section on the
//  Daily Room home. Ten rows (Your Spaces / Your Designer / Projects /
//  Proposals / Invoices / Budget / Documents / Messages / Decisions /
//  Notifications) in The Document's hub language: Playfair row title,
//  DM Mono meta line, trailing count badge, chevron. Ruled a home-hub
//  rail, NOT a tab bar (the tab bar is re-asked post-Track-D).
//
//  Your Spaces and Your Designer sit at the top of the rail
//  (`requiresAuth: false`): rooms are browsable pre-auth, and the
//  design-request flow self-gates auth at send.
//
//  Counts come from `BadgeCountService` (pending decisions + unread
//  messages, polling floor only this wave) plus the parent-owned unread
//  notification count that already drives the greeting-header bell.
//
//  Guest mode: counts hidden; rows with `requiresAuth: true` render a
//  quiet sign-in invitation meta line and route to authentication — an
//  invitation, not an error. Rows with `requiresAuth: false` behave the
//  same for guests as for signed-in users.
//

import SwiftUI

struct StudioHubSection: View {

    /// One rail row: title/meta in the hub language, count badge, and the
    /// coordinator destination — with the guest-mode invitation meta line.
    private struct StudioRow {
        let title: String
        let meta: String
        let guestMeta: String
        /// Named `badge`, not `count` — SwiftLint's `empty_count` rule is
        /// syntactic and errors on any `.count > 0`, even on an Int.
        let badge: Int
        let route: AppRoute
        let hint: String
        /// False for rows a guest can open without hitting the sign-in
        /// gate — "Your Spaces" and "Your Designer" are browsable
        /// pre-auth; the design-request flow self-gates auth at send.
        var requiresAuth: Bool = true
        /// PostHog `row` property captured on `studio_hub_row_tapped`.
        let analyticsKey: String
        /// Lowest engagement tier at which this row appears. Discovering-tier
        /// users see none of the hub (the home shows a designer CTA instead);
        /// `.engaged` reveals the designer + messaging surfaces; the default
        /// `.activeProject` gates the rest until a project exists.
        var minimumTier: EngagementTier = .activeProject
    }

    /// Unread notification count — supplied by the parent, which already
    /// owns `NotificationsViewModel` for the greeting-header bell badge.
    let unreadNotifications: Int

    /// Captured rooms — drives the "Your Spaces" row's meta line.
    let roomCount: Int

    /// Progressive-disclosure tier — filters which rows are visible. The
    /// parent only renders this section at `.engaged` or higher; at
    /// `.discovering` the home shows a "Work with a designer" CTA instead.
    let tier: EngagementTier

    @Environment(\.appCoordinator) private var coordinator

    /// Studio name resolved for the active (matched) designer, Wave 6 / D2.
    /// Loaded on its own `.task` — starts nil (the static badge title shows
    /// first) and swaps in once/if the resolver returns a studio brand, so
    /// the row never blocks or waits on this fetch.
    @State private var resolvedDesignerStudioName: String?

    /// Tracked `@Observable` reads — the section re-renders when a badge
    /// refresh lands or the auth state flips.
    private var badges: BadgeCountService { BadgeCountService.shared }
    private var requestStatus: DesignRequestStatusService { DesignRequestStatusService.shared }
    private var isGuest: Bool { !AuthService.shared.isAuthenticated }

    /// The "Your Designer" row goes dynamic once a request exists: it points
    /// at the status detail and carries the current stage as its meta line.
    /// Guests always see the static "Get design help" landing entry (the
    /// service holds no requests for guests).
    private var hasDesignRequests: Bool { !isGuest && !requestStatus.requests.isEmpty }

    /// The promoted (or newest) request, when one exists.
    private var currentRequest: DesignRequestStatus? {
        requestStatus.promotedRequest ?? requestStatus.requests.first
    }

    /// The matched designer's id, only once the relationship is active —
    /// drives the studio-name resolution below. Nil for every other stage.
    private var activeDesignerId: UUID? {
        guard let request = currentRequest, request.stage.isMatched else { return nil }
        return request.designerId
    }

    /// Stage label for the "Your Designer" meta — rendered uppercase by the
    /// row's `textCase`, so "Finding your designer" reads "FINDING YOUR
    /// DESIGNER". Falls back to the newest request when none is promoted.
    /// Once matched, prefers the resolved studio name over the generic
    /// "Designer matched" badge title (Wave 6 / D2), keeping the static
    /// fallback until (or unless) that resolves.
    private var designerMeta: String {
        guard hasDesignRequests else { return "Get design help" }
        guard let stage = currentRequest?.stage else { return "Get design help" }
        if stage.isMatched, let resolvedDesignerStudioName {
            return resolvedDesignerStudioName
        }
        return stage.badgeTitle
    }

    private var designerRoute: AppRoute {
        hasDesignRequests ? .designRequests(focusLeadId: nil) : .designerConsultation
    }

    private var designerBadge: Int {
        hasDesignRequests ? requestStatus.attentionCount : 0
    }

    /// "Your Spaces" row meta — "captured", not "scanned": manual-entry
    /// rooms exist alongside scanned ones.
    private var yourSpacesMeta: String {
        if roomCount == 0 {
            return "Scan your first room"
        } else if roomCount == 1 {
            return "1 room captured"
        } else {
            return "\(roomCount) rooms captured"
        }
    }

    /// Every hub row in display order, each tagged with the tier that unlocks
    /// it. `body` filters this by the current tier; the parent decides whether
    /// to render the section at all (discovering tier shows a designer CTA
    /// instead of the hub).
    private var allRows: [StudioRow] {
        [
            StudioRow(
                title: "Your Spaces",
                meta: yourSpacesMeta,
                guestMeta: yourSpacesMeta,
                badge: 0,
                route: .yourSpaces,
                hint: "Opens your rooms.",
                requiresAuth: false,
                analyticsKey: "your_spaces",
                minimumTier: .engaged
            ),
            StudioRow(
                title: "Your Designer",
                meta: designerMeta,
                guestMeta: "Get design help",
                badge: designerBadge,
                route: designerRoute,
                hint: hasDesignRequests
                    ? "Opens your design request."
                    : "Opens designer services.",
                requiresAuth: false,
                analyticsKey: "your_designer",
                minimumTier: .engaged
            ),
            StudioRow(
                title: "Projects",
                meta: "With your design studio",
                guestMeta: "Sign in to see your projects",
                badge: 0,
                route: .projectList,
                hint: "Opens your projects.",
                analyticsKey: "projects"
            ),
            StudioRow(
                title: "Proposals",
                meta: badges.proposalsAwaitingSignatureCount > 0
                    ? "\(badges.proposalsAwaitingSignatureCount) awaiting your signature"
                    : "Nothing to review",
                guestMeta: "Sign in to review proposals",
                badge: badges.proposalsAwaitingSignatureCount,
                route: .proposalList,
                hint: "Opens your proposals.",
                analyticsKey: "proposals"
            ),
            StudioRow(
                title: "Invoices",
                meta: badges.payableInvoiceCount > 0
                    ? "\(badges.payableInvoiceCount) to pay"
                    : "Nothing due",
                guestMeta: "Sign in to view invoices",
                badge: badges.payableInvoiceCount,
                route: .invoiceList,
                hint: "Opens your invoices.",
                analyticsKey: "invoices"
            ),
            StudioRow(
                title: "Budget",
                meta: "Across your projects",
                guestMeta: "Sign in to see your budget",
                badge: 0,
                route: .budget,
                hint: "Opens your budget.",
                analyticsKey: "budget"
            ),
            StudioRow(
                title: "Documents",
                meta: "Contracts, drawings & files",
                guestMeta: "Sign in to see shared documents",
                badge: 0,
                route: .documentList,
                hint: "Opens documents shared with you.",
                analyticsKey: "documents"
            ),
            StudioRow(
                title: "Messages",
                meta: badges.unreadMessageCount > 0
                    ? "\(badges.unreadMessageCount) unread"
                    : "Up to date",
                guestMeta: "Sign in to message your designer",
                badge: badges.unreadMessageCount,
                route: .threadList,
                hint: "Opens your conversations.",
                analyticsKey: "messages",
                minimumTier: .engaged
            ),
            StudioRow(
                title: "Decisions",
                meta: badges.pendingDecisionCount > 0
                    ? "\(badges.pendingDecisionCount) waiting on you"
                    : "Nothing waiting",
                guestMeta: "Sign in to review decisions",
                badge: badges.pendingDecisionCount,
                route: .decisionList,
                hint: "Opens decisions waiting on you.",
                analyticsKey: "decisions"
            ),
            StudioRow(
                title: "Notifications",
                meta: unreadNotifications > 0
                    ? "\(unreadNotifications) new"
                    : "Up to date",
                guestMeta: "Sign in for updates",
                badge: unreadNotifications,
                route: .notifications,
                hint: "Opens your notifications.",
                analyticsKey: "notifications"
            )
        ]
    }

    var body: some View {
        let visible = allRows.filter { tier >= $0.minimumTier }
        // U19: at `.engaged` the hub silently withheld seven rows, so the
        // client had no idea the Studio grows. The gated rows now render
        // after the live ones — locked, inert, and captioned with what
        // unlocks them. Below `.engaged` the parent shows the CTA instead,
        // so there's nothing to preview.
        let locked = tier >= .engaged ? allRows.filter { tier < $0.minimumTier } : []
        return Group {
            if visible.isEmpty {
                // Discovering tier (or nothing to show) — the parent renders a
                // designer CTA in this slot instead of an empty "Studio" header.
                EmptyView()
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Studio")
                        .font(PatinaTypography.monoMedium)
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.bottom, PatinaSpacing.xs)

                    VStack(spacing: 0) {
                        // Hairlines are interleaved BETWEEN visible rows only,
                        // so a filtered-out row never leaves a dangling divider.
                        ForEach(Array(visible.enumerated()), id: \.element.title) { index, model in
                            if index > 0 { hairline }
                            row(model)
                        }
                        ForEach(locked, id: \.title) { model in
                            hairline
                            lockedRow(model)
                        }
                    }
                }
                .padding(.horizontal, PatinaSpacing.mdLarge)
                .padding(.top, PatinaSpacing.lg)
            }
        }
        .task(id: activeDesignerId) {
            guard let activeDesignerId else {
                resolvedDesignerStudioName = nil
                return
            }
            resolvedDesignerStudioName = await StudioIdentityService.shared
                .identity(forDesigner: activeDesignerId)?.name
        }
    }

    // MARK: - Row

    private func row(_ model: StudioRow) -> some View {
        let inviteGuest = isGuest && model.requiresAuth
        let resolvedMeta = inviteGuest ? model.guestMeta : model.meta
        return Button {
            if inviteGuest {
                // U21: an in-context sign-in prompt is a sheet over the home,
                // not a phase-level ejection that discards where you were.
                coordinator.presentedSheet = .auth
            } else {
                PostHogService.shared.capture("studio_hub_row_tapped", properties: [
                    "row": model.analyticsKey
                ])
                coordinator.navigate(to: model.route)
            }
        } label: {
            HStack(spacing: PatinaSpacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.title)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text(resolvedMeta)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                }

                Spacer(minLength: PatinaSpacing.sm)

                if !isGuest, model.badge > 0 {
                    Text(model.badge > 9 ? "9+" : "\(model.badge)")
                        .font(PatinaTypography.captionMedium)
                        .foregroundStyle(PatinaColors.Text.inverse)
                        .padding(.horizontal, PatinaSpacing.sm)
                        .frame(minWidth: 22, minHeight: 22)
                        .background(Capsule().fill(PatinaColors.Interactive.default))
                        .accessibilityHidden(true)
                }

                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, PatinaSpacing.xsm)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(model.title)
        .accessibilityValue(resolvedMeta)
        .accessibilityHint(inviteGuest ? "Opens sign in." : model.hint)
        .accessibilityIdentifier("StudioHubSection.\(model.title)")
    }

    /// A row the current tier hasn't unlocked yet: same layout as a live row
    /// so the shape of the full Studio is legible, but inert — no button, no
    /// badge, a padlock where the chevron goes, and a meta line that names
    /// the trigger rather than describing content the client doesn't have.
    private func lockedRow(_ model: StudioRow) -> some View {
        HStack(spacing: PatinaSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(model.title)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text("Opens with your first project")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
            }

            Spacer(minLength: PatinaSpacing.sm)

            Image(systemName: "lock.fill")
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, PatinaSpacing.xsm)
        .frame(minHeight: 44)
        .opacity(0.45)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(model.title)
        .accessibilityValue("Opens with your first project")
        .accessibilityHint("Locked until your first project begins.")
        .accessibilityIdentifier("StudioHubSection.Locked.\(model.title)")
    }

    private var hairline: some View {
        Rectangle()
            .fill(PatinaColors.Text.muted.opacity(0.18))
            .frame(height: 1)
    }
}

#Preview("Active project — full hub") {
    ScrollView {
        StudioHubSection(unreadNotifications: 3, roomCount: 3, tier: .activeProject)
            .environment(\.appCoordinator, AppCoordinator())
    }
    .background(PatinaColors.Background.primary)
}

#Preview("Engaged — designer + messages only") {
    ScrollView {
        StudioHubSection(unreadNotifications: 1, roomCount: 2, tier: .engaged)
            .environment(\.appCoordinator, AppCoordinator())
    }
    .background(PatinaColors.Background.primary)
}
