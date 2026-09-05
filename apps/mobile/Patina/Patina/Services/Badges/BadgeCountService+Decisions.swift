//
//  BadgeCountService+Decisions.swift
//  Patina
//
//  `iosb-B1`. One decision feed out of two reads.
//
//  Split off `BadgeCountService.swift` because that file is at SwiftLint's
//  500-line `file_length`, the same reason the Stage-2 client and view-model
//  halves live beside their own files.
//

import Foundation

extension BadgeCountService {

    /// The rows every surface that says something is waiting reads.
    ///
    /// `listPending` is a PostgREST GET on `client_decisions`, and 00467:18-38
    /// rewrote both SELECT policies a homeowner can reach to
    /// `approval_contract IS DISTINCT FROM 'project_artifact_v1'` — so the read
    /// behind NEEDS YOU and the Studio's "Awaiting you" is the one read that
    /// can never return her own Stage-2 approvals. The projection is merged in
    /// beside it, as rows, so the eyebrow can carry the truth R5 says it does.
    ///
    /// Only the approvals still holding an act of hers become rows; the rest
    /// are waiting on the studio and are not hers to answer.
    ///
    /// `previous` is the feed as it stands, which is where a half that failed
    /// gets its rows from — a nil answer keeps that half's last-known rows
    /// rather than blanking a feed the other half answered for. Both failing
    /// is the only nil out, which is what leaves the whole floor standing.
    /// Static so it can be exercised without the singleton this service is
    /// only ever reached through.
    static func mergedDecisions(
        pending: [RemoteClientDecision]?,
        approvals: [RemoteProjectApprovalReview]?,
        previous: [RemoteClientDecision]
    ) -> [RemoteClientDecision]? {
        guard pending != nil || approvals != nil else { return nil }
        let legacy = pending ?? previous.filter { !$0.isProjectArtifactApproval }
        let stage2 = approvals?.filter(\.awaitsClient).map(\.asWaitingDecision)
            ?? previous.filter(\.isProjectArtifactApproval)
        // 00467 hides a Stage-2 row from the homeowner, not from a studio
        // co-member — for whom BOTH reads return it, and a feed carrying one
        // obligation twice draws it twice under one id.
        let carried = Set(legacy.map(\.id))
        return legacy + stage2.filter { !carried.contains($0.id) }
    }
}
