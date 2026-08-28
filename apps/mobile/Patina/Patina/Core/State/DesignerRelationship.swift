//
//  DesignerRelationship.swift
//  Patina
//
//  The one answer to "does this client have a designer, and which one?"
//
//  Two consumers, and they want different halves of it:
//    • `isLive` is R3's pre-emption predicate — an accepted/claimed lead or an
//      active project. Where it is true the piece's primary act is "Ask her to
//      source this" and Buy does not draw.
//    • `designerId` is the attribution key — it credits a direct order even
//      where the relationship is only a roster row, which is NOT live.
//  Keeping both on one type is deliberate: a single `hasDesigner` bool would
//  have to answer both questions and would get one of them wrong.
//

import Foundation

enum DesignerRelationship: Equatable, Sendable {
    case none
    /// On the designer's client roster (`designer_clients`) with no live lead
    /// or project. Credits attribution; does not pre-empt Buy.
    case roster(designerId: UUID)
    /// A lead a designer has claimed or accepted.
    case lead(leadId: UUID, designerId: UUID, studioName: String?)
    /// An active project.
    case project(projectId: UUID, designerId: UUID, studioName: String?)

    /// R3: "a live designer relationship (accepted lead or active project)".
    var isLive: Bool {
        switch self {
        case .none, .roster: return false
        case .lead, .project: return true
        }
    }

    var designerId: UUID? {
        switch self {
        case .none: return nil
        case .roster(let designerId): return designerId
        case .lead(_, let designerId, _): return designerId
        case .project(_, let designerId, _): return designerId
        }
    }

    var studioName: String? {
        switch self {
        case .none, .roster: return nil
        case .lead(_, _, let studioName): return studioName
        case .project(_, _, let studioName): return studioName
        }
    }
}

/// One row of the client's designer roster.
struct RosterDesigner: Equatable, Sendable {
    let designerId: UUID
    let addedAt: Date
}

enum DesignerRelationshipResolver {

    /// Precedence: an active project beats a claimed lead beats the roster.
    ///
    /// The roster tie rule is an attribution decision, not a display one: two
    /// designers added on the same calendar day give no honest basis for
    /// crediting one over the other, so the answer is `.none` and the order
    /// carries no designer rather than the wrong one. A later wave can replace
    /// this with an explicit "who is on this job" choice.
    /// `lead` is the client's live lead (`DesignRequestStatusService.liveLead`),
    /// NOT `promotedRequest`. The promoted one is a display value —
    /// `isVisibleForPromotion` still makes it nil for a card the client
    /// dismissed at its current stage, and for a request that has already
    /// resolved — so reading it here would resolve `.none` and `isLive ==
    /// false` for a client who has a designer, and would draw Buy in W5 for
    /// exactly the clients R3 pre-empts. (W4 removed the other half of that
    /// hazard: a match no longer ages out of promotion at 14 days.)
    static func resolve(
        lead: DesignRequestStatus?,
        projects: [RemoteProject],
        roster: [RosterDesigner]
    ) -> DesignerRelationship {
        if let active = activeProject(in: projects),
           let designerId = active.designer_id.flatMap(UUID.init(uuidString:)),
           let projectId = UUID(uuidString: active.id) {
            // `RemoteProject` carries `studio_id` but no studio name — the
            // brand is resolved asynchronously by `StudioIdentityService`, so
            // a project relationship carries none rather than the project name.
            return .project(projectId: projectId, designerId: designerId, studioName: nil)
        }

        if let lead,
           !lead.stage.isTerminal,
           let designerId = lead.designerId {
            return .lead(
                leadId: lead.leadId,
                designerId: designerId,
                studioName: lead.studioName
            )
        }

        if let rosterDesigner = mostRecent(in: roster) {
            return .roster(designerId: rosterDesigner.designerId)
        }

        return .none
    }

    private static func activeProject(in projects: [RemoteProject]) -> RemoteProject? {
        projects.first {
            !StudioQueueBuilder.projectIsArchived($0) && $0.designer_id != nil
        }
    }

    private static func mostRecent(in roster: [RosterDesigner]) -> RosterDesigner? {
        let sorted = roster.sorted { $0.addedAt > $1.addedAt }
        guard let newest = sorted.first else { return nil }
        if let runnerUp = sorted.dropFirst().first,
           Calendar.current.isDate(newest.addedAt, inSameDayAs: runnerUp.addedAt) {
            return nil
        }
        return newest
    }
}
