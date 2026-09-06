//
//  RecordOfDecisionTests.swift
//  PatinaTests
//
//  `P-26`. The copy she keeps.
//
//  Two refusals are the whole point of this suite and both are pinned by
//  walking `printedLines`, which is everything the sheet draws: the IP address
//  never reaches the paper, and the consent method is a sentence rather than
//  the column value it came from.
//

import Foundation
import PatinaDesignKit
import Testing
import UIKit
@testable import Patina

@MainActor
struct RecordOfDecisionTests {

    // MARK: - The consent, as a sentence

    @Test("every consent method the column admits is written as a sentence")
    func theConsentIsASentence() {
        let signature = RecordOfDecisionCopy.consentSentence(method: "electronic_signature")
        let clickThrough = RecordOfDecisionCopy.consentSentence(method: "click_through")
        let paper = RecordOfDecisionCopy.consentSentence(method: "paper")

        #expect(signature == "Signed by typing your full legal name.")
        #expect(clickThrough == "Confirmed in Patina, without a typed signature.")
        #expect(paper == "Signed on paper, and recorded here by your studio.")

        for line in [signature, clickThrough, paper].compactMap({ $0 }) {
            #expect(line.hasSuffix("."), "\(line) is not a sentence")
            #expect(!line.contains("_"), "\(line) still carries the raw column value")
        }
    }

    /// The review leg's own spelling has turned up in this column on older
    /// rows; it is the same act and gets the same sentence.
    @Test("the review leg's spelling of click-through reads the same")
    func theOlderSpellingIsUnderstood() {
        #expect(
            RecordOfDecisionCopy.consentSentence(method: "portal_clickthrough")
                == RecordOfDecisionCopy.consentSentence(method: "click_through")
        )
        #expect(RecordOfDecisionCopy.consentSentence(method: " Click_Through ")
                == RecordOfDecisionCopy.consentSentence(method: "click_through"))
    }

    /// A keepsake that guesses at how a signature was given is worse than one
    /// that is quiet about it.
    @Test("a consent method this build does not know draws no line")
    func anUnknownConsentDrawsNothing() {
        #expect(RecordOfDecisionCopy.consentSentence(method: nil) == nil)
        #expect(RecordOfDecisionCopy.consentSentence(method: "") == nil)
        #expect(RecordOfDecisionCopy.consentSentence(method: "biometric") == nil)
    }

    // MARK: - The reference

    @Test("the reference is twelve characters of the hash, and no more")
    func theReferenceIsTwelveCharacters() throws {
        let checksum = try #require(
            RecordOfDecisionCopy.checksum(String(repeating: "a", count: 64))
        )
        #expect(checksum.count == 12)
        #expect(RecordOfDecisionCopy.checksumLength == 12)
        #expect(RecordOfDecisionCopy.checksum(nil) == nil)
        #expect(RecordOfDecisionCopy.checksum("   ") == nil)
    }

    // MARK: - A settled approval

    @Test("the record of an approval names the edition, the mark and the act")
    func theApprovalRecordCarriesTheFacts() throws {
        let review = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-09-05T14:00:00+00:00"
        )

        let record = RecordOfDecision.approval(
            review: review,
            outcome: .approved,
            studio: "Hartwell Studio",
            signedName: "Margaret Whitfield",
            consentMethod: RecordOfDecisionCopy.electronicSignature
        )

        #expect(record.studio == "Hartwell Studio")
        #expect(record.title == "Kitchen millwork spec")
        #expect(record.editionLine == "Edition 3")
        #expect(record.stamp == .approved)
        #expect(record.outcomeSentence == "You approved the spec book.")
        #expect(record.signedName == "Margaret Whitfield")
        #expect(record.recordedOn != nil)
        #expect(record.consentSentence == "Signed by typing your full legal name.")
        #expect(record.checksum == String(repeating: "a", count: 12))
    }

    @Test("a returned approval takes the returned mark and the returned sentence")
    func aReturnedApprovalIsRecordedAsReturned() throws {
        let review = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded", outcome: "changes_requested"
        )

        let record = RecordOfDecision.approval(
            review: review,
            outcome: .changesRequested,
            studio: nil,
            signedName: nil,
            consentMethod: RecordOfDecisionCopy.clickThrough
        )

        #expect(record.stamp == .returned)
        #expect(record.outcomeSentence == "You returned the spec book for revision.")
        #expect(record.studio == nil)
        #expect(record.signedName == nil)
        #expect(record.consentSentence == "Confirmed in Patina, without a typed signature.")
    }

    /// The visit she answers on carries both the name and the method; a later
    /// visit reads a projection that carries neither, and the record prints
    /// what it has rather than reconstructing the act from the outcome.
    @Test("this session's answer is witnessed; a later visit is not")
    func onlyThisSessionsAnswerCarriesANameAndAConsent() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded", outcome: "approved"
        )

        // A later visit: the projection carries the outcome and nothing else.
        let revisited = try #require(viewModel.approvalRecord(studio: "Hartwell Studio"))
        #expect(revisited.stamp == .approved)
        #expect(revisited.signedName == nil)
        #expect(revisited.consentSentence == nil)

        // The visit she answered on.
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.answeredOutcome = .approved
        let witnessed = try #require(viewModel.approvalRecord(studio: "Hartwell Studio"))
        #expect(witnessed.signedName == "Margaret Whitfield")
        #expect(witnessed.consentSentence == "Signed by typing your full legal name.")
        #expect(witnessed.recordedOn != nil)
    }

    /// Ruled 2026-09-05: only Approve is signed. A Hold answered in this
    /// session names the click-through it actually sent, and no name.
    @Test("a held approval records the click-through it sent, with no name")
    func aHeldApprovalIsNotSigned() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.typedSignature = "Margaret Whitfield"
        viewModel.answeredOutcome = .needsDiscussion

        let record = try #require(viewModel.approvalRecord(studio: nil))

        #expect(record.stamp == .held)
        #expect(record.signedName == nil)
        #expect(record.consentSentence == "Confirmed in Patina, without a typed signature.")
    }

    @Test("an approval nobody has answered has no record to keep")
    func anOpenApprovalHasNoRecord() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()

        #expect(viewModel.approvalRecord(studio: nil) == nil)
    }

    // MARK: - A signed proposal

    @Test("the record of a signed proposal names it, its edition and its mark")
    func theProposalRecordCarriesTheFacts() throws {
        let proposal = try JSONDecoder().decode(RemoteProposal.self, from: Data("""
        { "id": "p-1", "title": "Van Hise — furnishings", "status": "accepted",
          "version": 2, "sent_at": "2026-09-01T00:00:00+00:00",
          "signed_at": "2026-09-04T00:00:00+00:00",
          "signed_by_name": "Margaret Whitfield" }
        """.utf8))

        let record = RecordOfDecision.proposal(
            proposal, studio: "Hartwell Studio", signedName: nil
        )

        #expect(record.title == "Van Hise — furnishings")
        #expect(record.stamp == .signed)
        #expect(record.outcomeSentence == "You signed this proposal.")
        #expect(record.signedName == "Margaret Whitfield")
        #expect(record.editionLine?.contains("Edition 2") == true)
        #expect(record.consentSentence == "Signed by typing your full legal name.")
        // A proposal carries no artifact hash, so there is no reference line
        // to print and none is invented.
        #expect(record.checksum == nil)
    }

    // MARK: - The two refusals

    @Test("nothing on the paper is an address, and nothing is a raw column value")
    func theKeepsakeCarriesNoAddressAndNoEnum() throws {
        let review = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-09-05T14:00:00+00:00"
        )
        let record = RecordOfDecision.approval(
            review: review,
            outcome: .approved,
            studio: "Hartwell Studio",
            signedName: "Margaret Whitfield",
            consentMethod: RecordOfDecisionCopy.electronicSignature
        )

        let dotted = try NSRegularExpression(pattern: #"\b\d{1,3}(\.\d{1,3}){3}\b"#)
        for line in record.printedLines {
            let range = NSRange(line.startIndex..., in: line)
            #expect(dotted.firstMatch(in: line, range: range) == nil,
                    "an address reached the keepsake: \(line)")
            for raw in [RecordOfDecisionCopy.electronicSignature,
                        RecordOfDecisionCopy.clickThrough] {
                #expect(!line.contains(raw), "a raw column value reached the keepsake: \(line)")
            }
        }
        // And the sheet draws these lines and nothing else.
        let sheet = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Shared/Views/RecordSheet.swift")
        )
        #expect(!sheet.lowercased().contains("ip_address"))
        #expect(!sheet.lowercased().contains("ipaddress"))
    }

    // MARK: - Where the act is offered

    @Test("the mark on the printed record is drawn square to the page")
    func theStampOnThePaperIsUpright() throws {
        let sheet = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Shared/Views/RecordSheet.swift")
        )
        #expect(sheet.contains("PatinaStamp(state: record.stamp, isUpright: true)"))
        // A tilted mark on a laser printer reads as a misfeed.
        #expect(PatinaStamp(state: .approved, isUpright: true).drawnRotationDegrees == 0)
        #expect(PatinaStamp(state: .approved).drawnRotationDegrees == PatinaStamp.rotationDegrees)
    }

    /// `W3R1-B1`. The suite walked `printedLines` and never the renderer, so
    /// "Keep a copy" could be absent from every settled record in the shipped
    /// build with the whole suite green. This calls the renderer.
    @Test("the sheet renders to a real image")
    func theKeepsakeRenders() throws {
        let review = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-09-05T14:00:00+00:00"
        )
        let record = RecordOfDecision.approval(
            review: review,
            outcome: .approved,
            studio: "Hartwell Studio",
            signedName: "Margaret Whitfield",
            consentMethod: RecordOfDecisionCopy.electronicSignature
        )

        let image = try #require(
            RecordKeepsake.image(record),
            "the keepsake did not render, so there is nothing to hand the share sheet"
        )
        #expect(image.size.width > 0)
        #expect(image.size.height > 0)
        // Drawn at print scale rather than at the phone's.
        #expect(image.scale == RecordSheet.renderScale)
    }

    /// `W3R1-B1`. The render must hang off a view that exists whether or not
    /// the image does. It used to hang off a `Group` that was an `EmptyView`
    /// until the image arrived — and an `EmptyView` runs no `.task`, so the
    /// image was never made and the act was never drawn.
    @Test("the render is anchored to a view that always exists")
    func theRenderIsNotGatedOnItsOwnResult() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Shared/Views/RecordSheet.swift")
        )
        let anchor = try #require(code.range(of: "private var renderAnchor"))
        let task = try #require(code.range(of: ".task {"))
        #expect(anchor.lowerBound < task.lowerBound,
                "the render is attached to something other than the anchor")
        #expect(code.contains("Color.clear"),
                "the anchor is not drawn, so the render still depends on the act")
    }

    @Test("the act is offered at the seal and on both settled screens")
    func theActIsOfferedWhereTheRulingPutsIt() throws {
        for file in ["Patina/Features/Shared/Views/SealMomentView.swift",
                     "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift",
                     "Patina/Features/Proposals/Views/ProposalDetailView.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            #expect(code.contains("KeepACopyAct("),
                    "\((file as NSString).lastPathComponent) offers no copy to keep")
        }
        #expect(RecordOfDecisionCopy.keepACopy == "Keep a copy")
    }
}
