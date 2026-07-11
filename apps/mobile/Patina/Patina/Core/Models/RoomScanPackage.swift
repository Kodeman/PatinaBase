//
//  RoomScanPackage.swift
//  Patina
//
//  SwiftData row that pairs a local scan bundle directory on disk
//  (Application Support/Scans/{scanId}/) with its per-artifact upload
//  state. Replaces the `usdzData: Data?` blob previously packed inside
//  SyncQueueItem for v2 advanced scans.
//

import Foundation
import SwiftData

/// Overall status of a room scan package — aggregated across artifacts.
public enum RoomScanPackageStatus: String, Codable, Sendable {
    case pending     // bundle on disk, nothing uploaded yet
    case syncing     // at least one artifact has started uploading
    case synced      // all artifacts + photos uploaded, scan status = ready
    case failed      // one or more artifacts failed after max retries
    /// Strict-local hold: bundle is sealed on disk and intentionally NOT
    /// uploaded. This is the only pre-upload resting state for the
    /// local-until-request pipeline — no scan bytes leave the phone until
    /// the user explicitly requests design services. Transitions out of
    /// `heldLocal` only on an explicit user request action; it is never
    /// picked up by `resumePendingUploads` (which fetches syncing/failed
    /// only) and never evicted by `ScanDiskBudget` (which evicts synced
    /// only).
    case heldLocal   // sealed on disk, held for an explicit request
}

@Model
public final class RoomScanPackage {

    // MARK: - Identity

    /// Matches `room_scans.id` server-side and `FirstWalkRoomData.roomId` locally.
    @Attribute(.unique) public var scanId: UUID

    /// Link back to the `RoomModel` this scan belongs to.
    public var roomLocalId: UUID

    /// Relative to `FileManager.default.urls(for: .applicationSupportDirectory, ...)`.
    /// Typical value: `"Scans/{scanId}"`.
    public var bundlePath: String

    /// Matches `ScanManifest.schemaVersion`.
    public var schemaVersion: Int

    /// Total size of the bundle directory in bytes (updated at bundle finalize).
    public var sizeBytes: Int

    /// Remote `rooms.id` once the parent row has been created server-side.
    public var remoteRoomId: UUID?

    // MARK: - Timestamps

    public var createdAt: Date
    public var updatedAt: Date
    public var lastUploadAttemptAt: Date?
    public var syncedAt: Date?

    // MARK: - State

    public var statusRaw: String

    /// JSON-encoded `ScanPackageArtifactState` — per-artifact status + photo counts.
    public var artifactStateJSON: Data

    /// Last error surfaced from any artifact upload.
    public var lastError: String?

    // MARK: - v3 Review-step fields (additive, default-valued for lightweight migration)

    /// Free-form notes captured in the scan review step. Mirrored into
    /// `ScanManifest.Annotations.roomNotes` at finalize time.
    public var userRoomNotes: String = ""

    /// Room name the user provided (or edited) in the scan review step.
    /// Distinct from the auto-inferred `roomName` on `ScanManifest` so we can
    /// tell designer-facing edits apart from capture-time defaults.
    public var userProvidedRoomName: String?

    /// Timestamp of the last review-step completion; nil if the user has not
    /// opened or finished the review flow for this scan.
    public var reviewCompletedAt: Date?

    /// When true, this bundle is excluded from `ScanDiskBudget` eviction
    /// (e.g. user pinned it, or it has a pending upload). Defaults to false.
    public var diskSizeBudgetExempt: Bool = false

    /// Photo the user hand-picked as the hero in the review step. Points at
    /// `ScanManifest.PhotoEntry.id`; nil means "use whatever the scorer chose".
    public var heroPhotoId: UUID?

    // MARK: - Computed

    public var status: RoomScanPackageStatus {
        get { RoomScanPackageStatus(rawValue: statusRaw) ?? .pending }
        set { statusRaw = newValue.rawValue }
    }

    public var artifactState: ScanPackageArtifactState {
        get {
            (try? JSONDecoder().decode(ScanPackageArtifactState.self, from: artifactStateJSON))
                ?? ScanPackageArtifactState()
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                artifactStateJSON = data
                updatedAt = Date()
            }
        }
    }

    // MARK: - Init

    public init(
        scanId: UUID,
        roomLocalId: UUID,
        bundlePath: String,
        schemaVersion: Int = scanBundleSchemaVersion,
        sizeBytes: Int = 0,
        remoteRoomId: UUID? = nil,
        status: RoomScanPackageStatus = .pending,
        artifactState: ScanPackageArtifactState = ScanPackageArtifactState()
    ) {
        self.scanId = scanId
        self.roomLocalId = roomLocalId
        self.bundlePath = bundlePath
        self.schemaVersion = schemaVersion
        self.sizeBytes = sizeBytes
        self.remoteRoomId = remoteRoomId
        self.createdAt = Date()
        self.updatedAt = Date()
        self.lastUploadAttemptAt = nil
        self.syncedAt = nil
        self.statusRaw = status.rawValue
        self.artifactStateJSON = (try? JSONEncoder().encode(artifactState)) ?? Data()
        self.lastError = nil
    }

    // MARK: - Mutations

    public func markSyncing() {
        status = .syncing
        lastUploadAttemptAt = Date()
        updatedAt = Date()
    }

    public func markSynced() {
        status = .synced
        syncedAt = Date()
        updatedAt = Date()
        lastError = nil
    }

    /// Transition into the strict-local hold state. Clears any prior upload
    /// error (e.g. a stale "Waiting for Wi-Fi" breadcrumb from the retired
    /// passive cellular gate) since a held bundle is not an upload failure —
    /// it's an intentional, sealed resting state waiting for an explicit
    /// request. `syncedAt` stays nil; the bundle is not evictable.
    public func markHeldLocal() {
        status = .heldLocal
        syncedAt = nil
        lastError = nil
        updatedAt = Date()
    }

    public func markFailed(_ message: String) {
        status = .failed
        lastError = message
        lastUploadAttemptAt = Date()
        updatedAt = Date()
    }

    /// Merge an updated artifact state back into the row.
    public func updateArtifact(_ state: ArtifactUploadState) {
        var current = artifactState
        if let idx = current.artifacts.firstIndex(where: { $0.kind == state.kind }) {
            current.artifacts[idx] = state
        } else {
            current.artifacts.append(state)
        }
        artifactState = current
    }

    public func incrementPhotosUploaded(by count: Int = 1) {
        var current = artifactState
        current.photosUploaded = min(current.photosTotal, current.photosUploaded + count)
        artifactState = current
    }
}

// MARK: - Fetch descriptors

extension RoomScanPackage {

    public static var needsProcessing: FetchDescriptor<RoomScanPackage> {
        FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { pkg in
                pkg.statusRaw == "pending" || pkg.statusRaw == "syncing" || pkg.statusRaw == "failed"
            },
            sortBy: [SortDescriptor(\.createdAt)]
        )
    }

    public static var syncedItems: FetchDescriptor<RoomScanPackage> {
        FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { pkg in
                pkg.statusRaw == "synced"
            },
            sortBy: [SortDescriptor(\.syncedAt, order: .reverse)]
        )
    }

    /// Bundles the user can attach to a design request: those sealed and
    /// held locally, plus those already uploaded (synced). Excludes the
    /// transient pending/syncing/failed states — a scan is either resting on
    /// the phone (`heldLocal`) or fully on the server (`synced`) before it's
    /// pickable. Newest first by `createdAt`. This is the source of truth for
    /// `ScanPickerView`.
    public static var heldOrSyncedItems: FetchDescriptor<RoomScanPackage> {
        FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { pkg in
                pkg.statusRaw == "heldLocal" || pkg.statusRaw == "synced"
            },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
    }
}

// MARK: - Disk path helpers

extension RoomScanPackage {

    /// Absolute URL of the bundle directory, or nil if the app's Application
    /// Support directory can't be resolved.
    public var absoluteBundleURL: URL? {
        guard let base = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        ) else {
            return nil
        }
        return base.appendingPathComponent(bundlePath, isDirectory: true)
    }
}
