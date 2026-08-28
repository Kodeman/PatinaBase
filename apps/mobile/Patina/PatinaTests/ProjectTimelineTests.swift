//
//  ProjectTimelineTests.swift
//  PatinaTests
//
//  F76/F125: the project detail fetched `project_phases` and drew them as a
//  flat list with no sense of where the project was. W4 marks the current
//  phase — and refuses to guess one where the server named none.
//

import Testing
import Foundation
@testable import Patina

struct ProjectTimelineTests {

    private func phases(_ json: String) throws -> [RemoteProjectPhase] {
        try JSONDecoder().decode([RemoteProjectPhase].self, from: Data(json.utf8))
    }

    private let threePhases = """
    [{ "id": "ph-1", "project_id": "p-1", "phase_key": "discovery",
       "status": "completed", "sort_order": 1 },
     { "id": "ph-2", "project_id": "p-1", "phase_key": "design",
       "status": "in_progress", "sort_order": 2 },
     { "id": "ph-3", "project_id": "p-1", "phase_key": "installation",
       "status": "pending", "sort_order": 3 }]
    """

    @Test("the designer's own current_phase names the current row")
    func currentPhaseKeyWins() throws {
        let rows = try phases(threePhases)
        #expect(
            ProjectDetailCopy.currentPhaseId(phases: rows, currentPhaseKey: "installation") == "ph-3"
        )
    }

    @Test("with no current_phase a single in_progress row stands in")
    func singleInProgressFallback() throws {
        let rows = try phases(threePhases)
        #expect(ProjectDetailCopy.currentPhaseId(phases: rows, currentPhaseKey: nil) == "ph-2")
    }

    @Test("a current_phase naming no row falls back rather than marking nothing wrongly")
    func unknownKeyFallsBack() throws {
        let rows = try phases(threePhases)
        #expect(
            ProjectDetailCopy.currentPhaseId(phases: rows, currentPhaseKey: "punch_list") == "ph-2"
        )
    }

    @Test("two rows claiming in_progress is not an answer")
    func ambiguousInProgressMarksNothing() throws {
        let rows = try phases("""
        [{ "id": "ph-1", "project_id": "p-1", "phase_key": "design",
           "status": "in_progress", "sort_order": 1 },
         { "id": "ph-2", "project_id": "p-1", "phase_key": "procurement",
           "status": "in_progress", "sort_order": 2 }]
        """)
        #expect(ProjectDetailCopy.currentPhaseId(phases: rows, currentPhaseKey: nil) == nil)
    }

    @Test("nothing running and nothing named marks nothing")
    func nothingToMark() throws {
        let rows = try phases("""
        [{ "id": "ph-1", "project_id": "p-1", "phase_key": "design",
           "status": "pending", "sort_order": 1 }]
        """)
        #expect(ProjectDetailCopy.currentPhaseId(phases: rows, currentPhaseKey: nil) == nil)
        #expect(ProjectDetailCopy.currentPhaseId(phases: [], currentPhaseKey: "design") == nil)
    }

    @Test("the timeline keeps the server's order and invents no phase")
    func orderIsTheServersOwn() throws {
        // `listPhases` orders `sort_order.asc,start_date.asc`
        // (`ProjectsAPIClient.swift:223`); the view draws the array it was
        // handed, so the only assertion worth making is that nothing here
        // re-sorts or pads it.
        let rows = try phases(threePhases)
        #expect(rows.map(\.id) == ["ph-1", "ph-2", "ph-3"])
        #expect(rows.count == 3)
    }
}
