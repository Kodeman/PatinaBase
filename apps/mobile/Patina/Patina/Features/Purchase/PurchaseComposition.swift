//
//  PurchaseComposition.swift
//  Patina
//
//  What the order sheet is built from. A real reader gets the live
//  `OrderHandoff` and the live terms read. Under `--uitesting` — test DI, not
//  a flag — the sheet gets scripted doubles, so a UI test can drive Path A
//  without a session, a catalogue row or Stripe.
//
//  The doubles script the network, never the machine: returning from Checkout
//  still only moves the handoff to `confirming`, and the sheet reaches
//  `placed` only when the scripted poll answers settled.
//

import SwiftUI

enum PurchaseComposition {

    typealias TermsProvider = @Sendable () async throws -> DirectOrderTerms

    nonisolated static let liveTerms: TermsProvider = {
        try await DirectOrdersAPIClient.shared.fetchTerms()
    }

    static func handoff() -> OrderHandoff {
        guard PatinaApp.isUITesting else { return OrderHandoff() }
        return OrderHandoff(
            dependencies: UITestDoubles.dependencies(
                settlesAfter: PatinaApp.uitestingOrderPollSettlesAfter
            )
        )
    }

    static var terms: TermsProvider {
        PatinaApp.isUITesting ? UITestDoubles.terms : liveTerms
    }

    // MARK: - UI-test doubles

    enum UITestDoubles {

        /// Scripted so a UI test can tell it from anything a server printed.
        static let responsibilityParagraph = "UI test terms: the scripted double answered."

        nonisolated static let terms: TermsProvider = {
            await MainActor.run {
                DirectOrderTerms(
                    responsibilityParagraph: responsibilityParagraph,
                    contact: "orders@patina.invalid",
                    taxShippingEnabled: true
                )
            }
        }

        /// `create` succeeds, `checkout` returns a URL that resolves nowhere,
        /// `poll` answers settled on call `settlesAfter` and not before.
        static func dependencies(settlesAfter: Int) -> OrderHandoff.Dependencies {
            let calls = PollCount()
            return OrderHandoff.Dependencies(
                create: { _, quantity in
                    await order(quantity: quantity, status: "pending_payment")
                },
                checkout: { _ in
                    URL(string: "https://checkout.patina.invalid/uitest")!
                },
                poll: { _ in
                    let call = await calls.next()
                    return await order(
                        quantity: 1,
                        status: call >= settlesAfter ? "paid" : "pending_payment"
                    )
                },
                track: { _, _ in }
            )
        }

        static func order(quantity: Int, status: String) -> DirectOrder {
            DirectOrder(
                id: "d0000000-0000-0000-0000-0000000000e1",
                productId: piece.id,
                productName: piece.name,
                quantity: quantity,
                unitPriceCents: piece.priceCents,
                amountCents: piece.priceCents * max(1, quantity),
                status: status
            )
        }

        private actor PollCount {
            private var calls = 0

            func next() -> Int {
                calls += 1
                return calls
            }
        }

        static let piece = Product(
            id: "a0000000-0000-0000-0000-0000000000e1",
            name: "Heirloom Oak Dining Table",
            priceCents: 420_000,
            matchScore: 0,
            makerName: "Nordic Atelier",
            makerLocation: "Aarhus, Denmark",
            makerStory: nil,
            imageURL: nil,
            usdzURL: nil,
            styleTags: [],
            materialTags: [],
            badges: [],
            category: .tables,
            tier: .designerSelection,
            dimensions: ProductDimensions(width: 84, height: 30, depth: 38, unit: "in"),
            leadTimeWeeks: 10,
            brand: "Nordic Atelier",
            patinaManaged: true
        )
    }

    /// The root under `--uitesting --uitest-order-sheet`: the sheet over the
    /// scripted piece, then a marker once the handoff reports it placed.
    struct UITestOrderHost: View {
        @State private var placed: DirectOrder?

        var body: some View {
            if let placed {
                Text("Placed \(placed.id)")
                    .accessibilityIdentifier("OrderSheetUITest.Placed")
            } else {
                OrderSheet(
                    product: UITestDoubles.piece,
                    fitLine: nil,
                    handoff: PurchaseComposition.handoff(),
                    terms: UITestDoubles.terms,
                    onPlaced: { placed = $0 }
                )
            }
        }
    }
}
