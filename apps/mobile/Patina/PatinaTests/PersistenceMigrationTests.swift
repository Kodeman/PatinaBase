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
        let names = PatinaSchemaCurrent.models.map { String(describing: $0) }
        #expect(names.contains("BoardModel"))
    }

    /// The eight the container shipped with, plus boards. A model dropped
    /// from this list is a fetch that throws at runtime on a screen.
    @Test
    func versionedSchemaCarriesEveryPersistedModel() {
        let names = Set(PatinaSchemaCurrent.models.map { String(describing: $0) })
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
        let schema = PatinaSchemaCurrent.schema
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
    ///
    /// W1A-10: the cached shared direction is deleted inside
    /// `SharedDirectionStore.wipe()`, which `LocalStoreReset` calls first —
    /// generations and cancellation have to precede its delete (§C.5.2).
    @Test
    func theWipeNamesEveryModelInTheSchema() throws {
        let source = try SourcePin.read("Patina/Core/Persistence/LocalStoreReset.swift")
            + SourcePin.read("Patina/Core/Persistence/SharedDirectionStore.swift")
        #expect(source.contains("SharedDirectionStore.shared.wipe()"))
        for model in PatinaSchemaCurrent.models {
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

    // MARK: - W1A-10: V2 adds the cached shared direction, lightweight

    @Test
    func v2IsTheLatestSchemaAndCarriesEveryV1Model() throws {
        #expect(PatinaMigrationPlan.schemas.map { $0.versionIdentifier }
            == [PatinaSchemaV1.versionIdentifier, PatinaSchemaV2.versionIdentifier])
        #expect(PatinaMigrationPlan.stages.count == 1)
        let v1 = Set(PatinaSchemaV1.models.map { String(describing: $0) })
        let v2 = Set(PatinaSchemaV2.models.map { String(describing: $0) })
        #expect(v2 == v1.union(["CachedDirectionEdition"]))
        let source = try SourcePin.read("Patina/Core/Persistence/PersistenceController.swift")
        #expect(source.contains("PatinaSchemaCurrent.schema"))
    }

    /// A tester's store from the build before this one: written under the
    /// frozen V1, opened by the app's own open path over the live classes.
    /// Its rows survive, nothing is set aside, and the new table is usable —
    /// no flag, no wipe.
    @Test
    func aV1StoreOpensUnderV2AndKeepsItsRows() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory
            .appendingPathComponent("PersistenceMigrationTests-v1-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }
        let storeURL = dir.appendingPathComponent("v1.store")

        do {
            let v1 = Schema(versionedSchema: PatinaSchemaV1.self)
            let container = try ModelContainer(
                for: v1, configurations: [ModelConfiguration(schema: v1, url: storeURL)]
            )
            let context = ModelContext(container)
            context.insert(PatinaSchemaV1.BoardModel(name: "Living room"))
            try context.save()
        }

        let schema = PatinaSchemaCurrent.schema
        let opened = PersistenceController.open(
            schema: schema, configuration: ModelConfiguration(schema: schema, url: storeURL)
        )
        #expect(opened.recovery == nil)
        #expect(try fm.contentsOfDirectory(atPath: dir.path).contains { $0.hasPrefix("RecoveredStore-") } == false)
        let context = ModelContext(opened.container)
        #expect(try context.fetch(FetchDescriptor<BoardModel>()).map(\.name) == ["Living room"])

        context.insert(CachedDirectionEdition(
            accountId: "a", decisionId: "d", projectId: "p", authorityRevision: 1,
            artifactChecksum: "c", reviewJSON: Data("{}".utf8), attachmentsJSON: nil,
            editionFiguresJSON: nil, servedAt: Date(), manifestKey: nil
        ))
        try context.save()
        #expect(try context.fetch(FetchDescriptor<CachedDirectionEdition>()).count == 1)
    }

    @Test
    func theContainerIsBuiltWithThePlanAndNeverTraps() throws {
        let source = try SourcePin.read("Patina/Core/Persistence/PersistenceController.swift")
        #expect(source.contains("migrationPlan: PatinaMigrationPlan.self"))
        // The old line, verbatim, must not come back.
        #expect(source.contains("fatalError(\"Failed to create ModelContainer") == false)
        // `previewContainer` is DEBUG-only scaffolding and keeps its trap; the
        // shipping path is the one under test, and it is the `open` function.
        let openBody = source.components(separatedBy: "static func open(").last ?? ""
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
        let schema = PatinaSchemaCurrent.schema
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

    /// Building a `RoomStore` must not build the app's on-disk store.
    ///
    /// `RoomStore.init` resolved its ownership gate by comparing against
    /// `PersistenceController.shared.container.mainContext`, which opens the
    /// real store on the main actor inside the test process. Every suite that
    /// builds a store paid for it, and `OrderHandoffTests.waitFor`'s 3 s
    /// main-actor budget started losing the race (review RL1B-01/RL1B-21).
    @Test
    func aStoreOnItsOwnContextNeverTouchesTheSingleton() throws {
        let source = try SourcePin.read("Patina/Core/Persistence/RoomStore.swift")
        #expect(source.contains("PersistenceController.shared") == false)
    }

    /// The fact the gate needs, answered without opening anything: a context
    /// nobody registered as the shared one is not the shared one.
    @Test
    func anUnregisteredContextIsNotTheSharedStore() throws {
        let container = try ModelContainer(
            for: PatinaSchemaCurrent.schema,
            configurations: [ModelConfiguration(isStoredInMemoryOnly: true)]
        )
        #expect(PersistenceController.isSharedContext(ModelContext(container)) == false)
    }
}
