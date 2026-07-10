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
        if case let .generic(message) = mapped("something_unknown") {
            #expect(message == "some detail")
        } else {
            Issue.record("expected .generic carrying the detail")
        }
    }

    // MARK: - Route names

    @Test
    func invoiceRouteNames() {
        #expect(AppRoute.invoiceList.displayName == "Invoices")
        #expect(AppRoute.invoiceDetail(invoiceId: "i").displayName == "Invoice")
    }
}
