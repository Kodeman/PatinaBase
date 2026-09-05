//
//  ProjectApprovalLapseTests.swift
//  PatinaTests
//
//  `W2R1-B1`. The fourth way a Stage-2 approval closes: the clock ran out
//  with nothing recorded on it.
//
//  A lapsed row satisfied none of the three closure branches — it is not
//  withdrawn, not superseded, and carries no outcome to name — while
//  `canRespond` withheld the three doors. The walk found the ceremony drawing
//  the question, the edition line and the impact block and then stopping:
//  no stamp, no sentence, no acts, on a screen a homeowner had been sent to.
//  `PatinaStamp.State.expired` had existed since P-17 and was mounted nowhere
//  in the app.
//
//  Its own file rather than another member of `ProjectApprovalClosureTests`:
//  `ProjectApprovalActTests.swift` is at SwiftLint's 500-line `file_length`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ProjectApprovalLapseTests {

    /// The copy: a fact about the paper, never about her. R8 keeps lateness
    /// out of the client's register, so there is no "overdue" and no lapse
    /// laid at her door — and the next move is named, because there is one.
    @Test("a lapsed approval says so, without blaming its reader")
    func theLapsedLineIsAFactAboutThePaper() {
        #expect(
            ProjectApprovalCopy.expired
                == "This approval closed before it was answered. Your designer can send it again."
        )
        for refused in ["overdue", "late", "missed", "failed", "sorry"] {
            #expect(
                !ProjectApprovalCopy.expired.lowercased().contains(refused),
                "the lapse line carries \"\(refused)\""
            )
        }
    }

    /// The state itself, off the projection: `client_decisions.status` is
    /// CHECK-constrained to `draft | pending | responded | expired`.
    @Test("an expired row with no answer on it is a closure of its own")
    func anUnansweredExpiryIsALapse() throws {
        let review = try ProjectApprovalFixture.review(lifecycleStatus: "expired")
        #expect(review.isLapsed)
        #expect(!review.canRespond)
        #expect(!review.awaitsClient)
    }

    /// …and an expired row that DOES carry an answer is an answered approval:
    /// the answer is the fact worth stating, so the outcome reads first.
    @Test("an expiry over a recorded answer is not a lapse")
    func anAnsweredExpiryIsNotALapse() throws {
        let answered = try ProjectApprovalFixture.review(
            lifecycleStatus: "expired", outcome: "approved"
        )
        #expect(!answered.isLapsed)
        // Disposition still stands ahead of everything (`client-attention.ts`).
        let superseded = try ProjectApprovalFixture.review(
            lifecycleStatus: "expired", disposition: "superseded"
        )
        #expect(!superseded.isLapsed)
    }

    /// And the ceremony draws it: the sentence and the mark it earned, in the
    /// house's own order — disposition, then outcome, then the clock.
    @Test("the block draws the lapse where the acts would be")
    func theBlockDrawsTheLapse() throws {
        let block = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        #expect(block.contains("review.isLapsed"))
        #expect(block.contains("ProjectApprovalCopy.expired, stamp: .expired"))
        let recorded = try #require(block.range(of: "review.recordedOutcome"))
        let lapsed = try #require(block.range(of: "review.isLapsed"))
        #expect(recorded.lowerBound < lapsed.lowerBound)
    }
}
