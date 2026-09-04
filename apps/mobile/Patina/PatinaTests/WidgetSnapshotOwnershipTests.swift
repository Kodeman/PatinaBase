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

    /// `clearOwner` defaults to a no-op here on purpose: the production value
    /// clears the real `RecordOwnerStamp`, which is process-global, and this
    /// suite is about the two FILES. The stamp's own half has its own test.
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
            ownerId: { ownerId },
            clearOwner: {}
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
    @Test("the widget’s decoder reads the owner the app wrote")
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

    @Test("the last account’s house line does not survive the sign-out")
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

    // MARK: - The stamp itself (round 2)

    /// `RecordOwnerStamp` is cleared only by `LocalStoreReset`, which runs when
    /// a DIFFERENT account signs IN. So between a sign-out and the next
    /// account's first stamp, the stamp still answered with the PREVIOUS
    /// account's id — and a save in that window wrote it onto the new session's
    /// rows, which is the thing `ownerId` exists to make impossible.
    @Test("signing out retires the owner stamp, not just the files")
    func theOwnerStampIsClearedOnSignOut() {
        let reloads = ReloadCounter()
        let cleared = ReloadCounter()
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("patina.tests.owner.\(UUID().uuidString)")
        let store = RecordSnapshotStore(
            appGroupIdentifier: "group.does.not.exist.\(UUID().uuidString)",
            fallbackDirectory: directory,
            reloadWidgets: { reloads.record($0) },
            flagIsOn: { true },
            ownerId: { Self.owner },
            clearOwner: { cleared.record("stamp") }
        )

        store.save(record(), houseLine: "Aspen Loft", now: referenceDate)
        #expect(cleared.count == 0)

        store.clearForSignedOut(now: referenceDate)

        #expect(cleared.count == 1)
    }

    /// And the production default is the stamp's own `clear()` — not a
    /// look-alike that clears something else.
    @Test("the default clear is the stamp’s own")
    func theDefaultClearIsTheStamps() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Persistence/RecordSnapshotStore.swift")
        )
        #expect(code.contains("clearOwner: @escaping @Sendable () -> Void = { RecordOwnerStamp.shared.clear() }"))
        let signOut = try #require(code.range(of: "func clearForSignedOut("))
        let call = try #require(code.range(of: "clearOwner()"))
        #expect(call.lowerBound > signOut.lowerBound)
    }

    /// The file, decoded the way the widget process decodes it — through
    /// `HouseWidgetPayload`, not through the app's own `WidgetSnapshot`. What
    /// the app wrote and what the widget draws are two types on purpose.
    private func widgetSees(_ store: RecordSnapshotStore) throws -> HouseWidgetPayload {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(
            HouseWidgetPayload.self,
            from: Data(contentsOf: store.widgetFileURL)
        )
    }

    // MARK: - RL1F-21 — the sign-in window

    /// A store whose stamp is empty, exactly as it is for the first save after
    /// a sign-in: `clearForSignedOut` cleared it, and `RecordRefresh` stamps
    /// AFTER it saves. Reproduced on the clone: real rows on disk with
    /// `ownerId` absent, and `save` reloads WidgetKit in the same breath, so
    /// the no-data card is pushed over real content.
    private func unstampedStore(reloads: ReloadCounter, stamped: ReloadCounter) -> RecordSnapshotStore {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("patina.tests.owner.\(UUID().uuidString)")
        return RecordSnapshotStore(
            appGroupIdentifier: "group.does.not.exist.\(UUID().uuidString)",
            fallbackDirectory: directory,
            reloadWidgets: { reloads.record($0) },
            flagIsOn: { true },
            ownerId: { nil },
            clearOwner: {},
            stampOwner: { stamped.record($0) }
        )
    }

    @Test("a save that names its session cannot write an unowned payload")
    func aNamedSaveIsOwned() throws {
        let reloads = ReloadCounter()
        let stamped = ReloadCounter()
        let store = unstampedStore(reloads: reloads, stamped: stamped)

        store.save(record(), houseLine: "Aspen Loft", now: referenceDate, owner: Self.owner)

        let written = try #require(store.loadWidgetSnapshot())
        #expect(written.ownerId == Self.owner)
        let payload = try widgetSees(store)
        #expect(payload.isPlaceholder == false)
        #expect(payload.drawableRows.count == 1)
        // The stamp is written too, so the NEXT save — the one that names
        // nothing — is owned as well.
        #expect(stamped.last == Self.owner)
    }

    @Test("a save that names nothing still defers to the stamp")
    func anUnnamedSaveDefersToTheStamp() throws {
        let reloads = ReloadCounter()
        let stamped = ReloadCounter()
        let store = unstampedStore(reloads: reloads, stamped: stamped)

        store.save(record(), houseLine: "Aspen Loft", now: referenceDate)

        let written = try #require(store.loadWidgetSnapshot())
        #expect(written.ownerId == nil, "an unstamped save for no session stays a placeholder")
        #expect(stamped.count == 0, "naming nothing must not invent an owner")
    }

    /// The caller's half. `RecordRefresh.run` is `Features/Home/**` — L1-C's
    /// glob — so it left as note `L1F→C-3` and the steward applied it at merge
    /// 6, on the integration tip. The known-issue block is deleted, as the
    /// note said it would be the moment the line landed.
    @Test("the record rebuild names the session it saves for")
    func theRebuildNamesItsSession() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/ViewModels/RecordRefresh.swift")
        )
        #expect(code.contains("snapshots.save(record, owner: sessionUserId)"))
    }

    // MARK: - RL1F-24 — what a sign-out actually leaves behind

    /// The real order, which no test drove before: the placeholder is written,
    /// then an in-flight `RecordRefresh` for the ended session decides
    /// `.discard` (the stamp is gone) and `remove()` takes the placeholder with
    /// it. Both states are no-data; the doc comments now say so.
    @Test("a sign-out ends with a placeholder, then with no file at all")
    func aSignOutEndsWithNoFile() throws {
        let reloads = ReloadCounter()
        let store = store(reloads: reloads)

        store.save(record(), houseLine: "Aspen Loft", now: referenceDate)
        #expect(try #require(store.loadWidgetSnapshot()).ownerId == Self.owner)

        store.clearForSignedOut(now: referenceDate)
        let placeholder = try #require(store.loadWidgetSnapshot())
        #expect(placeholder.ownerId == nil)
        #expect(try widgetSees(store).isPlaceholder)

        store.remove()
        #expect(store.loadWidgetSnapshot() == nil, "remove() takes the placeholder too")
        #expect(store.hasSnapshot == false)
    }

    /// And the comments that explain the mechanism name all three callers,
    /// rather than the one the round-2 text claimed.
    @Test("the design comments name every caller of remove()")
    func theCommentsNameEveryCaller() throws {
        let store = try SourcePin.read("Patina/Core/Persistence/RecordSnapshotStore.swift")
        #expect(store.contains("**Three callers**"))
        #expect(!store.contains("`remove()`'s only caller"))

        let snapshot = try SourcePin.read("Patina/Core/Persistence/WidgetSnapshot.swift")
        #expect(!snapshot.contains("remove()`'s only caller"))
        #expect(snapshot.contains("has three callers"))
    }
}
