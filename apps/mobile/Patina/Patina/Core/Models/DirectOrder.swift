//
//  DirectOrder.swift
//  Patina
//
//  `public.direct_orders` (00276, widened by 00540) as the client may read it,
//  and the three terms the order sheet is allowed to print.
//
//  ⚠ The column list is load-bearing. 00540 §1b withdrew the table-wide SELECT
//  grant from `authenticated` and re-issued it as sixteen named columns so the
//  designer's `commission_rate` never leaves the server. A `select=*` on this
//  table is a 42501 for every signed-in client, so `DirectOrder.selectColumns`
//  is the only projection this app uses — and `commission_rate` is absent from
//  this type on purpose, not by oversight.
//

import Foundation

/// One row of `public.direct_orders`.
public struct DirectOrder: Codable, Sendable, Identifiable, Equatable {

    /// The sixteen columns 00540 §1b grants `authenticated`, in the migration's
    /// own order. Anything outside this list is a 42501.
    public static let selectColumns = [
        "id", "client_id", "product_id", "product_name", "quantity",
        "unit_price_cents", "amount_cents", "currency", "status",
        "stripe_checkout_session_id", "stripe_payment_intent_id", "shipping",
        "created_at", "paid_at", "designer_id", "project_id"
    ].joined(separator: ",")

    public let id: String
    public let productId: String?
    public let productName: String
    public let quantity: Int
    public let unitPriceCents: Int
    /// What the Checkout session will bill: quantity × unit price, plus the
    /// piece's freight where the catalogue carries one (00540 §6(ii) folds it
    /// in at create). The sheet prints this, never a figure it computed.
    public let amountCents: Int
    public let currency: String?
    public let status: String
    /// Present only once the server has resolved one. The sheet reads this and
    /// never guesses a designer client-side.
    public let designerId: String?
    public let projectId: String?
    public let paidAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, quantity, currency, status
        case productId = "product_id"
        case productName = "product_name"
        case unitPriceCents = "unit_price_cents"
        case amountCents = "amount_cents"
        case designerId = "designer_id"
        case projectId = "project_id"
        case paidAt = "paid_at"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        productId = try container.decodeIfPresent(String.self, forKey: .productId)
        productName = try container.decodeIfPresent(String.self, forKey: .productName) ?? ""
        quantity = try container.decodeIfPresent(Int.self, forKey: .quantity) ?? 1
        unitPriceCents = try container.decodeIfPresent(Int.self, forKey: .unitPriceCents) ?? 0
        amountCents = try container.decodeIfPresent(Int.self, forKey: .amountCents) ?? 0
        currency = try container.decodeIfPresent(String.self, forKey: .currency)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "pending_payment"
        designerId = try container.decodeIfPresent(String.self, forKey: .designerId)
        projectId = try container.decodeIfPresent(String.self, forKey: .projectId)
        paidAt = DirectOrder.timestamp(try container.decodeIfPresent(String.self, forKey: .paidAt))
    }

    public init(
        id: String,
        productId: String? = nil,
        productName: String = "",
        quantity: Int = 1,
        unitPriceCents: Int = 0,
        amountCents: Int = 0,
        currency: String? = "USD",
        status: String = "pending_payment",
        designerId: String? = nil,
        projectId: String? = nil,
        paidAt: Date? = nil
    ) {
        self.id = id
        self.productId = productId
        self.productName = productName
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.amountCents = amountCents
        self.currency = currency
        self.status = status
        self.designerId = designerId
        self.projectId = projectId
        self.paidAt = paidAt
    }

    /// The one transition the app waits for. `pending_payment` and `canceled`
    /// are not settled and `refunded` is not a settlement either.
    public var isSettled: Bool { status == "paid" }

    public var isCanceled: Bool { status == "canceled" }

    /// `$4,200.00` — the session's real total, formatted once.
    public var formattedTotal: String {
        PatinaCurrency.format(cents: amountCents, currencyCode: currency ?? "USD")
    }

    private static func timestamp(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = withFraction.date(from: raw) { return parsed }
        return ISO8601DateFormatter().date(from: raw)
    }
}

// MARK: - Terms

/// `get_direct_order_terms()` — the three `fulfillment_config` values the order
/// sheet is allowed to print, resolved by the server so the sheet can never
/// promise delivery or tax the rail was not told to keep (00540 §5).
///
/// The RPC always returns exactly one row; a missing config key yields a NULL
/// text and `false` for the flag.
public struct DirectOrderTerms: Codable, Sendable, Equatable {
    public let responsibilityParagraph: String?
    public let contact: String?
    public let taxShippingEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case responsibilityParagraph = "responsibility_paragraph"
        case contact
        case taxShippingEnabled = "tax_shipping_enabled"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        responsibilityParagraph = DirectOrderTerms.nonEmpty(
            try container.decodeIfPresent(String.self, forKey: .responsibilityParagraph)
        )
        contact = DirectOrderTerms.nonEmpty(
            try container.decodeIfPresent(String.self, forKey: .contact)
        )
        taxShippingEnabled =
            try container.decodeIfPresent(Bool.self, forKey: .taxShippingEnabled) ?? false
    }

    public init(
        responsibilityParagraph: String? = nil,
        contact: String? = nil,
        taxShippingEnabled: Bool = false
    ) {
        self.responsibilityParagraph = responsibilityParagraph
        self.contact = contact
        self.taxShippingEnabled = taxShippingEnabled
    }

    /// What the app assumes when the terms cannot be read at all: nothing is
    /// promised and Path A does not complete.
    public static let unknown = DirectOrderTerms()

    private static func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
