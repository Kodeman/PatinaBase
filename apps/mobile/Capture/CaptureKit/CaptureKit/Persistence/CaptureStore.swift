//  CaptureStore.swift
//  CaptureKit
//
//  Local outbox / CRUD over the SwiftData store. The store lives in the App
//  Group container so the Share and Widget extensions read/write the same DB
//  and the same on-disk media directory.

import Foundation
import SwiftData

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
    public static let appGroupID = "group.cloud.patina.capture"

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
