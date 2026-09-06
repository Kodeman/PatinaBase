//
//  RecordOfDecision.swift
//  Patina
//
//  `P-26`. The keepsake: what a homeowner leaves the ceremony holding.
//
//  It is a RECORD, not a receipt — the paper she can put in a folder, mail to
//  a partner, or find again in two years when the kitchen is being repainted.
//  So the facts on it are the ones that stay true: the studio, the thing, the
//  edition, the mark, her name, the day, how she consented, and the twelve
//  characters that identify the exact edition she agreed to.
//
//  Two rules the sheet cannot break:
//
//   • **Never the IP address.** `client_decisions` records one; a keepsake is
//     not a compliance artifact and printing a homeowner's network address on
//     the paper she shares with her family is a surveillance record wearing a
//     certificate's clothes. `printedLines` is the whole of what is drawn, and
//     `RecordOfDecisionTests` walks it.
//   • **Never the raw enum.** `electronic_signature` is a column value. What
//     goes on the paper is a sentence.
//
//  Everything is optional except the title and the mark, and an absent fact
//  draws NOTHING rather than a guess: the projection a settled approval is
//  read back through carries no signature name, so a return visit prints the
//  outcome, the edition, the day and the reference — every one of them true —
//  and no name at all.
//

import Foundation
import PatinaDesignKit

struct RecordOfDecision: Equatable, Sendable {

    /// The studio whose paper this is. Nil where the app holds no studio
    /// name — never a person's name standing in for one (`W2R1-m2`).
    let studio: String?
    /// What was decided about.
    let title: String
    /// "Edition 3", or "Edition 3 · Issued Sep 4". Nil where neither is known.
    let editionLine: String?
    /// The mark, drawn upright: a tilted stamp on a printed page reads as a
    /// misfeed, which is the source's own note on this sheet.
    let stamp: PatinaStamp.State
    /// The act, in one sentence.
    let outcomeSentence: String
    /// The name she typed, where the app holds it.
    let signedName: String?
    /// The day the answer was recorded, long form.
    let recordedOn: String?
    /// How she consented, as a sentence.
    let consentSentence: String?
    /// Twelve characters of the artifact's hash — provenance, not a
    /// compliance string (`R6`). Nil where the paper carries no hash, which
    /// is every proposal.
    let checksum: String?

    /// Everything the sheet prints, in order. The view draws exactly these,
    /// and the test that proves no address reaches the paper walks them.
    var printedLines: [String] {
        [
            RecordOfDecisionCopy.masthead,
            studio,
            title,
            editionLine,
            stamp.word,
            outcomeSentence,
            signedName,
            recordedOn,
            consentSentence,
            checksum
        ].compactMap { $0 }
    }
}

// MARK: - Where a record comes from

extension RecordOfDecision {

    /// A settled Stage-2 approval.
    ///
    /// `consentMethod` and `signedName` are what the app HOLDS, which on the
    /// visit where she answered is everything and on a later visit is
    /// nothing: 00467's projection carries the outcome and the day, not the
    /// name she typed or the column her consent was written to. Neither is
    /// derived from the outcome — inferring "she must have signed" from
    /// APPROVED would print a legal claim the app did not witness.
    /// `recordedAt` is the day the answer landed where the app witnessed it
    /// and the projection has not been refetched to say so — the visit she
    /// answers on. The projection's own `respondedAt` wins wherever it exists.
    static func approval(
        review: RemoteProjectApprovalReview,
        outcome: ProjectApprovalOutcome,
        studio: String?,
        signedName: String?,
        consentMethod: String?,
        recordedAt: Date? = nil
    ) -> RecordOfDecision {
        RecordOfDecision(
            studio: studio,
            title: review.artifactTitle,
            editionLine: ProjectApprovalCopy.editionLine(
                edition: review.artifactVersion, due: nil
            ),
            stamp: ProjectApprovalCopy.stamp(for: outcome),
            outcomeSentence: ProjectApprovalCopy.recorded(
                outcome,
                thing: ProjectApprovalCopy.artifactNoun(kind: review.artifactKind)
                    ?? ProjectApprovalCopy.unnamedEdition
            ),
            signedName: RecordOfDecisionCopy.name(signedName),
            recordedOn: (review.respondedAt.flatMap(ISO8601DateParsing.date(from:))
                ?? recordedAt).map(DateDisplay.long),
            consentSentence: RecordOfDecisionCopy.consentSentence(method: consentMethod),
            checksum: RecordOfDecisionCopy.checksum(review.artifactChecksum)
        )
    }

    /// A signed proposal.
    ///
    /// `sign_proposal` takes a typed full name and nothing else, so the
    /// consent is the typed signature on every one of these — not a guess: it
    /// is the only act the RPC has. A proposal carries no artifact hash, so
    /// the reference line is absent rather than invented.
    static func proposal(
        _ proposal: RemoteProposal,
        studio: String?,
        signedName: String?,
        signedAt: Date? = nil
    ) -> RecordOfDecision {
        RecordOfDecision(
            studio: studio,
            title: proposal.title ?? RecordOfDecisionCopy.unnamedProposal,
            editionLine: ProposalSignActCopy.edition(
                version: proposal.version, issuedAt: proposal.sent_at
            ),
            stamp: .signed,
            outcomeSentence: RecordOfDecisionCopy.signedProposalSentence,
            signedName: RecordOfDecisionCopy.name(signedName ?? proposal.signed_by_name),
            recordedOn: (proposal.signed_at.flatMap(ISO8601DateParsing.date(from:))
                ?? signedAt).map(DateDisplay.long),
            consentSentence: RecordOfDecisionCopy.consentSentence(
                method: RecordOfDecisionCopy.electronicSignature
            ),
            checksum: nil
        )
    }
}

// MARK: - Every word on the paper

enum RecordOfDecisionCopy {

    static let masthead = "RECORD OF DECISION"
    static let keepACopy = "Keep a copy"
    static let signatureLabel = "SIGNED"
    static let referenceLabel = "REFERENCE"

    /// The act on a signed proposal. The stamp above it already says SIGNED;
    /// this says what was signed away.
    static let signedProposalSentence = "You signed this proposal."

    static let unnamedProposal = "This proposal"

    /// `R6`: twelve characters, on the printed record and nowhere else. The
    /// on-screen plate carries none (ruled at the Wave 2 walks).
    static let checksumLength = 12

    static func checksum(_ raw: String?) -> String? {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(checksumLength))
    }

    static func name(_ raw: String?) -> String? {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: - The consent, as a sentence

    /// `client_decisions.client_consent_method`'s three values (00117), plus
    /// the review leg's own spelling, which is a different column but has
    /// turned up in this one on older rows.
    static let electronicSignature = "electronic_signature"
    static let clickThrough = "click_through"
    static let paper = "paper"

    /// How she agreed, said rather than coded. A method this build does not
    /// know draws no line at all — a keepsake that guesses at how a signature
    /// was given is worse than one that is quiet about it.
    static func consentSentence(method: String?) -> String? {
        let key = method?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        switch key {
        case electronicSignature:
            return "Signed by typing your full legal name."
        case clickThrough, "portal_clickthrough", "clickthrough":
            return "Confirmed in Patina, without a typed signature."
        case paper:
            return "Signed on paper, and recorded here by your studio."
        default:
            return nil
        }
    }
}
