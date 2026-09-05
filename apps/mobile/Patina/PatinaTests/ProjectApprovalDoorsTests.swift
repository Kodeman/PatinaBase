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

    /// `W2R1-m1`. The walk read one control naming the same person two ways
    /// two lines apart — "Tell Leah what to change." over "…goes to your
    /// designer…". The placeholder names her; the help line does not name
    /// anyone.
    @Test("the composer names the designer once")
    func theComposerNamesTheDesignerOnce() {
        #expect(!ProjectApprovalCopy.noteHelp.contains("your designer"))
        #expect(!ProjectApprovalCopy.noteHelp.contains("designer"))
        #expect(
            ProjectApprovalCopy.noteHelp
                == "Optional. Your note goes with this returned edition."
        )
        // …and the naming that survives is the placeholder's.
        #expect(ProjectApprovalCopy.notePlaceholder(designer: "Leah").contains("Leah"))
    }

    /// `IOSC-03`. The placeholder above can only name a designer if something
    /// resolves one, and the row the composer used to read is nil for the
    /// person being asked (00467:18-38). The projection's `projectId` against
    /// the projects the app already holds is what actually carries a name.
    @Test("the designer is resolved from the held project, not the unreachable row")
    func theDesignerResolvesFromTheHeldProject() {
        let projectId = "b0000000-0000-0000-0000-0000000000b1"
        let projects = [Self.project(id: projectId, designerName: "Leah Hartwell")]

        // The embed is absent — the Stage-2 case — and the name still lands.
        #expect(
            ProjectApprovalBlock.designerGivenName(
                embedded: nil, projectId: projectId, projects: projects
            ) == "Leah"
        )
        // No project held, no name invented.
        #expect(
            ProjectApprovalBlock.designerGivenName(
                embedded: nil, projectId: projectId, projects: []
            ) == nil
        )
        #expect(
            ProjectApprovalBlock.designerGivenName(
                embedded: nil, projectId: nil, projects: projects
            ) == nil
        )
        // An embed that DID arrive still wins — the legacy rail is unchanged.
        #expect(
            ProjectApprovalBlock.designerGivenName(
                embedded: "Margaret", projectId: projectId, projects: projects
            ) == "Margaret"
        )
    }

    /// And the view binding reads that resolution, not the nil row: the whole
    /// finding was a pure function that passed while its one call site could
    /// never reach a name.
    @Test("the composer's binding reads the resolution")
    func theBindingReadsTheResolution() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        let start = try #require(source.range(of: "private var designerGivenName: String? {"))
        let body = String(source[start.lowerBound...].prefix(360))
        #expect(body.contains("BadgeCountService.shared.projects"))
        #expect(body.contains("viewModel.approvalReview?.projectId"))
    }

    private static func project(id: String, designerName: String) -> RemoteProject {
        RemoteProject(
            id: id, name: "Kitchen", status: "active", client_id: nil,
            designer_id: nil, studio_id: nil, total_amount_cents: nil,
            budget_cents: nil, design_fee_cents: nil, current_phase: nil,
            start_date: nil, target_end_date: nil, client_visibility_tier: nil,
            updated_at: nil,
            designer: RemoteDesignerRef(
                id: nil, display_name: designerName, full_name: nil, business_name: nil
            )
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
        // RULED 2026-09-05: the submit waits on a name only where one is
        // asked for, which is Approve alone (`canSubmitApproval`).
        #expect(body.contains("viewModel.canSubmitApproval"), "the submit gates on the note")
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

    /// `IOSC-02`. The note is carried to the APPROVAL, not to a chat thread:
    /// the decision id the outcome was recorded against is what the writer is
    /// handed, and a note that landed there moves nothing to a thread.
    @Test("a written note reaches the approval after the outcome")
    func theNoteFollowsTheOutcome() async throws {
        var order: [String] = []
        var sent: (decisionId: String?, body: String)?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.chooseOutcome(.changesRequested)
        viewModel.changeNote = "  The walnut is too dark for the island.  "
        viewModel.respondToApproval = { _, _, _, _, _ in order.append("outcome") }
        viewModel.sendApprovalNote = { decisionId, _, body in
            order.append("note")
            sent = (decisionId, body)
            return nil
        }

        await viewModel.submitApprovalResponse()

        #expect(order == ["outcome", "note"], "the note described a return that had not happened")
        let call = try #require(sent)
        #expect(call.decisionId == ProjectApprovalFixture.decisionId)
        #expect(call.body == "The walnut is too dark for the island.")
        #expect(viewModel.discussThreadId == nil, "a note on the approval moved Discuss this")
        #expect(viewModel.changeNote.isEmpty)
        #expect(viewModel.noteFailure == nil)
        #expect(viewModel.answeredOutcome == .changesRequested)
    }

    /// …and only a note that actually took the fallback rail points
    /// "Discuss this" at the thread it landed in.
    @Test("a note that fell back to the conversation points Discuss this at it")
    func aFallenBackNoteMovesTheThread() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.chooseOutcome(.changesRequested)
        viewModel.changeNote = "Swap the pulls."
        viewModel.respondToApproval = { _, _, _, _, _ in }
        viewModel.sendApprovalNote = { _, _, _ in "thread-1" }

        await viewModel.submitApprovalResponse()

        #expect(viewModel.discussThreadId == "thread-1")
        #expect(viewModel.noteFailure == nil)
    }

    /// `IOSC-02`. The web inserts the note into `decision_comments`
    /// (`use-decisions.ts:991`); iOS did not, so a designer read half the
    /// notes on the approval and half in a chat thread. The order is the
    /// finding's fix: the approval first, the conversation only after it.
    @Test("the writer's first rail is the approval, and messaging is the fallback")
    func theWriterPrefersTheApproval() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Services/ApprovalNoteWriter.swift"
        )
        #expect(source.contains("from(\"decision_comments\")"))
        // Inside `send` itself, and in this order: the approval is attempted
        // first and the conversation is only what a refusal falls through to.
        let send = try #require(source.range(of: "static func send("))
        let body = String(source[send.lowerBound...].prefix(900))
        let approval = try #require(body.range(of: "try await post(decisionId: decisionId"))
        let messaging = try #require(body.range(of: "MessagingAPIClient.shared.createThread"))
        #expect(
            approval.lowerBound < messaging.lowerBound,
            "the conversation is written before the approval — the fallback became the rail"
        )
        #expect(source.contains("author_id"), "the row carries no author for the RLS check")
        #expect(source.contains("AuthService.shared.currentUserId"))
        // A note that reached neither is the only failure the screen names.
        #expect(body.contains("guard route != nil else { throw error }"))
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
        viewModel.sendApprovalNote = { _, _, _ in noteCalls += 1; return nil }

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
        viewModel.sendApprovalNote = { _, _, _ in throw Boom() }

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
        viewModel.sendApprovalNote = { _, _, _ in noteCalls += 1; return nil }
        await viewModel.submitApprovalResponse()

        #expect(noteCalls == 0)
        #expect(viewModel.answeredOutcome == .approved)
    }
}
