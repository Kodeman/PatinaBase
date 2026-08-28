//
//  ClientOrder.swift
//  Patina
//
//  One order, whichever rail it arrived on — M8's "one list over both rails".
//  The type exists because the two rails only mean anything together: a piece
//  the client bought herself (`direct_orders`) and a piece her designer bought
//  for her (`fulfillment_orders`) are the same question — "where is it" — and
//  answering it twice in two shapes is how the app ends up with two truths.
//
//  Honesty rules the whole file (C5):
//   • the state is DERIVED from the line stages and never stored (Q6,
//     direction B §5, 00350's own comment on `fulfillment_orders`);
//   • an order that is paid and has not reached the fulfillment rail draws NO
//     rail at all — "Paid · we'll email you when it ships." — because a
//     four-step tracker over an order with no line state is a painted one;
//   • a shipment is attached only where the wire proves which order it belongs
//     to (see `attachShipments`), because a tracking number on the wrong piece
//     is worse than no tracking number.
//

import Foundation

// MARK: - State

/// Where an order is, derived. The vocabulary is the client's, not the
/// operator's: `_shared/fulfillment-templates.ts:38-49` gives the client six
/// transitions, and `transmitted` / `acknowledged` / `split` are not among them
/// — those are stages between Patina and a workshop, and the client was never
/// told about them.
enum ClientOrderState: String, Sendable, Equatable, CaseIterable {
    /// Paid, and not yet on the fulfillment rail. No rail draws.
    case paidNotOnRail
    case confirmed
    case inProduction
    case shipped
    case delivered
    case cancelled
    case refunded

    /// The four steps M8 paints, in order. `paidNotOnRail`, `cancelled` and
    /// `refunded` are deliberately absent — none of them is a step on a rail.
    static let railSteps: [ClientOrderState] = [.confirmed, .inProduction, .shipped, .delivered]

    var railLabel: String? {
        switch self {
        case .confirmed: return "Confirmed"
        case .inProduction: return "In production"
        case .shipped: return "Shipped"
        case .delivered: return "Delivered"
        case .paidNotOnRail, .cancelled, .refunded: return nil
        }
    }

    /// Whether the four-step rail draws for this state at all.
    var drawsRail: Bool { Self.railSteps.contains(self) }

    /// How far along the rail, for the "done / now / to come" split.
    var railIndex: Int? { Self.railSteps.firstIndex(of: self) }

    /// The line stages 00350:104-106 defines, folded onto the client's six.
    /// `intake` and `split` are one word to her: it is confirmed.
    static func fromLineState(_ raw: String) -> ClientOrderState? {
        switch raw {
        case "intake", "split", "transmitted", "acknowledged": return .confirmed
        case "in_production": return .inProduction
        case "shipped": return .shipped
        case "delivered", "settled": return .delivered
        case "cancelled": return .cancelled
        default: return nil
        }
    }

    /// Rank for the "minimum line stage" derivation. Cancelled sits outside
    /// the ladder: it is not a stage an order passes through.
    var progressRank: Int {
        switch self {
        case .paidNotOnRail: return 0
        case .confirmed: return 1
        case .inProduction: return 2
        case .shipped: return 3
        case .delivered: return 4
        case .cancelled, .refunded: return Int.max
        }
    }
}

// MARK: - Attribution

/// Who placed the order. The list says it plainly under every card, because
/// "Leah bought me a rug" and "I bought a table" are different facts and M8
/// prints both.
enum ClientOrderPlacedBy: Sendable, Equatable {
    /// The reader bought it (a direct order of her own).
    case reader
    /// A designer bought it onto the client's job. `firstName` is nil when the
    /// embed brought no name — the copy then says "your designer", never a
    /// guess.
    case designer(firstName: String?)
}

// MARK: - The order

struct ClientOrder: Identifiable, Sendable, Equatable {

    /// Which table the row came from. Two rails, two tables, and a bare uuid
    /// cannot say which — so `id` is prefixed and `AppRoute.orderDetail`
    /// carries the prefixed token.
    enum Rail: String, Sendable, Equatable {
        case fulfillment
        case direct
    }

    let rail: Rail
    /// The row's own uuid, unprefixed.
    let recordId: String
    /// `"fulfillment:<uuid>"` / `"direct:<uuid>"` — the routing token.
    var id: String { Self.routingToken(rail: rail, recordId: recordId) }

    /// The one place the token is minted, so a caller in another feature
    /// cannot mint a different shape. The purchase path's terminal CTA
    /// (`Order placed.` → `See your order`) navigates with a `direct_orders`
    /// id; it should pass `routingToken(rail: .direct, recordId:)`, and
    /// `OrdersService.order(withId:)` resolves a bare uuid either way.
    static func routingToken(rail: Rail, recordId: String) -> String {
        "\(rail.rawValue):\(recordId)"
    }

    /// What the client bought. The first line's name for a fulfillment order,
    /// `direct_orders.product_name` for a direct one.
    let title: String
    /// How many further lines the order carries beyond the one named.
    let additionalLineCount: Int
    /// The catalogue id of the named piece, when the wire carried one — the
    /// detail screen's route back to the piece.
    let productId: String?

    let amountCents: Int
    let currency: String
    /// When the money moved. `paid_at` on the direct rail, `intake_at` on the
    /// fulfillment one. Never substituted with "now".
    let placedAt: Date?

    let state: ClientOrderState
    /// When the order entered `state` — the real `line_state_entered_at` of
    /// the lines that define it. Nil where the wire gives no date, and the
    /// screen then prints no date rather than today's.
    let stateEnteredAt: Date?

    let placedBy: ClientOrderPlacedBy
    /// The project the order belongs to, when the attribution named one.
    let projectId: String?
    let designerId: String?

    /// Carrier and tracking, attached only where the wire proves the shipment
    /// is this order's (see `ClientOrderBuilder.attachShipments`).
    let carrier: String?
    let tracking: String?
    let shippedAt: Date?
    let deliveredAt: Date?
    let currentEta: Date?

    /// The direct order behind a settled fulfillment row, when there is one.
    /// Its presence is what makes `placedBy == .reader`.
    let directOrderId: String?

    /// The designer's first name, wherever the copy needs one.
    var designerFirstName: String? {
        if case .designer(let firstName) = placedBy { return firstName }
        return nil
    }

    var isAttributed: Bool {
        if case .designer = placedBy { return true }
        return designerId != nil
    }
}

// MARK: - The merge

@MainActor
enum ClientOrderBuilder {

    /// Compose the list. Pure — it issues no query, so every rule below is
    /// testable and none of them can be true on a screen and false in a test.
    ///
    /// - Parameters:
    ///   - designerFallbackFirstName: the name the app already knows for the
    ///     client's designer, used only where an order's own embed brought
    ///     none. Nil leaves the row unattributed rather than guessing.
    static func build(
        fulfillmentOrders: [RemoteFulfillmentOrder],
        items: [RemoteFulfillmentOrderItem],
        shipments: [RemoteFulfillmentShipment],
        directOrders: [ClientDirectOrder],
        designerFallbackFirstName: String? = nil
    ) -> [ClientOrder] {
        let itemsByOrder = Dictionary(grouping: items, by: \.order_id)

        // The merge key. `stripe_payment_intent_id` is stamped on both tables
        // by the same settle, so it is the one key that holds whether or not a
        // designer was attached; `designer_attribution.direct_order_id` is the
        // secondary, and only exists when one was.
        var directByPaymentIntent: [String: ClientDirectOrder] = [:]
        for order in directOrders {
            if let pi = order.stripe_payment_intent_id, !pi.isEmpty {
                directByPaymentIntent[pi] = order
            }
        }
        let directById = Dictionary(
            directOrders.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }
        )

        var settledDirectIds: Set<String> = []
        var rows: [ClientOrder] = []

        for order in fulfillmentOrders {
            let lines = itemsByOrder[order.id] ?? []
            let behind = order.stripe_payment_intent_id.flatMap { directByPaymentIntent[$0] }
                ?? order.attributedDirectOrderId.flatMap { directById[$0] }
            if let behind { settledDirectIds.insert(behind.id) }

            rows.append(fulfillmentRow(
                order: order,
                lines: lines,
                behind: behind,
                designerFallbackFirstName: designerFallbackFirstName
            ))
        }

        for order in directOrders {
            guard !settledDirectIds.contains(order.id),
                  let row = directRow(order, designerFallbackFirstName: designerFallbackFirstName)
            else { continue }
            rows.append(row)
        }

        return attachShipments(to: rows, shipments: shipments)
            .sorted { lhs, rhs in
                (lhs.placedAt ?? .distantPast, lhs.id) > (rhs.placedAt ?? .distantPast, rhs.id)
            }
    }

    // MARK: The fulfillment rail

    private static func fulfillmentRow(
        order: RemoteFulfillmentOrder,
        lines: [RemoteFulfillmentOrderItem],
        behind: ClientDirectOrder?,
        designerFallbackFirstName: String?
    ) -> ClientOrder {
        let named = lines.min { ($0.line_index ?? 0) < ($1.line_index ?? 0) }
        let derived = derive(lines: lines)
        let refunded = behind?.status == "refunded"

        let placedBy: ClientOrderPlacedBy = behind != nil
            ? .reader
            : .designer(firstName: firstName(
                of: order.designer?.personName ?? order.designer?.displayName
            ) ?? designerFallbackFirstName)

        return ClientOrder(
            rail: .fulfillment,
            recordId: order.id,
            title: named?.item_name ?? behind?.product_name ?? "Your order",
            additionalLineCount: max(0, lines.count - 1),
            productId: named?.product_id ?? behind?.product_id,
            amountCents: order.captured_total_cents ?? behind?.amount_cents ?? 0,
            currency: behind?.currency ?? "USD",
            placedAt: behind?.paid_at.flatMap(ISO8601DateParsing.dateOrDay(from:))
                ?? order.intake_at.flatMap(ISO8601DateParsing.dateOrDay(from:)),
            state: refunded ? .refunded : derived.state,
            stateEnteredAt: refunded ? nil : derived.enteredAt,
            placedBy: placedBy,
            projectId: order.attributedProjectId ?? behind?.project_id,
            designerId: order.designer_profile_id ?? behind?.designer_id,
            carrier: nil, tracking: nil, shippedAt: nil, deliveredAt: nil, currentEta: nil,
            directOrderId: behind?.id
        )
    }

    /// Q6's derivation, in one place: **the minimum line stage**, and the date
    /// the lines sitting at that stage last entered it.
    ///
    /// An order with no readable lines is `confirmed` with no date — the
    /// intake happened (the order row exists) and nothing further is known.
    /// It is not `paidNotOnRail`: the order IS on the rail; the lines are what
    /// this reader could not see.
    static func derive(
        lines: [RemoteFulfillmentOrderItem]
    ) -> (state: ClientOrderState, enteredAt: Date?) {
        let live = lines.filter { $0.line_state != "cancelled" }
        guard !live.isEmpty else {
            guard !lines.isEmpty else { return (.confirmed, nil) }
            return (.cancelled, enteredAt(of: lines))
        }
        let states = live.compactMap { ClientOrderState.fromLineState($0.line_state) }
        guard let lowest = states.min(by: { $0.progressRank < $1.progressRank }) else {
            return (.confirmed, nil)
        }
        let defining = live.filter { ClientOrderState.fromLineState($0.line_state) == lowest }
        return (lowest, enteredAt(of: defining))
    }

    /// When the lines that define the state last moved into it. The latest of
    /// them, because the order reached the state only once the last of those
    /// lines did.
    private static func enteredAt(of lines: [RemoteFulfillmentOrderItem]) -> Date? {
        lines.compactMap { $0.line_state_entered_at.flatMap(ISO8601DateParsing.dateOrDay(from:)) }
            .max()
    }

    // MARK: The direct rail

    /// A direct order that has NOT reached the fulfillment rail.
    ///
    /// `pending_payment` and `canceled` never draw: an order that was never
    /// paid for is not an order, and a list that showed abandoned Checkout
    /// sessions would answer "where is it" with "nowhere".
    private static func directRow(
        _ order: ClientDirectOrder,
        designerFallbackFirstName: String?
    ) -> ClientOrder? {
        let paidAt = order.paid_at.flatMap(ISO8601DateParsing.dateOrDay(from:))
        let state: ClientOrderState
        switch order.status {
        case "paid": state = .paidNotOnRail
        case "refunded": state = .refunded
        default: return nil
        }

        return ClientOrder(
            rail: .direct,
            recordId: order.id,
            title: order.product_name ?? "Your order",
            additionalLineCount: 0,
            productId: order.product_id,
            amountCents: order.amount_cents ?? 0,
            currency: order.currency ?? "USD",
            placedAt: paidAt ?? order.created_at.flatMap(ISO8601DateParsing.dateOrDay(from:)),
            state: state,
            stateEnteredAt: paidAt,
            // She bought it. The attribution on the row is the designer's
            // credit, not the buyer — and the footer says who bought it.
            placedBy: .reader,
            projectId: order.project_id,
            designerId: order.designer_id,
            carrier: nil, tracking: nil, shippedAt: nil, deliveredAt: nil, currentEta: nil,
            directOrderId: order.id
        )
    }

    // MARK: Shipments

    /// Attach carrier and tracking — ONLY where the wire proves which order a
    /// shipment belongs to.
    ///
    /// `fulfillment_shipments` hangs off `fulfillment_vendor_pos` (00350:161),
    /// and the client's policy is the boolean `fulfillment_po_belongs_to_caller`
    /// (00540:946-949). `fulfillment_vendor_pos` has no client policy at all —
    /// deliberately, because the PO carries the operator's cost — so nothing
    /// readable maps a `po_id` to an `order_id`.
    ///
    /// What the policy DOES prove is that every shipment returned sits under
    /// one of this client's orders. So where the client has exactly ONE order
    /// on the fulfillment rail, the attribution is certain and the shipment is
    /// attached. Where she has two or more, it is not, and the carrier row does
    /// not draw. The state machine is unaffected either way: `line_state` lives
    /// on `fulfillment_order_items`, which is order-scoped and readable.
    ///
    /// This is a deliberate degradation with a one-line backend fix (a client
    /// SELECT on `fulfillment_vendor_pos` narrowed to `(id, order_id)`, or a
    /// `client_order_shipments()` definer reader). It is not a workaround
    /// pretending to be a feature.
    static func attachShipments(
        to orders: [ClientOrder],
        shipments: [RemoteFulfillmentShipment]
    ) -> [ClientOrder] {
        let onRail = orders.filter { $0.rail == .fulfillment }
        guard onRail.count == 1, let target = onRail.first, !shipments.isEmpty else {
            return orders
        }
        // The most recently created shipment carrying a tracking number is the
        // one the reader would follow; a shipment with no tracking has nothing
        // to attach.
        guard let shipment = shipments.first(where: {
            !($0.tracking ?? "").isEmpty && !($0.carrier ?? "").isEmpty
        }) ?? shipments.first else { return orders }

        return orders.map { order in
            guard order.id == target.id else { return order }
            return ClientOrder(
                rail: order.rail,
                recordId: order.recordId,
                title: order.title,
                additionalLineCount: order.additionalLineCount,
                productId: order.productId,
                amountCents: order.amountCents,
                currency: order.currency,
                placedAt: order.placedAt,
                state: order.state,
                stateEnteredAt: order.stateEnteredAt,
                placedBy: order.placedBy,
                projectId: order.projectId,
                designerId: order.designerId,
                carrier: shipment.carrier,
                tracking: shipment.tracking,
                shippedAt: shipment.shipped_at.flatMap(ISO8601DateParsing.dateOrDay(from:)),
                deliveredAt: shipment.delivered_at.flatMap(ISO8601DateParsing.dateOrDay(from:)),
                currentEta: shipment.current_eta.flatMap(ISO8601DateParsing.dateOrDay(from:)),
                directOrderId: order.directOrderId
            )
        }
    }

    /// The first word of a person's name. A studio's whole name goes through
    /// untouched elsewhere; this is only ever called on a person's field
    /// (`personName`), for the same reason the Record halves no studio (MJ-A).
    static func firstName(of name: String?) -> String? {
        guard let name, !name.isEmpty else { return nil }
        return name.split(separator: " ").first.map(String.init) ?? name
    }
}

// MARK: - Copy

/// Every sentence M8 prints, in one place, so the list card and the detail
/// screen cannot say two different things about one order.
enum ClientOrderCopy {

    /// The state line under the rail. Dates are the wire's own, or absent.
    static func stateLine(_ order: ClientOrder) -> String {
        switch order.state {
        case .paidNotOnRail:
            // No painted tracker (build-plan W5, direction B §5's M8 sheet).
            guard let paid = order.placedAt else { return "Paid. We'll email you when it ships." }
            return "Paid \(DateDisplay.short(paid)). We'll email you when it ships."
        case .confirmed:
            guard let at = order.stateEnteredAt else { return "Confirmed." }
            return "Confirmed \(DateDisplay.short(at))."
        case .inProduction:
            if case .designer(let name) = order.placedBy {
                // M8: a designer-sourced order says who is watching it, rather
                // than leaving a blank rail.
                return "\(name ?? "Your designer") updates this as it moves."
            }
            guard let at = order.stateEnteredAt else { return "In production." }
            return "In production since \(DateDisplay.short(at))."
        case .shipped:
            let shipped = order.shippedAt ?? order.stateEnteredAt
            let head = shipped.map { "Shipped \(DateDisplay.short($0))" } ?? "Shipped"
            guard let eta = order.currentEta else { return "\(head)." }
            return "\(head) · arriving \(DateDisplay.short(eta))."
        case .delivered:
            let at = order.deliveredAt ?? order.stateEnteredAt
            return at.map { "Delivered \(DateDisplay.short($0))." } ?? "Delivered."
        case .cancelled:
            let at = order.stateEnteredAt
            return at.map { "Cancelled \(DateDisplay.short($0))." } ?? "Cancelled."
        case .refunded:
            let at = order.stateEnteredAt ?? order.placedAt
            return at.map { "Refunded \(DateDisplay.short($0))." } ?? "Refunded."
        }
    }

    /// `$4,200.00 · paid Sep 3` — and **only** for an order the reader paid
    /// for herself.
    ///
    /// A designer-sourced order prints no money at all, which is exactly what
    /// M8's second card does. Two claims the wire will not support otherwise:
    /// `fulfillment_orders.captured_total_cents` is what Patina captured on the
    /// designer's rail, not what this reader was billed (a designer-sourced
    /// piece bills on the invoice rail); and `intake_at` is when the order
    /// reached the rail, not when anybody paid.
    static func moneyLine(_ order: ClientOrder) -> String? {
        guard case .reader = order.placedBy else { return nil }
        let amount = PatinaCurrency.format(cents: order.amountCents, currencyCode: order.currency)
        guard let placed = order.placedAt else { return amount }
        return "\(amount) · paid \(DateDisplay.short(placed))"
    }

    /// The label over the amount on the detail screen. `PAID` is a claim, and
    /// it stops being true once the money came back — so it follows the state
    /// rather than being printed unconditionally over a refunded order.
    /// Nil where `moneyLine` is nil, for the same reason.
    static func moneyLabel(_ order: ClientOrder) -> String? {
        guard case .reader = order.placedBy else { return nil }
        return order.state == .refunded ? "REFUNDED" : "PAID"
    }

    /// The footer. M8 prints one under every card.
    static func attributionFooter(_ order: ClientOrder, projectName: String?) -> String {
        switch order.placedBy {
        case .reader:
            return "You ordered this."
        case .designer(let name):
            let who = name ?? "Your designer"
            guard let projectName, !projectName.isEmpty else { return "\(who) ordered this for you." }
            return "\(who) ordered this for \(projectName)."
        }
    }
}
