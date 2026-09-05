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
import PatinaDesignKit

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

    /// `P-17`. The mark beside that line, in the eleven-state stamp grammar
    /// — replacing the green `checkmark.seal.fill` / `checkmark.circle` pair
    /// and the two filled `PatinaStatusBadge`s beneath them. Pure, so the
    /// mark and the words it sits beside cannot drift apart.
    ///
    /// `nil` is a real answer and the important one: an `accepted` proposal
    /// with no signature record is a designer-side accept, and SP-04 is the
    /// whole reason this file exists — the app may not stamp SIGNED, or SIGNED
    /// ON PAPER, over a signature nobody can produce. The word "Accepted"
    /// stands alone, unmarked, which is exactly what it is.
    ///
    /// The branch order is `ProposalDetailView.statusRow`'s own, so the mark
    /// cannot appear in a branch the view does not draw.
    static func stampState(
        for proposal: RemoteProposal, justSigned: Bool
    ) -> PatinaStamp.State? {
        if proposal.hasSignatureRecord || justSigned { return .signed }
        if proposal.isSigned { return nil }
        if proposal.status == "declined" { return .declined }
        if proposal.status == "expired" || !proposal.isSignable { return .expired }
        return nil
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
        // No "Accepted on <date>" branch: neither client RPC emits
        // `accepted_at` (`list_client_proposals` 00422:2304-2334,
        // `get_client_proposal_bundle` 00407:341-372), so it was a line the
        // server could never reach and only a hand-made fixture could prove.
        return acceptedSectionTitle
    }
}
