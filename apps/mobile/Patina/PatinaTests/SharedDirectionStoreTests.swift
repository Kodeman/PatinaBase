//
//  SharedDirectionStoreTests.swift
//  PatinaTests
//
//  W1A-10 · CONTRACT-C §C.5, §C.5.1 and §C.5.2. What each typed answer does
//  to the offline shared direction, that nothing else ever deletes it, the
//  chunked refresh, and the six races the store's generations and sequence
//  numbers exist for — each driven by holding a fake answer until the test
//  releases it.
//

import Foundation
import SwiftData
import Testing
@testable import Patina

@MainActor
struct SharedDirectionStoreTests {

    private let edition = DirectionFixture.decisionId(1)

    /// E cached with one verified 64-byte sheet.
    private func cachedWithFiles() async throws -> DirectionHarness {
        let harness = try DirectionHarness()
        harness.client.editions[edition] = FakeEdition(sheetSizes: [64])
        await harness.refreshAndSettle([try #require(harness.discovered(edition))])
        let row = try #require(harness.store.cachedEdition(decisionId: edition))
        #expect(row.availability == .complete)
        #expect(harness.filesOnDisk(edition).count == 1)
        return harness
    }

    // MARK: - §C.5: what the device does with each answer

    @Test("revoked, not_found, withdrawn and superseded purge the record and its files")
    func typedAnswersPurge() async throws {
        let answers: [(FakeEdition, String?)] = [
            (FakeEdition(status: "revoked"), "shared_direction_revoked"),
            (FakeEdition(status: "not_found"), nil),
            (FakeEdition(disposition: "withdrawn"), nil),
            (FakeEdition(disposition: "superseded"), nil)
        ]
        for (answer, event) in answers {
            let harness = try await cachedWithFiles()
            defer { harness.cleanUp() }
            harness.client.editions[edition] = answer
            await harness.refreshAndSettle()
            #expect(harness.store.cachedEdition(decisionId: edition) == nil)
            #expect(FileManager.default.fileExists(atPath: harness.editionDirectory(edition).path) == false)
            #expect(harness.telemetry == (event.map { [$0] } ?? []))
        }
    }

    @Test("superseded caches the successor the RPC answers ok for")
    func supersededReadsItsSuccessor() async throws {
        let harness = try await cachedWithFiles()
        defer { harness.cleanUp() }
        let successor = DirectionFixture.decisionId(2)
        harness.client.editions[edition] = FakeEdition(disposition: "superseded", successorDecisionId: successor)
        harness.client.editions[successor] = FakeEdition()
        await harness.store.refresh(discovered: [])
        #expect(await eventually { harness.store.cachedEdition(decisionId: successor) != nil })
        #expect(harness.store.cachedEdition(decisionId: edition) == nil)
    }

    @Test("unauthorized never purges")
    func unauthorizedKeepsTheCache() async throws {
        let harness = try await cachedWithFiles()
        defer { harness.cleanUp() }
        harness.client.editions[edition] = FakeEdition(status: "unauthorized")
        await harness.refreshAndSettle()
        #expect(harness.store.cachedEdition(decisionId: edition)?.availability == .complete)
        #expect(harness.filesOnDisk(edition).count == 1)
        #expect(harness.telemetry.isEmpty)
    }

    /// Error classification (NI-05 and W1A-10): none of these is a decoded
    /// `shared_direction_v1` envelope, so each is indeterminate — the cache
    /// is left as it was and no purge event is sent.
    @Test(
        "an indeterminate answer leaves the cache intact",
        arguments: [
            "sql error", "PGRST202", "missing function", "null body",
            "malformed JSON", "unknown contract", "unknown status"
        ]
    )
    func indeterminateNeverPurges(failure: String) async throws {
        let harness = try await cachedWithFiles()
        defer { harness.cleanUp() }
        let reply = Self.indeterminate(failure, edition: edition)
        harness.client.batchOverride = reply
        harness.client.singleOverride = reply
        harness.client.editions[edition] = FakeEdition(status: "revoked")

        await harness.refreshAndSettle()
        // The detail read falls back to the cache, read-only, with its stamp.
        let shown = try await harness.store.readProjectApprovalReview(decisionId: edition)

        #expect(shown?.decisionId == edition)
        #expect(harness.store.freshnessLabel(forDecision: edition) != nil)
        #expect(harness.store.cachedEdition(decisionId: edition)?.availability == .complete)
        #expect(harness.filesOnDisk(edition).count == 1)
        #expect(harness.telemetry.isEmpty)
    }

    private static func indeterminate(_ failure: String, edition: String) -> () throws -> Data {
        let revoked = DirectionFixture.item(edition, FakeEdition(status: "revoked"))
        switch failure {
        case "sql error":
            return { throw RoomsAPIError.http(status: 400, body: #"{"code":"P0001","message":"p_held"}"#) }
        case "PGRST202":
            return { throw RoomsAPIError.http(status: 404, body: #"{"code":"PGRST202"}"#) }
        case "missing function":
            return { throw RoomsAPIError.http(status: 404, body: "") }
        case "null body":
            return { Data("null".utf8) }
        case "malformed JSON":
            return { Data(#"{"contract":"shared_direction_v1","editions":["#.utf8) }
        case "unknown contract":
            return {
                DirectionFixture.json([
                    "contract": "shared_direction_v2", "servedAt": DirectionFixture.noon,
                    "editions": [revoked]
                ])
            }
        default:
            var gone = revoked
            gone["status"] = "gone"
            return { DirectionFixture.envelope(servedAt: DirectionFixture.noon, items: [gone]) }
        }
    }

    // MARK: - §C.5.1: chunked by project, no call for an empty cache

    @Test("201 cached editions across two projects: two calls, the revocation in the last one lands")
    func refreshIsChunkedByProject() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        #expect(harness.client.batchCalls.isEmpty)
        await harness.store.refresh(discovered: [])
        #expect(harness.client.batchCalls.isEmpty, "an empty cache makes no call")

        let ids = (1...201).map(DirectionFixture.decisionId)
        for (index, id) in ids.enumerated() {
            let project = index < 150 ? "b0000000-0000-0000-0000-00000000000a" : "b0000000-0000-0000-0000-00000000000b"
            harness.client.editions[id] = FakeEdition(projectId: project)
        }
        await harness.store.refresh(discovered: ids.compactMap(harness.discovered))
        #expect(harness.store.rows().count == 201)

        let revoked = try #require(ids.last)
        harness.client.editions[revoked]?.status = "revoked"
        let before = harness.client.batchCalls.count
        await harness.store.refresh(discovered: [])

        let calls = harness.client.batchCalls.dropFirst(before)
        #expect(calls.count == 2)
        #expect(calls.allSatisfy { $0.count <= SharedDirectionStore.batchLimit })
        #expect(calls.last?.contains(revoked) == true)
        #expect(harness.store.cachedEdition(decisionId: revoked) == nil)
        #expect(harness.store.rows().count == 200)
    }

    @Test("a project past the limit splits across batches, whole projects pack together")
    func batchesPackWholeProjects() {
        func items(_ count: Int, project: String) -> [SharedDirectionStore.RefreshItem] {
            (0..<count).map { index in
                SharedDirectionStore.RefreshItem(
                    proof: SharedDirectionHeldProof(
                        decisionId: "\(project)-\(index)", heldAuthorityRevision: 1, heldArtifactChecksum: "c"
                    ),
                    projectId: project
                )
            }
        }
        #expect(SharedDirectionStore.batches([]).isEmpty)
        #expect(SharedDirectionStore.batches(items(201, project: "p")).map(\.count) == [200, 1])
        #expect(SharedDirectionStore.batches(items(150, project: "p") + items(51, project: "q")).map(\.count) == [150, 51])
        #expect(SharedDirectionStore.batches(items(120, project: "p") + items(80, project: "q")).map(\.count) == [200])
    }

    // MARK: - §C.7 freshness, through the store

    @Test("a delayed older envelope commits its edition and never moves the anchor back")
    func delayedEnvelopeKeepsTheAnchor() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        let other = DirectionFixture.decisionId(2)
        harness.client.editions[edition] = FakeEdition()
        harness.client.editions[other] = FakeEdition()

        harness.client.servedAt = "2026-09-24T12:05:00+00:00"
        await harness.store.refresh(decisionIds: [other])
        // A screen drawing a live answer carries no label.
        _ = try await harness.store.readProjectApprovalReview(decisionId: other)
        #expect(harness.store.freshnessLabel(forDecision: other) == nil)

        harness.client.servedAt = DirectionFixture.noon
        await harness.store.refresh(decisionIds: [edition])
        let stamped = harness.store.cachedEdition(decisionId: edition)?.servedAt
        #expect(stamped == DirectionFixture.date(DirectionFixture.noon))

        harness.client.singleOverride = { throw URLError(.timedOut) }
        _ = try await harness.store.readProjectApprovalReview(decisionId: edition)
        _ = try await harness.store.readProjectApprovalReview(decisionId: other)
        #expect(harness.store.freshnessLabel(forDecision: edition) == "Updated 5 min ago")
        #expect(harness.store.freshnessLabel(forDecision: other) == "Updated just now")
    }

    @Test("a malformed envelope between two good ones leaves the relative label monotonic")
    func malformedEnvelopeKeepsTheAnchor() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        let other = DirectionFixture.decisionId(2)
        harness.client.editions[edition] = FakeEdition()
        harness.client.editions[other] = FakeEdition()
        await harness.store.refresh(discovered: [try #require(harness.discovered(edition))])

        // Offline: the screen is handed the cached edition, with its stamp.
        harness.client.singleOverride = { throw URLError(.notConnectedToInternet) }
        _ = try await harness.store.readProjectApprovalReview(decisionId: edition)
        var labels: [String?] = []
        harness.clock.advance(.seconds(120))
        labels.append(harness.store.freshnessLabel(forDecision: edition))

        harness.client.batchOverride = { Data(#"{"contract":"shared_direction_v1","servedAt":"#.utf8) }
        await harness.store.refresh(discovered: [])
        harness.clock.advance(.seconds(60))
        labels.append(harness.store.freshnessLabel(forDecision: edition))

        harness.client.batchOverride = nil
        harness.client.servedAt = "2026-09-24T12:04:00+00:00"
        await harness.store.refresh(decisionIds: [other])
        labels.append(harness.store.freshnessLabel(forDecision: edition))

        #expect(labels == ["Updated 2 min ago", "Updated 3 min ago", "Updated 4 min ago"])
    }
}
