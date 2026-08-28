//
//  ClientOrderCopy.swift
//  Patina
//
//  Every sentence M8 prints about an order, lifted out of `ClientOrder.swift`
//  so neither file outgrows the length gate and so the copy has one home.
//

import Foundation

/// Every sentence M8 prints, in one place, so the list card and the detail
/// screen cannot say two different things about one order.
enum ClientOrderCopy {

    /// The state line under the rail. Dates are the wire's own, or absent.
    ///
    /// Each state answers for itself below: the switch is a table, not a place
    /// to reason, so no state's sentence can be changed by editing another's.
    static func stateLine(_ order: ClientOrder) -> String {
        switch order.state {
        case .paidNotOnRail:
            return paidNotOnRailLine(order)
        case .confirmed:
            return confirmedLine(order)
        case .inProduction:
            return inProductionLine(order)
        case .shipped:
            return shippedLine(order)
        case .delivered:
            return closedLine("Delivered", at: order.deliveredAt ?? order.stateEnteredAt)
        case .cancelled:
            return closedLine("Cancelled", at: order.stateEnteredAt)
        case .refunded:
            return closedLine("Refunded", at: order.stateEnteredAt ?? order.placedAt)
        }
    }

    /// No painted tracker (build-plan W5, direction B §5's M8 sheet).
    private static func paidNotOnRailLine(_ order: ClientOrder) -> String {
        guard let paid = order.placedAt else { return "Paid. We'll email you when it ships." }
        return "Paid \(DateDisplay.short(paid)). We'll email you when it ships."
    }

    private static func confirmedLine(_ order: ClientOrder) -> String {
        guard let at = order.stateEnteredAt else { return "Confirmed." }
        return "Confirmed \(DateDisplay.short(at))."
    }

    private static func inProductionLine(_ order: ClientOrder) -> String {
        if case .designer(let name) = order.placedBy {
            // M8: a designer-sourced order says who is watching it, rather
            // than leaving a blank rail.
            return "\(name ?? "Your designer") updates this as it moves."
        }
        guard let at = order.stateEnteredAt else { return "In production." }
        return "In production since \(DateDisplay.short(at))."
    }

    private static func shippedLine(_ order: ClientOrder) -> String {
        let shipped = order.shippedAt ?? order.stateEnteredAt
        let head = shipped.map { "Shipped \(DateDisplay.short($0))" } ?? "Shipped"
        guard let eta = order.currentEta else { return "\(head)." }
        return "\(head) · arriving \(DateDisplay.short(eta))."
    }

    /// Delivered, cancelled, refunded — one shape, three verbs, because the
    /// only thing that varies is the word and which date the wire carries.
    private static func closedLine(_ verb: String, at date: Date?) -> String {
        date.map { "\(verb) \(DateDisplay.short($0))." } ?? "\(verb)."
    }

    /// `$4,200.00 · paid Sep 3` — and **only** for an order the reader paid
    /// for herself.
    ///
    /// A designer-sourced order prints no money at all, which is exactly what
    /// M8's second card does. Two claims the wire will not support otherwise:
    /// `fulfillment_orders.captured_total_cents` is what Patina captured on the
    /// designer's rail, not what this reader was billed (a designer-sourced
    /// piece bills on the invoice rail); and `intake_at` is when the order
    /// reached the rail, not when anybody paid.
    static func moneyLine(_ order: ClientOrder) -> String? {
        guard case .reader = order.placedBy else { return nil }
        let amount = PatinaCurrency.format(cents: order.amountCents, currencyCode: order.currency)
        guard let placed = order.placedAt else { return amount }
        return "\(amount) · paid \(DateDisplay.short(placed))"
    }

    /// The label over the amount on the detail screen. `PAID` is a claim, and
    /// it stops being true once the money came back — so it follows the state
    /// rather than being printed unconditionally over a refunded order.
    /// Nil where `moneyLine` is nil, for the same reason.
    static func moneyLabel(_ order: ClientOrder) -> String? {
        guard case .reader = order.placedBy else { return nil }
        return order.state == .refunded ? "REFUNDED" : "PAID"
    }

    /// The footer. M8 prints one under every card.
    static func attributionFooter(_ order: ClientOrder, projectName: String?) -> String {
        switch order.placedBy {
        case .reader:
            return "You ordered this."
        case .designer(let name):
            let who = name ?? "Your designer"
            guard let projectName, !projectName.isEmpty else { return "\(who) ordered this for you." }
            return "\(who) ordered this for \(projectName)."
        }
    }
}
