//
//  OrderResolutionTests.swift
//  PatinaTests
//
//  The C2 fix round. Two of these pin seams that exist on neither lane's branch
//  alone — the purchase path hands `.orderDetail` an id and this screen has to
//  find the order behind it — and the rest pin three sentences the app was
//  saying to a homeowner that were not true.
//

import Foundation
import Testing
@testable import Patina

struct OrderResolutionTests {

    // MARK: - Fixtures

    private static let paid = Date(timeIntervalSince1970: 1_787_000_000)

    private static func order(
        rail: ClientOrder.Rail,
        recordId: String,
        state: ClientOrderState = .confirmed,
        placedBy: ClientOrderPlacedBy = .reader,
        directOrderId: String? = nil
    ) -> ClientOrder {
        ClientOrder(
            rail: rail, recordId: recordId, title: "Heirloom Oak Dining Table",
            additionalLineCount: 0, productId: nil, amountCents: 420_000,
            currency: "USD", placedAt: paid, state: state, stateEnteredAt: paid,
            placedBy: placedBy, projectId: nil, designerId: nil,
            carrier: nil, tracking: nil, shippedAt: nil, deliveredAt: nil,
            currentEta: nil, directOrderId: directOrderId
        )
    }

    // MARK: - The token, and the id the purchase path hands over

    @Test("the routing token is minted in one place and matches the row's id")
    func theTokenHasOneMint() {
        let row = Self.order(rail: .direct, recordId: "d-1")
        #expect(row.id == ClientOrder.routingToken(rail: .direct, recordId: "d-1"))
        #expect(row.id == "direct:d-1")
        #expect(ClientOrder.routingToken(rail: .fulfillment, recordId: "f-1") == "fulfillment:f-1")
    }

    @Test("a bare direct_orders id resolves — the purchase path's terminal CTA")
    func aBareDirectIdResolves() {
        // `Order placed.` → `See your order` navigates straight off the row it
        // just created, carrying the raw `direct_orders.id`. Before the fix
        // that landed on "We couldn't find that order" — off a real charge.
        let rows = [Self.order(rail: .direct, recordId: "d-1", state: .paidNotOnRail,
                               directOrderId: "d-1")]
        #expect(OrdersService.resolve("d-1", in: rows)?.recordId == "d-1")
        #expect(OrdersService.resolve("direct:d-1", in: rows)?.recordId == "d-1")
    }

    @Test("a bare direct id still resolves once the order has become a fulfillment row")
    func aBareDirectIdFollowsTheMerge() {
        // By the time she taps, the settle may already have put the order on
        // the fulfillment rail under a different uuid. The direct id is carried
        // on the merged row, and that is what makes this hold.
        let rows = [Self.order(rail: .fulfillment, recordId: "f-9", directOrderId: "d-1")]
        #expect(OrdersService.resolve("d-1", in: rows)?.recordId == "f-9")
        #expect(OrdersService.resolve("fulfillment:f-9", in: rows)?.recordId == "f-9")
    }

    @Test("a prefixed token that names nothing resolves to nothing, not to the wrong rail")
    func aPrefixedMissStaysAMiss() {
        let rows = [Self.order(rail: .fulfillment, recordId: "f-9", directOrderId: "d-1")]
        #expect(OrdersService.resolve("direct:f-9", in: rows) == nil)
        #expect(OrdersService.resolve("unknown", in: rows) == nil)
    }

    // MARK: - The warm-session miss

    @Test("a miss on a warm session earns one re-read before the empty state draws")
    func aMissRefetchesOnce() {
        // `refreshIfNeeded()` is a no-op once Today or the Studio hub has
        // loaded, so an order minted since then is simply absent.
        #expect(OrdersService.shouldRefetchOnMiss(found: false, alreadyRefetched: false))
        // And exactly once — no loop.
        #expect(!OrdersService.shouldRefetchOnMiss(found: false, alreadyRefetched: true))
        #expect(!OrdersService.shouldRefetchOnMiss(found: true, alreadyRefetched: false))
    }

    // MARK: - Money that is only claimed where it is true

    @Test("a designer-sourced order prints no money line and no money label")
    func theDesignerRailPrintsNoMoney() {
        // `captured_total_cents` is what Patina captured on the designer's
        // rail and `intake_at` is not a payment date. M8's designer-sourced
        // card carries no money line at all.
        let row = Self.order(
            rail: .fulfillment, recordId: "f-1", state: .inProduction,
            placedBy: .designer(firstName: "Leah")
        )
        #expect(ClientOrderCopy.moneyLine(row) == nil)
        #expect(ClientOrderCopy.moneyLabel(row) == nil)
    }

    @Test("an order the reader paid for prints the amount and the date she paid")
    func theReaderRailPrintsMoney() {
        let row = Self.order(rail: .direct, recordId: "d-1", state: .paidNotOnRail)
        #expect(ClientOrderCopy.moneyLine(row)?.hasPrefix("$4,200.00 · paid ") == true)
        #expect(ClientOrderCopy.moneyLabel(row) == "PAID")
    }

    @Test("a refunded order is not labelled PAID")
    func aRefundedOrderIsNotLabelledPaid() {
        let row = Self.order(rail: .direct, recordId: "d-1", state: .refunded)
        #expect(ClientOrderCopy.moneyLabel(row) == "REFUNDED")
        #expect(ClientOrderCopy.stateLine(row).hasPrefix("Refunded"))
    }

    // MARK: - The contact that cannot be tapped

    @Test("a contact that resolves to no scheme is printed, not offered as a dead tap")
    func anUnlinkableContactIsPlain() {
        // Direction B §5 leaves this string to Kody. Today it is an address;
        // "Patina Concierge, 9–5 CT" is exactly as likely.
        #expect(OrderContactLink.url(for: "hello@patina.cloud")?.scheme == "mailto")
        #expect(OrderContactLink.url(for: "+1 512 555 0134")?.scheme == "tel")
        #expect(OrderContactLink.url(for: "https://patina.cloud/help")?.scheme == "https")
        #expect(OrderContactLink.url(for: "Patina Concierge, 9–5 CT") == nil)

        // …and the row that draws for it is the plain one, not a button.
        #expect(OrderDetailAction.contact(text: "Patina Concierge, 9–5 CT").id == "contact")
    }

    // MARK: - Old Dominion

    @Test("every carrier key in the map is reachable from a real carrier name")
    func everyCarrierKeyIsReachable() {
        // `normalise("Old Dominion")` is `olddominion`; the map once held
        // `oldedominion`, a key nothing could ever hit.
        #expect(CarrierTracking.url(carrier: "Old Dominion", tracking: "123456789") != nil)
        #expect(CarrierTracking.url(carrier: "ODFL", tracking: "123456789") != nil)
        #expect(CarrierTracking.url(carrier: "Pilot Freight", tracking: "123456789") == nil)
    }
}
