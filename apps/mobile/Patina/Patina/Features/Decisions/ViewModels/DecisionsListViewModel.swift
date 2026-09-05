//
//  DecisionsListViewModel.swift
//  Patina
//
//  The decision list — every ask waiting on this client, from the two reads
//  that between them return them all.
//
//  Split off `DecisionsViewModel.swift` because that file is at SwiftLint's
//  500-line `file_length`, the same reason the Stage-2 client and view-model
//  halves live beside their own files.
//

import SwiftUI

@Observable
@MainActor
final class DecisionsListViewModel {
    var decisions: [RemoteClientDecision] = []
    var isLoading: Bool = false
    var error: String?

    /// The list every decision reaches the client through — and, since
    /// `iosb-B1`, the Stage-2 approvals too.
    ///
    /// Two reads, because there is no one read that returns both: 00467:18-38
    /// hides a `project_artifact_v1` row from the very person being asked, so
    /// `listPending` returns everything EXCEPT her approvals and the projection
    /// returns only those. A failed projection leaves the ordinary decisions
    /// standing; it does not empty the list.
    func load() async {
        isLoading = true
        error = nil
        async let approvalsFetch = try? DecisionsAPIClient.shared
            .fetchProjectApprovalReviews()
        do {
            let pending = try await DecisionsAPIClient.shared.listPending()
            let approvals = await approvalsFetch ?? []
            // A studio co-member is the one caller both reads answer for, and
            // one obligation must not draw twice under one id.
            let carried = Set(pending.map(\.id))
            // `W1R2-M3`: published only — an unsent draft is the studio's
            // working copy, not an ask. `W1R2-M2`: the projects the rail has
            // already fetched are what put the designer's name on the row.
            let projects = BadgeCountService.shared.projects
            self.decisions = pending
                + approvals.filter(\.awaitsClientInFeed)
                    .map { $0.asWaitingDecision(from: projects) }
                    .filter { !carried.contains($0.id) }
        } catch {
            self.error = "Couldn’t load decisions"
            #if DEBUG
            PatinaLog.ui.error("[Decisions] list failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }
}
