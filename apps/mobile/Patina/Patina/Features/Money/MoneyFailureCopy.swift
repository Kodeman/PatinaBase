//
//  MoneyFailureCopy.swift
//  Patina
//
//  SP-15 / C5. On 2026-08-27 the invoice screen printed this to a homeowner,
//  in red, on a $4,250 payment:
//
//      Invalid API Key provided: sk_test_********************alls
//
//  (`research/05-rewalk.md` §2b.) The app rendered whatever string the edge
//  function returned — `CheckoutError.generic(detail)` carried the vendor's
//  words straight to the screen, and the view models printed
//  `errorDescription` for anything thrown.
//
//  This is the only place a money failure becomes words. Every branch returns
//  app-authored copy; the thrown error is never interpolated, only logged.
//

import Foundation

/// One money failure, ready to render: a plain sentence and the acts that
/// follow it.
struct MoneyFailure: Equatable {
    let sentence: String
    let retryLabel: String
    /// Whether "Message your designer" is worth offering — false where the
    /// client retrying is the whole of the answer.
    let offersDesignerMessage: Bool

    static let retry = "Let's try that again"

    init(_ sentence: String, offersDesignerMessage: Bool = true) {
        self.sentence = sentence
        self.retryLabel = Self.retry
        self.offersDesignerMessage = offersDesignerMessage
    }
}

enum MoneyFailureCopy {

    // MARK: - Checkout

    /// Pure on purpose: `CheckoutError.errorDescription` reads this, and a
    /// `log(error)` here would call `localizedDescription` back into
    /// `errorDescription` and recurse until the stack ran out. Callers log the
    /// raw error themselves.
    static func checkout(_ error: Error) -> MoneyFailure {
        guard let checkout = error as? CheckoutError else {
            return MoneyFailure("We couldn't start this payment. Nothing has been charged.")
        }
        switch checkout {
        case .notPayable:
            return MoneyFailure(
                "This invoice can't be paid in the app right now. Your designer can tell you why."
            )
        case .paymentProcessing:
            // NOT "bank transfers take 3–5 business days". `payment_processing`
            // is returned for any completed Checkout session still pointing at
            // a pending `invoice_payments` row — "card just cleared and the
            // webhook hasn't landed, OR an ACH debit settling"
            // (`create-checkout-session/index.ts:433-439`, `:1114-1122`). The
            // method is not knowable here, and `InvoiceSettleCopy` refuses the
            // same guess four files away. The bank-transfer sentence is printed
            // only by the settle banner on this same screen, and only when the
            // payment row itself says `ach_manual` or `wire`.
            return MoneyFailure(
                "A payment on this invoice is already going through. We'll update this as soon as it clears.",
                offersDesignerMessage: true
            )
        case .nothingDue:
            return MoneyFailure(
                "There's nothing left owing on this invoice.",
                offersDesignerMessage: false
            )
        case .notConfigured:
            return MoneyFailure(
                "Online payment isn't set up for this invoice yet. Your designer can sort it out."
            )
        case .notFound:
            return MoneyFailure("We couldn't find this invoice.")
        case .unavailable:
            return MoneyFailure("We couldn't start this payment. Nothing has been charged.")
        }
    }

    // MARK: - Signing

    /// Pure, for the same reason as `checkout(_:)`.
    static func sign(_ error: Error) -> MoneyFailure {
        guard let sign = error as? ProposalSignError else {
            return MoneyFailure("We couldn't record your signature. Nothing has been signed.")
        }
        switch sign {
        case .expired:
            return MoneyFailure("This proposal has expired. Your designer can send a fresh one.")
        case .notSignable:
            return MoneyFailure("This proposal isn't ready to sign right now.")
        case .nameTooShort:
            return MoneyFailure(
                "Please type your full name to sign.",
                offersDesignerMessage: false
            )
        case .notOwner:
            return MoneyFailure("This proposal isn't yours to sign.")
        case .unexpected:
            return MoneyFailure("We couldn't record your signature. Nothing has been signed.")
        }
    }

    // MARK: - Decisions

    /// A choice the client committed to that the app could not submit. One
    /// sentence for every cause on purpose — a Postgrest failure and a dropped
    /// connection are the same fact to a homeowner — and it takes no argument
    /// so it cannot look like it branches on one. Callers log the raw error.
    static let decision = MoneyFailure(
        "We couldn't send your choice. Your designer hasn't seen it yet."
    )

    /// SP-17: a deferral is a message, not a choice. Reporting it as one told
    /// a client who tapped "Not yet" that her choice had not gone through.
    static let deferral = MoneyFailure(
        "We couldn't send that note. Your designer hasn't seen it yet."
    )

    /// The raw error, for the console only. Never reaches a screen.
    static func log(_ surface: String, _ error: Error) {
        #if DEBUG
        PatinaLog.ui.error("[Money] \(surface) failed: \(String(describing: error))")
        #endif
    }
}
