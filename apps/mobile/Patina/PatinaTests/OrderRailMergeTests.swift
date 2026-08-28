//
//  OrderRailMergeTests.swift
//  PatinaTests
//
//  M8 is "one list over both rails". The failure it exists to prevent is a
//  client seeing her own dining table twice — once as a paid direct order and
//  once as the fulfillment row that same payment settled into. The merge key,
//  the ordering, and the shipment-attribution rule are pinned here.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct OrderRailMergeTests {

    private let base = Date(timeIntervalSince1970: 1_787_000_000)

    // MARK: Fixtures

    private func fulfillment(
        id: String = "ful-1",
        pi: String? = "pi_abc",
        designerProfileId: String? = nil,
        designerName: String? = nil,
        attribution: [String: AnyCodable]? = nil,
        intake: Date? = nil,
        total: Int = 471_200
    ) -> RemoteFulfillmentOrder {
        RemoteFulfillmentOrder(
            id: id,
            order_no: 1042,
            stripe_payment_intent_id: pi,
            client_profile_id: "client-1",
            designer_profile_id: designerProfileId,
            designer_attribution: attribution,
            captured_total_cents: total,
            product_subtotal_cents: 420_000,
            freight_charged_cents: 18_000,
            tax_cents: 33_200,
            intake_at: (intake ?? base).ISO8601Format(),
            created_at: (intake ?? base).ISO8601Format(),
            designer: designerName.map {
                RemoteDesignerRef(
                    id: designerProfileId, display_name: $0,
                    full_name: $0, business_name: "Hartwell Studio"
                )
            }
        )
    }

    private func line(
        _ state: String, order: String = "ful-1", index: Int = 0,
        name: String = "Heirloom Oak Dining Table", entered: Date? = nil
    ) -> RemoteFulfillmentOrderItem {
        RemoteFulfillmentOrderItem(
            id: "line-\(order)-\(index)", order_id: order, product_id: "product-1",
            item_name: name, qty: 1, unit_price_cents: 420_000,
            line_state: state,
            line_state_entered_at: (entered ?? base).ISO8601Format(),
            line_index: index,
            created_at: base.ISO8601Format(), updated_at: base.ISO8601Format()
        )
    }

    private func direct(
        id: String = "dir-1",
        status: String = "paid",
        pi: String? = "pi_abc",
        paid: Date? = nil,
        designerId: String? = nil
    ) -> ClientDirectOrder {
        ClientDirectOrder(
            id: id, product_id: "product-1",
            product_name: "Heirloom Oak Dining Table",
            quantity: 1, unit_price_cents: 420_000, amount_cents: 438_000,
            currency: "USD", status: status,
            stripe_checkout_session_id: "cs_1", stripe_payment_intent_id: pi,
            created_at: base.ISO8601Format(),
            paid_at: (paid ?? base).ISO8601Format(),
            designer_id: designerId, project_id: nil
        )
    }

    private func shipment(
        id: String = "shp-1", po: String = "po-1",
        carrier: String? = "UPS", tracking: String? = "1Z999AA10123456784"
    ) -> RemoteFulfillmentShipment {
        RemoteFulfillmentShipment(
            id: id, po_id: po, mode: "ltl", carrier: carrier, tracking: tracking,
            shipped_at: base.addingTimeInterval(86_400).ISO8601Format(),
            delivered_at: nil,
            current_eta: "2026-09-18",
            created_at: base.ISO8601Format()
        )
    }

    // MARK: The merge

    @Test("a settled direct order and its fulfillment row are ONE row, on the fulfillment rail")
    func theSamePurchaseIsNotListedTwice() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment()],
            items: [line("shipped")],
            shipments: [],
            directOrders: [direct()]
        )
        #expect(rows.count == 1)
        #expect(rows[0].rail == .fulfillment)
        #expect(rows[0].state == .shipped)
        #expect(rows[0].directOrderId == "dir-1")
    }

    @Test("the merge falls back to designer_attribution.direct_order_id when the PI ids differ")
    func attributionIsTheSecondaryMergeKey() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment(pi: "pi_other", attribution: [
                "source": AnyCodable("direct_order"),
                "direct_order_id": AnyCodable("dir-1"),
            ])],
            items: [line("in_production")],
            shipments: [],
            directOrders: [direct(pi: "pi_abc")]
        )
        #expect(rows.count == 1)
        #expect(rows[0].directOrderId == "dir-1")
    }

    @Test("a settled direct order is marked as the reader's own, not the designer's")
    func aSettledDirectOrderIsTheReadersOwn() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment(designerProfileId: "leah", designerName: "Leah Hartwell")],
            items: [line("shipped")],
            shipments: [],
            directOrders: [direct()]
        )
        #expect(rows[0].placedBy == .reader)
        #expect(ClientOrderCopy.attributionFooter(rows[0], projectName: nil) == "You ordered this.")
        // The designer is still credited on the row — she is just not the buyer.
        #expect(rows[0].designerId == "leah")
    }

    @Test("a fulfillment order with no direct order behind it is the designer's, by first name")
    func anUnmatchedFulfillmentRowIsDesignerSourced() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment(designerProfileId: "leah", designerName: "Leah Hartwell")],
            items: [line("in_production", name: "Woven Jute Area Rug 8x10")],
            shipments: [],
            directOrders: []
        )
        #expect(rows[0].placedBy == .designer(firstName: "Leah"))
        #expect(ClientOrderCopy.placedByLabel(rows[0]) == "Ordered by Leah")
        #expect(ClientOrderCopy.attributionFooter(rows[0], projectName: "Aspen Loft Refresh")
                == "Leah ordered this for Aspen Loft Refresh.")
    }

    @Test("with no name anywhere the row says 'your designer' and never invents one")
    func anUnnamedDesignerIsNotGuessed() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment(designerProfileId: "leah")],
            items: [line("shipped")],
            shipments: [],
            directOrders: []
        )
        #expect(ClientOrderCopy.placedByLabel(rows[0]) == "Ordered by your designer")
    }

    @Test("the app's own designer name is used only where the order's embed brought none")
    func theFallbackNameFillsTheGap() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment(designerProfileId: "leah")],
            items: [line("shipped")],
            shipments: [],
            directOrders: [],
            designerFallbackFirstName: "Leah"
        )
        #expect(rows[0].designerFirstName == "Leah")
    }

    // MARK: The direct rail alone

    @Test("a paid direct order that has not reached the rail is one row with NO rail")
    func paidButNotYetOnTheRail() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [], items: [], shipments: [],
            directOrders: [direct(pi: nil)]
        )
        #expect(rows.count == 1)
        #expect(rows[0].rail == .direct)
        #expect(rows[0].state == .paidNotOnRail)
        #expect(!rows[0].state.drawsRail)
        #expect(ClientOrderCopy.stateLine(rows[0])
                .hasSuffix("We'll email you when it ships."))
    }

    @Test("an unpaid or abandoned direct order is not an order and is not listed")
    func unpaidOrdersDoNotDraw() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [], items: [], shipments: [],
            directOrders: [
                direct(id: "dir-pending", status: "pending_payment", pi: nil),
                direct(id: "dir-canceled", status: "canceled", pi: nil),
            ]
        )
        #expect(rows.isEmpty)
    }

    @Test("a refunded direct order says so, and draws no rail")
    func refundedDirectOrder() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [], items: [], shipments: [],
            directOrders: [direct(status: "refunded", pi: nil)]
        )
        #expect(rows[0].state == .refunded)
        #expect(!rows[0].state.drawsRail)
        #expect(ClientOrderCopy.stateLine(rows[0]).hasPrefix("Refunded"))
    }

    @Test("a refund on the direct rail overrides the line stages of its fulfillment row")
    func aRefundWinsOverTheLineStages() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment()],
            items: [line("shipped")],
            shipments: [],
            directOrders: [direct(status: "refunded")]
        )
        #expect(rows.count == 1)
        #expect(rows[0].state == .refunded)
    }

    // MARK: Order

    @Test("newest first, by the date the money moved")
    func newestFirst() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [
                fulfillment(id: "ful-old", pi: "pi_old", intake: base),
                fulfillment(id: "ful-new", pi: "pi_new",
                            intake: base.addingTimeInterval(86_400)),
            ],
            items: [line("shipped", order: "ful-old"), line("intake", order: "ful-new")],
            shipments: [],
            directOrders: []
        )
        #expect(rows.map(\.recordId) == ["ful-new", "ful-old"])
    }

    @Test("the routing id names its rail, because two rails are two tables")
    func theIdIsPrefixed() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment()], items: [line("shipped")],
            shipments: [], directOrders: []
        )
        #expect(rows[0].id == "fulfillment:ful-1")

        let directRows = ClientOrderBuilder.build(
            fulfillmentOrders: [], items: [], shipments: [],
            directOrders: [direct(pi: nil)]
        )
        #expect(directRows[0].id == "direct:dir-1")
    }

    // MARK: Shipments — the attribution rule

    @Test("with exactly one order on the rail, the policy proves the shipment is that order's")
    func oneOrderMakesTheShipmentCertain() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [fulfillment()],
            items: [line("shipped")],
            shipments: [shipment()],
            directOrders: []
        )
        #expect(rows[0].carrier == "UPS")
        #expect(rows[0].tracking == "1Z999AA10123456784")
        #expect(CarrierTracking.url(carrier: rows[0].carrier, tracking: rows[0].tracking) != nil)
    }

    @Test("with two orders on the rail nothing is attached — a tracking number on the wrong piece is worse than none")
    func twoOrdersLeaveTheShipmentUnattributed() {
        // There is no client-readable path from a shipment's `po_id` to an
        // `order_id` (00350:305-331 gives `fulfillment_vendor_pos` no client
        // policy, deliberately). So with two orders the app does not know, and
        // says nothing.
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [
                fulfillment(id: "ful-1", pi: "pi_1"),
                fulfillment(id: "ful-2", pi: "pi_2"),
            ],
            items: [line("shipped", order: "ful-1"), line("shipped", order: "ful-2")],
            shipments: [shipment()],
            directOrders: []
        )
        #expect(rows.allSatisfy { $0.carrier == nil && $0.tracking == nil })
        // The state machine is untouched: it comes from the lines, not the
        // shipment.
        #expect(rows.allSatisfy { $0.state == .shipped })
    }

    @Test("a direct-rail row never takes a shipment, even as the only order")
    func aDirectRowIsNeverGivenAShipment() {
        let rows = ClientOrderBuilder.build(
            fulfillmentOrders: [], items: [], shipments: [shipment()],
            directOrders: [direct(pi: nil)]
        )
        #expect(rows[0].carrier == nil)
    }

    // MARK: Carrier links

    @Test("an unknown carrier resolves to no URL rather than a guessed one")
    func anUnknownCarrierHasNoLink() {
        #expect(CarrierTracking.url(carrier: "Bob's Vans", tracking: "12345") == nil)
        #expect(CarrierTracking.url(carrier: "UPS", tracking: "  ") == nil)
        #expect(CarrierTracking.url(carrier: nil, tracking: "1Z9") == nil)
    }

    @Test("carrier names normalise, so 'UPS Freight' and 'ups-freight' are one row")
    func carrierNamesNormalise() {
        #expect(CarrierTracking.normalise("UPS Freight") == CarrierTracking.normalise("ups-freight"))
        #expect(CarrierTracking.url(carrier: "FedEx Freight", tracking: "1234") != nil)
    }

    @Test("the row names the carrier where it knows it")
    func theRowNamesTheCarrier() {
        #expect(CarrierTracking.label(carrier: "UPS") == "Track with UPS")
        #expect(CarrierTracking.label(carrier: nil) == "Track with the carrier")
    }

    // MARK: The contact

    @Test("the responsibility contact resolves by its own shape, and refuses a word")
    func theContactResolves() {
        #expect(OrderContactLink.url(for: "hello@patina.cloud")?.scheme == "mailto")
        #expect(OrderContactLink.url(for: "+1 (555) 010-2030")?.scheme == "tel")
        #expect(OrderContactLink.url(for: "https://patina.cloud/help")?.scheme == "https")
        // Direction B §5: "an address or a number, not the word 'support'".
        #expect(OrderContactLink.url(for: "support") == nil)
        #expect(OrderContactLink.url(for: "") == nil)
    }

    @Test("blank config text draws nothing rather than a heading over air")
    func blankTermsDrawNothing() {
        let blank = OrderResponsibilityTerms(
            responsibility_paragraph: "   ", contact: "", tax_shipping_enabled: false
        )
        #expect(blank.paragraph == nil)
        #expect(blank.reachableContact == nil)
    }
}
