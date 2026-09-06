//
//  AfterglowMarkTests.swift
//  PatinaTests
//
//  `iosd4-M4`. The mark an afterglow row carries: stored on the row, drawn
//  beside its sentence, and taken from the one table that maps an outcome to a
//  stamp — so the Record, the approval screen and the bell cannot draw three
//  different marks over one act.
//
//  Its own file rather than more members of `AfterglowRowTests`: that struct is
//  at SwiftLint's 300-line `type_body_length` and its file is at the 500-line
//  `file_length`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct AfterglowMarkTests {

    /// `P-17`: her own act crosses the eyebrow carrying the word that was
    /// stamped on it, and the word is drawn as the MARK — not merely written
    /// into the sentence. The stamp comes from the one table that maps an
    /// outcome to a state, so the Record, the approval screen and the bell
    /// cannot draw three different marks over one act.
    @Test("an answered approval carries the stamp its outcome earned")
    func theAfterglowCarriesItsMark() throws {
        let marks: [(String, PatinaStamp.State)] = [
            ("approved", .approved),
            ("changes_requested", .returned),
            ("needs_discussion", .held)
        ]
        for (outcome, mark) in marks {
            let approval = try ProjectApprovalFixture.review(
                lifecycleStatus: "responded",
                outcome: outcome,
                respondedAt: "2026-09-03T09:30:00+00:00"
            )
            let row = try #require(HouseRecordBuilder.answeredApprovalRows([approval]).first)
            #expect(row.stamp == mark.rawValue)
            #expect(row.stampState == mark, "\(outcome) drew \(String(describing: row.stampState))")
        }
    }

    @Test("a signed proposal carries the seal's own mark")
    func theSignedProposalCarriesTheSeal() throws {
        let signed = try Self.proposal(
            id: "p-1", title: "Kitchen", status: "accepted",
            signedAt: "2026-09-04T10:00:00+00:00", signedByName: "Anne"
        )
        let row = try #require(HouseRecordBuilder.signedProposalRows([signed]).first)
        #expect(row.stampState == .signed)
        #expect(row.stampState != .signedOnPaper, "she signed it here")
    }

    /// Only her own acts carry one: news about the house is not stamped.
    @Test("a row that is not her own act carries no mark")
    func newsCarriesNoMark() throws {
        let open = try ProjectApprovalFixture.review()
        let unsigned = try Self.proposal(
            id: "p-2", title: "Bath", status: "sent", signedAt: nil, signedByName: nil
        )
        #expect(HouseRecordBuilder.answeredApprovalRows([open]).isEmpty)
        #expect(HouseRecordBuilder.signedProposalRows([unsigned]).isEmpty)

        let plain = HouseRecordRow(
            id: "message:m1", kind: .messageReceived, title: "Leah wrote.",
            detail: nil, date: Date(), state: .none, isNew: true, route: nil
        )
        #expect(plain.stampState == nil)
    }

    /// A word a later build introduces — or a snapshot from one — draws no
    /// mark rather than costing the record its row.
    @Test("a mark this build does not know draws nothing")
    func anUnknownMarkDrawsNothing() {
        let row = HouseRecordRow(
            id: "approval-answered:d1", kind: .decisionAnswered,
            title: "You escalated this edition.", detail: nil, date: Date(),
            state: .none, isNew: false, stamp: "escalated", route: nil
        )
        #expect(row.stampState == nil)
    }

    /// The mark survives the snapshot on disk, and the two rebuilds the record
    /// makes of a row it keeps.
    @Test("the mark survives a round trip, a standing condition and a new-marking")
    func theMarkSurvivesTheRebuilds() throws {
        let row = HouseRecordRow(
            id: "approval-answered:d1", kind: .decisionAnswered,
            title: "You approved the budget.", detail: nil,
            date: Date(timeIntervalSince1970: 1_787_000_000), state: .none,
            isNew: false, stamp: PatinaStamp.State.approved.rawValue, route: nil
        )
        let encoded = try JSONEncoder().encode(row)
        let decoded = try JSONDecoder().decode(HouseRecordRow.self, from: encoded)
        #expect(decoded.stampState == .approved)

        // A row written before the ceremony has no key at all, and decodes.
        var stripped = try #require(
            try JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        )
        stripped.removeValue(forKey: "stamp")
        let old = try JSONDecoder().decode(
            HouseRecordRow.self,
            from: try JSONSerialization.data(withJSONObject: stripped)
        )
        #expect(old.stampState == nil)
    }

    /// And the card draws it beside the sentence rather than storing it and
    /// forgetting. A source pin: the row is a SwiftUI body with no seam.
    @Test("the record card draws the mark on a stamped row")
    func theCardDrawsTheMark() throws {
        let card = try SourcePin.readCode("Patina/Features/Home/Views/HouseRecordCard.swift")
        #expect(card.contains("if let mark = row.stampState {"))
        #expect(card.contains("PatinaStamp(state: mark, recordedAt: row.date, now: now)"))
        #expect(card.contains("|| row.stampState != nil"), "a stamped row stacks rather than crowding one line")
    }

    // MARK: - Fixtures

    /// The wire's own shape, decoded — the same fixture `AfterglowRowTests`
    /// keeps, which is private to its file.
    private static func proposal(
        id: String, title: String, status: String,
        signedAt: String?, signedByName: String?
    ) throws -> RemoteProposal {
        var row: [String: Any] = [
            "id": id,
            "title": title,
            "status": status,
            "created_at": "2026-09-01T00:00:00+00:00"
        ]
        if let signedAt { row["signed_at"] = signedAt }
        if let signedByName { row["signed_by_name"] = signedByName }
        return try JSONDecoder().decode(
            RemoteProposal.self,
            from: JSONSerialization.data(withJSONObject: row)
        )
    }
}
