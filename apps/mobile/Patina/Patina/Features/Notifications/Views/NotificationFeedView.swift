//
//  NotificationFeedView.swift
//  Patina
//
//  Notification feed backed by `notification_log` via NotificationsAPIClient.
//

import SwiftUI

struct NotificationFeedView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = NotificationsViewModel()
    @State private var isOpeningThread = false
    @State private var openThreadFailed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Notifications")
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.Text.primary)

                Spacer()

                if viewModel.notifications.contains(where: { !$0.isStudioFallback && !$0.isRead }) {
                    Button("Mark all read") {
                        viewModel.markAllRead()
                    }
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                }
            }
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 16)

            content
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the "Notifications" header
        // above carries the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task {
            await viewModel.load()
        }
        .refreshable {
            await viewModel.load()
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if !AuthService.shared.isAuthenticated {
            // Wave 1 E.1: a guest's first look at this feed used to be an
            // error screen. Invite, don't apologize.
            guestInviteView
        } else if viewModel.isLoading && viewModel.notifications.isEmpty {
            loadingView
        } else if let error = viewModel.error, viewModel.notifications.isEmpty {
            errorView(error)
        } else if viewModel.notifications.isEmpty {
            emptyView
        } else {
            // R26: rows live in a plain List (full-bleed, separators hidden —
            // the row draws its own hairline) so native `.swipeActions` work.
            // The API only supports marking opened (no unread reversal), so
            // the swipe exposes a single mark-read action on unread rows.
            // U12: rows are real Buttons (not a bare `.onTapGesture`) so
            // VoiceOver and Switch Control get a proper activation target;
            // the unread dot remains the visible tappable-row affordance.
            List {
                ForEach(viewModel.notifications) { notification in
                    Button {
                        handleTap(notification)
                    } label: {
                        notificationRow(notification)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        if !notification.isRead && !notification.isStudioFallback {
                            Button {
                                viewModel.markRead(notification)
                            } label: {
                                Label("Mark read", systemImage: "envelope.open")
                            }
                            .tint(PatinaColors.clay)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollIndicators(.hidden)
            .contentMargins(.bottom, 120, for: .scrollContent)
        }
    }

    private var loadingView: some View {
        VStack {
            Spacer()
            PatinaLoadingState()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 0) {
            Spacer()
            PatinaEmptyState(
                icon: "bell",
                title: "Nothing yet",
                message: "Updates from your designer will land here.",
                ctaTitle: studioCTATitle,
                ctaAction: presentStudioCTA
            )
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    /// SP-08: offering "Get design help" to a client who has had a designer
    /// for three months is its own insult. The CTA branches on the live
    /// relationship first — the same predicate the thread list and the
    /// Companion read — and only falls back to acquisition at discovering.
    ///
    /// Pure and static so the branch is testable without a live session.
    static func emptyCTATitle(
        relationship: DesignerRelationship,
        hasPromotedRequest: Bool
    ) -> String {
        if relationship.isLive { return "Message your designer" }
        return hasPromotedRequest ? "Track your request" : "Get design help"
    }

    private var studioCTATitle: String {
        if isOpeningThread { return "Opening\u{2026}" }
        if openThreadFailed { return "That didn\u{2019}t go through. Try again." }
        return Self.emptyCTATitle(
            relationship: DesignerThreadOpener.currentRelationship,
            hasPromotedRequest: DesignRequestStatusService.shared.promotedRequest != nil
        )
    }

    private func presentStudioCTA() {
        let relationship = DesignerThreadOpener.currentRelationship
        if relationship.isLive {
            openDesignerThread(relationship)
            return
        }
        if DesignRequestStatusService.shared.promotedRequest != nil {
            coordinator.navigate(to: .designRequests(focusLeadId: nil))
        } else {
            coordinator.navigate(to: .designerConsultation)
        }
    }

    private func openDesignerThread(_ relationship: DesignerRelationship) {
        guard !isOpeningThread else { return }
        isOpeningThread = true
        openThreadFailed = false
        Task {
            do {
                guard let threadId = try await DesignerThreadOpener.openThread(with: relationship) else {
                    isOpeningThread = false
                    return
                }
                isOpeningThread = false
                coordinator.navigate(to: .threadDetail(threadId: threadId))
            } catch {
                // C5: never render a vendor error to a homeowner.
                PatinaLog.ui.debug("[Notifications] open thread failed: \(error.localizedDescription)")
                isOpeningThread = false
                openThreadFailed = true
            }
        }
    }

    /// Guest state: the feed is a signed-in surface, so guests get a quiet
    /// invitation with a sign-in CTA rather than an error (Wave 1 E.1).
    private var guestInviteView: some View {
        VStack(spacing: 0) {
            Spacer()
            PatinaEmptyState(
                icon: "bell",
                title: "Nothing yet",
                message: "Updates from your designer will land here. Sign in to stay in the loop.",
                ctaTitle: "Sign in",
                ctaAction: { coordinator.presentedSheet = .auth }
            )
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .accessibilityIdentifier("NotificationFeedView.GuestInvite")
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 0) {
            Spacer()
            PatinaErrorState(
                message: message,
                action: { Task { await viewModel.load() } }
            )
            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Tap handling

    /// Mark the row opened and, when the entity is recognized, push the
    /// matching detail route through the coordinator. Unknown entity
    /// types fall through with no navigation — the user stays on the
    /// feed but the row is still marked read.
    private func handleTap(_ notification: AppNotification) {
        viewModel.markRead(notification)
        if let route = notification.route {
            coordinator.navigate(to: route)
        }
    }

    // MARK: - Notification Row

    private func notificationRow(_ notification: AppNotification) -> some View {
        HStack(alignment: .top, spacing: 14) {
            // Icon
            ZStack {
                RoundedRectangle(cornerRadius: 11)
                    .fill(notification.iconColor.opacity(0.15))
                    .frame(width: 40, height: 40)

                Image(systemName: notification.icon)
                    .font(.system(size: 17))
                    .foregroundStyle(notification.iconColor)
            }

            // Content
            VStack(alignment: .leading, spacing: 2) {
                Text(notification.title)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)

                if !notification.body.isEmpty {
                    Text(notification.body)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .lineLimit(2)
                }
            }

            Spacer()

            // Trailing column: unread dot above the timestamp. A composed
            // Studio row has neither — it was never delivered, so it has no
            // arrival time and no read state to report (C5).
            VStack(alignment: .trailing, spacing: 6) {
                if !notification.isRead && !notification.isStudioFallback {
                    Circle()
                        .fill(PatinaColors.Text.interactive)
                        .frame(width: 8, height: 8)
                }

                if !notification.isStudioFallback {
                    Text(notification.timeAgo)
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .tracking(0.3)
                }
            }

            // U12: read rows previously had zero visible tap affordance —
            // every row gets the same chevron regardless of read state.
            Image(systemName: "chevron.right")
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(notification.isRead ? Color.clear : PatinaColors.Text.interactive.opacity(0.08))
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                .padding(.leading, 78)
        }
        .contentShape(Rectangle())
        // PT-2-5: collapse title/body/timestamp into one VoiceOver stop.
        // PT-2-8: prefix the combined label with "Unread. " so the read/
        // unread state is audible, mirroring the visible dot.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel(for: notification))
    }

    /// Build the combined VoiceOver label for a notification row, prefixing
    /// unread rows with "Unread. " so state is announced first (PT-2-8).
    private func accessibilityLabel(for notification: AppNotification) -> String {
        var parts: [String] = []
        if !notification.isRead {
            parts.append("Unread.")
        }
        parts.append(notification.title)
        if !notification.body.isEmpty {
            parts.append(notification.body)
        }
        parts.append(notification.timeAgo)
        return parts.joined(separator: " ")
    }
}

#Preview {
    NotificationFeedView()
}
