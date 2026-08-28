//
//  HouseRecordStoreTests.swift
//  PatinaTests
//
//  The two stores the Record stands on: the last-visit mark that decides what
//  is "new", and the snapshot that lets Today paint before any fetch lands.
//

import Foundation
import Testing
@testable import Patina

struct LastSeenStoreTests {

    private func freshDefaults() throws -> UserDefaults {
        let suite = "patina.tests.lastseen.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    @Test("before the first open there is no last visit, so nothing can be new")
    func lastSeenIsNilBeforeTheFirstOpen() throws {
        let store = LastSeenStore(defaults: try freshDefaults())
        #expect(store.lastSeenAt == nil)
    }

    @Test("markSeen writes the one canonical key")
    func markSeenWritesTheCanonicalKey() throws {
        let defaults = try freshDefaults()
        let store = LastSeenStore(defaults: defaults)
        let moment = Date(timeIntervalSince1970: 1_787_000_000)

        store.markSeen(now: moment)

        let readBack = try #require(store.lastSeenAt)
        #expect(abs(readBack.timeIntervalSince(moment)) < 1)
        // The widget and a later device read the same key; it is a contract.
        #expect(defaults.object(forKey: "patina.house.lastSeenAt") != nil)
    }

    @Test("a later mark replaces the earlier one")
    func markSeenMovesForward() throws {
        let store = LastSeenStore(defaults: try freshDefaults())
        let first = Date(timeIntervalSince1970: 1_787_000_000)
        store.markSeen(now: first)
        store.markSeen(now: first.addingTimeInterval(3600))

        let readBack = try #require(store.lastSeenAt)
        #expect(readBack > first)
    }

    @Test("the last visit is written where the widget can read it")
    func markSeenWritesIntoTheAppGroupSuite() throws {
        // `UserDefaults.standard` is the app's own domain and no extension can
        // read it. W6's widget reads the group suite; the app must write there.
        let suite = try #require(UserDefaults(suiteName: LastSeenStore.appGroupIdentifier))
        let previous = suite.object(forKey: LastSeenStore.key)
        defer {
            if let previous {
                suite.set(previous, forKey: LastSeenStore.key)
            } else {
                suite.removeObject(forKey: LastSeenStore.key)
            }
        }

        let store = LastSeenStore()
        #expect(store.usesAppGroupDefaults)
        #expect(LastSeenStore.appGroupIdentifier == "group.cloud.patina.app")

        let moment = Date(timeIntervalSince1970: 1_787_000_123)
        store.markSeen(now: moment)

        let raw = try #require(suite.object(forKey: LastSeenStore.key) as? Double)
        #expect(abs(raw - moment.timeIntervalSince1970) < 1)
    }

    @Test("the snapshot and the last visit share one container")
    func bothStoresNameTheSameAppGroup() {
        #expect(LastSeenStore.appGroupIdentifier == "group.cloud.patina.app")
    }

    /// M16 / steward §9.4: the snapshot store is specified as an App Group
    /// container, and the entitlement lands in THIS wave, not W6.
    @Test("the entitlement carries the App Group the snapshot store asks for")
    func theEntitlementCarriesTheAppGroup() throws {
        let entitlements = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // Patina (project dir)
            .appendingPathComponent("Patina/Patina.entitlements")
        let source = try String(contentsOf: entitlements, encoding: .utf8)

        #expect(source.contains("com.apple.security.application-groups"))
        #expect(source.contains("group.cloud.patina.app"))
        // The three that were already there must survive the edit.
        #expect(source.contains("aps-environment"))
        #expect(source.contains("com.apple.developer.associated-domains"))
        #expect(source.contains("com.apple.developer.applesignin"))
    }
}

struct RecordSnapshotStoreTests {

    private let referenceDate = Date(timeIntervalSince1970: 1_787_000_000)

    /// A store that is guaranteed to miss the App Group and take the fallback,
    /// which is also what the Simulator does without provisioning (§9.4).
    /// The fallback directory is a fresh temp dir so the suites cannot see
    /// each other's snapshots.
    private func fallbackStore() throws -> RecordSnapshotStore {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("patina.tests.record.\(UUID().uuidString)")
        return RecordSnapshotStore(
            appGroupIdentifier: "group.does.not.exist.\(UUID().uuidString)",
            fallbackDirectory: directory
        )
    }

    private func sampleRecord() -> HouseRecord {
        HouseRecord(
            needsYou: [
                HouseRecordRow(
                    id: "decision:d1", kind: .decisionAsked,
                    title: "Leah Hartwell asked you to choose.",
                    detail: "Rug color — Natural vs Sand", date: referenceDate,
                    state: .overdue, isNew: false,
                    route: .decisionDetail(decisionId: "d1")
                ),
                HouseRecordRow(
                    id: "invoice:i1", kind: .invoiceDue,
                    title: "Your invoice is due.", detail: "INV-2026-0142",
                    date: referenceDate, state: .amount(cents: 425_000, due: referenceDate),
                    isNew: true, route: .invoiceDetail(invoiceId: "i1")
                )
            ],
            moved: [
                HouseRecordRow(
                    id: "story:s1", kind: .story,
                    title: "A new story from the workshop.",
                    detail: "The Grain Whisperer of Maine", date: referenceDate,
                    state: .none, isNew: true, route: nil
                )
            ],
            window: DateInterval(start: referenceDate.addingTimeInterval(-604_800),
                                 end: referenceDate),
            lastSeenAt: referenceDate.addingTimeInterval(-86_400),
            hasMoreNeedsYou: true, hasMoreMoved: false
        )
    }

    @Test("a saved record loads back identical")
    func aSavedRecordLoadsBackIdentical() throws {
        let store = try fallbackStore()
        let record = sampleRecord()

        store.save(record)

        #expect(try #require(store.load()) == record)
    }

    @Test("loading before anything is saved is nil, not an empty record")
    func loadingBeforeAnythingIsSavedIsNil() throws {
        #expect(try fallbackStore().load() == nil)
    }

    /// M16 / steward §9.4. On the Simulator the group container URL can be nil
    /// even for a real group; the store must fall back and say so, not crash
    /// and not silently no-op.
    @Test("an unreachable App Group falls back to the app container and still works")
    func anUnknownAppGroupFallsBackToTheAppContainer() throws {
        let store = try fallbackStore()
        #expect(store.usesAppGroupContainer == false)

        store.save(sampleRecord())

        #expect(try #require(store.load()).needsYou.count == 2)
    }

    @Test("a corrupt snapshot loads as nil rather than throwing at launch")
    func aCorruptSnapshotLoadsAsNil() throws {
        let store = try fallbackStore()
        store.save(sampleRecord())

        try Data("not json".utf8).write(to: store.fileURL)

        #expect(store.load() == nil)
    }

    @Test("saving twice keeps the newer record")
    func savingTwiceKeepsTheNewerRecord() throws {
        let store = try fallbackStore()
        store.save(sampleRecord())
        store.save(HouseRecord.empty)

        #expect(try #require(store.load()).isEmpty)
    }
}
