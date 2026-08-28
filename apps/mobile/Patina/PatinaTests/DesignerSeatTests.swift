//
//  DesignerSeatTests.swift
//  PatinaTests
//
//  B §2 block 3 — the designer's permanent seat. What it says, where it takes
//  its words from, and the one case where it refuses to draw.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct DesignerSeatTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func lead(
        designerName: String? = "Leah Hartwell",
        designerId: UUID? = UUID(uuidString: "22222222-2222-2222-2222-222222222222"),
        status: String = "matched",
        studioName: String? = "Hartwell Studio"
    ) -> DesignRequestStatus {
        DesignRequestStatus(
            leadId: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            statusRaw: status, designerId: designerId, designerName: designerName,
            projectTypeRaw: nil, budgetRange: nil, timeline: nil,
            requestDescription: nil, scanCount: 0,
            createdAt: Date(timeIntervalSince1970: 1_755_000_000), updatedAt: nil,
            dismissedAt: nil, dismissedStageRaw: nil, introduction: nil,
            studioName: studioName
        )
    }

    private func projects(_ json: String) throws -> [RemoteProject] {
        try decode([RemoteProject].self, json)
    }

    @Test("with a project the seat names the studio and the project")
    func theSeatNamesTheProject() throws {
        let rows = try projects("""
        [{ "id": "b1", "name": "Aspen Loft Refresh", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222",
           "designer": { "id": "22222222-2222-2222-2222-222222222222",
                         "display_name": "Leah Hartwell",
                         "business_name": "Hartwell Studio" } }]
        """)
        let seat = try #require(DesignerSeat.make(liveLead: nil, projects: rows))
        #expect(seat.name == "Leah Hartwell")
        #expect(seat.meta == "Hartwell Studio · Aspen Loft Refresh")
        #expect(seat.projectId == "b1")
        #expect(seat.monogram == "LH")
    }

    @Test("with no project the seat says what the request is doing, and has no project thread")
    func theSeatSpeaksForTheLead() {
        let seat = DesignerSeat.make(liveLead: lead(), projects: [])
        #expect(seat?.name == "Leah Hartwell")
        #expect(seat?.projectId == nil)
        #expect(seat?.designerId != nil)
        #expect(seat?.meta?.isEmpty == false)
    }

    @Test("no designer anywhere means no seat — never a seat reading Your designer")
    func noDesignerNoSeat() throws {
        #expect(DesignerSeat.make(liveLead: nil, projects: []) == nil)
        // A lead with no designer on it yet is still no seat.
        #expect(DesignerSeat.make(
            liveLead: lead(designerName: nil, designerId: nil, status: "pending"),
            projects: []
        ) == nil)
        // A project whose designer embed brought no name is no seat either.
        let nameless = try projects("""
        [{ "id": "b1", "name": "Aspen Loft Refresh", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222" }]
        """)
        #expect(DesignerSeat.make(liveLead: nil, projects: nameless) == nil)
    }

    @Test("an archived project does not seat a designer who is gone")
    func archivedProjectsAreSkipped() throws {
        let rows = try projects("""
        [{ "id": "b1", "name": "Old Job", "status": "archived",
           "designer_id": "22222222-2222-2222-2222-222222222222",
           "designer": { "id": "22222222-2222-2222-2222-222222222222",
                         "display_name": "Leah Hartwell" } }]
        """)
        #expect(DesignerSeat.make(liveLead: nil, projects: rows) == nil)
    }

    /// SP-19: 44 pt. `Message` is the seat's whole reason to exist.
    @Test("the Message button is a 44 pt target")
    func theMessageButtonMeetsTheTarget() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/YourDesignerSeat.swift")
        #expect(source.contains("minHeight: 44"))
        #expect(!source.contains("minHeight: 36"))
    }

    // MARK: - W4: the seat follows the Record (W2 walk §2)

    /// Two active projects, one designer. `listProjects` orders
    /// `updated_at.desc`, so `b-newer` is what `projects.first` used to pick —
    /// and every NEEDS YOU row on the walk belonged to the other one.
    private func twoProjects() throws -> [RemoteProject] {
        try projects("""
        [{ "id": "b-newer", "name": "Birch Hollow", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222",
           "designer": { "id": "22222222-2222-2222-2222-222222222222",
                         "display_name": "Leah Hartwell" } },
         { "id": "b-aspen", "name": "Aspen Loft Refresh", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222",
           "designer": { "id": "22222222-2222-2222-2222-222222222222",
                         "display_name": "Leah Hartwell" } }]
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

    private func decision(id: String, projectId: String?) throws -> RemoteClientDecision {
        let project = projectId.map { "\"\($0)\"" } ?? "null"
        return try decode(RemoteClientDecision.self, """
        { "id": "\(id)", "project_id": \(project), "title": "Rug color",
          "status": "pending", "created_at": "2026-08-20T10:00:00Z" }
        """)
    }

    @Test("the seat takes the project the most urgent NEEDS YOU row belongs to")
    func theRecordPicksTheProject() throws {
        let seat = try #require(DesignerSeat.make(
            liveLead: nil,
            projects: try twoProjects(),
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-1")),
            decisions: [try decision(id: "d-1", projectId: "b-aspen")]
        ))
        #expect(seat.meta == "Aspen Loft Refresh")
        // `Message` opens a thread on the seat's project — the whole point of
        // the pick (walk §2: it opened Birch Hollow's conversation).
        #expect(seat.projectId == "b-aspen")
    }

    @Test("with no record the seat still takes the most recently updated project")
    func theFallbackIsUnchanged() throws {
        let seat = try #require(DesignerSeat.make(liveLead: nil, projects: try twoProjects()))
        #expect(seat.projectId == "b-newer")
    }

    @Test("a NEEDS YOU row that resolves to nothing falls back rather than blanking the seat")
    func anUnresolvableRowFallsBack() throws {
        // The decision is not in the retained collection (paged out, or the
        // record was painted from the snapshot before the fetch landed).
        let seat = try #require(DesignerSeat.make(
            liveLead: nil,
            projects: try twoProjects(),
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-missing")),
            decisions: [try decision(id: "d-1", projectId: "b-aspen")]
        ))
        #expect(seat.projectId == "b-newer")

        // And a row whose project is one the client no longer has.
        let orphaned = try #require(DesignerSeat.make(
            liveLead: nil,
            projects: try twoProjects(),
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-1")),
            decisions: [try decision(id: "d-1", projectId: "b-archived")]
        ))
        #expect(orphaned.projectId == "b-newer")
    }

    /// The urgent project carries no `designer` embed — no designer assigned
    /// yet, a decode predating the embed, or a `profiles` row this client
    /// cannot SELECT. The seat used to filter those out *before* resolving the
    /// urgent row, so it named the other project while the Next Move named
    /// this one and `Message` opened the wrong thread (the W2 walk defect).
    private func twoProjectsOneUnattributed() throws -> [RemoteProject] {
        try projects("""
        [{ "id": "b-newer", "name": "Birch Hollow", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222",
           "designer": { "id": "22222222-2222-2222-2222-222222222222",
                         "display_name": "Leah Hartwell" } },
         { "id": "b-aspen", "name": "Aspen Loft Refresh", "status": "active",
           "designer_id": null, "designer": null }]
        """)
    }

    @Test("the seat and the Next Move cannot name different projects")
    func onePickForBoth() throws {
        let rows = try twoProjectsOneUnattributed()
        let record = record(firstNeedsYou: .decisionDetail(decisionId: "d-1"))
        let decisions = [try decision(id: "d-1", projectId: "b-aspen")]

        // The pick both surfaces make is one function, and it is the urgent
        // project — designer embed or no designer embed.
        let picked = DesignerSeat.activeProject(
            projects: rows, record: record, decisions: decisions
        )
        #expect(picked?.id == "b-aspen")

        // And the seat does not answer with the other project's designer.
        let seat = DesignerSeat.make(
            liveLead: nil, projects: rows, record: record, decisions: decisions
        )
        #expect(seat == nil)
    }

    @Test("with no designer on the picked project the seat speaks for the lead instead")
    func theLeadCarriesTheSeatInstead() throws {
        let seat = try #require(DesignerSeat.make(
            liveLead: lead(),
            projects: try twoProjectsOneUnattributed(),
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-1")),
            decisions: [try decision(id: "d-1", projectId: "b-aspen")]
        ))
        #expect(seat.name == "Leah Hartwell")
        // No project thread: the app will not point Message at a project it
        // did not seat.
        #expect(seat.projectId == nil)
    }

    @Test("an archived urgent project is not the pick — it is not active")
    func anArchivedUrgentProjectIsSkipped() throws {
        let rows = try projects("""
        [{ "id": "b-newer", "name": "Birch Hollow", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222",
           "designer": { "id": "22222222-2222-2222-2222-222222222222",
                         "display_name": "Leah Hartwell" } },
         { "id": "b-old", "name": "Old Job", "status": "archived",
           "designer_id": "22222222-2222-2222-2222-222222222222",
           "designer": { "id": "22222222-2222-2222-2222-222222222222",
                         "display_name": "Leah Hartwell" } }]
        """)
        let picked = DesignerSeat.activeProject(
            projects: rows,
            record: record(firstNeedsYou: .decisionDetail(decisionId: "d-1")),
            decisions: [try decision(id: "d-1", projectId: "b-old")]
        )
        #expect(picked?.id == "b-newer")
    }

    @Test("an empty record changes nothing")
    func anEmptyRecordChangesNothing() throws {
        let seat = try #require(DesignerSeat.make(
            liveLead: nil, projects: try twoProjects(), record: .empty
        ))
        #expect(seat.projectId == "b-newer")
    }

    // MARK: - W4: the seat does not repeat the Next Move (r2-notes §4.3)

    @Test("where the seat would repeat the Next Move it names the studio and the stage")
    func theSeatDoesNotSayItTwice() {
        let matched = lead(status: "accepted")
        let nextMoveDetail = matched.stage.cardTitle(
            studioName: matched.studioName, designerName: matched.designerName
        )
        let seat = DesignerSeat.make(
            liveLead: matched, projects: [], nextMoveDetail: nextMoveDetail
        )
        #expect(nextMoveDetail == "You're matched with Leah Hartwell")
        #expect(seat?.meta == "Hartwell Studio · Designer matched")
    }

    @Test("with no studio known the stage stands alone — never a blank line")
    func theStageStandsAlone() {
        let matched = lead(status: "accepted", studioName: nil)
        let nextMoveDetail = matched.stage.cardTitle(designerName: matched.designerName)
        let seat = DesignerSeat.make(
            liveLead: matched, projects: [], nextMoveDetail: nextMoveDetail
        )
        #expect(seat?.meta == "Designer matched")
    }

    @Test("a Next Move saying something else leaves the seat's own line alone")
    func adifferentNextMoveLeavesTheSeatAlone() {
        let seat = DesignerSeat.make(
            liveLead: lead(status: "accepted"), projects: [],
            nextMoveDetail: "There is an update waiting for you."
        )
        #expect(seat?.meta == "You're matched with Leah Hartwell")
    }
}
