//  CaptureStore.swift
//  CaptureKit
//
//  Local outbox / CRUD over the SwiftData store. The store lives in the App
//  Group container so the Share and Widget extensions read/write the same DB
//  and the same on-disk media directory.

import CoreData
import Foundation
import SwiftData
import os

public enum CaptureMediaAvailabilityError: LocalizedError, Equatable {
    case missingLocalMedia([String])

    public var errorDescription: String? {
        switch self {
        case .missingLocalMedia(let filenames):
            return "Local media is missing (\(filenames.joined(separator: ", "))). "
                + "Review this capture before retrying."
        }
    }
}

public struct SpecimenQuery: Sendable {
    public var text: String?
    public var category: SpecimenCategory?
    public var destination: CaptureDestination?
    public var venueRoom: String?
    public init(text: String? = nil, category: SpecimenCategory? = nil,
                destination: CaptureDestination? = nil, venueRoom: String? = nil) {
        self.text = text; self.category = category
        self.destination = destination; self.venueRoom = venueRoom
    }
}

/// Where the live store actually landed. Reported so the app can say out loud
/// that it is running without persistence instead of pretending otherwise.
public enum CaptureStorePersistence: String, Sendable {
    case appGroup
    case applicationSupport
    /// Persistence was never asked for: mock mode, previews, unit tests.
    case inMemoryByDesign
    /// Persistence WAS asked for and every on-disk rung refused. Work made in
    /// this run dies with the process.
    case inMemoryFallback
}

/// What the store-open ladder did, carried out of `resilient(persistent:)` so
/// the composition root can emit telemetry and the UI can tell the truth.
public struct CaptureStoreOpenReport: Sendable {
    public let persistence: CaptureStorePersistence
    /// THIS run moved an unreadable store into a dated recovery folder and
    /// started a fresh one in its place. True if ANY rung did so, including one
    /// whose retry then failed.
    public let didResetIncompatibleStore: Bool
    /// A store on disk could not be read because the device has not been
    /// unlocked since boot. Nothing was set aside; the next foreground launch
    /// opens the same store normally.
    public let deferredUntilUnlock: Bool
    /// One localized line per failed rung, in ladder order.
    public let failures: [String]
    /// Every store ever set aside beside any rung's store and still on this
    /// iPhone, oldest first: one dated recovery folder each. Listed on every
    /// launch, not only the one that set it aside, because the app never
    /// deletes one: each holds whatever was unsynced when it was set aside.
    public let preservedStores: [URL]

    public init(persistence: CaptureStorePersistence,
                didResetIncompatibleStore: Bool = false,
                deferredUntilUnlock: Bool = false,
                failures: [String] = [],
                preservedStores: [URL] = []) {
        self.persistence = persistence
        self.didResetIncompatibleStore = didResetIncompatibleStore
        self.deferredUntilUnlock = deferredUntilUnlock
        self.failures = failures
        self.preservedStores = preservedStores
    }

    /// True only when nothing written in this run survives relaunch.
    public var losesWorkOnRelaunch: Bool { persistence == .inMemoryFallback }
}

@MainActor
public final class CaptureStore {
    public nonisolated(unsafe) static let appGroupID = "group.cloud.patina.field"

    /// The newest version in `CaptureMigrationPlan` (CaptureSchema.swift).
    /// Containers are built from the plan, never from this schema alone.
    public static let schema = Schema(versionedSchema: CaptureSchemaV2.self)

    public let container: ModelContainer
    public var context: ModelContext { container.mainContext }
    public let openReport: CaptureStoreOpenReport

    public init(container: ModelContainer,
                openReport: CaptureStoreOpenReport =
                    CaptureStoreOpenReport(persistence: .inMemoryByDesign)) {
        self.container = container
        self.openReport = openReport
    }

    /// App Group container (shared with extensions), or in-memory for tests/previews.
    public static func makeContainer(appGroupID: String = CaptureStore.appGroupID,
                                     inMemory: Bool = false) throws -> ModelContainer {
        let config: ModelConfiguration
        if inMemory {
            config = ModelConfiguration(isStoredInMemoryOnly: true)
        } else {
            config = ModelConfiguration(groupContainer: .identifier(appGroupID))
        }
        return try makeContainer(configuration: config)
    }

    /// The one place a Field `ModelContainer` is built: from the migration
    /// plan, so an installed store crosses a schema change through its stage.
    /// Then it finishes any V1→V2 carry still pending beside the store — the
    /// stage's own open, or a later one after a launch that died mid-carry.
    ///
    /// A store written before the plan existed matches no version in it, and
    /// SwiftData infers no migration into a custom stage, so that open fails.
    /// When the store still holds V1's Specimen table, it is first opened as
    /// V1 alone, which infers its way up to V1 as the V1-only plan did, and
    /// then crosses V1→V2 like any V1 store.
    public static func makeContainer(configuration: ModelConfiguration) throws -> ModelContainer {
        let container: ModelContainer
        do {
            container = try ModelContainer(for: schema, migrationPlan: CaptureMigrationPlan.self,
                                           configurations: [configuration])
        } catch where holdsSpecimenTable(configuration) {
            _ = try ModelContainer(for: Schema(versionedSchema: CaptureSchemaV1.self),
                                   configurations: [configuration])
            container = try ModelContainer(for: schema, migrationPlan: CaptureMigrationPlan.self,
                                           configurations: [configuration])
        }
        PieceMigrationCarry.restorePending(into: container, storeURL: configuration.url)
        return container
    }

    /// The store on disk has V1's Specimen table and not V2's Piece table.
    private static func holdsSpecimenTable(_ configuration: ModelConfiguration) -> Bool {
        guard !configuration.isStoredInMemoryOnly,
              let metadata = try? NSPersistentStoreCoordinator.metadataForPersistentStore(
                type: .sqlite, at: configuration.url),
              let hashes = metadata[NSStoreModelVersionHashesKey] as? [String: Any]
        else { return false }
        return hashes["Specimen"] != nil && hashes["Piece"] == nil
    }

    public static func inMemory() throws -> CaptureStore {
        CaptureStore(container: try makeContainer(inMemory: true))
    }

    private static let log = Logger(subsystem: "cloud.patina.field", category: "store")

    /// Best-effort store that never crashes on a missing container.
    ///
    /// `persistent: true` (real mode) walks the on-disk rungs of `diskRungs`
    /// and only then falls to memory — reported as a degradation, never
    /// silently. `persistent: false` (mock/preview/UITest) goes straight to
    /// in-memory.
    ///
    /// `isProtectedDataAvailable` is the reset's safety catch. iOS relaunches
    /// Field in the background to hand off finished site-scan uploads, so the
    /// ladder can run with no UI on screen and, after a reboot, before the
    /// first unlock — where a perfectly good store is simply undecryptable.
    /// The app passes `UIApplication.shared.isProtectedDataAvailable`;
    /// CaptureKit stays UIKit-free, so it arrives as a closure.
    public static func resilient(
        persistent: Bool = true,
        appGroupID: String = CaptureStore.appGroupID,
        isProtectedDataAvailable: @MainActor () -> Bool = { true }
    ) -> CaptureStore {
        guard persistent else {
            return CaptureStore(container: inMemoryContainer(),
                                openReport: CaptureStoreOpenReport(persistence: .inMemoryByDesign))
        }

        // Rung 1 is offered only when the App Group is actually provisioned: on
        // an unsigned build the entitlement is inert and SwiftData *traps*
        // (assertionFailure) instead of throwing, which a do/catch cannot
        // intercept — so gate on the resolvable container URL first, exactly as
        // `mediaDirectory()` does.
        var seedFailures: [String] = []
        let groupIsProvisioned = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupID) != nil
        if !groupIsProvisioned {
            let message = "App Group '\(appGroupID)' not provisioned (unsigned build?)"
            seedFailures.append(message)
            log.warning("\(message, privacy: .public); trying Application Support")
        }

        return walk(diskRungs(appGroupID: appGroupID,
                              appGroupIsProvisioned: groupIsProvisioned),
                    seedFailures: seedFailures) { rung in
            openRung(rung.configuration, named: rung.name,
                     isProtectedDataAvailable: isProtectedDataAvailable)
        }
    }

    /// The ladder proper: walks the rungs in order and falls to memory only
    /// after every one refuses.
    ///
    /// `didReset` and `deferredUntilUnlock` accumulate ACROSS rungs. A rung-1
    /// reset whose retry also failed is the one path that actually moved the
    /// designer's data; reporting only the answering rung's flag would leave
    /// exactly that path silent. `open` is a seam so that accumulation is
    /// testable without contriving a rung that fails twice.
    static func walk(_ rungs: [DiskRung],
                     seedFailures: [String] = [],
                     open: (DiskRung) -> RungOutcome) -> CaptureStore {
        var failures = seedFailures
        var didReset = false
        var deferredUntilUnlock = false
        var answered: (container: ModelContainer, persistence: CaptureStorePersistence)?

        for rung in rungs {
            let outcome = open(rung)
            failures += outcome.failures
            didReset = didReset || outcome.didReset
            deferredUntilUnlock = deferredUntilUnlock || outcome.deferredUntilUnlock
            if let container = outcome.container {
                answered = (container, rung.persistence)
                break
            }
        }

        // Every rung's recovery folder, whichever rung answered: a store set
        // aside on rung 1 is still the designer's work when rung 2 answers.
        // Two rungs in one directory share a recovery folder: list it once.
        let preserved = rungs.flatMap { preservedStores(beside: $0.configuration.url) }
            .reduce(into: [URL]()) { list, folder in
                if !list.contains(folder) { list.append(folder) }
            }
        if let answered {
            return CaptureStore(
                container: answered.container,
                openReport: CaptureStoreOpenReport(
                    persistence: answered.persistence,
                    didResetIncompatibleStore: didReset,
                    deferredUntilUnlock: deferredUntilUnlock,
                    failures: failures,
                    preservedStores: preserved))
        }

        // Last rung — memory. Loud by construction: the report says so, the
        // composition root emits `store.in_memory_fallback`, and the sync
        // surface prints the honest line next to the outbox depth.
        log.fault("""
            Persisted storage unavailable — running in memory; captures will \
            NOT survive relaunch. Rungs: \(failures.joined(separator: " | "), privacy: .public)
            """)
        return CaptureStore(container: inMemoryContainer(),
                            openReport: CaptureStoreOpenReport(
                                persistence: .inMemoryFallback,
                                didResetIncompatibleStore: didReset,
                                deferredUntilUnlock: deferredUntilUnlock,
                                failures: failures,
                                preservedStores: preserved))
    }

    struct DiskRung {
        let name: String
        let persistence: CaptureStorePersistence
        let configuration: ModelConfiguration
    }

    /// The on-disk rungs `resilient` walks, in order — the single definition of
    /// where the store may live, so the rung-2 regression guard asserts against
    /// the configuration the app actually opens.
    ///
    /// Rung 2 must be addressed by an explicit URL. `ModelConfiguration()`
    /// defaults `groupContainer: .automatic`, which resolves to the app's App
    /// Group whenever the entitlement is present — so the old rung 2 reopened
    /// the very file rung 1 had just failed on and inherited its failure
    /// verbatim (same sourceURL, same destinationURL). It was never a fallback.
    ///
    /// The rung-1 configuration is built only when the caller has confirmed the
    /// group resolves; constructing it otherwise is what trips SwiftData's trap.
    static func diskRungs(appGroupID: String, appGroupIsProvisioned: Bool) -> [DiskRung] {
        var rungs: [DiskRung] = []
        if appGroupIsProvisioned {
            rungs.append(DiskRung(
                name: "App Group",
                persistence: .appGroup,
                configuration: ModelConfiguration(groupContainer: .identifier(appGroupID))))
        }
        rungs.append(DiskRung(
            name: "Application Support",
            persistence: .applicationSupport,
            configuration: ModelConfiguration(url: applicationSupportStoreURL())))
        return rungs
    }

    struct RungOutcome {
        var container: ModelContainer?
        var failures: [String] = []
        var didReset = false
        var deferredUntilUnlock = false
    }

    /// Opens one on-disk rung, and on failure moves the store into a dated
    /// recovery folder and retries exactly ONCE on a fresh store.
    ///
    /// There is nothing to branch on: SwiftData collapses every load failure
    /// into the same opaque `SwiftDataError.loadIssueModelContainer` with an
    /// empty userInfo — the CoreData detail (`NSCocoaErrorDomain 134110
    /// "Cannot migrate store in-place: Validation error missing attribute
    /// values on mandatory destination attribute"`) reaches the log only,
    /// never the thrown value. So an unreadable store may hold unsynced work,
    /// and nothing here ever deletes it: it is moved, whole, into its own dated
    /// folder, which no later open or clean-up removes, and it is reported on
    /// every launch (`CaptureStoreOpenReport.preservedStores`) so the sync
    /// surface can say so. The fresh store is what keeps the designer's NEXT
    /// capture on disk instead of in memory. Nothing runs while the device is
    /// locked, because a locked store is indistinguishable here from an
    /// incompatible one and is perfectly good.
    static func openRung(_ config: ModelConfiguration,
                         named rung: String,
                         isProtectedDataAvailable: @MainActor () -> Bool = { true })
        -> RungOutcome {
        var outcome = RungOutcome()
        createParentDirectory(of: config.url)

        do {
            outcome.container = try makeContainer(configuration: config)
            log.notice("Store opened on \(rung, privacy: .public) at \(config.url.path, privacy: .public)")
            return outcome
        } catch {
            outcome.failures.append("\(rung): \(error.localizedDescription)")
            log.error("""
                \(rung) store at \(config.url.path, privacy: .public) could not be opened \
                (\(error.localizedDescription, privacy: .public))
                """)
        }

        guard storeFilesExist(at: config.url) else { return outcome }

        guard isProtectedDataAvailable() else {
            outcome.deferredUntilUnlock = true
            let message = "\(rung): store locked (pre-first-unlock); not resetting"
            outcome.failures.append(message)
            log.notice("\(message, privacy: .public)")
            return outcome
        }

        guard let recovery = setStoreFilesAside(at: config.url) else { return outcome }
        outcome.didReset = true
        log.error("""
            Moved unopenable store at \(config.url.path, privacy: .public) to \
            \(recovery.path, privacy: .public), nothing deleted; retrying \(rung, privacy: .public) \
            on a fresh store
            """)

        do {
            outcome.container = try makeContainer(configuration: config)
        } catch {
            outcome.failures.append("\(rung) after reset: \(error.localizedDescription)")
            log.error("""
                \(rung) store still unusable after reset \
                (\(error.localizedDescription, privacy: .public))
                """)
        }
        return outcome
    }

    /// The rung-2 store, under THIS app's container — never the App Group.
    static func applicationSupportStoreURL() -> URL {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("default.store")
    }

    static func createParentDirectory(of url: URL) {
        let directory = url.deletingLastPathComponent()
        do {
            try FileManager.default.createDirectory(at: directory,
                                                    withIntermediateDirectories: true)
        } catch {
            log.error("""
                Could not create \(directory.path, privacy: .public) \
                (\(error.localizedDescription, privacy: .public))
                """)
        }
    }

    /// The SQLite trio for one store URL: the store, its write-ahead log, and
    /// its shared-memory file. A reset that took only the first would leave a
    /// WAL that reattaches to the new store. Plus a V1→V2 carry still pending
    /// beside it: until restored, those rows are part of this store, and left
    /// behind they would be restored into the fresh one without their photos.
    static func storeFileTrio(at url: URL) -> [URL] {
        [url,
         URL(fileURLWithPath: url.path + "-wal"),
         URL(fileURLWithPath: url.path + "-shm"),
         PieceMigrationCarry.carryURL(beside: url)]
    }

    static func storeFilesExist(at url: URL) -> Bool {
        storeFileTrio(at: url).contains { FileManager.default.fileExists(atPath: $0.path) }
    }

    /// Where set-aside stores live: a folder beside the store, holding one
    /// dated folder per store set aside.
    static func recoveryDirectory(beside url: URL) -> URL {
        url.deletingLastPathComponent()
            .appendingPathComponent("CaptureStoreRecovery", isDirectory: true)
    }

    /// Every store set aside beside `url` and still on disk, oldest first: the
    /// folder names are UTC timestamps.
    static func preservedStores(beside url: URL) -> [URL] {
        let directory = recoveryDirectory(beside: url)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { !$0.hasPrefix(".") }.sorted()
            .map { directory.appendingPathComponent($0, isDirectory: true) }
    }

    /// The reset, which never deletes and never overwrites: the whole SQLite
    /// trio moves, under its own names, into a new folder named for `now` (UTC)
    /// inside `recoveryDirectory(beside:)`. A second failure gets a second
    /// folder. Returns that folder, or nil when there was nothing to set aside
    /// (so a rung that failed for some other reason never claims a reset) or
    /// when a file refused to move. Then whatever did move is put back, so the
    /// trio is never split between two places.
    @discardableResult
    static func setStoreFilesAside(at url: URL, now: Date = Date()) -> URL? {
        let manager = FileManager.default
        let present = storeFileTrio(at: url).filter { manager.fileExists(atPath: $0.path) }
        guard !present.isEmpty else { return nil }

        let folder: URL
        do {
            folder = try makeRecoveryFolder(beside: url, now: now)
        } catch {
            log.error("""
                Could not make a recovery folder beside \(url.path, privacy: .public) \
                (\(error.localizedDescription, privacy: .public)); store left in place
                """)
            return nil
        }

        var moved: [(from: URL, to: URL)] = []
        for file in present {
            let destination = folder.appendingPathComponent(file.lastPathComponent)
            do {
                try manager.moveItem(at: file, to: destination)
                moved.append((file, destination))
            } catch {
                log.error("""
                    Could not set aside \(file.lastPathComponent, privacy: .public) \
                    (\(error.localizedDescription, privacy: .public)); putting the store back
                    """)
                for move in moved.reversed() {
                    try? manager.moveItem(at: move.to, to: move.from)
                }
                // Empty again unless a file would not go back; then it stays.
                if (try? manager.contentsOfDirectory(atPath: folder.path))?.isEmpty == true {
                    try? manager.removeItem(at: folder)
                }
                return nil
            }
        }
        return folder
    }

    /// A new, empty folder for one set-aside store, named for `now` in UTC so
    /// the names sort by age. A second store in the same second gets `-2`.
    private static func makeRecoveryFolder(beside url: URL, now: Date) throws -> URL {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        let stamp = formatter.string(from: now)
        let directory = recoveryDirectory(beside: url)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var suffix = 1
        while true {
            let name = suffix == 1 ? stamp : "\(stamp)-\(suffix)"
            let folder = directory.appendingPathComponent(name, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
                return folder
            } catch CocoaError.fileWriteFileExists {
                suffix += 1
            }
        }
    }

    /// For a valid compiled schema this performs no disk I/O and cannot fail;
    /// the guard documents that invariant without a `try!`. Unreachable unless
    /// the Capture schema itself is invalid — a build-time error the unit tests
    /// catch — so it is not an operational (runtime-data) failure path.
    private static func inMemoryContainer() -> ModelContainer {
        guard let container = try? makeContainer(inMemory: true) else {
            preconditionFailure(
                "CaptureStore.resilient: unable to construct any ModelContainer for the Capture schema")
        }
        return container
    }

    // ── CRUD / outbox ──
    @discardableResult
    public func newDraft(sessionID: UUID? = nil,
                         owner: CaptureOwnerIdentity? = nil) -> Piece {
        let s = Piece(captureSessionID: sessionID, owner: owner)
        context.insert(s)
        return s
    }

    public func delete(_ specimen: Piece) { context.delete(specimen) }

    public func save() throws {
        if context.hasChanges { try context.save() }
    }

    public func specimen(id: UUID) -> Piece? {
        let descriptor = FetchDescriptor<Piece>(predicate: #Predicate { $0.id == id })
        return try? context.fetch(descriptor).first
    }

    /// Owner-scoped lookup for real upload and user-facing paths. Legacy rows
    /// (nil owner) and mismatches intentionally resolve as absent.
    public func specimen(id: UUID, owner: CaptureOwnerIdentity) -> Piece? {
        guard let specimen = specimen(id: id),
              owner.matches(
                userID: specimen.ownerUserID,
                workspaceID: specimen.ownerWorkspaceID
              ) else { return nil }
        return specimen
    }

    // ── Scan upload records (item 8 — durable resumable upload) ──

    /// The durable upload record for a bundle dir, if one exists (resume path).
    /// `bundlePath` is the container-independent relative key ("SiteScans/…").
    public func scanUploadRecord(bundlePath: String) -> ScanUploadRecord? {
        let descriptor = FetchDescriptor<ScanUploadRecord>(
            predicate: #Predicate { $0.bundlePath == bundlePath })
        return try? context.fetch(descriptor).first
    }

    public func scanUploadRecord(
        bundlePath: String,
        owner: CaptureOwnerIdentity
    ) -> ScanUploadRecord? {
        guard let record = scanUploadRecord(bundlePath: bundlePath),
              owner.matches(
                userID: record.ownerUserID,
                workspaceID: record.ownerWorkspaceID
              ) else { return nil }
        return record
    }

    /// The durable upload record for a scan id, if one exists — used to route an
    /// orphaned background-upload completion (a task that finished while the app was
    /// dead) back onto its record (item 8 · M3).
    public func scanUploadRecord(scanID: String) -> ScanUploadRecord? {
        let descriptor = FetchDescriptor<ScanUploadRecord>(
            predicate: #Predicate { $0.scanID == scanID })
        return try? context.fetch(descriptor).first
    }

    public func scanUploadRecord(
        scanID: String,
        owner: CaptureOwnerIdentity
    ) -> ScanUploadRecord? {
        guard let record = scanUploadRecord(scanID: scanID),
              owner.matches(
                userID: record.ownerUserID,
                workspaceID: record.ownerWorkspaceID
              ) else { return nil }
        return record
    }

    /// Durable scan transfers that remain discoverable after leaving F4 or
    /// relaunching. Completed receipts are omitted by default.
    public func scanUploadRecords(includeComplete: Bool = false) -> [ScanUploadRecord] {
        let descriptor = FetchDescriptor<ScanUploadRecord>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        let records = (try? context.fetch(descriptor)) ?? []
        return includeComplete
            ? records
            : records.filter { $0.transferState.phase != .complete }
    }

    /// Owner-scoped durable transfers for real pending/reconcile paths.
    public func scanUploadRecords(
        owner: CaptureOwnerIdentity,
        includeComplete: Bool = false
    ) -> [ScanUploadRecord] {
        scanUploadRecords(includeComplete: includeComplete).filter {
            owner.matches(
                userID: $0.ownerUserID,
                workspaceID: $0.ownerWorkspaceID
            )
        }
    }

    /// Bundle keys owned by durable work that orphan sweeping must never remove.
    /// Receiptless legacy `complete` rows project as awaiting confirmation here.
    public func scanBundlePathsProtectedFromSweep() -> Set<String> {
        Set(
            scanUploadRecords(includeComplete: true)
                .filter { $0.transferState.phase != .complete }
                .map(\.bundlePath)
        )
    }

    @discardableResult
    public func insertScanUploadRecord(_ record: ScanUploadRecord) throws -> ScanUploadRecord {
        try insertScanUploadRecord(record, persistence: save)
    }

    @discardableResult
    func insertScanUploadRecord(
        _ record: ScanUploadRecord,
        persistence: () throws -> Void
    ) throws -> ScanUploadRecord {
        context.insert(record)
        do {
            try persistence()
            return record
        } catch {
            // A reservation is the durable owner of its bundle. If that first
            // write fails, remove the unsaved insertion and make the caller
            // abort before creating any remote room or scan rows.
            context.delete(record)
            throw error
        }
    }

    /// Persist per-artifact progress + status on an existing record.
    public func updateScanUploadRecord(_ record: ScanUploadRecord,
                                       artifacts: [ScanArtifactUploadState], status: String) {
        record.artifacts = artifacts
        record.statusRaw = status
        record.updatedAt = Date()
        try? save()
    }

    public func updateScanUploadRecord(
        _ record: ScanUploadRecord,
        artifacts: [ScanArtifactUploadState]? = nil,
        transfer: CaptureTransferState
    ) {
        if let artifacts { record.artifacts = artifacts }
        record.applyTransferState(transfer)
        try? save()
    }

    /// Applies an orphaned background success without regressing a terminal or
    /// user-review transfer. Non-terminal records keep their exact phase/error.
    @discardableResult
    public func applyBackgroundScanArtifactCompletion(
        _ artifact: ScanArtifactUploadState,
        to record: ScanUploadRecord
    ) -> Bool {
        let transfer = record.transferState
        guard transfer.phase != .complete,
              transfer.phase != .rejected,
              record.artifacts.first(where: {
                $0.kind == artifact.kind
              })?.status != .uploaded else { return false }

        var artifacts = record.artifacts
        if let index = artifacts.firstIndex(where: {
            $0.kind == artifact.kind
        }) {
            artifacts[index] = artifact
        } else {
            artifacts.append(artifact)
        }
        updateScanUploadRecord(
            record,
            artifacts: artifacts,
            transfer: transfer
        )
        return true
    }

    /// Atomically records receipt-backed completion before callers remove bundle bytes.
    /// The throwing save is intentional: a caller must retain the bundle whenever the
    /// completion record cannot be durably written.
    public func persistCompletedScanUploadRecord(
        _ record: ScanUploadRecord,
        artifacts: [ScanArtifactUploadState],
        receiptID: String
    ) throws {
        try persistCompletedScanUploadRecord(
            record,
            artifacts: artifacts,
            receiptID: receiptID,
            persistence: save
        )
    }

    func persistCompletedScanUploadRecord(
        _ record: ScanUploadRecord,
        artifacts: [ScanArtifactUploadState],
        receiptID: String,
        persistence: () throws -> Void
    ) throws {
        let receipt = receiptID.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !receipt.isEmpty else {
            throw CaptureTransferTransitionError.missingReceipt
        }
        let previous = (
            artifacts: record.artifacts,
            statusRaw: record.statusRaw,
            lastError: record.lastError,
            retryCount: record.retryCount,
            receiptID: record.receiptID,
            updatedAt: record.updatedAt
        )
        record.artifacts = artifacts
        record.applyTransferState(
            CaptureTransferState(
                phase: .complete,
                progress: 100,
                retryCount: record.retryCount,
                receiptID: receipt
            )
        )
        do {
            try persistence()
        } catch {
            record.artifacts = previous.artifacts
            record.statusRaw = previous.statusRaw
            record.lastError = previous.lastError
            record.retryCount = previous.retryCount
            record.receiptID = previous.receiptID
            record.updatedAt = previous.updatedAt
            throw error
        }
    }

    // ── Site Request guest delivery outbox ──

    public func siteRequestOutbox(requestID: String? = nil) -> [SiteRequestOutboxRecord] {
        let descriptor = FetchDescriptor<SiteRequestOutboxRecord>(
            sortBy: [SortDescriptor(\.createdAt, order: .forward)])
        let records = (try? context.fetch(descriptor)) ?? []
        guard let requestID else { return records }
        return records.filter { $0.requestID == requestID }
    }

    public func siteRequestOutbox(clientDeliveryID: UUID) -> SiteRequestOutboxRecord? {
        let descriptor = FetchDescriptor<SiteRequestOutboxRecord>(
            predicate: #Predicate { $0.clientDeliveryID == clientDeliveryID })
        return try? context.fetch(descriptor).first
    }

    @discardableResult
    public func enqueueSiteRequestDelivery(_ record: SiteRequestOutboxRecord) throws
        -> SiteRequestOutboxRecord {
        if let existing = siteRequestOutbox(clientDeliveryID: record.clientDeliveryID) {
            return existing
        }
        context.insert(record)
        try save()
        return record
    }

    public func transitionSiteRequestDelivery(_ record: SiteRequestOutboxRecord,
                                              to state: SiteRequestOutboxState,
                                              error: String? = nil,
                                              serverDeliverableID: String? = nil,
                                              terminalReason: SiteRequestOutboxTerminalReason? = nil,
                                              now: Date = Date()) throws {
        try record.transition(to: state, error: error,
                              serverDeliverableID: serverDeliverableID,
                              terminalReason: terminalReason, now: now)
        try save()
    }

    // ── Visit-close outbox (wave 4) ──

    /// Every standing close, oldest first — the order the drainer works them in.
    public func visitCloseOutbox() -> [FieldVisitCloseRecord] {
        let descriptor = FetchDescriptor<FieldVisitCloseRecord>(
            sortBy: [SortDescriptor(\.endedAt, order: .forward)])
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Owner-scoped, exactly as `outbox(owner:)` is: an unscoped drain would
    /// send the previous designer's close under whoever signed in next, on that
    /// account's JWT. The record carries only a user id — it becomes
    /// `project_time_entries.user_id`, which has no workspace half — so that is
    /// the whole of the match, normalised the way `CaptureOwnerIdentity` is.
    public func visitCloseOutbox(owner: CaptureOwnerIdentity) -> [FieldVisitCloseRecord] {
        visitCloseOutbox().filter {
            $0.ownerUserID
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased() == owner.userID
        }
    }

    /// The standing hours this phone owes the desk — LogTimeSheet's queue, the
    /// sibling of `visitCloseOutbox()`. Oldest first: a drive logged on Monday
    /// lands before Tuesday's when a road finally gives her signal back.
    public func timeEntryOutbox() -> [TimeEntryOutboxRecord] {
        let descriptor = FetchDescriptor<TimeEntryOutboxRecord>(
            sortBy: [SortDescriptor(\.createdAt, order: .forward)])
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Owner-scoped for the same reason `visitCloseOutbox(owner:)` is: the
    /// record carries the author's user id, `log_time` takes the author from
    /// `auth.uid()`, and an unscoped drain would send the PREVIOUS designer's
    /// hour under whoever signed in next.
    public func timeEntryOutbox(owner: CaptureOwnerIdentity) -> [TimeEntryOutboxRecord] {
        timeEntryOutbox().filter {
            $0.ownerUserID
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased() == owner.userID
        }
    }

    /// A scoped visit returns all of its captures, including queued transfers.
    /// The nil legacy query remains drafts + ready for older callers.
    public func session(visitID: UUID? = nil) -> [Piece] {
        if let visitID {
            let descriptor = FetchDescriptor<Piece>(
                sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
            let results = (try? context.fetch(descriptor)) ?? []
            return results.filter { $0.captureSessionID == visitID }
        }
        let draft = CaptureStatus.draft.rawValue
        let ready = CaptureStatus.ready.rawValue
        let descriptor = FetchDescriptor<Piece>(
            predicate: #Predicate { $0.statusRaw == draft || $0.statusRaw == ready },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Owner-scoped visit/list projection for authenticated app surfaces.
    public func session(
        visitID: UUID? = nil,
        owner: CaptureOwnerIdentity
    ) -> [Piece] {
        session(visitID: visitID).filter {
            owner.matches(
                userID: $0.ownerUserID,
                workspaceID: $0.ownerWorkspaceID
            )
        }
    }

    /// "Unplaced" — no project on the record. FC-R6: nothing is lost; only the
    /// FILING waits, on the surface she opens every morning. This is the tray's
    /// wave-3 scope, widened from one visit (spec §7.8).
    ///
    /// NO STATUS FILTER. `.committed` is the normal successful end of a drain, not
    /// a disposal, so filtering it out would empty the tray on SYNC instead of on
    /// PLACEMENT — which is the opposite of what FC-R6 asks for. Placement is the
    /// only thing that removes a row from this list.
    public func unfiled() -> [Piece] {
        let descriptor = FetchDescriptor<Piece>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        let all = (try? context.fetch(descriptor)) ?? []
        return all.filter(\.isUnplaced)
    }

    public func unfiled(owner: CaptureOwnerIdentity) -> [Piece] {
        unfiled().filter {
            owner.matches(
                userID: $0.ownerUserID,
                workspaceID: $0.ownerWorkspaceID
            )
        }
    }

    /// Everything awaiting/failing sync — drained oldest-first (R4/U1).
    public func outbox() -> [Piece] {
        let ready = CaptureStatus.ready.rawValue
        let queued = CaptureStatus.queued.rawValue
        let uploading = CaptureStatus.uploading.rawValue
        let failed = CaptureStatus.failed.rawValue
        let committed = CaptureStatus.committed.rawValue
        let descriptor = FetchDescriptor<Piece>(
            predicate: #Predicate {
                $0.statusRaw == ready || $0.statusRaw == queued
                    || $0.statusRaw == uploading || $0.statusRaw == failed
                    || $0.statusRaw == committed
            },
            sortBy: [SortDescriptor(\.createdAt, order: .forward)]
        )
        let records = (try? context.fetch(descriptor)) ?? []
        return records.filter {
            guard $0.statusRaw == committed else { return true }
            // FC-R6: placed AFTER it committed. `needsProjectPlacement` below is
            // the FF&E lane (`placementProjectId`/`placementState`), which
            // `Specimen.place(…)` never writes — without this line a placed
            // committed row never re-enters the drain and the server keeps
            // project_id NULL forever, with nothing on screen to say so.
            if $0.placementNeedsReplay { return true }
            if $0.needsProjectPlacement { return true }
            if $0.needsMarginNote { return true }
            if $0.needsPunchTask { return true }
            if $0.needsDegradeNote { return true }
            return ($0.remoteId ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty
        }
    }

    /// Owner-scoped outbox for real sync. Unowned legacy rows are deliberately
    /// quarantined instead of being claimed by whoever signs in next.
    public func outbox(owner: CaptureOwnerIdentity) -> [Piece] {
        outbox().filter {
            owner.matches(
                userID: $0.ownerUserID,
                workspaceID: $0.ownerWorkspaceID
            )
        }
    }

    /// Library/dedupe search from the field (U2).
    public func search(_ query: SpecimenQuery) -> [Piece] {
        var results = (try? context.fetch(FetchDescriptor<Piece>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]))) ?? []
        if let text = query.text?.lowercased(), !text.isEmpty {
            results = results.filter {
                ($0.title?.lowercased().contains(text) ?? false)
                    || ($0.maker?.lowercased().contains(text) ?? false)
                    || ($0.sku?.lowercased().contains(text) ?? false)
            }
        }
        if let category = query.category {
            results = results.filter { $0.categoryRaw == category.rawValue }
        }
        if let destination = query.destination {
            results = results.filter { $0.destinationRaw == destination.rawValue }
        }
        return results
    }

    /// Owner-scoped search/list projection for authenticated app surfaces.
    public func search(
        _ query: SpecimenQuery,
        owner: CaptureOwnerIdentity
    ) -> [Piece] {
        search(query).filter {
            owner.matches(
                userID: $0.ownerUserID,
                workspaceID: $0.ownerWorkspaceID
            )
        }
    }

    // ── Media files in the App Group container ──
    public func mediaDirectory() -> URL {
        let base = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupID)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("CaptureMedia", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public func mediaURL(for filename: String) -> URL {
        mediaDirectory().appendingPathComponent(filename)
    }

    /// Required local media that cannot be read as non-empty regular files.
    /// Photos with a durable remote path no longer depend on their local copy.
    public func missingRequiredMedia(for specimen: Piece) -> [String] {
        missingRequiredPhotos(for: specimen) + missingVoiceSegments(for: specimen)
    }

    /// The photo half alone. A capture whose photo is gone is meaningless, so
    /// photos stay hard-required — but the voice half must NOT be, because
    /// CaptureMediaAvailabilityError is classified `.rejected` by the sync
    /// service and `drainOwned` excludes a rejected specimen from the drain
    /// query. Validating voice up front would orphan a whole note from the
    /// sync queue over one lost segment, with no operator present to retry it.
    public func missingRequiredPhotos(for specimen: Piece) -> [String] {
        let photos = specimen.photos.sorted { $0.order < $1.order }
        return unreadable(photos.compactMap { photo -> String? in
            let remotePath = photo.remotePath?.trimmingCharacters(
                in: .whitespacesAndNewlines
            ) ?? ""
            return remotePath.isEmpty ? photo.filename : nil
        })
    }

    /// Voice segments that still depend on a local copy. Mirrors the photo rule:
    /// a segment carrying a durable remote path is exempt, exactly as an
    /// uploaded photo is. Reported, never used to gate an upload.
    private func missingVoiceSegments(for specimen: Piece) -> [String] {
        let uploaded = Set((specimen.voiceAudioRemotePathsRaw ?? [])
            .compactMap { $0.split(separator: "/").last.map(String.init) }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) })
        var seen = Set<String>()
        var names: [String] = []
        let voiceNames = ([specimen.voiceAudioFilename]
                          + (specimen.voiceAudioSegmentsRaw ?? []).map { Optional($0) })
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && !uploaded.contains($0) }
        for name in voiceNames where seen.insert(name).inserted {
            names.append(name)
        }
        return unreadable(names)
    }

    private func unreadable(_ filenames: [String]) -> [String] {
        filenames.filter { filename in
            let fileURL = mediaURL(for: filename)
            let values = try? fileURL.resourceValues(
                forKeys: [.isRegularFileKey, .fileSizeKey]
            )
            return values?.isRegularFile != true || (values?.fileSize ?? 0) <= 0
        }
    }

    public func validateRequiredMedia(for specimen: Piece) throws {
        let missing = missingRequiredMedia(for: specimen)
        guard missing.isEmpty else {
            throw CaptureMediaAvailabilityError.missingLocalMedia(missing)
        }
    }

    /// Photos only — what `uploadMedia` gates on, so a voice segment whose local
    /// file has gone missing reaches the per-segment DROP instead of throwing.
    public func validateRequiredPhotos(for specimen: Piece) throws {
        let missing = missingRequiredPhotos(for: specimen)
        guard missing.isEmpty else {
            throw CaptureMediaAvailabilityError.missingLocalMedia(missing)
        }
    }

    @discardableResult
    public func writeMedia(_ data: Data, filename: String) throws -> URL {
        let url = mediaURL(for: filename)
        try data.write(to: url, options: .atomic)
        return url
    }

    // ── Media retention sweep (FC-R19 / P-3) ──

    /// Runs the size-capped retention sweep: deletes oldest-first among media
    /// files whose owning specimen already carries a durable remote path for
    /// that file, stopping the moment local usage is back at/under
    /// `MediaRetentionPolicy.softCapBytes`. A file with no stamped remote path
    /// is never touched, however large the overage — the stamp (a photo's
    /// `remotePath`, or a voice filename's entry in
    /// `voiceAudioRemotePathsRaw`) is the only proof the server has the bytes.
    @discardableResult
    public func sweepMediaRetention() -> Int {
        sweepMediaRetention(totalBytes: mediaDirectoryTotalBytes())
    }

    /// `totalBytes` is injectable so tests can drive the boundary without
    /// writing anything close to the real 512 MB soft cap to disk.
    @discardableResult
    func sweepMediaRetention(totalBytes: Int64) -> Int {
        var overage = MediaRetentionPolicy.overage(totalBytes: totalBytes)
        guard overage > 0 else { return 0 }

        let candidates = receiptedMediaFiles().sorted { $0.modifiedAt < $1.modifiedAt }
        var deleted = 0
        for candidate in candidates {
            guard overage > 0 else { break }
            guard (try? FileManager.default.removeItem(at: candidate.url)) != nil else { continue }
            overage -= candidate.size
            deleted += 1
        }
        return deleted
    }

    private struct ReceiptedMediaFile {
        let url: URL
        let size: Int64
        let modifiedAt: Date
    }

    /// Every locally-persisted media file whose owning specimen has already
    /// stamped a durable remote path for it: a photo's `remotePath`, or a
    /// voice filename that appears (by trailing path component) in
    /// `voiceAudioRemotePathsRaw`. These are the only files the sweep may
    /// ever delete.
    private func receiptedMediaFiles() -> [ReceiptedMediaFile] {
        let specimens = (try? context.fetch(FetchDescriptor<Piece>())) ?? []
        var filenames = Set<String>()
        for specimen in specimens {
            for photo in specimen.photos {
                let remotePath = photo.remotePath?.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ) ?? ""
                if !remotePath.isEmpty { filenames.insert(photo.filename) }
            }
            let uploadedBasenames = Set((specimen.voiceAudioRemotePathsRaw ?? [])
                .compactMap { $0.split(separator: "/").last.map(String.init) })
            let voiceNames = ([specimen.voiceAudioFilename]
                              + (specimen.voiceAudioSegmentsRaw ?? []).map { Optional($0) })
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            for name in voiceNames where uploadedBasenames.contains(name) {
                filenames.insert(name)
            }
        }
        return filenames.compactMap { name -> ReceiptedMediaFile? in
            let url = mediaURL(for: name)
            guard let values = try? url.resourceValues(
                forKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
            ), values.isRegularFile == true, let size = values.fileSize else { return nil }
            return ReceiptedMediaFile(
                url: url,
                size: Int64(size),
                modifiedAt: values.contentModificationDate ?? .distantFuture
            )
        }
    }

    private func mediaDirectoryTotalBytes() -> Int64 {
        let dir = mediaDirectory()
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        return urls.reduce(Int64(0)) { total, url in
            guard let values = try? url.resourceValues(
                forKeys: [.isRegularFileKey, .fileSizeKey]
            ), values.isRegularFile == true, let size = values.fileSize else { return total }
            return total + Int64(size)
        }
    }
}
