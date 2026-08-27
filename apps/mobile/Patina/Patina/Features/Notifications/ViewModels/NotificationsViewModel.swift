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
            let real = Self.collapseDuplicates(remote.map { AppNotification(from: $0) })
            // SP-08: the bell read "Nothing yet" in the same minute the Studio
            // two screens away listed an overdue decision, a $4,250 invoice and
            // a proposal to review, because invoices and decisions write no
            // client-facing notification_log row at all. Falling back to the
            // Studio's OWN computation means the two surfaces cannot contradict
            // each other, whatever the backend has or hasn't written yet.
            self.notifications = Self.merge(real: real, fallback: Self.currentFallbackRows())
            self.isLoading = false
        } catch {
            self.error = "Couldn't load notifications"
            self.isLoading = false
            #if DEBUG
            PatinaLog.ui.error("[Notifications] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    /// 00534 writes TWO rows per event — `in_app`/`delivered` and
    /// `push`/`queued` — and the feed's channel filter admits both, so every
    /// decision printed twice on the walk. One event is one row in the bell:
    /// collapse on `entity_type|entity_id`, keeping the first (the list is
    /// ordered `created_at desc`) and preferring a row that is already read so
    /// the unread dot cannot come back after it is dismissed.
    static func collapseDuplicates(_ rows: [AppNotification]) -> [AppNotification] {
        var seen = Set<String>()
        var collapsed: [AppNotification] = []
        for row in rows {
            guard let entityType = row.entityType, let entityId = row.entityId else {
                collapsed.append(row)
                continue
            }
            let key = "\(entityType)|\(entityId)"
            if seen.insert(key).inserted {
                collapsed.append(row)
            } else if row.isRead, let index = collapsed.firstIndex(where: {
                $0.entityType == entityType && $0.entityId == entityId
            }) {
                collapsed[index].isRead = true
            }
        }
        return collapsed
    }

    // MARK: - Studio fallback (SP-08)

    /// Build the fallback from whatever `BadgeCountService` has already
    /// fetched — the same rows the Studio hub is built from, so no second
    /// round trip and no second opinion.
    static func currentFallbackRows(now: Date = Date()) -> [AppNotification] {
        let badges = BadgeCountService.shared
        let snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: badges.projects,
                decisions: badges.pendingDecisions,
                proposals: badges.pendingProposals,
                invoices: badges.payableInvoices,
                documents: [],
                threads: badges.threadSummaries,
                notifications: [],
                currentUserId: nil,
                now: now
            )
        )
        return fallbackRows(from: snapshot, now: now)
    }

    /// Map the Studio's "Awaiting you" section onto feed rows. Each carries
    /// the section row's own title, detail, meta and route, so tapping the
    /// bell lands exactly where tapping the Studio would.
    static func fallbackRows(from snapshot: StudioQueueSnapshot, now: Date = Date()) -> [AppNotification] {
        snapshot.section(.awaitingYou).rows.compactMap { row in
            guard let type = fallbackType(for: row.route) else { return nil }
            let body = [row.detail, row.meta]
                .compactMap { $0?.isEmpty == false ? $0 : nil }
                .joined(separator: " · ")
            return AppNotification(
                type: type,
                title: row.title,
                body: body,
                timestamp: now,
                // Composed here, so it has no unread state to report.
                isRead: true,
                entityType: type.entityType,
                entityId: row.id,
                isStudioFallback: true,
                fallbackRoute: row.route
            )
        }
    }

    private static func fallbackType(for route: AppRoute) -> AppNotificationType? {
        switch route {
        case .invoiceList, .invoiceDetail: return .invoice
        case .decisionList, .decisionDetail: return .decision
        case .proposalList, .proposalDetail: return .proposal
        default: return nil
        }
    }

    /// A real row always wins: where the backend has written about a kind of
    /// thing, the aggregate stand-in for that kind does not also draw. This is
    /// the plank's own stated risk — "duplicate or contradictory rows if both
    /// the fallback and the log rows render".
    static func merge(real: [AppNotification], fallback: [AppNotification]) -> [AppNotification] {
        guard !real.isEmpty else { return fallback }
        let covered = Set(real.compactMap(\.entityType))
        let surviving = fallback.filter { row in
            guard let entityType = row.entityType else { return false }
            return !covered.contains(entityType)
        }
        return real + surviving
    }

    // MARK: - Actions

    /// Optimistically mark a single notification as read and PATCH the
    /// backend. Rolls back on failure.
    func markRead(_ notification: AppNotification) {
        guard !notification.isStudioFallback else { return }
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
            if !copy.isStudioFallback { copy.isRead = true }
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
