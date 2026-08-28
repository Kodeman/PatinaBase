//
//  PieceAct.swift
//  Patina
//
//  What the piece screen offers, resolved once from four inputs: the client's
//  designer relationship, the `direct-orders` flag, the buyability gate, and
//  the piece's price.
//
//  R3, stated here because this is the only place it can be enforced: a client
//  with a LIVE designer relationship — an accepted lead or an active project —
//  never sees Buy. Not as a secondary, not as a disclosure line, not behind a
//  flag. "Ask <her first name> to source this" pre-empts it, on every piece,
//  room or no room, until the designer-side settle notice is proven on a
//  device. `.roster` is deliberately NOT live: a client sitting on a designer's
//  client list with no accepted lead and no active project may buy, and the
//  order credits that designer server-side.
//
//  Because the resolution is one pure function, "no Buy for a live client" is
//  a property the tests can assert over the whole matrix rather than a rule
//  spread across a view.
//

import Foundation

/// The single act the piece screen leads with.
enum PieceAct: Equatable, Sendable {

    /// Path B. `firstName` is the designer's, where the app knows it — the
    /// seat resolves it from the project embed or the lead. Where it does not,
    /// the act reads "Ask your designer to source this" rather than naming
    /// somebody it cannot name.
    case askDesigner(firstName: String?)

    /// Path A. Behind `direct-orders`, and only when the gate passes.
    case buy(priceCents: Int)

    /// Path C. `reason` is the gate's plain sentence where the gate refused
    /// for a stated reason, and `nil` where the act is off for any other cause
    /// — a feature flag is not a fact about the piece and the screen does not
    /// invent one.
    case askAboutPiece(reason: String?)

    /// The primary control's label.
    var primaryLabel: String {
        switch self {
        case .askDesigner(let firstName):
            guard let firstName, !firstName.isEmpty else {
                return "Ask your designer to source this"
            }
            return "Ask \(firstName) to source this"
        case .buy(let priceCents):
            return "Buy — \(PatinaCurrency.format(cents: priceCents))"
        case .askAboutPiece:
            return "Ask about this piece"
        }
    }

    /// The sentence printed under the primary control, or nothing.
    var reason: String? {
        if case .askAboutPiece(let reason) = self { return reason }
        return nil
    }

    var isBuy: Bool {
        if case .buy = self { return true }
        return false
    }

    /// `piece_buy_tapped` / `piece_ask_designer_tapped` / `piece_ask_tapped`.
    var analyticsEvent: String {
        switch self {
        case .askDesigner: return "piece_ask_designer_tapped"
        case .buy: return "piece_buy_tapped"
        case .askAboutPiece: return "piece_ask_tapped"
        }
    }
}

/// Where the primary tap goes. Extracted from the screen so the guest wall is
/// a value a test can assert, rather than a `guard` inside a private method on
/// a SwiftUI view that nothing could reach.
enum PieceActEntry: Equatable, Sendable {
    /// C9's soft wall. Nothing is written and nothing will be until a session
    /// lands — in particular `create_direct_order` is never called.
    case authWall(title: String)
    case askDesigner
    case askAboutPiece(reason: String?)
    case order
}

enum PieceActResolver {

    /// Whether the designer relationship is an answer rather than a default.
    ///
    /// A guest is knowable without any fetch. Everybody else waits for BOTH
    /// halves of the resolution to have answered — the projects fetch and the
    /// lead fetch — because a missing answer reads as `.none`, and `.none` is
    /// the one relationship that draws Buy. "At least one of five queries came
    /// back" is not that predicate: a session where decisions and invoices
    /// answer and `listProjects()` alone fails would hand a client with an
    /// active project the Buy button R3 forbids her.
    static func relationshipIsResolved(
        isAuthenticated: Bool,
        projectsAnswered: Bool,
        leadAnswered: Bool
    ) -> Bool {
        guard isAuthenticated else { return true }
        return projectsAnswered && leadAnswered
    }

    /// The primary control's destination. Every act that writes anything —
    /// an order, a message, a lead — meets the wall first when there is no
    /// session.
    static func entry(for act: PieceAct, isAuthenticated: Bool) -> PieceActEntry {
        switch act {
        case .askDesigner:
            guard isAuthenticated else {
                return .authWall(title: "Sign in to message your designer")
            }
            return .askDesigner
        case .buy:
            guard isAuthenticated else { return .authWall(title: "Sign in to order") }
            return .order
        case .askAboutPiece(let reason):
            guard isAuthenticated else { return .authWall(title: "Sign in to ask") }
            return .askAboutPiece(reason: reason)
        }
    }

    /// - Parameters:
    ///   - product: the piece as decoded from `products` (the by-id fetch
    ///     selects `*`, so every gate column is present).
    ///   - relationship: `DesignerRelationshipResolver.resolve(…)`'s answer.
    ///     C1 reads it and never writes it.
    ///   - designerName: the designer's display name where one has resolved —
    ///     `DesignerSeat.make(…)?.name`. Only the first word is used.
    ///   - directOrdersEnabled: `FeatureFlags.shared.isOn(.directOrders)`,
    ///     resolved once at launch and held for the session.
    ///   - relationshipIsResolved: whether the services the relationship is
    ///     derived from have actually answered. **An unanswered question must
    ///     never be answered with `.none`**: `.none` draws Buy, and a signed-in
    ///     client whose projects have not landed yet is exactly the person R3
    ///     pre-empts. Caught on the simulator — `client@patina.dev`, three
    ///     active projects, drew `Buy — $4,200.00` because the piece screen
    ///     resolved the relationship once before `BadgeCountService` had
    ///     loaded. A guest is knowable without any fetch and is resolved.
    static func act(
        product: Product,
        relationship: DesignerRelationship,
        designerName: String?,
        directOrdersEnabled: Bool,
        relationshipIsResolved: Bool = true
    ) -> PieceAct {
        // R3 first, and unconditionally. The flag and the gate are not
        // consulted, so no future edit to either can reintroduce Buy here.
        if relationship.isLive {
            return .askDesigner(firstName: firstName(of: designerName))
        }

        // Buy draws only on a known answer. Path C is a complete act for
        // somebody whose designer the app has not finished looking up, and it
        // states no reason, because "still loading" is not a fact about the
        // piece.
        guard relationshipIsResolved else {
            return .askAboutPiece(reason: nil)
        }

        guard directOrdersEnabled else {
            return .askAboutPiece(reason: nil)
        }

        if let refusal = BuyabilityGate.evaluate(product) {
            return .askAboutPiece(reason: BuyabilityGate.sentence(for: refusal))
        }

        return .buy(priceCents: product.priceCents)
    }

    /// "Leah Hartwell" → "Leah". A studio name gives its first word, which is
    /// how a person would say it out loud.
    static func firstName(of name: String?) -> String? {
        guard let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed.split(separator: " ").first.map(String.init)
    }
}
