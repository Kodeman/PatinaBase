//
//  DirectOrderContractTests.swift
//  PatinaTests
//
//  W5 · C1 — the wire contract with 00540.
//
//  The load-bearing one is the column list. 00540 §1b withdrew the table-wide
//  SELECT grant on `direct_orders` from `authenticated` and re-issued it as
//  sixteen named columns, so the designer's `commission_rate` never leaves the
//  server. A `select=*` from this app would be a 42501 for every signed-in
//  client — and it would fail at runtime, on the poll, after the money moved.
//

import Testing
import Foundation
@testable import Patina

struct DirectOrderContractTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - The grant

    @Test("the order select names its columns and never asks for *")
    func selectNamesEveryColumn() {
        let columns = DirectOrder.selectColumns.split(separator: ",").map(String.init)
        #expect(!DirectOrder.selectColumns.contains("*"))
        #expect(columns.count == 16)
        // The sixteen 00540 §1b grants, verbatim.
        #expect(columns == [
            "id", "client_id", "product_id", "product_name", "quantity",
            "unit_price_cents", "amount_cents", "currency", "status",
            "stripe_checkout_session_id", "stripe_payment_intent_id", "shipping",
            "created_at", "paid_at", "designer_id", "project_id"
        ])
    }

    @Test("commission_rate is not a column this app reads")
    func commissionRateIsNotRequested() {
        #expect(!DirectOrder.selectColumns.contains("commission_rate"))
    }

    // MARK: - The row

    @Test("a real direct_orders row decodes")
    func rowDecodes() throws {
        let order = try decode(DirectOrder.self, """
        { "id": "d0000000-0000-0000-0000-0000000000a1",
          "client_id": "a0000000-0000-0000-0000-000000000005",
          "product_id": "a0000000-0000-0000-0000-000000000001",
          "product_name": "Heirloom Oak Dining Table",
          "quantity": 1, "unit_price_cents": 420000, "amount_cents": 420000,
          "currency": "USD", "status": "paid",
          "stripe_checkout_session_id": null, "stripe_payment_intent_id": null,
          "shipping": null, "created_at": "2026-08-28T19:00:00Z",
          "paid_at": "2026-08-28T19:04:11.221Z",
          "designer_id": "a0000000-0000-0000-0000-000000000004", "project_id": null }
        """)
        #expect(order.productName == "Heirloom Oak Dining Table")
        #expect(order.amountCents == 420_000)
        #expect(order.formattedTotal == "$4,200.00")
        #expect(order.isSettled)
        #expect(order.designerId == "a0000000-0000-0000-0000-000000000004")
        #expect(order.projectId == nil)
        #expect(order.paidAt != nil)
    }

    @Test("only 'paid' is settled")
    func onlyPaidIsSettled() throws {
        for status in ["pending_payment", "canceled", "refunded"] {
            let order = try decode(DirectOrder.self, """
            { "id": "d1", "status": "\(status)", "amount_cents": 100 }
            """)
            #expect(!order.isSettled)
        }
        let paid = try decode(DirectOrder.self, """
        { "id": "d1", "status": "paid", "amount_cents": 100 }
        """)
        #expect(paid.isSettled)
    }

    @Test("the RPC's masked commission_rate cannot leak through the row type")
    func maskedRateIsIgnored() throws {
        // `create_direct_order` RETURNS the composite, so the create call
        // carries every column — including the one it masks to NULL. The type
        // simply has nowhere to put it.
        let order = try decode(DirectOrder.self, """
        { "id": "d1", "status": "pending_payment", "amount_cents": 420000,
          "commission_rate": null }
        """)
        #expect(order.amountCents == 420_000)
    }

    // MARK: - The terms

    @Test("get_direct_order_terms decodes its one row")
    func termsDecode() throws {
        let rows = try decode([DirectOrderTerms].self, """
        [{ "responsibility_paragraph": "Patina is responsible for delivery, damage and returns.",
           "contact": "hello@patina.cloud", "tax_shipping_enabled": true }]
        """)
        let terms = try #require(rows.first)
        #expect(terms.taxShippingEnabled)
        #expect(terms.contact == "hello@patina.cloud")
        #expect(terms.responsibilityParagraph?.isEmpty == false)
    }

    @Test("a config key the rail was never given yields nothing and promises nothing")
    func missingConfigYieldsFalse() throws {
        let rows = try decode([DirectOrderTerms].self, """
        [{ "responsibility_paragraph": null, "contact": "  ", "tax_shipping_enabled": false }]
        """)
        let terms = try #require(rows.first)
        #expect(terms.responsibilityParagraph == nil)
        #expect(terms.contact == nil)
        #expect(!terms.taxShippingEnabled)
    }

    @Test("terms that could not be read at all promise nothing")
    func unknownTermsPromiseNothing() {
        #expect(!DirectOrderTerms.unknown.taxShippingEnabled)
        #expect(DirectOrderTerms.unknown.responsibilityParagraph == nil)
        #expect(DirectOrderTerms.unknown.contact == nil)
    }

    // MARK: - Checkout error mapping

    @Test("every direct-order checkout code maps to its case")
    func checkoutCodesMap() {
        let cases: [(String?, OrderCheckoutError)] = [
            ("direct_order_not_found", .orderNotFound),
            ("direct_order_already_paid", .alreadyPaid),
            ("direct_order_canceled", .canceled),
            ("direct_order_refunded", .refunded),
            ("nothing_due", .nothingDue),
            ("stripe_not_configured", .notConfigured),
            ("stripe_error", .unavailable),
            (nil, .unavailable)
        ]
        for (code, expected) in cases {
            #expect(OrderCheckoutError.from(code: code, detail: nil) == expected)
        }
    }

    @Test("Stripe's own sentence is dropped, never carried into a case")
    func stripeDetailIsNotCarried() {
        let error = OrderCheckoutError.from(
            code: "stripe_error",
            detail: "Invalid API Key provided: sk_test_********************alls"
        )
        #expect(error == .unavailable)
        let sentence = OrderFailureCopy.checkout(error).sentence
        #expect(sentence == "We couldn't start this payment. Nothing has been charged.")
        #expect(!sentence.contains("sk_test"))
        #expect(!sentence.contains("API Key"))
    }

    @Test("a create refusal becomes the gate's sentence, and never the server's")
    func createRefusalCopy() {
        let failure = OrderFailureCopy.create(
            DirectOrderError.refused(.photoVerifiedAt)
        )
        #expect(failure.sentence == "We haven't checked this piece's photograph yet.")
        #expect(!failure.offersDesignerMessage)
    }

    @Test("the poll timeout never claims a bank transfer")
    func unconfirmedCopyDoesNotGuessTheMethod() {
        let sentence = OrderFailureCopy.unconfirmed.sentence
        #expect(sentence == "We haven't seen this payment yet. We'll update this as soon as it clears.")
        #expect(!sentence.lowercased().contains("bank"))
        #expect(!sentence.contains("3–5"))
    }
}
