//
//  DesignerProjectRuleTests.swift
//  PatinaTests
//
//  W5's walk item 1: `client@patina.dev` has three simultaneously-active
//  projects with the same designer, and `Ask Leah to source this` opened a
//  thread on `Birch Hollow` while every NEEDS YOU row on her Today read
//  `Aspen Loft Refresh`. W4 gave the seat the rule; the thread opener never
//  got it. This pins that both now make the same pick, from the same function.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct DesignerProjectRuleTests {

    private let leah = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
    /// `listProjects` orders `updated_at.desc`, so this is what
    /// `projects.first` used to pick.
    private let birchHollow = "11111111-0000-4000-8000-000000000001"
    /// Where the work actually is — every NEEDS YOU row on the walk was here.
    private let aspenLoft = "11111111-0000-4000-8000-000000000002"

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func projects(
        secondId: String? = nil,
        secondStatus: String = "active",
        secondDesigner: String? = "22222222-2222-2222-2222-222222222222"
    ) throws -> [RemoteProject] {
        let designer = secondDesigner.map { "\"\($0)\"" } ?? "null"
        return try decode([RemoteProject].self, """
        [{ "id": "\(birchHollow)", "name": "Birch Hollow", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222" },
         { "id": "\(secondId ?? aspenLoft)", "name": "Aspen Loft Refresh",
           "status": "\(secondStatus)", "designer_id": \(designer) }]
        """)
    }

    private func decision(id: String, projectId: String?) throws -> RemoteClientDecision {
        let project = projectId.map { "\"\($0)\"" } ?? "null"
        return try decode(RemoteClientDecision.self, """
        { "id": "\(id)", "project_id": \(project), "title": "Rug color",
          "status": "pending", "created_at": "2026-08-20T10:00:00Z" }
        """)
    }

    private func record(firstNeedsYou route: AppRoute?) -> HouseRecord {
        let row = HouseRecordRow(
            id: "row-1", kind: .decisionAsked, title: "Leah asked about the rug",
            detail: nil, date: Date(timeIntervalSince1970: 1_787_594_400),
            state: .overdue, isNew: false, route: route
        )
        return HouseRecord(
            needsYou: [row], moved: [],
            window: DateInterval(start: .distantPast, duration: 0),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    // MARK: - The pick

    @Test("the relationship takes the project the most urgent NEEDS YOU row belongs to")
    func theRecordPicksTheProject() throws {
        let relationship = DesignerRelationshipResolver.resolve(
            lead: nil,
            projects: try projects(),
            roster: [],
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-1")),
            decisions: [try decision(id: "d-1", projectId: aspenLoft)]
        )
        #expect(relationship == .project(
            projectId: UUID(uuidString: aspenLoft)!,
            designerId: leah,
            studioName: nil
        ))
    }

    @Test("the seat and the thread cannot name two different projects")
    func theSeatAndTheThreadAgree() throws {
        let rows = try projects()
        let record = record(firstNeedsYou: .decisionDetail(decisionId: "d-1"))
        let decisions = [try decision(id: "d-1", projectId: aspenLoft)]

        let seatPick = DesignerSeat.activeProject(
            projects: rows, record: record, decisions: decisions
        )
        let threadPick = DesignerRelationshipResolver.activeProject(
            in: rows, record: record, decisions: decisions
        )
        #expect(seatPick?.id == aspenLoft)
        #expect(threadPick?.id == aspenLoft)
    }

    @Test("the record's row can also be a proposal or an invoice")
    func theOtherTwoNeedsYouKinds() throws {
        let proposal = try decode(RemoteProposal.self, """
        { "id": "p-1", "project_id": "\(aspenLoft)", "status": "sent",
          "created_at": "2026-08-20T10:00:00Z" }
        """)
        let byProposal = DesignerRelationshipResolver.activeProject(
            in: try projects(),
            record: record(firstNeedsYou: .proposalDetail(proposalId: "p-1")),
            proposals: [proposal]
        )
        #expect(byProposal?.id == aspenLoft)

        let invoice = try decode(RemoteInvoice.self, """
        { "id": "i-1", "project_id": "\(aspenLoft)", "status": "sent",
          "created_at": "2026-08-20T10:00:00Z" }
        """)
        let byInvoice = DesignerRelationshipResolver.activeProject(
            in: try projects(),
            record: record(firstNeedsYou: .invoiceDetail(invoiceId: "i-1")),
            invoices: [invoice]
        )
        #expect(byInvoice?.id == aspenLoft)
    }

    @Test("with no record the pick is the most recently updated active project")
    func theFallbackIsTheOldBehaviour() throws {
        let picked = DesignerRelationshipResolver.activeProject(in: try projects())
        #expect(picked?.id == birchHollow)
    }

    @Test("a NEEDS YOU row that resolves to nothing falls back rather than picking nothing")
    func anUnresolvableRowFallsBack() throws {
        // The decision is not in the retained rows — paged out, or the record
        // was painted from the snapshot before the fetch landed.
        let picked = DesignerRelationshipResolver.activeProject(
            in: try projects(),
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-missing")),
            decisions: [try decision(id: "d-1", projectId: aspenLoft)]
        )
        #expect(picked?.id == birchHollow)
    }

    @Test("an archived urgent project is not the pick")
    func anArchivedUrgentProjectIsSkipped() throws {
        let picked = DesignerRelationshipResolver.activeProject(
            in: try projects(secondStatus: "archived"),
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-1")),
            decisions: [try decision(id: "d-1", projectId: aspenLoft)]
        )
        #expect(picked?.id == birchHollow)
    }

    /// The one place this deliberately differs from the seat. The seat may
    /// name no project and speak for the lead instead; the resolver may not,
    /// because `.none` is the relationship that draws Buy. R3's pre-emption
    /// must survive an urgent project whose `designer_id` never arrived.
    @Test("an urgent project with no designer does not take R3's pre-emption off")
    func theUrgentProjectWithoutADesignerDoesNotUnsetTheRelationship() throws {
        let relationship = DesignerRelationshipResolver.resolve(
            lead: nil,
            projects: try projects(secondDesigner: nil),
            roster: [],
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-1")),
            decisions: [try decision(id: "d-1", projectId: aspenLoft)]
        )
        #expect(relationship.isLive)
        #expect(relationship.designerId == leah)
    }

    // MARK: - The opener feeds it

    @Test("the thread opener hands the resolver the record and the retained rows")
    func theOpenerFeedsTheRule() throws {
        let source = try SourcePin.read("Patina/Features/Messaging/DesignerThreadOpener.swift")
        #expect(source.contains("record: admittedRecord()"))
        #expect(source.contains("decisions: badges.pendingDecisions"))
        #expect(source.contains("proposals: badges.pendingProposals"))
        #expect(source.contains("invoices: badges.payableInvoices"))
        // Never a foreign account's record — and never the deleting variant,
        // which is `RecordRefresh`'s decision to make, not this path's.
        #expect(source.contains("RecordIdentity.decide("))
        #expect(!source.contains("RecordIdentity.admits("))
    }
}
