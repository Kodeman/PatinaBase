//  SupabaseDecisionsReadService.swift
//  Capture · Wave D (Decisions, read-only)
//
//  Real DecisionsReadService: reads `client_decisions` + `client_decision_options`
//  directly through the authenticated supabase-swift client. RLS ("Designers can
//  manage their decisions" / "Designers can manage decision options", migration
//  00062) scopes every row to `designer_clients.designer_id = auth.uid()` — the
//  identity behind the app's single session — so no client-side designer filter
//  is needed; every read below is already scoped to the signed-in designer.
//
//  Query shape ported from the reference client
//  `apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient.swift` (columns,
//  status filter, ordering, product-embed fallback) plus the designer-portal's
//  cross-client dashboard hook `packages/supabase/src/hooks/use-decisions.ts`
//  (client display-name resolution — the reference iOS client doesn't need this
//  since it IS the client). Full column/alias table + RLS citations are in the
//  wave report.

import Foundation
import Supabase
import CaptureKit

struct SupabaseDecisionsReadService: DecisionsReadService {
    private let client: SupabaseClient

    init(deps: WorkServiceDependencies) {
        self.client = deps.client
    }

    // MARK: DecisionsReadService

    func listPending() async throws -> [FieldDecision] {
        let rows: [DecisionRow] = try await client
            .from("client_decisions")
            .select(Self.decisionColumns)
            .eq("status", value: "pending")
            // Soonest-due first; undated decisions sort last, then newest-sent
            // first among themselves. Mirrors the reference's
            // `due_date.asc.nullslast,created_at.desc`.
            .order("due_date", ascending: true, nullsFirst: false)
            .order("created_at", ascending: false)
            .execute()
            .value
        return rows.map(\.fieldDecision)
    }

    func decisionDetail(id: String) async throws -> FieldDecisionDetail {
        let row: DecisionRow = try await client
            .from("client_decisions")
            .select(Self.decisionColumns)
            .eq("id", value: id)
            .single()
            .execute()
            .value

        let optionRows: [OptionRow] = try await client
            .from("client_decision_options")
            .select(Self.optionColumns)
            .eq("decision_id", value: id)
            .order("sort_order", ascending: true)
            .order("id", ascending: true)
            .execute()
            .value

        return FieldDecisionDetail(
            decision: row.fieldDecision,
            context: row.context,
            options: optionRows.map(\.fieldOption)
        )
    }

    // MARK: Wire shape (shared by both reads, like the reference's `decisionSelect`)

    /// `designer_client` resolves the client's display name the way the
    /// designer-portal dashboard does it (`useAllDecisions` + its
    /// `getClientName()`): a registered client's `profiles.full_name`, else the
    /// designer's own `client_name` for an unregistered/direct contact
    /// (migration 00018), else nothing (the client_email fallback is applied in
    /// Swift below). `!client_id` disambiguates the embed — `designer_clients`
    /// has two FKs into `profiles` (`designer_id` and `client_id`).
    private static let decisionColumns =
        "id,title,context,status,created_at,viewed_at,due_date,"
        + "project:projects(name),"
        + "designer_client:designer_clients(client_name,client_email,client:profiles!client_id(full_name))"

    /// Mirrors the reference `optionSelect`'s product embed (catalog-first
    /// options, migration 00172). Raw column names — `CodingKeys` on the row
    /// types below do the renaming, not PostgREST-level aliasing.
    private static let optionColumns =
        "id,name,designer_note,image_url,price,is_recommended,selected,"
        + "product:products(name,images,price_retail)"
}

// MARK: - Decodable rows (file-scope; keys = literal column names)

private struct ProjectRef: Decodable {
    let name: String?
}

private struct ProfileRef: Decodable {
    let fullName: String?
    enum CodingKeys: String, CodingKey { case fullName = "full_name" }
}

private struct DesignerClientRef: Decodable {
    let clientName: String?
    let clientEmail: String?
    let client: ProfileRef?
    enum CodingKeys: String, CodingKey {
        case clientName = "client_name"
        case clientEmail = "client_email"
        case client
    }
}

/// `client_decisions` row. `sentAt` on the mapped `FieldDecision` reads
/// `created_at` (creation ≈ sent) — the schema's `sent_at` column (00064)
/// isn't selected here because the reference client never populates/reads it
/// either; `created_at` is the honest "when this appeared" signal both apps use.
private struct DecisionRow: Decodable {
    let id: String
    let title: String
    let context: String?
    let status: String
    let createdAt: Date
    let viewedAt: Date?
    let project: ProjectRef?
    let designerClient: DesignerClientRef?

    enum CodingKeys: String, CodingKey {
        case id, title, context, status
        case createdAt = "created_at"
        case viewedAt = "viewed_at"
        case project
        case designerClient = "designer_client"
    }

    var fieldDecision: FieldDecision {
        FieldDecision(
            id: id,
            title: title,
            projectName: project?.name,
            clientName: resolvedClientName,
            status: status,
            sentAt: createdAt,
            viewedAt: viewedAt
        )
    }

    /// `profiles.full_name` (registered client) → `designer_clients.client_name`
    /// (direct/unregistered contact) → `designer_clients.client_email` → nil.
    /// Matches the designer-portal's `getClientName()` fallback chain; the iOS
    /// card simply omits the client line when every source is empty, rather
    /// than showing a literal "Unknown" the way the web dashboard does.
    private var resolvedClientName: String? {
        if let name = designerClient?.client?.fullName, !name.isEmpty { return name }
        if let name = designerClient?.clientName, !name.isEmpty { return name }
        if let email = designerClient?.clientEmail, !email.isEmpty { return email }
        return nil
    }
}

private struct ProductRef: Decodable {
    let name: String?
    let images: [String]?
    let priceRetail: Int?
    enum CodingKeys: String, CodingKey {
        case name, images
        case priceRetail = "price_retail"
    }
}

/// `client_decision_options` row. Resolution order mirrors the reference's
/// `resolved*` accessors: manual field first, linked-product fallback — except
/// `note`, which never falls back to the product (a product description isn't
/// the designer's framing of the choice).
private struct OptionRow: Decodable {
    let id: String
    let name: String
    let designerNote: String?
    let imageURL: String?
    let price: Int?
    let isRecommended: Bool?
    let selected: Bool?
    let product: ProductRef?

    enum CodingKeys: String, CodingKey {
        case id, name
        case designerNote = "designer_note"
        case imageURL = "image_url"
        case price
        case isRecommended = "is_recommended"
        case selected
        case product
    }

    var fieldOption: FieldDecisionOption {
        FieldDecisionOption(
            id: id,
            title: resolvedTitle,
            note: resolvedNote,
            imageURL: resolvedImageURL,
            priceLabel: resolvedPriceLabel,
            isRecommended: isRecommended ?? false,
            isSelected: selected ?? false
        )
    }

    /// `name` is NOT NULL in the schema, so this is almost always just `name`;
    /// the product-name fallback + "Untitled option" guard against the
    /// pathological empty-string case (`FieldDecisionOption.title` is
    /// non-optional, unlike the reference's `resolvedTitle`).
    private var resolvedTitle: String {
        if !name.isEmpty { return name }
        if let productName = product?.name, !productName.isEmpty { return productName }
        return "Untitled option"
    }

    private var resolvedNote: String? {
        guard let designerNote, !designerNote.isEmpty else { return nil }
        return designerNote
    }

    private var resolvedImageURL: URL? {
        if let imageURL, !imageURL.isEmpty, let url = URL(string: imageURL) { return url }
        if let first = product?.images?.first, !first.isEmpty, let url = URL(string: first) { return url }
        return nil
    }

    /// Whole-dollar label from resolved cents — matches the app-wide
    /// convention (`DecisionDetailView.formattedPrice`): truncates, doesn't
    /// round, and never shows cents.
    private var resolvedPriceLabel: String? {
        guard let cents = price ?? product?.priceRetail else { return nil }
        let dollars = cents / 100
        let formatted = NumberFormatter.localizedString(from: NSNumber(value: dollars), number: .decimal)
        return "$\(formatted)"
    }
}
