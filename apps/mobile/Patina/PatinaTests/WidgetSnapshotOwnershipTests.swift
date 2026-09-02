//
//  WidgetSnapshotOwnershipTests.swift
//  PatinaTests
//
//  B-16 — the App Group container is device-global and outlives a session.
//  `AuthService.signOut()` calls `applySession(nil)` and nothing else;
//  `LocalStoreReset.wipeUserScopedData()` — the only caller of
//  `RecordSnapshotStore.remove()` — fires when a DIFFERENT account signs in,
//  never on sign-out. So a phone that signed out kept `widget-snapshot.json`
//  naming the previous client's designer, and the payload carried nothing to
//  say whose it was.
//
//  Two halves, both pinned here: the snapshot names its account, and sign-out
//  replaces it with a placeholder rather than leaving it to be read.
//

import Foundation
import Testing
@testable import Patina

struct WidgetSnapshotOwnershipTests {

    private let referenceDate = Date(timeIntervalSince1970: 1_787_000_000)
    private static let owner = "a0000000-0000-0000-0000-000000000005"

    final class ReloadCounter: @unchecked Sendable {
        private let lock = NSLock()
        private var kinds: [String] = []

        func record(_ kind: String) {
            lock.lock(); kinds.append(kind); lock.unlock()
        }

        var count: Int {
            lock.lock(); defer { lock.unlock() }; return kinds.count
        }

        var last: String? {
            lock.lock(); defer { lock.unlock() }; return kinds.last
        }
    }

    private func store(
        reloads: ReloadCounter,
        ownerId: String? = WidgetSnapshotOwnershipTests.owner
    ) -> RecordSnapshotStore {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("patina.tests.owner.\(UUID().uuidString)")
        return RecordSnapshotStore(
            appGroupIdentifier: "group.does.not.exist.\(UUID().uuidString)",
            fallbackDirectory: directory,
            reloadWidgets: { reloads.record($0) },
            flagIsOn: { true },
            ownerId: { ownerId }
        )
    }

    private func record() -> HouseRecord {
        HouseRecord(
            needsYou: [],
            moved: [
                HouseRecordRow(
                    id: "message:m1", kind: .messageReceived,
                    title: "Leah Hartwell picked up your request.", detail: nil,
                    date: referenceDate, state: .none, isNew: true,
                    route: .threadDetail(threadId: "t1")
                )
            ],
            window: DateInterval(start: referenceDate.addingTimeInterval(-604_800), end: referenceDate),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    // MARK: - The account identifier

    @Test("a saved snapshot names the account it was built for")
    func theSnapshotCarriesItsOwner() throws {
        let reloads = ReloadCounter()
        let store = store(reloads: reloads)
        store.save(record(), houseLine: "Aspen Loft", now: referenceDate)

        let snapshot = try #require(store.loadWidgetSnapshot())
        #expect(snapshot.ownerId == Self.owner)
    }

    /// The widget's own decoder has to be able to read it, or the field is a
    /// note to nobody.
    @Test("the widget's decoder reads the owner the app wrote")
    func theWidgetReadsTheOwner() throws {
        let reloads = ReloadCounter()
        let store = store(reloads: reloads)
        store.save(record(), houseLine: nil, now: referenceDate)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let payload = try decoder.decode(
            HouseWidgetPayload.self, from: Data(contentsOf: store.widgetFileURL)
        )
        #expect(payload.ownerId == Self.owner)
        #expect(!payload.isPlaceholder)
    }

    // MARK: - Sign-out

    @Test("sign-out replaces the widget file with a placeholder and reloads")
    func signOutReplacesTheSnapshot() throws {
        let reloads = ReloadCounter()
        let store = store(reloads: reloads)
        store.save(record(), houseLine: "Aspen Loft", now: referenceDate)
        let afterSave = reloads.count

        store.clearForSignedOut(now: referenceDate.addingTimeInterval(60))

        // The record itself is gone; the widget's file is REPLACED, not left
        // to a delete that may not have landed.
        #expect(store.load() == nil)
        #expect(!store.hasSnapshot)
        let placeholder = try #require(store.loadWidgetSnapshot())
        #expect(placeholder.ownerId == nil)
        #expect(placeholder.movedRows.isEmpty)
        #expect(placeholder.houseLine == nil)
        #expect(placeholder.sinceDate == nil)

        #expect(reloads.count == afterSave + 1)
        #expect(reloads.last == WidgetSnapshot.widgetKind)
    }

    @Test("the widget draws the placeholder as no-data, never a stale row")
    func theWidgetReadsThePlaceholderAsNoData() throws {
        let reloads = ReloadCounter()
        let store = store(reloads: reloads)
        store.save(record(), houseLine: "Aspen Loft", now: referenceDate)
        store.clearForSignedOut(now: referenceDate)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let payload = try decoder.decode(
            HouseWidgetPayload.self, from: Data(contentsOf: store.widgetFileURL)
        )
        #expect(payload.isPlaceholder)
        #expect(payload.drawableRows.isEmpty)
    }

    @Test("the last account's house line does not survive the sign-out")
    func theHouseLineIsDroppedToo() throws {
        let reloads = ReloadCounter()
        let store = store(reloads: reloads)
        store.save(record(), houseLine: "Aspen Loft", now: referenceDate)
        store.clearForSignedOut(now: referenceDate)

        // A save for the NEXT account must not carry the previous room name
        // forward through `notedHouseLine`.
        store.save(record(), houseLine: nil, now: referenceDate)
        let snapshot = try #require(store.loadWidgetSnapshot())
        #expect(snapshot.houseLine == nil)
    }

    // MARK: - The coordinator's seam

    @MainActor
    @Test("the sign-out transition is the seam that clears it")
    func theCoordinatorClearsOnSignOut() throws {
        let source = try SourcePin.read("Patina/App/Coordinators/AppCoordinator.swift")
        let code = SourceScan.code(in: source)
        #expect(code.contains("RecordSnapshotStore.shared.clearForSignedOut()"))
    }
}
