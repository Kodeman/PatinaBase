//
//  ApprovalVocabularySweepTests.swift
//  PatinaTests
//
//  Wave 2's sweep over the rails this lane touches: the bell's Stage-2 titles,
//  the Studio hub's approvals row, and the Record's afterglow line.
//
//  The binding words (`rulings-2026-09-04.md`): "approval" is the ask;
//  "decision" belongs to an option choice between named alternatives;
//  `changes_requested` is RETURNED everywhere and never "Declined"; no numbers
//  where words will do; no checkmark as a status mark.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ApprovalVocabularySweepTests {

    private let now = ISO8601DateFormatter().date(from: "2026-09-05T12:00:00Z")!

    private func input(decisions: [RemoteClientDecision]) -> StudioQueueInput {
        StudioQueueInput(
            projects: [], decisions: decisions, proposals: [], invoices: [],
            documents: [], threads: [], notifications: [], currentUserId: nil, now: now
        )
    }

    // MARK: - The Studio hub's approvals row

    @Test("a hub row holding only approvals is named for what it holds")
    func theHubRowNamesApprovals() throws {
        let approvals = [
            try ProjectApprovalFixture.decision(id: "d-1"),
            try ProjectApprovalFixture.decision(id: "d-2")
        ]
        let snapshot = StudioQueueBuilder.build(input(decisions: approvals))
        let row = try #require(
            snapshot.sections.flatMap(\.rows).first { $0.id == "awaiting.decisions" }
        )
        #expect(row.title == "Approvals")
        #expect(!row.title.lowercased().contains("decision"))
    }

    @Test("one approval is named in the singular")
    func oneApprovalIsSingular() throws {
        let snapshot = StudioQueueBuilder.build(
            input(decisions: [try ProjectApprovalFixture.decision(id: "d-1")])
        )
        let row = try #require(
            snapshot.sections.flatMap(\.rows).first { $0.id == "awaiting.decisions" }
        )
        #expect(row.title == "Approval")
    }

    /// A real option choice keeps the older word, which is true of it.
    @Test("a group holding a real choice keeps the decision word")
    func aRealChoiceKeepsTheDecisionWord() throws {
        let mixed = [
            try ProjectApprovalFixture.decision(id: "d-1"),
            try Self.optionChoice(id: "d-2")
        ]
        let snapshot = StudioQueueBuilder.build(input(decisions: mixed))
        let row = try #require(
            snapshot.sections.flatMap(\.rows).first { $0.id == "awaiting.decisions" }
        )
        #expect(row.title == "Decisions")
    }

    @Test("the approvals row prints no figure and draws no checkmark")
    func theApprovalsRowPrintsNoFigure() throws {
        let approvals = try (1...3).map { try ProjectApprovalFixture.decision(id: "d-\($0)") }
        let snapshot = StudioQueueBuilder.build(input(decisions: approvals))
        let row = try #require(
            snapshot.sections.flatMap(\.rows).first { $0.id == "awaiting.decisions" }
        )
        #expect(row.title == "Approvals")
        #expect(row.detail == "Three approvals are waiting on you")
        #expect(!Self.printsAFigure(row.title))
        #expect(!Self.printsAFigure(row.detail ?? ""))
        #expect(!row.systemImage.contains("checkmark"))
    }

    // MARK: - The screen that row opens

    /// `iosd3-M1`, and the carry that finished it: the row was renamed to
    /// Approvals and the screen it opens still said DECISIONS — two words for
    /// one thing, on consecutive frames. RULED at the Wave-2 close: that
    /// screen lists approvals AND option choices, so it is titled for what it
    /// is doing — "Waiting on you" — and never DECISIONS, whatever it happens
    /// to be holding. The row keeps `groupNoun`, which names one group.
    @Test("the hub row and the screen it opens are named by one word")
    func theRowAndItsScreenAgree() throws {
        let approvals = [
            try ProjectApprovalFixture.decision(id: "d-1"),
            try ProjectApprovalFixture.decision(id: "d-2")
        ]
        let snapshot = StudioQueueBuilder.build(input(decisions: approvals))
        let row = try #require(
            snapshot.sections.flatMap(\.rows).first { $0.id == "awaiting.decisions" }
        )
        let list = DecisionsListViewModel()
        list.decisions = approvals

        #expect(row.title == "Approvals")
        #expect(list.eyebrow == "Waiting on you")
        #expect(!list.eyebrow.lowercased().contains("decision"))
    }

    @Test("a group holding a real choice keeps the older word on both frames")
    func theRowAndItsScreenAgreeOnARealChoice() throws {
        let mixed = [
            try ProjectApprovalFixture.decision(id: "d-1"),
            try Self.optionChoice(id: "d-2")
        ]
        let snapshot = StudioQueueBuilder.build(input(decisions: mixed))
        let row = try #require(
            snapshot.sections.flatMap(\.rows).first { $0.id == "awaiting.decisions" }
        )
        let list = DecisionsListViewModel()
        list.decisions = mixed

        #expect(row.title == "Decisions")
        // The screen holding a real choice is still not titled for it: the
        // title names the act, and the rows name themselves.
        #expect(list.eyebrow == "Waiting on you")
        #expect(!list.eyebrow.lowercased().contains("decision"))
    }

    /// A list holding nothing is not holding a choice between named
    /// alternatives, so the empty row is named for the ask — and the screen,
    /// like every other state of it, is titled for the act.
    @Test("an empty list is titled for the act, and its row for the ask")
    func theEmptyListIsNamedForTheAsk() {
        #expect(([] as [RemoteClientDecision]).groupNoun.plural == "Approvals")
        #expect(DecisionsListViewModel().eyebrow == "Waiting on you")
    }

    /// The title is one string on the screen and one string in the test, and
    /// the frame that draws it reads the model rather than its own literal.
    @Test("the screen draws the ruled title, and never the retired word")
    func theScreenDrawsTheRuledTitle() throws {
        #expect(DecisionsListViewModel.title == "Waiting on you")
        let screen = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/DecisionListView.swift"
        )
        #expect(screen.contains("MonoLabel(text: viewModel.eyebrow)"))
        #expect(!screen.lowercased().contains("\"decisions\""))
    }

    // MARK: - The bell

    @Test("the bell says what an approval IS now, in the ruled words")
    func theBellUsesTheRuledWords() throws {
        let open = try ProjectApprovalFixture.review()
        let returned = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded", outcome: "changes_requested",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )
        let row = AppNotification(
            type: .decision, title: ProjectApprovalCopy.retiredBellTitle, body: "",
            timestamp: now, entityType: "decision", entityId: ProjectApprovalFixture.decisionId
        )

        let openTitle = try #require(
            NotificationsViewModel.retitleApprovals([row], approvals: [open]).first?.title
        )
        #expect(openTitle == "An approval needs you")
        #expect(!openTitle.lowercased().contains("sign-off"))

        let returnedTitle = try #require(
            NotificationsViewModel.retitleApprovals([row], approvals: [returned]).first?.title
        )
        #expect(returnedTitle.lowercased().contains("returned"))
        #expect(!returnedTitle.lowercased().contains("declined"))
    }

    // MARK: - Every string this lane composes

    @Test("no string on these rails carries a refused word")
    func noRefusedWords() throws {
        let approved = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded", outcome: "approved",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )
        let returned = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded", outcome: "changes_requested",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )
        let held = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded", outcome: "needs_discussion",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )

        var strings = HouseRecordBuilder
            .answeredApprovalRows([approved, returned, held])
            .flatMap { [$0.title, $0.detail ?? ""] }
        strings.append(HouseRecordBuilder.signedProposalTitle)
        strings.append(contentsOf: PatinaNotificationAction.allCases.map(\.title))
        strings.append(contentsOf: [
            ProjectApprovalCopy.bellOpen,
            ProjectApprovalCopy.bellRecorded,
            ProjectApprovalCopy.bellClosed
        ])
        // The outcome buttons themselves. Excluded once, which is exactly how
        // "Decline" survived on `changes_requested` — the one string on this
        // rail a homeowner presses.
        strings.append(contentsOf: ProjectApprovalCopy.acts.map(\.label))
        strings.append(contentsOf: ProjectApprovalCopy.acts.map(\.consequence))

        for string in strings {
            let lowered = string.lowercased()
            // "decline", not only "declined": the button was a verb.
            for word in ["overdue", "gate", "task", "dashboard", "decline", "late"] {
                #expect(!lowered.contains(word), "\"\(string)\" carries the refused word \"\(word)\"")
            }
            #expect(!Self.printsAFigure(string), "\"\(string)\" prints a figure")
        }
    }

    // MARK: - Fixtures

    /// Written out rather than `contains(where: \.isNumber)`, which reads as a
    /// throwing call inside an `#expect` expansion.
    private static func printsAFigure(_ text: String) -> Bool {
        text.rangeOfCharacter(from: .decimalDigits) != nil
    }

    /// A legacy option choice: no approval contract, no client-court sign-off.
    private static func optionChoice(id: String) throws -> RemoteClientDecision {
        let row: [String: Any] = [
            "id": id,
            "title": "Rug color — Natural vs Sand",
            "status": "pending",
            "decision_type": "selection",
            "coordination_kind": "selection",
            "created_at": "2026-09-01T00:00:00Z"
        ]
        return try JSONDecoder().decode(
            RemoteClientDecision.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }
}
