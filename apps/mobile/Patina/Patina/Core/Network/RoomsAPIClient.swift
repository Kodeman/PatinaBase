//
//  RoomsAPIClient.swift
//  Patina
//
//  Remote-sync client for the Room System. Talks to Supabase PostgREST
//  for `rooms`, `room_scans`, and `saved_items`, mirroring the auth
//  pattern in ProductAPIClient. All operations run against the row-
//  level-security-protected public schema — the caller's JWT limits
//  reads/writes to their own rows.
//
//  The local SwiftData cache (RoomStore) remains the source of truth
//  for UI; this client handles the remote write-through so data follows
//  the user across devices and feeds the designer portal.
//

import Foundation
import Supabase

// MARK: - DTOs

public struct RemoteRoom: Codable, Sendable {
    public let id: String
    public let user_id: String
    public let name: String
    public let type: String
    public let length_meters: Double?
    public let width_meters: Double?
    public let height_meters: Double?
    public let floor_area_sqm: Double?
    public let volume_cbm: Double?
    public let saved_item_count: Int?
    public let scan_count: Int?
    public let style_signals: [String: String]?
    public let created_at: String
    public let updated_at: String
    /// `rooms.budget_cents` (00537 §1). Without it a room hydrated from the
    /// server arrives with no budget and the Spaces card draws nothing under
    /// `Budget` for a figure the account is actually holding.
    public let budget_cents: Int?
}

public struct RemoteRoomScan: Codable, Sendable {
    public let id: String
    public let room_id: String?
    public let user_id: String
    public let name: String
    public let model_url: String?
    public let model_url_gltf: String?
    public let status: String
    public let created_at: String
}

public struct RemoteSavedItem: Codable, Sendable {
    public let id: String
    public let room_id: String?
    public let user_id: String
    public let product_id: String?
    public let name: String
    public let image_url: String?
    public let price_in_cents: Int?
    public let source: String?
    public let created_at: String
    /// The note the person left on the save (`saved_items.notes`, 00055:29) and
    /// what the piece cost the day they saved it (`price_cents_at_save`,
    /// 00535:21). Both columns have existed longer than this decode; the saved
    /// row cannot print "date · room · note" from the server leg without them
    /// (`waves/w4/steward.md` §4a). Optional, so a row carrying neither still
    /// decodes.
    public let notes: String?
    public let price_cents_at_save: Int? // swiftlint:disable:this identifier_name
}

public struct CreateRoomPayload: Encodable {
    public let name: String
    public let type: String
    public let length_meters: Double?
    public let width_meters: Double?
    public let height_meters: Double?
    public let floor_area_sqm: Double?
    public let volume_cbm: Double?
    public let style_signals: [String: String]?
    public let user_id: String

    public init(
        name: String,
        type: String,
        lengthMeters: Double?,
        widthMeters: Double?,
        heightMeters: Double?,
        styleSignals: [String: String]?,
        userId: String
    ) {
        self.name = name
        self.type = type
        self.length_meters = lengthMeters
        self.width_meters = widthMeters
        self.height_meters = heightMeters
        if let l = lengthMeters, let w = widthMeters {
            self.floor_area_sqm = (l * w * 100).rounded() / 100
        } else {
            self.floor_area_sqm = nil
        }
        if let l = lengthMeters, let w = widthMeters, let h = heightMeters {
            self.volume_cbm = (l * w * h * 100).rounded() / 100
        } else {
            self.volume_cbm = nil
        }
        self.style_signals = styleSignals
        self.user_id = userId
    }
}

public struct CreateRoomScanPayload: Encodable {
    public let room_id: String
    public let user_id: String
    public let name: String
    public let room_type: String?
    public let model_url: String?
    public let model_url_gltf: String?
    public let scan_data: [String: AnyCodable]?
    public let dimensions: [String: AnyCodable]?
    public let features: [String: AnyCodable]?
    public let floor_area: Double?
    public let hero_frame_url: String?
    public let style_signals: [String: AnyCodable]?
    public let status: String
}

public struct CreateSavedItemPayload: Encodable {
    /// SP-14: nullable. A save made from the browse grid or the piece detail
    /// belongs to the account, not to a room — `saved_items.room_id` has been
    /// nullable since 00055_saved_items.sql:23, and mirroring only the
    /// room-scoped saves is what made a save vanish on reinstall.
    public let room_id: String?
    public let user_id: String
    public let product_id: String
    public let name: String
    public let image_url: String?
    public let price_in_cents: Int?
    /// SP-14 / 00535: what the piece cost the day it was saved. `price_in_cents`
    /// mirrors what it costs today; the pair is what lets the app say a price
    /// moved without inventing a figure. NULL when the price was unknown.
    public let price_cents_at_save: Int? // swiftlint:disable:this identifier_name
    public let source: String
    public let notes: String?
}

/// Minimal AnyCodable to allow JSON blobs for `scan_data`, `dimensions`, etc.
public struct AnyCodable: Codable, @unchecked Sendable {
    public let value: Any
    public init(_ value: Any) { self.value = value }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Bool.self) { self.value = v; return }
        if let v = try? c.decode(Int.self) { self.value = v; return }
        if let v = try? c.decode(Double.self) { self.value = v; return }
        if let v = try? c.decode(String.self) { self.value = v; return }
        if let v = try? c.decode([AnyCodable].self) { self.value = v.map { $0.value }; return }
        if let v = try? c.decode([String: AnyCodable].self) {
            self.value = v.mapValues { $0.value }; return
        }
        self.value = NSNull()
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case let v as Bool: try c.encode(v)
        case let v as Int: try c.encode(v)
        case let v as Double: try c.encode(v)
        case let v as String: try c.encode(v)
        case let v as [Any]: try c.encode(v.map { AnyCodable($0) })
        case let v as [String: Any]: try c.encode(v.mapValues { AnyCodable($0) })
        default: try c.encodeNil()
        }
    }
}

// MARK: - Client

public actor RoomsAPIClient {
    public static let shared = RoomsAPIClient()

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .useDefaultKeys
        return e
    }()
    private let decoder = JSONDecoder()

    /// The SDK's `auth.session` reads the keychain, and a locked or corrupt
    /// keychain makes it throw even while the user is signed in. That throw
    /// used to strip the `Authorization` header outright — every request went
    /// out as anon and came back RLS-denied, silently. `AuthService` holds the
    /// session its auth-state listener published in memory, so fall back to it.
    private func authToken() async -> String? {
        if let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken {
            return token
        }
        return await AuthService.shared.session?.accessToken
    }

    private func currentUserId() async -> String? {
        if let id = try? await SupabaseClientManager.shared.client.auth.session.user.id.uuidString {
            return id.lowercased()
        }
        return await AuthService.shared.currentUserId?.lowercased()
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

    // MARK: - Rooms

    /// The URL of "this account's rooms", as a value so the owner filter is a
    /// pinned fact rather than a claim about a request nobody can see.
    ///
    /// `public.rooms` carries two SELECT policies (`00019_roomplan_features.sql`
    /// :50-60): the owner's, and one that lets a designer read every room of
    /// every client on her roster. So an unfiltered read is not "the account's
    /// house" — a designer signing into this app would hydrate her whole client
    /// book as her own rooms. The filter sits beside RLS, not instead of it.
    static func roomsListURL(base: URL, userId: String) -> URL {
        base.appendingPathComponent("/rest/v1/rooms")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ])
    }

    public func listRooms(userId: String) async throws -> [RemoteRoom] {
        var request = URLRequest(url: Self.roomsListURL(base: baseURL, userId: userId))
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        // Every other call on this client validates the status; this one
        // decoded straight through, so a 401 arrived as a decode error and the
        // log line named the wrong cause (fix-review m-8).
        try Self.ensureOK(response, data: data)
        return try decoder.decode([RemoteRoom].self, from: data)
    }

    public func createRoom(_ payload: CreateRoomPayload) async throws -> RemoteRoom {
        var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/rooms"))
        request.httpMethod = "POST"
        await applyHeaders(to: &request, prefer: "return=representation")
        request.httpBody = try encoder.encode(payload)
        let (data, response) = try await session.data(for: request)
        try Self.ensureOK(response, data: data)
        let rows = try decoder.decode([RemoteRoom].self, from: data)
        guard let first = rows.first else { throw RoomsAPIError.emptyResponse }
        return first
    }

    public func updateRoom(id: String, patch: [String: AnyCodable]) async throws -> RemoteRoom {
        let url = baseURL.appendingPathComponent("/rest/v1/rooms")
            .appending(queryItems: [URLQueryItem(name: "id", value: "eq.\(id)")])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=representation")
        request.httpBody = try encoder.encode(patch)
        let (data, response) = try await session.data(for: request)
        try Self.ensureOK(response, data: data)
        let rows = try decoder.decode([RemoteRoom].self, from: data)
        guard let first = rows.first else { throw RoomsAPIError.emptyResponse }
        return first
    }

    /// Mirror a room's budget onto `rooms.budget_cents` (00537 §1). `nil`
    /// clears it — an explicit null, not an omitted key, so removing a budget
    /// on one device removes it everywhere rather than leaving the old figure
    /// standing.
    @discardableResult
    public func updateRoomBudget(id: String, cents: Int?) async throws -> RemoteRoom {
        let value: Any = cents.map { $0 as Any } ?? NSNull()
        return try await updateRoom(id: id, patch: ["budget_cents": AnyCodable(value)])
    }

    public func deleteRoom(id: String) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/rooms")
            .appending(queryItems: [URLQueryItem(name: "id", value: "eq.\(id)")])
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        await applyHeaders(to: &request, prefer: "return=minimal")
        let (_, response) = try await session.data(for: request)
        try Self.ensureOK(response)
    }

    // MARK: - Scans

    public func createScan(_ payload: CreateRoomScanPayload) async throws -> RemoteRoomScan {
        var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/room_scans"))
        request.httpMethod = "POST"
        await applyHeaders(to: &request, prefer: "return=representation")
        request.httpBody = try encoder.encode(payload)
        let (data, response) = try await session.data(for: request)
        try Self.ensureOK(response, data: data)
        let rows = try decoder.decode([RemoteRoomScan].self, from: data)
        guard let first = rows.first else { throw RoomsAPIError.emptyResponse }
        return first
    }

    public func listScans(forRoomId roomId: String) async throws -> [RemoteRoomScan] {
        let url = baseURL.appendingPathComponent("/rest/v1/room_scans")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "room_id", value: "eq.\(roomId)"),
                URLQueryItem(name: "order", value: "created_at.desc"),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, _) = try await session.data(for: request)
        return try decoder.decode([RemoteRoomScan].self, from: data)
    }

    // MARK: - Saved Items

    public func listItems(forRoomId roomId: String) async throws -> [RemoteSavedItem] {
        let url = baseURL.appendingPathComponent("/rest/v1/saved_items")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "room_id", value: "eq.\(roomId)"),
                URLQueryItem(name: "order", value: "created_at.desc"),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, _) = try await session.data(for: request)
        return try decoder.decode([RemoteSavedItem].self, from: data)
    }

    /// SP-14: every save the account owns, room-scoped or not. `listItems(forRoomId:)`
    /// can only ever see saves that already belong to a room, so it cannot
    /// reconcile the roomless ones the standard save path now writes.
    public func listItems(forUserId userId: String) async throws -> [RemoteSavedItem] {
        let url = baseURL.appendingPathComponent("/rest/v1/saved_items")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, _) = try await session.data(for: request)
        return try decoder.decode([RemoteSavedItem].self, from: data)
    }

    public func createItem(_ payload: CreateSavedItemPayload) async throws -> RemoteSavedItem {
        var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/saved_items"))
        request.httpMethod = "POST"
        await applyHeaders(to: &request, prefer: "return=representation")
        request.httpBody = try encoder.encode(payload)
        let (data, response) = try await session.data(for: request)
        try Self.ensureOK(response, data: data)
        let rows = try decoder.decode([RemoteSavedItem].self, from: data)
        guard let first = rows.first else { throw RoomsAPIError.emptyResponse }
        return first
    }

    /// Move an already-mirrored save into a room. The save path writes
    /// `room_id` at insert time; this is the second case — a piece saved from
    /// the account (roomless) that its owner later puts in a room. Without it
    /// the local row would name a room the server's row does not.
    @discardableResult
    public func updateItemRoom(id: String, roomId: String?) async throws -> RemoteSavedItem {
        let url = baseURL.appendingPathComponent("/rest/v1/saved_items")
            .appending(queryItems: [URLQueryItem(name: "id", value: "eq.\(id)")])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=representation")
        let value: Any = roomId.map { $0 as Any } ?? NSNull()
        request.httpBody = try encoder.encode(["room_id": AnyCodable(value)])
        let (data, response) = try await session.data(for: request)
        try Self.ensureOK(response, data: data)
        let rows = try decoder.decode([RemoteSavedItem].self, from: data)
        guard let first = rows.first else { throw RoomsAPIError.emptyResponse }
        return first
    }

    public func deleteItem(id: String) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/saved_items")
            .appending(queryItems: [URLQueryItem(name: "id", value: "eq.\(id)")])
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        await applyHeaders(to: &request, prefer: "return=minimal")
        let (_, response) = try await session.data(for: request)
        try Self.ensureOK(response)
    }

    // MARK: - Helpers

    public func resolveUserId() async throws -> String {
        guard let uid = await currentUserId() else { throw RoomsAPIError.notAuthenticated }
        return uid
    }

    private static func ensureOK(_ response: URLResponse, data: Data? = nil) throws {
        guard let http = response as? HTTPURLResponse else { return }
        if !(200..<300).contains(http.statusCode) {
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            throw RoomsAPIError.http(status: http.statusCode, body: body)
        }
    }
}

public enum RoomsAPIError: Error {
    case notAuthenticated
    case emptyResponse
    case http(status: Int, body: String)
}

/// C4-08: a plain `Error` renders as Swift's default description — module
/// name, case name and, for `.http`, the response body — anywhere a caller
/// reads `localizedDescription`. Conforming the type is what stops the next
/// caller repeating it. The status and the body are never in the sentence.
extension RoomsAPIError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "Please sign in to continue."
        case .emptyResponse: return "We didn't get a response. Try again."
        case .http: return "Something went wrong. Try again."
        }
    }
}

// URLComponents helper: append query items to a URL
private extension URL {
    func appending(queryItems: [URLQueryItem]) -> URL {
        guard var comps = URLComponents(url: self, resolvingAgainstBaseURL: false) else { return self }
        comps.queryItems = (comps.queryItems ?? []) + queryItems
        return comps.url ?? self
    }
}
