//
//  LocalStoreRecovery.swift
//  Patina
//
//  What the app does when the on-device store will not open, and what it
//  tells the person afterwards.
//
//  The old answer was `fatalError`. A tester whose store cannot be opened —
//  a schema change inference could not carry, a truncated file, a disk that
//  filled mid-write — got a launch crash loop and no way out but deleting
//  the app. The new answer moves the unreadable store aside, opens a fresh
//  one, and says so once — and only when the file itself is the fault. A
//  store that would not open because the disk was full or the file was
//  locked is intact, and is left where it is (SQ-247 F3).
//

import CoreData
import Foundation
import SwiftData

/// What a store that would not open means for its file.
enum LocalStoreOpenFailure: Equatable {
    /// Not a database, or a schema no stage of this build reaches. It will
    /// never open as it stands: it is set aside and a fresh store opens.
    case setAside
    /// The file may be intact — no space, a file-protection or permission
    /// refusal, an IO error, a failed migration of a version this build
    /// knows, a store a newer build wrote. It stays where it is; this launch
    /// runs in memory and the next launch tries it again.
    case leaveInPlace
}

/// The record of a store this app could not open and had to set aside.
struct LocalStoreRecoveryRecord: Equatable {
    /// Where the unreadable files were moved. Kept rather than deleted: a
    /// store we could not read is still the person's, and a support ask can
    /// still reach it.
    let archivedAt: URL
    let occurredAt: Date
}

/// Process-lifetime holder for the recovery, read by the one-time notice.
@MainActor
@Observable
final class LocalStoreRecovery {

    static let shared = LocalStoreRecovery()

    /// Set by `PersistenceController` when it had to start over, cleared when
    /// the person has read the notice.
    private(set) var pending: LocalStoreRecoveryRecord?

    private init() {}

    func record(_ record: LocalStoreRecoveryRecord) {
        pending = record
    }

    func acknowledge() {
        pending = nil
    }

    // MARK: - The file move (pure enough to test)

    /// The sidecar files SQLite keeps beside the store. Moving the `.store`
    /// alone leaves a write-ahead log the fresh store would adopt.
    static func storeFiles(for url: URL) -> [URL] {
        let base = url.lastPathComponent
        let dir = url.deletingLastPathComponent()
        return [base, base + "-wal", base + "-shm"].map {
            dir.appendingPathComponent($0)
        }
    }

    /// Move every file of the store at `url` into a timestamped folder beside
    /// it. Returns the folder, or `nil` when the store could not be moved
    /// whole — in which case it is where it was, and the caller opens nothing
    /// over it and falls back to memory.
    ///
    /// A file that will not move is never deleted (SQ-247 F3). The files that
    /// did move go back beside it, so the store stays in one piece for the
    /// next launch to try again.
    static func archiveStore(
        at url: URL,
        now: Date = Date(),
        fileManager: FileManager = .default
    ) -> URL? {
        let stamp = Int(now.timeIntervalSince1970)
        let folder = url
            .deletingLastPathComponent()
            .appendingPathComponent("RecoveredStore-\(stamp)", isDirectory: true)
        do {
            try fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            return nil
        }

        var moved: [(from: URL, to: URL)] = []
        for file in storeFiles(for: url) where fileManager.fileExists(atPath: file.path) {
            let destination = folder.appendingPathComponent(file.lastPathComponent)
            do {
                try fileManager.moveItem(at: file, to: destination)
                moved.append((file, destination))
            } catch {
                PatinaLog.sync.error(
                    "[Persistence] could not set aside \(file.lastPathComponent): \(error.localizedDescription)"
                )
                for step in moved.reversed() {
                    do {
                        try fileManager.moveItem(at: step.to, to: step.from)
                    } catch {
                        PatinaLog.sync.error(
                            "[Persistence] could not put back \(step.from.lastPathComponent): \(error.localizedDescription)"
                        )
                    }
                }
                moved = []
                break
            }
        }

        guard !moved.isEmpty else {
            // Only an empty folder goes: one a file could not be put back
            // from still holds that file.
            if (try? fileManager.contentsOfDirectory(atPath: folder.path))?.isEmpty == true {
                try? fileManager.removeItem(at: folder)
            }
            return nil
        }
        return folder
    }

    // MARK: - Why it would not open (SQ-247 F3)

    /// Asks the file, because the error cannot say.
    ///
    /// SwiftData reports every failed open as a `SwiftDataError` with an
    /// empty `userInfo`: `.unknownDataStoreSchema` when no version of the plan
    /// matches the file — a pre-V1 store and a newer build's store alike — and
    /// `.loadIssueModelContainer` for everything else, a corrupt file and a
    /// locked one alike. Core Data's own code (134504, 134100, 134110, SQLite
    /// 11/26) never reaches the app, and 134110 is also what a migration
    /// reports when the disk fills. So the file is read directly: Core Data's
    /// metadata read throws the real fault, and the metadata says which
    /// version wrote the store.
    static func classify(
        storeAt url: URL,
        versions: [any VersionedSchema.Type] = PatinaMigrationPlan.schemas
    ) -> LocalStoreOpenFailure {
        // No file: whatever failed, there is nothing of the person's to move.
        guard FileManager.default.fileExists(atPath: url.path) else { return .leaveInPlace }
        let metadata: [String: Any]
        do {
            metadata = try NSPersistentStoreCoordinator.metadataForPersistentStore(type: .sqlite, at: url)
        } catch {
            return isCorruption(error) ? .setAside : .leaveInPlace
        }
        // A newer build's store is not this build's to discard: the tester
        // who went back a build gets it again when they update.
        if let latest = versions.map({ $0.versionIdentifier }).max(),
           storeVersions(metadata).contains(where: { $0 > latest }) {
            return .leaveInPlace
        }
        let known = versions.contains { version in
            NSManagedObjectModel.makeManagedObjectModel(for: Schema(versionedSchema: version))?
                .isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata) == true
        }
        return known ? .leaveInPlace : .setAside
    }

    /// The read faults that mean the bytes are not a database: Cocoa 259 (not
    /// SQLite at all — what a not-a-database file throws), and SQLite 11
    /// CORRUPT or 26 NOTADB, extended codes included, as the error's own
    /// domain or under its `NSSQLiteErrorDomain` key. Anything else —
    /// 260 for a file locked by its protection class or permissions, 256 with
    /// SQLite 1544 for a read-only directory, 640 for a full disk — is not.
    static func isCorruption(_ error: Error) -> Bool {
        let error = error as NSError
        if error.domain == NSCocoaErrorDomain, error.code == NSFileReadCorruptFileError { return true }
        let sqlite = error.domain == NSSQLiteErrorDomain
            ? error.code
            : (error.userInfo[NSSQLiteErrorDomain] as? NSNumber)?.intValue
        if let sqlite, [11, 26].contains(sqlite & 0xff) { return true }
        if let underlying = error.userInfo[NSUnderlyingErrorKey] as? Error { return isCorruption(underlying) }
        return false
    }

    /// The schema versions stamped into a store's metadata, e.g. `2.0.0`.
    private static func storeVersions(_ metadata: [String: Any]) -> [Schema.Version] {
        let identifiers = metadata[NSStoreModelVersionIdentifiersKey] as? [Any] ?? []
        return identifiers.compactMap { identifier in
            let parts = String(describing: identifier).split(separator: ".").compactMap { Int($0) }
            return parts.count == 3 ? Schema.Version(parts[0], parts[1], parts[2]) : nil
        }
    }
}
