//
//  ProposalSignActCopy.swift
//  Patina
//
//  `P-19`. Every word on the sign act and the seal that follows it, in one
//  place so it is a fact a test can hold.
//
//  The restated terms themselves are NOT here: they are `ProposalSignTerms`,
//  whose contract — "Nothing here is invented. Every line is a value the RPC
//  sent or it is absent" — is kept verbatim and untouched by this proposal.
//

import Foundation
import SwiftUI

enum ProposalSignActCopy {

    static let eyebrow = "SIGN"

    /// `SIGNATURE_NOTICE` in the portals (`consent-copy.ts`), verbatim.
    static let signatureNotice = "Your typed name acts as your electronic signature."
    static let signatureLabel = "YOUR NAME"
    static let signaturePlaceholder = "Type your full name"

    /// The portals' consent line for a proposal that is not one of the three
    /// named commercial kinds — `consentLineFor`'s own fallback branch
    /// (`consent-copy.ts`), verbatim. A `proposals` row carries no
    /// `CommercialDocumentKind`, so this is the branch it lands in and the
    /// only one it may claim.
    static let consentLine = "I agree to the scope and investment in this proposal."

    static let signAction = "Sign proposal"
    static let cancel = "Not yet"

    /// `_respond_project_approval_checked`'s floor is the house's everywhere:
    /// `sign_proposal` and the portal route both refuse under two characters
    /// (`ProposalsAPIClient.signProposal`, `invalid_name`).
    static let signatureFloor = 2

    // MARK: - The edition line

    /// The edition, above the restated terms.
    ///
    /// `get_client_proposal_bundle` (00407:366) returns `version` and
    /// `sent_at`; both are used, and neither is invented. A bundle with no
    /// version says only when the paper was issued, and one with neither says
    /// nothing at all rather than guessing at a first edition.
    static func edition(version: Int?, issuedAt: String?) -> String? {
        let issued = issuedAt.map { "Issued \(DateDisplay.fromTimestamp($0))" }
        guard let version else { return issued }
        let edition = "Edition \(version)"
        guard let issued else { return edition }
        return "\(edition) · \(issued)"
    }

    // MARK: - The seal

    static let sealHeading = "Signed"
    static let done = "Done"

    /// What happens next, and nothing else. No timing is invented: the studio
    /// is named where the app already holds a name for it, and named as "your
    /// studio" where it does not.
    ///
    /// RULED 2026-09-05: "countersigns" is gone. A `proposals` row records no
    /// studio counter-signature and nothing in the app waits on one, so the
    /// sentence asserted a second act that may never happen. What IS true the
    /// moment the RPC returns is that the studio has her name, and that a copy
    /// is hers.
    ///
    /// `W2R1-m2`: the fallback is a STUDIO, never a person. The ruled sentence
    /// is "{Studio} has your signature." and the walk read "Leah Hartwell has
    /// your signature." — truthful, and not the sentence: a signature is held
    /// by the practice she is engaging, not by the individual who asked for
    /// it. Where the app holds no studio name it says so in the general
    /// ("Your studio") rather than substituting the nearest person.
    static func whatHappensNext(studio: String?) -> String {
        let who = studio.flatMap { $0.isEmpty ? nil : $0 } ?? "Your studio"
        return "\(who) has your signature. You’ll have a copy."
    }

    // MARK: - The settle

    /// One settle, 420 ms, and then the mark stops moving forever.
    static let settleDuration: Double = 0.42
    static let settleFromScale: CGFloat = 1.06
    static let settleFromRotation: Double = -3.4
}
