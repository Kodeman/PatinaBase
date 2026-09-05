//
//  ProjectApprovalDoorsTests.swift
//  PatinaTests
//
//  `P-16` (iOS half). Three doors of equal weight, one mark each, and the
//  change note that opens itself on a return without ever blocking one.
//
//  Its own file rather than another member of `ProjectApprovalActTests`:
//  that suite is at SwiftLint's 300-line `type_body_length` and its file is
//  within three lines of `file_length`.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ProjectApprovalDoorsTests {

    // MARK: - Three doors, three marks

    /// `P-16` / `P-17`. RETURNED is the row that had no mark at all: the one
    /// outcome that asks the studio for work read as though nothing had
    /// happened.
    @Test("each outcome leaves its own mark, and changes-requested is RETURNED")
    func eachOutcomeLeavesItsMark() {
        #expect(ProjectApprovalCopy.stamp(for: .approved) == .approved)
        #expect(ProjectApprovalCopy.stamp(for: .changesRequested) == .returned)
        #expect(ProjectApprovalCopy.stamp(for: .needsDiscussion) == .held)
        #expect(ProjectApprovalCopy.stamp(for: .changesRequested).word == "RETURNED")
        // The one warm exception is a commercial document, never this rail.
        #expect(ProjectApprovalCopy.stamp(for: .changesRequested) != .declined)
    }

    /// The prose word matches the mark: RETURNED / "returned", HELD / "held".
    @Test("the recorded sentence uses the mark's own word")
    func theRecordedSentenceMatchesTheMark() {
        #expect(
            ProjectApprovalCopy.recorded(.changesRequested)
                == "You returned this edition for revision."
        )
        #expect(
            ProjectApprovalCopy.recorded(.needsDiscussion)
                == "You held this edition to talk it through with your designer."
        )
        for outcome in ProjectApprovalOutcome.allCases {
            let sentence = ProjectApprovalCopy.recorded(outcome).lowercased()
            #expect(!sentence.contains("declin"), "\(sentence) says declined")
        }
    }

    /// Equal weight is the ruling and the button style is where it lives: a
    /// filled Approve against two hairline alternatives is the screen leaning
    /// on a homeowner to say yes.
    @Test("no door is drawn louder than the other two")
    func theThreeDoorsCarryOneWeight() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        let start = try #require(source.range(of: "private func outcomeAct("))
        let body = String(source[start.lowerBound...].prefix(400))
        #expect(body.contains("style: .secondary"))
        #expect(
            !body.contains(".primary"),
            "one outcome is still drawn as the filled commitment style"
        )
    }

    // MARK: - The note (R10)

    @Test("the composer addresses the designer by name, and never invents one")
    func thePlaceholderNamesTheDesignerOrNobody() {
        #expect(
            ProjectApprovalCopy.notePlaceholder(designer: "Leah")
                == "Tell Leah what to change."
        )
        #expect(
            ProjectApprovalCopy.notePlaceholder(designer: nil)
                == "Tell your designer what to change."
        )
        #expect(
            ProjectApprovalCopy.notePlaceholder(designer: "")
                == "Tell your designer what to change."
        )
    }

    /// The help line is instructional, never validating — R10 asks for
    /// encouragement, and "required" copy on a phone is a blocked answer.
    @Test("the note is encouraged and the submit never waits on it")
    func theNoteIsEncouragedAndNeverRequired() throws {
        for word in ["required", "must", "please"] {
            #expect(!ProjectApprovalCopy.noteHelp.lowercased().contains(word))
        }
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        let start = try #require(source.range(of: "ProjectApprovalCopy.submitAction"))
        let body = String(source[start.lowerBound...].prefix(400))
        #expect(
            !body.contains("changeNote"),
            "the submit gates on the note — R10 says it may not"
        )
        #expect(body.contains("viewModel.canSignApproval"), "the submit gates on the name alone")
    }

    /// Pre-opened: the composer is drawn by the act of choosing Return, not by
    /// a second tap on a disclosure.
    @Test("the composer opens with the return, and only with it")
    func theComposerOpensOnReturnAlone() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        #expect(source.contains("if chosen.outcome == .changesRequested {"))
        #expect(source.contains("changeNoteComposer"))
    }

    @Test("a written note reaches the project conversation after the outcome")
    func theNoteFollowsTheOutcome() async throws {
        var order: [String] = []
        var sent: (route: DecisionDetailViewModel.MessageRoute, body: String)?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.chooseOutcome(.changesRequested)
        viewModel.changeNote = "  The walnut is too dark for the island.  "
        viewModel.respondToApproval = { _, _, _, _, _ in order.append("outcome") }
        viewModel.sendApprovalNote = { route, body in
            order.append("note")
            sent = (route, body)
            return "thread-1"
        }

        await viewModel.submitApprovalResponse()

        #expect(order == ["outcome", "note"], "the note described a return that had not happened")
        let call = try #require(sent)
        #expect(call.body == "The walnut is too dark for the island.")
        #expect(viewModel.changeNote.isEmpty)
        #expect(viewModel.noteFailure == nil)
        #expect(viewModel.answeredOutcome == .changesRequested)
    }

    @Test("an empty note sends nothing, and the return still lands")
    func anEmptyNoteSendsNothing() async throws {
        var noteCalls = 0
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.chooseOutcome(.changesRequested)
        viewModel.changeNote = "   "
        viewModel.respondToApproval = { _, _, _, _, _ in }
        viewModel.sendApprovalNote = { _, _ in noteCalls += 1; return "thread-1" }

        await viewModel.submitApprovalResponse()

        #expect(noteCalls == 0)
        #expect(viewModel.answeredOutcome == .changesRequested)
        #expect(viewModel.noteFailure == nil)
    }

    /// The outcome is recorded. Only the courtesy failed, and the screen may
    /// not draw that as an answer that needs giving again.
    @Test("a note that fails does not become a failed submit")
    func aFailedNoteIsNotAFailedSubmit() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.chooseOutcome(.changesRequested)
        viewModel.changeNote = "Swap the pulls."
        viewModel.respondToApproval = { _, _, _, _, _ in }
        viewModel.sendApprovalNote = { _, _ in throw Boom() }

        await viewModel.submitApprovalResponse()

        #expect(viewModel.answeredOutcome == .changesRequested)
        #expect(viewModel.submitFailure == nil, "a recorded answer was drawn as a failure")
        #expect(viewModel.noteFailure == ProjectApprovalCopy.noteUnsent)
    }

    /// An approval that was approved or held carries no change note: the
    /// composer is never drawn for them, and a note left over from a
    /// reconsidered return must not ride along.
    @Test("only a return sends a note")
    func onlyAReturnSendsANote() async throws {
        var noteCalls = 0
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.chooseOutcome(.changesRequested)
        viewModel.changeNote = "Never mind."
        viewModel.clearChosenOutcome()
        #expect(viewModel.changeNote.isEmpty, "the note outlived the outcome it was written for")

        viewModel.chooseOutcome(.approved)
        viewModel.respondToApproval = { _, _, _, _, _ in }
        viewModel.sendApprovalNote = { _, _ in noteCalls += 1; return "thread-1" }
        await viewModel.submitApprovalResponse()

        #expect(noteCalls == 0)
        #expect(viewModel.answeredOutcome == .approved)
    }
}
