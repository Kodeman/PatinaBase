//
//  NotificationsViewModel.swift
//  Patina
//
//  Loads notifications from Supabase `notification_log` and exposes them
//  to `NotificationFeedView`. Owns the optimistic mark-read UI state.
//

import SwiftUI

@Observable
@MainActor
final class NotificationsViewModel {

    // MARK: - State

    var notifications: [AppNotification] = []
    var isLoading: Bool = false
    var error: String?

    // MARK: - Loading

    func load() async {
        // Wave 1 E.1: a guest has no notification_log rows — the request
        // would only 401 into an error screen. Resolve to empty without a
        // round trip; the feed view renders a sign-in invitation instead.
        guard AuthService.shared.isAuthenticated else {
            notifications = []
            error = nil
            isLoading = false
            return
        }
        isLoading = true
        error = nil
        do {
            let remote = try await NotificationsAPIClient.shared.list()
            self.notifications = remote.map { AppNotification(from: $0) }
            self.isLoading = false
        } catch {
            self.error = "Couldn't load notifications"
            self.isLoading = false
            #if DEBUG
            PatinaLog.ui.error("[Notifications] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: - Actions

    /// Optimistically mark a single notification as read and PATCH the
    /// backend. Rolls back on failure.
    func markRead(_ notification: AppNotification) {
        guard !notification.isRead else { return }
        let previous = notifications
        if let idx = notifications.firstIndex(where: { $0.id == notification.id }) {
            notifications[idx].isRead = true
        }
        guard let remoteId = notification.remoteId else { return }
        Task {
            do {
                try await NotificationsAPIClient.shared.markOpened(id: remoteId)
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[Notifications] markOpened failed: \(error.localizedDescription)")
                #endif
                await MainActor.run { self.notifications = previous }
            }
        }
    }

    /// Optimistically mark all visible notifications as read and PATCH the
    /// backend. Rolls back on failure.
    func markAllRead() {
        let previous = notifications
        notifications = notifications.map {
            var copy = $0
            copy.isRead = true
            return copy
        }
        Task {
            do {
                try await NotificationsAPIClient.shared.markAllOpened()
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[Notifications] markAllOpened failed: \(error.localizedDescription)")
                #endif
                await MainActor.run { self.notifications = previous }
            }
        }
    }
}
