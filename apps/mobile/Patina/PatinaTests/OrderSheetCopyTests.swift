//
//  OrderSheetCopyTests.swift
//  PatinaTests
//
//  W5 · C1 — M5a's money rows and the sentence that must not outrun its
//  setting.
//
//  Critique M14, in one line: W5 ships `automatic_tax` + `shipping_options`
//  behind a server setting that defaults OFF, and with it off nothing is
//  added — so "Delivery and tax are added at payment" would be false, which is
//  exactly the C5 failure this program exists to repair. B §5's own text gates
//  it: "true only once the delta above ships; until then Path A does not ship."
//

import Testing
import Foundation
@testable import Patina

struct OrderSheetCopyTests {

    private let enabled = DirectOrderTerms(
        responsibilityParagraph: "Patina is responsible for delivery, damage and returns on this order.",
        contact: "patina.cloud/help",
        taxShippingEnabled: true
    )

    private let disabled = DirectOrderTerms(
        responsibilityParagraph: "Patina is responsible for delivery, damage and returns on this order.",
        contact: "patina.cloud/help",
        taxShippingEnabled: false
    )

    // MARK: - Money

    @Test("a piece with no freight prints one money row, at its real price")
    func onePieceRow() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil
        )
        #expect(content.moneyRows.count == 1)
        #expect(content.moneyRows[0].label == "Piece")
        #expect(content.moneyRows[0].value == "$4,200.00")
    }

    @Test("freight draws its own row, and only where the catalogue carries one")
    func freightRow() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(shippingFlatCents: 18_000),
            terms: enabled, fitLine: nil
        )
        // With two components the sheet prints the sum as well — the reader
        // must never be the one adding them up.
        #expect(content.moneyRows.map(\.label) == ["Piece", "Delivery", "Total"])
        #expect(content.moneyRows[1].value == "$180.00")
        #expect(content.moneyRows[2].value == "$4,380.00")

        // One component: the Piece row already IS the total.
        let zero = OrderSheetContent.make(
            product: PurchaseFixture.piece(shippingFlatCents: 0), terms: enabled, fitLine: nil
        )
        #expect(zero.moneyRows.map(\.label) == ["Piece"])
    }

    @Test("the sheet prints the session's total, not one it computed")
    func sheetPrintsTheOrdersOwnFigure() {
        // The RPC folds freight into `amount_cents` and snapshots the unit
        // price; the sheet reads those back rather than re-multiplying.
        let order = PurchaseFixture.order(
            amountCents: 858_000, unitPriceCents: 420_000, quantity: 2
        )
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(shippingFlatCents: 18_000),
            terms: enabled, fitLine: nil, order: order
        )
        #expect(content.moneyRows[0].value == "$8,400.00")
        // The Total row is the row's own `amount_cents`, not a figure the app
        // re-multiplied — this is the number the Checkout session will bill.
        #expect(content.moneyRows.last?.label == "Total")
        #expect(content.moneyRows.last?.value == order.formattedTotal)
        #expect(order.formattedTotal == "$8,580.00")
    }

    // MARK: - M14

    @Test("with the setting ON the sheet may promise delivery and tax, and the act is live")
    func taxEnabledBranch() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil
        )
        #expect(content.taxLine
                == "Delivery and tax are added at payment. You'll see the full total before you pay.")
        #expect(content.isPrimaryEnabled)
        #expect(content.disabledReason == nil)
    }

    @Test("with the setting OFF the sheet says so and Path A does not complete")
    func taxDisabledBranch() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: disabled, fitLine: nil
        )
        #expect(content.taxLine == "Delivery and tax are not included yet.")
        #expect(!content.isPrimaryEnabled)
        #expect(content.disabledReason == OrderFailureCopy.taxShippingDisabled)
        #expect(content.disabledReason?.contains("not included yet") == true)
    }

    @Test("terms that could not be read are treated as OFF")
    func unknownTermsKeepPathAOff() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: .unknown, fitLine: nil
        )
        #expect(!content.isPrimaryEnabled)
        #expect(content.taxLine == "Delivery and tax are not included yet.")
        #expect(content.responsibilityParagraph == nil)
        #expect(content.contactLine == nil)
    }

    // MARK: - Who is responsible

    @Test("sold-by names Patina for a managed piece and the maker otherwise")
    func soldByBranches() {
        #expect(OrderSheetContent.soldBy(PurchaseFixture.piece()) == "Sold and shipped by Patina.")
        #expect(OrderSheetContent.soldBy(
            PurchaseFixture.piece(patinaManaged: false)
        ) == "Sold by Nordic Atelier, Aarhus, Denmark.")
        #expect(OrderSheetContent.soldBy(
            PurchaseFixture.piece(makerLocation: nil, patinaManaged: false)
        ) == "Sold by Nordic Atelier.")
    }

    @Test("the responsibility paragraph and the contact come from the server, verbatim")
    func responsibilityComesFromConfig() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil
        )
        #expect(content.responsibilityParagraph == enabled.responsibilityParagraph)
        #expect(content.contactLine == "Questions or damage: patina.cloud/help")
    }

    @Test("the sheet promises Safari and no wallet")
    func safariNote() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil
        )
        #expect(content.safariNote == "Payment opens securely in Safari.")
        #expect(!content.safariNote.contains("Apple Pay"))
    }

    // MARK: - The specs the gate guarantees

    @Test("size and lead time are both printed, in the mock's words")
    func specRows() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil
        )
        #expect(content.specRows.map(\.label) == ["Dimensions", "Lead time"])
        #expect(content.specRows[0].value == "84″ W × 38″ D × 30″ H")
        #expect(content.specRows[1].value == "Made to order · ships in 10 weeks")
    }

    @Test("the fit line draws only when one was handed in")
    func fitLineIsOptional() {
        let without = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil
        )
        #expect(without.fitLine == nil)
        let with = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled,
            fitLine: "Your Living Room's longest wall is 18 ft. This table is 7 ft."
        )
        #expect(with.fitLine?.contains("18 ft") == true)
    }

    // MARK: - Attribution

    @Test("the credited inset is absent until the server names a designer")
    func creditedInsetWaitsForTheServer() {
        let beforeCreate = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil
        )
        #expect(beforeCreate.creditedInset == nil)

        let uncredited = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil,
            order: PurchaseFixture.order(designerId: nil)
        )
        #expect(uncredited.creditedInset == nil)
    }

    @Test("once the server names one, the inset says whose rate it is and whose price it isn't")
    func creditedInsetCopy() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil,
            order: PurchaseFixture.order(designerId: "a0000000-0000-0000-0000-000000000004"),
            designerFirstName: "Leah"
        )
        let inset = try? #require(content.creditedInset)
        #expect(inset?.contains("Ordered in your name.") == true)
        #expect(inset?.contains("Leah sees it") == true)
        #expect(inset?.contains("the piece's trade rate") == true)
        #expect(inset?.contains("This doesn't change your price.") == true)
    }

    @Test("an unnamed designer is 'Your designer', never a guess")
    func creditedInsetWithoutAName() {
        let content = OrderSheetContent.make(
            product: PurchaseFixture.piece(), terms: enabled, fitLine: nil,
            order: PurchaseFixture.order(designerId: "a0000000-0000-0000-0000-000000000004"),
            designerFirstName: nil
        )
        #expect(content.creditedInset?.hasPrefix("Ordered in your name. Your designer sees it")
                == true)
    }

    // MARK: - M5c

    @Test("Order placed names the piece and the total, and paints no tracker")
    func orderPlacedCopy() {
        let order = PurchaseFixture.order(status: "paid")
        let line = OrderPlacedView.summaryLine(order, taxShippingEnabled: false)
        #expect(line == "Heirloom Oak Dining Table · $4,200.00")
        #expect(!line.contains("delivery and tax"))
        #expect(OrderPlacedView.shipLine == "We'll email you when it ships.")
        #expect(OrderPlacedView.receiptLine == "A receipt is on its way to your inbox.")
    }

    @Test("Order placed names delivery and tax only where the session collected them")
    func orderPlacedSummaryBranches() {
        let order = PurchaseFixture.order(status: "paid")
        #expect(OrderPlacedView.summaryLine(order, taxShippingEnabled: true)
                == "Heirloom Oak Dining Table · $4,200.00 · total with delivery and tax")
        // The branch is reachable from the app: the view takes the setting as
        // a stored property and the piece screen passes the terms it read.
        // A default of `false` on the parameter was what made it dead.
        let placed = OrderPlacedView(
            order: order,
            responsibilityParagraph: nil,
            contactLine: nil,
            soldBy: "Sold and shipped by Patina.",
            taxShippingEnabled: true,
            onSeeOrder: nil,
            onBackToToday: {}
        )
        #expect(placed.taxShippingEnabled)
        #expect(placed.onSeeOrder == nil)
    }
}
