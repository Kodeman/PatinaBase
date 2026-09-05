//
//  WalkFixCopyTests.swift
//  PatinaTests
//
//  The Wave-1 simulator walk's round-1 findings, pinned where they were found.
//
//   • `W1R1-M1` — P-04's clock was dead code: nothing read
//     `DecisionPushType.icon`, so the feed drew one bucket glyph for all three
//     decision push types.
//   • `W1R1-M3` — the approval screen called itself DECISION and offered
//     "Neither of these" over a sign-off that says in the same breath there is
//     nothing to choose.
//   • `W1R1-M4` — the Studio hub printed numeric counts to a homeowner and
//     used a checkmark as the status mark on the approvals row.
//   • `iosb3-M1` — a whole-dollar delta rounded the other way from the letter
//     carrying the same figure, and a sub-dollar delta printed "+$0".
//

import Foundation
import Testing
@testable import Patina

// MARK: - W1R1-M1

struct DecisionPushIconReachesTheFeedTests {

    private func feedRow(type: String) throws -> AppNotification {
        let raw: [String: Any] = [
            "id": "n1",
            "user_id": "u1",
            "type": type,
            "channel": "in_app",
            "status": "delivered",
            "created_at": "2026-09-01T00:00:00.000Z",
            "metadata": ["entity_type": "decision", "entity_id": "d1"]
        ]
        let remote = try JSONDecoder().decode(
            RemoteNotification.self,
            from: try JSONSerialization.data(withJSONObject: raw)
        )
        return AppNotification(from: remote)
    }

    @Test("a passed date draws P-04's clock in the feed, not the bucket glyph")
    func theFeedDrawsTheClock() throws {
        #expect(try feedRow(type: "decision_overdue").icon == "clock")
        #expect(try feedRow(type: "decision_overdue").icon != AppNotificationType.decision.icon)
    }

    @Test("the other two decision push types draw their own mark too")
    func theOtherTypesDrawTheirOwn() throws {
        #expect(try feedRow(type: "decision_required").icon
                == DecisionPushType.required.icon)
        #expect(try feedRow(type: "decision_resolved").icon
                == DecisionPushType.resolved.icon)
    }

    @Test("a row that is not a decision push keeps its bucket glyph")
    func anOrdinaryRowIsUntouched() throws {
        #expect(try feedRow(type: "decision_attention").icon
                == AppNotificationType.decision.icon)
    }

    /// No checkmark: a check beside a row is a status mark, which the
    /// refusals name.
    @Test("no decision push glyph is a checkmark or a warning")
    func noGlyphIsACheckOrAWarning() {
        for type in DecisionPushType.allCases {
            #expect(!type.icon.contains("checkmark"), "\(type.rawValue) draws a check")
            #expect(!type.icon.contains("exclamationmark"))
        }
    }

    @Test("a push type's own title is preferred over the bucket's")
    func theTypeNamesItself() throws {
        #expect(try feedRow(type: "decision_overdue").title == "A decision is still open")
    }
}

// MARK: - W1R1-M3

@MainActor
struct ApprovalAskCopyTests {

    @Test("a sign-off wears the approval eyebrow, a choice wears DECISION")
    func theEyebrowNamesTheAsk() async throws {
        let signoff = DecisionDetailViewModel()
        signoff.decision = try ProjectApprovalFixture.decision(contract: nil)
        #expect(signoff.isApprovalAsk)

        let stage2 = DecisionDetailViewModel()
        stage2.decision = try ProjectApprovalFixture.review().asWaitingDecision
        #expect(stage2.isApprovalAsk)

        let choice = DecisionDetailViewModel()
        choice.decision = try Self.optionChoice()
        #expect(choice.isApprovalAsk == false)
    }

    private static func optionChoice() throws -> RemoteClientDecision {
        let raw: [String: Any] = [
            "id": "a0000000-0000-0000-0000-0000000009f1",
            "title": "Rug color — Natural vs Sand",
            "status": "pending",
            "coordination_kind": "selection",
            "court": "client",
            "created_at": "2026-09-01T00:00:00Z"
        ]
        return try JSONDecoder().decode(
            RemoteClientDecision.self,
            from: try JSONSerialization.data(withJSONObject: raw)
        )
    }

    @Test("with nothing to choose there is no Neither of these")
    func noNeitherWhereThereAreNoOptions() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision(contract: nil)
        viewModel.options = []
        #expect(viewModel.availableDeferrals == [.notYet])
        #expect(!viewModel.availableDeferrals.contains(.neitherOfThese))
    }

    @Test("a real choice keeps both deferral acts")
    func aChoiceKeepsBothActs() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision(contract: nil)
        viewModel.options = [try ProjectApprovalFixture.option()]
        #expect(viewModel.availableDeferrals == DecisionDeferral.allCases)
    }
}

// MARK: - W1R1-M4

@MainActor
struct StudioHubCountsInWordsTests {

    @Test("the hub counts in words, the way the doorstep does")
    func theHubCountsInWords() {
        #expect(StudioAttentionSummary.attentionHint(count: 1) == "One thing needs your eye")
        #expect(StudioAttentionSummary.attentionHint(count: 5) == "Five things need your eye")
        #expect(StudioAttentionSummary.attentionHint(count: 0) == nil)
    }

    /// Past twelve the word stops helping, exactly as the web decided
    /// (`standing-sentence.ts:136-144`).
    @Test("the word list matches the web's, cutoff included")
    func theWordListMatchesTheWeb() {
        #expect(PatinaCount.inWords(0) == "zero")
        #expect(PatinaCount.inWords(12) == "twelve")
        #expect(PatinaCount.inWords(13) == "13")
        #expect(PatinaCount.inWords(-4) == "zero")
        #expect(PatinaCount.inWordsCapitalized(3) == "Three")
    }

    @Test("the approvals row is not marked with a checkmark, and counts in words")
    func theApprovalsRowIsNotStamped() throws {
        let decisions = [
            try ProjectApprovalFixture.decision(contract: nil, id: "d1"),
            try ProjectApprovalFixture.decision(contract: nil, id: "d2"),
            try ProjectApprovalFixture.decision(contract: nil, id: "d3")
        ]
        let row = try #require(StudioQueueBuilder.build(
            StudioQueueInput(
                projects: [], decisions: decisions, proposals: [], invoices: [],
                documents: [], threads: [], notifications: [],
                currentUserId: "client", now: Date(timeIntervalSince1970: 1_756_900_000)
            )
        ).sections
            .first { $0.kind == .awaitingYou }?
            .rows
            .first { $0.id == "awaiting.decisions" })

        #expect(!row.systemImage.contains("checkmark"))
        #expect(row.detail == "Three approvals are waiting on you")
        #expect(!row.detail.contains("3"))
    }
}

// MARK: - iosb3-M1

struct ApprovalImpactMoneyTests {

    /// The web and the email round with `Intl.NumberFormat`, which expands a
    /// tie away from zero; `NumberFormatter` used to round it to even, so
    /// $2.50 read "$2" on iOS and "$3" in the same letter.
    @Test("a half dollar rounds the way the letter rounds it")
    func aHalfDollarRoundsTheSameWay() {
        #expect(PatinaCurrency.formatWholeDollars(cents: 250) == "$3")
        #expect(PatinaCurrency.formatWholeDollars(cents: 150) == "$2")
        #expect(PatinaCurrency.formatWholeDollars(cents: 125_060) == "$1,251")
        #expect(PatinaCurrency.formatWholeDollars(cents: 99) == "$1")
    }

    @Test("a row drawn because the cost changed never states no change")
    func aSubDollarDeltaSaysSo() {
        #expect(ProjectApprovalCopy.money(49) == "+less than $1")
        #expect(ProjectApprovalCopy.money(-49) == "−less than $1")
        #expect(ProjectApprovalCopy.money(250) == "+$3")
        #expect(ProjectApprovalCopy.money(-125_060) == "−$1,251")
        for cents in [1, 25, 49, 50, 99, 250, 125_060] {
            #expect(!ProjectApprovalCopy.money(cents).contains("$0"))
            #expect(!ProjectApprovalCopy.money(-cents).contains("$0"))
        }
    }
}
