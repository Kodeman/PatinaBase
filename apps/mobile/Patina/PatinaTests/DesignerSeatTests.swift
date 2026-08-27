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
}
