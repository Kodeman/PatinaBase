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

        let isUnread = Self.isUnread(summary, me: me)

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

    /// Unread predicate: the latest message is from someone else and is
    /// newer than my own participant row's `last_read_at` (mirrors
    /// `rpc_unread_summary`'s predicate). Internal so `BadgeCountService`
    /// counts unread threads with the exact same rule as this inbox.
    static func isUnread(_ summary: RemoteCommsThreadSummary, me: String?) -> Bool {
        guard let latest = summary.latestMessage,
              latest.sender_id?.lowercased() != me,
              let messageDate = CommsDates.parse(latest.created_at) else {
            return false
        }
        let myRow = summary.activeParticipants.first { $0.profile_id.lowercased() == me }
        let lastRead = CommsDates.parse(myRow?.last_read_at) ?? .distantPast
        return messageDate > lastRead
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

    /// Lowercased profile id of the signed-in user. Internal so
    /// `BadgeCountService` resolves "me" the same way this inbox does.
    static func currentUserId() -> String? {
        try? SupabaseClientManager.shared.client.auth.currentUser?.id.uuidString.lowercased()
    }
}

// MARK: - Thread detail

/// Who the client is talking to, and about what.
///
/// `C-13`: the whole accessibility tree of the thread was `Back`, a day
/// separator, one system line, the composer and Send. No title, no name, no
/// avatar — after arriving from a button labelled "Message your designer". The
/// screen said `.patinaScreen(title: nil)` and its own comment conceded it:
/// *"chrome title left nil rather than inventing unsanctioned copy; a
/// per-thread title is a follow-up."*
struct ThreadHeader: Equatable {
    /// The counterpart's name, or nil when the thread has none to give.
    let name: String?
    /// The project the thread hangs off, when it has one.
    let projectName: String?

    /// What the app calls this conversation when it cannot name a person.
    static let unnamed = "Your designer"

    var title: String { name ?? Self.unnamed }

    /// Up to two initials for the avatar. Empty when there is no name, and the
    /// avatar then draws the app's own mark rather than a made-up letter.
    var initials: String {
        guard let name else { return "" }
        return name
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first.map(String.init) }
            .joined()
            .uppercased()
    }

    /// Build from the thread summary the inbox already fetches. Purely a
    /// projection, so it can be tested without a session.
    static func from(summary: RemoteCommsThreadSummary, me: String?, names: [String: String]) -> ThreadHeader {
        let counterpart = summary.activeParticipants.first { $0.profile_id.lowercased() != me }
        let name = counterpart.flatMap { names[$0.profile_id.lowercased()] }
        return ThreadHeader(name: name, projectName: summary.projects?.name)
    }
}

/// What belongs in a transcript a homeowner reads.
///
/// `C-14`: the thread's only content was `"Project conversation opened."` — a
/// system row `rpc_start_project_thread` INSERTs so the record stays legible to
/// the designer (`00103_comms_rpcs.sql:167`, re-emitted at
/// `00540_direct_orders_attribution.sql:702`). It is production reality, not a
/// local seed artefact, and it is bookkeeping addressed to the studio. Under it
/// sat ~600 pt of dead space and then the composer.
enum ThreadTranscript {

    /// The audit lines the backend seeds. Matched exactly rather than by
    /// `system` alone: a system row that actually tells the client something
    /// still belongs on screen.
    static let auditLines: Set<String> = ["Project conversation opened."]

    static func isAudit(_ message: RemoteCommsMessage) -> Bool {
        message.system && auditLines.contains(message.body.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    static func visible(_ messages: [RemoteCommsMessage]) -> [RemoteCommsMessage] {
        messages.filter { !isAudit($0) }
    }

    /// The invitation that replaces it. It says who and what, and claims
    /// nothing about how fast anyone answers — the app cannot know that.
    static func emptyTitle(counterpart: String?) -> String {
        guard let counterpart, !counterpart.isEmpty else { return "Say hello" }
        return "Say hello to \(counterpart.split(separator: " ").first.map(String.init) ?? counterpart)"
    }

    static let emptyMessage = "Messages here go straight to your designer."
}

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
    /// The LOAD failure. Rendered in place of the transcript, because there is
    /// no transcript to render.
    var error: String?
    /// The SEND failure, which is a different thing on a different part of the
    /// screen (`C4-04`, `L07-03`).
    ///
    /// One `error` could not be both. `ThreadDetailView` rendered it at exactly
    /// one place — `} else if let error = viewModel.error, viewModel.messages
    /// .isEmpty {` — and every real thread has messages, because the backend
    /// seeds one (`00103_comms_rpcs.sql:167`). So a send that failed restored
    /// the draft and set a message nothing could draw: twelve seconds of
    /// nothing, then, after `URLSession.shared`'s 60 s timeout, the sentence
    /// silently reappearing in the composer.
    var sendError: String?
    /// The last body a failed send was carrying, so Retry re-sends THAT rather
    /// than whatever is in the composer now.
    private(set) var failedSendBody: String?
    private(set) var header: ThreadHeader?

    /// The transcript minus the studio's own bookkeeping (`C-14`).
    var visibleMessages: [RemoteCommsMessage] { ThreadTranscript.visible(messages) }

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
        await loadHeader()
    }

    /// Who this conversation is with (`C-13`).
    ///
    /// Read from the summaries `BadgeCountService` has already fetched when it
    /// has them, and from the inbox's own existing round trip when it does not.
    /// No new client method: `Core/Network/MessagingAPIClient.swift` is another
    /// lane's file this wave, and `listThreadSummaries()` already carries the
    /// participants and the project name.
    func loadHeader() async {
        let me = ThreadListViewModel.currentUserId()
        var summary = BadgeCountService.shared.threadSummaries.first { $0.id == threadId }
        if summary == nil {
            summary = try? await MessagingAPIClient.shared.listThreadSummaries()
                .first { $0.id == threadId }
        }
        guard let summary else { return }

        let counterpartIds = summary.activeParticipants
            .filter { $0.profile_id.lowercased() != me }
            .map(\.profile_id)
        let names = counterpartIds.isEmpty
            ? [:]
            : await ProfileLookupService.shared.names(for: counterpartIds)
        header = ThreadHeader.from(summary: summary, me: me, names: names)
    }

    func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }
        draft = ""
        await send(body: trimmed)
    }

    /// Send the body a failed attempt was carrying, not whatever is in the
    /// composer now — the person may have typed something else while the first
    /// one was in the air.
    func retrySend() async {
        guard let body = failedSendBody, !isSending else { return }
        await send(body: body)
    }

    private func send(body: String) async {
        isSending = true
        sendError = nil
        do {
            let saved = try await MessagingAPIClient.shared.sendMessage(threadId: threadId, body: body)
            // Optimistic append; the realtime echo will be deduped by id
            // in `apply(remote:)`.
            apply(remote: saved)
            failedSendBody = nil
            if draft == body { draft = "" }
        } catch {
            // Restore the draft so the user doesn't lose what they typed, and
            // SAY so — the restore alone is what read as the message silently
            // reappearing a minute later (L07-03).
            if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { draft = body }
            failedSendBody = body
            sendError = Self.sendFailureLine
            #if DEBUG
            PatinaLog.ui.error("[Messaging] send failed: \(error.localizedDescription)")
            #endif
        }
        isSending = false
    }

    /// The invoice screen's failure banner is the model: one sentence that says
    /// nothing was lost, and a recovery beside it. It names no vendor and no
    /// server string.
    static let sendFailureLine = "We couldn't send that. Nothing was lost — your message is still here."

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
