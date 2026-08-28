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
import WidgetKit

final class RecordSnapshotStore: Sendable {

    /// The one file name the app and (from W6) the widget agree on.
    static let fileName = "house-record.json"

    static let shared = RecordSnapshotStore()

    /// Where the snapshot lives. Exposed so a failure can be reported with a
    /// path rather than a shrug.
    let fileURL: URL

    /// The widget's own, smaller file, beside the record in the same
    /// container. It exists because the widget must not be able to read
    /// `needsYou` — see `WidgetSnapshot`.
    let widgetFileURL: URL

    /// False when the App Group container was unreachable and the app
    /// container is being used instead.
    let usesAppGroupContainer: Bool

    private let fileManager: FileManager
    /// One writer at a time. `.atomic` already keeps a torn file off disk; the
    /// lock keeps two builds in one open from interleaving read and write.
    private let lock = NSLock()
    /// Injected so a test can count reloads without a widget being installed.
    /// Production hands `WidgetCenter` the one kind X1's widget declares.
    private let reloadWidgets: @Sendable (String) -> Void
    /// `house-widget`, read the way the widget reads it — from the App Group
    /// mirror, not from `FeatureFlags` itself, which is `@MainActor` and holds
    /// nothing on disk.
    private let flagIsOn: @Sendable () -> Bool

    init(
        appGroupIdentifier: String = "group.cloud.patina.app",
        fileManager: FileManager = .default,
        fallbackDirectory: URL? = nil,
        reloadWidgets: @escaping @Sendable (String) -> Void = { kind in
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        },
        flagIsOn: @escaping @Sendable () -> Bool = { FeatureFlagMirror.isOn(.houseWidget) }
    ) {
        self.fileManager = fileManager
        self.reloadWidgets = reloadWidgets
        self.flagIsOn = flagIsOn

        let groupDirectory = fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        let directory = groupDirectory
            ?? fallbackDirectory
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())

        self.usesAppGroupContainer = groupDirectory != nil
        self.fileURL = directory.appendingPathComponent(Self.fileName)
        self.widgetFileURL = directory.appendingPathComponent(WidgetSnapshot.fileName)

        if groupDirectory == nil {
            PatinaLog.sync.debug(
                "[Record] App Group container unavailable — snapshot falls back to the app container"
            )
        }
    }

    /// Saves the record, then the widget's smaller view of it, then asks
    /// WidgetKit to redraw. One writer, one reload, every path covered.
    ///
    /// - Parameter houseLine: the house rail's first room. Supplied by the
    ///   Today surface through `noteHouseLine`; nil here means "unchanged",
    ///   and the last known line is carried forward rather than erased — a
    ///   record refresh does not know the rail, and a blanked line would read
    ///   on the widget as a house with no rooms.
    func save(_ record: HouseRecord, houseLine: String? = nil, now: Date = Date()) {
        lock.lock()
        let encoder = Self.encoder()
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
        writeWidgetSnapshot(
            WidgetSnapshot(
                record: record,
                houseLine: houseLine ?? readWidgetSnapshot()?.houseLine,
                refreshedAt: now,
                flagOn: flagIsOn()
            )
        )
        lock.unlock()
        reloadWidgets(WidgetSnapshot.widgetKind)
    }

    /// The house rail's first room, as the Today surface knows it. Kept in the
    /// widget file itself, so it survives a cold launch without a second store.
    func noteHouseLine(_ line: String?, now: Date = Date()) {
        lock.lock()
        let current = readWidgetSnapshot()
        guard current?.houseLine != line else {
            lock.unlock()
            return
        }
        writeWidgetSnapshot(
            WidgetSnapshot(
                movedRows: current?.movedRows ?? [],
                houseLine: line,
                refreshedAt: current?.refreshedAt ?? now,
                flagOn: flagIsOn()
            )
        )
        lock.unlock()
        reloadWidgets(WidgetSnapshot.widgetKind)
    }

    /// What the widget would read right now. Product code writes it; this is
    /// here so a test can read the file back through the same coder.
    func loadWidgetSnapshot() -> WidgetSnapshot? {
        lock.lock()
        defer { lock.unlock() }
        return readWidgetSnapshot()
    }

    // MARK: - The widget's file (caller holds the lock)

    private func writeWidgetSnapshot(_ snapshot: WidgetSnapshot) {
        do {
            try fileManager.createDirectory(
                at: widgetFileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try Self.encoder().encode(snapshot).write(to: widgetFileURL, options: .atomic)
        } catch {
            PatinaLog.sync.error(
                "[Record] widget snapshot save failed: \(error.localizedDescription)"
            )
        }
    }

    private func readWidgetSnapshot() -> WidgetSnapshot? {
        guard let data = try? Data(contentsOf: widgetFileURL) else { return nil }
        return try? Self.decoder().decode(WidgetSnapshot.self, from: data)
    }

    private static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    private static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    /// Whether anything is on disk at all — so a caller can tell "no record
    /// yet" from "a record that had to be thrown away".
    var hasSnapshot: Bool {
        fileManager.fileExists(atPath: fileURL.path)
    }

    /// Remove the snapshot entirely. Called at the auth boundary
    /// (`LocalStoreReset`) and by the paint path when the record on disk turns
    /// out to belong to another account — the file is device-global and
    /// outlives a sign-out, so deleting it is the only thing that keeps one
    /// client's record off the next client's home.
    ///
    /// It takes the widget's file with it, and reloads: a signed-out widget
    /// that kept painting the last account's row would be the same leak
    /// `RecordOwner` exists to prevent, in a process that cannot ask who is
    /// signed in. Deletion here is why the widget payload carries no owner id.
    func remove() {
        lock.lock()
        try? fileManager.removeItem(at: fileURL)
        try? fileManager.removeItem(at: widgetFileURL)
        lock.unlock()
        reloadWidgets(WidgetSnapshot.widgetKind)
    }

    /// nil when nothing has been saved, or when what was saved no longer
    /// decodes — a stale shape must not stop the app from launching.
    func load() -> HouseRecord? {
        lock.lock()
        defer { lock.unlock() }
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        do {
            return try Self.decoder().decode(HouseRecord.self, from: data)
        } catch {
            PatinaLog.sync.debug(
                "[Record] snapshot could not be decoded and was ignored: \(error.localizedDescription)"
            )
            return nil
        }
    }
}
