//
//  PieceActMatrixTests.swift
//  PatinaTests
//
//  W5 · C1 — the act matrix, and R3's pin.
//
//  R3: "Ask Leah to source this" pre-empts Buy for any client with a live
//  designer relationship (accepted lead or active project) until the
//  designer-side settle notice is proven on a device. No Buy button, no
//  disclosure line, for those clients.
//
//  The pin is asserted over the WHOLE matrix — every flag state, every gate
//  state — rather than on one happy case, because the failure mode this
//  prevents is a future edit to the flag or the gate quietly reintroducing
//  Buy for a client whose designer is on the job.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct PieceActMatrixTests {

    private let designerId = UUID()

    private var live: [DesignerRelationship] {
        [
            .lead(leadId: UUID(), designerId: designerId, studioName: "Hartwell Studio"),
            .project(projectId: UUID(), designerId: designerId, studioName: nil)
        ]
    }

    private var notLive: [DesignerRelationship] {
        [.none, .roster(designerId: designerId)]
    }

    private var pieces: [Product] {
        [
            PurchaseFixture.piece(),                       // gate passes
            PurchaseFixture.piece(dimensions: nil),        // gate fails
            PurchaseFixture.piece(priceCents: 0),          // no price
            PurchaseFixture.piece(patinaManaged: false)    // no seller
        ]
    }

    // MARK: - R3

    @Test("a client with a live designer NEVER sees Buy — every flag, every gate")
    func liveRelationshipNeverProducesBuy() {
        for relationship in live {
            for piece in pieces {
                for flag in [true, false] {
                    let act = PieceActResolver.act(
                        product: piece,
                        relationship: relationship,
                        designerName: "Leah Hartwell",
                        directOrdersEnabled: flag
                    )
                    #expect(!act.isBuy)
                    #expect(act == .askDesigner(firstName: "Leah"))
                    #expect(!act.primaryLabel.lowercased().contains("buy"))
                }
            }
        }
    }

    @Test("an unresolved relationship never draws Buy — the sim-caught R3 breach")
    func unresolvedRelationshipNeverBuys() {
        // `client@patina.dev` has three active projects. On the device the
        // piece screen resolved her relationship once, before
        // `BadgeCountService` had loaded, read `.none`, and offered
        // `Buy — $4,200.00`. An unanswered question must never be answered
        // with the one value that draws Buy.
        for piece in pieces {
            let act = PieceActResolver.act(
                product: piece,
                relationship: .none,
                designerName: nil,
                directOrdersEnabled: true,
                relationshipIsResolved: false
            )
            #expect(!act.isBuy)
            #expect(act == .askAboutPiece(reason: nil))
        }
    }

    @Test("a live relationship still wins even before the services have settled")
    func liveWinsEvenWhenUnresolved() {
        for relationship in live {
            let act = PieceActResolver.act(
                product: PurchaseFixture.piece(),
                relationship: relationship,
                designerName: "Leah Hartwell",
                directOrdersEnabled: true,
                relationshipIsResolved: false
            )
            #expect(act == .askDesigner(firstName: "Leah"))
        }
    }

    @Test("a failed projects fetch is not an answer, whatever the badge rail says")
    func aFailedProjectsFetchIsNotAnAnswer() {
        // `BadgeCountService.hasLoaded` goes true when ANY of five fetches
        // answers, and `apply` keeps the previous value for a nil fetch —
        // `[]` on a cold launch. So a signed-in client with an active project,
        // on a session where decisions and invoices answer and
        // `listProjects()` alone fails, resolved `.none` and — flag on, gate
        // passing — drew `Buy — $4,200.00`. The predicate has to mean "the
        // projects answer arrived".
        let service = BadgeCountService.makeForTests()
        service.apply(
            decisions: [], summaries: [], proposals: [], invoices: [],
            projects: nil, roster: []
        )
        #expect(!service.projectsLoaded)
        #expect(!PieceActResolver.relationshipIsResolved(
            isAuthenticated: true,
            projectsAnswered: service.projectsLoaded,
            leadAnswered: true
        ))

        service.apply(
            decisions: nil, summaries: nil, proposals: nil, invoices: nil,
            projects: [], roster: nil
        )
        #expect(service.projectsLoaded)
        #expect(PieceActResolver.relationshipIsResolved(
            isAuthenticated: true,
            projectsAnswered: service.projectsLoaded,
            leadAnswered: true
        ))
    }

    @Test("the lead half must answer too, and a guest needs no fetch at all")
    func bothHalvesOrNoBuy() {
        #expect(!PieceActResolver.relationshipIsResolved(
            isAuthenticated: true, projectsAnswered: true, leadAnswered: false
        ))
        #expect(PieceActResolver.relationshipIsResolved(
            isAuthenticated: false, projectsAnswered: false, leadAnswered: false
        ))
    }

    @Test("Path B names her by her first name, and says so plainly when it doesn't know one")
    func askDesignerLabel() {
        let relationship = DesignerRelationship.project(
            projectId: UUID(), designerId: designerId, studioName: nil
        )
        let named = PieceActResolver.act(
            product: PurchaseFixture.piece(),
            relationship: relationship,
            designerName: "Leah Hartwell",
            directOrdersEnabled: true
        )
        #expect(named.primaryLabel == "Ask Leah to source this")

        let unnamed = PieceActResolver.act(
            product: PurchaseFixture.piece(),
            relationship: relationship,
            designerName: nil,
            directOrdersEnabled: true
        )
        #expect(unnamed.primaryLabel == "Ask your designer to source this")
    }

    // MARK: - Path A

    @Test("no live designer, flag on, gate passes → Buy at the piece's real price")
    func buyDrawsForANonLiveClient() {
        for relationship in notLive {
            let act = PieceActResolver.act(
                product: PurchaseFixture.piece(),
                relationship: relationship,
                designerName: nil,
                directOrdersEnabled: true
            )
            #expect(act == .buy(priceCents: 420_000))
            #expect(act.primaryLabel == "Buy — $4,200.00")
        }
    }

    @Test("a roster relationship is not live — she may buy, and the order credits the designer")
    func rosterIsNotLive() {
        let roster = DesignerRelationship.roster(designerId: designerId)
        #expect(!roster.isLive)
        #expect(roster.designerId == designerId)
        let act = PieceActResolver.act(
            product: PurchaseFixture.piece(),
            relationship: roster,
            designerName: "Leah Hartwell",
            directOrdersEnabled: true
        )
        #expect(act.isBuy)
    }

    // MARK: - Path C

    @Test("the flag off is not a fact about the piece, so Path C states no reason")
    func flagOffCarriesNoReason() {
        for relationship in notLive {
            let act = PieceActResolver.act(
                product: PurchaseFixture.piece(),
                relationship: relationship,
                designerName: nil,
                directOrdersEnabled: false
            )
            #expect(act == .askAboutPiece(reason: nil))
            #expect(act.primaryLabel == "Ask about this piece")
        }
    }

    @Test("a failed gate falls to Path C carrying the gate's own sentence")
    func gateFailureCarriesItsReason() {
        let act = PieceActResolver.act(
            product: PurchaseFixture.piece(dimensions: nil),
            relationship: .none,
            designerName: nil,
            directOrdersEnabled: true
        )
        #expect(act == .askAboutPiece(reason: "We don't have this piece's size yet."))
        #expect(act.reason != nil)
    }

    @Test("a null price falls to Path C, never to a $0 Buy")
    func nullPriceNeverBuys() {
        let act = PieceActResolver.act(
            product: PurchaseFixture.piece(priceCents: 0),
            relationship: .none,
            designerName: nil,
            directOrdersEnabled: true
        )
        #expect(!act.isBuy)
        #expect(act.reason == "This piece doesn't have a price yet.")
    }

    // MARK: - Analytics

    @Test("each act reports its own event name")
    func actsCarryDistinctEvents() {
        #expect(PieceAct.buy(priceCents: 1).analyticsEvent == "piece_buy_tapped")
        #expect(PieceAct.askDesigner(firstName: "Leah").analyticsEvent
                == "piece_ask_designer_tapped")
        #expect(PieceAct.askAboutPiece(reason: nil).analyticsEvent == "piece_ask_tapped")
    }

    // MARK: - The Companion mirrors the bar

    @Test("the Companion's piece row carries the bar's exact label and performs its act")
    func companionRowMirrorsTheBar() {
        let acts: [PieceAct] = [
            .askDesigner(firstName: "Leah"),
            .buy(priceCents: 420_000),
            .askAboutPiece(reason: "We don't have this piece's size yet.")
        ]
        for act in acts {
            let row = CompanionActionProvider.pieceActRow(act)
            #expect(row.label == act.primaryLabel)
            #expect(row.route == nil)
            if case .performPieceAct = row.specialAction {
                // the row asks the screen to open its own sheet
            } else {
                Issue.record("piece act row must carry .performPieceAct, got \(String(describing: row.specialAction))")
            }
        }
    }

    @Test("the piece menu stays within the six-row ceiling with the act row in it")
    func pieceMenuHoldsTheCeiling() {
        for act in [PieceAct.buy(priceCents: 1), .askDesigner(firstName: "Leah"), .askAboutPiece(reason: nil)] {
            for isAuthenticated in [true, false] {
                var context = CompanionContext(currentScreen: .pieceDetail(pieceId: "p1"))
                context.pieceAct = act
                let rows = CompanionActionProvider.actions(
                    for: .pieceDetail(pieceId: "p1"),
                    context: context,
                    isAuthenticated: isAuthenticated
                )
                #expect(rows.count <= 6)
                #expect(rows.contains { $0.label == act.primaryLabel })
                // The panel allows exactly one suggested row, and the DEBUG
                // assertion that enforces it traps rather than failing a test —
                // so it is asserted here, where a breach reads as a failure.
                #expect(rows.filter(\.isSuggested).count <= 1)
            }
        }
    }

    @Test("with no act resolved the piece menu is what it was before W5")
    func unresolvedActKeepsTheDesignerDoor() {
        let context = CompanionContext(currentScreen: .pieceDetail(pieceId: "p1"))
        let rows = CompanionActionProvider.actions(
            for: .pieceDetail(pieceId: "p1"),
            context: context,
            isAuthenticated: true
        )
        #expect(rows.contains { $0.analyticsId == "ask_designer" })
        #expect(rows.count <= 6)
    }
}
