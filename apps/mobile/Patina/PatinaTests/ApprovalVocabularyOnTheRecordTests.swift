//
//  ApprovalVocabularyOnTheRecordTests.swift
//  PatinaTests
//
//  `W1R1-B1` / `iosb3-B1`. The door P-09 opened routes a Stage-2 approval
//  through `StudioQueueBuilder.itemizedAwaitingRows` into
//  `HouseRecordBuilder.title(for:)`, whose decision grammar printed
//  "Your designer asked you to choose." over an approval — and ran the
//  question's own "?" into an appended full stop.
//
//  `rulings-2026-09-04.md` (Vocabulary) is binding on every surface:
//  "approval" is the ask, and "decision" belongs to a choice between named
//  alternatives.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ApprovalVocabularyOnTheRecordTests {

    private static let now = Date(timeIntervalSince1970: 1_756_900_000)

    private func itemizedRow(_ decision: RemoteClientDecision) -> StudioQueueItemRow {
        let rows = StudioQueueBuilder.itemizedAwaitingRows(
            decisions: [decision], proposals: [], invoices: [],
            designerFallback: "Leah Hartwell", designerFallbackIsPerson: true,
            now: Self.now
        )
        return rows[0]
    }

    @Test("a Stage-2 approval reaches the Record as an approval")
    func aStage2ApprovalIsMarkedAnApproval() throws {
        let item = itemizedRow(try ProjectApprovalFixture.review().asWaitingDecision)
        #expect(item.isApproval)
        #expect(HouseRecordBuilder.title(for: item) == "Leah asked for your approval.")
        #expect(HouseRecordBuilder.detail(for: item)
                == "Approve the kitchen millwork as drawn?")
    }

    @Test("a client-court sign-off is an approval too")
    func aClientSignoffIsAnApproval() throws {
        let item = itemizedRow(try ProjectApprovalFixture.decision(contract: nil))
        #expect(item.isApproval)
        #expect(HouseRecordBuilder.title(for: item) == "Leah asked for your approval.")
    }

    @Test("an option choice keeps the choice grammar")
    func anOptionChoiceIsStillAChoice() throws {
        let raw: [String: Any] = [
            "id": "a0000000-0000-0000-0000-0000000009f1",
            "title": "Rug color — Natural vs Sand",
            "status": "pending",
            "coordination_kind": "selection",
            "court": "client",
            "created_at": "2026-09-01T00:00:00Z"
        ]
        let decision = try JSONDecoder().decode(
            RemoteClientDecision.self,
            from: try JSONSerialization.data(withJSONObject: raw)
        )
        let item = itemizedRow(decision)
        #expect(item.isApproval == false)
        #expect(HouseRecordBuilder.title(for: item)
                == "Leah asked about Rug color — Natural vs Sand.")
    }

    @Test("no approval row ever says choose, and no title doubles its punctuation")
    func noApprovalRowSaysChoose() throws {
        for decision in [
            try ProjectApprovalFixture.review().asWaitingDecision,
            try ProjectApprovalFixture.decision(contract: nil)
        ] {
            let title = HouseRecordBuilder.title(for: itemizedRow(decision))
            #expect(!title.lowercased().contains("choose"))
            #expect(!title.lowercased().contains("choice"))
            #expect(!title.lowercased().contains("decision"))
            #expect(!title.contains("?."))
        }
    }
}
