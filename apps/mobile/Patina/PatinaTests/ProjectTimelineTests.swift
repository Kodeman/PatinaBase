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

    @Test("a phase the project calls current whose own row says completed marks nothing")
    func aContradictionMarksNothing() throws {
        // `projects.current_phase` and `project_phases.status` are two columns
        // the designer maintains separately, and nothing reconciles them. The
        // row would otherwise read "CURRENT / Design / Completed": two server
        // facts arguing on one line, with no way for the reader to tell which
        // one the app believes. It marks neither, and the row still prints its
        // own status.
        let rows = try phases("""
        [{ "id": "ph-1", "project_id": "p-1", "phase_key": "discovery",
           "status": "completed", "sort_order": 1 },
         { "id": "ph-2", "project_id": "p-1", "phase_key": "design",
           "status": "completed", "sort_order": 2 },
         { "id": "ph-3", "project_id": "p-1", "phase_key": "installation",
           "status": "pending", "sort_order": 3 }]
        """)
        #expect(ProjectDetailCopy.currentPhaseId(phases: rows, currentPhaseKey: "design") == nil)
    }

    @Test("a completed current_phase falls through to the one row that is running")
    func aContradictionFallsThroughToTheRunningRow() throws {
        let rows = try phases(threePhases)
        // `discovery` is completed; `design` is the single in_progress row.
        #expect(
            ProjectDetailCopy.currentPhaseId(phases: rows, currentPhaseKey: "discovery") == "ph-2"
        )
    }

    // MARK: - VoiceOver

    @Test("the spoken row carries the fee that is on screen")
    func theVoiceLabelCarriesTheFee() {
        // The row is one combined accessibility element with an explicit
        // label, so anything left out of the label is silent — including a
        // money figure a sighted reader can see.
        let label = ProjectDetailCopy.phaseVoiceLabel(
            name: "Design", statusLine: "In Progress · Aug 1, 2026",
            isCurrent: true, fee: "$4,200"
        )
        #expect(label == "Current phase. Design. In Progress · Aug 1, 2026 $4,200.")
    }

    @Test("a phase with no fee says nothing about money")
    func theVoiceLabelInventsNoFee() {
        let label = ProjectDetailCopy.phaseVoiceLabel(
            name: "Installation", statusLine: "Pending", isCurrent: false, fee: nil
        )
        #expect(label == "Installation. Pending")
        #expect(!label.contains("$"))
    }

    // MARK: - What actually comes back from `project_phases`

    @Test("a phase row with no phase_key still decodes, and the whole list with it")
    func aNullPhaseKeyDoesNotLoseTheList() throws {
        // `project_phases.phase_key` is nullable and null on most rows the
        // seed writes. `phase_key` was declared non-optional, so one null
        // failed the decode of the entire array — `listPhases` threw and every
        // project reported "your designer is still putting the phases
        // together" while five rows sat on the wire.
        let rows = try phases("""
        [{ "id": "ph-1", "project_id": "p-1", "name": "Schematic Design",
           "phase_key": null, "status": "completed", "sort_order": 0,
           "start_date": "2026-07-24", "target_end_date": "2026-08-14" },
         { "id": "ph-2", "project_id": "p-1", "name": "Design Development",
           "phase_key": null, "status": "in_progress", "sort_order": 1 }]
        """)
        #expect(rows.count == 2)
        #expect(rows[0].phase_key == nil)
        #expect(rows[0].target_end_date == "2026-08-14")
    }

    @Test("the end date is the column the table actually has")
    func theEndDateIsTargetEndDate() throws {
        // There is no `end_date` on `project_phases` — it is
        // `target_end_date`, so the old name decoded nil on every row and the
        // second half of the status line could never print.
        let rows = try phases("""
        [{ "id": "ph-1", "project_id": "p-1", "phase_key": "design",
           "status": "in_progress", "sort_order": 1,
           "start_date": "2026-08-14", "target_end_date": "2026-09-11" }]
        """)
        #expect(rows[0].target_end_date == "2026-09-11")
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
