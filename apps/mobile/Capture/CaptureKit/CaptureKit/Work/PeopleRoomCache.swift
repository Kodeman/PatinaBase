//  PeopleRoomCache.swift
//  CaptureKit
//
//  The roster and the site access card have to be readable on a site with one
//  bar or none (ux-4-field-mobile §6). Nothing in the app cached a READ before
//  this: `CaptureProjectCache` is SwiftData and holds project names and room
//  lanes, and `CaptureKit/Sync` is a write outbox for captures. So this is a
//  small on-disk store of its own — one JSON file per project per object,
//  owner-scoped, plus a queue for the one write the card offers.
//
//  What it promises:
//   • the last good copy is returned instantly, with the stamp it was loaded at,
//     so the screen prints "Last loaded …" in ink rather than spinning;
//   • a notice written with no signal is queued and retried, never lost and
//     never silently dropped;
//   • a corrupt or unreadable file reads as "nothing cached", never as a crash.

import Foundation
import os

/// A cached copy and the moment it was stored.
public struct FieldCached<Value: Sendable>: Sendable {
    public let value: Value
    public let storedAt: Date

    public init(value: Value, storedAt: Date) {
        self.value = value
        self.storedAt = storedAt
    }
}

private struct FieldCacheEnvelope<Value: Codable & Sendable>: Codable {
    let storedAt: Date
    let value: Value
}

@MainActor
public final class PeopleRoomCache {
    private static let log = Logger(subsystem: "cloud.patina.field", category: "people-room-cache")

    private let root: URL?
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    /// `directory` is injectable so a test writes into its own temporary folder
    /// instead of the app's Application Support.
    public init(directory: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        if let directory {
            self.root = directory
        } else {
            self.root = try? fileManager.url(for: .applicationSupportDirectory,
                                             in: .userDomainMask,
                                             appropriateFor: nil, create: true)
                .appendingPathComponent("PeopleRoom", isDirectory: true)
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    // MARK: The two cached objects

    public func loadRoster(projectID: String,
                           owner: CaptureOwnerIdentity?) -> FieldCached<FieldProjectRoster>? {
        read(FieldProjectRoster.self, at: url(owner: owner, projectID: projectID, object: "roster"))
    }

    public func saveRoster(_ roster: FieldProjectRoster,
                           owner: CaptureOwnerIdentity?, now: Date = Date()) {
        write(roster, at: url(owner: owner, projectID: roster.projectID, object: "roster"), now: now)
    }

    public func loadSiteAccess(projectID: String,
                               owner: CaptureOwnerIdentity?) -> FieldCached<FieldSiteAccessCard>? {
        read(FieldSiteAccessCard.self, at: url(owner: owner, projectID: projectID, object: "access"))
    }

    public func saveSiteAccess(_ card: FieldSiteAccessCard,
                               owner: CaptureOwnerIdentity?, now: Date = Date()) {
        write(card, at: url(owner: owner, projectID: card.projectID, object: "access"), now: now)
    }

    // MARK: The notice queue

    /// Every notice still owed, oldest first.
    public func pendingNotices(projectID: String,
                               owner: CaptureOwnerIdentity?) -> [FieldSiteNoticeDraft] {
        let queued = read([FieldSiteNoticeDraft].self,
                          at: url(owner: owner, projectID: projectID, object: "notices"))
        return (queued?.value ?? []).sorted { $0.writtenAt < $1.writtenAt }
    }

    public func queue(_ draft: FieldSiteNoticeDraft, owner: CaptureOwnerIdentity?) {
        var drafts = pendingNotices(projectID: draft.projectID, owner: owner)
        drafts.removeAll { $0.id == draft.id }
        drafts.append(draft)
        write(drafts, at: url(owner: owner, projectID: draft.projectID, object: "notices"))
    }

    public func forget(_ draft: FieldSiteNoticeDraft, owner: CaptureOwnerIdentity?) {
        var drafts = pendingNotices(projectID: draft.projectID, owner: owner)
        drafts.removeAll { $0.id == draft.id }
        write(drafts, at: url(owner: owner, projectID: draft.projectID, object: "notices"))
    }

    /// Retry every queued notice. Returns the ones that landed; the rest stay
    /// queued for the next time there is signal.
    @discardableResult
    public func drain(projectID: String, owner: CaptureOwnerIdentity?,
                      using service: any PeopleRoomService) async -> [FieldSiteNotice] {
        var written: [FieldSiteNotice] = []
        for draft in pendingNotices(projectID: projectID, owner: owner) {
            do {
                written.append(try await service.recordNotice(draft))
                forget(draft, owner: owner)
            } catch {
                break  // No signal, or the write refused: keep the order intact.
            }
        }
        return written
    }

    // MARK: Plumbing

    /// A cache key that cannot collide across accounts or escape its folder:
    /// the owner and the project id are both reduced to their hash, never used
    /// as a path component verbatim.
    private func url(owner: CaptureOwnerIdentity?, projectID: String, object: String) -> URL? {
        guard let root else { return nil }
        let scope = owner.map { "\($0.userID)|\($0.workspaceID)" } ?? "unscoped"
        return root
            .appendingPathComponent(Self.key(scope), isDirectory: true)
            .appendingPathComponent("\(Self.key(projectID))-\(object).json", isDirectory: false)
    }

    private static func key(_ raw: String) -> String {
        // Hex of a stable 64-bit hash of the bytes. Deterministic across
        // launches, unlike `String.hashValue`, which is seeded per process.
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in Array(raw.utf8) {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01b3
        }
        return String(hash, radix: 16)
    }

    private func read<Value: Codable & Sendable>(_ type: Value.Type,
                                                 at url: URL?) -> FieldCached<Value>? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        do {
            let envelope = try decoder.decode(FieldCacheEnvelope<Value>.self, from: data)
            return FieldCached(value: envelope.value, storedAt: envelope.storedAt)
        } catch {
            // A shape that changed between builds reads as "nothing cached",
            // which is exactly what a refresh fixes.
            Self.log.error("cached \(String(describing: type), privacy: .public) unreadable: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func write<Value: Codable & Sendable>(_ value: Value, at url: URL?, now: Date = Date()) {
        guard let url else { return }
        do {
            try fileManager.createDirectory(at: url.deletingLastPathComponent(),
                                            withIntermediateDirectories: true)
            let data = try encoder.encode(FieldCacheEnvelope(storedAt: now, value: value))
            try data.write(to: url, options: .atomic)
        } catch {
            Self.log.error("could not cache \(url.lastPathComponent, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }
}
