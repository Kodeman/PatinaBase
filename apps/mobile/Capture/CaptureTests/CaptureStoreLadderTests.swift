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

        let older = Schema([Specimen.self, CapturePhoto.self,
                            CaptureMeasurement.self, CaptureProjectRef.self])
        let legacy = try ModelContainer(for: older, configurations: [ModelConfiguration(url: url)])
        legacy.mainContext.insert(Specimen())
        try legacy.mainContext.save()

        let migrated = try ModelContainer(for: CaptureStore.schema,
                                          configurations: [ModelConfiguration(url: url)])
        #expect(try migrated.mainContext.fetch(FetchDescriptor<Specimen>()).count == 1)
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

    // MARK: the reset-once path

    @Test func resetsAnUnopenableStoreOnceAndComesBackEmpty() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("broken.store")
        try Data("this is not a SQLite file".utf8).write(to: url)

        let outcome = CaptureStore.openRung(ModelConfiguration(url: url), named: "test")

        #expect(outcome.didReset)
        #expect(outcome.failures.count == 1)          // the pre-reset failure only
        let container = try #require(outcome.container)
        #expect(try container.mainContext.fetch(FetchDescriptor<Specimen>()).isEmpty)
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

    @Test func removingStoreFilesTakesTheWholeSqliteTrio() throws {
        let directory = Self.scratchDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("x.store")
        for path in [url.path, url.path + "-wal", url.path + "-shm"] {
            FileManager.default.createFile(atPath: path, contents: Data("x".utf8))
        }

        #expect(CaptureStore.removeStoreFiles(at: url))

        for path in [url.path, url.path + "-wal", url.path + "-shm"] {
            #expect(FileManager.default.fileExists(atPath: path) == false)
        }
    }

    @Test func removingStoreFilesReportsFalseWhenThereWasNothingToRemove() {
        let url = Self.scratchDirectory().appendingPathComponent("absent.store")
        #expect(CaptureStore.removeStoreFiles(at: url) == false)
    }

    // MARK: rung 2 must be a different file from rung 1

    @Test func applicationSupportRungIsNotTheAppGroupStore() {
        let appGroupStore = ModelConfiguration(
            groupContainer: .identifier(CaptureStore.appGroupID)).url
        #expect(CaptureStore.applicationSupportStoreURL() != appGroupStore)
        #expect(CaptureStore.applicationSupportStoreURL().path
            .contains("/Containers/Shared/AppGroup/") == false)
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
