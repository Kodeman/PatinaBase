//
//  PersistenceMigrationTests.swift
//  PatinaTests
//
//  C7-01 / C7-02. The container used to be a bare `Schema([...])` with a
//  `fatalError` on the catch and no `SchemaMigrationPlan` — so build 2's
//  first schema change would have met an installed store SwiftData could not
//  open by inference and crash-looped every tester. And `BoardModel` was
//  fetched and inserted against a container whose schema did not name it.
//
//  This is the suite that keeps both from coming back.
//

import Foundation
import SwiftData
import Testing
@testable import Patina

@MainActor
struct PersistenceMigrationTests {

    // MARK: - C7-02: the schema names every model the app actually uses

    @Test
    func versionedSchemaCarriesBoardModel() {
        let names = PatinaSchemaV1.models.map { String(describing: $0) }
        #expect(names.contains("BoardModel"))
    }

    /// The eight the container shipped with, plus boards. A model dropped
    /// from this list is a fetch that throws at runtime on a screen.
    @Test
    func versionedSchemaCarriesEveryPersistedModel() {
        let names = Set(PatinaSchemaV1.models.map { String(describing: $0) })
        let required: Set<String> = [
            "TableItemModel", "RoomModel", "SavedItem", "StylePreferenceModel",
            "SyncQueueItem", "RoomScanPackage", "DesignRequestDraft",
            "SubmittedDesignRequest", "BoardModel"
        ]
        #expect(required.isSubset(of: names))
    }

    /// A `BoardModel` inserted into a container built from the shipped schema
    /// is readable back. Before C7-02 this is the fetch `CollectionsViewModel`
    /// made against a container that had never heard of the type.
    @Test
    func boardsRoundTripThroughTheShippedSchema() throws {
        let schema = Schema(versionedSchema: PatinaSchemaV1.self)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)

        context.insert(BoardModel(name: "Living room"))
        try context.save()

        let boards = try context.fetch(FetchDescriptor<BoardModel>())
        #expect(boards.count == 1)
        #expect(boards.first?.name == "Living room")
    }

    /// `LocalStoreReset` names every model in the schema. A model in the
    /// container and not in the wipe is one account's row surviving into
    /// another account's session.
    @Test
    func theWipeNamesEveryModelInTheSchema() throws {
        let source = try SourcePin.read("Patina/Core/Persistence/LocalStoreReset.swift")
        for model in PatinaSchemaV1.models {
            let name = String(describing: model)
            #expect(
                source.contains("delete(model: \(name).self)"),
                "LocalStoreReset does not wipe \(name)"
            )
        }
    }

    // MARK: - C7-01: a migration plan, and no fatalError on the open

    @Test
    func aMigrationPlanExistsAndNamesEveryVersionedSchema() {
        #expect(PatinaMigrationPlan.schemas.count >= 1)
        let identifiers = PatinaMigrationPlan.schemas.map { $0.versionIdentifier }
        #expect(identifiers.contains(PatinaSchemaV1.versionIdentifier))
        // Every stage must sit between two schemas the plan names, or the
        // plan cannot run it.
        #expect(PatinaMigrationPlan.stages.count == PatinaMigrationPlan.schemas.count - 1)
    }

    @Test
    func theContainerIsBuiltWithThePlanAndNeverTraps() throws {
        let source = try SourcePin.read("Patina/Core/Persistence/PersistenceController.swift")
        #expect(source.contains("migrationPlan: PatinaMigrationPlan.self"))
        // The old line, verbatim, must not come back.
        #expect(source.contains("fatalError(\"Failed to create ModelContainer") == false)
        // `previewContainer` is DEBUG-only scaffolding and keeps its trap; the
        // shipping path is the one under test, and it is the `open` function.
        let openBody = source.components(separatedBy: "private static func open(").last ?? ""
        let shippingPath = openBody.components(separatedBy: "// MARK: - Preview Container").first ?? ""
        #expect(shippingPath.contains("fatalError") == false)
    }

    // MARK: - The recovery path, against a real corrupt store on disk

    /// The fixture the finding is about: a `.store` file that is not a
    /// SQLite database. Opening it must produce a working container, not a
    /// trap, and must leave the unreadable bytes archived rather than deleted.
    @Test
    func aCorruptStoreIsArchivedAndAFreshOneOpens() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
            .appendingPathComponent("PersistenceMigrationTests-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }

        let storeURL = dir.appendingPathComponent("corrupt.store")
        try Data("this is not a sqlite database".utf8).write(to: storeURL)
        try Data("stale wal".utf8).write(to: dir.appendingPathComponent("corrupt.store-wal"))

        let archived = try #require(LocalStoreRecovery.archiveStore(at: storeURL))

        // The bytes moved, they did not vanish, and the sidecar went with them.
        #expect(fm.fileExists(atPath: storeURL.path) == false)
        #expect(fm.fileExists(atPath: archived.appendingPathComponent("corrupt.store").path))
        #expect(fm.fileExists(atPath: archived.appendingPathComponent("corrupt.store-wal").path))

        // And the same URL now opens clean, which is what the app does next.
        let schema = Schema(versionedSchema: PatinaSchemaV1.self)
        let config = ModelConfiguration(schema: schema, url: storeURL)
        let container = try ModelContainer(
            for: schema, migrationPlan: PatinaMigrationPlan.self, configurations: [config]
        )
        let context = ModelContext(container)
        #expect(try context.fetch(FetchDescriptor<RoomModel>()).isEmpty)
    }

    @Test
    func archivingNothingReportsNothing() {
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent("no-such-store-\(UUID().uuidString).store")
        #expect(LocalStoreRecovery.archiveStore(at: missing) == nil)
    }

    @Test
    func theNoticeIsHeldUntilItIsAcknowledged() {
        let recovery = LocalStoreRecovery.shared
        let before = recovery.pending
        defer { if before == nil { recovery.acknowledge() } }

        recovery.record(
            LocalStoreRecoveryRecord(
                archivedAt: URL(fileURLWithPath: "/tmp/RecoveredStore-1"),
                occurredAt: Date()
            )
        )
        #expect(recovery.pending != nil)
        recovery.acknowledge()
        #expect(recovery.pending == nil)
    }

    /// The notice is mounted at the app root, not on a screen a recovered
    /// launch might never reach.
    @Test
    func theNoticeIsMountedAtTheRoot() throws {
        let source = try SourcePin.read("Patina/PatinaApp.swift")
        #expect(source.contains(".localStoreRecoveryNotice()"))
    }
}
