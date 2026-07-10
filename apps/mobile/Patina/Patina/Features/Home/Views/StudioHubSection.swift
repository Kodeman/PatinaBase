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
                row(
                    title: "Projects",
                    meta: "With your design studio",
                    guestMeta: "Sign in to see your projects",
                    count: 0,
                    route: .projectList,
                    hint: "Opens your projects."
                )
                hairline
                row(
                    title: "Messages",
                    meta: badges.unreadMessageCount > 0
                        ? "\(badges.unreadMessageCount) unread"
                        : "Up to date",
                    guestMeta: "Sign in to message your designer",
                    count: badges.unreadMessageCount,
                    route: .threadList,
                    hint: "Opens your conversations."
                )
                hairline
                row(
                    title: "Decisions",
                    meta: badges.pendingDecisionCount > 0
                        ? "\(badges.pendingDecisionCount) waiting on you"
                        : "Nothing waiting",
                    guestMeta: "Sign in to review decisions",
                    count: badges.pendingDecisionCount,
                    route: .decisionList,
                    hint: "Opens decisions waiting on you."
                )
                hairline
                row(
                    title: "Notifications",
                    meta: unreadNotifications > 0
                        ? "\(unreadNotifications) new"
                        : "Up to date",
                    guestMeta: "Sign in for updates",
                    count: unreadNotifications,
                    route: .notifications,
                    hint: "Opens your notifications."
                )
            }
        }
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .padding(.top, PatinaSpacing.lg)
    }

    // MARK: - Row

    private func row(
        title: String,
        meta: String,
        guestMeta: String,
        count: Int,
        route: AppRoute,
        hint: String
    ) -> some View {
        let resolvedMeta = isGuest ? guestMeta : meta
        return Button {
            if isGuest {
                coordinator.presentAuthentication()
            } else {
                coordinator.navigate(to: route)
            }
        } label: {
            HStack(spacing: PatinaSpacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text(resolvedMeta)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                }

                Spacer(minLength: PatinaSpacing.sm)

                if !isGuest, count > 0 {
                    Text(count > 9 ? "9+" : "\(count)")
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
        .accessibilityLabel(title)
        .accessibilityValue(resolvedMeta)
        .accessibilityHint(isGuest ? "Opens sign in." : hint)
        .accessibilityIdentifier("StudioHubSection.\(title)")
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
