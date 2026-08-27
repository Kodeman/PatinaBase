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
    @MainActor
    static var currentRelationship: DesignerRelationship {
        DesignerRelationshipResolver.resolve(
            lead: DesignRequestStatusService.shared.liveLead,
            projects: BadgeCountService.shared.projects,
            roster: BadgeCountService.shared.roster
        )
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
