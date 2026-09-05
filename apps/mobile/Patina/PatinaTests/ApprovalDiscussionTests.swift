//
//  ApprovalDiscussionTests.swift
//  PatinaTests
//
//  `IOSC-R2-01`. The note a homeowner writes with a Return lands on the
//  approval — and until this round nothing on the phone read it back, so her
//  own sentence disappeared the instant she sent it.
//
//  Its own file rather than another member of `ProjectApprovalDoorsTests`:
//  that suite is at SwiftLint's 300-line `type_body_length`.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ApprovalDiscussionTests {

    // MARK: - The read that was missing

    /// The whole finding in one assertion: iOS held an INSERT into
    /// `decision_comments` and no SELECT anywhere, and the web renders the
    /// same rows on the same screen.
    @Test("the app reads the notes it writes")
    func theAppReadsWhatItWrites() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Services/ApprovalDiscussion.swift"
        )
        #expect(source.contains("from(\"decision_comments\")"))
        #expect(source.contains(".eq(\"decision_id\""))
        // Oldest first, the order a conversation is read in and the order the
        // web renders (`use-decisions.ts:967`).
        #expect(source.contains(".order(\"created_at\", ascending: true)"))
        // A read, and only a read: a second composer down here would be a
        // second rail into the table `IOSC-02` narrowed to one.
        #expect(!source.contains(".insert("))
        #expect(!source.contains(".upsert("))
    }

    @Test("the notes are drawn on the ceremony, beneath the acts")
    func theBlockDrawsTheDiscussion() throws {
        let block = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        #expect(block.contains("ApprovalDiscussionBlock("))
        #expect(block.contains("readKey: viewModel.approvalDiscussionKey"))
        // The acts come first; the record of what was said sits under them.
        let acts = try #require(block.range(of: "outcomeLeg(review)"))
        let discussion = try #require(block.range(of: "ApprovalDiscussionBlock("))
        #expect(acts.lowerBound < discussion.lowerBound)

        let view = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ApprovalDiscussionBlock.swift"
        )
        #expect(view.contains(".task(id: readKey)"))
        #expect(view.contains("discussion.load(decisionId: decisionId)"))
        // Read-only: the one composer on this surface is the change note.
        #expect(!view.contains("TextField("))

        // `W2R1-B2`: and the read is attached to a container that is always
        // in the tree. Hung off `content` — a ViewBuilder whose only branches
        // are "there are comments" and "the read failed" — it was a modifier
        // on an unrendered empty view on first mount, so it never ran and the
        // comments could never become non-empty. The whole feature was inert.
        let body = try #require(view.range(of: "var body: some View {"))
        let task = try #require(view.range(of: ".task(id: readKey)"))
        #expect(
            String(view[body.upperBound..<task.lowerBound]).contains("VStack"),
            "the discussion read hangs off a view that may not be in the tree"
        )
    }

    // MARK: - Loading

    @Test("a loaded thread is what the read returned")
    func aLoadedThreadIsWhatTheReadReturned() async {
        let discussion = ApprovalDiscussion()
        discussion.fetch = { _ in [Self.comment(id: "c1"), Self.comment(id: "c2")] }

        await discussion.load(decisionId: "d1")

        #expect(discussion.comments.map(\.id) == ["c1", "c2"])
        #expect(!discussion.isUnreadable)
    }

    /// A thread that failed to read is not an empty thread. The screen says so
    /// rather than drawing silence over a note she can see on her laptop.
    @Test("a refused read is named, and never drawn as an empty thread")
    func aRefusedReadIsNamed() async {
        struct Boom: Error {}
        let discussion = ApprovalDiscussion()
        discussion.fetch = { _ in throw Boom() }

        await discussion.load(decisionId: "d1")

        #expect(discussion.comments.isEmpty)
        #expect(discussion.isUnreadable)
    }

    /// …and comments that loaded once do not vanish because a later refresh
    /// lost the network.
    @Test("a later failure keeps what is already on the screen")
    func aLaterFailureKeepsWhatIsOnScreen() async {
        struct Boom: Error {}
        let discussion = ApprovalDiscussion()
        discussion.fetch = { _ in [Self.comment(id: "c1")] }
        await discussion.load(decisionId: "d1")

        discussion.fetch = { _ in throw Boom() }
        await discussion.load(decisionId: "d1")

        #expect(discussion.comments.map(\.id) == ["c1"])
        #expect(discussion.isUnreadable)
    }

    @Test("no decision, no read")
    func noDecisionNoRead() async {
        var calls = 0
        let discussion = ApprovalDiscussion()
        discussion.fetch = { _ in calls += 1; return [] }

        await discussion.load(decisionId: nil)
        await discussion.load(decisionId: "")

        #expect(calls == 0)
        #expect(discussion.comments.isEmpty)
        #expect(!discussion.isUnreadable)
    }

    // MARK: - Whose hand wrote it

    @Test("her own note is hers, whatever case the id arrived in")
    func herOwnNoteIsHers() {
        let mine = Self.comment(id: "c1", authorId: "A1B2-C3")
        #expect(ApprovalDiscussion.isMine(mine, viewerId: "a1b2-c3"))
        #expect(!ApprovalDiscussion.isMine(mine, viewerId: "someone-else"))
        // An unknown reader never claims a row: putting her name on the
        // studio's sentence is worse than the reverse.
        #expect(!ApprovalDiscussion.isMine(mine, viewerId: nil))
        #expect(!ApprovalDiscussion.isMine(mine, viewerId: ""))
    }

    /// `P-11` (reduced): a studio note is signed by the designer and the
    /// house, never by an internal reviewer, and never by an invented name.
    @Test("the attribution names her, or the studio, or nobody in particular")
    func theAttributionNamesTheHand() {
        #expect(
            ProjectApprovalCopy.noteAttribution(
                isMine: true, designer: "Leah", studio: "Hartwell Studio", date: "Sep 5, 2026"
            ) == "You · Sep 5, 2026"
        )
        #expect(
            ProjectApprovalCopy.noteAttribution(
                isMine: false, designer: "Leah", studio: "Hartwell Studio", date: "Sep 5, 2026"
            ) == "Leah · Hartwell Studio · Sep 5, 2026"
        )
        #expect(
            ProjectApprovalCopy.noteAttribution(
                isMine: false, designer: nil, studio: "Hartwell Studio", date: "Sep 5, 2026"
            ) == "The studio · Sep 5, 2026"
        )
        #expect(
            ProjectApprovalCopy.noteAttribution(
                isMine: false, designer: "Leah", studio: "  ", date: "Sep 5, 2026"
            ) == "The studio · Sep 5, 2026"
        )
    }

    // MARK: - The reread, and the note it exists to show

    /// The ordering that makes the fix real. `submitApprovalResponse` records
    /// the outcome, THEN writes the note, and only then clears `isSubmitting`
    /// — so the key that drives the reread must not move until the note is on
    /// the server. Keyed on `answeredOutcome` it would fire between the two
    /// and reread a thread the note had not reached.
    @Test("the reread waits for the note it exists to show")
    func theRereadWaitsForTheNote() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.chooseOutcome(.changesRequested)
        viewModel.changeNote = "The walnut is too dark for the island."
        let opening = viewModel.approvalDiscussionKey
        var keyWhileWriting: String?
        viewModel.respondToApproval = { _, _, _, _, _ in }
        viewModel.sendApprovalNote = { _, _, _ in
            keyWhileWriting = viewModel.approvalDiscussionKey
            return nil
        }

        await viewModel.submitApprovalResponse()

        #expect(
            keyWhileWriting == opening,
            "the reread fired while the note was still being written"
        )
        #expect(
            viewModel.approvalDiscussionKey != opening,
            "the answer landed and the thread was never reread"
        )
    }

    /// The key is the approval's own id, so opening a second approval reads
    /// its own thread rather than reusing the first one's.
    @Test("the key is the approval being read")
    func theKeyIsTheApprovalBeingRead() throws {
        let viewModel = DecisionDetailViewModel()
        #expect(viewModel.approvalDecisionId == nil)
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        #expect(viewModel.approvalDecisionId == ProjectApprovalFixture.decisionId)
        #expect(
            viewModel.approvalDiscussionKey.hasPrefix(ProjectApprovalFixture.decisionId)
        )
    }

    private static func comment(
        id: String, authorId: String = "author-1"
    ) -> ApprovalComment {
        ApprovalComment(
            id: id,
            authorId: authorId,
            body: "The walnut is too dark for the island.",
            createdAt: "2026-09-05T12:00:00Z"
        )
    }
}
