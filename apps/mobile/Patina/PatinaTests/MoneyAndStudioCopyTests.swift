//
//  MoneyAndStudioCopyTests.swift
//  PatinaTests
//
//  W1b lane B. The copy and chrome contracts the money and studio screens have
//  to hold: SP-05 (the project screen stops talking to the designer), SP-15
//  (dates carried, failures in Patina's voice), SP-16 (the budget screen named
//  for what it computes) and SP-19's money half (the status bar and the Hearth
//  stop covering the content).
//

import Testing
import Foundation
@testable import Patina

struct MoneyAndStudioCopyTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    static func sourceURL(_ relativePath: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // PatinaTests
            .deletingLastPathComponent() // apps/mobile/Patina
            .appendingPathComponent(relativePath)
    }

    // MARK: - SP-05 · the project screen stops talking to the designer

    @Test("the client's project screen never prints the visibility tier")
    func overviewFactsDropTheClientViewTile() throws {
        let project = try decode(RemoteProject.self, """
        { "id": "pr-1", "name": "Aspen Loft Refresh", "status": "in_progress",
          "budget_cents": 12000000, "client_visibility_tier": "milestone",
          "start_date": "2026-04-01" }
        """)
        let labels = ProjectDetailCopy.overviewFacts(project).map(\.0)
        #expect(!labels.contains("Client view"))
        #expect(labels == ["Budget", "Status", "Started"])
    }

    @Test("empty project sections speak to the client, not the designer's portal")
    func missingSectionsUseClientVoice() {
        let lines = ProjectDetailCopy.missingSectionLines(phases: true, payments: true, ffe: true)
        #expect(lines == [
            "Your designer is still putting the phases together.",
            "No payment schedule yet.",
            "No furnishings list yet."
        ])
        #expect(!lines.contains { $0.lowercased().contains("portal") })
        #expect(ProjectDetailCopy.missingSectionLines(phases: false, payments: false, ffe: false).isEmpty)
    }

    @Test("the project screen carries no portal instruction at all")
    func projectDetailHasNoPortalInstruction() throws {
        let source = try String(
            contentsOf: Self.sourceURL("Patina/Features/Projects/Views/ProjectDetailView.swift"),
            encoding: .utf8
        )
        #expect(!source.contains("in the portal"))
        #expect(!source.contains("Client view"))
    }
}
