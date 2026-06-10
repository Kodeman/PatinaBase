//
//  MessagingAPIClient.swift
//  Patina
//
//  Reads/writes `comms_threads`, `comms_messages`, and
//  `comms_thread_participants`. RLS (see migration 00102) gates access
//  to thread participants. We only read threads where the user is an
//  active participant; sending messages must include sender_id =
//  auth.uid().
//

import Foundation
import Supabase

// MARK: - DTOs

public struct RemoteCommsThread: Codable, Sendable, Identifiable {
    public let id: String
    public let kind: String
    public let project_id: String?
    public let proposal_id: String?
    public let title: String?
    public let created_by: String?
    public let last_message_at: String?
    public let updated_at: String?
}

public struct RemoteCommsMessage: Codable, Sendable, Identifiable {
    public let id: String
    public let thread_id: String
    public let sender_id: String?
    public let body: String
    public let attachments: [AnyCodable]?
    public let reply_to_message_id: String?
    public let decision_id: String?
    public let mentions: [String]?
    public let system: Bool
    public let created_at: String
    public let edited_at: String?
    public let deleted_at: String?
}

/// Participant row embedded in thread summaries. `last_read_at` for the
/// current user's own row powers the unread indicator.
public struct RemoteCommsParticipant: Codable, Sendable {
    public let profile_id: String
    public let role: String
    public let last_read_at: String?
    public let left_at: String?
}

/// Latest-message preview embedded in thread summaries.
public struct RemoteCommsMessagePreview: Codable, Sendable {
    public let sender_id: String?
    public let body: String
    public let system: Bool
    public let created_at: String
    public let deleted_at: String?
}

/// Embedded `projects(name)` reference for project threads.
public struct RemoteCommsProjectRef: Codable, Sendable {
    public let name: String?
}

/// Thread row with everything the inbox needs in one round trip:
/// latest message, participant rows, and the project name.
public struct RemoteCommsThreadSummary: Codable, Sendable, Identifiable {
    public let id: String
    public let kind: String
    public let project_id: String?
    public let title: String?
    public let last_message_at: String?
    public let comms_messages: [RemoteCommsMessagePreview]?
    public let comms_thread_participants: [RemoteCommsParticipant]?
    public let projects: RemoteCommsProjectRef?

    /// Participants who have not left the thread.
    public var activeParticipants: [RemoteCommsParticipant] {
        (comms_thread_participants ?? []).filter { $0.left_at == nil }
    }

    /// Latest non-deleted state of the most recent message, if any.
    public var latestMessage: RemoteCommsMessagePreview? {
        comms_messages?.first
    }
}

public struct SendMessagePayload: Encodable {
    public let thread_id: String
    public let sender_id: String
    public let body: String
}

public struct CreateDirectThreadPayload: Encodable {
    public let kind: String = "direct"
    public let created_by: String
    public let title: String?
}

public actor MessagingAPIClient {
    public static let shared = MessagingAPIClient()

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private func authToken() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.accessToken
    }

    private func applyHeaders(to request: inout URLRequest, prefer: String? = nil) async {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout
        if let token = await authToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let prefer {
            request.setValue(prefer, forHTTPHeaderField: "Prefer")
        }
    }

    // MARK: - Threads

    /// List active threads visible to the user (RLS-restricted). Ordered
    /// by `last_message_at desc` so the inbox shows the most-active
    /// conversations first.
    public func listThreads(limit: Int = 50) async throws -> [RemoteCommsThread] {
        let url = baseURL.appendingPathComponent("/rest/v1/comms_threads")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "order", value: "last_message_at.desc"),
                URLQueryItem(name: "limit", value: String(limit)),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode([RemoteCommsThread].self, from: data)
    }

    /// Thread list enriched for the inbox in a single round trip: the
    /// latest message (preview), the participant rows (counterpart
    /// identity + own `last_read_at` for the unread dot), and the
    /// project name for project threads. Uses PostgREST resource
    /// embedding with a per-parent order/limit on `comms_messages`, so
    /// this stays one query regardless of thread count. RLS on each
    /// embedded table still applies — rows the user can't see simply
    /// come back empty and the UI falls back to generic labels.
    public func listThreadSummaries(limit: Int = 50) async throws -> [RemoteCommsThreadSummary] {
        let select = "id,kind,project_id,title,last_message_at,"
            + "comms_messages(sender_id,body,system,created_at,deleted_at),"
            + "comms_thread_participants(profile_id,role,last_read_at,left_at),"
            + "projects(name)"
        let url = baseURL.appendingPathComponent("/rest/v1/comms_threads")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: select),
                URLQueryItem(name: "comms_messages.order", value: "created_at.desc"),
                URLQueryItem(name: "comms_messages.limit", value: "1"),
                URLQueryItem(name: "order", value: "last_message_at.desc"),
                URLQueryItem(name: "limit", value: String(limit)),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode([RemoteCommsThreadSummary].self, from: data)
    }

    // MARK: - Messages

    public func listMessages(threadId: String, limit: Int = 100) async throws -> [RemoteCommsMessage] {
        let url = baseURL.appendingPathComponent("/rest/v1/comms_messages")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "thread_id", value: "eq.\(threadId)"),
                URLQueryItem(name: "order", value: "created_at.asc"),
                URLQueryItem(name: "limit", value: String(limit)),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode([RemoteCommsMessage].self, from: data)
    }

    public func sendMessage(threadId: String, body: String) async throws -> RemoteCommsMessage {
        guard let userId = try? await SupabaseClientManager.shared.client.auth.session.user.id.uuidString.lowercased() else {
            throw RoomsAPIError.notAuthenticated
        }
        let payload = SendMessagePayload(thread_id: threadId, sender_id: userId, body: body)
        var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/comms_messages"))
        request.httpMethod = "POST"
        await applyHeaders(to: &request, prefer: "return=representation")
        request.httpBody = try encoder.encode(payload)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        let rows = try decoder.decode([RemoteCommsMessage].self, from: data)
        guard let first = rows.first else { throw RoomsAPIError.emptyResponse }
        return first
    }

    // MARK: - Mark read

    /// Bump `last_read_at` for the current user on the given thread.
    public func markRead(threadId: String) async throws {
        guard let userId = try? await SupabaseClientManager.shared.client.auth.session.user.id.uuidString.lowercased() else {
            return
        }
        let url = baseURL.appendingPathComponent("/rest/v1/comms_thread_participants")
            .appending(queryItems: [
                URLQueryItem(name: "thread_id", value: "eq.\(threadId)"),
                URLQueryItem(name: "profile_id", value: "eq.\(userId)"),
            ])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=minimal")
        let body: [String: String] = ["last_read_at": ISO8601DateFormatter().string(from: Date())]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: "")
        }
    }
}
