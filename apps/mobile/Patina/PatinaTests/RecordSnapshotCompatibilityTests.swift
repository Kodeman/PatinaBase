//
//  RecordSnapshotCompatibilityTests.swift
//  PatinaTests
//
//  `P-21`. The record on disk outlives the build that wrote it, and this wave
//  adds two row kinds to it. Two directions have to hold:
//
//   • **Backwards** — a snapshot written before `decisionAnswered` and
//     `proposalSigned` existed still decodes whole, including one written
//     before `isStandingCondition` and `askedBy` were fields at all.
//   • **Forwards** — a snapshot carrying a kind THIS build does not know costs
//     one row, not the whole record. Before this, `RecordSnapshotStore.load`
//     threw and Today painted blank on the first cold launch after a
//     downgrade.
//
//  The fixtures are ENCODED, then edited, rather than hand-written: the
//  snapshot's own coder decides how a `DateInterval` and a `State` are spelled
//  on disk, and a hand-written literal would be pinning this file's guess at
//  that rather than the shape the store actually writes.
//

import Foundation
import Testing
@testable import Patina

struct RecordSnapshotCompatibilityTests {

    private static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    private static let asked = Date(timeIntervalSince1970: 1_787_900_000)
    private static let moved = Date(timeIntervalSince1970: 1_788_000_000)

    /// One row per half, in kinds that predate this wave.
    private static func record() -> HouseRecord {
        HouseRecord(
            needsYou: [
                HouseRecordRow(
                    id: "decision:d-1", kind: .decisionAsked,
                    title: "Leah asked for your approval.", detail: "Kitchen plan set",
                    date: asked, state: .overdue(due: moved), isNew: false,
                    askedBy: "Leah", route: .decisionDetail(decisionId: "d-1")
                )
            ],
            moved: [
                HouseRecordRow(
                    id: "order:direct:o-1", kind: .orderMoved,
                    title: "Your dining table shipped.", detail: nil,
                    date: moved, state: .none, isNew: true,
                    route: .orderDetail(orderId: "direct:o-1")
                )
            ],
            window: DateInterval(start: asked, duration: 604_800),
            lastSeenAt: asked, hasMoreNeedsYou: false, hasMoreMoved: true
        )
    }

    private enum FixtureError: Error { case notAnObject }

    /// The encoded snapshot as a mutable object, so a test can age it.
    private static func snapshotObject() throws -> [String: Any] {
        let data = try encoder().encode(record())
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw FixtureError.notAnObject
        }
        return object
    }

    private static func data(_ object: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: object)
    }

    @Test("a snapshot from before this wave's fields still decodes whole")
    func anOlderSnapshotStillDecodes() throws {
        var object = try Self.snapshotObject()
        // The shape as it stood before `isStandingCondition` and `askedBy`:
        // both decode through `decodeIfPresent`, and their absence must cost
        // nothing but their own values.
        var needsYou = try #require(object["needsYou"] as? [[String: Any]])
        needsYou[0].removeValue(forKey: "isStandingCondition")
        needsYou[0].removeValue(forKey: "askedBy")
        object["needsYou"] = needsYou

        let record = try Self.decoder().decode(
            HouseRecord.self, from: Self.data(object)
        )

        #expect(record.needsYou.count == 1)
        #expect(record.moved.count == 1)
        #expect(record.needsYou[0].kind == .decisionAsked)
        #expect(record.needsYou[0].detail == "Kitchen plan set")
        #expect(record.needsYou[0].askedBy == nil)
        #expect(!record.needsYou[0].isStandingCondition)
        #expect(record.needsYou[0].route == .decisionDetail(decisionId: "d-1"))
        #expect(record.moved[0].kind == .orderMoved)
        #expect(record.moved[0].isNew)
        #expect(record.lastSeenAt == Self.asked)
        #expect(record.hasMoreMoved)
        #expect(record.window.duration == 604_800)

        if case .overdue(let due) = record.needsYou[0].state {
            #expect(due == Self.moved)
        } else {
            Issue.record("the overdue state did not survive the decode")
        }
    }

    @Test("a row kind this build does not know costs one row, not the record")
    func anUnknownKindCostsOneRow() throws {
        var object = try Self.snapshotObject()
        var moved = try #require(object["moved"] as? [[String: Any]])
        moved[0]["kind"] = "somethingFromALaterBuild"
        object["moved"] = moved

        let record = try Self.decoder().decode(
            HouseRecord.self, from: Self.data(object)
        )

        #expect(record.moved.isEmpty)
        // The half that WAS readable is untouched, and so is the card's frame.
        #expect(record.needsYou.count == 1)
        #expect(record.needsYou[0].kind == .decisionAsked)
        #expect(record.lastSeenAt == Self.asked)
        #expect(record.window.duration == 604_800)
    }

    @Test("an unreadable row in one half leaves the other half's rows standing")
    func oneBadRowDoesNotTakeItsNeighbours() throws {
        var object = try Self.snapshotObject()
        var needsYou = try #require(object["needsYou"] as? [[String: Any]])
        var stranger = needsYou[0]
        stranger["id"] = "decision:d-2"
        stranger["kind"] = "somethingFromALaterBuild"
        // The stranger sits FIRST, so a decoder that stopped at the bad element
        // rather than skipping it would lose the good one behind it.
        needsYou = [stranger] + needsYou
        object["needsYou"] = needsYou

        let record = try Self.decoder().decode(
            HouseRecord.self, from: Self.data(object)
        )

        #expect(record.needsYou.map(\.id) == ["decision:d-1"])
        #expect(record.moved.count == 1)
    }

    @Test("the store keeps a snapshot carrying one unreadable row")
    func theStoreKeepsAPartlyReadableSnapshot() throws {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = RecordSnapshotStore(
            appGroupIdentifier: "group.cloud.patina.tests.\(UUID().uuidString)",
            fallbackDirectory: directory,
            reloadWidgets: { _ in },
            flagIsOn: { false },
            ownerId: { nil },
            clearOwner: {},
            stampOwner: { _ in }
        )

        var object = try Self.snapshotObject()
        var moved = try #require(object["moved"] as? [[String: Any]])
        moved[0]["kind"] = "somethingFromALaterBuild"
        object["moved"] = moved
        try Self.data(object).write(to: store.fileURL)

        let loaded = try #require(store.load())
        #expect(loaded.needsYou.count == 1)
        #expect(loaded.moved.isEmpty)
    }

    /// The new kinds round-trip like any other. Nothing about the shape moved
    /// — only the vocabulary of one field grew.
    @Test("the two new kinds round-trip through the snapshot coder")
    func theNewKindsRoundTrip() throws {
        let record = HouseRecord(
            needsYou: [],
            moved: [
                HouseRecordRow(
                    id: "approval-answered:d-1", kind: .decisionAnswered,
                    title: "You approved this edition.", detail: "Kitchen millwork spec",
                    date: Self.moved, state: .none, isNew: false,
                    route: .decisionDetail(decisionId: "d-1")
                ),
                HouseRecordRow(
                    id: "proposal-signed:p-1", kind: .proposalSigned,
                    title: "You signed the proposal.", detail: "Living Room Refresh",
                    date: Self.asked, state: .none, isNew: false,
                    route: .proposalDetail(proposalId: "p-1")
                )
            ],
            window: DateInterval(start: Self.asked, duration: 604_800),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )

        let data = try Self.encoder().encode(record)
        let back = try Self.decoder().decode(HouseRecord.self, from: data)

        #expect(back.moved.map(\.kind) == [.decisionAnswered, .proposalSigned])
        #expect(back.moved.map(\.title) == [
            "You approved this edition.", "You signed the proposal."
        ])
        #expect(back.moved[0].route == .decisionDetail(decisionId: "d-1"))
        #expect(back.moved[1].route == .proposalDetail(proposalId: "p-1"))
        #expect(back == record)
    }
}
