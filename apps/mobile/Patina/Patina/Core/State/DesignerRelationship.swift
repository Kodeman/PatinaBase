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
    ///
    /// `record` and the three row lists are how the project is chosen when
    /// there is more than one; see `activeProject(in:record:…)`. They default
    /// to nothing, so a caller that has no record still gets the old answer.
    static func resolve(
        lead: DesignRequestStatus?,
        projects: [RemoteProject],
        roster: [RosterDesigner],
        record: HouseRecord? = nil,
        decisions: [RemoteClientDecision] = [],
        proposals: [RemoteProposal] = [],
        invoices: [RemoteInvoice] = []
    ) -> DesignerRelationship {
        if let active = activeProject(
            in: projects, record: record,
            decisions: decisions, proposals: proposals, invoices: invoices
           ),
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

    /// **The same pick the seat makes** — the project carrying the most urgent
    /// NEEDS YOU row, else the most recently updated active one
    /// (`ProjectsAPIClient.listProjects` orders `updated_at.desc`).
    ///
    /// `client@patina.dev` has three simultaneously-active projects with the
    /// same designer. Until now this was `projects.first { … }` with no
    /// tie-break, so `Ask Leah to source this` opened a thread on `Birch
    /// Hollow` while every NEEDS YOU row on her Today was `Aspen Loft Refresh`
    /// — the seat above the record and the thread below it named two different
    /// jobs (`waves/w5/walk.md` §"Carried forward" 2; W2's walk found the same
    /// split in the seat and W4 fixed it there).
    ///
    /// The urgency rule is applied **inside** the designer-bearing set rather
    /// than over all active projects, which is the one place this deliberately
    /// differs from `DesignerSeat.activeProject`. The seat may name no project
    /// and fall back to the lead; this resolver may not, because `.none` is
    /// what draws Buy — a client whose urgent project carries no `designer_id`
    /// must still resolve `.project` on the one that does, or R3's pre-emption
    /// silently comes off. Where the urgent project IS designer-bearing — the
    /// case the walk found and every real one — the two agree exactly.
    ///
    /// The rule itself is `DesignerSeat.urgentProjectId`, called rather than
    /// copied: two spellings of "which project is the house waiting on" is how
    /// the seat and the thread came apart in the first place.
    static func activeProject(
        in projects: [RemoteProject],
        record: HouseRecord? = nil,
        decisions: [RemoteClientDecision] = [],
        proposals: [RemoteProposal] = [],
        invoices: [RemoteInvoice] = []
    ) -> RemoteProject? {
        let candidates = projects.filter {
            !StudioQueueBuilder.projectIsArchived($0) && $0.designer_id != nil
        }
        let urgentId = DesignerSeat.urgentProjectId(
            record: record, decisions: decisions, proposals: proposals, invoices: invoices
        )
        return urgentId.flatMap { id in candidates.first { $0.id == id } } ?? candidates.first
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
