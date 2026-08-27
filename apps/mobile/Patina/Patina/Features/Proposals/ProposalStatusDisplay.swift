//
//  ProposalStatusDisplay.swift
//  Patina
//
//  SP-04: the proposals list printed "SIGNED (1)" over a $100,000 proposal
//  whose status is `accepted` and which carries no signature record — the app
//  telling a client she signed a document she did not sign. `accepted` and
//  `signed` are separate states in the status vocabulary
//  (00063_proposal_system_v2.sql:45-46); the app now keeps them separate too.
//
//  A pure seam so the section title and the row label cannot drift apart.
//

import Foundation

enum ProposalStatusDisplay {

    /// The section that holds `accepted` proposals. Named for the status the
    /// server actually set.
    static let acceptedSectionTitle = "Accepted"

    /// Row label. "Signed" is reserved for a proposal that carries a signature
    /// record; an accepted proposal without one reads "Accepted".
    static func rowLabel(_ proposal: RemoteProposal) -> String {
        switch proposal.status {
        case "sent": return "Awaiting your review"
        case "viewed": return "In review"
        case "accepted": return proposal.hasSignatureRecord ? "Signed" : acceptedSectionTitle
        case "declined": return "Declined"
        case "expired": return "Expired"
        default: return proposal.status?.capitalized ?? "Proposal"
        }
    }

    /// The detail header's resolved line. `justSigned` is the client's own
    /// signature landing in this session — the server has flipped the row but
    /// the local copy predates it.
    static func detailStatusLine(_ proposal: RemoteProposal, justSigned: Bool) -> String {
        if proposal.hasSignatureRecord {
            let who = proposal.signed_by_name ?? "you"
            if let signedAt = proposal.signed_at {
                return "Signed by \(who) on \(DateDisplay.fromTimestamp(signedAt))"
            }
            return "Signed by \(who)"
        }
        if justSigned { return "Signed by you" }
        if let acceptedAt = proposal.accepted_at {
            return "Accepted on \(DateDisplay.fromTimestamp(acceptedAt))"
        }
        return acceptedSectionTitle
    }
}
