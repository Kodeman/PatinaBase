//
//  DesignerThreadOpener.swift
//  Patina
//
//  SP-13 / SP-08 — one implementation of "Message your designer".
//
//  W1a put this compose path on the thread list's empty state. SP-08's bell
//  empty state offers the same act at engaged/activeProject, and two copies of
//  the same RPC choice would drift. Both RPCs are idempotent, so a repeated
//  call returns the existing thread rather than making a second one.
//

import Foundation

enum DesignerThreadOpener {

    /// The live designer relationship, resolved from the same services the
    /// Companion and the Studio read.
    ///
    /// Those services are process-lifetime singletons; `SessionScope` is what
    /// keeps them from answering for the account before this one.
    @MainActor
    static var currentRelationship: DesignerRelationship {
        let badges = BadgeCountService.shared
        return DesignerRelationshipResolver.resolve(
            lead: DesignRequestStatusService.shared.liveLead,
            projects: badges.projects,
            roster: badges.roster,
            record: admittedRecord(),
            decisions: badges.pendingDecisions,
            proposals: badges.pendingProposals,
            invoices: badges.payableInvoices
        )
    }

    /// The record Today last drew, and only if it belongs to whoever is signed
    /// in now — the same judgement `RecordRefresh` makes, made read-only here
    /// (`RecordIdentity.admits` deletes on a mismatch, and this is not the path
    /// that should be deciding to delete anything).
    ///
    /// Read from disk on each ask rather than held: the file is a handful of
    /// rows, the readers are screen-level (`ProductDetailView`, the thread list
    /// and the bell), and a cache here would be one more thing that survives an
    /// account change — which is the bug this lane exists to close.
    @MainActor
    private static func admittedRecord() -> HouseRecord? {
        let decision = RecordIdentity.decide(
            stampedOwner: RecordOwnerStamp.shared.ownerId,
            session: AuthService.shared.currentUserId
        )
        guard decision == .paint else { return nil }
        return RecordSnapshotStore.shared.load()
    }

    /// A project thread where there is a project, a direct thread where the
    /// client is matched but has none yet. Returns `nil` for a relationship
    /// that cannot own a thread (`.none`, `.roster`).
    @MainActor
    static func openThread(with relationship: DesignerRelationship) async throws -> String? {
        switch relationship {
        case let .project(projectId, _, _):
            return try await MessagingAPIClient.shared.createThread(projectId: projectId.uuidString)
        case let .lead(_, designerId, _):
            return try await MessagingAPIClient.shared.createDirectThread(counterpart: designerId)
        case .none, .roster:
            return nil
        }
    }
}
