//
//  ApprovalWhyAndChairTests.swift
//  PatinaTests
//
//  The Wave-2 carry, iOS half: the frozen why the phone never drew, and the
//  chair the acts never asked about.
//
//  `P-13` — 00569 freezes the designer's one line into the artifact and emits
//  it on the projection as `why` + `whyAuthorName`. The web has drawn both
//  since the Threshold (`approval-ask.tsx`'s `approval-why` /
//  `approval-attribution`); iOS decoded neither, so the sentence that explains
//  the ask reached a laptop and never a phone.
//
//  `IOSC-R2-07` — `canRespond` is the ROW's state and says nothing about who
//  is reading it. A studio co-member reads her own studio's approvals through
//  00467, and `respond_project_approval` accepts the frozen decision lead and
//  nobody else, so the doors she was being offered were three acts the server
//  refuses.
//
//  Its own file rather than another member of `ProjectApprovalActTests` or
//  `ProjectApprovalDoorsTests`: both are at SwiftLint's 300-line
//  `type_body_length`, and one is within three lines of `file_length`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ApprovalWhyTests {

    // MARK: - The wire

    /// The projection's own two keys, decoded under the names the RPC emits.
    /// The fixture builds the RPC's JSON, so this pins the key spelling too.
    @Test("the why and its author come off the projection")
    func theWhyComesOffTheProjection() throws {
        let review = try ProjectApprovalFixture.review(
            why: "The mill can hold this walnut until Friday and no longer.",
            whyAuthorName: "Leah"
        )
        #expect(review.why == "The mill can hold this walnut until Friday and no longer.")
        #expect(review.whyAuthorName == "Leah")
        #expect(review.designerWhy == "The mill can hold this walnut until Friday and no longer.")
        #expect(review.designerWhyAuthor == "Leah")
    }

    /// Every approval composed before 00569, and every projection an older
    /// build wrote, carries neither — and decodes rather than throwing.
    @Test("an approval with no why decodes, and draws nothing")
    func anApprovalWithoutAWhyIsSilent() throws {
        let review = try ProjectApprovalFixture.review()
        #expect(review.why == nil)
        #expect(review.designerWhy == nil)
        #expect(review.designerWhyAuthor == nil)
    }

    /// A whitespace-only line is no line at all — the same reading the web's
    /// `whyOf` takes of the same field.
    @Test("a blank why is no why")
    func aBlankWhyIsNoWhy() throws {
        let review = try ProjectApprovalFixture.review(why: "   \n  ", whyAuthorName: "Leah")
        #expect(review.designerWhy == nil)
        #expect(review.designerWhyAuthor == nil, "a name with no sentence over it attributes nothing")
    }

    /// The projection emits the name only alongside a why (00569's CASE), and
    /// the app holds the same rule rather than trusting it: an unattributed
    /// line is drawn, unsigned, rather than signed by nobody.
    @Test("a why with no name is drawn unsigned")
    func aWhyWithNoNameIsDrawnUnsigned() throws {
        let review = try ProjectApprovalFixture.review(why: "Held for the mill.")
        #expect(review.designerWhy == "Held for the mill.")
        #expect(review.designerWhyAuthor == nil)
        let blank = try ProjectApprovalFixture.review(
            why: "Held for the mill.", whyAuthorName: "  "
        )
        #expect(blank.designerWhyAuthor == nil)
    }

    // MARK: - The attribution

    /// The web's shape, verbatim: an em dash, a space, the frozen name.
    @Test("the attribution is an em dash and the name, and nothing else")
    func theAttributionIsTheWebs() {
        #expect(ProjectApprovalCopy.whyAttribution("Leah") == "— Leah")
        #expect(ProjectApprovalCopy.whyAttribution("Leah Quist") == "— Leah Quist")
        #expect(!ProjectApprovalCopy.whyAttribution("Leah").contains("-"),
                "a hyphen is not the mark the web draws")
    }

    // MARK: - The screen

    /// The block draws both, under the question and above the edition line —
    /// the web's own order. A source pin because a SwiftUI body has no seam,
    /// and the identifiers are what the walk drives.
    @Test("the block draws the why under the question, and signs it")
    func theBlockDrawsTheWhy() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        #expect(source.contains("ApprovalWhyLine("))
        #expect(source.contains("review.designerWhy"))
        #expect(source.contains("review.designerWhyAuthor"))
        #expect(source.contains("decisionDetail.approval.why"))
        #expect(source.contains("decisionDetail.approval.whyAuthor"))
        #expect(source.contains("ProjectApprovalCopy.whyAttribution("))

        let question = try #require(source.range(of: "decisionDetail.approval.question"))
        let why = try #require(source.range(of: "ApprovalWhyLine("))
        let edition = try #require(source.range(of: "ProjectApprovalCopy.editionLine("))
        #expect(question.upperBound < why.lowerBound, "the why is drawn above the question it explains")
        #expect(why.upperBound < edition.lowerBound, "the edition line is drawn above the why")
    }
}

/// `IOSC-R2-07`. Which acts the screen offers, and to whom.
@MainActor
struct ApprovalViewerChairTests {

    /// The row is answerable and the reader is its frozen lead: everything is
    /// on offer.
    @Test("the lead is offered the doors and the hold")
    func theLeadIsOfferedTheActs() throws {
        let hers = try ProjectApprovalFixture.review(viewerRole: "lead")
        #expect(hers.viewerAnswers)
        #expect(hers.canRespond)

        let reading = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1, viewerRole: "lead"
        )
        #expect(reading.viewerAnswers)
        #expect(reading.needsReviewConfirmation)
    }

    /// A studio co-member reading her own client app sees the approval and is
    /// offered nothing on it: `respond_project_approval` and
    /// `confirm_project_decision_review` both accept the frozen lead alone.
    @Test("a studio co-member answers neither the doors nor the hold")
    func aCoMemberIsOfferedNothing() throws {
        let watched = try ProjectApprovalFixture.review(viewerRole: "studio")
        #expect(watched.canRespond, "the ROW is still answerable — by somebody else")
        #expect(!watched.viewerAnswers)

        let reading = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1, viewerRole: "studio"
        )
        #expect(reading.needsReviewConfirmation)
        #expect(!reading.viewerAnswers)
    }

    /// Default-INCLUDE: a projection written before the Wave-2 migration, or
    /// one naming a role this build does not know, still hands a homeowner
    /// her own doors. Losing them is the worse failure by far.
    @Test("an absent or unknown role keeps the acts on offer")
    func anUnknownRoleKeepsTheActs() throws {
        #expect(try ProjectApprovalFixture.review().viewerAnswers)
        #expect(try ProjectApprovalFixture.review(viewerRole: "something_new").viewerAnswers)
    }

    /// The three legs the block gates, and the sentence that introduces them.
    /// A source pin: the acts live in a SwiftUI body with no callable seam,
    /// and what this fix IS is a second condition on each of them.
    @Test("every act leg on the block asks who is reading")
    func everyActLegAsksWhoIsReading() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        for leg in [
            "if review.canRespond, review.viewerAnswers, !viewModel.hasAnsweredApproval {",
            "} else if review.needsReviewConfirmation, review.viewerAnswers {",
            "} else if review.reviewConfirmationUnavailable, review.viewerAnswers {",
            "if !viewModel.hasAnsweredApproval, review.canRespond, review.viewerAnswers {"
        ] {
            #expect(source.contains(leg), "an act leg is drawn without asking who is reading: \(leg)")
        }
    }
}
