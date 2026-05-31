//
//  RoomScanSyncService.swift
//  Patina
//
//  Service for syncing room scans to Supabase.
//  Handles uploads, offline queue, and retry logic.
//
//  PT-6-1: this file is the façade. The per-artifact upload mechanics live
//  in `ArtifactUploader`, the network-monitor + in-memory queue state lives
//  in `ScanSyncQueue`, and the Supabase payload DTOs live in `Sync/Models/`.
//  This service composes those pieces and keeps the public API stable
//  (consumed via `.shared` by WalkView, ScanUploadProgressView,
//  BackgroundScanUploader).
//

import Foundation
import SwiftUI
import Observation
import Supabase
import SwiftData

/// Service for syncing room scans to Supabase
@MainActor
@Observable
public final class RoomScanSyncService {

    public static let shared = RoomScanSyncService()

    /// UserDefaults key controlling whether large scan artifacts may upload
    /// on cellular / metered networks. When `false` (default), the cellular
    /// gate defers uploads until the path reports `!isExpensive`.
    public static let cellularOptInKey = "patina.scanUploadOnCellularEnabled"

    // MARK: - Published State

    // Public read-only; the setter is module-internal so the advanced-scan
    // bundle orchestration (RoomScanSyncService+AdvancedBundle.swift) can
    // update sync state. The public API surface is unchanged.
    public internal(set) var isSyncing = false
    public internal(set) var lastError: RoomScanSyncError?
    public private(set) var pendingUploads: Int = 0
    public private(set) var isNetworkAvailable = true

    // MARK: - Internal State

    private let storageBucket = "room-scan-thumbnails"
    // `internal` (not `private`) so the advanced-bundle extension file can
    // reach it; not part of the public API.
    let usdzBucket = "room-scans"
    private let heroFrameBucket = "room-hero-frames"

    /// Per-artifact uploader (Storage pushes + background URLSession bridge).
    let artifactUploader = ArtifactUploader(usdzBucket: "room-scans")

    /// Network monitor + in-memory fallback queue.
    private let scanQueue = ScanSyncQueue()

    // SwiftData context for persistent queue
    var modelContext: ModelContext?
    private var isConfigured = false

    /// Thread-safe snapshot of the most recent `NWPath.isExpensive`, sourced
    /// from the network monitor owned by `scanQueue`.
    var cachedIsExpensive: Bool { scanQueue.cachedIsExpensive }

    // MARK: - Initialization

    private init() {
        // Mirror the queue's network availability onto our observable flag,
        // and route online / unmetered transitions back through the existing
        // drain + resume entry points.
        scanQueue.onAvailabilityChanged = { [weak self] available in
            self?.isNetworkAvailable = available
        }
        scanQueue.onBecameOnline = { [weak self] in
            guard let self else { return }
            await self.processQueueIfOnline()
            if let ctx = self.modelContext {
                await self.resumePendingUploads(in: ctx)
            }
        }
        scanQueue.onBecameUnmetered = { [weak self] in
            guard let self else { return }
            if let ctx = self.modelContext {
                await self.resumePendingUploads(in: ctx)
            }
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
        scanQueue.startMonitoring()

        // Process any pending items from previous sessions
        Task {
            await countPendingItems()
            await processQueueIfOnline()
        }
    }

    deinit {
        scanQueue.stopMonitoring()
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
                PatinaLog.sync.error("[RoomScanSync] thumbnail upload failed: \(error)")
            }
        }

        // 3. Upload hero frame if available (non-fatal).
        var heroFrameUrl: String? = nil
        if let heroFrameData = roomData.heroFrameData {
            do {
                heroFrameUrl = try await uploadHeroFrame(heroFrameData, roomId: roomData.roomId, userId: userId)
            } catch {
                PatinaLog.sync.error("[RoomScanSync] hero frame upload failed: \(error)")
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
    /// `internal` so the advanced-bundle extension file can reuse it.
    func insertRoom(
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
        pendingUploads = scanQueue.enqueue(upload)
    }

    /// Process any queued uploads (in-memory queue)
    public func processQueue() async {
        guard !scanQueue.uploadQueue.isEmpty else { return }

        var failedUploads: [QueuedUpload] = []

        for var upload in scanQueue.uploadQueue {
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

        scanQueue.replaceQueue(with: failedUploads)
        pendingUploads = scanQueue.count
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
            PatinaLog.sync.error("Failed to fetch queue items: \(error)")
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
            pendingUploads = scanQueue.count
            return
        }

        do {
            let descriptor = FetchDescriptor<SyncQueueItem>(
                predicate: #Predicate { item in
                    item.statusRaw == "pending" || item.statusRaw == "syncing"
                }
            )
            let count = try context.fetchCount(descriptor)
            pendingUploads = count + scanQueue.count
        } catch {
            pendingUploads = scanQueue.count
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
        let path = "usdz/\(userId.uuidString.lowercased())/\(roomId.uuidString.lowercased())/scan.usdz"
        do {
            try await supabase.storage
                .from(usdzBucket)
                .upload(path, data: data, options: FileOptions(contentType: "model/vnd.usdz+zip"))
            let publicUrl = try supabase.storage.from(usdzBucket).getPublicURL(path: path)
            PatinaLog.sync.debug("[RoomScanSync] USDZ uploaded: \(path)")
            return publicUrl.absoluteString
        } catch {
            PatinaLog.sync.error("[RoomScanSync] USDZ upload failed: \(error)")
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
        let path = "usdz/\(userId.uuidString.lowercased())/\(roomId.uuidString.lowercased())/scan.usdz"
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
        let path = "\(userId.uuidString.lowercased())/\(roomId.uuidString.lowercased())/hero.\(fileExtension)"

        do {
            try await supabase.storage
                .from(heroFrameBucket)
                .upload(path, data: data, options: FileOptions(contentType: contentType))

            // Get public URL
            let publicUrl = try supabase.storage
                .from(heroFrameBucket)
                .getPublicURL(path: path)

            PatinaLog.sync.debug("Hero frame uploaded successfully: \(path)")
            return publicUrl.absoluteString
        } catch {
            PatinaLog.sync.error("Hero frame upload failed: \(error)")
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

            let path = "\(userId.uuidString.lowercased())/\(roomId.uuidString.lowercased())/\(filename).heic"

            do {
                try await supabase.storage
                    .from(heroFrameBucket)
                    .upload(path, data: imageData, options: FileOptions(contentType: "image/heic"))

                let publicUrl = try supabase.storage
                    .from(heroFrameBucket)
                    .getPublicURL(path: path)

                results[image.id] = publicUrl.absoluteString
            } catch {
                PatinaLog.sync.error("Failed to upload image \(filename): \(error)")
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
            PatinaLog.sync.error("Failed to retry items: \(error)")
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
            PatinaLog.sync.error("Failed to clear synced items: \(error)")
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

    // `internal` so the advanced-bundle extension file can reuse it.
    func getCurrentUserId() async -> UUID? {
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
