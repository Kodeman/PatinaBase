//
//  OrderFailureCopy.swift
//  Patina
//
//  Every way the purchase path can fail, said in Patina's words.
//
//  This is the direct-order half of `MoneyFailureCopy` and it obeys the same
//  rule: the thrown error is logged, never interpolated. The invoice rail
//  printed Stripe's own "Invalid API Key provided: sk_test_…" to a homeowner
//  paying $4,250 (`research/05-rewalk.md` §2b); the direct-order rail reaches
//  the identical 502 from the identical function, so the mapping has to exist
//  before the button does.
//
//  `MoneyFailure` and `MoneyFailureCopy.log` are reused rather than re-cut —
//  one type for a money failure, one logger, two rails.
//

import Foundation

/// The direct-order codes `create-checkout-session` returns. Distinct from
/// `CheckoutError`, whose vocabulary is the invoice branch's.
public enum OrderCheckoutError: Error, Sendable, Equatable {
    case orderNotFound
    case alreadyPaid
    case canceled
    case refunded
    case nothingDue
    case notConfigured
    /// 409 `payment_processing` — a completed session already points at this
    /// order and the money has not landed yet (an ACH debit settling, or a card
    /// that cleared before the webhook did). `create-checkout-session` refuses
    /// a second session precisely so the reader is not charged twice, so this
    /// must never say "Nothing has been charged."
    case paymentProcessing
    /// Anything else, including Stripe's own 502. Deliberately carries no
    /// payload — the detail is logged at the boundary and dropped here.
    case unavailable

    static func from(code: String?, detail: String?) -> OrderCheckoutError {
        #if DEBUG
        if let detail, !detail.isEmpty {
            PatinaLog.ui.error("[Orders] checkout error detail (never shown): \(detail)")
        }
        #endif
        switch code {
        case "direct_order_not_found": return .orderNotFound
        case "direct_order_already_paid": return .alreadyPaid
        case "direct_order_canceled": return .canceled
        case "direct_order_refunded": return .refunded
        case "nothing_due": return .nothingDue
        case "payment_processing": return .paymentProcessing
        case "stripe_not_configured": return .notConfigured
        default: return .unavailable
        }
    }

    /// The `order_failed` property. A code, never a sentence.
    var analyticsReason: String {
        switch self {
        case .orderNotFound: return "order_not_found"
        case .alreadyPaid: return "already_paid"
        case .canceled: return "canceled"
        case .refunded: return "refunded"
        case .nothingDue: return "nothing_due"
        case .notConfigured: return "not_configured"
        case .paymentProcessing: return "payment_processing"
        case .unavailable: return "checkout_unavailable"
        }
    }
}

enum OrderFailureCopy {

    /// A `create_direct_order` refusal. The gate's own sentence carries the
    /// missing fact; the money and seller refusals get the sentences a buyer
    /// needs rather than the ones a catalogue editor would.
    static func create(_ error: Error) -> MoneyFailure {
        MoneyFailureCopy.log("direct-order create", error)
        guard let typed = error as? DirectOrderError else {
            return MoneyFailure(
                "We couldn't start this order. Nothing has been charged.",
                offersDesignerMessage: false
            )
        }
        switch typed {
        case .notAuthenticated:
            return MoneyFailure(
                "Sign in to order this piece.",
                offersDesignerMessage: false
            )
        case .refused(let refusal):
            return MoneyFailure(
                BuyabilityGate.sentence(for: refusal),
                offersDesignerMessage: false
            )
        case .unavailable:
            return MoneyFailure(
                "We couldn't start this order. Nothing has been charged.",
                offersDesignerMessage: false
            )
        }
    }

    /// A `create-checkout-session` failure. `CheckoutError` (the invoice
    /// vocabulary) is handed straight to the existing copy so the two rails
    /// cannot drift on a shared code.
    static func checkout(_ error: Error) -> MoneyFailure {
        MoneyFailureCopy.log("direct-order checkout", error)
        if let shared = error as? CheckoutError {
            return MoneyFailureCopy.checkout(shared)
        }
        guard let typed = error as? OrderCheckoutError else {
            return MoneyFailure(
                "We couldn't start this payment. Nothing has been charged.",
                offersDesignerMessage: false
            )
        }
        switch typed {
        case .orderNotFound:
            return MoneyFailure(
                "We couldn't find this order. Nothing has been charged.",
                offersDesignerMessage: false
            )
        case .alreadyPaid:
            return MoneyFailure(
                "This order is already paid. A receipt is on its way to your inbox.",
                offersDesignerMessage: false
            )
        case .canceled:
            return MoneyFailure(
                "This order was cancelled. Start a new one when you're ready.",
                offersDesignerMessage: false
            )
        case .refunded:
            return MoneyFailure(
                "This order was refunded.",
                offersDesignerMessage: false
            )
        case .nothingDue:
            return MoneyFailure(
                "There's nothing left owing on this order.",
                offersDesignerMessage: false
            )
        case .notConfigured:
            return MoneyFailure(
                "We can't take payment for this piece yet.",
                offersDesignerMessage: false
            )
        case .paymentProcessing:
            // The invoice rail's sentence, one noun over
            // (`MoneyFailureCopy.checkout(.paymentProcessing)`). Saying
            // "Nothing has been charged." here would be false in the exact
            // window it fires in, and would invite the second tap the server
            // guard exists to prevent.
            return MoneyFailure(
                "A payment on this order is already going through. "
                    + "We'll update this as soon as it clears.",
                offersDesignerMessage: false
            )
        case .unavailable:
            return MoneyFailure(
                "We couldn't start this payment. Nothing has been charged.",
                offersDesignerMessage: false
            )
        }
    }

    /// The poll ran out before the webhook settled the row. SP-15's rule
    /// holds: this never claims a bank transfer, because the method is not
    /// knowable here.
    static let unconfirmed = MoneyFailure(
        "We haven't seen this payment yet. We'll update this as soon as it clears.",
        offersDesignerMessage: false
    )

    /// The tax/delivery setting is off, so the total on the sheet is not the
    /// total a payment would take. Path A does not complete (critique M14).
    static let taxShippingDisabled =
        "Delivery and tax are not included yet, so we can't take payment for this piece yet."
}
