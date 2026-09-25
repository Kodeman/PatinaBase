//
//  LocalStoreRecoveryTests.swift
//  PatinaTests
//
//  SQ-247 F3. A store that will not open is moved aside only when the file
//  itself is the fault — not a database, or a shape no stage reaches. A full
//  disk, a locked file or a newer build's store leaves it exactly where it
//  is: that launch runs in memory and the next one tries again. And a file
//  that will not move is never deleted.
//
//  Every fixture is a real store file on disk, written by SwiftData.
//

import CoreData
import Foundation
import SwiftData
import Testing
@testable import Patina

/// A shape no Patina build wrote: `BoardModel` without its V1 properties.
enum PreV1Shape {
    @Model
    final class BoardModel {
        var title: String
        init(title: String) { self.title = title }
    }
}

/// A later build's store: a version this build has never heard of.
enum LaterBuildSchema: VersionedSchema {
    static var versionIdentifier: Schema.Version { Schema.Version(9, 0, 0) }
    static var models: [any PersistentModel.Type] { [PatinaSchemaV1.BoardModel.self, LaterBuildNote.self] }

    @Model
    final class LaterBuildNote {
        var text: String
        init(text: String) { self.text = text }
    }
}

/// Refuses the moves the test names, and otherwise moves like the real one.
private final class RefusingFileManager: FileManager, @unchecked Sendable {
    var refuses: (_ from: URL, _ to: URL) -> Bool = { _, _ in false }

    override func moveItem(at srcURL: URL, to dstURL: URL) throws {
        if refuses(srcURL, dstURL) { throw CocoaError(.fileWriteNoPermission) }
        try super.moveItem(at: srcURL, to: dstURL)
    }
}

@MainActor
struct LocalStoreRecoveryTests {

    enum Fixture: String, CaseIterable {
        case notADatabase, garbagePages, truncated, frozenV1, frozenV2, preV1Shape, laterBuild, locked, missing
    }

    private let fm = FileManager.default

    private func directory() throws -> URL {
        let dir = fm.temporaryDirectory
            .appendingPathComponent("LocalStoreRecoveryTests-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Leaves the store closed and whole on disk.
    private func writeStore(_ schema: Schema, at url: URL) throws {
        let container = try ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, url: url)])
        try ModelContext(container).save()
    }

    /// A valid store with its sidecars folded away, so its bytes can be
    /// damaged by hand.
    private func writeBareV1(at url: URL) throws -> Data {
        try writeStore(Schema(versionedSchema: PatinaSchemaV1.self), at: url)
        for suffix in ["-wal", "-shm"] { try? fm.removeItem(atPath: url.path + suffix) }
        return try Data(contentsOf: url)
    }

    private func make(_ fixture: Fixture, in dir: URL) throws -> URL {
        let url = dir.appendingPathComponent("\(fixture.rawValue).store")
        switch fixture {
        case .notADatabase:
            try Data("this is not a sqlite database".utf8).write(to: url)
        case .garbagePages:
            var bytes = try writeBareV1(at: url)
            for index in 100..<bytes.count { bytes[index] = 0x5a }
            try bytes.write(to: url)
        case .truncated:
            try writeBareV1(at: url).prefix(1024).write(to: url)
        case .frozenV1:
            try writeStore(Schema(versionedSchema: PatinaSchemaV1.self), at: url)
        case .frozenV2:
            try writeStore(Schema(versionedSchema: PatinaSchemaV2.self), at: url)
        case .preV1Shape:
            try writeStore(Schema([PreV1Shape.BoardModel.self]), at: url)
        case .laterBuild:
            try writeStore(Schema(versionedSchema: LaterBuildSchema.self), at: url)
        case .locked:
            try writeStore(Schema(versionedSchema: PatinaSchemaV1.self), at: url)
            try fm.setAttributes([.posixPermissions: 0o000], ofItemAtPath: url.path)
        case .missing:
            break
        }
        return url
    }

    private func unlock(_ dir: URL) {
        for name in (try? fm.contentsOfDirectory(atPath: dir.path)) ?? [] {
            try? fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: dir.appendingPathComponent(name).path)
        }
    }

    private func recoveredFolders(in dir: URL) -> [String] {
        ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? []).filter { $0.hasPrefix("RecoveredStore-") }
    }

    // MARK: - The classifier, on real files

    @Test(
        "only a file that is not a database, or a shape no stage reaches, is set aside",
        arguments: Fixture.allCases
    )
    func classifiesTheFile(fixture: Fixture) throws {
        let dir = try directory()
        defer { unlock(dir); try? fm.removeItem(at: dir) }
        let url = try make(fixture, in: dir)
        let expected: LocalStoreOpenFailure = switch fixture {
        case .notADatabase, .garbagePages, .truncated, .preV1Shape: .setAside
        case .frozenV1, .frozenV2, .laterBuild, .locked, .missing: .leaveInPlace
        }
        #expect(LocalStoreRecovery.classify(storeAt: url) == expected)
    }

    /// The read faults, as Core Data throws them: 259 for a file that is not
    /// SQLite, SQLite 11 CORRUPT and 26 NOTADB (extended codes too) in their
    /// own domain, under the `NSSQLiteErrorDomain` key, or underneath.
    @Test("corruption is 259 or SQLite 11/26")
    func corruptionIsTheBytes() {
        let corrupt = [
            NSError(domain: NSCocoaErrorDomain, code: NSFileReadCorruptFileError),
            NSError(domain: NSSQLiteErrorDomain, code: 11),
            NSError(domain: NSSQLiteErrorDomain, code: 267),
            NSError(domain: NSCocoaErrorDomain, code: 256, userInfo: [NSSQLiteErrorDomain: 26]),
            NSError(domain: NSCocoaErrorDomain, code: 134_110, userInfo: [
                NSUnderlyingErrorKey: NSError(domain: NSSQLiteErrorDomain, code: 11)
            ])
        ]
        for error in corrupt {
            #expect(LocalStoreRecovery.isCorruption(error), "\(error.domain) \(error.code)")
        }
    }

    /// No space, an IO fault, a permission or file-protection refusal, and a
    /// migration failure that says nothing more: none of them is the bytes.
    @Test("no space, IO and permission faults are not corruption")
    func otherFaultsAreNotCorruption() {
        let intact = [
            NSError(domain: NSCocoaErrorDomain, code: NSFileWriteOutOfSpaceError),
            NSError(domain: NSSQLiteErrorDomain, code: 13),
            NSError(domain: NSSQLiteErrorDomain, code: 10),
            NSError(domain: NSPOSIXErrorDomain, code: Int(ENOSPC)),
            NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoPermissionError),
            NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError),
            NSError(domain: NSCocoaErrorDomain, code: 256, userInfo: [NSSQLiteErrorDomain: 1544]),
            NSError(domain: NSCocoaErrorDomain, code: 134_110)
        ]
        for error in intact {
            #expect(!LocalStoreRecovery.isCorruption(error), "\(error.domain) \(error.code)")
        }
    }

    // MARK: - The open path

    @Test("a store that cannot be read is left in place: nothing moves, no notice, this launch in memory")
    func anUnreadableStoreIsLeftInPlace() throws {
        let dir = try directory()
        defer { unlock(dir); try? fm.removeItem(at: dir) }
        let url = try make(.locked, in: dir)
        let before = try fm.attributesOfItem(atPath: url.path)[.size] as? Int

        let schema = PatinaSchemaCurrent.schema
        let opened = PersistenceController.open(schema: schema, configuration: ModelConfiguration(schema: schema, url: url))

        let inMemory = opened.container.configurations.allSatisfy { $0.isStoredInMemoryOnly }
        #expect(opened.recovery == nil)
        #expect(inMemory)
        #expect(recoveredFolders(in: dir).isEmpty)
        unlock(dir)
        #expect(try fm.attributesOfItem(atPath: url.path)[.size] as? Int == before)
    }

    @Test("a later build's store is left in place for the build that wrote it")
    func aLaterBuildsStoreIsLeftInPlace() throws {
        let dir = try directory()
        defer { try? fm.removeItem(at: dir) }
        let url = try make(.laterBuild, in: dir)

        let schema = PatinaSchemaCurrent.schema
        let opened = PersistenceController.open(schema: schema, configuration: ModelConfiguration(schema: schema, url: url))

        #expect(opened.recovery == nil)
        #expect(fm.fileExists(atPath: url.path))
        #expect(recoveredFolders(in: dir).isEmpty)
    }

    @Test("a file that is not a database is set aside, kept, and a fresh store opens on disk", arguments: [
        Fixture.notADatabase, .preV1Shape
    ])
    func anUnopenableFileIsSetAside(fixture: Fixture) throws {
        let dir = try directory()
        defer { try? fm.removeItem(at: dir) }
        let url = try make(fixture, in: dir)
        let bytes = try Data(contentsOf: url)

        let schema = PatinaSchemaCurrent.schema
        let opened = PersistenceController.open(schema: schema, configuration: ModelConfiguration(schema: schema, url: url))

        let recovery = try #require(opened.recovery)
        let archived = recovery.archivedAt.appendingPathComponent(url.lastPathComponent)
        #expect(fm.fileExists(atPath: archived.path))
        if fixture == .notADatabase { #expect(try Data(contentsOf: archived) == bytes) }
        let onDisk = opened.container.configurations.contains { !$0.isStoredInMemoryOnly }
        #expect(onDisk)
        #expect(try ModelContext(opened.container).fetch(FetchDescriptor<BoardModel>()).isEmpty)
    }

    // MARK: - A move that fails deletes nothing

    @Test("a sidecar that will not move: the store goes back beside it, nothing is deleted")
    func aFailedMoveRollsBack() throws {
        let dir = try directory()
        defer { try? fm.removeItem(at: dir) }
        let url = dir.appendingPathComponent("stuck.store")
        for (suffix, text) in [("", "store"), ("-wal", "wal"), ("-shm", "shm")] {
            try Data(text.utf8).write(to: URL(fileURLWithPath: url.path + suffix))
        }
        let refusing = RefusingFileManager()
        refusing.refuses = { from, _ in from.lastPathComponent == "stuck.store-wal" }

        #expect(LocalStoreRecovery.archiveStore(at: url, fileManager: refusing) == nil)

        for (suffix, text) in [("", "store"), ("-wal", "wal"), ("-shm", "shm")] {
            #expect(try Data(contentsOf: URL(fileURLWithPath: url.path + suffix)) == Data(text.utf8))
        }
        #expect(recoveredFolders(in: dir).isEmpty, "the empty folder is removed")
    }

    @Test("a store that cannot be put back either stays in the folder, never deleted")
    func aFailedRollbackKeepsTheFile() throws {
        let dir = try directory()
        defer { try? fm.removeItem(at: dir) }
        let url = dir.appendingPathComponent("stuck.store")
        try Data("store".utf8).write(to: url)
        try Data("wal".utf8).write(to: URL(fileURLWithPath: url.path + "-wal"))
        let refusing = RefusingFileManager()
        refusing.refuses = { from, to in
            from.lastPathComponent == "stuck.store-wal" || to.path == url.path
        }

        #expect(LocalStoreRecovery.archiveStore(at: url, fileManager: refusing) == nil)

        let folder = try #require(recoveredFolders(in: dir).first)
        let kept = dir.appendingPathComponent(folder).appendingPathComponent("stuck.store")
        #expect(try Data(contentsOf: kept) == Data("store".utf8))
        #expect(try Data(contentsOf: URL(fileURLWithPath: url.path + "-wal")) == Data("wal".utf8))
    }
}
