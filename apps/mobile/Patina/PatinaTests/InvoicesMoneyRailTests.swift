//
//  InvoicesMoneyRailTests.swift
//  PatinaTests
//
//  Wave 2 / D.2: pins InvoicesAPIClient's decode paths against the portal wire
//  shapes, the balance/payable/settled computed helpers, the checkout error-code
//  mapping, and the invoice route names.
//

import Testing
import Foundation
@testable import Patina

struct InvoicesMoneyRailTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - Decode + balance/payable

    @Test
    func decodesSentInvoiceAndIsPayable() throws {
        let json = """
        {
          "id": "inv-1", "project_id": "proj-1", "designer_id": "des-1",
          "client_id": "cli-1", "invoice_number": "INV-0001", "status": "sent",
          "issue_date": "2026-07-01", "due_date": "2026-07-15",
          "currency": "USD", "subtotal_cents": 100000, "tax_rate": 0.08,
          "tax_cents": 8000, "total_cents": 108000, "amount_paid_cents": 0,
          "memo": "Thanks!", "sent_at": "2026-07-01T00:00:00Z",
          "paid_at": null, "voided_at": null, "void_reason": null,
          "created_at": "2026-07-01T00:00:00Z",
          "project": { "id": "proj-1", "name": "Downtown Loft" },
          "designer": { "id": "des-1", "full_name": "Leah Kim", "business_name": null },
          "line_items": [
            { "id": "l1", "invoice_id": "inv-1", "kind": "milestone",
              "description": "Deposit", "quantity": 1, "unit_amount_cents": 100000,
              "amount_cents": 100000, "sort_order": 0 }
          ],
          "payments": []
        }
        """
        let invoice = try decode(RemoteInvoice.self, json)
        #expect(invoice.invoice_number == "INV-0001")
        #expect(invoice.currencyCode == "USD")
        #expect(invoice.balanceCents == 108_000)
        #expect(invoice.isPayable)
        #expect(!invoice.stripeSettled)
        #expect(invoice.designer?.displayName == "Leah Kim")
        #expect(invoice.line_items?.first?.amount_cents == 100_000)
    }

    @Test
    func partiallyPaidBalanceAndStripeSettled() throws {
        let json = """
        {
          "id": "inv-2", "status": "partially_paid", "currency": "USD",
          "total_cents": 100000, "amount_paid_cents": 40000,
          "payments": [
            { "id": "p1", "invoice_id": "inv-2", "amount_cents": 40000,
              "method": "stripe", "status": "succeeded",
              "stripe_payment_intent_id": "pi_1", "received_at": "2026-07-05T00:00:00Z" }
          ]
        }
        """
        let invoice = try decode(RemoteInvoice.self, json)
        #expect(invoice.isPartiallyPaid)
        #expect(invoice.balanceCents == 60_000)
        #expect(invoice.isPayable)
        #expect(invoice.stripeSettled)
    }

    @Test
    func inFlightStripePaymentBlocksPay() throws {
        let json = """
        {
          "id": "inv-3", "status": "sent", "total_cents": 100000, "amount_paid_cents": 0,
          "payments": [
            { "id": "p1", "invoice_id": "inv-3", "amount_cents": 100000,
              "method": "stripe", "status": "pending", "stripe_payment_intent_id": "pi_2" }
          ]
        }
        """
        let invoice = try decode(RemoteInvoice.self, json)
        #expect(invoice.hasProcessingStripePayment)
        #expect(invoice.hasPendingPayment)
        #expect(!invoice.isPayable)
    }

    @Test
    func voidInvoiceIsNotPayable() throws {
        let json = """
        { "id": "inv-4", "status": "void", "total_cents": 100000, "amount_paid_cents": 0, "payments": [] }
        """
        let invoice = try decode(RemoteInvoice.self, json)
        #expect(invoice.isVoid)
        #expect(!invoice.isPayable)
        #expect(invoice.balanceCents == 100_000)
    }

    @Test
    func paidInvoiceStripeSettledEvenWithoutStripePayment() throws {
        let json = """
        { "id": "inv-5", "status": "paid", "total_cents": 100000, "amount_paid_cents": 100000, "payments": [] }
        """
        let invoice = try decode(RemoteInvoice.self, json)
        #expect(invoice.isPaid)
        #expect(invoice.stripeSettled)
        #expect(invoice.balanceCents == 0)
    }

    @Test
    func designerDisplayNameFallsBackToBusinessName() throws {
        let json = """
        { "id": "inv-6", "status": "sent", "total_cents": 1000,
          "designer": { "id": "d", "full_name": null, "business_name": "Kim Studio" } }
        """
        let invoice = try decode(RemoteInvoice.self, json)
        #expect(invoice.designer?.displayName == "Kim Studio")
    }

    // MARK: - Checkout error mapping

    @Test
    func checkoutErrorMapsEdgeCodes() {
        func mapped(_ code: String?) -> CheckoutError {
            CheckoutError.from(code: code, detail: "some detail")
        }
        if case .notPayable = mapped("invoice_not_payable") {} else { Issue.record("expected .notPayable") }
        if case .paymentProcessing = mapped("payment_processing") {} else {
            Issue.record("expected .paymentProcessing")
        }
        if case .nothingDue = mapped("nothing_due") {} else { Issue.record("expected .nothingDue") }
        if case .notConfigured = mapped("stripe_not_configured") {} else {
            Issue.record("expected .notConfigured")
        }
        if case .notFound = mapped("invoice_not_found") {} else { Issue.record("expected .notFound") }
        // SP-15 / C5: an unrecognised code used to become `.generic(detail)`,
        // which put the vendor's words on the payment screen. It is now a
        // payload-free case.
        if case .unavailable = mapped("something_unknown") {} else {
            Issue.record("expected .unavailable, carrying nothing from the server")
        }
    }

    // MARK: - SP-15 · the failure speaks Patina, never the vendor

    @Test("an unknown checkout failure never carries the vendor's words")
    func unknownCheckoutErrorDropsTheVendorDetail() {
        let vendor = "Invalid API Key provided: sk_test_********************alls"
        let failure = MoneyFailureCopy.checkout(CheckoutError.from(code: nil, detail: vendor))
        #expect(!failure.sentence.contains("sk_test"))
        #expect(!failure.sentence.contains("API Key"))
        #expect(failure.sentence == "We couldn't start this payment. Nothing has been charged.")
        #expect(failure.retryLabel == "Let's try that again")
        #expect(failure.offersDesignerMessage)
    }

    @Test("every money failure is one plain sentence, whatever was thrown")
    func everyThrownErrorMapsToPatinaVoice() {
        let raw = NSError(domain: "PostgrestError", code: 500, userInfo: [
            NSLocalizedDescriptionKey: "PGRST202 sk_test_51Q https://api.stripe.com/v1/customers"
        ])
        let failures = [
            MoneyFailureCopy.checkout(raw),
            MoneyFailureCopy.sign(raw),
            // m-1: the decision copy takes no error, because it never branched
            // on one. It is listed here so the honesty assertions still cover
            // every money surface's words.
            MoneyFailureCopy.decision,
            MoneyFailureCopy.deferral
        ]
        for failure in failures {
            #expect(!failure.sentence.contains("PGRST"))
            #expect(!failure.sentence.contains("sk_test"))
            #expect(!failure.sentence.lowercased().contains("stripe"))
            #expect(!failure.sentence.lowercased().contains("http"))
            #expect(failure.sentence.hasSuffix("."))
            #expect(failure.retryLabel == "Let's try that again")
        }
    }

    @Test("every checkout code has its own true sentence")
    func mappedCheckoutCodesKeepTheirOwnCopy() {
        #expect(MoneyFailureCopy.checkout(CheckoutError.notConfigured).sentence
                == "Online payment isn't set up for this invoice yet. Your designer can sort it out.")
        #expect(MoneyFailureCopy.checkout(CheckoutError.nothingDue).offersDesignerMessage == false)
        // B-3: `payment_processing` covers a card in the webhook gap as well as
        // a settling ACH debit, so this branch must not name a bank transfer.
        // Only the settle banner, which reads the payment row's own method,
        // may print that sentence.
        #expect(MoneyFailureCopy.checkout(CheckoutError.paymentProcessing).sentence
                == "A payment on this invoice is already going through. We'll update this as soon as it clears.")
        #expect(!MoneyFailureCopy.checkout(CheckoutError.paymentProcessing).sentence
                .contains("3–5 business days"))
        // No checkout branch may guess at the method behind a payment.
        let allCodes: [CheckoutError] = [
            .notPayable, .paymentProcessing, .nothingDue, .notConfigured, .notFound, .unavailable
        ]
        for code in allCodes {
            #expect(!MoneyFailureCopy.checkout(code).sentence.lowercased().contains("bank transfer"),
                    "\(code) names a payment method it cannot know")
        }
        // errorDescription is the same sentence, so a stray LocalizedError read
        // anywhere in the app still cannot print a vendor string.
        #expect(CheckoutError.unavailable.errorDescription
                == MoneyFailureCopy.checkout(CheckoutError.unavailable).sentence)
    }

    @Test("no sign error can be constructed with a server message")
    func signErrorsCarryNoServerPayload() {
        let mapped = ProposalSignError.map(NSError(
            domain: "PostgrestError", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "duplicate key value violates unique constraint"]
        ))
        if case .unexpected = mapped {} else { Issue.record("expected .unexpected") }
        #expect(MoneyFailureCopy.sign(mapped).sentence
                == "We couldn't record your signature. Nothing has been signed.")
    }

    // MARK: - SP-15 · the settle banner tells the truth

    @Test("an unconfirmed payment is not called a bank transfer unless it is one")
    func settleBannerDefaultsToTheTruth() throws {
        let card = try decode(RemoteInvoice.self, """
        { "id": "i", "status": "sent", "total_cents": 425000, "amount_paid_cents": 0,
          "payments": [{ "id": "p", "method": "stripe", "status": "pending",
                         "stripe_payment_intent_id": "pi_1" }] }
        """)
        #expect(InvoiceSettleCopy.unconfirmed(card)
                == "We haven't seen this payment yet. We'll update this as soon as it clears.")
        #expect(!InvoiceSettleCopy.processing(card).contains("3–5 business days"))

        let bank = try decode(RemoteInvoice.self, """
        { "id": "i2", "status": "sent", "total_cents": 425000, "amount_paid_cents": 0,
          "payments": [{ "id": "p2", "method": "ach_manual", "status": "pending" }] }
        """)
        #expect(InvoiceSettleCopy.unconfirmed(bank).contains("3–5 business days"))
        #expect(InvoiceSettleCopy.processing(bank).contains("3–5 business days"))
    }

    @Test("a paid invoice with no payment rows says so honestly")
    func paidInvoiceWithNoRowsIsNotCalledUnpaid() throws {
        let paid = try decode(RemoteInvoice.self, """
        { "id": "i3", "status": "paid", "total_cents": 425000,
          "amount_paid_cents": 425000, "payments": [] }
        """)
        #expect(InvoiceSettleCopy.noPayments(paid)
                == "Paid in full. Your designer recorded this payment outside Patina.")
        let open = try decode(RemoteInvoice.self, """
        { "id": "i4", "status": "sent", "total_cents": 425000,
          "amount_paid_cents": 0, "payments": [] }
        """)
        #expect(InvoiceSettleCopy.noPayments(open) == "No payments recorded yet.")
    }

    // MARK: - Route names

    @Test
    func invoiceRouteNames() {
        #expect(AppRoute.invoiceList.displayName == "Invoices")
        #expect(AppRoute.invoiceDetail(invoiceId: "i").displayName == "Invoice")
    }

    // MARK: - The Pay act is never under the dock (ruling 1)

    /// The dock height is the sum of what `CompanionHearthView.collapsedView`
    /// and the overlay actually draw. Pinned here so a change to either one
    /// fails this instead of silently re-colliding with the Pay button.
    @Test("the dock's height matches what the Companion draws")
    func dockHeightTracksTheCompanion() {
        #expect(CompanionHearthMetrics.collapsedDiameter == CompanionConstants.buttonSize)
        #expect(CompanionHearthMetrics.captionRowHeight == CompanionConstants.minimumTouchTarget)
        #expect(CompanionHearthMetrics.dockHeight == 140)
    }

    /// The money clearance is measured against the dock, not against
    /// `reservedHeight` — which is 20 points shorter than the dock draws.
    @Test("a money screen's bottom inset clears the dock, not just the Hearth")
    func moneyClearanceClearsTheDock() {
        #expect(MoneyScreenMetrics.bottomClearance(houseFirst: false)
                >= CompanionHearthMetrics.dockHeight)
        #expect(CompanionHearthMetrics.dockHeight > CompanionHearthMetrics.reservedHeight)
    }

    /// An inset only moves a scroll view's resting position, so the three
    /// screens that pin a money act also make the dock yield to its corner
    /// mark; nothing else does.
    @Test("only the pinned-money screens make the dock yield")
    func pinnedMoneyScreensYieldTheDock() {
        for route: AppRoute in [
            .invoiceDetail(invoiceId: "i"),
            .proposalDetail(proposalId: "p"),
            .decisionDetail(decisionId: "d")
        ] {
            #expect(CompanionHearthMetrics.yieldsToPinnedFooter(for: route), "\(route) kept the full dock")
        }
        for route: AppRoute in [.heroFrame, .invoiceList, .proposalList, .decisionList, .budget] {
            #expect(!CompanionHearthMetrics.yieldsToPinnedFooter(for: route), "\(route) yielded without a pinned act")
        }
    }

    /// The policy is only a fix if the overlay reads it: `displayMode` must
    /// resolve these routes to `.minimal` before it reaches the nudge, which
    /// is what put a caption over the failure banner.
    @Test("the overlay resolves a yielding route to the minimal dock")
    func overlayHonoursTheYield() throws {
        let source = try SourcePin.read("Patina/Features/Companion/Views/CompanionOverlay.swift")
        // W3/B-2 widened the call: the policy now takes the root, because on
        // the house-first root there is no dock to yield, only a fixed bar slot
        // (`waves/w3/n1-notes.md` §2b). The ordering this test exists to pin —
        // the yield resolves BEFORE the nudge — is unchanged.
        let yield = try #require(source.range(of: "yieldsToPinnedFooter("))
        let minimal = try #require(
            source.range(of: "houseFirst: coordinator.isHouseFirstRoot\n        ) { return .minimal }")
        )
        let nudge = try #require(source.range(of: "CompanionActionProvider.nudge("))
        #expect(yield.lowerBound < nudge.lowerBound)
        #expect(minimal.lowerBound < nudge.lowerBound)
    }
}
