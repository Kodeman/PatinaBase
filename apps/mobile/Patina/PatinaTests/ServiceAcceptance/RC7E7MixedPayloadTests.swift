//
//  RC7E7MixedPayloadTests.swift
//  PatinaTests
//
//  US-52 RC-7 E7 (X08). The app's own decoders and feed predicates over the
//  payloads a real owned stack returned for one mixed project: legacy Stage-2
//  approvals of every kind and disposition, legacy client decisions, C4
//  requests (returned, replaced signer, paper, withdrawn, open), C6
//  completions and C5 external presence. The payloads were read through
//  GoTrue sessions and PostgREST with the exact selects/RPCs the app sends:
//  apps/designer-portal/e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json.
//

import Testing
import Foundation
@testable import Patina

enum RC7E7Payloads {
    static let root: [String: Any] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // ServiceAcceptance
            .deletingLastPathComponent() // PatinaTests
            .deletingLastPathComponent() // apps/mobile/Patina
            .deletingLastPathComponent() // apps/mobile
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent() // repo
            .appendingPathComponent("apps/designer-portal/e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json")
        let data = (try? Data(contentsOf: url)) ?? Data("{}".utf8)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }()

    static var meta: [String: Any] { root["meta"] as? [String: Any] ?? [:] }
    static func request(_ key: String) -> String { (meta["request"] as? [String: String])?[key] ?? "" }
    static func project(_ key: String) -> String { (meta["project"] as? [String: String])?[key] ?? "" }
    static func decision(_ index: Int) -> String { "e7e7a000-0000-4000-8000-00000000000\(index)" }
    static func legacy(_ index: Int) -> String { "e7e7b000-0000-4000-8000-00000000000\(index)" }

    static func recorded(_ actor: String, _ key: String) -> (status: Int, body: Data) {
        let actors = root["actors"] as? [String: [String: [String: Any]]] ?? [:]
        let entry = actors[actor]?[key] ?? [:]
        let body = entry["body"] ?? NSNull()
        let data = (try? JSONSerialization.data(withJSONObject: body, options: [.fragmentsAllowed])) ?? Data()
        return (entry["status"] as? Int ?? 0, data)
    }

    static func decode<T: Decodable>(_ type: T.Type, _ actor: String, _ key: String) throws -> T {
        let rec = recorded(actor, key)
        #expect(rec.status == 200, "\(actor) \(key) was HTTP \(rec.status)")
        return try JSONDecoder().decode(T.self, from: rec.body)
    }

    static let actors = [
        "studio_owner", "studio_member", "studio_admin", "other_studio_owner", "client_lead",
        "co_client", "replaced_partner", "replacement_partner", "gc_party", "outsider"
    ]
    static let studio = ["studio_owner", "studio_member", "studio_admin"]
}

private actor RecordedService: ServiceAcceptanceService {
    let rows: [RemoteServiceAcceptanceRequest]
    init(rows: [RemoteServiceAcceptanceRequest]) { self.rows = rows }
    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest] { rows }
    func fetchMyServiceAcceptanceEvidence(requestId: String) async throws -> RemoteServiceAcceptanceEvidence {
        throw URLError(.unsupportedURL)
    }
    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws {}
    func fetchStudioServiceCompletion(projectId: String) async throws -> RemoteStudioServiceCompletionRead {
        RemoteStudioServiceCompletionRead()
    }
}

@Suite("RC7-E7 X08 mixed-record payloads")
@MainActor
struct RC7E7MixedPayloadTests {

    @Test("the recorded payloads are present and come from the owned stack")
    func payloadsPresent() {
        #expect(RC7E7Payloads.meta["api"] as? String == "http://127.0.0.1:59121")
        #expect(!RC7E7Payloads.request("s2").isEmpty)
    }

    // MARK: approvals (Stage-2 projection)

    @Test("every actor's approval list decodes, carries only legacy kinds and never a service record")
    func approvalListsDecode() throws {
        let legacyKinds: Set<String> = ["plan_issue", "spec_book_artifact", "budget_version"]
        let stage2 = Set((1...5).map(RC7E7Payloads.decision))
        for actor in RC7E7Payloads.actors {
            let rows = try RC7E7Payloads.decode([RemoteProjectApprovalReview].self, actor, "list_my_project_decision_reviews")
            let reader = RC7E7Payloads.studio.contains(actor) || actor == "client_lead"
            #expect(rows.count == (reader ? 5 : 0), "\(actor)")
            for row in rows {
                #expect(legacyKinds.contains(row.artifactKind ?? ""))
                #expect(stage2.contains(row.decisionId))
                #expect(["lead", "studio"].contains(row.viewerRole ?? ""))
            }
        }
    }

    @Test("the lead answers her approvals; studio readers only observe; the feed carries the one issued ask")
    func approvalViewerRoles() throws {
        let lead = try RC7E7Payloads.decode([RemoteProjectApprovalReview].self, "client_lead", "list_my_project_decision_reviews")
        #expect(lead.allSatisfy { $0.viewerAnswers })
        #expect(lead.filter { $0.awaitsClientInFeed }.map(\.decisionId) == [RC7E7Payloads.decision(1)])
        for actor in RC7E7Payloads.studio {
            let rows = try RC7E7Payloads.decode([RemoteProjectApprovalReview].self, actor, "list_my_project_decision_reviews")
            #expect(rows.allSatisfy { !$0.viewerAnswers }, "\(actor)")
            #expect(rows.filter { $0.awaitsClientInFeed }.isEmpty, "\(actor)")
        }
    }

    @Test("native default-include: a service-projection role would read as answering on the approvals decoder")
    func unknownRoleDefaultsToAnswering() {
        // The approvals decoder treats an unknown role as hers (DecisionsAPIClient+ProjectApprovals.swift:195).
        #expect(ProjectApprovalViewerRole(raw: "signer_required") == .unspecified)
        #expect(ProjectApprovalViewerRole(raw: "signer_optional") == .unspecified)
        #expect(ProjectApprovalViewerRole(raw: "observer") == .observes)
        #expect(ProjectApprovalViewerRole(raw: "household") == .observes)
        // The service decoder fails the other way: unknown is observer.
        #expect(ServiceAcceptanceViewerRole(wire: "lead") == .observer)
        #expect(ServiceAcceptanceViewerRole(wire: "household") == .observer)
    }

    @Test("negative control: one service row in the approvals list fails the whole decode")
    func crossFedRowThrows() throws {
        let approvals = try JSONSerialization.jsonObject(with: RC7E7Payloads.recorded("client_lead", "list_my_project_decision_reviews").body) as? [Any] ?? []
        let services = try JSONSerialization.jsonObject(with: RC7E7Payloads.recorded("client_lead", "get_my_service_acceptance_requests").body) as? [Any] ?? []
        let mixed = try JSONSerialization.data(withJSONObject: approvals + [services[0]])
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder().decode([RemoteProjectApprovalReview].self, from: mixed)
        }
        let crossed = try JSONSerialization.data(withJSONObject: services)
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder().decode([RemoteProjectApprovalReview].self, from: crossed)
        }
    }

    // MARK: legacy client decisions (listPending / listOptions)

    @Test("the legacy pending list is the legacy rail only for the client, with Stage-2 rows for the studio")
    func legacyPendingDecodes() throws {
        let lead = try RC7E7Payloads.decode([RemoteClientDecision].self, "client_lead", "ios.client_decisions.pending")
        #expect(Set(lead.map(\.id)) == Set((1...3).map(RC7E7Payloads.legacy)))
        #expect(lead.allSatisfy { !$0.isProjectArtifactApproval })
        #expect(lead.filter { $0.isApprovableClientSignoff }.map(\.id) == [RC7E7Payloads.legacy(2)])
        let studio = try RC7E7Payloads.decode([RemoteClientDecision].self, "studio_owner", "ios.client_decisions.pending")
        #expect(Set(studio.map(\.id)) == Set([RC7E7Payloads.decision(1)] + (1...3).map(RC7E7Payloads.legacy)))
        let options = try RC7E7Payloads.decode([RemoteDecisionOption].self, "client_lead", "ios.client_decision_options.b1")
        #expect(options.count == 2)
        for actor in ["co_client", "replaced_partner", "replacement_partner", "gc_party", "outsider", "other_studio_owner"] {
            #expect(try RC7E7Payloads.decode([RemoteClientDecision].self, actor, "ios.client_decisions.pending").isEmpty)
        }
    }

    // MARK: service acceptance (C4) and studio service (C6)

    @Test("each actor reads its own requests; only required signers on the open request may answer")
    func serviceRequestsDecode() throws {
        let req = RC7E7Payloads.request
        let expected: [String: Set<String>] = [
            "client_lead": [req("r1"), req("r2"), req("p1"), req("s1"), req("s2")],
            "co_client": [req("r1"), req("r2"), req("s1"), req("s2")],
            "replaced_partner": [req("r1"), req("s1"), req("s2")],
            "replacement_partner": [req("r2")]
        ]
        for actor in RC7E7Payloads.actors {
            let rows = try RC7E7Payloads.decode([RemoteServiceAcceptanceRequest].self, actor, "get_my_service_acceptance_requests")
            #expect(Set(rows.map(\.requestId)) == expected[actor, default: []], "\(actor)")
            let answerable = rows.filter { $0.canRespond }.map(\.requestId)
            let shouldAnswer = ["client_lead", "co_client", "replaced_partner"].contains(actor)
            #expect(answerable == (shouldAnswer ? [req("s2")] : []), "\(actor)")
        }
        let lead = try RC7E7Payloads.decode([RemoteServiceAcceptanceRequest].self, "client_lead", "get_my_service_acceptance_requests")
        let byId = Dictionary(uniqueKeysWithValues: lead.map { ($0.requestId, $0) })
        #expect(byId[req("p1")]?.viewerRole == .observer)
        #expect(byId[req("p1")]?.aggregateOutcome == .accepted)
        #expect(byId[req("r2")]?.aggregateOutcome == .acceptedWithConditions)
        #expect(byId[req("r2")]?.viewerResponse?.response == .acceptWithConditions)
        #expect(byId[req("r1")]?.aggregateOutcome == .returned)
        #expect(byId[req("s1")]?.lifecycle == .withdrawn)
        let replacement = try RC7E7Payloads.decode([RemoteServiceAcceptanceRequest].self, "replacement_partner", "get_my_service_acceptance_requests")
        #expect(replacement.first?.viewerResponse?.response == .accept)
    }

    @Test("the model splits the lead's requests into one open card and four past ones")
    func modelOpenAndPast() async throws {
        let rows = try RC7E7Payloads.decode([RemoteServiceAcceptanceRequest].self, "client_lead", "get_my_service_acceptance_requests")
        let model = ServiceAcceptanceModel(service: RecordedService(rows: rows))
        await model.load()
        #expect(model.openRequests.map(\.requestId) == [RC7E7Payloads.request("s2")])
        #expect(model.pastRequests.count == 4)
        #expect(model.openRequests.allSatisfy { model.canRespond($0) })
        #expect(model.pastRequests.allSatisfy { !model.canRespond($0) })
    }

    @Test("bound evidence decodes and matches its request for every signer who can read it")
    func evidenceMatches() throws {
        for actor in ["client_lead", "co_client", "replaced_partner", "replacement_partner"] {
            let rows = try RC7E7Payloads.decode([RemoteServiceAcceptanceRequest].self, actor, "get_my_service_acceptance_requests")
            for key in ["r2", "p1", "s2"] {
                let rec = RC7E7Payloads.recorded(actor, "get_my_service_acceptance_evidence.\(key)")
                guard let request = rows.first(where: { $0.requestId == RC7E7Payloads.request(key) }) else {
                    #expect(rec.status == 403, "\(actor) \(key) unreadable request must be refused")
                    continue
                }
                #expect(rec.status == 200, "\(actor) \(key)")
                let evidence = try JSONDecoder().decode(RemoteServiceAcceptanceEvidence.self, from: rec.body)
                #expect(evidence.matches(request), "\(actor) \(key)")
            }
        }
    }

    @Test("studio service: conditional completion shows on job 1; the revoked one on job 2 never does")
    func studioServiceReading() throws {
        let lead = try RC7E7Payloads.decode([RemoteServiceAcceptanceRequest].self, "client_lead", "get_my_service_acceptance_requests")
        let byId = Dictionary(uniqueKeysWithValues: lead.map { ($0.requestId, $0) })
        let job1 = try RC7E7Payloads.decode(RemoteStudioServiceCompletionRead.self, "client_lead", "get_studio_service_completion.job1")
        let job2 = try RC7E7Payloads.decode(RemoteStudioServiceCompletionRead.self, "client_lead", "get_studio_service_completion.job2")
        let r2 = try #require(byId[RC7E7Payloads.request("r2")])
        let p1 = try #require(byId[RC7E7Payloads.request("p1")])
        #expect(StudioServiceReading(request: r2, read: job1)?.status == .completeWithConditions)
        #expect(StudioServiceReading(request: p1, read: job2)?.status == .notYet)
        #expect(StudioServiceReading(request: try #require(byId[RC7E7Payloads.request("s2")]), read: job1) == nil)
        // The studio projection lists the revoked completion; the reader skips it.
        let studioJob2 = try RC7E7Payloads.decode(RemoteStudioServiceCompletionRead.self, "studio_owner", "get_studio_service_completion.job2")
        #expect(studioJob2.completions.count == 1)
        #expect(studioJob2.completions.first?.revokedAt != nil)
        #expect(StudioServiceReading(request: p1, read: studioJob2)?.status == .notYet)
    }
}
