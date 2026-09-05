//
//  BadgeCountPersistedCounts.swift
//  Patina
//
//  The shape of the offline floor `BadgeCountService` writes and restores.
//
//  It lives beside its service rather than inside it because merging Wave 1's
//  two iOS lanes took `BadgeCountService.swift` to 504 lines, four past
//  SwiftLint's 500-line `file_length` — the same split, and the same reason,
//  as `BadgeCountService+Decisions.swift`. Still nested on the service, so
//  every reference in that file reads exactly as it did.
//

import Foundation

extension BadgeCountService {

    /// R-02: what the last successful refresh knew, kept across launches.
    ///
    /// Without it a cold launch on a dead network does not degrade, it
    /// DELETES: the counts start at zero, the pill loses its number and the
    /// bell tells VoiceOver "No unread notifications" — all of it asserted,
    /// none of it fetched.
    struct PersistedCounts: Codable {
        let pendingDecisionCount: Int
        let unreadMessageCount: Int
        let proposalsAwaitingSignatureCount: Int
        let payableInvoiceCount: Int
        let projectCount: Int
        /// R-02, second half. The counts alone restore the numbers and lose the
        /// SEAT: `DesignerSeat.make` reads these rows, not `projectCount`, so
        /// an offline cold launch drew a house with no designer in it — the
        /// walk's shots 36/37. Decoded as `[]` on a payload written before this
        /// field existed, which is the same floor the counts already have.
        /// Optional so a payload written before this field existed still
        /// decodes — an absent key is `nil`, not a decode failure that would
        /// throw the whole floor away.
        let projects: [RemoteProject]?
        /// `R-02`, the seat's PROJECT. `projects` alone brings the seat back
        /// but not the one it named: `DesignerSeat.activeProject` resolves the
        /// urgent NEEDS YOU row against these three collections — the only
        /// place a row's `project_id` survives — and with them empty it falls
        /// through to `active.first`, so a cold offline Today seated Leah on
        /// the most-recently-updated project instead of the one the Record is
        /// about. Restored for the same reason `projects` is, and under the
        /// same contract: a floor to draw, never a claim that a fetch
        /// answered. Optional for the same forward-compatibility reason.
        let pendingDecisions: [RemoteClientDecision]?
        let pendingProposals: [RemoteProposal]?
        let payableInvoices: [RemoteInvoice]?
        let storedAt: Date
    }
}
