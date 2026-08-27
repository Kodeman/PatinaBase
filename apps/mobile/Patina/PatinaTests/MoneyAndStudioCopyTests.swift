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

    // MARK: - SP-15 · the date you need is on the screen you leave

    @Test("the due line reads the same on every money surface")
    func dueLineIsOneStringForEverySurface() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-08-27T16:00:00Z"))
        #expect(DateDisplay.due("2026-08-22", now: now)
                == DateDisplay.DueLine(text: "Overdue \u{00B7} Aug 22", isPastDue: true))
        #expect(DateDisplay.due("2026-08-27", now: now)
                == DateDisplay.DueLine(text: "Due today", isPastDue: false))
        #expect(DateDisplay.due("2026-09-01", now: now)
                == DateDisplay.DueLine(text: "Due Sep 1", isPastDue: false))
        #expect(DateDisplay.due(nil, now: now) == nil)
        #expect(DateDisplay.due("", now: now) == nil)
        #expect(DateDisplay.expiry("2026-09-08", now: now)?.text == "Expires Sep 8")
        #expect(DateDisplay.expiry("2026-08-22", now: now)?.isPastDue == true)
    }

    /// `invoices.due_date` is a Postgres `date` (00178:38) and
    /// `client_decisions.due_date` is `timestamptz` (00062:76) — both shapes
    /// reach this helper, and both have to produce a line. They are read in
    /// the device calendar, which is also how the Studio hub already reads
    /// them, so the hub and the detail cannot disagree.
    @Test("both Postgres date shapes produce a line, and the Studio hub agrees")
    @MainActor
    func dueLineParsesBothPostgresShapesAndMatchesTheStudioHub() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-08-27T16:00:00Z"))
        #expect(DateDisplay.due("2026-09-01", now: now) != nil)
        let stamped = try #require(DateDisplay.due("2026-08-22T00:00:00Z", now: now))
        #expect(stamped.isPastDue)

        let decisions = try decode([RemoteClientDecision].self, """
        [{ "id": "d-1", "title": "Rug color", "status": "pending",
           "due_date": "2026-08-22T00:00:00Z", "created_at": "2026-08-01T00:00:00Z" }]
        """)
        let snapshot = StudioQueueBuilder.build(StudioQueueInput(
            projects: [], decisions: decisions, proposals: [], invoices: [],
            documents: [], threads: [], notifications: [],
            currentUserId: "client", now: now
        ))
        #expect(snapshot.section(.awaitingYou).rows.first?.meta == stamped.text)
    }

    @Test("every money detail carries the date its list already printed")
    func moneyDetailsCarryTheirDates() throws {
        let invoice = try String(
            contentsOf: Self.sourceURL("Patina/Features/Invoices/Views/InvoiceDetailView.swift"),
            encoding: .utf8
        )
        #expect(invoice.contains("invoiceDetail.due"))
        let proposal = try String(
            contentsOf: Self.sourceURL("Patina/Features/Proposals/Views/ProposalDetailView.swift"),
            encoding: .utf8
        )
        #expect(proposal.contains("proposalDetail.expiry"))
        let decision = try String(
            contentsOf: Self.sourceURL("Patina/Features/Decisions/Views/DecisionDetailView.swift"),
            encoding: .utf8
        )
        #expect(decision.contains("decisionDetail.due"))
    }
}
