//
//  MessagingViewModel.swift
//  Patina
//
//  Client↔designer messaging. Thread list + thread detail with
//  composer. Distinct from Companion (AI) — these are human↔human
//  threads from `comms_threads`.
//

import SwiftUI
import Supabase

// MARK: - Thread list

/// Fully-resolved inbox row: counterpart name, last-message preview,
/// compact relative time, and unread state. Built off the single
/// `listThreadSummaries` round trip + one batched profile lookup so no
/// raw ids or ISO timestamps ever reach the view.
struct ThreadListItem: Identifiable {
    let id: String
    let title: String
    let preview: String
    let timeLabel: String?
    let isUnread: Bool
    let accessibilityLabel: String
}

@Observable
@MainActor
final class ThreadListViewModel {
    var items: [ThreadListItem] = []
    var isLoading: Bool = false
    var error: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            let summaries = try await MessagingAPIClient.shared.listThreadSummaries()
            self.items = await Self.buildItems(from: summaries)
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[Messaging] thread summaries failed: \(error.localizedDescription)")
            #endif
            // Fall back to the plain thread list so the inbox still
            // renders if the embedded query is unavailable.
            await loadPlainThreads()
        }
        isLoading = false
    }

    /// Degraded path: titles from thread.title/kind, no previews or
    /// unread state — matches the pre-enrichment behavior.
    private func loadPlainThreads() async {
        do {
            let threads = try await MessagingAPIClient.shared.listThreads()
            self.items = threads.map { thread in
                let time = CommsDates.compactLabel(for: CommsDates.parse(thread.last_message_at))
                let title = thread.title ?? Self.fallbackTitle(forKind: thread.kind)
                return ThreadListItem(
                    id: thread.id,
                    title: title,
                    preview: "",
                    timeLabel: time,
                    isUnread: false,
                    accessibilityLabel: Self.axLabel(
                        title: title,
                        preview: nil,
                        date: CommsDates.parse(thread.last_message_at),
                        isUnread: false
                    )
                )
            }
        } catch {
            self.error = "Couldn't load conversations"
            #if DEBUG
            PatinaLog.ui.error("[Messaging] threads failed: \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: Row building

    private static func buildItems(from summaries: [RemoteCommsThreadSummary]) async -> [ThreadListItem] {
        let me = currentUserId()

        // One batched lookup for every counterpart on a two-person thread.
        var counterpartIds: [String] = []
        for summary in summaries where summary.kind == "direct" || summary.kind == "vendor_brief" {
            if let other = counterpart(of: summary, me: me) {
                counterpartIds.append(other.profile_id)
            }
        }
        let names = await ProfileLookupService.shared.names(for: counterpartIds)

        return summaries.map { item(from: $0, me: me, names: names) }
    }

    private static func item(
        from summary: RemoteCommsThreadSummary,
        me: String?,
        names: [String: String]
    ) -> ThreadListItem {
        // Title: counterpart name for 1:1 threads, project name for
        // project threads, with graceful fallbacks throughout.
        let title: String
        switch summary.kind {
        case "direct", "vendor_brief":
            let counterpartName = counterpart(of: summary, me: me)
                .flatMap { names[$0.profile_id.lowercased()] }
            title = counterpartName ?? summary.title ?? fallbackTitle(forKind: summary.kind)
        case "project":
            title = summary.title ?? summary.projects?.name ?? fallbackTitle(forKind: summary.kind)
        default:
            title = summary.title ?? fallbackTitle(forKind: summary.kind)
        }

        // Preview: latest message body, "You: " prefixed for own sends.
        let latest = summary.latestMessage
        let preview: String
        if let latest {
            if latest.deleted_at != nil {
                preview = "Message removed"
            } else if latest.system {
                preview = latest.body
            } else if let me, latest.sender_id?.lowercased() == me {
                preview = "You: \(latest.body)"
            } else {
                preview = latest.body
            }
        } else {
            preview = "No messages yet"
        }

        // Unread: latest message is from someone else and is newer than
        // my own participant row's last_read_at (mirrors
        // rpc_unread_summary's predicate).
        var isUnread = false
        if let latest, latest.sender_id?.lowercased() != me,
           let messageDate = CommsDates.parse(latest.created_at) {
            let myRow = summary.activeParticipants.first { $0.profile_id.lowercased() == me }
            let lastRead = CommsDates.parse(myRow?.last_read_at) ?? .distantPast
            isUnread = messageDate > lastRead
        }

        let lastDate = CommsDates.parse(summary.last_message_at)
            ?? CommsDates.parse(latest?.created_at)

        return ThreadListItem(
            id: summary.id,
            title: title,
            preview: preview,
            timeLabel: CommsDates.compactLabel(for: lastDate),
            isUnread: isUnread,
            accessibilityLabel: axLabel(title: title, preview: preview, date: lastDate, isUnread: isUnread)
        )
    }

    private static func counterpart(
        of summary: RemoteCommsThreadSummary,
        me: String?
    ) -> RemoteCommsParticipant? {
        summary.activeParticipants.first { $0.profile_id.lowercased() != me }
    }

    private static func fallbackTitle(forKind kind: String) -> String {
        switch kind {
        case "direct": return "Direct message"
        case "project": return "Project thread"
        case "vendor_brief": return "Vendor brief"
        case "support": return "Support"
        default: return kind.capitalized
        }
    }

    private static func axLabel(title: String, preview: String?, date: Date?, isUnread: Bool) -> String {
        var parts: [String] = [title]
        if isUnread { parts.append("unread") }
        if let preview, !preview.isEmpty { parts.append(preview) }
        if let spoken = CommsDates.accessibleLabel(for: date) { parts.append(spoken) }
        return parts.joined(separator: ", ")
    }

    private static func currentUserId() -> String? {
        try? SupabaseClientManager.shared.client.auth.currentUser?.id.uuidString.lowercased()
    }
}

// MARK: - Thread detail

@Observable
@MainActor
final class ThreadDetailViewModel {
    let threadId: String
    var messages: [RemoteCommsMessage] = []
    /// Resolved sender display names keyed by lowercased profile id.
    var senderNames: [String: String] = [:]
    var draft: String = ""
    var isLoading: Bool = false
    var isSending: Bool = false
    var error: String?

    /// Realtime channel for live INSERTs on `comms_messages` for this
    /// thread. Held as `nonisolated(unsafe)` because it's only mutated on
    /// MainActor (`startLiveUpdates`/`stopLiveUpdates`) and the listener
    /// task that reads from its stream runs on MainActor as well.
    private var realtime: MessagingRealtimeService?
    private var realtimeTask: Task<Void, Never>?

    init(threadId: String) {
        self.threadId = threadId
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            self.messages = try await MessagingAPIClient.shared.listMessages(threadId: threadId)
            try? await MessagingAPIClient.shared.markRead(threadId: threadId)
            await resolveSenderNames(for: self.messages)
        } catch {
            self.error = "Couldn't load messages"
            #if DEBUG
            PatinaLog.ui.error("[Messaging] thread load failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }

    func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }
        isSending = true
        let body = trimmed
        draft = ""
        do {
            let saved = try await MessagingAPIClient.shared.sendMessage(threadId: threadId, body: body)
            // Optimistic append; the realtime echo will be deduped by id
            // in `apply(remote:)`.
            apply(remote: saved)
        } catch {
            // Restore the draft so the user doesn't lose what they typed.
            draft = body
            self.error = "Couldn't send"
            #if DEBUG
            PatinaLog.ui.error("[Messaging] send failed: \(error.localizedDescription)")
            #endif
        }
        isSending = false
    }

    /// Open a Supabase Realtime subscription for new messages on this
    /// thread. Safe to call repeatedly — the prior subscription is
    /// replaced. Call `stopLiveUpdates()` when the view disappears.
    func startLiveUpdates() {
        // If we already have a running listener, leave it alone so we
        // don't churn the websocket on .task re-fires.
        if realtimeTask != nil { return }

        let service = realtime ?? MessagingRealtimeService()
        self.realtime = service

        let stream = service.subscribe(threadId: threadId)
        realtimeTask = Task { [weak self] in
            for await message in stream {
                guard let self else { return }
                self.apply(remote: message)
            }
        }
    }

    /// Tear down the Realtime subscription. Idempotent.
    func stopLiveUpdates() {
        realtimeTask?.cancel()
        realtimeTask = nil
        if let service = realtime {
            Task { await service.stop() }
        }
        realtime = nil
    }

    /// Append-or-replace by `id`. Used by both optimistic local sends and
    /// the realtime echo of those same rows; whichever arrives first
    /// wins, the second is treated as an update.
    private func apply(remote message: RemoteCommsMessage) {
        if let idx = messages.firstIndex(where: { $0.id == message.id }) {
            messages[idx] = message
        } else {
            messages.append(message)
        }
        // Resolve a not-yet-seen sender (e.g. someone added mid-thread)
        // so their name label appears without a reload.
        if let sender = message.sender_id?.lowercased(), senderNames[sender] == nil {
            Task { await resolveSenderNames(for: [message]) }
        }
    }

    /// Batch-resolve display names for every distinct sender in the
    /// given messages and merge them into `senderNames`.
    private func resolveSenderNames(for messages: [RemoteCommsMessage]) async {
        let ids = Set(messages.compactMap { $0.sender_id?.lowercased() })
            .filter { senderNames[$0] == nil }
        guard !ids.isEmpty else { return }
        let resolved = await ProfileLookupService.shared.names(for: Array(ids))
        for (id, name) in resolved {
            senderNames[id] = name
        }
    }
}
