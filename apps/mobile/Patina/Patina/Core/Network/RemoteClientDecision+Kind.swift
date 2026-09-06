//
//  RemoteClientDecision+Kind.swift
//  Patina
//
//  `W2R1-n4`. What a waiting row calls itself: the kind chip beside it, and
//  the name it takes when the studio gave it none.
//
//  Split out of `DecisionsAPIClient.swift`, which sits at SwiftLint's 500-line
//  `file_length` warning; the row's decode and its RPCs stay there.
//

import Foundation

extension RemoteClientDecision {

    /// `W2R1-n4`. The chip on a waiting row, which the legacy rows have drawn
    /// from `decision_type` since the beginning and the Stage-2 ones drew not
    /// at all: 00467's projection carries no `decision_type`, so
    /// `asWaitingDecision` synthesizes the row with a nil one and the card
    /// beside three chipped ones read as a different kind of thing.
    ///
    /// "Approval" is the ask (Vocabulary), which is also the eyebrow the
    /// detail screen puts over it — so the row and the screen it opens say one
    /// word for one thing.
    var kindChipLabel: String? {
        if isProjectArtifactApproval || isClientSignoff { return "Approval" }
        guard let decision_type, !decision_type.isEmpty else { return nil }
        return decision_type.capitalized
    }

    /// `W2R1-n4`'s other half: what a row with no title of its own is called.
    /// "Decision" is the narrower word and it was printed over approvals too;
    /// the Studio hub's own untitled rows already split the two
    /// (`StudioQueueBuilder.untitledApprovalTitle`).
    var untitledRowTitle: String {
        isProjectArtifactApproval || isClientSignoff ? "An approval" : "A choice"
    }
}
