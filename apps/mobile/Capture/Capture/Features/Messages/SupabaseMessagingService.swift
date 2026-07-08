//  SupabaseMessagingService.swift
//  Capture · Wave M (Messages)
//
//  Real MessagingService: reads/writes `comms_threads`, `comms_messages`, and
//  `comms_thread_participants` (migrations 00101–00103). RLS gates every
//  read/write to active thread participants (00102's is_comms_thread_participant)
//  — no client-side role filtering. Ports the reference app's
//  MessagingAPIClient + MessagingRealtimeService (apps/mobile/Patina/Patina/
//  Core/Network/MessagingAPIClient.swift, Features/Messaging/Services/
//  MessagingRealtimeService.swift, Services/API/ProfileLookupService.swift)
//  onto the supabase-swift SDK this app already uses (SupabaseSessionService /
//  SupabaseCaptureGateway idiom) instead of the reference's hand-rolled
//  URLSession calls.
//
//  MainActor-isolated (like LocalCaptureSyncService) so it can hold the
//  (@MainActor) SessionProviding directly without hopping on every call.
//  `observeMessages` is the protocol's one non-async member and must be
//  `nonisolated` to satisfy it; `client` is `nonisolated let` (Sendable,
//  immutable) so that one function can build the Realtime channel without an
//  actor hop, while the per-message work still hops to MainActor via `await`
//  to read `session`.

import Foundation
import Supabase
import CaptureKit

enum MessagingServiceError: LocalizedError {
    case notAuthenticated

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "You need to be signed in to send a message."
        }
    }
}

@MainActor
final class SupabaseMessagingService: MessagingService {
    private nonisolated let client: SupabaseClient
    private let session: any SessionProviding

    init(client: SupabaseClient, session: any SessionProviding) {
        self.client = client
        self.session = session
    }

    // MARK: - Threads (M1)

    /// Mirrors the reference's `listThreadSummaries()`: one embedded round
    /// trip for the latest message (desc, limit 1), the participant rows
    /// (unread dot + counterpart id), and the project name.
    func listThreads() async throws -> [FieldThread] {
        let select = "id,kind,title,last_message_at,"
            + "comms_messages(sender_id,body,system,created_at,deleted_at),"
            + "comms_thread_participants(profile_id,last_read_at,left_at),"
            + "projects(name)"
        let rows: [CommsThreadSummaryRow] = try await client
            .from("comms_threads")
            .select(select)
            .order("created_at", ascending: false, referencedTable: "comms_messages")
            .limit(1, referencedTable: "comms_messages")
            .order("last_message_at", ascending: false)
            .limit(50)
            .execute()
            .value

        let me = session.userID
        let counterpartIDs: [String] = rows.compactMap { row in
            guard row.kind == "direct" || row.kind == "vendor_brief" else { return nil }
            return counterpart(of: row, me: me)?.profileID
        }
        let names = await resolveNames(for: Set(counterpartIDs))

        return rows.map { row in
            FieldThread(
                id: row.id,
                title: title(for: row, me: me, names: names),
                lastMessagePreview: previewText(for: row.latestMessage, me: me),
                lastMessageAt: MessagesDateFormat.parse(row.lastMessageAt)
                    ?? MessagesDateFormat.parse(row.latestMessage?.createdAt),
                unread: isUnread(row, me: me)
            )
        }
    }

    // MARK: - Messages (M2)

    /// Mark-read ruling: the frozen protocol has no mark-read member. M2
    /// calls `messages(threadID:)` on appear, which IS the read moment, so
    /// stamp the caller's participant row here as a documented side effect —
    /// this is what clears M1's unread dot on return. Mirrors the
    /// reference's `markRead(threadId:)`, using the `rpc_mark_thread_read`
    /// RPC (00103) instead of a raw PATCH: it's atomic, participant-scoped
    /// server-side, and matches this app's existing RPC idiom
    /// (SupabaseCaptureGateway). Best-effort — a failed stamp (e.g. offline)
    /// must not block showing messages already fetched.
    func messages(threadID: String) async throws -> [FieldMessage] {
        let rows: [CommsMessageRow] = try await client
            .from("comms_messages")
            .select("id,thread_id,sender_id,body,system,created_at,deleted_at")
            .eq("thread_id", value: threadID)
            .order("created_at", ascending: true)
            .execute()
            .value

        let me = session.userID
        let senderIDs = Set(rows.compactMap { $0.system ? nil : $0.senderID })
        let names = await resolveNames(for: senderIDs)

        try? await markThreadRead(threadID: threadID)

        return rows.map { $0.asFieldMessage(myUserID: me, names: names) }
    }

    /// Inserts the row; `comms_messages_bump_activity` (00101) updates the
    /// thread's `last_message_at` server-side via trigger, so no client-side
    /// thread bump is needed here.
    func send(threadID: String, text: String) async throws -> FieldMessage {
        guard let uid = session.userID else { throw MessagingServiceError.notAuthenticated }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload = SendMessagePayload(threadID: threadID, senderID: uid, body: trimmed)
        let row: CommsMessageRow = try await client
            .from("comms_messages")
            .insert(payload)
            .select("id,thread_id,sender_id,body,system,created_at,deleted_at")
            .single()
            .execute()
            .value
        let myName = session.displayName ?? "You"
        return row.asFieldMessage(myUserID: uid, names: [uid.lowercased(): myName])
    }

    // MARK: - Live tail

    /// Realtime `postgres_changes` INSERT tail on `comms_messages`, filtered
    /// to this thread. CAVEAT: `comms_messages`' membership in the
    /// `supabase_realtime` publication is deployment-level and unverified in
    /// migrations (only `public.profiles` is added explicitly, 00183) — this
    /// still wires postgres_changes per the brief (the reference relies on
    /// the same mechanism in production), but M2 does not depend on it:
    /// `send()` already appends optimistically, and the screen does a
    /// lightweight re-fetch on foreground/appear so the thread stays usable
    /// if the subscription never yields anything.
    nonisolated func observeMessages(threadID: String) -> AsyncStream<FieldMessage> {
        AsyncStream { continuation in
            let channel = client.realtimeV2.channel("comms_messages:thread=\(threadID)")
            let changes = channel.postgresChange(
                InsertAction.self,
                schema: "public",
                table: "comms_messages",
                filter: .eq("thread_id", value: threadID)
            )
            let task = Task {
                let myID = await session.userID
                var names: [String: String] = [:]
                if let myID, let myName = await session.displayName {
                    names[myID.lowercased()] = myName
                }
                await channel.subscribe()
                let decoder = JSONDecoder()
                for await action in changes {
                    if Task.isCancelled { break }
                    guard let row = try? action.decodeRecord(as: CommsMessageRow.self, decoder: decoder) else {
                        continue
                    }
                    if let senderID = row.senderID, !row.system, names[senderID.lowercased()] == nil {
                        let resolved = await resolveNames(for: [senderID])
                        names.merge(resolved) { _, new in new }
                    }
                    continuation.yield(row.asFieldMessage(myUserID: myID, names: names))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                task.cancel()
                Task { await channel.unsubscribe() }
            }
        }
    }

    // MARK: - Mark-read RPC

    private func markThreadRead(threadID: String) async throws {
        try await client
            .rpc("rpc_mark_thread_read", params: MarkThreadReadParams(threadID: threadID))
            .execute()
    }

    // MARK: - Profile name resolution (batched, mirrors ProfileLookupService)

    private func resolveNames(for ids: Set<String>) async -> [String: String] {
        guard !ids.isEmpty else { return [:] }
        do {
            let rows: [ProfileNameRow] = try await client
                .from("profiles")
                .select("id,display_name,full_name")
                .in("id", values: Array(ids))
                .execute()
                .value
            var result: [String: String] = [:]
            for row in rows {
                if let name = row.displayName, !name.isEmpty {
                    result[row.id.lowercased()] = name
                } else if let name = row.fullName, !name.isEmpty {
                    result[row.id.lowercased()] = name
                }
            }
            return result
        } catch {
            return [:]
        }
    }

    // MARK: - Thread-row shaping (mirrors ThreadListViewModel)

    private func counterpart(of row: CommsThreadSummaryRow, me: String?) -> CommsParticipantRow? {
        row.activeParticipants.first { $0.profileID.lowercased() != me?.lowercased() }
    }

    private func title(for row: CommsThreadSummaryRow, me: String?, names: [String: String]) -> String {
        switch row.kind {
        case "direct", "vendor_brief":
            let counterpartName = counterpart(of: row, me: me).flatMap { names[$0.profileID.lowercased()] }
            return counterpartName ?? row.title ?? fallbackTitle(row.kind)
        case "project":
            return row.title ?? row.projects?.name ?? fallbackTitle(row.kind)
        default:
            return row.title ?? fallbackTitle(row.kind)
        }
    }

    private func fallbackTitle(_ kind: String) -> String {
        switch kind {
        case "direct": return "Direct message"
        case "project": return "Project thread"
        case "vendor_brief": return "Vendor brief"
        case "support": return "Support"
        default: return kind.capitalized
        }
    }

    /// "You: <body>" for own sends, "Message removed" for soft-deletes, the
    /// system body verbatim for system messages, else the plain body.
    private func previewText(for latest: CommsMessagePreviewRow?, me: String?) -> String? {
        guard let latest else { return nil }
        if latest.deletedAt != nil { return "Message removed" }
        if latest.system { return latest.body }
        if let me, latest.senderID?.lowercased() == me.lowercased() { return "You: \(latest.body)" }
        return latest.body
    }

    /// Unread iff the latest message is from someone else and newer than my
    /// own participant row's `last_read_at` — mirrors `rpc_unread_summary`'s
    /// predicate (00103).
    private func isUnread(_ row: CommsThreadSummaryRow, me: String?) -> Bool {
        guard let latest = row.latestMessage,
              latest.senderID?.lowercased() != me?.lowercased(),
              let messageDate = MessagesDateFormat.parse(latest.createdAt) else { return false }
        let myRow = row.activeParticipants.first { $0.profileID.lowercased() == me?.lowercased() }
        let lastRead = myRow?.lastReadAt.flatMap { MessagesDateFormat.parse($0) } ?? .distantPast
        return messageDate > lastRead
    }
}

// MARK: - Wire rows (file-scope, private; keys are literal PostgREST column /
// relation names — the PostgREST encoder/decoder apply no key strategy,
// mirroring SupabaseCaptureGateway's wire-key discipline)

private struct SendMessagePayload: Encodable {
    let threadID: String
    let senderID: String
    let body: String
    enum CodingKeys: String, CodingKey {
        case threadID = "thread_id"
        case senderID = "sender_id"
        case body
    }
}

private struct MarkThreadReadParams: Encodable {
    let threadID: String
    enum CodingKeys: String, CodingKey {
        case threadID = "p_thread_id"
    }
}

private struct ProfileNameRow: Decodable {
    let id: String
    let displayName: String?
    let fullName: String?
    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case fullName = "full_name"
    }
}

/// `comms_threads` row enriched for the inbox: latest message (embedded,
/// limit 1), participant rows (unread dot + counterpart id), and the
/// project name for project threads.
private struct CommsThreadSummaryRow: Decodable {
    let id: String
    let kind: String
    let title: String?
    let lastMessageAt: String?
    let commsMessages: [CommsMessagePreviewRow]?
    let commsThreadParticipants: [CommsParticipantRow]?
    let projects: CommsProjectRefRow?

    enum CodingKeys: String, CodingKey {
        case id, kind, title
        case lastMessageAt = "last_message_at"
        case commsMessages = "comms_messages"
        case commsThreadParticipants = "comms_thread_participants"
        case projects
    }

    /// Participants who have not left the thread.
    var activeParticipants: [CommsParticipantRow] {
        (commsThreadParticipants ?? []).filter { $0.leftAt == nil }
    }

    /// The one embedded message (query orders comms_messages desc, limit 1).
    var latestMessage: CommsMessagePreviewRow? { commsMessages?.first }
}

private struct CommsMessagePreviewRow: Decodable {
    let senderID: String?
    let body: String
    let system: Bool
    let createdAt: String
    let deletedAt: String?
    enum CodingKeys: String, CodingKey {
        case senderID = "sender_id"
        case body, system
        case createdAt = "created_at"
        case deletedAt = "deleted_at"
    }
}

/// Participant row embedded in thread summaries; `lastReadAt` for the
/// current user's own row powers the unread indicator.
private struct CommsParticipantRow: Decodable {
    let profileID: String
    let lastReadAt: String?
    let leftAt: String?
    enum CodingKeys: String, CodingKey {
        case profileID = "profile_id"
        case lastReadAt = "last_read_at"
        case leftAt = "left_at"
    }
}

private struct CommsProjectRefRow: Decodable {
    let name: String?
}

/// `comms_messages` row shaped for M2. Selected columns only —
/// `attachments`, `mentions`, `reply_to_message_id`, `decision_id`,
/// `edited_at` aren't part of the frozen `FieldMessage` DTO. Also used to
/// decode Realtime INSERT payloads (which carry the full row; unlisted keys
/// are simply ignored by Decodable).
private struct CommsMessageRow: Decodable {
    let id: String
    let threadID: String
    let senderID: String?
    let body: String
    let system: Bool
    let createdAt: String
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case threadID = "thread_id"
        case senderID = "sender_id"
        case body, system
        case createdAt = "created_at"
        case deletedAt = "deleted_at"
    }

    /// Maps to the frozen `FieldMessage` DTO. System messages coalesce
    /// `senderID` to "" per the protocol's doc comment. Soft-deleted bodies
    /// are replaced with a placeholder — RLS (00102) keeps the row itself
    /// readable so the transcript doesn't develop holes, but the comment
    /// there says the API layer blanks the body for non-admin clients; this
    /// service is that layer.
    func asFieldMessage(myUserID: String?, names: [String: String]) -> FieldMessage {
        let resolvedSenderID = system ? "" : (senderID ?? "")
        let isMine = !system && myUserID != nil && senderID?.lowercased() == myUserID?.lowercased()
        let text = deletedAt != nil ? "Message removed" : body
        let senderName = system ? nil : names[resolvedSenderID.lowercased()]
        return FieldMessage(
            id: id,
            threadID: threadID,
            senderID: resolvedSenderID,
            senderName: senderName,
            text: text,
            sentAt: MessagesDateFormat.parse(createdAt) ?? Date(),
            isMine: isMine
        )
    }
}
