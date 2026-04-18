//
//  NotificationFeedView.swift
//  Patina
//
//  Notification feed with typed notifications and read states
//

import SwiftUI

struct NotificationFeedView: View {
    @State private var notifications = AppNotification.mockNotifications

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Notifications")
                    .font(PatinaTypography.h3)
                    .foregroundColor(PatinaColors.charcoal)

                Spacer()

                Button("Mark all read") {
                    for i in notifications.indices {
                        notifications[i].isRead = true
                    }
                }
                .font(PatinaTypography.uiSmall)
                .foregroundColor(PatinaColors.clay)
            }
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 16)

            // Notification list
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(notifications) { notification in
                        notificationRow(notification)
                    }
                }
                .padding(.bottom, 120)
            }
        }
        .background(PatinaColors.offWhite)
        .navigationBarTitleDisplayMode(.inline)
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

                Text(notification.body)
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
                    .lineLimit(2)
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
    }
}

#Preview {
    NotificationFeedView()
}
