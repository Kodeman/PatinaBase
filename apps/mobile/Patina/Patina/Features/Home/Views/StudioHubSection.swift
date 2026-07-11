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
    }

    /// Unread notification count — supplied by the parent, which already
    /// owns `NotificationsViewModel` for the greeting-header bell badge.
    let unreadNotifications: Int

    /// Captured rooms — drives the "Your Spaces" row's meta line.
    let roomCount: Int

    @Environment(\.appCoordinator) private var coordinator

    /// Tracked `@Observable` reads — the section re-renders when a badge
    /// refresh lands or the auth state flips.
    private var badges: BadgeCountService { BadgeCountService.shared }
    private var isGuest: Bool { !AuthService.shared.isAuthenticated }

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

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Studio")
                .font(PatinaTypography.monoMedium)
                .tracking(1)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, PatinaSpacing.xs)

            VStack(spacing: 0) {
                row(StudioRow(
                    title: "Your Spaces",
                    meta: yourSpacesMeta,
                    guestMeta: yourSpacesMeta,
                    badge: 0,
                    route: .yourSpaces,
                    hint: "Opens your rooms.",
                    requiresAuth: false,
                    analyticsKey: "your_spaces"
                ))
                hairline
                row(StudioRow(
                    title: "Your Designer",
                    meta: "Get design help",
                    guestMeta: "Get design help",
                    badge: 0,
                    route: .designerConsultation,
                    hint: "Opens designer services.",
                    requiresAuth: false,
                    analyticsKey: "your_designer"
                ))
                hairline
                row(StudioRow(
                    title: "Projects",
                    meta: "With your design studio",
                    guestMeta: "Sign in to see your projects",
                    badge: 0,
                    route: .projectList,
                    hint: "Opens your projects.",
                    analyticsKey: "projects"
                ))
                hairline
                row(StudioRow(
                    title: "Proposals",
                    meta: badges.proposalsAwaitingSignatureCount > 0
                        ? "\(badges.proposalsAwaitingSignatureCount) awaiting your signature"
                        : "Nothing to review",
                    guestMeta: "Sign in to review proposals",
                    badge: badges.proposalsAwaitingSignatureCount,
                    route: .proposalList,
                    hint: "Opens your proposals.",
                    analyticsKey: "proposals"
                ))
                hairline
                row(StudioRow(
                    title: "Invoices",
                    meta: badges.payableInvoiceCount > 0
                        ? "\(badges.payableInvoiceCount) to pay"
                        : "Nothing due",
                    guestMeta: "Sign in to view invoices",
                    badge: badges.payableInvoiceCount,
                    route: .invoiceList,
                    hint: "Opens your invoices.",
                    analyticsKey: "invoices"
                ))
                hairline
                row(StudioRow(
                    title: "Budget",
                    meta: "Across your projects",
                    guestMeta: "Sign in to see your budget",
                    badge: 0,
                    route: .budget,
                    hint: "Opens your budget.",
                    analyticsKey: "budget"
                ))
                hairline
                row(StudioRow(
                    title: "Documents",
                    meta: "Contracts, drawings & files",
                    guestMeta: "Sign in to see shared documents",
                    badge: 0,
                    route: .documentList,
                    hint: "Opens documents shared with you.",
                    analyticsKey: "documents"
                ))
                hairline
                row(StudioRow(
                    title: "Messages",
                    meta: badges.unreadMessageCount > 0
                        ? "\(badges.unreadMessageCount) unread"
                        : "Up to date",
                    guestMeta: "Sign in to message your designer",
                    badge: badges.unreadMessageCount,
                    route: .threadList,
                    hint: "Opens your conversations.",
                    analyticsKey: "messages"
                ))
                hairline
                row(StudioRow(
                    title: "Decisions",
                    meta: badges.pendingDecisionCount > 0
                        ? "\(badges.pendingDecisionCount) waiting on you"
                        : "Nothing waiting",
                    guestMeta: "Sign in to review decisions",
                    badge: badges.pendingDecisionCount,
                    route: .decisionList,
                    hint: "Opens decisions waiting on you.",
                    analyticsKey: "decisions"
                ))
                hairline
                row(StudioRow(
                    title: "Notifications",
                    meta: unreadNotifications > 0
                        ? "\(unreadNotifications) new"
                        : "Up to date",
                    guestMeta: "Sign in for updates",
                    badge: unreadNotifications,
                    route: .notifications,
                    hint: "Opens your notifications.",
                    analyticsKey: "notifications"
                ))
            }
        }
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .padding(.top, PatinaSpacing.lg)
    }

    // MARK: - Row

    private func row(_ model: StudioRow) -> some View {
        let inviteGuest = isGuest && model.requiresAuth
        let resolvedMeta = inviteGuest ? model.guestMeta : model.meta
        return Button {
            if inviteGuest {
                coordinator.presentAuthentication()
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

    private var hairline: some View {
        Rectangle()
            .fill(PatinaColors.Text.muted.opacity(0.18))
            .frame(height: 1)
    }
}

#Preview {
    ScrollView {
        StudioHubSection(unreadNotifications: 3, roomCount: 3)
            .environment(\.appCoordinator, AppCoordinator())
    }
    .background(PatinaColors.Background.primary)
}
