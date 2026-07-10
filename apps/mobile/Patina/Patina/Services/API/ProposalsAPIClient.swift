//
//  ProposalsAPIClient.swift
//  Patina
//
//  Client-side proposal read + sign, mirroring the client portal's
//  `use-proposals` / `use-scope-builder` / `use-boards` hooks and the
//  `/api/proposals/[id]/sign` route. Everything goes through supabase-swift
//  against the configured Supabase URL — RLS scopes every read to the
//  proposal's client (`proposals.client_id = auth.uid()`); non-draft only.
//
//  Schema reference (Wave 2 / D.1):
//   • proposals — 00063 base (+ many). Money columns are integer cents.
//   • proposal_items / _sections / _phases / _payment_milestones /
//     _exclusions / _scope_rooms — the document body the client detail renders.
//   • proposal_boards (+ proposal_board_items) — 00179. Rendered as a
//     PatinaAsyncImage thumbnail grid (NOT a canvas).
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

/// Embedded `products(...)` on a proposal item (catalog-first; may be null).
public struct RemoteProposalProductRef: Codable, Sendable {
    public let id: String?
    public let name: String?
    /// `products.images` is `text[]`; first entry is the hero image.
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
    /// Embedded via `project:projects(id, name)`.
    public let project: RemoteProposalProjectRef?

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
    public let product: RemoteProposalProductRef?

    /// Display name: manual name, else the linked product's name.
    public var resolvedName: String {
        if let name, !name.isEmpty { return name }
        if let productName = product?.name, !productName.isEmpty { return productName }
        return "Item"
    }

    /// Display image: manual image_url, else the product's hero image.
    public var resolvedImageURL: URL? {
        if let image_url, !image_url.isEmpty, let url = URL(string: image_url) { return url }
        if let first = product?.images?.first, let url = URL(string: first) { return url }
        return nil
    }

    /// Supplier line: manual vendor, else the product brand.
    public var resolvedVendor: String? {
        if let vendor_name, !vendor_name.isEmpty { return vendor_name }
        if let brand = product?.brand, !brand.isEmpty { return brand }
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
    /// Decoded from the embedded `proposal_board_items(...)`.
    public let proposal_board_items: [RemoteProposalBoardItem]?

    /// Image thumbnails for the grid: cover first (if any), then the board's
    /// image items ordered bottom→top (z_index asc), de-duplicated.
    public var thumbnailURLs: [URL] {
        var urls: [String] = []
        if let cover = cover_image_url, !cover.isEmpty { urls.append(cover) }
        let images = (proposal_board_items ?? [])
            .filter { $0.type == "image" && !($0.image_url ?? "").isEmpty }
            .sorted { ($0.z_index ?? 0) < ($1.z_index ?? 0) }
            .compactMap { $0.image_url }
        urls.append(contentsOf: images)
        var seen = Set<String>()
        return urls.filter { seen.insert($0).inserted }.compactMap { URL(string: $0) }
    }

    public var itemCount: Int { proposal_board_items?.count ?? 0 }
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

    private static let proposalSelect =
        "id,project_id,designer_id,client_id,title,description,project_address,"
        + "client_visibility_tier,total_amount,payment_terms,payment_notes,status,"
        + "valid_until,sent_at,viewed_at,responded_at,created_at,updated_at,version,"
        + "signed_at,signed_by_name,accepted_at,declined_at,decline_reason,"
        + "project:projects!proposals_project_id_fkey(id,name)"

    private static let itemSelect =
        "id,proposal_id,product_id,name,description,image_url,category,quantity,"
        + "unit_sell_price,line_total_cents,vendor_name,item_type,lead_time_weeks,position,"
        + "product:products(id,name,images,brand)"

    // MARK: Reads

    /// Every proposal visible to this client (RLS: non-draft, own). Newest
    /// first — mirrors the portal `useProposals` order.
    public func listProposals() async throws -> [RemoteProposal] {
        try await client
            .from("proposals")
            .select(Self.proposalSelect)
            .order("updated_at", ascending: false)
            .execute()
            .value
    }

    public func fetchProposal(id: String) async throws -> RemoteProposal? {
        let rows: [RemoteProposal] = try await client
            .from("proposals")
            .select(Self.proposalSelect)
            .eq("id", value: id)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    public func fetchItems(proposalId: String) async throws -> [RemoteProposalItem] {
        try await client
            .from("proposal_items")
            .select(Self.itemSelect)
            .eq("proposal_id", value: proposalId)
            .order("position", ascending: true)
            .execute()
            .value
    }

    public func fetchSections(proposalId: String) async throws -> [RemoteProposalSection] {
        try await client
            .from("proposal_sections")
            .select("id,type,title,body,sort_order")
            .eq("proposal_id", value: proposalId)
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    public func fetchPhases(proposalId: String) async throws -> [RemoteProposalPhase] {
        try await client
            .from("proposal_phases")
            .select("id,name,duration_weeks,fee_cents,sort_order")
            .eq("proposal_id", value: proposalId)
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    public func fetchMilestones(proposalId: String) async throws -> [RemoteProposalMilestone] {
        try await client
            .from("proposal_payment_milestones")
            .select("id,label,percentage,amount_cents,trigger_condition,sort_order")
            .eq("proposal_id", value: proposalId)
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    public func fetchExclusions(proposalId: String) async throws -> [RemoteProposalExclusion] {
        try await client
            .from("proposal_exclusions")
            .select("id,description,category,sort_order")
            .eq("proposal_id", value: proposalId)
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    public func fetchScopeRooms(proposalId: String) async throws -> [RemoteProposalScopeRoom] {
        try await client
            .from("proposal_scope_rooms")
            .select("id,name,room_type,dimensions,budget_cents,sort_order")
            .eq("proposal_id", value: proposalId)
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    /// Active boards with just enough embedded item data to build a thumbnail
    /// grid (image url + type + z-index). RLS restricts board reads to
    /// non-draft proposals the client is on.
    public func fetchBoards(proposalId: String) async throws -> [RemoteProposalBoard] {
        try await client
            .from("proposal_boards")
            .select("id,name,cover_image_url,sort_order,proposal_board_items(type,image_url,z_index)")
            .eq("proposal_id", value: proposalId)
            .eq("status", value: "active")
            .order("sort_order", ascending: true)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    /// The proposal id linked to an activated project (`proposals.project_id`),
    /// if any — powers ProjectDetailView's "view proposal" push.
    public func proposalId(forProject projectId: String) async throws -> String? {
        struct IdRow: Decodable { let id: String }
        let rows: [IdRow] = try await client
            .from("proposals")
            .select("id")
            .eq("project_id", value: projectId)
            .order("updated_at", ascending: false)
            .limit(1)
            .execute()
            .value
        return rows.first?.id
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
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func date(from string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }
}
