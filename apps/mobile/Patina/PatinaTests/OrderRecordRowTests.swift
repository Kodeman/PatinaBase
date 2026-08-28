//
//  OrderRecordRowTests.swift
//  PatinaTests
//
//  The record's `orderMoved` rows. `HouseRecordRow.Kind.orderMoved` shipped in
//  W2 with no producer; W5 wrote one, and the rule that matters most is the one
//  about what does NOT draw: placing an order is the reader's own act, and the
//  Record does not report the reader to himself.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct OrderRecordRowTests {

    private let base = Date(timeIntervalSince1970: 1_787_000_000)

    private func order(
        id: String = "ful-1",
        rail: ClientOrder.Rail = .fulfillment,
        state: ClientOrderState,
        entered: Date? = nil,
        shipped: Date? = nil,
        delivered: Date? = nil,
        placedBy: ClientOrderPlacedBy = .reader,
        title: String = "Heirloom Oak Dining Table"
    ) -> ClientOrder {
        ClientOrder(
            rail: rail, recordId: id, title: title, additionalLineCount: 0,
            productId: "product-1", amountCents: 420_000, currency: "USD",
            placedAt: base, state: state, stateEnteredAt: entered ?? base,
            placedBy: placedBy, projectId: nil, designerId: nil,
            carrier: nil, tracking: nil,
            shippedAt: shipped, deliveredAt: delivered, currentEta: nil,
            directOrderId: nil
        )
    }

    // MARK: What draws

    @Test("a shipped order is a MOVED row, named with the piece")
    func shippedDraws() {
        let rows = HouseRecordBuilder.orderRows([order(state: .shipped)])
        #expect(rows.count == 1)
        #expect(rows[0].kind == .orderMoved)
        #expect(rows[0].title == "Heirloom Oak Dining Table shipped.")
    }

    @Test("in production and delivered draw too, each in its own words")
    func theOtherTwoMovements() {
        #expect(HouseRecordBuilder.orderTitle(order(state: .inProduction))
                == "Heirloom Oak Dining Table is being made.")
        #expect(HouseRecordBuilder.orderTitle(order(state: .delivered))
                == "Heirloom Oak Dining Table arrived.")
    }

    @Test("the row routes to the order, carrying its prefixed id")
    func theRowRoutes() {
        let rows = HouseRecordBuilder.orderRows([order(state: .shipped)])
        #expect(rows[0].route == .orderDetail(orderId: "fulfillment:ful-1"))
        #expect(rows[0].id == "order:fulfillment:ful-1")
    }

    // MARK: What does NOT draw

    @Test("'Order placed' is the reader's own act and is NOT a row")
    func placingAnOrderIsNotNews() {
        // Both shapes of "I just bought this": the direct-rail paid window and
        // the fulfillment intake it settles into.
        let rows = HouseRecordBuilder.orderRows([
            order(id: "dir-1", rail: .direct, state: .paidNotOnRail),
            order(id: "ful-1", state: .confirmed)
        ])
        #expect(rows.isEmpty)
    }

    @Test("a designer-placed order is still not a row at Confirmed — the intake is not a movement")
    func evenTheDesignersIntakeIsNotAMovement() {
        let rows = HouseRecordBuilder.orderRows([
            order(state: .confirmed, placedBy: .designer(firstName: "Leah"))
        ])
        #expect(rows.isEmpty)
    }

    @Test("cancelled and refunded are not movements in the house")
    func moneyGoingBackIsNotAMovement() {
        let rows = HouseRecordBuilder.orderRows([
            order(id: "a", state: .cancelled),
            order(id: "b", state: .refunded)
        ])
        #expect(rows.isEmpty)
    }

    @Test("a movement the wire will not date does not draw at all")
    func anUndatedMovementDoesNotDraw() {
        let undated = ClientOrder(
            rail: .fulfillment, recordId: "ful-1", title: "Velvet Club Chair",
            additionalLineCount: 0, productId: nil, amountCents: 180_000,
            currency: "USD", placedAt: base, state: .shipped,
            stateEnteredAt: nil, placedBy: .reader, projectId: nil,
            designerId: nil, carrier: nil, tracking: nil,
            shippedAt: nil, deliveredAt: nil, currentEta: nil, directOrderId: nil
        )
        #expect(HouseRecordBuilder.orderRows([undated]).isEmpty)
    }

    // MARK: The date

    @Test("the shipment's own date wins over the line's when both exist")
    func theShipmentDates() {
        let shippedAt = base.addingTimeInterval(86_400)
        let rows = HouseRecordBuilder.orderRows([
            order(state: .shipped, entered: base, shipped: shippedAt)
        ])
        #expect(rows[0].date == shippedAt)
    }

    @Test("without a shipment the line's own entry date is used, never 'now'")
    func theLineDates() {
        let entered = base.addingTimeInterval(-3600)
        let rows = HouseRecordBuilder.orderRows([order(state: .shipped, entered: entered)])
        #expect(rows[0].date == entered)
    }

    // MARK: Attribution on the row

    @Test("the second line names the designer only when it was not the reader who ordered")
    func theDetailNamesTheDesigner() {
        let mine = HouseRecordBuilder.orderRows([order(state: .shipped)])
        #expect(mine[0].detail == nil)

        let hers = HouseRecordBuilder.orderRows([
            order(state: .shipped, placedBy: .designer(firstName: "Leah"))
        ])
        #expect(hers[0].detail == "Ordered by Leah")
    }

    // MARK: Through the whole builder

    @Test("the record composes the row and dates it inside the window")
    func theBuilderEmitsTheRow() {
        let shippedAt = base.addingTimeInterval(-3600)
        let record = HouseRecordBuilder.build(
            from: BadgeCountService.shared,
            saved: [], products: [], story: nil, liveLead: nil,
            lastSeen: base.addingTimeInterval(-86_400),
            orders: [order(state: .shipped, entered: shippedAt, shipped: shippedAt)],
            now: base
        )
        #expect(record.moved.contains { $0.kind == .orderMoved })
        #expect(record.moved.first { $0.kind == .orderMoved }?.isNew == true)
    }

    @Test("an order that moved before the window does not draw on the card")
    func anOldMovementFallsOutOfTheWindow() {
        let old = base.addingTimeInterval(-30 * 24 * 3600)
        let record = HouseRecordBuilder.build(
            from: BadgeCountService.shared,
            saved: [], products: [], story: nil, liveLead: nil,
            lastSeen: base.addingTimeInterval(-86_400),
            orders: [order(state: .shipped, entered: old, shipped: old)],
            now: base
        )
        #expect(!record.moved.contains { $0.kind == .orderMoved })
    }

    @Test("the record snapshot round-trips an order row's route")
    func theRouteSurvivesAColdLaunch() throws {
        let row = HouseRecordBuilder.orderRows([order(state: .shipped)])[0]
        let record = HouseRecord(
            needsYou: [], moved: [row],
            window: DateInterval(start: base.addingTimeInterval(-604_800), end: base),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let restored = try decoder.decode(
            HouseRecord.self, from: encoder.encode(record)
        )
        #expect(restored.moved[0].route == .orderDetail(orderId: "fulfillment:ful-1"))
    }
}
