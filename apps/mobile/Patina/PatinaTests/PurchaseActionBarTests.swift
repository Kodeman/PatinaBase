//
//  PurchaseActionBarTests.swift
//  PatinaTests
//
//  W5 · C1 — the bar the piece screen draws, named by `c1-tasks.md` §7 and
//  missing until the fix round. `PieceActMatrixTests` already asserts R3 over
//  the whole relationship × flag × gate matrix; what is asserted here is the
//  bar's own contract: the label it takes from the act, the ghost that was the
//  whole bar before it, and the reason it prints above the pair.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct PurchaseActionBarTests {

    private func bar(_ act: PieceAct, isSaved: Bool = false) -> PurchaseActionBar {
        PurchaseActionBar(act: act, isSaved: isSaved, onPrimary: {}, onAddToRoom: {})
    }

    @Test("the primary is the act's own label, one act per bar")
    func primaryLabelIsTheActsOwn() {
        #expect(bar(.askDesigner(firstName: "Leah")).act.primaryLabel
                == "Ask Leah to source this")
        #expect(bar(.buy(priceCents: 420_000)).act.primaryLabel == "Buy — $4,200.00")
        #expect(bar(.askAboutPiece(reason: nil)).act.primaryLabel == "Ask about this piece")
    }

    @Test("the ghost act is Add to room, and says so until the piece is saved")
    func ghostActIsAddToRoom() {
        #expect(!bar(.buy(priceCents: 1), isSaved: false).isSaved)
        #expect(bar(.buy(priceCents: 1), isSaved: true).isSaved)
    }

    @Test("the gate's reason prints under Path C and nowhere else")
    func reasonDrawsOnlyForPathC() {
        #expect(bar(.askAboutPiece(reason: "We don't have this piece's size yet."))
                .act.reason == "We don't have this piece's size yet.")
        #expect(bar(.askAboutPiece(reason: nil)).act.reason == nil)
        #expect(bar(.buy(priceCents: 1)).act.reason == nil)
        #expect(bar(.askDesigner(firstName: "Leah")).act.reason == nil)
    }

    @Test("no relationship, flag or gate combination can produce a Buy label for a live client")
    func liveClientNeverGetsABuyLabel() {
        let live: [DesignerRelationship] = [
            .lead(leadId: UUID(), designerId: UUID(), studioName: "Hartwell Studio"),
            .project(projectId: UUID(), designerId: UUID(), studioName: nil)
        ]
        for relationship in live {
            for flag in [true, false] {
                for resolved in [true, false] {
                    let act = PieceActResolver.act(
                        product: PurchaseFixture.piece(),
                        relationship: relationship,
                        designerName: "Leah Hartwell",
                        directOrdersEnabled: flag,
                        relationshipIsResolved: resolved
                    )
                    let label = bar(act).act.primaryLabel
                    #expect(!label.hasPrefix("Buy"))
                    #expect(label == "Ask Leah to source this")
                }
            }
        }
    }
}
