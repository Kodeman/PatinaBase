//  CaptureStore.swift
//  CaptureKit
//
//  Local outbox / CRUD over the SwiftData store. The store lives in the App
//  Group container so the Share and Widget extensions read/write the same DB
//  and the same on-disk media directory.

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

@MainActor
public final class CaptureStore {
    public nonisolated(unsafe) static let appGroupID = "group.cloud.patina.field"

    public static let schema = Schema([
        Specimen.self, CapturePhoto.self, CaptureMeasurement.self, CaptureProjectRef.self,
        ScanUploadRecord.self,  // item 8 — durable resumable upload state (additive)
        SiteRequestOutboxRecord.self
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
    public func newDraft(sessionID: UUID? = nil,
                         owner: CaptureOwnerIdentity? = nil) -> Specimen {
        let s = Specimen(captureSessionID: sessionID, owner: owner)
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

    /// Owner-scoped lookup for real upload and user-facing paths. Legacy rows
    /// (nil owner) and mismatches intentionally resolve as absent.
    public func specimen(id: UUID, owner: CaptureOwnerIdentity) -> Specimen? {
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
    public func insertScanUploadRecord(_ record: ScanUploadRecord) -> ScanUploadRecord {
        context.insert(record)
        try? save()
        return record
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

    /// A scoped visit returns all of its captures, including queued transfers.
    /// The nil legacy query remains drafts + ready for older callers.
    public func session(visitID: UUID? = nil) -> [Specimen] {
        if let visitID {
            let descriptor = FetchDescriptor<Specimen>(
                sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
            let results = (try? context.fetch(descriptor)) ?? []
            return results.filter { $0.captureSessionID == visitID }
        }
        let draft = CaptureStatus.draft.rawValue
        let ready = CaptureStatus.ready.rawValue
        let descriptor = FetchDescriptor<Specimen>(
            predicate: #Predicate { $0.statusRaw == draft || $0.statusRaw == ready },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Owner-scoped visit/list projection for authenticated app surfaces.
    public func session(
        visitID: UUID? = nil,
        owner: CaptureOwnerIdentity
    ) -> [Specimen] {
        session(visitID: visitID).filter {
            owner.matches(
                userID: $0.ownerUserID,
                workspaceID: $0.ownerWorkspaceID
            )
        }
    }

    /// Everything awaiting/failing sync — drained oldest-first (R4/U1).
    public func outbox() -> [Specimen] {
        let ready = CaptureStatus.ready.rawValue
        let queued = CaptureStatus.queued.rawValue
        let uploading = CaptureStatus.uploading.rawValue
        let failed = CaptureStatus.failed.rawValue
        let committed = CaptureStatus.committed.rawValue
        let descriptor = FetchDescriptor<Specimen>(
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
            return ($0.remoteId ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty
        }
    }

    /// Owner-scoped outbox for real sync. Unowned legacy rows are deliberately
    /// quarantined instead of being claimed by whoever signs in next.
    public func outbox(owner: CaptureOwnerIdentity) -> [Specimen] {
        outbox().filter {
            owner.matches(
                userID: $0.ownerUserID,
                workspaceID: $0.ownerWorkspaceID
            )
        }
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

    /// Owner-scoped search/list projection for authenticated app surfaces.
    public func search(
        _ query: SpecimenQuery,
        owner: CaptureOwnerIdentity
    ) -> [Specimen] {
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
    public func missingRequiredMedia(for specimen: Specimen) -> [String] {
        let photos = specimen.photos.sorted { $0.order < $1.order }
        var required = photos.compactMap { photo -> String? in
            let remotePath = photo.remotePath?.trimmingCharacters(
                in: .whitespacesAndNewlines
            ) ?? ""
            return remotePath.isEmpty ? photo.filename : nil
        }
        if let voice = specimen.voiceAudioFilename?.trimmingCharacters(
            in: .whitespacesAndNewlines
        ), !voice.isEmpty {
            required.append(voice)
        }

        return required.filter { filename in
            let fileURL = mediaURL(for: filename)
            let values = try? fileURL.resourceValues(
                forKeys: [.isRegularFileKey, .fileSizeKey]
            )
            return values?.isRegularFile != true || (values?.fileSize ?? 0) <= 0
        }
    }

    public func validateRequiredMedia(for specimen: Specimen) throws {
        let missing = missingRequiredMedia(for: specimen)
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
}
