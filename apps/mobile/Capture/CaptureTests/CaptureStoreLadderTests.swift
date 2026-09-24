//  CaptureStoreLadderTests.swift
//  CaptureTests
//
//  The store-open ladder, and the schema invariant that keeps rung 1 openable.
//
//  Shipped defect (2026-08-24, Kody's iPhone): a build installed over a
//  29-July one ran ~8 captures against an in-memory store. Rung 1 threw
//  NSCocoaErrorDomain 134110 "Cannot migrate store in-place: Validation error
//  missing attribute values on mandatory destination attribute"
//  (entity=ScanUploadRecord, attribute=retryCount) because that column had no
//  default; rung 2 threw the SAME error against the SAME file, because
//  `ModelConfiguration()` defaults `groupContainer: .automatic` and resolved
//  right back into the App Group. Rung 3 then took the app in memory quietly.

import CoreData
import Foundation
import SwiftData
import Testing
@testable import CaptureKit

@MainActor
struct CaptureStoreLadderTests {

    // MARK: helpers

    private static func scratchDirectory() -> URL {
        URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("capture-store-ladder-\(UUID().uuidString)",
                                    isDirectory: true)
    }

    // MARK: the schema invariant that makes lightweight migration possible

    @Test func everyMandatoryAttributeCarriesADefault() {
        var offenders: [String] = []
        for entity in CaptureStore.schema.entities {
            for attribute in entity.attributes
            where !attribute.isOptional && attribute.defaultValue == nil {
                offenders.append("\(entity.name).\(attribute.name)")
            }
        }
        #expect(offenders.sorted() == [], """
            These mandatory attributes have no default, so any store written \
            before the column existed fails to migrate and takes the whole \
            container open down with it: \(offenders.sorted())
            """)
    }

    // MARK: (a) an older store opens under the current schema

    // The property-level case — a mandatory column added to an existing entity
    // — is guarded by `everyMandatoryAttributeCarriesADefault` above rather
    // than by a fixture here. Two @Model types with the same SwiftData entity
    // name (nesting does not qualify it) are the only way to express two
    // versions of one table in a single build, and SwiftData resolves entities
    // by name process-wide: whichever version opens a container first wins for
    // the rest of the run, so such a pair passes or fails on test ORDER, not on
    // the schema. Verified out-of-band instead, against the real schema: a
    // store written by a build whose ScanUploadRecord had no `retryCount`
    // column throws NSCocoaErrorDomain 134110 before this fix and migrates in
    // place after it, keeping its row (retryCount = 0).

    @Test func opensAStoreWrittenBeforeAnEntityExisted() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("legacy.store")

        // Bare, with no plan, on purpose: this is what a build before the plan
        // existed wrote, with that build's Specimen. The reopen below goes
        // through the plan, as launch does, and the capture must come out the
        // other side as a Piece.
        let older = Schema([CaptureSchemaV1.Specimen.self, CaptureSchemaV1.CapturePhoto.self,
                            CaptureSchemaV1.CaptureMeasurement.self, CaptureProjectRef.self])
        let legacy = try ModelContainer(for: older, configurations: [ModelConfiguration(url: url)])
        let written = CaptureSchemaV1.Specimen()
        legacy.mainContext.insert(written)
        try legacy.mainContext.save()

        let migrated = try CaptureStore.makeContainer(configuration: ModelConfiguration(url: url))
        #expect(try migrated.mainContext.fetch(FetchDescriptor<Piece>()).map(\.id) == [written.id])
    }

    // MARK: (b) a rung creates its own directory

    @Test func aRungCreatesItsParentDirectoryBeforeOpening() throws {
        let directory = Self.scratchDirectory().appendingPathComponent("nested", isDirectory: true)
        defer { try? FileManager.default.removeItem(
            at: directory.deletingLastPathComponent()) }
        let url = directory.appendingPathComponent("fresh.store")
        #expect(FileManager.default.fileExists(atPath: directory.path) == false)

        let outcome = CaptureStore.openRung(ModelConfiguration(url: url), named: "test")

        #expect(outcome.container != nil)
        #expect(outcome.didReset == false)
        #expect(outcome.failures.isEmpty)
        #expect(FileManager.default.fileExists(atPath: directory.path))
    }

    // MARK: the reset-once path: moved into a dated recovery folder, never deleted

    @Test func resetsAnUnopenableStoreOnceAndComesBackEmpty() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("broken.store")
        let bytes = Data("this is not a SQLite file".utf8)
        try bytes.write(to: url)

        let outcome = CaptureStore.openRung(ModelConfiguration(url: url), named: "test")

        #expect(outcome.didReset)
        #expect(outcome.failures.count == 1)          // the pre-reset failure only
        let container = try #require(outcome.container)
        #expect(try container.mainContext.fetch(FetchDescriptor<Piece>()).isEmpty)
        let folder = try #require(CaptureStore.preservedStores(beside: url).first)
        #expect(try Data(contentsOf: folder.appendingPathComponent("broken.store")) == bytes)
    }

    /// The tester-data guarantee (SQ-197). A real store holding an unsynced
    /// hour, made unopenable the way a schema this build does not know makes
    /// it: its metadata says its Piece table is one no version has declared.
    /// The ladder moves it, whole, into a recovery folder, says so in the
    /// report, and opens a fresh store on disk; the moved store still holds the
    /// hour.
    @Test func anUnopenableStoreHoldingUnsyncedWorkIsMovedAsideNotDeleted() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("default.store")
        let entryID = UUID()
        do {
            let writer = try CaptureStore.makeContainer(configuration: ModelConfiguration(url: url))
            writer.mainContext.insert(TimeEntryOutboxRecord(
                entryID: entryID, projectID: UUID().uuidString,
                ownerUserID: UUID().uuidString, startedAt: Date(), durationMinutes: 45,
                activity: .travel, billable: true, notes: "not yet sent", rateRole: nil))
            try writer.mainContext.save()
        }
        let written = try NSPersistentStoreCoordinator.metadataForPersistentStore(
            type: .sqlite, at: url)
        var hashes = try #require(written[NSStoreModelVersionHashesKey] as? [String: Any])
        #expect(hashes["Piece"] != nil)
        hashes["Piece"] = Data(repeating: 7, count: 32)
        var unknown = written
        unknown[NSStoreModelVersionHashesKey] = hashes
        try NSPersistentStoreCoordinator.setMetadata(unknown, type: .sqlite, at: url)

        let rung = CaptureStore.DiskRung(name: "test", persistence: .applicationSupport,
                                         configuration: ModelConfiguration(url: url))
        let store = CaptureStore.walk([rung]) { rung in
            CaptureStore.openRung(rung.configuration, named: rung.name)
        }

        // Surfaced, and still persisting: not silently empty, not in memory.
        #expect(store.openReport.didResetIncompatibleStore)
        #expect(store.openReport.persistence == .applicationSupport)
        #expect(store.openReport.preservedStores.count == 1)
        let folder = try #require(store.openReport.preservedStores.first)
        #expect(folder.deletingLastPathComponent() == CaptureStore.recoveryDirectory(beside: url))
        #expect(store.timeEntryOutbox().isEmpty)

        // Moved, not deleted: undo the tamper on the moved copy and the hour is there.
        let moved = folder.appendingPathComponent("default.store")
        try NSPersistentStoreCoordinator.setMetadata(written, type: .sqlite, at: moved)
        let recovered = try CaptureStore.makeContainer(configuration: ModelConfiguration(url: moved))
        let hours = try recovered.mainContext.fetch(FetchDescriptor<TimeEntryOutboxRecord>())
        #expect(hours.map(\.entryID) == [entryID])
        #expect(hours.first?.stateRaw == "pending")
    }

    @Test func aFirstOpenNeverClaimsAReset() throws {
        let directory = Self.scratchDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let outcome = CaptureStore.openRung(
            ModelConfiguration(url: directory.appendingPathComponent("fresh.store")),
            named: "test")
        #expect(outcome.didReset == false)
        #expect(outcome.failures.isEmpty)
    }

    @Test func settingStoreFilesAsideTakesTheWholeSqliteTrio() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("x.store")
        let names = ["x.store", "x.store-wal", "x.store-shm"]
        for name in names {
            FileManager.default.createFile(atPath: directory.appendingPathComponent(name).path,
                                           contents: Data(name.utf8))
        }

        let folder = try #require(CaptureStore.setStoreFilesAside(at: url))

        #expect(folder.deletingLastPathComponent() == CaptureStore.recoveryDirectory(beside: url))
        for name in names {
            #expect(FileManager.default.fileExists(
                atPath: directory.appendingPathComponent(name).path) == false)
            #expect(try Data(contentsOf: folder.appendingPathComponent(name)) == Data(name.utf8))
        }
    }

    @Test func settingStoreFilesAsideReportsNothingWhenThereWasNothingToSetAside() {
        let url = Self.scratchDirectory().appendingPathComponent("absent.store")
        #expect(CaptureStore.setStoreFilesAside(at: url) == nil)
        #expect(FileManager.default.fileExists(
            atPath: CaptureStore.recoveryDirectory(beside: url).path) == false)
    }

    @Test func aSecondSetAsideNeverOverwritesTheFirst() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("x.store")
        let sameSecond = Date(timeIntervalSince1970: 1_790_000_000)

        try Data("first".utf8).write(to: url)
        let first = try #require(CaptureStore.setStoreFilesAside(at: url, now: sameSecond))
        try Data("second".utf8).write(to: url)
        let second = try #require(CaptureStore.setStoreFilesAside(at: url, now: sameSecond))

        #expect(first.lastPathComponent == "20260921T141320Z")
        #expect(second.lastPathComponent == "20260921T141320Z-2")
        #expect(try Data(contentsOf: first.appendingPathComponent("x.store")) == Data("first".utf8))
        #expect(try Data(contentsOf: second.appendingPathComponent("x.store"))
            == Data("second".utf8))
        #expect(CaptureStore.preservedStores(beside: url) == [first, second])
    }

    // MARK: a locked device is not an incompatible store

    // iOS relaunches Field in the background for the site-scan upload session
    // (`sessionSendsLaunchEvents`), and `CaptureApp` builds `AppContainer` — and
    // so runs this ladder — as a stored property. After a reboot but before the
    // first unlock, a perfectly good store simply cannot be decrypted and throws
    // the SAME opaque error as an incompatible one. Resetting there would delete
    // the designer's captures with no UI on screen to say so.
    @Test func aLockedStoreIsLeftAloneAndReportedDeferred() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("locked.store")
        let bytes = Data("this is not a SQLite file".utf8)
        try bytes.write(to: url)

        let outcome = CaptureStore.openRung(ModelConfiguration(url: url), named: "test",
                                            isProtectedDataAvailable: { false })

        #expect(outcome.container == nil)
        #expect(outcome.didReset == false)
        #expect(outcome.deferredUntilUnlock)
        #expect(try Data(contentsOf: url) == bytes)          // untouched, byte for byte
        #expect(FileManager.default.fileExists(
            atPath: CaptureStore.recoveryDirectory(beside: url).path) == false)
    }

    /// The old reset deleted the set-aside store on the next clean open, which
    /// is the very next launch. Nothing deletes it now, and every later launch
    /// still reports it.
    @Test func aSetAsideStoreSurvivesEveryLaterOpenAndIsStillReported() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("broken.store")
        let bytes = Data("this is not a SQLite file".utf8)
        try bytes.write(to: url)

        let reset = CaptureStore.openRung(ModelConfiguration(url: url), named: "test")
        #expect(reset.didReset)
        #expect(reset.container != nil)
        let folder = try #require(CaptureStore.preservedStores(beside: url).first)

        let rung = CaptureStore.DiskRung(name: "test", persistence: .applicationSupport,
                                         configuration: ModelConfiguration(url: url))
        let later = CaptureStore.walk([rung]) { rung in
            CaptureStore.openRung(rung.configuration, named: rung.name)
        }
        #expect(later.openReport.didResetIncompatibleStore == false)
        #expect(later.openReport.failures.isEmpty)
        #expect(later.openReport.preservedStores == [folder])
        #expect(try Data(contentsOf: folder.appendingPathComponent("broken.store")) == bytes)
    }

    // MARK: every reset reaches the report, whichever rung answers

    @Test func aResetOnAnEarlierRungIsReportedWhenALaterRungAnswers() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let rungs = [
            CaptureStore.DiskRung(
                name: "first", persistence: .appGroup,
                configuration: ModelConfiguration(
                    url: directory.appendingPathComponent("first.store"))),
            CaptureStore.DiskRung(
                name: "second", persistence: .applicationSupport,
                configuration: ModelConfiguration(
                    url: directory.appendingPathComponent("second.store")))
        ]

        // Rung 1 set its store aside and STILL failed; rung 2 answers.
        let store = CaptureStore.walk(rungs) { rung in
            rung.name == "first"
                ? CaptureStore.RungOutcome(container: nil,
                                           failures: ["first: broken", "first after reset: broken"],
                                           didReset: true,
                                           deferredUntilUnlock: false)
                : CaptureStore.openRung(rung.configuration, named: rung.name)
        }

        #expect(store.openReport.persistence == .applicationSupport)
        #expect(store.openReport.didResetIncompatibleStore)   // NOT rung 2's false
        #expect(store.openReport.failures.count == 2)
    }

    @Test func aResetOnAnEarlierRungIsReportedWhenTheRunEndsInMemory() {
        let rungs = [CaptureStore.DiskRung(
            name: "first", persistence: .appGroup,
            configuration: ModelConfiguration(url: Self.scratchDirectory()
                .appendingPathComponent("first.store")))]

        let store = CaptureStore.walk(rungs) { _ in
            CaptureStore.RungOutcome(container: nil, failures: ["first: broken"],
                                     didReset: true, deferredUntilUnlock: true)
        }

        #expect(store.openReport.persistence == .inMemoryFallback)
        #expect(store.openReport.didResetIncompatibleStore)
        #expect(store.openReport.deferredUntilUnlock)
    }

    // MARK: rung 2 must be a different file from rung 1

    // The shipped bug: rung 2 was `ModelConfiguration()`, whose
    // `groupContainer: .automatic` default resolves straight back into the App
    // Group — so it reopened the very file rung 1 had just failed on. Asserting
    // against `diskRungs`, the single definition `resilient` walks, is what
    // makes reverting rung 2 fail here.
    //
    // The URL alone cannot catch that revert from a test: `.automatic` reads the
    // RUNNING process's `com.apple.security.application-groups` entitlement, and
    // the xctest runner has none — so `ModelConfiguration().url` lands in
    // Application Support here and in the App Group in the signed app, which is
    // precisely the environment gap that let the bug ship. The declaration is
    // the same in both, so that is what this pins: rung 2 asks for NO group
    // container. Both reference values come from SwiftData's own API, so the
    // pair still fails loudly if `GroupContainer` ever stops distinguishing them.
    @Test func theApplicationSupportRungIsNotTheAppGroupStore() throws {
        let rungs = CaptureStore.diskRungs(appGroupID: CaptureStore.appGroupID,
                                           appGroupIsProvisioned: false)
        #expect(rungs.count == 1)   // rung 1 is never even constructed unprovisioned
        let rungTwo = try #require(rungs.first { $0.persistence == .applicationSupport })
        let declaredGroup = String(describing: rungTwo.configuration.groupContainer)

        #expect(declaredGroup == String(describing: ModelConfiguration.GroupContainer.none))
        #expect(declaredGroup != String(describing: ModelConfiguration.GroupContainer.automatic))
        #expect(rungTwo.configuration.url.path.contains("/Containers/Shared/AppGroup/") == false)
        #expect(rungTwo.configuration.url.path.contains("/Library/Application Support/"))
        #expect(rungTwo.configuration.url == CaptureStore.applicationSupportStoreURL())

        // Mirror `resilient`'s own gate: resolving the group container when the
        // entitlement is inert trips SwiftData's assertionFailure, which would
        // take the whole run down instead of failing one test.
        if FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: CaptureStore.appGroupID) != nil {
            #expect(rungTwo.configuration.url != ModelConfiguration(
                groupContainer: .identifier(CaptureStore.appGroupID)).url)
        }
    }

    // MARK: the in-memory rung is never silent

    @Test func onlyTheFallbackRungClaimsLostWork() {
        #expect(CaptureStoreOpenReport(persistence: .inMemoryFallback).losesWorkOnRelaunch)
        #expect(CaptureStoreOpenReport(persistence: .inMemoryByDesign)
            .losesWorkOnRelaunch == false)
        #expect(CaptureStoreOpenReport(persistence: .appGroup).losesWorkOnRelaunch == false)
        #expect(CaptureStoreOpenReport(persistence: .applicationSupport)
            .losesWorkOnRelaunch == false)
    }

    @Test func aMockModeStoreIsInMemoryByDesignAndNotAFailure() {
        let store = CaptureStore.resilient(persistent: false)
        #expect(store.openReport.persistence == .inMemoryByDesign)
        #expect(store.openReport.losesWorkOnRelaunch == false)
        #expect(store.openReport.failures.isEmpty)
    }
}
