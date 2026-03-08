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
    let project_id: UUID?
    let name: String
    let room_type: String?
    let dimensions: DimensionsJSON
    let floor_area: Double
    let features: FeaturesJSON
    let furniture_detected: [FurnitureDetected]
    let style_signals: StyleSignalsJSON
    let suggested_styles: [String]
    let scan_data: ScanDataJSON?
    let thumbnail_url: String?
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

    /// Upload a room scan to Supabase
    /// - Parameters:
    ///   - roomData: The captured room data
    ///   - styleSignals: The computed style signals
    ///   - thumbnail: Optional thumbnail image
    ///   - projectId: Optional project to associate with
    /// - Returns: The remote scan ID if successful
    @discardableResult
    public func uploadRoomScan(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        thumbnail: UIImage? = nil,
        projectId: UUID? = nil
    ) async throws -> UUID {
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

        // Upload thumbnail if provided
        var thumbnailUrl: String? = nil
        if let thumbnail = thumbnail {
            do {
                thumbnailUrl = try await uploadThumbnail(thumbnail, roomId: roomData.roomId)
            } catch {
                // Log but don't fail the upload
                print("Failed to upload thumbnail: \(error)")
            }
        }

        // Upload hero frame if available
        var heroFrameUrl: String? = nil
        if let heroFrameData = roomData.heroFrameData {
            do {
                heroFrameUrl = try await uploadHeroFrame(heroFrameData, roomId: roomData.roomId, userId: userId)
            } catch {
                // Log but don't fail the upload
                print("Failed to upload hero frame: \(error)")
            }
        }

        // Create insert data
        let insert = createInsertData(
            roomData: roomData,
            styleSignals: styleSignals,
            userId: userId,
            projectId: projectId,
            thumbnailUrl: thumbnailUrl,
            heroFrameUrl: heroFrameUrl,
            heroFrameScore: roomData.heroFrameScore
        )

        // Upload to Supabase
        do {
            try await supabase.database
                .from("room_scans")
                .insert(insert)
                .execute()

            return roomData.roomId
        } catch {
            let syncError = RoomScanSyncError.networkError(error)
            lastError = syncError
            throw syncError
        }
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
                try await uploadRoomScan(
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

            // Upload USDZ if available
            if let usdzData = item.usdzData {
                try await uploadUSDZ(usdzData, roomId: roomData.roomId)
            }

            // Upload room scan data
            _ = try await uploadRoomScan(
                roomData: roomData,
                styleSignals: styleSignals,
                thumbnail: nil,
                projectId: nil
            )

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

    /// Upload USDZ model data to Supabase Storage
    private func uploadUSDZ(_ data: Data, roomId: UUID) async throws {
        guard let userId = await getCurrentUserId() else {
            throw RoomScanSyncError.notAuthenticated
        }

        let path = "usdz/\(userId.uuidString)/\(roomId.uuidString)/scan.usdz"

        do {
            try await supabase.storage
                .from(usdzBucket)
                .upload(path, data: data, options: FileOptions(contentType: "model/vnd.usdz+zip"))

            print("USDZ uploaded successfully: \(path)")
        } catch {
            print("USDZ upload failed: \(error)")
            // Don't throw - USDZ upload failure shouldn't fail the whole sync
        }
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
    /// - Returns: The remote scan ID if successful
    @discardableResult
    public func uploadRoomScanWithImages(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        thumbnail: UIImage? = nil,
        projectId: UUID? = nil
    ) async throws -> UUID {
        isSyncing = true
        lastError = nil

        defer { isSyncing = false }

        await AuthService.shared.waitForAuthReady()

        guard let userId = await getCurrentUserId() else {
            let error = RoomScanSyncError.notAuthenticated
            lastError = error
            throw error
        }

        // Upload thumbnail if provided
        var thumbnailUrl: String? = nil
        if let thumbnail = thumbnail {
            do {
                thumbnailUrl = try await uploadThumbnail(thumbnail, roomId: roomData.roomId)
            } catch {
                print("Failed to upload thumbnail: \(error)")
            }
        }

        // Handle multi-image collection
        var heroFrameUrl: String? = nil
        var imageUrls: [UUID: String] = [:]

        if let imageCollection = roomData.imageCollection, !imageCollection.isEmpty {
            // Upload all images in parallel
            imageUrls = try await uploadRoomImages(
                imageCollection.allImages,
                roomId: roomData.roomId,
                userId: userId
            )

            // Get hero URL for backward compatibility
            if let heroImage = imageCollection.heroImage {
                heroFrameUrl = imageUrls[heroImage.id]
            }
        } else if let heroFrameData = roomData.heroFrameData {
            // Legacy single hero frame upload
            do {
                heroFrameUrl = try await uploadHeroFrame(heroFrameData, roomId: roomData.roomId, userId: userId)
            } catch {
                print("Failed to upload hero frame: \(error)")
            }
        }

        // Create insert data
        let insert = createInsertData(
            roomData: roomData,
            styleSignals: styleSignals,
            userId: userId,
            projectId: projectId,
            thumbnailUrl: thumbnailUrl,
            heroFrameUrl: heroFrameUrl,
            heroFrameScore: roomData.heroFrameScore
        )

        // Upload to Supabase
        do {
            try await supabase.database
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

            return roomData.roomId
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
            let response: [RoomScanResponse] = try await supabase.database
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
        try await supabase.database
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
        projectId: UUID?,
        thumbnailUrl: String?,
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
