//
//  DailyRoomAPI.swift
//  Patina
//
//  Thin HTTP client for the client-portal Daily Room endpoints:
//    POST /api/interactions/batch
//    GET  /api/feed/:roomId
//    GET  /api/stories/today
//

import Foundation
import Supabase
import Auth

actor DailyRoomAPI {
    static let shared = DailyRoomAPI()

    private let session = URLSession.shared
    private var baseURL: URL { APIConfiguration.clientPortalURL }

    // MARK: - Batch telemetry

    struct BatchPayload: Encodable {
        let sessionId: String
        let events: [DailyRoomEvent]
        enum CodingKeys: String, CodingKey {
            case sessionId = "session_id"
            case events
        }
    }

    /// POST a batch of Daily Room events. Returns true on 2xx.
    func postBatch(sessionId: String, events: [DailyRoomEvent]) async -> Bool {
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/interactions/batch"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        await attachAuth(&request)

        do {
            request.httpBody = try JSONEncoder.telemetryEncoder.encode(
                BatchPayload(sessionId: sessionId, events: events)
            )
            let (_, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
                return true
            }
            return false
        } catch {
            PatinaLog.ui.error("[DailyRoomAPI] postBatch failed: \(error)")
            return false
        }
    }

    // MARK: - Auth

    private func attachAuth(_ request: inout URLRequest) async {
        if let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }
}
