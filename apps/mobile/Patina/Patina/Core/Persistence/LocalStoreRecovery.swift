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
//  one, and says so once.
//

import Foundation
import SwiftData

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
    /// it. Returns the folder, or `nil` when nothing could be moved — in
    /// which case the caller has no fresh store to open either and falls back
    /// to memory.
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

        var movedAny = false
        for file in storeFiles(for: url) where fileManager.fileExists(atPath: file.path) {
            let destination = folder.appendingPathComponent(file.lastPathComponent)
            do {
                try fileManager.moveItem(at: file, to: destination)
                movedAny = true
            } catch {
                // A file we cannot move is a file the fresh store would read
                // back. Remove it rather than leave the container to fail
                // twice on the same bytes.
                movedAny = ((try? fileManager.removeItem(at: file)) != nil) || movedAny
            }
        }

        guard movedAny else {
            try? fileManager.removeItem(at: folder)
            return nil
        }
        return folder
    }
}
