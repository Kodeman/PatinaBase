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

/// Service for syncing room scans to Supabase
@MainActor
public final class RoomScanSyncService: ObservableObject {

    public static let shared = RoomScanSyncService()

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

    // SwiftData context for persistent queue
    private var modelContext: ModelContext?
    private var isConfigured = false

    private struct QueuedUpload {
        let roomData: FirstWalkRoomData
        let styleSignals: FirstWalkStyleSignals
        let projectId: UUID?
        var retryCount: Int = 0
    }

    // MARK: - Initialization

    private init() {}

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
            Task { @MainActor in
                let wasAvailable = self?.isNetworkAvailable ?? false
                self?.isNetworkAvailable = (path.status == .satisfied)

                // If we just came online, try processing queue
                if !wasAvailable && path.status == .satisfied {
                    await self?.processQueueIfOnline()
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

        // 2. Insert / upsert the scan row with v2 columns.
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

        // 3. Iterate artifacts. Each upload is independent + resumable.
        var state = package.artifactState
        if state.artifacts.isEmpty {
            // Seed artifact state from manifest on first run.
            state.artifacts = manifest.artifacts.map { ArtifactUploadState(kind: $0.kind) }
            state.photosTotal = manifest.photos.count
            state.photosUploaded = 0
            package.artifactState = state
        }

        for artifact in manifest.artifacts {
            var artifactState = state.artifacts.first(where: { $0.kind == artifact.kind })
                ?? ArtifactUploadState(kind: artifact.kind)

            if artifactState.status == .uploaded {
                continue
            }

            artifactState.status = .uploading
            artifactState.attempts += 1
            package.updateArtifact(artifactState)

            do {
                let remoteUrl = try await uploadArtifact(
                    artifact: artifact,
                    from: bundleURL,
                    userId: userId,
                    roomId: roomId
                )
                artifactState.status = .uploaded
                artifactState.remoteUrl = remoteUrl
                artifactState.lastError = nil
                package.updateArtifact(artifactState)

                // Patch the matching room_scans column so a resumed upload
                // doesn't re-PATCH what's already there.
                if let column = Self.scanColumn(for: artifact.kind) {
                    try? await patchScanColumn(
                        scanId: package.scanId,
                        column: column,
                        value: remoteUrl
                    )
                }
            } catch {
                artifactState.status = .failed
                artifactState.lastError = error.localizedDescription
                package.updateArtifact(artifactState)
                print("[RoomScanSync] Artifact \(artifact.kind) upload failed: \(error.localizedDescription)")
            }
        }

        // 4. Upload posed photos + insert room_scan_images rows (with pose).
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
            print("[RoomScanSync] Posed photos upload partial failure: \(error.localizedDescription)")
        }

        // 5. Derive room_features from CapturedRoom parametric JSON.
        if let capturedRoomArtifact = manifest.artifacts.first(where: { $0.kind == .capturedRoomJson }) {
            let url = bundleURL.appendingPathComponent(capturedRoomArtifact.relativePath)
            try? await insertRoomFeatures(
                from: url,
                scanId: package.scanId,
                roomId: roomId
            )
        }

        // 6. Stamp status=ready + bundle size.
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

        // 7. Mark synced locally + (optionally) delete the on-disk bundle.
        if package.artifactState.allArtifactsDone && package.artifactState.allPhotosDone {
            package.markSynced()
            // Leave the bundle on disk for now so we can verify in QA; a
            // follow-up can opt-in to auto-delete after a successful upload.
        }

        return UploadResult(roomId: roomId, scanId: package.scanId)
    }

    // MARK: - Artifact upload

    private func uploadArtifact(
        artifact: ScanManifest.Artifact,
        from bundleURL: URL,
        userId: UUID,
        roomId: UUID
    ) async throws -> String {
        let fileURL = bundleURL.appendingPathComponent(artifact.relativePath)
        let data = try Data(contentsOf: fileURL)

        let (folderPrefix, filename) = Self.storagePathComponents(for: artifact)
        let path = "\(folderPrefix)/\(userId.uuidString)/\(roomId.uuidString)/\(filename)"

        try await supabase.storage
            .from(usdzBucket)
            .upload(path, data: data, options: FileOptions(contentType: artifact.mimeType))

        let publicUrl = try supabase.storage.from(usdzBucket).getPublicURL(path: path)
        return publicUrl.absoluteString
    }

    private static func scanColumn(for kind: ScanManifest.ArtifactKind) -> String? {
        switch kind {
        case .usdz: return "model_url"
        case .capturedRoomJson: return "captured_room_json_url"
        case .worldMap: return "world_map_url"
        case .mesh: return "mesh_url"
        case .depthArchive: return "depth_archive_url"
        case .bundleArchive: return "scan_bundle_url"
        case .heroThumbnail: return "hero_frame_url"
        }
    }

    private static func storagePathComponents(for artifact: ScanManifest.Artifact) -> (folder: String, filename: String) {
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

    private func uploadPosedPhotos(
        manifest: ScanManifest,
        bundleURL: URL,
        package: RoomScanPackage,
        scanId: UUID,
        userId: UUID,
        roomId: UUID
    ) async throws {
        var uploaded: [RoomScanImageInsertV2] = []

        for photo in manifest.photos {
            let photoURL = bundleURL.appendingPathComponent(photo.relativePath)
            guard let data = try? Data(contentsOf: photoURL) else { continue }

            let filename = (photo.relativePath.split(separator: "/").last).map(String.init) ?? "photo.heic"
            let storagePath = "photos/\(userId.uuidString)/\(roomId.uuidString)/\(filename)"

            do {
                try await supabase.storage
                    .from(usdzBucket)
                    .upload(storagePath, data: data, options: FileOptions(contentType: photo.mimeType))
                let url = try supabase.storage.from(usdzBucket).getPublicURL(path: storagePath)

                uploaded.append(RoomScanImageInsertV2(
                    scan_id: scanId,
                    room_id: roomId,
                    role: photo.kind.rawValue,
                    is_primary: photo.kind == .hero,
                    display_order: photo.kind == .hero ? 0 : uploaded.count + 1,
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
                    mime_type: photo.mimeType
                ))
                package.incrementPhotosUploaded()
            } catch {
                print("[RoomScanSync] Photo upload failed (\(filename)): \(error.localizedDescription)")
            }
        }

        guard !uploaded.isEmpty else { return }

        try await supabase
            .from("room_scan_images")
            .insert(uploaded)
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
