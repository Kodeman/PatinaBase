//
//  ServiceAcceptanceStudioServiceTests.swift
//  PatinaTests
//
//  US-52 WP-10B-d. The read-only **Studio service** section on an accepted
//  request, from `get_studio_service_completion` (00888). Pins each state,
//  the unknown-state and permission-denied readings, and that no financial
//  hold reaches the copy even when the payload carries one.
//

import Testing
import Foundation
@testable import Patina

enum StudioServiceFixture {
    /// One client-projection completion (00888 `get_studio_service_completion`,
    /// audience `client`). `state` nil drops the key.
    static func completion(
        state: String? = "completed",
        acceptanceRequestId: String = "req-1",
        conditionsClosedAt: String? = nil,
        extra: String = ""
    ) -> String {
        let stateKey = state.map { "\"state\": \"\($0)\"," } ?? ""
        let closed = conditionsClosedAt.map { "\"\($0)\"" } ?? "null"
        return """
        {
          "completionId": "comp-1", \(stateKey)
          "completedAt": "2026-10-27T15:00:00Z", "conditionsClosedAt": \(closed),
          "scopeEditionId": "ed-1", "scopeContentHash": "sha-scope-1abcdef",
          "acceptanceRequestId": "\(acceptanceRequestId)", "requestNumber": 2\(extra)
        }
        """
    }

    static func payload(_ completions: [String], audience: String = "client", capability: String? = nil) -> String {
        let cap = capability.map { "\"capability\": \"\($0)\"," } ?? ""
        return """
        {"projectId": "proj-1", "audience": "\(audience)", \(cap)
         "completions": [\(completions.joined(separator: ","))]}
        """
    }

    static func read(_ completions: String..., capability: String? = nil) throws -> RemoteStudioServiceCompletionRead {
        try decode(payload(completions, capability: capability))
    }

    static func decode(_ json: String) throws -> RemoteStudioServiceCompletionRead {
        try JSONDecoder().decode(RemoteStudioServiceCompletionRead.self, from: Data(json.utf8))
    }

    static let accepted = ServiceAcceptanceFixture.row(lifecycle: "closed", aggregateOutcome: "accepted",
                                                       viewerResponse: "accept", method: "ios_authenticated")
}

private actor CompletionService: ServiceAcceptanceService {
    let rows: [RemoteServiceAcceptanceRequest]
    var results: [Result<RemoteStudioServiceCompletionRead, Error>]
    private(set) var completionFetches = 0

    init(rows: [RemoteServiceAcceptanceRequest], results: [Result<RemoteStudioServiceCompletionRead, Error>]) {
        self.rows = rows
        self.results = results
    }

    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest] { rows }

    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws {}

    func fetchStudioServiceCompletion(projectId: String) async throws -> RemoteStudioServiceCompletionRead {
        completionFetches += 1
        return try results.removeFirst().get()
    }
}

private let permissionDenied = RoomsAPIError.http(
    status: 403,
    body: #"{"code":"42501","details":null,"hint":null,"message":"insufficient_privilege"}"#
)

@MainActor
struct ServiceAcceptanceStudioServiceTests {

    /// Every line the section can draw for one reading.
    private func lines(_ reading: StudioServiceReading) -> [String] {
        let completed = reading.completedAt.map {
            ServiceAcceptanceCopy.studioServiceCompleted(DateDisplay.fromTimestamp($0))
        }
        return [ServiceAcceptanceCopy.studioServiceTitle, ServiceAcceptanceCopy.studioServiceStatus(reading.status)]
            + [completed, ServiceAcceptanceCopy.acceptedScope(reading)].compactMap { $0 }
    }

    private func reading(_ read: RemoteStudioServiceCompletionRead,
                         request json: String = StudioServiceFixture.accepted) throws -> StudioServiceReading? {
        StudioServiceReading(request: try ServiceAcceptanceFixture.request(json), read: read)
    }

    // MARK: - States

    @Test("completed: complete, with the completion date and the accepted scope reference")
    func completed() throws {
        let section = try #require(try reading(StudioServiceFixture.read(StudioServiceFixture.completion())))
        #expect(section.status == .complete)
        #expect(ServiceAcceptanceCopy.studioServiceStatus(section.status) == "The studio’s service is complete")
        #expect(section.completedAt == "2026-10-27T15:00:00Z")
        #expect(ServiceAcceptanceCopy.acceptedScope(section) == "Accepted scope · Request 2 · sha-scope-1a")
    }

    @Test("completed_with_conditions, conditions open: complete with conditions, no count and no texts")
    func completedWithConditionsOpen() throws {
        let section = try #require(try reading(StudioServiceFixture.read(
            StudioServiceFixture.completion(state: "completed_with_conditions")
        )))
        #expect(section.status == .completeWithConditions)
        let status = ServiceAcceptanceCopy.studioServiceStatus(section.status)
        #expect(status == "Complete, with conditions still being resolved")
        let hasDigit = status.contains { $0.isNumber }
        #expect(!hasDigit)
        #expect(section.completedAt != nil)
    }

    @Test("completed_with_conditions with conditionsClosedAt set reads as complete")
    func completedWithConditionsClosed() throws {
        let section = try #require(try reading(StudioServiceFixture.read(
            StudioServiceFixture.completion(state: "completed_with_conditions",
                                            conditionsClosedAt: "2026-10-28T09:00:00Z")
        )))
        #expect(section.status == .complete)
        #expect(ServiceAcceptanceCopy.studioServiceStatus(section.status) == "The studio’s service is complete")
    }

    @Test("no completion for this request: not yet, with no date or reference")
    func absent() throws {
        let none = try #require(try reading(StudioServiceFixture.read()))
        let otherRequest = try #require(try reading(StudioServiceFixture.read(
            StudioServiceFixture.completion(acceptanceRequestId: "req-other")
        )))
        for section in [none, otherRequest] {
            #expect(section.status == .notYet)
            #expect(section.completedAt == nil)
            #expect(ServiceAcceptanceCopy.acceptedScope(section) == nil)
            #expect(ServiceAcceptanceCopy.studioServiceStatus(section.status)
                    == "The studio will confirm when its service is complete")
        }
    }

    @Test("an unknown or missing state decodes to not complete")
    func unknownState() throws {
        for completion in [StudioServiceFixture.completion(state: "completed_pending_audit"),
                           StudioServiceFixture.completion(state: nil)] {
            let read = try StudioServiceFixture.read(completion)
            #expect(read.completions.first?.state == .unknown)
            let section = try #require(try reading(read))
            #expect(section.status == .notYet)
            #expect(section.completedAt == nil)
        }
    }

    @Test("an inactive capability hides the section")
    func inactiveHides() throws {
        let read = try StudioServiceFixture.read(StudioServiceFixture.completion(), capability: "inactive")
        #expect(try reading(read) == nil)
    }

    @Test("an acceptance that has not closed as accepted shows no section")
    func notAcceptedHides() throws {
        let read = try StudioServiceFixture.read(StudioServiceFixture.completion())
        #expect(try reading(read, request: ServiceAcceptanceFixture.row()) == nil)
        #expect(try reading(read, request: ServiceAcceptanceFixture.row(
            lifecycle: "closed", aggregateOutcome: "returned", viewerResponse: "return")) == nil)
        #expect(try reading(read, request: ServiceAcceptanceFixture.row(
            lifecycle: "closed", aggregateOutcome: "accepted_with_conditions",
            viewerResponse: "accept_with_conditions")) != nil)
    }

    @Test("a payload carrying the financial hold decodes, and no hold reaches the copy")
    func neverShowsTheHold() throws {
        let hold = #", "financialHold": {"outstandingCents": 125000, "label": "Outstanding balance hold"}"#
            + #", "obligationSnapshot": {"items": []}, "revokeReason": "billing""#
        let json = StudioServiceFixture.payload(
            [StudioServiceFixture.completion(state: "completed_with_conditions", extra: hold)],
            audience: "studio", capability: "active"
        )
        let section = try #require(try reading(StudioServiceFixture.decode(json)))
        #expect(section.status == .completeWithConditions)
        for line in lines(section) {
            for word in ["hold", "balance", "outstanding", "1250", "$", "billing", "closed"] {
                #expect(!line.lowercased().contains(word), "\"\(line)\" shows \"\(word)\"")
            }
        }
    }

    // MARK: - Model

    @Test("permission denied hides the section, including after an earlier good read")
    func permissionDeniedHides() async throws {
        let request = try ServiceAcceptanceFixture.request(StudioServiceFixture.accepted)
        let service = CompletionService(rows: [request], results: [
            .success(try StudioServiceFixture.read(StudioServiceFixture.completion())),
            .failure(permissionDenied)
        ])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        await model.loadStudioService(for: request)
        #expect(model.studioService(for: request)?.status == .complete)
        await model.loadStudioService(for: request)
        #expect(model.studioService(for: request) == nil)
        #expect(await service.completionFetches == 2)
    }

    @Test("an open request never reads the studio service")
    func openRequestDoesNotRead() async throws {
        let request = try ServiceAcceptanceFixture.request(ServiceAcceptanceFixture.row())
        let service = CompletionService(rows: [request], results: [])
        let model = ServiceAcceptanceModel(service: service)
        await model.load()
        await model.loadStudioService(for: request)
        #expect(model.studioService(for: request) == nil)
        #expect(await service.completionFetches == 0)
    }
}
