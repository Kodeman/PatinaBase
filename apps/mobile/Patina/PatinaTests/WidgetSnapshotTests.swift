//
//  WidgetSnapshotTests.swift
//  PatinaTests
//
//  The contract between the app and W6's widget: the file on disk. Every
//  ruling the widget has to obey is pinned here, on the app's side of the
//  seam, because the widget process cannot be reasoned with at run time.
//

import Foundation
import Testing
@testable import Patina

struct WidgetSnapshotTests {

    private let referenceDate = Date(timeIntervalSince1970: 1_787_000_000)

    /// A store guaranteed to miss the App Group and take the fallback — which
    /// is also what the Simulator does without provisioning (w2/r1-notes §7).
    /// Reloads are counted rather than delivered; no widget is installed.
    private func fallbackStore(
        reloads: ReloadCounter = ReloadCounter(),
        flagOn: Bool = true
    ) -> RecordSnapshotStore {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("patina.tests.widget.\(UUID().uuidString)")
        return RecordSnapshotStore(
            appGroupIdentifier: "group.does.not.exist.\(UUID().uuidString)",
            fallbackDirectory: directory,
            reloadWidgets: { kind in reloads.record(kind) },
            flagIsOn: { flagOn }
        )
    }

    /// `RecordSnapshotStore` is `Sendable` and calls the reload closure from
    /// whatever thread saved; the counter locks its own state.
    final class ReloadCounter: @unchecked Sendable {
        private let lock = NSLock()
        private var kinds: [String] = []

        func record(_ kind: String) {
            lock.lock()
            kinds.append(kind)
            lock.unlock()
        }

        var count: Int {
            lock.lock()
            defer { lock.unlock() }
            return kinds.count
        }

        var last: String? {
            lock.lock()
            defer { lock.unlock() }
            return kinds.last
        }
    }

    private func row(id: String, kind: HouseRecordRow.Kind, route: AppRoute?) -> HouseRecordRow {
        HouseRecordRow(
            id: id, kind: kind, title: "\(id) happened.", detail: nil,
            date: referenceDate, state: .none, isNew: true, route: route
        )
    }

    private func record() -> HouseRecord {
        HouseRecord(
            needsYou: [
                row(id: "invoice:i1", kind: .invoiceDue, route: .invoiceDetail(invoiceId: "i1")),
                row(id: "decision:d1", kind: .decisionAsked, route: .decisionDetail(decisionId: "d1"))
            ],
            moved: [
                row(id: "message:m1", kind: .messageReceived, route: .threadDetail(threadId: "t1")),
                row(id: "story:s1", kind: .story, route: nil)
            ],
            window: DateInterval(start: referenceDate.addingTimeInterval(-604_800), end: referenceDate),
            lastSeenAt: referenceDate.addingTimeInterval(-86_400),
            hasMoreNeedsYou: true, hasMoreMoved: true
        )
    }

    // MARK: - Shape

    @Test("saving a record writes the widget's own file beside it")
    func savingWritesTheWidgetFile() throws {
        let store = fallbackStore()
        store.save(record(), houseLine: "Living Room", now: referenceDate)

        #expect(store.widgetFileURL.lastPathComponent == "widget-snapshot.json")
        let snapshot = try #require(store.loadWidgetSnapshot())
        #expect(snapshot.houseLine == "Living Room")
        #expect(snapshot.refreshedAt == referenceDate)
        #expect(snapshot.flagOn)
    }

    @Test("the widget sees what moved, in order, and nothing else")
    func onlyMovedRowsAreProjected() throws {
        let store = fallbackStore()
        store.save(record(), houseLine: nil, now: referenceDate)

        let snapshot = try #require(store.loadWidgetSnapshot())
        #expect(snapshot.movedRows.map(\.id) == ["message:m1", "story:s1"])
    }

    /// Q8 / C5 / B §4: "carries what moved, not what is owed"; "no count on
    /// either". The rule is made structural — the payload has no such field —
    /// and this asserts it against the bytes, not against the Swift type.
    @Test("nothing about NEEDS YOU reaches the file — no rows, no count, no badge")
    func needsYouNeverReachesTheWidget() throws {
        let store = fallbackStore()
        store.save(record(), houseLine: "Living Room", now: referenceDate)

        let data = try Data(contentsOf: store.widgetFileURL)
        let json = try #require(
            try JSONSerialization.jsonObject(with: data) as? [String: Any]
        )

        #expect(json["needsYou"] == nil)
        #expect(json["hasMoreNeedsYou"] == nil)
        #expect(json["badge"] == nil)
        #expect(json["count"] == nil)
        #expect(Set(json.keys) == ["movedRows", "houseLine", "refreshedAt", "flagOn"])

        // And no NEEDS YOU row's identifier slipped in through the projection.
        let text = try #require(String(data: data, encoding: .utf8))
        #expect(!text.contains("invoice:i1"))
        #expect(!text.contains("decision:d1"))
    }

    @Test("a row's destination round-trips as the same token the record uses")
    func routeTokensUseTheRecordVocabulary() throws {
        let store = fallbackStore()
        store.save(record(), now: referenceDate)

        let snapshot = try #require(store.loadWidgetSnapshot())
        #expect(snapshot.movedRows[0].route == WidgetRouteToken(.threadDetail(threadId: "t1")))
        #expect(snapshot.movedRows[0].route?.kind == "thread")
        // A row with no destination still draws; it just has none.
        #expect(snapshot.movedRows[1].route == nil)
    }

    @Test("the file decodes through a plain Codable mirror, as the widget will")
    func decodesThroughAnIndependentMirror() throws {
        // X1's widget keeps its OWN copy of these shapes under `PatinaWidget/`
        // — nothing is shared at the source level, so the contract is the
        // JSON. This decodes it with a structurally identical local type.
        struct MirrorRoute: Codable, Equatable { let kind: String; let id: String? }
        struct MirrorRow: Codable {
            let id: String
            let title: String
            let date: Date
            let route: MirrorRoute?
        }
        struct Mirror: Codable {
            let movedRows: [MirrorRow]
            let houseLine: String?
            let refreshedAt: Date
            let flagOn: Bool
        }

        let store = fallbackStore()
        store.save(record(), houseLine: "Living Room", now: referenceDate)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let mirror = try decoder.decode(Mirror.self, from: Data(contentsOf: store.widgetFileURL))

        #expect(mirror.movedRows.count == 2)
        #expect(mirror.movedRows[0].title == "message:m1 happened.")
        #expect(mirror.movedRows[0].route == MirrorRoute(kind: "thread", id: "t1"))
        #expect(mirror.houseLine == "Living Room")
        #expect(mirror.flagOn)
    }

    // MARK: - Honesty

    @Test("the snapshot says when it was refreshed, never 'now'")
    func refreshedAtIsWhenTheAppWrote() throws {
        let store = fallbackStore()
        let written = referenceDate.addingTimeInterval(-7200)
        store.save(record(), now: written)

        #expect(try #require(store.loadWidgetSnapshot()).refreshedAt == written)
    }

    @Test("the flag the widget reads is the one the mirror resolved, not a guess")
    func flagOnComesFromTheMirror() throws {
        let off = fallbackStore(flagOn: false)
        off.save(record(), now: referenceDate)
        #expect(try #require(off.loadWidgetSnapshot()).flagOn == false)
    }

    // MARK: - Fallback

    @Test("an unreachable App Group falls back and the widget file still lands")
    func theFallbackCarriesTheWidgetFileToo() throws {
        let store = fallbackStore()
        #expect(store.usesAppGroupContainer == false)
        // Both files land in ONE directory — the widget resolves the group
        // container and finds nothing there, which is its no-data state, not
        // a stale draw.
        #expect(
            store.widgetFileURL.deletingLastPathComponent()
                == store.fileURL.deletingLastPathComponent()
        )

        store.save(record(), now: referenceDate)
        #expect(store.loadWidgetSnapshot() != nil)
    }

    @Test("a corrupt widget file reads as nil rather than throwing")
    func aCorruptWidgetFileReadsAsNil() throws {
        let store = fallbackStore()
        store.save(record(), now: referenceDate)
        try Data("not json".utf8).write(to: store.widgetFileURL)

        #expect(store.loadWidgetSnapshot() == nil)
    }

    // MARK: - The house line

    @Test("a record save carries the last known house line forward")
    func theHouseLineSurvivesARecordSave() throws {
        let store = fallbackStore()
        store.noteHouseLine("Living Room", now: referenceDate)
        store.save(record(), now: referenceDate)

        #expect(try #require(store.loadWidgetSnapshot()).houseLine == "Living Room")
    }

    @Test("noteHouseLine keeps the rows already written")
    func noteHouseLineKeepsTheRows() throws {
        let store = fallbackStore()
        store.save(record(), now: referenceDate)
        store.noteHouseLine("Kitchen", now: referenceDate)

        let snapshot = try #require(store.loadWidgetSnapshot())
        #expect(snapshot.houseLine == "Kitchen")
        #expect(snapshot.movedRows.count == 2)
    }

    // MARK: - The reload

    @Test("every write asks the one widget kind to redraw")
    func everyWriteReloads() throws {
        let reloads = ReloadCounter()
        let store = fallbackStore(reloads: reloads)

        store.save(record(), now: referenceDate)
        #expect(reloads.count == 1)
        #expect(reloads.last == "PatinaHouseWidget")

        store.noteHouseLine("Living Room", now: referenceDate)
        #expect(reloads.count == 2)
    }

    @Test("noteHouseLine with nothing new does not churn the widget")
    func anUnchangedHouseLineDoesNotReload() throws {
        let reloads = ReloadCounter()
        let store = fallbackStore(reloads: reloads)
        store.noteHouseLine("Living Room", now: referenceDate)
        store.noteHouseLine("Living Room", now: referenceDate)

        #expect(reloads.count == 1)
    }

    /// The whole reason the payload carries no owner id: sign-out deletes it.
    /// `LocalStoreReset` and the foreign-record discard both go through
    /// `remove()`, so this is the single path that has to be right.
    @Test("removing the record takes the widget's file with it, and redraws")
    func removeClearsTheWidgetAndReloads() throws {
        let reloads = ReloadCounter()
        let store = fallbackStore(reloads: reloads)
        store.save(record(), houseLine: "Living Room", now: referenceDate)

        store.remove()

        #expect(store.loadWidgetSnapshot() == nil)
        #expect(store.load() == nil)
        #expect(reloads.count == 2)
        #expect(reloads.last == "PatinaHouseWidget")
    }
}
