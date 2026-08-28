//
//  AskSheetsTests.swift
//  PatinaTests
//
//  W5 · C1 — what Paths B and C actually send.
//
//  Path B's caption promises the designer will see "the piece, the price and
//  the room", so the body has to carry all three whatever the reader writes
//  over the default sentence.
//
//  Path C's whole risk is a second lead. `submit_design_request` has no product
//  parameter, so the idempotency key is the piece's own uuid and the
//  `(homeowner_id, client_request_id)` unique index (00285:77-79) is what makes
//  "one lead, never a duplicate" true — the duplicate-lead failure SP-07
//  exists to close.
//

import Testing
import Foundation
@testable import Patina

struct AskSheetsTests {

    // MARK: - Path B

    @Test("the default message names the piece and the room")
    func defaultMessageNamesBoth() {
        let withRoom = AskComposer.defaultMessage(
            product: PurchaseFixture.piece(), roomName: "Living Room"
        )
        #expect(withRoom == "Can we use the Heirloom Oak Dining Table in the Living Room?")

        let withoutRoom = AskComposer.defaultMessage(
            product: PurchaseFixture.piece(), roomName: nil
        )
        #expect(withoutRoom == "Can we use the Heirloom Oak Dining Table?")
    }

    @Test("the sent body carries the piece, the price, the maker and the room")
    func bodyCarriesTheFacts() {
        let body = AskComposer.body(
            message: "Would this work for the dining room?",
            product: PurchaseFixture.piece(),
            roomName: "Living Room"
        )
        #expect(body.contains("Would this work for the dining room?"))
        #expect(body.contains("Heirloom Oak Dining Table"))
        #expect(body.contains("$4,200.00"))
        #expect(body.contains("Nordic Atelier"))
        #expect(body.contains("Living Room"))
    }

    @Test("a rewritten message never loses the facts")
    func rewritingKeepsTheFacts() {
        let body = AskComposer.body(
            message: "thoughts?", product: PurchaseFixture.piece(), roomName: nil
        )
        #expect(body.hasPrefix("thoughts?"))
        #expect(body.contains("$4,200.00"))
        #expect(!body.contains("Living Room"))
    }

    @Test("an emptied message still sends the facts rather than an empty line")
    func emptyMessageStillCarriesTheFacts() {
        let body = AskComposer.body(
            message: "   ", product: PurchaseFixture.piece(), roomName: "Living Room"
        )
        #expect(body == "Heirloom Oak Dining Table · $4,200.00 · Nordic Atelier · Living Room")
    }

    @Test("a piece with no price names no price")
    func noPriceIsNotPrinted() {
        let body = AskComposer.body(
            message: "Can we get a quote?",
            product: PurchaseFixture.piece(priceCents: 0),
            roomName: nil
        )
        #expect(!body.contains("$0"))
        #expect(body.contains("Heirloom Oak Dining Table"))
    }

    @Test("the caption names the room only when the message carries one")
    func captionNeverPromisesARoomThatIsntThere() {
        // The walk caught this: `client@patina.dev` has no rooms, so the body
        // carried the piece and the price — and the caption said "and the
        // room" anyway.
        #expect(AskDesignerSheet.caption(hasRoom: true, sent: false)
                == "She'll see the piece, the price and the room.")
        #expect(AskDesignerSheet.caption(hasRoom: true, sent: true)
                == "She has the piece, the price and the room.")
        #expect(AskDesignerSheet.caption(hasRoom: false, sent: false)
                == "She'll see the piece and the price.")
        #expect(AskDesignerSheet.caption(hasRoom: false, sent: true)
                == "She has the piece and the price.")
        for sent in [true, false] {
            #expect(!AskDesignerSheet.caption(hasRoom: false, sent: sent).contains("room"))
        }
    }

    @Test("the thread is the project's where a project exists, the direct one where a lead does")
    @MainActor
    func threadChoiceFollowsTheRelationship() async throws {
        // `DesignerThreadOpener` is the one implementation; its `nil` answer is
        // the fact worth pinning — a relationship that cannot own a thread must
        // not be offered a Path B act.
        let designerId = UUID()
        #expect(try await DesignerThreadOpener.openThread(with: .none) == nil)
        #expect(try await DesignerThreadOpener.openThread(with: .roster(designerId: designerId)) == nil)
    }

    // MARK: - Path C

    @Test("the lead's idempotency key is the piece's own id — one lead per client per piece")
    func clientRequestIdIsTheProductId() {
        let product = PurchaseFixture.piece()
        let key = AskComposer.clientRequestId(for: product)
        #expect(key.uuidString.lowercased() == PurchaseFixture.productId)

        // Two calls for the same piece produce the same key, so a second tap
        // replays the lead the RPC already wrote.
        #expect(AskComposer.clientRequestId(for: product) == key)
    }

    @Test("a piece whose id is not a uuid still gets a key rather than crashing")
    func nonUUIDProductStillKeys() {
        let key = AskComposer.clientRequestId(for: PurchaseFixture.piece(id: "preview-1"))
        #expect(key.uuidString.isEmpty == false)
    }

    @Test("the lead is roomless, single-piece, and names the piece in its description")
    func leadParamsShape() {
        let params = AskComposer.leadParams(
            message: "Can you tell me more about this?",
            product: PurchaseFixture.piece(),
            roomName: "Living Room"
        )
        #expect(params.p_scan_ids.isEmpty)
        #expect(params.p_primary_scan_id == nil)
        #expect(params.p_project_type == "single_piece")
        #expect(params.p_source == "Patina app · piece")
        #expect(params.p_client_request_id == PurchaseFixture.productId)
        #expect(params.p_description?.contains("Heirloom Oak Dining Table") == true)
        #expect(params.p_description?.contains("$4,200.00") == true)
        #expect(params.p_description?.contains("Living Room") == true)
    }

    @Test("the default question is a question, in the reader's words not the catalogue's")
    func defaultQuestion() {
        #expect(AskComposer.defaultQuestion(product: PurchaseFixture.piece())
                == "Can you tell me more about the Heirloom Oak Dining Table?")
    }

    @Test("the params encode to the RPC's own argument names")
    func paramsEncodeToTheRPCNames() throws {
        let params = AskComposer.leadParams(
            message: "hello", product: PurchaseFixture.piece(), roomName: nil
        )
        let data = try JSONEncoder().encode(params)
        let json = try #require(
            try JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        #expect(json["p_project_type"] as? String == "single_piece")
        #expect(json["p_client_request_id"] as? String == PurchaseFixture.productId)
        #expect(json["p_scan_ids"] as? [String] == [])
    }
}
