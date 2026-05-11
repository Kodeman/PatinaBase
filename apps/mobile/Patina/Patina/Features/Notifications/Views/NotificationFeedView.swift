//
//  NotificationFeedView.swift
//  Patina
//
//  Notification feed backed by `notification_log` via NotificationsAPIClient.
//

import SwiftUI

struct NotificationFeedView: View {
    @State private var viewModel = NotificationsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Notifications")
                    .font(PatinaTypography.h3)
                    .foregroundColor(PatinaColors.charcoal)

                Spacer()

                if !viewModel.notifications.isEmpty {
                    Button("Mark all read") {
                        viewModel.markAllRead()
                    }
                    .font(PatinaTypography.uiSmall)
                    .foregroundColor(PatinaColors.clay)
                }
            }
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 16)

            content
        }
        .background(PatinaColors.offWhite)
        .navigationBarTitleDisplayMode(.inline)
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
                                viewModel.markRead(notification)
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
                .tint(PatinaColors.clay)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "bell.slash")
                .font(.system(size: 28))
                .foregroundColor(PatinaColors.agedOak)
            Text("You're all caught up")
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.mocha)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundColor(PatinaColors.agedOak)
            Text(message)
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.mocha)
                .multilineTextAlignment(.center)
            Button("Try Again") {
                Task { await viewModel.load() }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundColor(PatinaColors.clay)
            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity)
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
                    .foregroundColor(notification.iconColor)
            }

            // Content
            VStack(alignment: .leading, spacing: 2) {
                Text(notification.title)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundColor(PatinaColors.charcoal)

                if !notification.body.isEmpty {
                    Text(notification.body)
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.agedOak)
                        .lineLimit(2)
                }
            }

            Spacer()

            // Timestamp
            Text(notification.timeAgo)
                .font(PatinaTypography.monoTiny)
                .foregroundColor(PatinaColors.agedOak)
                .tracking(0.3)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(notification.isRead ? Color.clear : PatinaColors.clay.opacity(0.04))
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                .padding(.leading, 78)
        }
        .contentShape(Rectangle())
    }
}

#Preview {
    NotificationFeedView()
}
