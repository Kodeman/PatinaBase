//
//  StudioHubSection.swift
//  Patina
//
//  C.1 / R29: the Studio rail — a typography-first hub section on the
//  Daily Room home. Four rows (Projects / Messages / Decisions /
//  Notifications) in The Document's hub language: Playfair row title,
//  DM Mono meta line, trailing count badge, chevron. Ruled a home-hub
//  rail, NOT a tab bar (the tab bar is re-asked post-Track-D).
//
//  Counts come from `BadgeCountService` (pending decisions + unread
//  messages, polling floor only this wave) plus the parent-owned unread
//  notification count that already drives the greeting-header bell.
//
//  Guest mode: counts hidden; each row renders a quiet sign-in
//  invitation meta line and routes to authentication — an invitation,
//  not an error.
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
    }

    /// Unread notification count — supplied by the parent, which already
    /// owns `NotificationsViewModel` for the greeting-header bell badge.
    let unreadNotifications: Int

    @Environment(\.appCoordinator) private var coordinator

    /// Tracked `@Observable` reads — the section re-renders when a badge
    /// refresh lands or the auth state flips.
    private var badges: BadgeCountService { BadgeCountService.shared }
    private var isGuest: Bool { !AuthService.shared.isAuthenticated }

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
                    title: "Projects",
                    meta: "With your design studio",
                    guestMeta: "Sign in to see your projects",
                    badge: 0,
                    route: .projectList,
                    hint: "Opens your projects."
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
                    hint: "Opens your conversations."
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
                    hint: "Opens decisions waiting on you."
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
                    hint: "Opens your notifications."
                ))
            }
        }
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .padding(.top, PatinaSpacing.lg)
    }

    // MARK: - Row

    private func row(_ model: StudioRow) -> some View {
        let resolvedMeta = isGuest ? model.guestMeta : model.meta
        return Button {
            if isGuest {
                coordinator.presentAuthentication()
            } else {
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
        .accessibilityHint(isGuest ? "Opens sign in." : model.hint)
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
        StudioHubSection(unreadNotifications: 3)
            .environment(\.appCoordinator, AppCoordinator())
    }
    .background(PatinaColors.Background.primary)
}
