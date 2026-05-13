//
//  RoomScanSyncService.swift
//  Patina
//
//  Service for syncing room scans to Supabase.
//  Handles uploads, offline queue, and retry logic.
//

import Foundation
import SwiftUI
import Combine
import Supabase
import Network
import SwiftData

/// Sync status for room scans
public enum RoomScanSyncStatus: String, Codable {
    case pending = "pending"
    case syncing = "syncing"
    case synced = "synced"
    case failed = "failed"
}

/// Error types for room scan sync
public enum RoomScanSyncError: Error, LocalizedError {
    case notAuthenticated
    case networkError(Error)
    case encodingError(Error)
    case uploadFailed(String)
    case storageError(Error)

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You must be signed in to sync room scans"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Failed to encode scan data: \(error.localizedDescription)"
        case .uploadFailed(let message):
            return "Upload failed: \(message)"
        case .storageError(let error):
            return "Storage error: \(error.localizedDescription)"
        }
    }
}

/// Data structure for Supabase room_scan_images table insert
struct RoomScanImageInsert: Encodable {
    let scanId: UUID
    let role: String
    let isPrimary: Bool
    let displayOrder: Int
    let featureCategory: String?
    let imageUrl: String
    let qualityScore: Float
    let sharpnessScore: Float?
    let brightnessScore: Float?
    let compositionScore: Float?
    let stabilityScore: Float?
    let lightEstimate: Float
    let capturedAt: Date

    enum CodingKeys: String, CodingKey {
        case scanId = "scan_id"
        case role
        case isPrimary = "is_primary"
        case displayOrder = "display_order"
        case featureCategory = "feature_category"
        case imageUrl = "image_url"
        case qualityScore = "quality_score"
        case sharpnessScore = "sharpness_score"
        case brightnessScore = "brightness_score"
        case compositionScore = "composition_score"
        case stabilityScore = "stability_score"
        case lightEstimate = "light_estimate"
        case capturedAt = "captured_at"
    }
}

/// Data structure for Supabase room_scans table insert
struct RoomScanInsert: Encodable {
    let id: UUID
    let user_id: UUID
    let room_id: UUID?
    let project_id: UUID?
    let name: String
    let room_type: String?
    let dimensions: DimensionsJSON
    let floor_area: Double
    let coverage_percentage: Float?
    let features: FeaturesJSON
    let furniture_detected: [FurnitureDetected]
    let style_signals: StyleSignalsJSON
    let suggested_styles: [String]
    let scan_data: ScanDataJSON?
    let thumbnail_url: String?
    let model_url: String?
    let hero_frame_url: String?
    let hero_frame_score: Float?
    let status: String
    let scanned_at: String
    let created_at: String

    struct DimensionsJSON: Encodable {
        let width: Float
        let length: Float
        let height: Float
        let unit: String
    }

    struct FeaturesJSON: Encodable {
        let windows: [FeatureItem]
        let doors: [FeatureItem]
        let other: [FeatureItem]

        struct FeatureItem: Encodable {
            let type: String
            let confidence: Float
            let value: Float?
        }
    }

    struct FurnitureDetected: Encodable {
        let category: String
        let confidence: Float
    }

    struct StyleSignalsJSON: Encodable {
        let naturalLight: Float
        let openness: Float
        let warmth: Float
        let texture: Float
        let timeOfDay: String?
        let lightPreference: String?
        let seatingPreference: String?
        let roomFeeling: String?
        let scanPace: String
    }

    struct ScanDataJSON: Encodable {
        let scanDuration: TimeInterval
        let coveragePercentage: Float
        let completedAt: String
    }
}

/// Data structure for Supabase `rooms` table insert. The mobile app creates a
/// parent `rooms` row so every `room_scans` row has a `room_id` to hang off of,
/// which the server-side triggers (`increment_room_scan_count`) and the
/// designer portal depend on.
struct RoomInsert: Encodable {
    let id: UUID
    let user_id: UUID
    let name: String
    let type: String
    let width_meters: Double?
    let length_meters: Double?
    let height_meters: Double?
    let floor_area_sqm: Double?
    let volume_cbm: Double?
}

/// Patch body used to update `room_scans.model_url` after the USDZ upload
/// completes. The USDZ upload happens separately so the scan row gets patched
/// with the public URL once the file is actually in storage.
private struct RoomScanModelURLPatch: Encodable {
    let model_url: String
}

/// Parameters for the `merge_scan_artifact_sha256(p_scan_id, p_kind, p_sha)`
/// Supabase RPC introduced in migration 00082. The three keys map 1:1 to
/// the function's argument names.
///
/// `nonisolated` + `Sendable` so it can be passed through `rpc(_:params:)`
/// from a TaskGroup closure without tripping the project-wide default
/// `-default-isolation=MainActor` setting.
private nonisolated struct ArtifactShaMergeParams: Encodable, Sendable {
    let p_scan_id: String
    let p_kind: String
    let p_sha: String
}

/// Parameters for the `mark_scan_upload_complete(p_scan_id)` RPC.
private nonisolated struct MarkUploadCompleteParams: Encodable, Sendable {
    let p_scan_id: String
}

/// Reusable single-arg RPC parameter struct.
private nonisolated struct ScanIdOnlyParams: Encodable, Sendable {
    let p_scan_id: String
}

/// Body for the `confirm-scan-bundle` edge function (Wave 5.1). The function
/// ingests the scan id and runs server-side validation of the uploaded
/// bundle (hash matching, row presence, etc.).
private nonisolated struct ConfirmScanBundleRequest: Encodable, Sendable {
    let scan_id: String
}

/// Generic single-column patch for v2 advanced scan URLs.
private struct RoomScanStringPatch: Encodable {
    let column: String
    let value: String

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicKey.self)
        try container.encode(value, forKey: DynamicKey(stringValue: column))
    }

    private struct DynamicKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
}

/// Insert body for the v2 `room_scans` row. Extends the v1 struct with the
/// bundle-level URL columns + device metadata.
struct RoomScanV2Insert: Encodable {
    let id: UUID
    let user_id: UUID
    let room_id: UUID?
    let project_id: UUID?
    let name: String
    let room_type: String?
    let dimensions: RoomScanInsert.DimensionsJSON
    let floor_area: Double
    let coverage_percentage: Float?
    let features: RoomScanInsert.FeaturesJSON
    let furniture_detected: [RoomScanInsert.FurnitureDetected]
    let style_signals: RoomScanInsert.StyleSignalsJSON
    let suggested_styles: [String]
    let scan_data: RoomScanInsert.ScanDataJSON?
    let thumbnail_url: String?
    let model_url: String?
    let hero_frame_url: String?
    let hero_frame_score: Float?
    // v2-only
    let scan_schema_version: Int
    let device_model: String?
    let os_version: String?
    let has_lidar: Bool?
    let scan_bundle_size_bytes: Int?
    let capture_environment: CaptureEnvironmentJSON?
    let status: String
    let scanned_at: String
    let created_at: String

    struct CaptureEnvironmentJSON: Encodable {
        let lightEstimate: Double?
        let thermalState: String?
        let batteryLevel: Double?
        let motionQuality: String?
    }
}

/// Routes `BackgroundScanUploader` progress + completion callbacks back to
/// the `RoomScanSyncService` continuations that kicked the upload off.
///
/// One instance is owned by `RoomScanSyncService`. Waiters register a
/// continuation keyed by `(scanId, artifactKind)` before enqueueing the
/// descriptor; the uploader delegate invokes `resolve(...)` on completion
/// which pops the entry and resumes exactly once. This lets the strict
/// orchestration in `uploadArtifactsBoundedConcurrency` (TaskGroup / bounded
/// in-flight window) await the background URLSession path without
/// rewriting the top-level flow.
@MainActor
private final class UploadCompletionRouter {
    private var continuations: [String: CheckedContinuation<Void, Error>] = [:]

    private static func key(scanId: UUID, kind: String) -> String {
        "\(scanId.uuidString)-\(kind)"
    }

    func register(
        scanId: UUID,
        kind: String,
        continuation: CheckedContinuation<Void, Error>
    ) {
        let k = Self.key(scanId: scanId, kind: kind)
        // If a duplicate enqueue sneaks in, fail the new waiter rather than
        // orphan the old one — the bounded-concurrency loop won't re-enter
        // for the same kind in practice, but better safe than wedged.
        if let existing = continuations.removeValue(forKey: k) {
            existing.resume(throwing: BackgroundScanUploader.UploadError.cancelled)
        }
        continuations[k] = continuation
    }

    func resolve(
        scanId: UUID,
        kind: String,
        result: Result<Void, BackgroundScanUploader.UploadError>
    ) {
        let k = Self.key(scanId: scanId, kind: kind)
        guard let cont = continuations.removeValue(forKey: k) else { return }
        switch result {
        case .success: cont.resume()
        case .failure(let err): cont.resume(throwing: err)
        }
    }
}

/// Service for syncing room scans to Supabase
@MainActor
public final class RoomScanSyncService: ObservableObject {

    public static let shared = RoomScanSyncService()

    /// UserDefaults key controlling whether large scan artifacts may upload
    /// on cellular / metered networks. When `false` (default), the cellular
    /// gate defers uploads until the path reports `!isExpensive`.
    public static let cellularOptInKey = "patina.scanUploadOnCellularEnabled"

    // MARK: - Published State

    @Published public private(set) var isSyncing = false
    @Published public private(set) var lastError: RoomScanSyncError?
    @Published public private(set) var pendingUploads: Int = 0
    @Published public private(set) var isNetworkAvailable = true

    // MARK: - Private State

    private let storageBucket = "room-scan-thumbnails"
    private let usdzBucket = "room-scans"
    private let heroFrameBucket = "room-hero-frames"
    private var uploadQueue: [QueuedUpload] = []

    // Network monitoring
    private let networkMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.patina.networkMonitor")

    /// Last observed `NWPath.isExpensive`. Used by `startNetworkMonitoring`
    /// to detect expensive→cheap transitions (e.g. LTE → Wi-Fi) so that
    /// scans deferred by the cellular gate can resume automatically.
    private var lastPathWasExpensive: Bool = false

    /// Thread-safe snapshot of the most recent `NWPath`. `NWPathMonitor` is
    /// otherwise the only source of truth, but its `currentPath` is only
    /// reliably populated after `start(queue:)` has published the first
    /// update — we read the cached copy instead.
    private var cachedIsExpensive: Bool { lastPathWasExpensive }

    // SwiftData context for persistent queue
    private var modelContext: ModelContext?
    private var isConfigured = false

    // Router for BackgroundScanUploader continuations. Each in-flight
    // artifact upload via the background URLSession path parks its waiter
    // here, keyed by (scanId, artifactKind).
    private let uploadRouter = UploadCompletionRouter()

    private struct QueuedUpload {
        let roomData: FirstWalkRoomData
        let styleSignals: FirstWalkStyleSignals
        let projectId: UUID?
        var retryCount: Int = 0
    }

    // MARK: - Initialization

    private init() {
        // Wire BackgroundScanUploader callbacks to the router / progress
        // surface. The uploader dispatches these on the main actor.
        BackgroundScanUploader.shared.onCompletion = { [weak self] scanId, kind, result in
            self?.uploadRouter.resolve(scanId: scanId, kind: kind, result: result)
        }
        BackgroundScanUploader.shared.onProgress = { [weak self] scanId, kind, pct in
            self?.applyBackgroundProgress(scanId: scanId, kind: kind, progress: pct)
        }
    }

    // MARK: - Configuration

    /// Configure the sync service with a model context for persistent queue
    /// Call this from PatinaApp on launch
    public func configure(modelContext: ModelContext) {
        guard !isConfigured else { return }

        self.modelContext = modelContext
        self.isConfigured = true

        // Start network monitoring
        startNetworkMonitoring()

        // Process any pending items from previous sessions
        Task {
            await countPendingItems()
            await processQueueIfOnline()
        }
    }

    private func startNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            let isExpensiveNow = path.isExpensive
            Task { @MainActor in
                guard let self else { return }
                let wasAvailable = self.isNetworkAvailable
                let wasExpensive = self.lastPathWasExpensive
                self.isNetworkAvailable = (path.status == .satisfied)
                self.lastPathWasExpensive = isExpensiveNow

                // Just-came-online path: drain persistent queue + resume any
                // advanced scan bundles we deferred while offline.
                if !wasAvailable && path.status == .satisfied {
                    await self.processQueueIfOnline()
                    if let ctx = self.modelContext {
                        await self.resumePendingUploads(in: ctx)
                    }
                }

                // Expensive → cheap (e.g. LTE → Wi-Fi) transition: resume
                // any scans that the cellular gate deferred. The opt-in
                // flag may or may not be set — `uploadAdvancedScanBundle`
                // re-checks the gate on entry so it's safe either way.
                if wasExpensive && !isExpensiveNow, let ctx = self.modelContext {
                    await self.resumePendingUploads(in: ctx)
                }
            }
        }
        networkMonitor.start(queue: monitorQueue)
    }

    deinit {
        networkMonitor.cancel()
    }

    // MARK: - Public Methods

    /// Result of a successful room scan upload: the parent room id the scan
    /// is bound to, plus the scan id itself. Callers use both to update the
    /// local `RoomModel` so the UI, the sync queue, and the designer portal
    /// agree on which rooms have been persisted remotely.
    public struct UploadResult: Sendable {
        public let roomId: UUID
        public let scanId: UUID
    }

    /// Upload a room scan to Supabase.
    ///
    /// The server schema has two tables: `rooms` (the parent entity the
    /// designer portal lists) and `room_scans` (individual capture sessions
    /// that hang off a room). Earlier versions of this service only inserted
    /// into `room_scans`, leaving scans orphaned without a `room_id`. This
    /// version creates/updates the parent room first, then inserts the scan
    /// with `room_id` linked, then patches `model_url` after any USDZ upload.
    ///
    /// - Parameters:
    ///   - roomData: The captured room data
    ///   - styleSignals: The computed style signals
    ///   - thumbnail: Optional thumbnail image
    ///   - projectId: Optional project to associate with
    ///   - existingRoomRemoteId: When provided, a rescan of an existing room;
    ///     we insert a new scan row but reuse the existing parent room.
    ///   - usdzData: Optional USDZ model data to upload and link via
    ///     `room_scans.model_url`.
    /// - Returns: The remote room id and scan id.
    @discardableResult
    public func uploadRoomScan(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        thumbnail: UIImage? = nil,
        projectId: UUID? = nil,
        existingRoomRemoteId: UUID? = nil,
        usdzData: Data? = nil
    ) async throws -> UploadResult {
        isSyncing = true
        lastError = nil

        defer { isSyncing = false }

        // Wait for auth state to be ready before checking user
        await AuthService.shared.waitForAuthReady()

        // Get current user
        guard let userId = await getCurrentUserId() else {
            // User genuinely not authenticated (not a race condition)
            let error = RoomScanSyncError.notAuthenticated
            lastError = error
            throw error
        }

        // 1. Ensure a parent `rooms` row exists. Either reuse the one the
        //    caller passed (for rescans) or insert a new one tied to the
        //    scanned data's dimensions. The scan's room_id points here.
        let roomId: UUID
        if let existing = existingRoomRemoteId {
            roomId = existing
        } else {
            do {
                roomId = try await insertRoom(
                    roomData: roomData,
                    userId: userId
                )
            } catch {
                let syncError = RoomScanSyncError.networkError(error)
                lastError = syncError
                throw syncError
            }
        }

        // 2. Upload thumbnail if provided (non-fatal).
        var thumbnailUrl: String? = nil
        if let thumbnail = thumbnail {
            do {
                thumbnailUrl = try await uploadThumbnail(thumbnail, roomId: roomData.roomId)
            } catch {
                print("[RoomScanSync] thumbnail upload failed: \(error)")
            }
        }

        // 3. Upload hero frame if available (non-fatal).
        var heroFrameUrl: String? = nil
        if let heroFrameData = roomData.heroFrameData {
            do {
                heroFrameUrl = try await uploadHeroFrame(heroFrameData, roomId: roomData.roomId, userId: userId)
            } catch {
                print("[RoomScanSync] hero frame upload failed: \(error)")
            }
        }

        // 4. Insert the scan row with room_id linked.
        let insert = createInsertData(
            roomData: roomData,
            styleSignals: styleSignals,
            userId: userId,
            remoteRoomId: roomId,
            projectId: projectId,
            thumbnailUrl: thumbnailUrl,
            modelUrl: nil,
            heroFrameUrl: heroFrameUrl,
            heroFrameScore: roomData.heroFrameScore
        )

        do {
            try await supabase
                .from("room_scans")
                .insert(insert)
                .execute()
        } catch {
            let syncError = RoomScanSyncError.networkError(error)
            lastError = syncError
            throw syncError
        }

        // 5. Upload USDZ (non-fatal) and patch `room_scans.model_url`.
        if let usdzData = usdzData {
            if let modelUrl = try? await uploadUSDZ(usdzData, roomId: roomData.roomId, userId: userId) {
                try? await patchScanModelURL(scanId: roomData.roomId, modelUrl: modelUrl)
            }
        }

        return UploadResult(roomId: roomId, scanId: roomData.roomId)
    }

    /// Insert a `rooms` row for the captured scan. Returns the row id.
    private func insertRoom(
        roomData: FirstWalkRoomData,
        userId: UUID
    ) async throws -> UUID {
        let width = Double(roomData.dimensions.width)
        let length = Double(roomData.dimensions.length)
        let height = Double(roomData.dimensions.height)
        let insert = RoomInsert(
            id: roomData.roomId,
            user_id: userId,
            name: roomData.roomName.isEmpty ? "New Room" : roomData.roomName,
            type: "other",
            width_meters: width,
            length_meters: length,
            height_meters: height,
            floor_area_sqm: width * length,
            volume_cbm: width * length * height
        )

        try await supabase
            .from("rooms")
            .insert(insert)
            .execute()
        return roomData.roomId
    }

    /// Patch `room_scans.model_url` once a USDZ file has been uploaded.
    private func patchScanModelURL(scanId: UUID, modelUrl: String) async throws {
        try await supabase
            .from("room_scans")
            .update(RoomScanModelURLPatch(model_url: modelUrl))
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    /// Queue a room scan for upload (for offline support)
    public func queueUpload(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        projectId: UUID? = nil
    ) {
        let upload = QueuedUpload(
            roomData: roomData,
            styleSignals: styleSignals,
            projectId: projectId
        )
        uploadQueue.append(upload)
        pendingUploads = uploadQueue.count
    }

    /// Process any queued uploads (in-memory queue)
    public func processQueue() async {
        guard !uploadQueue.isEmpty else { return }

        var failedUploads: [QueuedUpload] = []

        for var upload in uploadQueue {
            do {
                _ = try await uploadRoomScan(
                    roomData: upload.roomData,
                    styleSignals: upload.styleSignals,
                    projectId: upload.projectId
                )
            } catch {
                upload.retryCount += 1
                if upload.retryCount < 3 {
                    failedUploads.append(upload)
                }
            }
        }

        uploadQueue = failedUploads
        pendingUploads = uploadQueue.count
    }

    // MARK: - Persistent Queue Methods

    /// Queue a room scan for persistent upload (survives app restarts)
    /// - Parameters:
    ///   - roomData: The captured room data
    ///   - styleSignals: The computed style signals
    ///   - usdzData: Optional USDZ model data
    ///   - thumbnailData: Optional thumbnail image data
    public func queueUploadPersistent(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        usdzData: Data? = nil,
        thumbnailData: Data? = nil
    ) async throws {
        guard let context = modelContext else {
            // Fall back to in-memory queue
            queueUpload(roomData: roomData, styleSignals: styleSignals)
            return
        }

        do {
            let queueItem = try SyncQueueItem.create(
                roomData: roomData,
                styleSignals: styleSignals,
                usdzData: usdzData,
                thumbnailData: thumbnailData
            )

            context.insert(queueItem)
            try context.save()

            await countPendingItems()

            // Try immediate sync if online
            if isNetworkAvailable {
                await processSingleItem(queueItem)
            }
        } catch {
            lastError = .encodingError(error)
            throw error
        }
    }

    /// Process persistent queue if network is available
    public func processQueueIfOnline() async {
        guard isNetworkAvailable, let context = modelContext else { return }

        do {
            let descriptor = SyncQueueItem.itemsNeedingProcessing
            let items = try context.fetch(descriptor)

            for item in items where item.canRetry {
                await processSingleItem(item)
                // Small delay between uploads
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        } catch {
            print("Failed to fetch queue items: \(error)")
        }

        await countPendingItems()
    }

    /// Process a single queue item
    private func processSingleItem(_ item: SyncQueueItem) async {
        item.markSyncing()
        try? modelContext?.save()

        do {
            let roomData = try item.decodeRoomData()
            let styleSignals = try item.decodeStyleSignals()

            // Upload room scan data (creates parent room, inserts scan,
            // uploads USDZ inside the same call so model_url gets linked).
            let result = try await uploadRoomScan(
                roomData: roomData,
                styleSignals: styleSignals,
                thumbnail: nil,
                projectId: nil,
                existingRoomRemoteId: item.roomId,
                usdzData: item.usdzData
            )

            // Stash the parent room id back on the queue item so a retry of
            // the same row reuses the same parent rather than creating a
            // duplicate rooms row.
            item.roomId = result.roomId
            item.markSynced()
            try? modelContext?.save()

        } catch {
            item.markFailed(error: error.localizedDescription)
            try? modelContext?.save()
        }

        await countPendingItems()
    }

    /// Count pending items in the persistent queue
    private func countPendingItems() async {
        guard let context = modelContext else {
            pendingUploads = uploadQueue.count
            return
        }

        do {
            let descriptor = FetchDescriptor<SyncQueueItem>(
                predicate: #Predicate { item in
                    item.statusRaw == "pending" || item.statusRaw == "syncing"
                }
            )
            let count = try context.fetchCount(descriptor)
            pendingUploads = count + uploadQueue.count
        } catch {
            pendingUploads = uploadQueue.count
        }
    }

    // MARK: - USDZ Upload

    /// Upload USDZ model data to Supabase Storage and return its public URL.
    ///
    /// Overload that takes an explicit `userId` so the caller (which has
    /// already resolved it once) doesn't need to round-trip through the auth
    /// session again.
    @discardableResult
    private func uploadUSDZ(_ data: Data, roomId: UUID, userId: UUID) async throws -> String {
        let path = "usdz/\(userId.uuidString)/\(roomId.uuidString)/scan.usdz"
        do {
            try await supabase.storage
                .from(usdzBucket)
                .upload(path, data: data, options: FileOptions(contentType: "model/vnd.usdz+zip"))
            let publicUrl = try supabase.storage.from(usdzBucket).getPublicURL(path: path)
            print("[RoomScanSync] USDZ uploaded: \(path)")
            return publicUrl.absoluteString
        } catch {
            print("[RoomScanSync] USDZ upload failed: \(error)")
            throw RoomScanSyncError.storageError(error)
        }
    }

    /// Legacy USDZ upload used by the persistent queue path. Resolves the
    /// current user, swallows errors so the surrounding sync does not fail,
    /// and returns the public URL on success.
    @discardableResult
    private func uploadUSDZ(_ data: Data, roomId: UUID) async throws -> String? {
        guard let userId = await getCurrentUserId() else {
            throw RoomScanSyncError.notAuthenticated
        }
        return try? await uploadUSDZ(data, roomId: roomId, userId: userId)
    }

    /// Get public URL for a USDZ model
    public func getUSDZUrl(userId: UUID, roomId: UUID) throws -> URL {
        let path = "usdz/\(userId.uuidString)/\(roomId.uuidString)/scan.usdz"
        return try supabase.storage.from(usdzBucket).getPublicURL(path: path)
    }

    // MARK: - Hero Frame Upload

    /// Upload hero frame image data to Supabase Storage
    /// - Parameters:
    ///   - data: The HEIC/JPEG image data
    ///   - roomId: The room scan ID
    ///   - userId: The user ID
    /// - Returns: The public URL of the uploaded hero frame
    private func uploadHeroFrame(_ data: Data, roomId: UUID, userId: UUID) async throws -> String {
        // Determine content type based on data header
        let contentType: String
        if data.prefix(4).elementsEqual([0x00, 0x00, 0x00, 0x00]) || data.prefix(8).elementsEqual([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]) {
            contentType = "image/heic"
        } else if data.prefix(3).elementsEqual([0xFF, 0xD8, 0xFF]) {
            contentType = "image/jpeg"
        } else {
            contentType = "image/jpeg" // Default
        }

        let fileExtension = contentType == "image/heic" ? "heic" : "jpg"
        let path = "\(userId.uuidString)/\(roomId.uuidString)/hero.\(fileExtension)"

        do {
            try await supabase.storage
                .from(heroFrameBucket)
                .upload(path, data: data, options: FileOptions(contentType: contentType))

            // Get public URL
            let publicUrl = try supabase.storage
                .from(heroFrameBucket)
                .getPublicURL(path: path)

            print("Hero frame uploaded successfully: \(path)")
            return publicUrl.absoluteString
        } catch {
            print("Hero frame upload failed: \(error)")
            throw RoomScanSyncError.storageError(error)
        }
    }

    /// Download hero frame from cloud storage
    /// - Parameters:
    ///   - heroFrameUrl: The URL of the hero frame
    /// - Returns: The image data
    public func downloadHeroFrame(from heroFrameUrl: String) async throws -> Data {
        guard let url = URL(string: heroFrameUrl) else {
            throw RoomScanSyncError.uploadFailed("Invalid hero frame URL")
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return data
        } catch {
            throw RoomScanSyncError.networkError(error)
        }
    }

    // MARK: - Multi-Image Upload

    /// Maximum concurrent image uploads
    private static let maxConcurrentUploads = 3

    /// Upload multiple room images to Supabase Storage sequentially
    /// - Parameters:
    ///   - images: The selected images to upload
    ///   - roomId: The room scan ID
    ///   - userId: The user ID
    /// - Returns: Dictionary mapping image ID to cloud URL
    public func uploadRoomImages(
        _ images: [SelectedImage],
        roomId: UUID,
        userId: UUID
    ) async throws -> [UUID: String] {
        guard !images.isEmpty else { return [:] }

        var results: [UUID: String] = [:]

        for image in images {
            guard let imageData = image.imageData else { continue }

            let filename: String
            if image.isPrimary {
                filename = "hero"
            } else {
                filename = "supporting_\(image.displayOrder - 1)"
            }

            let path = "\(userId.uuidString)/\(roomId.uuidString)/\(filename).heic"

            do {
                try await supabase.storage
                    .from(heroFrameBucket)
                    .upload(path, data: imageData, options: FileOptions(contentType: "image/heic"))

                let publicUrl = try supabase.storage
                    .from(heroFrameBucket)
                    .getPublicURL(path: path)

                results[image.id] = publicUrl.absoluteString
            } catch {
                print("Failed to upload image \(filename): \(error)")
                // Continue with other uploads
            }
        }

        return results
    }

    /// Insert room scan images into the database
    /// - Parameters:
    ///   - scanId: The room scan ID
    ///   - images: The selected images with metadata
    ///   - imageUrls: Mapping of image ID to cloud URL
    public func insertRoomScanImages(
        scanId: UUID,
        images: [SelectedImage],
        imageUrls: [UUID: String]
    ) async throws {
        var inserts: [RoomScanImageInsert] = []

        for image in images {
            guard let url = imageUrls[image.id] else { continue }

            let insert = RoomScanImageInsert(
                scanId: scanId,
                role: image.role.rawValue,
                isPrimary: image.isPrimary,
                displayOrder: image.displayOrder,
                featureCategory: image.associatedFeature?.rawValue,
                imageUrl: url,
                qualityScore: image.qualityScore,
                sharpnessScore: image.frame.sharpnessScore,
                brightnessScore: image.frame.brightnessScore,
                compositionScore: image.frame.compositionScore,
                stabilityScore: image.frame.stabilityScore,
                lightEstimate: image.frame.lightEstimate,
                capturedAt: image.capturedAt
            )

            inserts.append(insert)
        }

        guard !inserts.isEmpty else { return }

        try await supabase
            .from("room_scan_images")
            .insert(inserts)
            .execute()
    }

    /// Upload room scan with multi-image collection
    /// - Parameters:
    ///   - roomData: The captured room data including image collection
    ///   - styleSignals: The computed style signals
    ///   - thumbnail: Optional thumbnail image
    ///   - projectId: Optional project to associate with
    /// - Returns: The remote room and scan ids on success.
    @discardableResult
    public func uploadRoomScanWithImages(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        thumbnail: UIImage? = nil,
        projectId: UUID? = nil,
        existingRoomRemoteId: UUID? = nil
    ) async throws -> UploadResult {
        isSyncing = true
        lastError = nil

        defer { isSyncing = false }

        await AuthService.shared.waitForAuthReady()

        guard let userId = await getCurrentUserId() else {
            let error = RoomScanSyncError.notAuthenticated
            lastError = error
            throw error
        }

        // 1. Ensure a parent rooms row.
        let roomId: UUID
        if let existing = existingRoomRemoteId {
            roomId = existing
        } else {
            do {
                roomId = try await insertRoom(roomData: roomData, userId: userId)
            } catch {
                let syncError = RoomScanSyncError.networkError(error)
                lastError = syncError
                throw syncError
            }
        }

        // 2. Thumbnail (non-fatal).
        var thumbnailUrl: String? = nil
        if let thumbnail = thumbnail {
            thumbnailUrl = try? await uploadThumbnail(thumbnail, roomId: roomData.roomId)
        }

        // 3. Handle multi-image collection or legacy single hero frame.
        var heroFrameUrl: String? = nil
        var imageUrls: [UUID: String] = [:]

        if let imageCollection = roomData.imageCollection, !imageCollection.isEmpty {
            imageUrls = (try? await uploadRoomImages(
                imageCollection.allImages,
                roomId: roomData.roomId,
                userId: userId
            )) ?? [:]

            if let heroImage = imageCollection.heroImage {
                heroFrameUrl = imageUrls[heroImage.id]
            }
        } else if let heroFrameData = roomData.heroFrameData {
            heroFrameUrl = try? await uploadHeroFrame(
                heroFrameData,
                roomId: roomData.roomId,
                userId: userId
            )
        }

        // 4. Insert scan row with room_id linked.
        let insert = createInsertData(
            roomData: roomData,
            styleSignals: styleSignals,
            userId: userId,
            remoteRoomId: roomId,
            projectId: projectId,
            thumbnailUrl: thumbnailUrl,
            modelUrl: nil,
            heroFrameUrl: heroFrameUrl,
            heroFrameScore: roomData.heroFrameScore
        )

        do {
            try await supabase
                .from("room_scans")
                .insert(insert)
                .execute()

            // Insert individual images to room_scan_images table
            if let imageCollection = roomData.imageCollection, !imageUrls.isEmpty {
                try await insertRoomScanImages(
                    scanId: roomData.roomId,
                    images: imageCollection.allImages,
                    imageUrls: imageUrls
                )
            }

            return UploadResult(roomId: roomId, scanId: roomData.roomId)
        } catch {
            let syncError = RoomScanSyncError.networkError(error)
            lastError = syncError
            throw syncError
        }
    }

    /// Retry all failed items
    public func retryFailedItems() async {
        guard let context = modelContext else { return }

        do {
            let descriptor = SyncQueueItem.failedItems
            let items = try context.fetch(descriptor)

            for item in items where item.canRetry {
                item.resetForRetry()
            }

            try context.save()
            await processQueueIfOnline()
        } catch {
            print("Failed to retry items: \(error)")
        }
    }

    /// Clear all synced items from the queue
    public func clearSyncedItems() async {
        guard let context = modelContext else { return }

        do {
            let descriptor = FetchDescriptor<SyncQueueItem>(
                predicate: #Predicate { item in
                    item.statusRaw == "synced"
                }
            )
            let items = try context.fetch(descriptor)

            for item in items {
                context.delete(item)
            }

            try context.save()
        } catch {
            print("Failed to clear synced items: \(error)")
        }
    }

    /// Fetch room scans for the current user
    public func fetchRoomScans() async throws -> [RoomScanResponse] {
        guard await getCurrentUserId() != nil else {
            throw RoomScanSyncError.notAuthenticated
        }

        do {
            let response: [RoomScanResponse] = try await supabase
                .from("room_scans")
                .select()
                .order("created_at", ascending: false)
                .execute()
                .value

            return response
        } catch {
            throw RoomScanSyncError.networkError(error)
        }
    }

    /// Update the status of a room scan
    public func updateScanStatus(scanId: UUID, status: String) async throws {
        try await supabase
            .from("room_scans")
            .update(["status": status, "processed_at": ISO8601DateFormatter().string(from: Date())])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    // MARK: - Private Methods

    private func getCurrentUserId() async -> UUID? {
        do {
            let session = try await supabase.auth.session
            return session.user.id
        } catch {
            return nil
        }
    }

    private func uploadThumbnail(_ image: UIImage, roomId: UUID) async throws -> String {
        guard let imageData = image.jpegData(compressionQuality: 0.7) else {
            throw RoomScanSyncError.encodingError(NSError(domain: "ImageConversion", code: -1))
        }

        let fileName = "\(roomId.uuidString).jpg"
        let path = "thumbnails/\(fileName)"

        do {
            try await supabase.storage
                .from(storageBucket)
                .upload(path, data: imageData, options: FileOptions(contentType: "image/jpeg"))

            // Get public URL
            let publicUrl = try supabase.storage
                .from(storageBucket)
                .getPublicURL(path: path)

            return publicUrl.absoluteString
        } catch {
            throw RoomScanSyncError.storageError(error)
        }
    }

    private func createInsertData(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        userId: UUID,
        remoteRoomId: UUID?,
        projectId: UUID?,
        thumbnailUrl: String?,
        modelUrl: String?,
        heroFrameUrl: String?,
        heroFrameScore: Float?
    ) -> RoomScanInsert {
        let dateFormatter = ISO8601DateFormatter()

        // Map detected features to JSON structure
        var windows: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        var doors: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        var other: [RoomScanInsert.FeaturesJSON.FeatureItem] = []

        for feature in roomData.detectedFeatures {
            let item = RoomScanInsert.FeaturesJSON.FeatureItem(
                type: feature.category.rawValue,
                confidence: feature.confidence,
                value: feature.value
            )

            switch feature.category {
            case .window, .largeWindow:
                windows.append(item)
            case .door:
                doors.append(item)
            default:
                other.append(item)
            }
        }

        // Map furniture detected
        let furniture = roomData.detectedFeatures
            .filter { $0.category == .seatingArea || $0.category == .bookshelf }
            .map { RoomScanInsert.FurnitureDetected(category: $0.category.rawValue, confidence: $0.confidence) }

        // Determine suggested styles based on signals
        let suggestedStyles = determineSuggestedStyles(from: styleSignals)

        return RoomScanInsert(
            id: roomData.roomId,
            user_id: userId,
            room_id: remoteRoomId,
            project_id: projectId,
            name: roomData.roomName,
            room_type: nil, // Will be set by RoomModel
            dimensions: RoomScanInsert.DimensionsJSON(
                width: roomData.dimensions.width,
                length: roomData.dimensions.length,
                height: roomData.dimensions.height,
                unit: "meters"
            ),
            floor_area: Double(roomData.dimensions.area),
            coverage_percentage: roomData.coveragePercentage,
            features: RoomScanInsert.FeaturesJSON(
                windows: windows,
                doors: doors,
                other: other
            ),
            furniture_detected: furniture,
            style_signals: RoomScanInsert.StyleSignalsJSON(
                naturalLight: styleSignals.naturalLight,
                openness: styleSignals.openness,
                warmth: styleSignals.warmth,
                texture: styleSignals.texture,
                timeOfDay: styleSignals.timeOfDay?.rawValue,
                lightPreference: styleSignals.lightPreference?.rawValue,
                seatingPreference: styleSignals.seatingPreference?.rawValue,
                roomFeeling: styleSignals.roomFeeling,
                scanPace: styleSignals.scanPace.rawValue
            ),
            suggested_styles: suggestedStyles,
            scan_data: RoomScanInsert.ScanDataJSON(
                scanDuration: roomData.scanDuration,
                coveragePercentage: roomData.coveragePercentage,
                completedAt: dateFormatter.string(from: roomData.completedAt)
            ),
            thumbnail_url: thumbnailUrl,
            model_url: modelUrl,
            hero_frame_url: heroFrameUrl,
            hero_frame_score: heroFrameScore,
            status: "ready",
            scanned_at: dateFormatter.string(from: roomData.completedAt),
            created_at: dateFormatter.string(from: Date())
        )
    }

    private func determineSuggestedStyles(from signals: FirstWalkStyleSignals) -> [String] {
        var styles: [String] = []

        // High natural light suggests certain styles
        if signals.naturalLight > 0.7 {
            styles.append("scandinavian")
            styles.append("coastal")
        }

        // High warmth suggests cozy styles
        if signals.warmth > 0.7 {
            styles.append("rustic")
            styles.append("traditional")
        }

        // High openness suggests minimal styles
        if signals.openness > 0.7 {
            styles.append("minimalist")
            styles.append("modern")
        }

        // High texture suggests layered styles
        if signals.texture > 0.7 {
            styles.append("bohemian")
            styles.append("eclectic")
        }

        // Default if no strong signals
        if styles.isEmpty {
            styles.append("transitional")
        }

        return Array(Set(styles)) // Remove duplicates
    }
}

// MARK: - Advanced Scan (v2) Uploads

extension RoomScanSyncService {

    /// Upload an advanced-scan bundle end-to-end.
    ///
    /// Reads the manifest from disk, creates the parent `rooms` row (if new),
    /// inserts the `room_scans` row with v2 columns, then iterates every
    /// artifact in the manifest, uploading it to Supabase Storage and
    /// PATCHing the matching URL column. Photo metadata is inserted with full
    /// camera pose into `room_scan_images`. `room_features` rows are
    /// derived from the CapturedRoom parametric JSON when available.
    ///
    /// Per-artifact state is tracked on `RoomScanPackage.artifactState` so
    /// the upload is resumable if the app is killed mid-way.
    @discardableResult
    public func uploadAdvancedScanBundle(
        package: RoomScanPackage,
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        projectId: UUID? = nil
    ) async throws -> UploadResult {
        // Cellular gate: when on a metered network and the user hasn't
        // opted in, park the package in .pending with a "Waiting for Wi-Fi"
        // breadcrumb. `startNetworkMonitoring` will re-enter this method
        // via `resumePendingUploads` on the next expensive→cheap
        // transition. We deliberately do NOT throw — the UI treats this as
        // a benign deferred state, not a failure.
        if cachedIsExpensive,
           !UserDefaults.standard.bool(forKey: Self.cellularOptInKey) {
            package.status = .pending
            package.lastError = "Waiting for Wi-Fi"
            try? modelContext?.save()
            print("[RoomScanSync] deferred scan \(package.scanId) — on cellular without opt-in")
            return UploadResult(
                roomId: package.remoteRoomId ?? roomData.roomId,
                scanId: package.scanId
            )
        }

        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        await AuthService.shared.waitForAuthReady()
        guard let userId = await getCurrentUserId() else {
            let err = RoomScanSyncError.notAuthenticated
            lastError = err
            throw err
        }

        guard let bundleURL = package.absoluteBundleURL,
              FileManager.default.fileExists(atPath: bundleURL.path) else {
            let err = RoomScanSyncError.uploadFailed("Bundle directory missing at \(package.bundlePath)")
            lastError = err
            throw err
        }

        let manifest: ScanManifest
        do {
            manifest = try ScanBundleWriter.readManifest(at: bundleURL)
        } catch {
            let err = RoomScanSyncError.encodingError(error)
            lastError = err
            throw err
        }

        // 1. Ensure parent rooms row.
        let roomId: UUID
        if let existing = package.remoteRoomId {
            roomId = existing
        } else {
            do {
                roomId = try await insertRoom(roomData: roomData, userId: userId)
                package.remoteRoomId = roomId
            } catch {
                let err = RoomScanSyncError.networkError(error)
                lastError = err
                package.markFailed(err.localizedDescription)
                throw err
            }
        }

        package.markSyncing()

        // 2. Insert / upsert the scan row with v2 columns. The additional
        //    upload_started_at / upload_attempt_count / status="uploading"
        //    fields land via a follow-up PATCH so we can keep the insert
        //    struct strongly typed. (Migration 00082 introduces these
        //    columns; until it lands the PATCH is a runtime no-op.)
        let insert = buildV2Insert(
            roomData: roomData,
            styleSignals: styleSignals,
            userId: userId,
            remoteRoomId: roomId,
            projectId: projectId,
            manifest: manifest
        )

        do {
            try await supabase
                .from("room_scans")
                .upsert(insert, onConflict: "id")
                .execute()
        } catch {
            let err = RoomScanSyncError.networkError(error)
            lastError = err
            package.markFailed(err.localizedDescription)
            throw err
        }

        // Stamp upload_started_at + bump upload_attempt_count. Best-effort
        // — the underlying columns are in migration 00082 which may not be
        // present in every environment yet.
        await stampUploadStarted(scanId: package.scanId)

        // 3–4. Seed artifact state + upload artifacts. Small artifacts go
        //      first (fail fast on network issues), large ones run with
        //      bounded concurrency (max 2 in-flight).
        var state = package.artifactState
        if state.artifacts.isEmpty {
            state.artifacts = manifest.artifacts.map { ArtifactUploadState(kind: $0.kind) }
            state.photosTotal = manifest.photos.count
            state.photosUploaded = 0
            package.artifactState = state
        }

        let totalBytes = max(1, manifest.artifacts.reduce(0) { $0 + $1.sizeBytes } +
                                 manifest.photos.reduce(0) { $0 + $1.sizeBytes })
        let uploadedCounter = UploadedBytesCounter()

        try await uploadArtifactsBoundedConcurrency(
            manifest: manifest,
            bundleURL: bundleURL,
            package: package,
            scanId: package.scanId,
            userId: userId,
            roomId: roomId,
            totalBytes: totalBytes,
            uploadedCounter: uploadedCounter
        )

        // 5. Upload posed photos + insert room_scan_images rows (with pose).
        var photoUploadError: Error?
        do {
            try await uploadPosedPhotos(
                manifest: manifest,
                bundleURL: bundleURL,
                package: package,
                scanId: package.scanId,
                userId: userId,
                roomId: roomId
            )
        } catch {
            photoUploadError = error
            print("[RoomScanSync] Posed photos upload partial failure: \(error.localizedDescription)")
        }

        // Derive room_features from CapturedRoom parametric JSON (ancillary).
        if let capturedRoomArtifact = manifest.artifacts.first(where: { $0.kind == .capturedRoomJson }) {
            let url = bundleURL.appendingPathComponent(capturedRoomArtifact.relativePath)
            try? await insertRoomFeatures(
                from: url,
                scanId: package.scanId,
                roomId: roomId
            )
        }

        // 6. Gate completion on real success. Previously the per-artifact
        //    catch in launchArtifactUpload swallowed every failure, and this
        //    code would unconditionally PATCH upload_progress=100 and call
        //    mark_scan_upload_complete — leaving a "complete" row with no
        //    Storage objects behind it (the 2026-05-12 smoke-test bug).
        if !package.artifactState.allArtifactsDone {
            let failed = package.artifactState.artifacts
                .filter { $0.status != .uploaded && $0.status != .skipped }
                .map { "\($0.kind.rawValue)(\($0.status.rawValue))\($0.lastError.map { ": \($0)" } ?? "")" }
                .joined(separator: ", ")
            let err = RoomScanSyncError.uploadFailed("artifacts incomplete: \(failed)")
            lastError = err
            package.markFailed(err.localizedDescription)
            throw err
        }
        if let err = photoUploadError {
            let wrapped = RoomScanSyncError.uploadFailed("posed-photos: \(err.localizedDescription)")
            lastError = wrapped
            package.markFailed(wrapped.localizedDescription)
            throw wrapped
        }

        await patchUploadProgress(scanId: package.scanId, progress: 100)

        // 7. Mark scan upload complete via RPC, then invoke the
        //    confirm-scan-bundle edge function (fire-and-forget — an edge
        //    function failure is not fatal to the local sync state).
        do {
            try await supabase
                .rpc("mark_scan_upload_complete", params: MarkUploadCompleteParams(
                    p_scan_id: package.scanId.uuidString
                ))
                .execute()
        } catch {
            print("[RoomScanSync] mark_scan_upload_complete failed (non-fatal): \(error.localizedDescription)")
        }

        do {
            try await supabase.functions.invoke(
                "confirm-scan-bundle",
                options: FunctionInvokeOptions(body: ConfirmScanBundleRequest(
                    scan_id: package.scanId.uuidString
                ))
            )
            print("[RoomScanSync] confirm-scan-bundle: ok")
        } catch {
            print("[RoomScanSync] confirm-scan-bundle: err \(error.localizedDescription)")
        }

        // Also stamp the legacy status=ready / processed_at pair so existing
        // consumers of the v2 schema keep working.
        do {
            try await supabase
                .from("room_scans")
                .update([
                    "status": "ready",
                    "processed_at": ISO8601DateFormatter().string(from: Date())
                ])
                .eq("id", value: package.scanId.uuidString)
                .execute()
        } catch {
            print("[RoomScanSync] Final status patch failed: \(error.localizedDescription)")
        }

        // 8. Mark synced locally + (optionally) delete the on-disk bundle.
        if package.artifactState.allArtifactsDone && package.artifactState.allPhotosDone {
            package.markSynced()
            // Leave the bundle on disk for now so we can verify in QA; a
            // follow-up can opt-in to auto-delete after a successful upload.
        }

        return UploadResult(roomId: roomId, scanId: package.scanId)
    }

    // MARK: - Launch-time & network-transition resume

    /// Re-enter `uploadAdvancedScanBundle` for every `RoomScanPackage` row
    /// that's in `.syncing` or `.failed` state (i.e. interrupted from a
    /// prior session or recently network-failed). Bounded to the 10 most
    /// recent rows to avoid a stampede of retries on launch.
    ///
    /// Safe to call multiple times — `uploadAdvancedScanBundle` skips
    /// artifacts with status `.uploaded` on re-entry, and duplicate
    /// launches for the same scanId are bounced by the task-in-flight
    /// guard.
    @MainActor
    public func resumePendingUploads(in context: ModelContext) async {
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { pkg in
                (pkg.statusRaw == "syncing" || pkg.statusRaw == "failed")
                    && pkg.syncedAt == nil
            },
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )

        let packages: [RoomScanPackage]
        do {
            var d = descriptor
            d.fetchLimit = 10
            packages = try context.fetch(d)
        } catch {
            print("[RoomScanSync] resumePendingUploads fetch failed: \(error.localizedDescription)")
            return
        }

        guard !packages.isEmpty else { return }
        print("[RoomScanSync] resuming \(packages.count) pending scan(s)")

        for package in packages {
            // Skip if the bundle directory is gone (evicted / deleted).
            guard let bundleURL = package.absoluteBundleURL,
                  FileManager.default.fileExists(atPath: bundleURL.path) else {
                continue
            }

            // Reconstruct minimal FirstWalkRoomData / FirstWalkStyleSignals
            // from the manifest. `uploadAdvancedScanBundle` is idempotent
            // on the core data — re-upserting with derived values is fine
            // because the original scan row already landed on a prior
            // attempt.
            let manifest: ScanManifest
            do {
                manifest = try ScanBundleWriter.readManifest(at: bundleURL)
            } catch {
                continue
            }

            let resumeRoomData = Self.deriveRoomData(
                from: manifest,
                package: package,
                context: context
            )
            let resumeSignals = FirstWalkStyleSignals()

            // Capture strong references for the detached task; the service
            // itself is a main-actor singleton so calling back in is safe.
            let captured = package
            Task { [weak self] in
                do {
                    _ = try await self?.uploadAdvancedScanBundle(
                        package: captured,
                        roomData: resumeRoomData,
                        styleSignals: resumeSignals
                    )
                } catch {
                    print("[RoomScanSync] resume upload failed for \(captured.scanId): \(error.localizedDescription)")
                }
            }
        }
    }

    /// Best-effort reconstruction of `FirstWalkRoomData` for resume. Pulls
    /// dimensions from the linked `RoomModel` row when available; otherwise
    /// falls back to zero values. The upsert path re-uses the existing
    /// scan's id so row overwrites are bounded to this one row, and any
    /// fields that `buildV2Insert` derives (style_signals, suggested_styles)
    /// are regenerated from whatever we pass in — so we keep the core
    /// name/id correct and accept stubbed dimensions as the tradeoff for
    /// not needing to re-parse the parametric captured_room.json.
    @MainActor
    private static func deriveRoomData(
        from manifest: ScanManifest,
        package: RoomScanPackage,
        context: ModelContext
    ) -> FirstWalkRoomData {
        let roomLocalId = package.roomLocalId
        var width: Float = 0
        var length: Float = 0
        var height: Float = 0

        let descriptor = FetchDescriptor<RoomModel>(
            predicate: #Predicate { $0.id == roomLocalId }
        )
        if let room = try? context.fetch(descriptor).first {
            width = Float(room.width ?? 0)
            length = Float(room.length ?? 0)
            height = Float(room.height ?? 0)
        }

        let dims = WalkRoomDimensions(width: width, length: length, height: height)
        return FirstWalkRoomData(
            roomId: package.scanId,
            roomName: package.userProvidedRoomName ?? manifest.roomName,
            dimensions: dims,
            detectedFeatures: [],
            scanDuration: 0,
            coveragePercentage: 0
        )
    }

    // MARK: - Bounded-concurrency artifact loop

    /// Tiny actor counter used to update `upload_progress` after each
    /// artifact completes. Using an actor avoids `Sendable` mutation
    /// warnings inside the TaskGroup closures.
    private actor UploadedBytesCounter {
        private(set) var uploaded: Int = 0
        private(set) var lastProgressPercent: Int = -1
        private var lastProgressWrite: Date = .distantPast

        func add(_ bytes: Int, total: Int) -> (percent: Int, shouldWrite: Bool) {
            uploaded += bytes
            let pct = min(100, Int((Double(uploaded) / Double(total)) * 100))
            let now = Date()
            let throttled = now.timeIntervalSince(lastProgressWrite) < 1.0
            if pct == lastProgressPercent || throttled {
                return (pct, false)
            }
            lastProgressPercent = pct
            lastProgressWrite = now
            return (pct, true)
        }
    }

    /// Orchestrates the artifact upload loop with small-artifacts-first
    /// ordering and a bounded in-flight window (max 2). A successful upload
    /// bumps the upload_progress column (throttled to ~1Hz).
    private func uploadArtifactsBoundedConcurrency(
        manifest: ScanManifest,
        bundleURL: URL,
        package: RoomScanPackage,
        scanId: UUID,
        userId: UUID,
        roomId: UUID,
        totalBytes: Int,
        uploadedCounter: UploadedBytesCounter
    ) async throws {
        let sorted = manifest.artifacts.sorted { $0.sizeBytes < $1.sizeBytes }
        let maxInFlight = 2

        try await withThrowingTaskGroup(of: Void.self) { group in
            var iterator = sorted.makeIterator()

            // Launch the initial window.
            for _ in 0..<maxInFlight {
                if let artifact = iterator.next() {
                    self.launchArtifactUpload(
                        artifact: artifact,
                        bundleURL: bundleURL,
                        package: package,
                        scanId: scanId,
                        userId: userId,
                        roomId: roomId,
                        totalBytes: totalBytes,
                        uploadedCounter: uploadedCounter,
                        into: &group
                    )
                }
            }

            // As each completes, launch the next until we exhaust the queue.
            while try await group.next() != nil {
                if let artifact = iterator.next() {
                    self.launchArtifactUpload(
                        artifact: artifact,
                        bundleURL: bundleURL,
                        package: package,
                        scanId: scanId,
                        userId: userId,
                        roomId: roomId,
                        totalBytes: totalBytes,
                        uploadedCounter: uploadedCounter,
                        into: &group
                    )
                }
            }
        }
    }

    private func launchArtifactUpload(
        artifact: ScanManifest.Artifact,
        bundleURL: URL,
        package: RoomScanPackage,
        scanId: UUID,
        userId: UUID,
        roomId: UUID,
        totalBytes: Int,
        uploadedCounter: UploadedBytesCounter,
        into group: inout ThrowingTaskGroup<Void, Error>
    ) {
        let priorState = package.artifactState.artifacts.first(where: { $0.kind == artifact.kind })
        if priorState?.status == .uploaded {
            // Already done on a prior run — bump counter & skip.
            group.addTask { [totalBytes, artifact] in
                let progress = await uploadedCounter.add(artifact.sizeBytes, total: totalBytes)
                if progress.shouldWrite {
                    await self.patchUploadProgress(scanId: scanId, progress: progress.percent)
                }
            }
            return
        }

        var artifactState = priorState ?? ArtifactUploadState(kind: artifact.kind)
        artifactState.status = .uploading
        artifactState.attempts += 1
        package.updateArtifact(artifactState)

        let capturedState = artifactState
        group.addTask { [artifact, totalBytes, capturedState] in
            do {
                let remoteUrl = try await self.uploadArtifact(
                    artifact: artifact,
                    from: bundleURL,
                    userId: userId,
                    roomId: roomId,
                    scanId: scanId
                )

                if let url = remoteUrl {
                    let done = ArtifactUploadState(
                        kind: capturedState.kind,
                        status: .uploaded,
                        remoteUrl: url,
                        lastError: nil,
                        attempts: capturedState.attempts
                    )
                    await MainActor.run { package.updateArtifact(done) }

                    if let column = Self.scanColumn(for: artifact.kind) {
                        try? await self.patchScanColumn(
                            scanId: scanId,
                            column: column,
                            value: url
                        )
                    }
                    UploadDiagnosticsLog.shared.log(
                        event: "artifact.uploaded",
                        scanId: scanId,
                        artifactKind: artifact.kind.rawValue,
                        sha: artifact.sha256,
                        extra: ["url": url]
                    )
                } else {
                    // Sidecar — not uploaded, mark skipped so allArtifactsDone holds.
                    let skipped = ArtifactUploadState(
                        kind: capturedState.kind,
                        status: .skipped,
                        remoteUrl: nil,
                        lastError: nil,
                        attempts: capturedState.attempts
                    )
                    await MainActor.run { package.updateArtifact(skipped) }
                    UploadDiagnosticsLog.shared.log(
                        event: "artifact.skipped",
                        scanId: scanId,
                        artifactKind: artifact.kind.rawValue
                    )
                }

                let progress = await uploadedCounter.add(artifact.sizeBytes, total: totalBytes)
                if progress.shouldWrite {
                    print("[RoomScanSync] progress \(progress.percent)%")
                    await self.patchUploadProgress(scanId: scanId, progress: progress.percent)
                }
            } catch {
                let failed = ArtifactUploadState(
                    kind: capturedState.kind,
                    status: .failed,
                    remoteUrl: capturedState.remoteUrl,
                    lastError: error.localizedDescription,
                    attempts: capturedState.attempts
                )
                await MainActor.run { package.updateArtifact(failed) }
                print("[RoomScanSync] Artifact \(artifact.kind) upload failed: \(error.localizedDescription)")
                UploadDiagnosticsLog.shared.log(
                    event: "artifact.failed",
                    scanId: scanId,
                    artifactKind: artifact.kind.rawValue,
                    sha: artifact.sha256,
                    error: error.localizedDescription
                )

                // Record the error column + progress advance even on
                // failure so the progress bar doesn't stall.
                await self.patchUploadError(scanId: scanId, message: error.localizedDescription)
                let progress = await uploadedCounter.add(artifact.sizeBytes, total: totalBytes)
                if progress.shouldWrite {
                    await self.patchUploadProgress(scanId: scanId, progress: progress.percent)
                }
            }
        }
    }

    // MARK: - Upload-state column helpers

    private func stampUploadStarted(scanId: UUID) async {
        do {
            try await supabase
                .rpc("increment_scan_upload_attempt", params: ScanIdOnlyParams(
                    p_scan_id: scanId.uuidString
                ))
                .execute()
        } catch {
            // The RPC is optional (pending migration); fall back to a
            // direct PATCH of upload_started_at only.
            let payload: [String: String] = [
                "upload_started_at": ISO8601DateFormatter().string(from: Date()),
                "status": "uploading"
            ]
            _ = try? await supabase
                .from("room_scans")
                .update(payload)
                .eq("id", value: scanId.uuidString)
                .execute()
        }
    }

    private func patchUploadProgress(scanId: UUID, progress: Int) async {
        _ = try? await supabase
            .from("room_scans")
            .update(["upload_progress": progress])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    private func patchUploadError(scanId: UUID, message: String) async {
        _ = try? await supabase
            .from("room_scans")
            .update(["upload_error": message])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    // MARK: - Artifact upload

    /// Artifact upload strategy. A size threshold decides whether we keep
    /// the inline supabase-swift upload (small files) or route through the
    /// background URLSession path that Wave 5.3 will wire up.
    private enum UploadStrategy { case direct, background }

    private static let backgroundUploadThreshold: Int = 5 * 1024 * 1024

    private static func strategy(for sizeBytes: Int) -> UploadStrategy {
        sizeBytes < backgroundUploadThreshold ? .direct : .background
    }

    /// Upload a single artifact to Supabase Storage. Returns nil when the
    /// kind is a sidecar (no storage upload required); returns the public
    /// URL string otherwise. On success we PATCH the matching column (when
    /// one exists) and merge the SHA256 into `room_scans.artifacts_sha256`
    /// via the `merge_scan_artifact_sha256` RPC.
    private func uploadArtifact(
        artifact: ScanManifest.Artifact,
        from bundleURL: URL,
        userId: UUID,
        roomId: UUID,
        scanId: UUID
    ) async throws -> String? {
        guard let (folderPrefix, filename) = Self.storagePathComponents(for: artifact) else {
            // Sidecar artifact — not uploaded on its own.
            return nil
        }

        let fileURL = bundleURL.appendingPathComponent(artifact.relativePath)
        let path = "\(folderPrefix)/\(userId.uuidString)/\(roomId.uuidString)/\(filename)"
        let publicUrlString = (try? supabase.storage
            .from(usdzBucket)
            .getPublicURL(path: path).absoluteString) ?? ""

        // Size-gated strategy. Large files (>= 5 MB) go through the
        // BackgroundScanUploader so they survive app-suspension; smaller
        // files use the inline supabase-swift upload.
        let strategy = Self.strategy(for: artifact.sizeBytes)
        if strategy == .background {
            try await uploadArtifactViaBackground(
                artifact: artifact,
                fileURL: fileURL,
                storagePath: path,
                scanId: scanId
            )
        } else {
            let data = try Data(contentsOf: fileURL)

            // Build metadata (sha256 + scan ids) only when we have a hash.
            // FileOptions in supabase-swift exposes a `metadata: [String: AnyJSON]?`
            // field; the storage server persists it alongside the object.
            var metadata: [String: AnyJSON]? = nil
            if let sha = artifact.sha256, !sha.isEmpty {
                metadata = [
                    "sha256": .string(sha),
                    "scanId": .string(scanId.uuidString),
                    "artifactKind": .string(artifact.kind.rawValue)
                ]
            }

            try await supabase.storage
                .from(usdzBucket)
                .upload(
                    path,
                    data: data,
                    options: FileOptions(
                        contentType: artifact.mimeType,
                        upsert: true,
                        metadata: metadata
                    )
                )
        }

        let shaPreview = (artifact.sha256 ?? "").prefix(10)
        print("[RoomScanSync] uploaded \(artifact.kind.rawValue) via \(strategy) sha=\(shaPreview)")

        // Merge the sha into room_scans.artifacts_sha256 (best-effort; the
        // RPC lives in migration 00082 — runtime only).
        if let sha = artifact.sha256, !sha.isEmpty {
            do {
                try await supabase
                    .rpc("merge_scan_artifact_sha256", params: ArtifactShaMergeParams(
                        p_scan_id: scanId.uuidString,
                        p_kind: artifact.kind.rawValue,
                        p_sha: sha
                    ))
                    .execute()
            } catch {
                print("[RoomScanSync] merge_scan_artifact_sha256 failed (non-fatal): \(error.localizedDescription)")
            }
        }

        return publicUrlString
    }

    /// Enqueue an artifact through `BackgroundScanUploader` and await its
    /// completion via a continuation parked in `uploadRouter`. The uploader
    /// delegates its `onCompletion` callback to the router in `init`, so
    /// the completion either resumes this continuation on success or
    /// throws the upstream `BackgroundScanUploader.UploadError`.
    ///
    /// The router bounces duplicate `(scanId, kind)` enqueues — which should
    /// only happen on resume, where `uploadAdvancedScanBundle` short-circuits
    /// any artifact whose state is already `.uploaded`. For an artifact in
    /// `.uploading` state, we still let this path re-enter: the uploader's
    /// upsert PUT is idempotent by design.
    private func uploadArtifactViaBackground(
        artifact: ScanManifest.Artifact,
        fileURL: URL,
        storagePath: String,
        scanId: UUID
    ) async throws {
        let descriptor = BackgroundScanUploader.UploadDescriptor(
            scanId: scanId,
            artifactKind: artifact.kind.rawValue,
            sha256: artifact.sha256,
            mimeType: artifact.mimeType,
            sizeBytes: artifact.sizeBytes,
            fileURL: fileURL,
            storagePath: storagePath,
            sizeExpected: artifact.sizeBytes
        )

        // Register the continuation FIRST so the uploader's URLSession
        // completion handler can find it. Then enqueue. If enqueue throws
        // synchronously (invalid URL, missing session, etc.), resolve the
        // router entry with the failure so the continuation unwinds.
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            uploadRouter.register(
                scanId: scanId,
                kind: artifact.kind.rawValue,
                continuation: cont
            )
            Task { @MainActor in
                do {
                    try await BackgroundScanUploader.shared.upload(descriptor)
                } catch {
                    uploadRouter.resolve(
                        scanId: scanId,
                        kind: artifact.kind.rawValue,
                        result: .failure(.transport(error))
                    )
                }
            }
        }
    }

    /// Push `BackgroundScanUploader` progress callbacks into the in-memory
    /// `artifactState.status = .uploading` so UI observing the
    /// `RoomScanPackage` sees live progress. The uploader already throttles
    /// its callbacks to ~2 Hz so we don't need to debounce further.
    ///
    /// Kept minimal: we only bump the attempts counter / status transition;
    /// the precise percent is not persisted on `ArtifactUploadState` (that
    /// struct tracks status, not byte-progress). Callers that want live
    /// progress can subscribe to `BackgroundScanUploader.shared.onProgress`
    /// directly.
    @MainActor
    fileprivate func applyBackgroundProgress(
        scanId: UUID,
        kind: String,
        progress: Double
    ) {
        // Reserved for future per-artifact byte-progress surfacing. The
        // router continuation above resolves on completion, which flips
        // artifactState to .uploaded — that's where the UI flip happens.
        _ = (scanId, kind, progress)
    }

    nonisolated private static func scanColumn(for kind: ScanManifest.ArtifactKind) -> String? {
        switch kind {
        case .usdz: return "model_url"
        case .capturedRoomJson: return "captured_room_json_url"
        case .worldMap: return "world_map_url"
        case .mesh: return "mesh_url"
        case .depthArchive: return "depth_archive_url"
        case .bundleArchive: return "scan_bundle_url"
        case .heroThumbnail: return "hero_frame_url"
        // v3 kinds that map to dedicated room_scans URL columns. The
        // matching migration lives at supabase/migrations/00082_*.sql —
        // Swift compiles fine either way; at runtime the PATCH here fails
        // until the migration is applied.
        case .bundleManifest:   return "bundle_manifest_url"
        case .photosManifest:   return "photos_manifest_url"
        case .coverageHeatmap:  return "coverage_heatmap_url"
        // v3 sidecars the server doesn't need a dedicated column for:
        // - depthIndex: content is already inside the depth_archive zip
        // - photoThumbnails: sidecar NDJSON lives next to the photos
        // - annotations: inlined into the bundle manifest
        // Returning nil here causes uploadArtifact(...) to skip the
        // per-column PATCH but still upload the file to storage.
        case .depthIndex,
             .photoThumbnails,
             .annotations:
            return nil
        }
    }

    nonisolated private static func storagePathComponents(for artifact: ScanManifest.Artifact) -> (folder: String, filename: String)? {
        let filename: String
        if let last = artifact.relativePath.split(separator: "/").last {
            filename = String(last)
        } else {
            filename = artifact.relativePath
        }
        switch artifact.kind {
        case .usdz:              return ("usdz", filename)
        case .capturedRoomJson:  return ("captured_room", filename)
        case .worldMap:          return ("worldmap", filename)
        case .mesh:              return ("mesh", filename)
        case .depthArchive:      return ("depth", filename)
        case .bundleArchive:     return ("bundle", filename)
        case .heroThumbnail:     return ("thumbnails", filename)
        // v3 kinds that upload to storage (paired with a dedicated column).
        case .bundleManifest:    return ("manifests", filename)       // manifest.json
        case .photosManifest:    return ("photos_manifest", filename) // photos_metadata.ndjson
        case .coverageHeatmap:   return ("coverage", filename)        // coverage_heatmap.json
        // v3 sidecars we intentionally do not upload separately:
        // depthIndex is inside the depth_archive zip, photoThumbnails is
        // sidecar-only, annotations are embedded in the bundle manifest.
        case .depthIndex,
             .photoThumbnails,
             .annotations:
            return nil
        }
    }

    // MARK: - Scan row helpers

    private func patchScanColumn(scanId: UUID, column: String, value: String) async throws {
        try await supabase
            .from("room_scans")
            .update([column: value])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    private func buildV2Insert(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        userId: UUID,
        remoteRoomId: UUID,
        projectId: UUID?,
        manifest: ScanManifest
    ) -> RoomScanV2Insert {
        let formatter = ISO8601DateFormatter()

        var windows: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        var doors: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        var other: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        for feature in roomData.detectedFeatures {
            let item = RoomScanInsert.FeaturesJSON.FeatureItem(
                type: feature.category.rawValue,
                confidence: feature.confidence,
                value: feature.value
            )
            switch feature.category {
            case .window, .largeWindow: windows.append(item)
            case .door: doors.append(item)
            default: other.append(item)
            }
        }

        let furniture = roomData.detectedFeatures
            .filter { $0.category == .seatingArea || $0.category == .bookshelf }
            .map { RoomScanInsert.FurnitureDetected(category: $0.category.rawValue, confidence: $0.confidence) }

        let suggestedStyles: [String] = {
            var styles: Set<String> = []
            if styleSignals.naturalLight > 0.7 { styles.insert("scandinavian"); styles.insert("coastal") }
            if styleSignals.warmth > 0.7 { styles.insert("rustic"); styles.insert("traditional") }
            if styleSignals.openness > 0.7 { styles.insert("minimalist"); styles.insert("modern") }
            if styleSignals.texture > 0.7 { styles.insert("bohemian"); styles.insert("eclectic") }
            if styles.isEmpty { styles.insert("transitional") }
            return Array(styles)
        }()

        let env = manifest.captureEnvironment
        let captureEnv = RoomScanV2Insert.CaptureEnvironmentJSON(
            lightEstimate: env.lightEstimate,
            thermalState: env.thermalState,
            batteryLevel: env.batteryLevel,
            motionQuality: env.motionQuality
        )

        let totalSize = manifest.artifacts.reduce(0) { $0 + $1.sizeBytes } +
            manifest.photos.reduce(0) { $0 + $1.sizeBytes }

        return RoomScanV2Insert(
            id: roomData.roomId,
            user_id: userId,
            room_id: remoteRoomId,
            project_id: projectId,
            name: roomData.roomName,
            room_type: nil,
            dimensions: RoomScanInsert.DimensionsJSON(
                width: roomData.dimensions.width,
                length: roomData.dimensions.length,
                height: roomData.dimensions.height,
                unit: "meters"
            ),
            floor_area: Double(roomData.dimensions.area),
            coverage_percentage: roomData.coveragePercentage,
            features: RoomScanInsert.FeaturesJSON(windows: windows, doors: doors, other: other),
            furniture_detected: furniture,
            style_signals: RoomScanInsert.StyleSignalsJSON(
                naturalLight: styleSignals.naturalLight,
                openness: styleSignals.openness,
                warmth: styleSignals.warmth,
                texture: styleSignals.texture,
                timeOfDay: styleSignals.timeOfDay?.rawValue,
                lightPreference: styleSignals.lightPreference?.rawValue,
                seatingPreference: styleSignals.seatingPreference?.rawValue,
                roomFeeling: styleSignals.roomFeeling,
                scanPace: styleSignals.scanPace.rawValue
            ),
            suggested_styles: suggestedStyles,
            scan_data: RoomScanInsert.ScanDataJSON(
                scanDuration: roomData.scanDuration,
                coveragePercentage: roomData.coveragePercentage,
                completedAt: formatter.string(from: roomData.completedAt)
            ),
            thumbnail_url: nil,
            model_url: nil,
            hero_frame_url: nil,
            hero_frame_score: roomData.heroFrameScore,
            scan_schema_version: manifest.schemaVersion,
            device_model: manifest.device.model,
            os_version: manifest.device.osVersion,
            has_lidar: manifest.device.hasLidar,
            scan_bundle_size_bytes: totalSize,
            capture_environment: captureEnv,
            status: "processing",
            scanned_at: formatter.string(from: roomData.completedAt),
            created_at: formatter.string(from: Date())
        )
    }

    // MARK: - Posed photos

    /// Actor-guarded accumulator used by the concurrent posed-photo upload
    /// loop. We collect successful insert rows here before writing them
    /// to `room_scan_images` in a single batched insert.
    private actor PosedPhotoCollector {
        private(set) var rows: [RoomScanImageInsertV2] = []

        func append(_ row: RoomScanImageInsertV2) {
            rows.append(row)
        }
    }

    private func uploadPosedPhotos(
        manifest: ScanManifest,
        bundleURL: URL,
        package: RoomScanPackage,
        scanId: UUID,
        userId: UUID,
        roomId: UUID
    ) async throws {
        let collector = PosedPhotoCollector()
        let maxInFlight = 3

        try await withThrowingTaskGroup(of: Void.self) { group in
            var iterator = manifest.photos.enumerated().makeIterator()

            func launchNext(into group: inout ThrowingTaskGroup<Void, Error>) {
                guard let next = iterator.next() else { return }
                let (index, photo) = next
                group.addTask { [scanId, roomId, userId, bundleURL] in
                    let photoURL = bundleURL.appendingPathComponent(photo.relativePath)
                    guard let data = try? Data(contentsOf: photoURL) else { return }

                    let filename = (photo.relativePath.split(separator: "/").last)
                        .map(String.init) ?? "photo.heic"
                    let storagePath = "photos/\(userId.uuidString)/\(roomId.uuidString)/\(filename)"

                    do {
                        // Idempotent-by-upsert: re-uploading the same bytes
                        // with `upsert: true` is a no-op from the client's
                        // point of view. Simpler than a list-then-HEAD probe
                        // and matches the v2 behaviour we rely on elsewhere.
                        try await supabase.storage
                            .from(self.usdzBucket)
                            .upload(
                                storagePath,
                                data: data,
                                options: FileOptions(
                                    contentType: photo.mimeType,
                                    upsert: true
                                )
                            )
                        let url = try supabase.storage
                            .from(self.usdzBucket)
                            .getPublicURL(path: storagePath)

                        // Honour the user's review-step picks: `isUserSelectedHero`
                        // wins over the auto-scored hero kind; `orderIndex`
                        // replaces the natural capture order when present.
                        let effectiveIsPrimary = photo.isUserSelectedHero || photo.kind == .hero
                        let effectiveDisplayOrder: Int
                        if effectiveIsPrimary {
                            effectiveDisplayOrder = 0
                        } else if let userOrder = photo.orderIndex {
                            effectiveDisplayOrder = userOrder + 1
                        } else {
                            effectiveDisplayOrder = index + 1
                        }
                        let trimmedCaption = photo.userAnnotation?
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        let row = RoomScanImageInsertV2(
                            scan_id: scanId,
                            room_id: roomId,
                            role: photo.kind.rawValue,
                            is_primary: effectiveIsPrimary,
                            display_order: effectiveDisplayOrder,
                            feature_category: photo.associatedFeatureCategory,
                            image_url: url.absoluteString,
                            quality_score: photo.qualityScore,
                            sharpness_score: photo.sharpnessScore,
                            brightness_score: photo.brightnessScore,
                            composition_score: photo.compositionScore,
                            stability_score: photo.stabilityScore,
                            light_estimate_lumens: photo.lightEstimateLumens,
                            captured_at: photo.capturedAt,
                            camera_transform: photo.cameraTransform,
                            camera_intrinsics: PhotoIntrinsicsJSON(
                                fx: photo.cameraIntrinsics.fx,
                                fy: photo.cameraIntrinsics.fy,
                                cx: photo.cameraIntrinsics.cx,
                                cy: photo.cameraIntrinsics.cy,
                                width: photo.cameraIntrinsics.width,
                                height: photo.cameraIntrinsics.height
                            ),
                            euler_angles: photo.eulerAngles,
                            photo_kind: photo.kind.rawValue,
                            is_full_resolution: photo.isFullResolution,
                            associated_feature_id: photo.associatedFeatureId,
                            timestamp_seconds: photo.timestampSeconds,
                            width: photo.width,
                            height: photo.height,
                            file_size_bytes: photo.sizeBytes,
                            mime_type: photo.mimeType,
                            caption: (trimmedCaption?.isEmpty == false) ? trimmedCaption : nil
                        )
                        await collector.append(row)
                        await MainActor.run { package.incrementPhotosUploaded() }
                    } catch {
                        print("[RoomScanSync] Photo upload failed (\(filename)): \(error.localizedDescription)")
                    }
                }
            }

            for _ in 0..<maxInFlight { launchNext(into: &group) }
            while try await group.next() != nil {
                launchNext(into: &group)
            }
        }

        let uploaded = await collector.rows
        guard !uploaded.isEmpty else { return }

        try await supabase
            .from("room_scan_images")
            .insert(uploaded)
            .execute()

        // Keep the denormalized `image_count` column on `room_scans` in sync.
        // Best-effort — a transient failure here doesn't undo the inserts and
        // doesn't block the rest of the upload flow. Without this patch, the
        // column stays at its default (0) forever even when uploads succeed.
        try? await supabase
            .from("room_scans")
            .update(["image_count": uploaded.count])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    // MARK: - Room features from CapturedRoom JSON

    private func insertRoomFeatures(
        from capturedRoomURL: URL,
        scanId: UUID,
        roomId: UUID
    ) async throws {
        guard let data = try? Data(contentsOf: capturedRoomURL) else { return }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        var inserts: [RoomFeatureInsert] = []

        func positionOf(_ transform: [[Double]]?) -> (x: Double, y: Double, z: Double) {
            guard let m = transform, m.count >= 4, m[3].count >= 3 else { return (0, 0, 0) }
            return (m[0][3], m[1][3], m[2][3])
        }

        func dimensionsOf(_ dims: [Double]?) -> (w: Double?, h: Double?, d: Double?) {
            guard let dims = dims else { return (nil, nil, nil) }
            return (dims.indices.contains(0) ? dims[0] : nil,
                    dims.indices.contains(1) ? dims[1] : nil,
                    dims.indices.contains(2) ? dims[2] : nil)
        }

        func appendItems(_ items: [[String: Any]]?, type: String) {
            guard let items = items else { return }
            for item in items {
                let tx = item["transform"] as? [[Double]]
                let pos = positionOf(tx)
                let dims = dimensionsOf(item["dimensions"] as? [Double])
                let confidenceRaw = (item["confidence"] as? String) ?? "medium"
                let confidence: Double = {
                    switch confidenceRaw.lowercased() {
                    case "high": return 1.0
                    case "medium": return 0.8
                    case "low": return 0.6
                    default: return 0.7
                    }
                }()
                inserts.append(RoomFeatureInsert(
                    room_id: roomId,
                    scan_id: scanId,
                    type: type,
                    position_x: pos.x,
                    position_y: pos.y,
                    position_z: pos.z,
                    width: dims.w,
                    height: dims.h,
                    depth: dims.d,
                    confidence: confidence
                ))
            }
        }

        appendItems(json["walls"] as? [[String: Any]], type: "wall")
        appendItems(json["doors"] as? [[String: Any]], type: "door")
        appendItems(json["windows"] as? [[String: Any]], type: "window")
        appendItems(json["openings"] as? [[String: Any]], type: "opening")
        appendItems(json["objects"] as? [[String: Any]], type: "object")

        guard !inserts.isEmpty else { return }

        try await supabase
            .from("room_features")
            .insert(inserts)
            .execute()
    }
}

// MARK: - v2 insert structs for extensions

private struct RoomScanImageInsertV2: Encodable {
    let scan_id: UUID
    let room_id: UUID?
    let role: String
    let is_primary: Bool
    let display_order: Int
    let feature_category: String?
    let image_url: String
    let quality_score: Float?
    let sharpness_score: Float?
    let brightness_score: Float?
    let composition_score: Float?
    let stability_score: Float?
    let light_estimate_lumens: Double?
    let captured_at: Date
    let camera_transform: [Double]
    let camera_intrinsics: PhotoIntrinsicsJSON
    let euler_angles: [Double]
    let photo_kind: String
    let is_full_resolution: Bool
    let associated_feature_id: UUID?
    let timestamp_seconds: Double
    let width: Int
    let height: Int
    let file_size_bytes: Int
    let mime_type: String
    let caption: String?
}

private struct PhotoIntrinsicsJSON: Encodable {
    let fx: Double
    let fy: Double
    let cx: Double
    let cy: Double
    let width: Int
    let height: Int
}

private struct RoomFeatureInsert: Encodable {
    let room_id: UUID
    let scan_id: UUID
    let type: String
    let position_x: Double
    let position_y: Double
    let position_z: Double
    let width: Double?
    let height: Double?
    let depth: Double?
    let confidence: Double
}

// MARK: - Response Models

/// Room scan response from Supabase
public struct RoomScanResponse: Decodable, Identifiable {
    public let id: UUID
    public let user_id: UUID
    public let project_id: UUID?
    public let name: String
    public let room_type: String?
    public let dimensions: DimensionsData?
    public let floor_area: Double?
    public let features: FeaturesData?
    public let style_signals: StyleSignalsData?
    public let suggested_styles: [String]?
    public let thumbnail_url: String?
    public let hero_frame_url: String?
    public let hero_frame_score: Float?
    public let status: String
    public let scanned_at: String?
    public let created_at: String

    public struct DimensionsData: Decodable {
        public let width: Float?
        public let length: Float?
        public let height: Float?
        public let unit: String?
    }

    public struct FeaturesData: Decodable {
        public let windows: [FeatureItem]?
        public let doors: [FeatureItem]?
        public let other: [FeatureItem]?

        public struct FeatureItem: Decodable {
            public let type: String
            public let confidence: Float?
            public let value: Float?
        }
    }

    public struct StyleSignalsData: Decodable {
        public let naturalLight: Float?
        public let openness: Float?
        public let warmth: Float?
        public let texture: Float?
    }
}
