//
//  InvoiceSettleCopy.swift
//  Patina
//
//  SP-15: when the 60-second post-Checkout poll expired the app set
//  `.achPending` regardless of method, so a card payer was told a bank
//  transfer had started and to expect 3–5 business days.
//
//  `invoice_payments.method` is one of stripe | check | wire | ach_manual |
//  cash | other (00178_invoices_v1.sql:128-129). A Stripe card payment and a
//  Stripe ACH payment are BOTH `stripe`, so the method behind a Stripe row is
//  not knowable from what the client can read — and the app must not guess.
//  The bank-transfer sentence is printed only where the row itself says
//  `ach_manual` or `wire`; otherwise the copy is the truth: we haven't seen it
//  yet.
//

import Foundation

enum InvoiceSettleCopy {

    /// The poll expired without the webhook settling the invoice.
    static func unconfirmed(_ invoice: RemoteInvoice) -> String {
        if isBankTransfer(invoice) {
            return "Your bank transfer has started. Bank transfers take 3–5 business days to clear — we'll email your receipt as soon as it lands."
        }
        return "We haven't seen this payment yet. We'll update this as soon as it clears."
    }

    /// A payment is pending server-side (the "processing" banner).
    static func processing(_ invoice: RemoteInvoice) -> String {
        var copy = "A payment is processing. The balance above will update once it clears."
        if isBankTransfer(invoice) {
            copy += " Bank transfers take 3–5 business days."
        }
        return copy
    }

    /// The payments block on an invoice with no rows to show.
    static func noPayments(_ invoice: RemoteInvoice) -> String {
        invoice.isPaid
            ? "Paid in full. Your designer recorded this payment outside Patina."
            : "No payments recorded yet."
    }

    private static func isBankTransfer(_ invoice: RemoteInvoice) -> Bool {
        (invoice.payments ?? []).contains {
            $0.isPending && ($0.method == "ach_manual" || $0.method == "wire")
        }
    }
}
