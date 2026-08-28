//
//  OrderStateDerivationTests.swift
//  PatinaTests
//
//  `fulfillment_orders` has no status column — 00350 says so in its own table
//  comment, and Q6 makes the derivation the contract. These tests are that
//  contract: the order is the MINIMUM live line stage, the operator's stages
//  are folded onto the client's vocabulary, and the date is the wire's own.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct OrderStateDerivationTests {

    private let base = Date(timeIntervalSince1970: 1_787_000_000)

    private func line(
        _ state: String,
        entered: Date? = nil,
        index: Int = 0,
        order: String = "order-1"
    ) -> RemoteFulfillmentOrderItem {
        RemoteFulfillmentOrderItem(
            id: "line-\(index)-\(state)",
            order_id: order,
            product_id: "product-1",
            item_name: "Heirloom Oak Dining Table",
            qty: 1,
            unit_price_cents: 420_000,
            line_state: state,
            line_state_entered_at: (entered ?? base).ISO8601Format(),
            line_index: index,
            created_at: base.ISO8601Format(),
            updated_at: base.ISO8601Format()
        )
    }

    // MARK: - The ladder

    @Test("intake and split read as Confirmed — the client was told neither word")
    func intakeAndSplitAreConfirmed() {
        #expect(ClientOrderState.fromLineState("intake") == .confirmed)
        #expect(ClientOrderState.fromLineState("split") == .confirmed)
    }

    @Test("transmitted and acknowledged are operator stages and also read as Confirmed")
    func operatorStagesAreConfirmed() {
        // `_shared/fulfillment-templates.ts` gives the client six transitions
        // and neither of these is among them: they are Patina talking to a
        // workshop. Painting them as steps would be a tracker the client was
        // never promised.
        #expect(ClientOrderState.fromLineState("transmitted") == .confirmed)
        #expect(ClientOrderState.fromLineState("acknowledged") == .confirmed)
    }

    @Test("settled reads as Delivered — the money closing is not a seventh step")
    func settledIsDelivered() {
        #expect(ClientOrderState.fromLineState("settled") == .delivered)
        #expect(ClientOrderState.fromLineState("delivered") == .delivered)
    }

    @Test("an unknown line stage maps to nothing rather than to a guess")
    func unknownStageIsNil() {
        #expect(ClientOrderState.fromLineState("teleported") == nil)
    }

    // MARK: - The minimum

    @Test("the order sits at the LEAST advanced of its lines")
    func theOrderIsTheMinimumLineStage() {
        let derived = ClientOrderBuilder.derive(lines: [
            line("delivered", index: 0),
            line("in_production", index: 1),
            line("shipped", index: 2),
        ])
        #expect(derived.state == .inProduction)
    }

    @Test("one line, one state")
    func aSingleLineDecidesAlone() {
        #expect(ClientOrderBuilder.derive(lines: [line("shipped")]).state == .shipped)
    }

    @Test("a cancelled line does not drag the order backwards")
    func cancelledLinesAreExcludedFromTheMinimum() {
        let derived = ClientOrderBuilder.derive(lines: [
            line("cancelled", index: 0),
            line("shipped", index: 1),
        ])
        #expect(derived.state == .shipped)
    }

    @Test("every line cancelled means the order is cancelled")
    func allCancelledIsCancelled() {
        let derived = ClientOrderBuilder.derive(lines: [
            line("cancelled", index: 0),
            line("cancelled", index: 1),
        ])
        #expect(derived.state == .cancelled)
    }

    @Test("an order whose lines this reader cannot see is Confirmed with no date — not paidNotOnRail")
    func noLinesIsConfirmedWithoutADate() {
        // The order row exists, so it IS on the rail. What is missing is the
        // lines, and the honest answer to "how far" is a date-less Confirmed
        // rather than a claim that it never got there.
        let derived = ClientOrderBuilder.derive(lines: [])
        #expect(derived.state == .confirmed)
        #expect(derived.enteredAt == nil)
    }

    // MARK: - The date

    @Test("the state's date is the LATEST entry among the lines that define it")
    func theDateIsTheLastDefiningLineToArrive() {
        let early = base
        let late = base.addingTimeInterval(3600)
        let derived = ClientOrderBuilder.derive(lines: [
            line("in_production", entered: early, index: 0),
            line("in_production", entered: late, index: 1),
            line("shipped", entered: base.addingTimeInterval(7200), index: 2),
        ])
        #expect(derived.state == .inProduction)
        #expect(derived.enteredAt == late)
    }

    @Test("lines further along do not lend their dates to the state below them")
    func aheadLinesDoNotSetTheDate() {
        let production = base
        let shipped = base.addingTimeInterval(86_400)
        let derived = ClientOrderBuilder.derive(lines: [
            line("in_production", entered: production, index: 0),
            line("shipped", entered: shipped, index: 1),
        ])
        #expect(derived.enteredAt == production)
    }

    // MARK: - What draws

    @Test("only the four real steps draw a rail")
    func onlyRailStatesDrawARail() {
        #expect(ClientOrderState.confirmed.drawsRail)
        #expect(ClientOrderState.inProduction.drawsRail)
        #expect(ClientOrderState.shipped.drawsRail)
        #expect(ClientOrderState.delivered.drawsRail)
        // The whole point of the wave's "no painted tracker" rule.
        #expect(!ClientOrderState.paidNotOnRail.drawsRail)
        #expect(!ClientOrderState.refunded.drawsRail)
        #expect(!ClientOrderState.cancelled.drawsRail)
    }

    @Test("the rail is M8's four labels, in M8's order")
    func theRailLabelsMatchTheMock() {
        #expect(ClientOrderState.railSteps.compactMap(\.railLabel)
                == ["Confirmed", "In production", "Shipped", "Delivered"])
    }
}
