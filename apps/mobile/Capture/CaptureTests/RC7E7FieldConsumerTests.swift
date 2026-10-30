//  RC7E7FieldConsumerTests.swift
//  CaptureTests
//
//  US-52 RC-7 E7 (X08). Patina Field over the payloads a real owned stack
//  returned for one mixed project (legacy Stage-2 approvals and legacy client
//  decisions beside C4 requests, C6 completions and C5 external presence):
//  apps/designer-portal/e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json.
//
//  This logic bundle links CaptureKit only (generate_project.rb: SDK use is
//  app-side), so the app's private `DecisionRow` cannot be called from here.
//  What runs instead: the app's select and row shape are pinned from source,
//  and every recorded row is checked against the fields that decoder requires
//  before being mapped into CaptureKit's `FieldDecision`.

import Testing
import Foundation
@testable import CaptureKit

private enum RC7E7Field {
    static let root: [String: Any] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // CaptureTests
            .deletingLastPathComponent() // apps/mobile/Capture
            .deletingLastPathComponent() // apps/mobile
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent() // repo
            .appendingPathComponent("apps/designer-portal/e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json")
        let data = (try? Data(contentsOf: url)) ?? Data("{}".utf8)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }()

    static func rows(_ actor: String, _ key: String) -> (status: Int, rows: [[String: Any]]) {
        let actors = root["actors"] as? [String: [String: [String: Any]]] ?? [:]
        let entry = actors[actor]?[key] ?? [:]
        return (entry["status"] as? Int ?? 0, entry["body"] as? [[String: Any]] ?? [])
    }

    static func decision(_ n: Int) -> String { "e7e7a000-0000-4000-8000-00000000000\(n)" }
    static func legacy(_ n: Int) -> String { "e7e7b000-0000-4000-8000-00000000000\(n)" }
    static let studio = ["studio_owner", "studio_member", "studio_admin"]
    static let others = ["other_studio_owner", "client_lead", "co_client", "replaced_partner",
                         "replacement_partner", "gc_party", "outsider"]

    /// `DecisionRow.createdAt: Date` — supabase-swift's PostgREST decoder reads
    /// ISO-8601 with fractional seconds; the stack serves microseconds.
    static func date(_ value: Any?) -> Date? {
        guard let text = value as? String else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let trimmed = text.replacingOccurrences(of: #"(\.\d{3})\d+"#, with: "$1", options: .regularExpression)
        return formatter.date(from: trimmed)
    }

    /// `DecisionRow.fieldDecision`, field for field, for a row that carries
    /// every key that decoder requires; nil when one is missing.
    static func fieldDecision(_ row: [String: Any]) -> FieldDecision? {
        guard let id = row["id"] as? String, let title = row["title"] as? String,
              let status = row["status"] as? String, let created = date(row["created_at"]) else { return nil }
        let designerClient = row["designer_client"] as? [String: Any]
        let client = (designerClient?["client"] as? [String: Any])?["full_name"] as? String
        return FieldDecision(
            id: id, title: title,
            projectName: (row["project"] as? [String: Any])?["name"] as? String,
            clientName: client ?? designerClient?["client_name"] as? String,
            status: status, sentAt: created, viewedAt: date(row["viewed_at"]))
    }
}

@Suite("RC7-E7 X08 Patina Field consumers")
struct RC7E7FieldConsumerTests {

    @Test("the recorded reads are the app's own select, filter and row shape")
    func selectIsPinned() throws {
        let source = SourcePin.code(try SourcePin.read("Capture/Features/Decisions/SupabaseDecisionsReadService.swift"))
        #expect(source.contains(#""id,title,context,status,created_at,viewed_at,due_date,""#))
        #expect(source.contains(#""project:projects(name),""#))
        #expect(source.contains(#""designer_client:designer_clients(client_name,client_email,client:profiles!client_id(full_name))""#))
        #expect(source.contains(#".eq("status", value: "pending")"#))
        for required in ["let id: String", "let title: String", "let status: String", "let createdAt: Date"] {
            #expect(source.contains(required), "DecisionRow requires \(required)")
        }
        #expect(!source.contains("service_acceptance"))
        #expect(!source.contains("external_fulfil"))
    }

    @Test("the designer's pending list decodes: legacy rows plus the one pending Stage-2 row, no new record")
    func pendingListDecodes() {
        let expected = Set([RC7E7Field.decision(1)] + (1...3).map(RC7E7Field.legacy))
        for actor in RC7E7Field.studio {
            let (status, rows) = RC7E7Field.rows(actor, "capture.client_decisions.pending")
            #expect(status == 200)
            let decisions = rows.compactMap(RC7E7Field.fieldDecision)
            #expect(decisions.count == rows.count, "\(actor): every row carries DecisionRow's required keys")
            #expect(Set(decisions.map(\.id)) == expected, "\(actor)")
            #expect(decisions.allSatisfy { $0.status == "pending" && $0.projectName == "E7 household job" })
            #expect(decisions.allSatisfy { $0.clientName == "E7 Person 05" })
        }
        for actor in RC7E7Field.others {
            let (status, rows) = RC7E7Field.rows(actor, "capture.client_decisions.pending")
            #expect(status == 200)
            if actor == "client_lead" {
                // A client account in Field reads only its own legacy rows (RLS).
                #expect(Set(rows.compactMap(RC7E7Field.fieldDecision).map(\.id)) == Set((1...3).map(RC7E7Field.legacy)))
            } else {
                #expect(rows.isEmpty, "\(actor)")
            }
        }
    }

    @Test("decision detail decodes for the Stage-2 row and the legacy options")
    func detailDecodes() {
        for actor in RC7E7Field.studio {
            let detail = RC7E7Field.rows(actor, "capture.client_decisions.a1").rows
            #expect(detail.compactMap(RC7E7Field.fieldDecision).map(\.id) == [RC7E7Field.decision(1)])
            let options = RC7E7Field.rows(actor, "capture.client_decision_options.b1").rows
            #expect(options.count == 2)
            #expect(options.allSatisfy { $0["id"] is String && $0["name"] is String })
        }
    }

    @Test("a Field margin note carries an optional typed room subject under 00874/00877")
    func marginNoteShape() throws {
        let roomID = UUID()
        let request = MarginNoteWriteRequest(
            id: UUID(), projectID: UUID(), designerID: UUID(), body: "Confirm island overhang",
            fieldCaptureID: UUID(), subject: .projectRoom(roomID))
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any] ?? [:]
        #expect(Set(json.keys) == ["id", "body", "project_id", "designer_id", "anchor_kind", "field_capture_id", "subject_kind", "subject_id"])
        #expect(json["subject_kind"] as? String == "project_room")
        #expect(json["subject_id"] as? String == roomID.uuidString)
    }

    @Test("Field's deep links reach decisions only through the fixture harness, and name no service route")
    func deepLinksUntouched() throws {
        let source = SourcePin.code(try SourcePin.read("Capture/App/DeepLinking/CaptureDeepLink.swift"))
        #expect(source.contains("guard verificationHarnessAllowed else { return }"))
        #expect(source.contains(".decisionDetail(WorkFixtures.decisionID)"))
        #expect(source.components(separatedBy: ".decisionDetail(").count == 2)
        for word in ["acceptance", "fulfilment", "service_", "scope_edition"] {
            #expect(!source.lowercased().contains(word), "\(word)")
        }
    }
}
