//  CaptureStore.swift
//  CaptureKit
//
//  Local outbox / CRUD over the SwiftData store. The store lives in the App
//  Group container so the Share and Widget extensions read/write the same DB
//  and the same on-disk media directory.

import Foundation
import SwiftData
import os

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

@MainActor
public final class CaptureStore {
    public nonisolated(unsafe) static let appGroupID = "group.cloud.patina.field"

    public static let schema = Schema([
        Specimen.self, CapturePhoto.self, CaptureMeasurement.self, CaptureProjectRef.self
    ])

    public let container: ModelContainer
    public var context: ModelContext { container.mainContext }

    public init(container: ModelContainer) {
        self.container = container
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
        return try ModelContainer(for: schema, configurations: [config])
    }

    public static func inMemory() throws -> CaptureStore {
        CaptureStore(container: try makeContainer(inMemory: true))
    }

    private static let log = Logger(subsystem: "cloud.patina.field", category: "store")

    /// Best-effort store that never crashes on a missing container.
    ///
    /// `persistent: true` (real mode) walks a fallback ladder so an unsigned or
    /// entitlement-less build still runs:
    ///   1. App Group container (shared with Share/Widget extensions),
    ///   2. default on-disk container in Application Support,
    ///   3. in-memory (not persisted, but the app stays up).
    /// `persistent: false` (mock/preview/UITest) goes straight to in-memory.
    /// Each fallback is logged; there is no `try!` on this path.
    public static func resilient(persistent: Bool = true,
                                 appGroupID: String = CaptureStore.appGroupID) -> CaptureStore {
        if persistent {
            // Only attempt the App Group container when the group is actually
            // provisioned. On an unsigned build the entitlement is inert and
            // SwiftData *traps* (assertionFailure) instead of throwing, which a
            // do/catch cannot intercept — so we gate on the resolvable container
            // URL first, exactly as `mediaDirectory()` does.
            if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) != nil {
                do {
                    let config = ModelConfiguration(groupContainer: .identifier(appGroupID))
                    return CaptureStore(container: try ModelContainer(for: schema, configurations: [config]))
                } catch {
                    log.error("App Group container unavailable (\(error.localizedDescription, privacy: .public)); falling back to Application Support")
                }
            } else {
                log.warning("App Group '\(appGroupID, privacy: .public)' not provisioned (unsigned build?); using Application Support")
            }
            do {
                // Default configuration → on-disk store in the app's Application Support.
                return CaptureStore(container: try ModelContainer(for: schema, configurations: [ModelConfiguration()]))
            } catch {
                log.error("Application Support container unavailable (\(error.localizedDescription, privacy: .public)); falling back to in-memory")
            }
            log.fault("Persisted storage unavailable — running with an in-memory store; captures will not survive relaunch")
        }
        // In-memory terminal. For a valid compiled schema this performs no disk
        // I/O and cannot fail; the guard documents that invariant without a try!.
        if let container = try? makeContainer(inMemory: true) {
            return CaptureStore(container: container)
        }
        // Unreachable unless the Capture schema itself is invalid (a build-time
        // error caught by the unit tests). Asserting the invariant here keeps the
        // factory total; it is not an operational (runtime-data) failure path.
        preconditionFailure("CaptureStore.resilient: unable to construct any ModelContainer for the Capture schema")
    }

    // ── CRUD / outbox ──
    @discardableResult
    public func newDraft() -> Specimen {
        let s = Specimen()
        context.insert(s)
        return s
    }

    public func delete(_ specimen: Specimen) { context.delete(specimen) }

    public func save() throws {
        if context.hasChanges { try context.save() }
    }

    public func specimen(id: UUID) -> Specimen? {
        let descriptor = FetchDescriptor<Specimen>(predicate: #Predicate { $0.id == id })
        return try? context.fetch(descriptor).first
    }

    /// This visit's captures (drafts + ready), newest first — V1 session tray.
    public func session() -> [Specimen] {
        let draft = CaptureStatus.draft.rawValue
        let ready = CaptureStatus.ready.rawValue
        let descriptor = FetchDescriptor<Specimen>(
            predicate: #Predicate { $0.statusRaw == draft || $0.statusRaw == ready },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Everything awaiting/failing sync — drained oldest-first (R4/U1).
    public func outbox() -> [Specimen] {
        let ready = CaptureStatus.ready.rawValue
        let queued = CaptureStatus.queued.rawValue
        let failed = CaptureStatus.failed.rawValue
        let descriptor = FetchDescriptor<Specimen>(
            predicate: #Predicate { $0.statusRaw == ready || $0.statusRaw == queued || $0.statusRaw == failed },
            sortBy: [SortDescriptor(\.createdAt, order: .forward)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Library/dedupe search from the field (U2).
    public func search(_ query: SpecimenQuery) -> [Specimen] {
        var results = (try? context.fetch(FetchDescriptor<Specimen>(
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

    @discardableResult
    public func writeMedia(_ data: Data, filename: String) throws -> URL {
        let url = mediaURL(for: filename)
        try data.write(to: url, options: .atomic)
        return url
    }
}
