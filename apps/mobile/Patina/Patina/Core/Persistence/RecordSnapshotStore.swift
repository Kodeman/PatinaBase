//
//  RecordSnapshotStore.swift
//  Patina
//
//  The last record, on disk, so Today paints what it knows before any fetch
//  lands — and so W6's widget can read the same object the app drew.
//
//  App Group, with a fallback that is not optional politeness:
//  `containerURL(forSecurityApplicationGroupIdentifier:)` returns nil whenever
//  the entitlement is not honoured by the running process — which is the
//  Simulator without provisioning, and any build made before the App ID gains
//  the capability. Without the fallback the snapshot would silently no-op and
//  Today would paint blank on every cold launch. So: group container when
//  there is one, the app's Application Support when there is not, and
//  `usesAppGroupContainer` says which happened. A genuinely shared container
//  is a DEVICE claim; nothing here makes it.
//

import Foundation

final class RecordSnapshotStore: Sendable {

    /// The one file name the app and (from W6) the widget agree on.
    static let fileName = "house-record.json"

    static let shared = RecordSnapshotStore()

    /// Where the snapshot lives. Exposed so a failure can be reported with a
    /// path rather than a shrug.
    let fileURL: URL

    /// False when the App Group container was unreachable and the app
    /// container is being used instead.
    let usesAppGroupContainer: Bool

    private let fileManager: FileManager

    init(
        appGroupIdentifier: String = "group.cloud.patina.app",
        fileManager: FileManager = .default,
        fallbackDirectory: URL? = nil
    ) {
        self.fileManager = fileManager

        let groupDirectory = fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        let directory = groupDirectory
            ?? fallbackDirectory
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())

        self.usesAppGroupContainer = groupDirectory != nil
        self.fileURL = directory.appendingPathComponent(Self.fileName)

        if groupDirectory == nil {
            PatinaLog.sync.debug(
                "[Record] App Group container unavailable — snapshot falls back to the app container"
            )
        }
    }

    func save(_ record: HouseRecord) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            try fileManager.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try encoder.encode(record).write(to: fileURL, options: .atomic)
        } catch {
            PatinaLog.sync.error(
                "[Record] snapshot save failed at \(self.fileURL.path): \(error.localizedDescription)"
            )
        }
    }

    /// nil when nothing has been saved, or when what was saved no longer
    /// decodes — a stale shape must not stop the app from launching.
    func load() -> HouseRecord? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            return try decoder.decode(HouseRecord.self, from: data)
        } catch {
            PatinaLog.sync.debug(
                "[Record] snapshot could not be decoded and was ignored: \(error.localizedDescription)"
            )
            return nil
        }
    }
}
