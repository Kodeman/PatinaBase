//
//  ProposalsAPIClient.swift
//  Patina
//
//  Client-side proposal read + sign, mirroring the client portal. Reads go
//  exclusively through the client-safe JSON RPC boundary: row-level policies
//  cannot protect trade pricing or internal columns on authored proposal
//  tables. The list RPC returns issued copies only; the bundle RPC returns one
//  immutable, visibility-tier-filtered document.
//
//  Sign path: the atomic `sign_proposal` RPC (00210, SECURITY DEFINER,
//  idempotent). It settles the approval decision, flips the proposal to
//  'accepted', logs a 'signed' engagement event, and (default) activates the
//  project. It does NOT send the confirmation email — so, exactly like the
//  portal route, we fire the best-effort `proposal-sign-confirmation` edge
//  function afterward.
//

import Foundation
import Supabase

// MARK: - Wire models

/// Embedded `projects(id, name)` on a proposal — list/detail context.
public struct RemoteProposalProjectRef: Codable, Sendable {
    public let id: String?
    public let name: String?
}

/// Immutable, client-safe product snapshot captured when the proposal is issued.
public struct RemoteProposalProductRef: Codable, Sendable {
    public let product_id: String?
    public let name: String?
    public let images: [String]?
    public let brand: String?
}

public struct RemoteProposal: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String?
    public let designer_id: String?
    public let client_id: String?
    public let title: String?
    public let description: String?
    public let project_address: String?
    public let client_visibility_tier: String?
    /// Contract total in CENTS (Σ line_total_cents + design fees).
    public let total_amount: Int?
    public let payment_terms: String?
    public let payment_notes: String?
    /// draft | sent | viewed | accepted | declined | expired | revised.
    public let status: String?
    public let valid_until: String?
    public let sent_at: String?
    public let viewed_at: String?
    public let responded_at: String?
    public let created_at: String?
    public let updated_at: String?
    public let version: Int?
    public let signed_at: String?
    public let signed_by_name: String?
    public let accepted_at: String?
    public let declined_at: String?
    public let decline_reason: String?
    /// Client-safe linked project context embedded by the RPC.
    public let project: RemoteProposalProjectRef?
    /// Embedded on list responses so Budget never reads the milestone table.
    public let payment_milestones: [RemoteProposalMilestone]?
    /// Embedded only on the detail bundle's proposal object.
    public let items: [RemoteProposalItem]?

    /// The client may still sign while sent/viewed and not past expiry.
    public var isSignable: Bool {
        guard status == "sent" || status == "viewed" else { return false }
        if let until = valid_until, let expires = ISO8601DateParsing.date(from: until) {
            return expires >= Date()
        }
        return true
    }

    public var isSigned: Bool { status == "accepted" }
}

public struct RemoteProposalItem: Codable, Sendable, Identifiable {
    public let id: String
    public let proposal_id: String?
    public let product_id: String?
    public let name: String?
    public let description: String?
    public let image_url: String?
    public let category: String?
    public let quantity: Double?
    public let unit_sell_price: Int?
    public let line_total_cents: Int?
    public let vendor_name: String?
    public let item_type: String?
    public let lead_time_weeks: Int?
    public let position: Int?
    public let client_product_snapshot: RemoteProposalProductRef?

    /// Display name: manual name, else the linked product's name.
    public var resolvedName: String {
        if let name, !name.isEmpty { return name }
        if let productName = client_product_snapshot?.name, !productName.isEmpty { return productName }
        return "Item"
    }

    /// Display image: manual image_url, else the product's hero image.
    public var resolvedImageURL: URL? {
        if let image_url, !image_url.isEmpty, let url = URL(string: image_url) { return url }
        if let first = client_product_snapshot?.images?.first, let url = URL(string: first) { return url }
        return nil
    }

    /// Supplier line: manual vendor, else the product brand.
    public var resolvedVendor: String? {
        if let vendor_name, !vendor_name.isEmpty { return vendor_name }
        if let brand = client_product_snapshot?.brand, !brand.isEmpty { return brand }
        return nil
    }
}

public struct RemoteProposalSection: Codable, Sendable, Identifiable {
    public let id: String
    public let type: String?
    public let title: String?
    public let body: String?
    public let sort_order: Int?
}

public struct RemoteProposalPhase: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String?
    public let duration_weeks: Int?
    public let fee_cents: Int?
    public let sort_order: Int?
}

public struct RemoteProposalMilestone: Codable, Sendable, Identifiable {
    public let id: String
    public let label: String?
    public let percentage: Double?
    public let amount_cents: Int?
    public let trigger_condition: String?
    public let sort_order: Int?
}

public struct RemoteProposalExclusion: Codable, Sendable, Identifiable {
    public let id: String
    public let description: String?
    public let category: String?
    public let sort_order: Int?
}

public struct RemoteProposalScopeRoom: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String?
    public let room_type: String?
    public let dimensions: String?
    public let budget_cents: Int?
    public let sort_order: Int?
}

/// One image item embedded on a board — feeds the thumbnail grid.
public struct RemoteProposalBoardItem: Codable, Sendable {
    public let type: String?
    public let image_url: String?
    public let z_index: Int?
}

public struct RemoteProposalBoard: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String?
    public let cover_image_url: String?
    public let sort_order: Int?
    /// Client-safe board items embedded by `get_client_proposal_bundle`.
    public let items: [RemoteProposalBoardItem]?

    /// Image thumbnails for the grid: cover first (if any), then the board's
    /// image items ordered bottom→top (z_index asc), de-duplicated.
    public var thumbnailURLs: [URL] {
        var urls: [String] = []
        if let cover = cover_image_url, !cover.isEmpty { urls.append(cover) }
        let images = (items ?? [])
            .filter { $0.type == "image" && !($0.image_url ?? "").isEmpty }
            .sorted { ($0.z_index ?? 0) < ($1.z_index ?? 0) }
            .compactMap { $0.image_url }
        urls.append(contentsOf: images)
        var seen = Set<String>()
        return urls.filter { seen.insert($0).inserted }.compactMap { URL(string: $0) }
    }

    public var itemCount: Int { items?.count ?? 0 }
}

/// Atomic client-safe proposal detail payload. All authored child collections
/// come from the same server-side snapshot boundary as the proposal header.
public struct RemoteProposalBundle: Codable, Sendable {
    public let proposal: RemoteProposal
    public let sections: [RemoteProposalSection]
    public let payment_milestones: [RemoteProposalMilestone]
    public let phases: [RemoteProposalPhase]
    public let exclusions: [RemoteProposalExclusion]
    public let scope_rooms: [RemoteProposalScopeRoom]
    public let boards: [RemoteProposalBoard]
}

// MARK: - Errors

/// Friendly, user-facing failure reasons for the sign path. The RPC re-checks
/// every guard server-side and raises descriptive messages; we map those to
/// copy the client can act on (mirrors the portal route's 4xx codes).
public enum ProposalSignError: LocalizedError, Sendable {
    case expired
    case notSignable
    case nameTooShort
    case notOwner
    case generic(String)

    public var errorDescription: String? {
        switch self {
        case .expired:
            return "This proposal has expired. Ask your designer to renew it."
        case .notSignable:
            return "This proposal isn't available to sign right now."
        case .nameTooShort:
            return "Please enter your full name to sign."
        case .notOwner:
            return "You're not able to sign this proposal."
        case .generic(let message):
            return message
        }
    }

    /// Map a thrown error (usually a Postgrest error carrying the RPC's
    /// `raise exception` message) to a friendly reason.
    static func map(_ error: Error) -> ProposalSignError {
        let message = (error as? PostgrestError)?.message ?? error.localizedDescription
        let lower = message.lowercased()
        if lower.contains("expired") { return .expired }
        if lower.contains("signable") { return .notSignable }
        if lower.contains("at least 2 characters") { return .nameTooShort }
        if lower.contains("only be signed by its client") { return .notOwner }
        return .generic("Couldn't sign the proposal. Please try again.")
    }
}

// MARK: - Client

public actor ProposalsAPIClient {
    public static let shared = ProposalsAPIClient()

    public init() {}

    private var client: SupabaseClient { SupabaseClientManager.shared.client }

    static let listReadRPC = "list_client_proposals"
    static let detailReadRPC = "get_client_proposal_bundle"

    private struct ClientProposalBundleParams: Encodable {
        let p_proposal_id: String
    }

    // MARK: Reads

    /// Every issued proposal visible to this client, newest first. The RPC
    /// exposes only sent/viewed/accepted/declined/expired immutable copies.
    public func listProposals() async throws -> [RemoteProposal] {
        try await client
            .rpc(Self.listReadRPC)
            .execute()
            .value
    }

    /// One atomic proposal document. The function rejects draft/revised copies,
    /// foreign clients, and unauthenticated callers before building the DTO.
    public func fetchProposalBundle(id: String) async throws -> RemoteProposalBundle {
        try await client
            .rpc(Self.detailReadRPC, params: ClientProposalBundleParams(p_proposal_id: id))
            .execute()
            .value
    }

    /// The proposal id linked to an activated project (`proposals.project_id`),
    /// if any — powers ProjectDetailView's "view proposal" push.
    public func proposalId(forProject projectId: String) async throws -> String? {
        try await listProposals().first { $0.project_id == projectId }?.id
    }

    // MARK: Sign

    private struct SignProposalParams: Encodable {
        let p_proposal_id: String
        let p_signed_name: String
    }

    private struct SignConfirmationBody: Encodable {
        let proposalId: String
    }

    /// Sign the proposal via the atomic `sign_proposal` RPC, then fire the
    /// best-effort confirmation email (a failure there never blocks the sign —
    /// the proposal is already accepted server-side).
    public func signProposal(proposalId: String, signedName: String) async throws {
        let name = signedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else { throw ProposalSignError.nameTooShort }

        do {
            try await client
                .rpc("sign_proposal", params: SignProposalParams(
                    p_proposal_id: proposalId,
                    p_signed_name: name
                ))
                .execute()
        } catch {
            throw ProposalSignError.map(error)
        }

        // CARRY-FORWARD: sign_proposal does NOT send the confirmation email.
        do {
            try await client.functions.invoke(
                "proposal-sign-confirmation",
                options: FunctionInvokeOptions(body: SignConfirmationBody(proposalId: proposalId))
            )
        } catch {
            #if DEBUG
            PatinaLog.ui.debug("[Proposals] sign-confirmation email failed (non-fatal): \(error.localizedDescription)")
            #endif
        }
    }
}

// MARK: - ISO date parsing helper

/// Small shared ISO-8601 parser (Postgres `timestamptz` strings) tolerant of
/// fractional seconds — used for proposal expiry checks.
enum ISO8601DateParsing {
    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let plain = ISO8601DateFormatter()

    static func date(from string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }
}
