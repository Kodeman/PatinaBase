//
//  FulfillmentAPIClient.swift
//  Patina
//
//  "Where is it" — the client's own orders, over BOTH rails (Q6, direction B
//  §5 / §11 M8). One file, because the two rails only mean anything together:
//  a piece the client bought herself and a piece her designer bought for her
//  land on the same list, and the merge between them is the whole point.
//
//  Backend reference, verified against this branch:
//   • `fulfillment_orders`      — 00350:68-89. Client-scoped SELECT added by
//     00540:933-936 (`client_profile_id = auth.uid()`). Full table GRANT.
//     Status is DERIVED, never stored (00350's own comment).
//   • `fulfillment_order_items` — 00350:92-113, the line-level state machine.
//     ⚠ 00540:973-977 WITHDREW the table GRANT from `authenticated` and
//     re-issued it as ELEVEN NAMED COLUMNS. `select=*` here is a 42501 for
//     every client, so the select list below is not a nicety.
//   • `fulfillment_shipments`   — 00350:160-176. Policy is
//     `fulfillment_po_belongs_to_caller(po_id)` (00540:946-949) — a boolean.
//     See `FulfillmentAPIClient.shipments()` for what that does and does not
//     let the app say.
//   • `direct_orders`           — 00276. ⚠ 00540:131-138 likewise withdrew the
//     table GRANT and re-issued SIXTEEN NAMED COLUMNS. `commission_rate` is
//     deliberately NOT one of them (direction B §5 discloses THAT a commission
//     exists, never its size), so this client must never ask for it.
//   • `get_direct_order_terms()` — 00540:294-320. SECURITY DEFINER, STABLE,
//     `authenticated`, returns exactly one row always.
//
//  Naming: C1's lane owns `Core/Network/DirectOrdersAPIClient.swift` and
//  declares its own direct-order types for the purchase path. The types here
//  are read-only and deliberately named apart (`ClientDirectOrder`,
//  `OrderResponsibilityTerms`) so the two lanes cannot collide on a symbol at
//  integration.
//

import Foundation
import Supabase

// MARK: - Wire rows

/// A row on the fulfillment rail — the client's own order, whoever bought it.
public struct RemoteFulfillmentOrder: Codable, Sendable, Identifiable {
    /// Every column `authenticated` may read that this screen needs. The
    /// operator's cost side (`fulfillment_vendor_pos`, PO lines) is not here
    /// and is not readable.
    public static let selectColumns = """
        id,order_no,stripe_payment_intent_id,client_profile_id,\
        designer_profile_id,designer_attribution,captured_total_cents,\
        product_subtotal_cents,freight_charged_cents,tax_cents,intake_at,created_at
        """

    public let id: String
    public let order_no: Int?
    public let stripe_payment_intent_id: String?
    public let client_profile_id: String?
    public let designer_profile_id: String?
    /// `{source, direct_order_id, project_id}` when the order came off the
    /// direct rail with a designer attached
    /// (`create-checkout-session/direct-order.ts:201-206`). Absent otherwise.
    public let designer_attribution: [String: AnyCodable]?
    public let captured_total_cents: Int?
    public let product_subtotal_cents: Int?
    public let freight_charged_cents: Int?
    public let tax_cents: Int?
    public let intake_at: String?
    public let created_at: String?
    /// Embedded `profiles!fulfillment_orders_designer_profile_id_fkey`. Nil
    /// when the order has no designer, or when the embed was refused and the
    /// retry ran without it.
    public let designer: RemoteDesignerRef?

    /// The direct order this row settled from, when the metadata recorded one.
    /// The secondary merge key; `stripe_payment_intent_id` is the primary.
    public var attributedDirectOrderId: String? {
        designer_attribution?["direct_order_id"]?.value as? String
    }

    public var attributedProjectId: String? {
        designer_attribution?["project_id"]?.value as? String
    }
}

/// One line of a fulfillment order — and the only place the order's state
/// actually lives (00350: "status is ALWAYS derived").
public struct RemoteFulfillmentOrderItem: Codable, Sendable, Identifiable {
    /// The eleven columns 00540 left to `authenticated`, verbatim. Adding one
    /// that is not on that list 42501s the whole read.
    public static let selectColumns = """
        id,order_id,product_id,item_name,qty,unit_price_cents,\
        line_state,line_state_entered_at,line_index,created_at,updated_at
        """

    public let id: String
    public let order_id: String
    public let product_id: String?
    public let item_name: String
    public let qty: Int
    public let unit_price_cents: Int
    /// `intake|split|transmitted|acknowledged|in_production|shipped|delivered|settled|cancelled`
    public let line_state: String
    public let line_state_entered_at: String?
    public let line_index: Int?
    public let created_at: String?
    public let updated_at: String?
}

/// A physical movement. Readable by the client through
/// `fulfillment_po_belongs_to_caller(po_id)` — which proves the shipment is
/// hers, and says nothing about WHICH of her orders it is. See
/// `FulfillmentAPIClient.shipments()`.
public struct RemoteFulfillmentShipment: Codable, Sendable, Identifiable {
    public static let selectColumns = """
        id,po_id,mode,carrier,tracking,shipped_at,delivered_at,current_eta,created_at
        """

    public let id: String
    public let po_id: String
    public let mode: String?
    public let carrier: String?
    public let tracking: String?
    public let shipped_at: String?
    public let delivered_at: String?
    public let current_eta: String?
    public let created_at: String?
}

/// The client's own row on the direct rail. Read-only: the app never inserts
/// here (00276 gives `authenticated` a SELECT policy and nothing else) — the
/// purchase goes through `create_direct_order`, which is C1's.
public struct ClientDirectOrder: Codable, Sendable, Identifiable {
    /// Fifteen of 00540's sixteen granted columns — `client_id` is the filter
    /// and is not needed in the payload. `commission_rate` is absent from the
    /// GRANT and absent here; asking for it is a 42501.
    public static let selectColumns = """
        id,product_id,product_name,quantity,unit_price_cents,amount_cents,\
        currency,status,stripe_checkout_session_id,stripe_payment_intent_id,\
        shipping,created_at,paid_at,designer_id,project_id
        """

    public let id: String
    public let product_id: String?
    public let product_name: String?
    public let quantity: Int?
    public let unit_price_cents: Int?
    public let amount_cents: Int?
    public let currency: String?
    /// `pending_payment | paid | canceled | refunded` (00276 + 00277).
    public let status: String?
    public let stripe_checkout_session_id: String?
    public let stripe_payment_intent_id: String?
    public let created_at: String?
    public let paid_at: String?
    public let designer_id: String?
    public let project_id: String?
}

/// `get_direct_order_terms()` — who is responsible, who to reach, and whether
/// the rail was told to collect tax and delivery.
///
/// Critique M14: the copy must not outrun the setting. `taxShippingEnabled`
/// is the ONLY thing that may turn on "Delivery and tax are added at payment",
/// and it is false until Kody rules it.
public struct OrderResponsibilityTerms: Codable, Sendable, Equatable {
    public let responsibility_paragraph: String?
    public let contact: String?
    public let tax_shipping_enabled: Bool?

    /// The paragraph, only when there is one. A blank config key draws nothing
    /// rather than a heading over air.
    public var paragraph: String? {
        guard let responsibility_paragraph,
              !responsibility_paragraph.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return responsibility_paragraph
    }

    /// The one reachable human. Direction B §5 is explicit that this is "an
    /// address or a number, not the word 'support'" — so when the config holds
    /// nothing, the row does not draw at all.
    public var reachableContact: String? {
        guard let contact,
              !contact.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return contact
    }
}

// MARK: - Client

public actor FulfillmentAPIClient {
    public static let shared = FulfillmentAPIClient()

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared
    private let decoder = JSONDecoder()

    private static let designerEmbed =
        ",designer:profiles!fulfillment_orders_designer_profile_id_fkey("
        + RemoteDesignerRef.selectColumns + ")"

    private func authToken() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.accessToken
    }

    private func applyHeaders(to request: inout URLRequest) async {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout
        if let token = await authToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    private func get<T: Decodable>(
        _ path: String,
        _ queryItems: [URLQueryItem]
    ) async throws -> T {
        let url = baseURL.appendingPathComponent(path).appending(queryItems: queryItems)
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try decoder.decode(T.self, from: data)
    }

    // MARK: Orders

    /// The client's own fulfillment orders. One read, twice if it has to be:
    /// with the designer embed, then — only on a 400, which is PostgREST
    /// refusing the relationship — without it. The `DecisionsAPIClient` idiom:
    /// a naming surprise costs the designer's name, never the orders.
    public func orders() async throws -> [RemoteFulfillmentOrder] {
        do {
            return try await orders(select: RemoteFulfillmentOrder.selectColumns + Self.designerEmbed)
        } catch RoomsAPIError.http(let status, let body) where status == 400 {
            PatinaLog.sync.error(
                "[Fulfillment] designer embed refused (400): \(body). Retrying without it."
            )
            return try await orders(select: RemoteFulfillmentOrder.selectColumns)
        }
    }

    private func orders(select: String) async throws -> [RemoteFulfillmentOrder] {
        try await get("/rest/v1/fulfillment_orders", [
            URLQueryItem(name: "select", value: select),
            URLQueryItem(name: "order", value: "intake_at.desc"),
        ])
    }

    /// The lines of the given orders — where the state machine actually lives.
    /// Empty in, empty out: an unfiltered `in.()` is a syntax error, not an
    /// empty result.
    public func orderItems(orderIds: [String]) async throws -> [RemoteFulfillmentOrderItem] {
        guard !orderIds.isEmpty else { return [] }
        return try await get("/rest/v1/fulfillment_order_items", [
            URLQueryItem(name: "select", value: RemoteFulfillmentOrderItem.selectColumns),
            URLQueryItem(name: "order_id", value: "in.(\(orderIds.joined(separator: ",")))"),
            URLQueryItem(name: "order", value: "line_index.asc"),
        ])
    }

    /// Every shipment the client is allowed to see — and that is exactly what
    /// comes back, with no `order_id` filter, because there is nothing to
    /// filter on.
    ///
    /// ⚠ THE GAP, stated where the code meets it. `fulfillment_shipments` hangs
    /// off `fulfillment_vendor_pos` (00350:161), the client's policy is the
    /// boolean `fulfillment_po_belongs_to_caller(po_id)` (00540:946-949), and
    /// `fulfillment_vendor_pos` has NO client policy at all (00350:305-331) —
    /// by design, because the PO carries the operator's cost. A PostgREST
    /// embed through it is filtered by that table's own RLS and returns null
    /// for everyone. So the app can read that a shipment of hers exists, its
    /// carrier, its tracking and its dates, and cannot tell which of her orders
    /// it belongs to once she has more than one.
    ///
    /// `ClientOrderBuilder` therefore attaches a shipment ONLY where the
    /// attribution is certain (see `attachShipments`). Closing this properly
    /// is one line of SQL and belongs to the backend lane.
    public func shipments() async throws -> [RemoteFulfillmentShipment] {
        try await get("/rest/v1/fulfillment_shipments", [
            URLQueryItem(name: "select", value: RemoteFulfillmentShipment.selectColumns),
            URLQueryItem(name: "order", value: "created_at.desc"),
        ])
    }

    /// The client's own direct orders. RLS (`direct_orders_select_own`, 00276)
    /// already scopes this to `client_id = auth.uid()`; the explicit filter is
    /// belt-and-braces and costs nothing.
    public func directOrders(clientId: String?) async throws -> [ClientDirectOrder] {
        var query = [
            URLQueryItem(name: "select", value: ClientDirectOrder.selectColumns),
            URLQueryItem(name: "order", value: "created_at.desc"),
        ]
        if let clientId, !clientId.isEmpty {
            query.append(URLQueryItem(name: "client_id", value: "eq.\(clientId)"))
        }
        return try await get("/rest/v1/direct_orders", query)
    }

    // MARK: Terms

    /// `get_direct_order_terms()` — one row, always. A missing config key
    /// yields null text and `false` for the flag, so the screen can never
    /// promise tax or delivery the rail was not told to keep.
    public func orderTerms() async throws -> OrderResponsibilityTerms {
        var request = URLRequest(
            url: baseURL.appendingPathComponent("/rest/v1/rpc/get_direct_order_terms")
        )
        request.httpMethod = "POST"
        await applyHeaders(to: &request)
        request.httpBody = Data("{}".utf8)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        // `RETURNS TABLE` renders as an array of one.
        guard let terms = try decoder.decode([OrderResponsibilityTerms].self, from: data).first
        else { throw RoomsAPIError.emptyResponse }
        return terms
    }
}
