//
//  DesignServicesService.swift
//  Patina
//
//  Boundary for the `submit_design_request` RPC — the single atomic
//  "design request" object (lead + scan junction + optional associations +
//  notification, all in one transaction). The old direct `leads` INSERT (and
//  its wrong-id / first-scan-only payload) is gone; the RPC owns validation,
//  designer auto-resolution, and idempotent replay.
//
//  The RPC call sits behind a `DesignRequestSubmitting` seam so error mapping
//  and the coordinator's upload→submit loop are unit-testable without a live
//  Supabase.
//

import Foundation
import Supabase

// MARK: - Design Service Types

/// Types of design services. Raw values are the server `project_type` enum
/// accepted by `submit_design_request` (`full_room | consultation |
/// single_piece | staging`).
public enum DesignServiceType: String, CaseIterable, Codable, Sendable {
    case consultation = "consultation"
    case fullRedesign = "full_room"
    case furniturePlacement = "single_piece"
    case styling = "staging"

    public var displayName: String {
        switch self {
        case .consultation: return "Design Consultation"
        case .fullRedesign: return "Full Room Redesign"
        case .furniturePlacement: return "Furniture Placement"
        case .styling: return "Styling & Staging"
        }
    }

    public var description: String {
        switch self {
        case .consultation:
            return "Get expert advice on your space and style direction"
        case .fullRedesign:
            return "Complete room transformation with furniture and decor"
        case .furniturePlacement:
            return "Help selecting and placing the perfect piece"
        case .styling:
            return "Finishing touches to complete your space"
        }
    }

    public var icon: String {
        switch self {
        case .consultation: return "bubble.left.and.text.bubble.right"
        case .fullRedesign: return "square.grid.2x2"
        case .furniturePlacement: return "chair.lounge"
        case .styling: return "sparkles"
        }
    }
}

/// Timeline preferences for design projects. Raw value → `leads.timeline`.
public enum DesignTimeline: String, CaseIterable, Codable, Sendable {
    case asap = "asap"
    case oneToThreeMonths = "1_3_months"
    case threeToSixMonths = "3_6_months"
    case flexible = "flexible"

    public var displayName: String {
        switch self {
        case .asap: return "As soon as possible"
        case .oneToThreeMonths: return "1-3 months"
        case .threeToSixMonths: return "3-6 months"
        case .flexible: return "Flexible"
        }
    }
}

/// Budget ranges for design projects. Raw value → `leads.budget_range`.
public enum DesignBudget: String, CaseIterable, Codable, Sendable {
    case under5k = "under_5k"
    case fiveToFifteen = "5k_15k"
    case fifteenToFifty = "15k_50k"
    case fiftyToHundred = "50k_100k"
    case overHundred = "over_100k"

    public var displayName: String {
        switch self {
        case .under5k: return "Under $5,000"
        case .fiveToFifteen: return "$5,000 - $15,000"
        case .fifteenToFifty: return "$15,000 - $50,000"
        case .fiftyToHundred: return "$50,000 - $100,000"
        case .overHundred: return "Over $100,000"
        }
    }
}

// MARK: - RPC contract

// PostgREST maps these property names 1:1 to the RPC's argument names, so the
// `p_*` snake_case is load-bearing — matches the RoomScanRPCParams pattern.
// swiftlint:disable identifier_name
/// Encodable parameters for `submit_design_request`. Keys map 1:1 to the
/// function's argument names. `p_designer_id` is intentionally OMITTED — the
/// SECURITY DEFINER function auto-resolves the caller's connected designer
/// (exactly-one active `designer_clients`) or pools the request; iOS never
/// resolves it. UUIDs are lowercased strings for a deterministic wire shape.
nonisolated public struct SubmitDesignRequestParams: Encodable, Sendable, Equatable {
    public let p_scan_ids: [String]
    public let p_project_type: String
    /// Optional: a roomless (scanless) request sends `nil` and an empty
    /// `p_scan_ids`; the RPC (00314+) inserts `leads.room_scan_id = NULL`.
    public let p_primary_scan_id: String?
    public let p_budget_range: String?
    public let p_timeline: String?
    public let p_description: String?
    public let p_source: String
    public let p_client_request_id: String

    public init(
        scanIds: [UUID],
        projectType: String,
        primaryScanId: UUID?,
        budgetRange: String?,
        timeline: String?,
        description: String?,
        source: String = "Patina app",
        clientRequestId: UUID
    ) {
        self.p_scan_ids = scanIds.map { $0.uuidString.lowercased() }
        self.p_project_type = projectType
        self.p_primary_scan_id = primaryScanId?.uuidString.lowercased()
        let trimmedBudget = budgetRange?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.p_budget_range = (trimmedBudget?.isEmpty == false) ? trimmedBudget : nil
        let trimmedTimeline = timeline?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.p_timeline = (trimmedTimeline?.isEmpty == false) ? trimmedTimeline : nil
        let trimmedDesc = description?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.p_description = (trimmedDesc?.isEmpty == false) ? trimmedDesc : nil
        self.p_source = source
        self.p_client_request_id = clientRequestId.uuidString.lowercased()
    }
}
// swiftlint:enable identifier_name

/// Decoded return of `submit_design_request`:
/// `{lead_id, designer_id, status, pooled, idempotent_replay}`.
nonisolated public struct DesignRequestResult: Decodable, Sendable, Equatable {
    public let leadId: UUID
    public let designerId: UUID?
    public let status: String
    public let pooled: Bool
    public let idempotentReplay: Bool

    private enum CodingKeys: String, CodingKey {
        case leadId = "lead_id"
        case designerId = "designer_id"
        case status
        case pooled
        case idempotentReplay = "idempotent_replay"
    }
}

// MARK: - Errors

nonisolated public enum DesignServicesError: Error, LocalizedError, Equatable, Sendable {
    case notAuthenticated
    case noScans
    case primaryNotInSet
    case invalidProjectType
    /// A scan wasn't found or isn't owned by the caller (DETAIL = scan id).
    case scanNotFound(scanIds: [UUID])
    /// A scan hasn't finished uploading (`status != 'ready'`) — DETAIL = scan id.
    case scanNotReady(scanIds: [UUID])
    case designerNotFound
    case requestNotFound
    /// The draft already produced a lead (has a `leadId`); nothing to resubmit.
    case alreadySubmitted
    case invalidRequest(String)
    case networkError(String)
    case submissionFailed

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Please sign in to request design services"
        case .noScans:
            return "Add at least one room scan to your request"
        case .primaryNotInSet:
            return "The primary scan must be one of the selected scans"
        case .invalidProjectType:
            return "Choose what kind of help you'd like"
        case .scanNotFound:
            return "One of your scans could not be found. Try again."
        case .scanNotReady:
            return "A scan is still finishing its upload. Give it a moment and try again."
        case .designerNotFound:
            return "We couldn't find that designer."
        case .requestNotFound:
            return "That request could not be found."
        case .alreadySubmitted:
            return "This request has already been sent."
        case .invalidRequest:
            // C5-11: was `return message` — a raw Postgres/RPC string,
            // verbatim, to a homeowner. The associated value stays on the
            // case (a caller may still log it) but the description is now
            // one fixed sentence.
            return "We couldn't process your request. Try again."
        case .networkError:
            // Was `"Network error: \(message)"` — same defect, the other
            // raw arm this finding names.
            return "Check your connection and try again."
        case .submissionFailed:
            return "We couldn't send your request. Nothing was lost — try again."
        }
    }

    // MARK: - Mapping (pure, unit-testable)

    /// Map a Supabase error into a typed `DesignServicesError`.
    public static func map(_ error: Error) -> DesignServicesError {
        if let typed = error as? DesignServicesError { return typed }
        if let pg = error as? PostgrestError {
            return map(message: pg.message, detail: pg.detail)
        }
        return .networkError(error.localizedDescription)
    }

    /// Map the raw Postgres error message (+ optional DETAIL carrying a scan
    /// id) into a typed error. Matches on the stable slug the RPC RAISEs.
    public static func map(message: String, detail: String?) -> DesignServicesError {
        let lower = message.lowercased()
        let scanIds: [UUID] = detail
            .flatMap { UUID(uuidString: $0.trimmingCharacters(in: .whitespacesAndNewlines)) }
            .map { [$0] } ?? []

        if lower.contains("not_authenticated") { return .notAuthenticated }
        if lower.contains("no_scans") { return .noScans }
        if lower.contains("primary_not_in_set") { return .primaryNotInSet }
        if lower.contains("invalid_project_type") { return .invalidProjectType }
        if lower.contains("scan_not_found_or_not_owned") { return .scanNotFound(scanIds: scanIds) }
        if lower.contains("scan_not_ready") { return .scanNotReady(scanIds: scanIds) }
        if lower.contains("designer_not_found") { return .designerNotFound }
        if lower.contains("request_not_found") { return .requestNotFound }
        return .submissionFailed
    }
}

// MARK: - Match Ceremony: client pick

// PostgREST maps these property names 1:1 to the RPC's argument names, so the
// `p_*` snake_case is load-bearing.
// swiftlint:disable identifier_name
/// Encodable parameters for `client_pick(p_ceremony_id, p_slot_id)` — the
/// homeowner books one of the offered discovery slots (Arrival Arc, R106 §6).
/// UUIDs are lowercased strings for a deterministic wire shape, mirroring
/// `SubmitDesignRequestParams`.
nonisolated public struct PickIntroductionSlotParams: Encodable, Sendable, Equatable {
    public let p_ceremony_id: String
    public let p_slot_id: String

    public init(ceremonyId: UUID, slotId: UUID) {
        self.p_ceremony_id = ceremonyId.uuidString.lowercased()
        self.p_slot_id = slotId.uuidString.lowercased()
    }
}
// swiftlint:enable identifier_name

/// Typed outcome of a failed `client_pick`. The RPC raises stable Postgres
/// error slugs the client branches on (R106 §6 contract):
/// - `already_picked` → another device won; the caller silently reconciles.
/// - `slot_stale` → the slot has passed; the caller shows the stale state.
/// - `not_found` → treated as a generic failure.
/// Anything else (network, unknown) maps to `.failed`, an inline-retryable
/// state that keeps the slot tappable.
nonisolated public enum PickIntroductionError: Error, LocalizedError, Equatable, Sendable {
    case alreadyPicked
    case slotStale
    case notFound
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .alreadyPicked: return "This time was just booked on another device."
        case .slotStale: return "That time has passed. Choose another."
        case .notFound: return "We couldn't book that time. Please try again."
        case .failed(let message): return "Couldn't book that time: \(message)"
        }
    }

    /// Map a Supabase/Postgres error into a typed pick error.
    public static func map(_ error: Error) -> PickIntroductionError {
        if let typed = error as? PickIntroductionError { return typed }
        if let pg = error as? PostgrestError { return map(message: pg.message) }
        return .failed(error.localizedDescription)
    }

    /// Pure, unit-testable mapping from the raised Postgres error message. The
    /// RPC RAISEs a stable slug; match it case-insensitively.
    public static func map(message: String) -> PickIntroductionError {
        let lower = message.lowercased()
        if lower.contains("already_picked") { return .alreadyPicked }
        if lower.contains("slot_stale") { return .slotStale }
        if lower.contains("not_found") { return .notFound }
        return .failed(message)
    }
}

// MARK: - Seam

/// The submit boundary. Injected into `DesignRequestCoordinator` so tests can
/// substitute a fake without a live Supabase.
public protocol DesignRequestSubmitting: Sendable {
    func submitDesignRequest(_ params: SubmitDesignRequestParams) async throws -> DesignRequestResult
}

// The submit boundary and its wire types are nonisolated so the RPC call can
// cross the main-actor default isolation (`-default-isolation=MainActor`).

// MARK: - Service

/// Real `DesignRequestSubmitting` — calls the `submit_design_request` RPC and
/// maps errors. Stateless (no mutable storage) so it's freely `Sendable`.
nonisolated public struct DesignServicesService: DesignRequestSubmitting {

    public static let shared = DesignServicesService()

    public init() {}

    public func submitDesignRequest(
        _ params: SubmitDesignRequestParams
    ) async throws -> DesignRequestResult {
        do {
            let result: DesignRequestResult = try await supabase
                .rpc("submit_design_request", params: params)
                .execute()
                .value
            return result
        } catch {
            throw DesignServicesError.map(error)
        }
    }

    /// Book one of the offered discovery slots via the `client_pick` RPC
    /// (Arrival Arc, R106 §6). Fire-for-effect: the return payload (the booked
    /// slot) is intentionally not decoded — the caller stamps the pick
    /// optimistically from the in-hand slot and reconciles the authoritative
    /// state via `DesignRequestStatusService.refreshSoon()`. A raised Postgres
    /// error is mapped into a typed `PickIntroductionError` the caller branches
    /// on (`already_picked` / `slot_stale` / `not_found` / generic).
    public func pickIntroductionSlot(ceremonyId: UUID, slotId: UUID) async throws {
        do {
            try await supabase
                .rpc("client_pick", params: PickIntroductionSlotParams(
                    ceremonyId: ceremonyId,
                    slotId: slotId
                ))
                .execute()
        } catch {
            throw PickIntroductionError.map(error)
        }
    }
}
