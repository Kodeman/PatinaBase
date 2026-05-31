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

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Notifications")
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.charcoal)

                Spacer()

                if !viewModel.notifications.isEmpty {
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
        .background(PatinaColors.offWhite)
        .toolbarTitleDisplayMode(.inline)
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
        if viewModel.isLoading && viewModel.notifications.isEmpty {
            loadingView
        } else if let error = viewModel.error, viewModel.notifications.isEmpty {
            errorView(error)
        } else if viewModel.notifications.isEmpty {
            emptyView
        } else {
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.notifications) { notification in
                        notificationRow(notification)
                            .onTapGesture {
                                handleTap(notification)
                            }
                    }
                }
                .padding(.bottom, 120)
            }
        }
    }

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .tint(PatinaColors.Text.interactive)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "bell.slash")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.agedOak)
            Text("You're all caught up")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.mocha)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.agedOak)
            Text(message)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.mocha)
                .multilineTextAlignment(.center)
            Button("Let's try that again") {
                Task { await viewModel.load() }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
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
        if let route = NotificationRouter.route(for: notification) {
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
                    .foregroundStyle(PatinaColors.charcoal)

                if !notification.body.isEmpty {
                    Text(notification.body)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.agedOak)
                        .lineLimit(2)
                }
            }

            Spacer()

            // Trailing column: unread dot above the timestamp.
            VStack(alignment: .trailing, spacing: 6) {
                if !notification.isRead {
                    Circle()
                        .fill(PatinaColors.clayDeep)
                        .frame(width: 8, height: 8)
                }

                Text(notification.timeAgo)
                    .font(PatinaTypography.monoTiny)
                    .foregroundStyle(PatinaColors.agedOak)
                    .tracking(0.3)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(notification.isRead ? Color.clear : PatinaColors.clayDeep.opacity(0.08))
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
