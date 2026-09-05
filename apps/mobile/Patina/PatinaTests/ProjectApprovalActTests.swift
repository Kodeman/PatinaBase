//
//  ProjectApprovalActTests.swift
//  PatinaTests
//
//  `P-09`, half two: the two acts a Stage-2 approval offers, the parameters
//  they send, and the words they are offered in.
//
//  The shapes they run on are in `ProjectApprovalPathTests`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ProjectApprovalActTests {

    // MARK: - The two acts, and what they send

    @Test("the review act sends the frozen revision and the artifact hash")
    func theReviewActSendsTheCASPair() async throws {
        struct Sent { let id: String; let revision: Int; let checksum: String; let key: String }
        var sent: Sent?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1
        )
        viewModel.confirmApprovalReview = { id, revision, checksum, key in
            sent = Sent(id: id, revision: revision, checksum: checksum, key: key)
        }

        await viewModel.confirmExactEdition()

        let call = try #require(sent, "the review never reached the RPC")
        #expect(call.id == ProjectApprovalFixture.decisionId)
        #expect(call.revision == 3)
        #expect(call.checksum == String(repeating: "a", count: 64))
        #expect(!call.key.isEmpty, "the RPC refuses an empty idempotency key")
        #expect(viewModel.reviewConfirmed)
        #expect(viewModel.submitFailure == nil)
        #expect(viewModel.isSubmitting == false)
    }

    @Test("a review that fails says so and leaves the approval open")
    func aFailedReviewSaysSo() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1
        )
        viewModel.confirmApprovalReview = { _, _, _, _ in throw Boom() }

        await viewModel.confirmExactEdition()

        #expect(viewModel.submitFailure == MoneyFailureCopy.approvalReview)
        #expect(viewModel.reviewConfirmed == false)
        #expect(viewModel.isSubmitting == false)
    }

    /// Each of the three outcomes reaches `respond_project_approval` as itself,
    /// with the row's own `updatedAt` as the CAS value the RPC demands.
    @Test("each outcome is submitted with the row's own updatedAt",
          arguments: ProjectApprovalOutcome.allCases)
    func eachOutcomeIsSubmittedAsItself(outcome: ProjectApprovalOutcome) async throws {
        struct Sent {
            let id: String
            let outcome: ProjectApprovalOutcome
            let signature: String
            let expectedUpdatedAt: String
            let key: String
        }
        var sent: Sent?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.respondToApproval = { id, chosen, signature, expectedUpdatedAt, key in
            sent = Sent(
                id: id, outcome: chosen, signature: signature,
                expectedUpdatedAt: expectedUpdatedAt, key: key
            )
        }
        viewModel.typedSignature = "Margaret Whitfield"

        viewModel.chooseOutcome(outcome)
        #expect(viewModel.chosenOutcome == outcome, "choosing records nothing yet")
        #expect(sent == nil, "choosing an outcome must not write one")

        await viewModel.submitApprovalResponse()

        let call = try #require(sent, "the outcome never reached the RPC")
        #expect(call.id == ProjectApprovalFixture.decisionId)
        #expect(call.outcome == outcome)
        #expect(call.signature == "Margaret Whitfield", "P-18: the outcome is signed")
        #expect(call.expectedUpdatedAt == "2026-09-04T10:15:00+00:00")
        #expect(!call.key.isEmpty)
        #expect(viewModel.hasAnsweredApproval)
        #expect(viewModel.isResolved)
        #expect(viewModel.chosenOutcome == nil)
        #expect(viewModel.submitFailure == nil)
    }

    @Test("an outcome cannot be chosen on an approval that cannot take one")
    func anUnanswerableApprovalRefusesTheChoice() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review(lifecycleStatus: "draft", completed: 0, required: 1)
        viewModel.chooseOutcome(.approved)
        #expect(viewModel.chosenOutcome == nil)
    }

    @Test("a response that fails says so, and the chosen outcome survives the retry")
    func aFailedResponseKeepsTheChoice() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.respondToApproval = { _, _, _, _, _ in throw Boom() }
        viewModel.typedSignature = "Margaret Whitfield"

        viewModel.chooseOutcome(.changesRequested)
        await viewModel.submitApprovalResponse()

        #expect(viewModel.submitFailure == MoneyFailureCopy.approvalResponse)
        #expect(viewModel.hasAnsweredApproval == false)
        #expect(viewModel.isResolved == false)
        #expect(viewModel.chosenOutcome == .changesRequested)

        // SP-15's retry on this path: the banner clears and Submit is live
        // again — there is no consent step here to re-open.
        viewModel.retrySelection()
        #expect(viewModel.submitFailure == nil)
        #expect(viewModel.chosenOutcome == .changesRequested)
        #expect(viewModel.isApprovingSignoff == false)
        #expect(viewModel.pendingOptionId == nil)
    }

    // MARK: - The wire

    /// `iosb-B1`. The projection is the homeowner's ONLY door: 00467:18-38
    /// excludes `project_artifact_v1` from every raw `client_decisions` SELECT
    /// policy she can reach, so a PostgREST read of the row returns nothing to
    /// the person being asked.
    @Test("the client reads the sanitized single-row RPC, not the row and not the studio one")
    func theClientReadsTheSanitizedProjection() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func fetchProjectApprovalReview("))
        let body = String(source[start.lowerBound...].prefix(900))
        #expect(body.contains("callRPC("))
        #expect(body.contains("\"get_project_decision_review\", body: [\"p_decision_id\": decisionId]"))
        // `get_project_decision_reviews` is studio-scoped and answers a
        // homeowner with `insufficient_privilege`; `client_decisions` is the
        // raw table she cannot see a Stage-2 row in at all.
        #expect(!body.contains("get_project_decision_reviews"))
        #expect(!body.contains("client_decisions"))
    }

    /// The RPC returns `jsonb`, and NULL for a nonexistent, legacy or
    /// unauthorized id. Four bytes of `null` are not a decoding failure.
    @Test("an unauthorized or unknown id decodes as no approval, not as an error")
    func aNullProjectionIsNotAnError() throws {
        let source = try SourcePin.readCode(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        #expect(source.contains("payload != \"null\""))
        #expect(source.contains("-> RemoteProjectApprovalReview?"))
    }

    /// The parameters `use-project-approvals.ts` sends, argument for argument.
    @Test("the review RPC is called with the web's own parameters")
    func theReviewRPCParametersMatchTheWeb() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func confirmProjectApprovalReview("))
        let body = String(source[start.lowerBound...].prefix(1400))
        #expect(body.contains("callRPC(\"confirm_project_decision_review\""))
        #expect(body.contains("\"p_decision_id\": decisionId"))
        #expect(body.contains("\"authorityRevision\": authorityRevision"))
        #expect(body.contains("\"artifactHash\": artifactChecksum"))
        #expect(body.contains("\"reviewMethod\": \"portal_clickthrough\""))
        #expect(body.contains("\"p_idempotency_key\": idempotencyKey"))
    }

    @Test("the response RPC is called with the web's own parameters")
    func theResponseRPCParametersMatchTheWeb() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func respondToProjectApproval("))
        let body = String(source[start.lowerBound...].prefix(1400))
        #expect(body.contains("callRPC(\"respond_project_approval\""))
        #expect(body.contains("\"p_decision_id\": decisionId"))
        #expect(body.contains("\"outcome\": outcome.rawValue"))
        #expect(body.contains("\"p_expected_updated_at\": expectedUpdatedAt"))
        #expect(body.contains("\"p_idempotency_key\": idempotencyKey"))
        // The payload admits exactly one of outcome / optionId, and iOS sends
        // the outcome — an option id would answer the wrong question.
        #expect(!body.contains("optionId"))
    }

    // MARK: - The words

    /// Verb, then consequence. Not the web's strings: "gate" is refused on
    /// every client-facing surface, and the homeowner approves an EDITION.
    ///
    /// `P-16`: Approve / Return / Hold, in that order. "Decline" and "Ask a
    /// question" are both gone — `changes_requested` is RETURNED everywhere,
    /// and the third door holds the approval open rather than describing the
    /// message a homeowner might send about it.
    @Test("the three doors read verb-then-consequence, in the house's words")
    func theActsReadVerbThenConsequence() {
        let acts = ProjectApprovalCopy.acts
        #expect(acts.map(\.outcome) == [.approved, .changesRequested, .needsDiscussion])
        #expect(acts[0].label == "Approve")
        #expect(acts[0].consequence == "Accept this exact edition and its stated impacts.")
        #expect(acts[1].label == "Return")
        #expect(
            acts[1].consequence
                == "Send this edition back for revision and a new approval request."
        )
        #expect(acts[2].label == "Hold")
        #expect(
            acts[2].consequence
                == "Keep this open while you and your designer talk it through."
        )
        #expect(!acts.contains { $0.label == "Decline" })
    }

    @Test("the immutability sentence names the edition it binds")
    func theImmutabilitySentenceNamesTheEdition() {
        #expect(
            ProjectApprovalCopy.immutability(edition: 3)
                == "You are approving edition 3, exactly as shown."
        )
    }

    @Test("an edition that changes nothing says so in one line")
    func nothingChangedIsALine() {
        #expect(
            ProjectApprovalCopy.impacts(
                costCentsDelta: 0, scheduleDaysDelta: 0, leadTimeDaysDelta: 0
            ).isEmpty
        )
        #expect(ProjectApprovalCopy.noImpact == "No cost, schedule or lead-time change.")
    }

    /// R11: the three deltas stand independently, and a zero is not a row.
    @Test("the impacts are stated independently, and a zero is silence")
    func theImpactsStandIndependently() {
        let rows = ProjectApprovalCopy.impacts(
            costCentsDelta: 120_000, scheduleDaysDelta: 0, leadTimeDaysDelta: -1
        )
        #expect(rows.map(\.label) == ["Cost", "Lead time"])
        #expect(rows[0].value == "+$1,200")
        #expect(rows[1].value == "−1 day")
        #expect(ProjectApprovalCopy.days(3) == "+3 days")
        #expect(ProjectApprovalCopy.money(-45_000) == "−$450")
    }

    /// The vocabulary refusals, on every string this screen prints.
    @Test("no refused word reaches the approval screen")
    func theRefusedWordsAreAbsent() throws {
        var strings = ProjectApprovalCopy.acts.flatMap { [$0.label, $0.consequence] }
        strings += [
            ProjectApprovalCopy.eyebrow,
            ProjectApprovalCopy.reviewPrompt,
            ProjectApprovalCopy.reviewAction,
            ProjectApprovalCopy.reviewConfirmed,
            ProjectApprovalCopy.awaitingStudioIssue,
            ProjectApprovalCopy.reviewUnavailable,
            ProjectApprovalCopy.choosePrompt,
            ProjectApprovalCopy.submitAction,
            ProjectApprovalCopy.chooseAgainAction,
            ProjectApprovalCopy.unavailable,
            ProjectApprovalCopy.noImpact,
            ProjectApprovalCopy.withdrawn,
            ProjectApprovalCopy.superseded,
            ProjectApprovalCopy.immutability(edition: 2),
            ProjectApprovalCopy.noteLabel,
            ProjectApprovalCopy.noteHelp,
            ProjectApprovalCopy.noteUnsent,
            ProjectApprovalCopy.notePlaceholder(designer: "Leah"),
            ProjectApprovalCopy.notePlaceholder(designer: nil)
        ]
        strings += ProjectApprovalOutcome.allCases.map(ProjectApprovalCopy.recorded)
        // "AI" is refused as a WORD; as a substring it lives inside "again".
        for refused in ["gate", "task", "dashboard", "overdue"] {
            for line in strings {
                #expect(
                    !line.lowercased().contains(refused.lowercased()),
                    "\"\(line)\" carries the refused word \"\(refused)\""
                )
            }
        }
        #expect(ProjectApprovalCopy.eyebrow == "APPROVAL")
        #expect(ProjectApprovalCopy.reviewAction == "Review exact edition")
        #expect(ProjectApprovalCopy.submitAction == "Submit response")
    }

    /// `iosb-M1`. No red, no green, no checkmark — across the WHOLE Stage-2
    /// branch, not one file of it. The previous pin read the block alone and
    /// passed green while the screen mounting it drew a sage
    /// `checkmark.seal.fill` banner from `DecisionDetailView`.
    ///
    /// These two files ARE the branch: `DecisionDetailView`'s body draws
    /// `ProjectApprovalScreen` and nothing else on it (pinned in
    /// `ProjectApprovalPathTests.aStage2DecisionIsNotAnOptionChoice`), and the
    /// screen draws the block.
    @Test("no view on the Stage-2 branch draws a status colour or a seal glyph",
          arguments: [
            "Patina/Features/Decisions/Views/ProjectApprovalScreen.swift",
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
          ])
    func theStage2BranchHasNoStatusColour(file: String) throws {
        let source = try SourcePin.readCode(file)
        for banned in [
            "PatinaColors.sage", "PatinaColors.Text.error", "PatinaColors.error",
            "checkmark", "systemName:"
        ] {
            #expect(!source.contains(banned), "\(file) draws \(banned)")
        }
    }

    /// …and the sentence the old banner printed is gone from the branch: the
    /// ask is an approval, and it is never called a decision.
    @Test("the Stage-2 branch never calls the ask a decision")
    func theStage2BranchNeverSaysDecision() throws {
        let screen = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalScreen.swift"
        )
        #expect(!screen.contains("You’ve responded to this decision"))
        #expect(screen.contains("ProjectApprovalCopy.eyebrow"))
        var strings = [
            ProjectApprovalCopy.withdrawn,
            ProjectApprovalCopy.superseded,
            ProjectApprovalCopy.unavailable,
            ProjectApprovalCopy.reviewUnavailable
        ]
        strings += ProjectApprovalOutcome.allCases.map(ProjectApprovalCopy.recorded)
        for line in strings {
            #expect(!line.lowercased().contains("decision"),
                    "\"\(line)\" calls the approval a decision")
        }
    }
}

/// `P-09`, half three: what the screen says when there is no act left to take.
/// Split from `ProjectApprovalActTests` only because SwiftLint's 300-line
/// `type_body_length` is a per-type budget and that suite is at it.
@MainActor
struct ProjectApprovalClosureTests {

    // MARK: - The approval that is closed, or already answered

    /// `iosb-M2`. Withdrawn and superseded used to draw nothing at all.
    @Test("a closed approval says which way it closed")
    func aClosedApprovalIsNamed() {
        #expect(
            ProjectApprovalCopy.withdrawn
                == "Your designer withdrew this approval. Nothing is being asked of you here."
        )
        #expect(
            ProjectApprovalCopy.superseded
                == "A later edition has replaced this one. This edition is closed."
        )
    }

    /// `iosb-M3`. An answered approval named nothing; the block decoded the
    /// outcome and never read it. "Returned" is P-16's prose word for
    /// `changes_requested`; "held" is R8's hold word.
    @Test("an answered approval names the answer she gave")
    func anAnsweredApprovalNamesTheOutcome() {
        #expect(ProjectApprovalCopy.recorded(.approved) == "You approved this edition.")
        #expect(
            ProjectApprovalCopy.recorded(.changesRequested)
                == "You returned this edition for revision."
        )
        #expect(
            ProjectApprovalCopy.recorded(.needsDiscussion)
                == "You held this edition to talk it through with your designer."
        )
    }

    /// …and the answer given in THIS session is named too, before the row has
    /// been re-read. `submitApprovalResponse` clears the pending choice, so it
    /// is the recorded one that has to survive.
    @Test("the outcome just submitted survives to be named")
    func theSubmittedOutcomeSurvives() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.respondToApproval = { _, _, _, _, _ in }
        viewModel.typedSignature = "Margaret Whitfield"

        viewModel.chooseOutcome(.needsDiscussion)
        await viewModel.submitApprovalResponse()

        #expect(viewModel.answeredOutcome == .needsDiscussion)
        #expect(viewModel.hasAnsweredApproval)
        #expect(viewModel.chosenOutcome == nil)
    }

    /// `iosb2-M2`. The projection is not refetched after a successful submit,
    /// so the row in hand still says `canRespond` — and the screen printed the
    /// present-tense "You are approving edition 3, exactly as shown." directly
    /// above "You approved this edition."
    @Test("the immutability sentence goes when the answer lands")
    func theImmutabilitySentenceGoesWithTheAct() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.respondToApproval = { _, _, _, _, _ in }
        viewModel.typedSignature = "Margaret Whitfield"

        viewModel.chooseOutcome(.approved)
        await viewModel.submitApprovalResponse()

        // The state the screen is left holding: an unrefetched row that still
        // says she may answer, over an answer she has already given.
        #expect(viewModel.approvalReview?.canRespond == true)
        #expect(viewModel.hasAnsweredApproval)

        let block = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        let answered = try #require(block.range(of: "if !viewModel.hasAnsweredApproval,"))
        let covered = String(block[answered.upperBound...].prefix(200))
        #expect(covered.contains("ProjectApprovalCopy.immutability"),
                "the answered guard no longer covers the immutability sentence")
    }

    /// The block reads the recorded outcome — it decoded one and never drew it.
    @Test("the block draws the closed and answered lines where the acts would be")
    func theBlockDrawsTheClosureLines() throws {
        let block = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        #expect(block.contains("closureLeg(review)"))
        #expect(block.contains("review.isWithdrawn"))
        #expect(block.contains("review.isSuperseded"))
        #expect(block.contains("viewModel.answeredOutcome ?? review.recordedOutcome"))
        // Withdrawn and superseded stand ahead of an outcome, the house's own
        // precedence (`client-attention.ts:55-71`).
        let withdrawn = try #require(block.range(of: "review.isWithdrawn"))
        let recorded = try #require(block.range(of: "review.recordedOutcome"))
        #expect(withdrawn.lowerBound < recorded.lowerBound)
    }

    // MARK: - Failure copy that is true

    /// `iosb-M5`. Both lines told her to pull down and try again for
    /// conditions a retry can never fix — a missing frozen authority revision
    /// is a property of the snapshot, and the same unavailable branch catches
    /// a caller the projection will never open for.
    @Test("no failure line promises a retry that cannot help")
    func noFailureLinePromisesARetry() {
        for line in [ProjectApprovalCopy.reviewUnavailable, ProjectApprovalCopy.unavailable] {
            #expect(!line.lowercased().contains("try again"), "\"\(line)\" promises a retry")
            #expect(!line.lowercased().contains("pull down"), "\"\(line)\" promises a retry")
        }
        #expect(
            ProjectApprovalCopy.reviewUnavailable
                == "This edition isn’t ready to be confirmed. Your designer has to send it again."
        )
        #expect(ProjectApprovalCopy.unavailable == "We couldn’t open this approval.")
    }
}

/// `P-09`, half four: the money on the impact row. A type of its own for the
/// same per-type budget reason as the suite above it.
@MainActor
struct ProjectApprovalImpactTests {

    /// `iosb2-M1`. `abs(cents) / 100` truncates, so a $1,250.60 delta printed
    /// "+$1,250" here while the same edition's email and web copy printed
    /// "+$1,251" — `moneyInWords` (`standing-sentence.ts:148`) is
    /// `Intl.NumberFormat` at `maximumFractionDigits: 0`, which rounds. Two
    /// surfaces stating different figures for one edition is the defect; a
    /// 99-cent delta printing "+$0" under a row that exists only because the
    /// cost changed is the same bug saying so out loud.
    @Test("the money rounds where the web rounds, and never contradicts its own row")
    func theMoneyRoundsLikeTheWeb() {
        #expect(ProjectApprovalCopy.money(125_060) == "+$1,251")
        #expect(ProjectApprovalCopy.money(-125_099) == "−$1,251")
        #expect(ProjectApprovalCopy.money(99) == "+$1")
        #expect(ProjectApprovalCopy.money(-99) == "−$1")
        // The whole-dollar figures the screen already shipped are unchanged.
        #expect(ProjectApprovalCopy.money(120_000) == "+$1,200")
        #expect(ProjectApprovalCopy.money(-45_000) == "−$450")
    }

    /// …and the figure comes from the house's own currency formatter, so a
    /// device outside en-US renders USD rather than a "$" typed in front of a
    /// decimal number ("$1.250" on a de-DE device).
    @Test("the impact money is currency-formatted, not a symbol and a number")
    func theMoneyIsCurrencyFormatted() throws {
        let copy = try SourcePin.readCode(
            "Patina/Features/Decisions/ProjectApprovalCopy.swift"
        )
        #expect(copy.contains("PatinaCurrency.formatWholeDollars"))
        #expect(!copy.contains("NumberFormatter.localizedString"))
        #expect(!copy.contains("abs(cents) / 100"))
    }
}
