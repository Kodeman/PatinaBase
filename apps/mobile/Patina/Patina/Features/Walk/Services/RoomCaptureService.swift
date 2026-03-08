//
//  RoomCaptureService.swift
//  Patina
//
//  Service wrapping Apple's RoomPlan framework for room scanning.
//  Handles RoomCaptureSession and emits detected features.
//

import Foundation
import CoreGraphics
import UIKit
import RoomPlan
import ARKit
import Combine
import simd

/// Service for capturing room data using RoomPlan
@MainActor
public final class RoomCaptureService: NSObject, ObservableObject {

    // MARK: - Published State

    @Published public private(set) var isScanning = false
    @Published public private(set) var scanProgress: Float = 0
    @Published public private(set) var capturedRoom: CapturedRoom?
    @Published public private(set) var detectedFeatures: [DetectedFeature] = []
    @Published public private(set) var errorMessage: String?

    // MARK: - Analysis Results (NEW)

    /// Current coverage analysis result
    @Published public private(set) var coverageResult: CoverageAnalyzer.CoverageResult?

    /// Current quality metrics
    @Published public private(set) var qualityMetrics: QualityMonitor.QualityMetrics?

    /// Current completion status
    @Published public private(set) var completionStatus: CompletionAnalyzer.CompletionStatus?

    // MARK: - Hero Frame Capture

    /// Service for capturing and selecting hero frames
    public let frameCaptureService = FrameCaptureService()

    /// The selected hero frame after scan completes
    @Published public private(set) var heroFrame: CapturedFrame?

    // MARK: - Callbacks

    /// Called when a new feature is detected during scanning
    public var onFeatureDetected: ((DetectedFeature) -> Void)?

    /// Called when scan progress updates
    public var onProgressUpdate: ((Float) -> Void)?

    /// Called when scanning completes
    public var onScanComplete: ((CapturedRoom) -> Void)?

    /// Called when an error occurs
    public var onError: ((Error) -> Void)?

    /// Called when completion status changes (NEW)
    public var onCompletionStatusChanged: ((CompletionAnalyzer.CompletionStatus) -> Void)?

    /// Called when hero frame is selected
    public var onHeroFrameSelected: ((CapturedFrame) -> Void)?

    // MARK: - RoomPlan Components

    /// The capture view - creates and owns the session
    private var captureView: RoomCaptureView?

    /// Access to the capture session (from the view)
    public var captureSession: RoomCaptureSession? {
        captureView?.captureSession
    }

    // MARK: - Analyzers (NEW)

    private let coverageAnalyzer = CoverageAnalyzer()
    private let qualityMonitor = QualityMonitor()
    private let completionAnalyzer = CompletionAnalyzer()

    // MARK: - Internal State

    private var scanStartTime: Date?
    private var processedObjectIds: Set<UUID> = []
    private var lastFeatureTime: Date = .distantPast
    private var hasAutoCompleted = false

    // MARK: - Multi-Image Selection

    /// Timestamps when each feature category was first detected (for image correlation)
    private var featureDetectionTimestamps: [FeatureCategory: Date] = [:]

    /// Engine for selecting diverse images from candidates
    private let multiImageSelectionEngine = MultiImageSelectionEngine()

    /// The selected image collection after scan completes
    @Published public private(set) var imageCollection: RoomImageCollection?

    // MARK: - Constants

    private enum Constants {
        static let minimumFeatureInterval: TimeInterval = 8.0 // 8s between features per spec
        static let progressUpdateInterval: TimeInterval = 0.5
        static let completionThreshold: Float = 0.85
    }

    // MARK: - Initialization

    public override init() {
        super.init()
        setupCaptureView()
    }

    private func setupCaptureView() {
        // Create view first - it owns the session
        let view = RoomCaptureView(frame: UIScreen.main.bounds)
        view.captureSession.delegate = self
        captureView = view
    }

    // MARK: - Public Methods

    /// Check if RoomPlan is supported on this device
    public static var isSupported: Bool {
        RoomCaptureSession.isSupported
    }

    /// Get the RoomCaptureView for embedding in SwiftUI
    public func getRoomCaptureView() -> RoomCaptureView {
        // View is created in init, just return it
        guard let view = captureView else {
            // Fallback - create if somehow nil
            setupCaptureView()
            return captureView!
        }
        return view
    }

    /// Start room capture session
    public func startCapture() {
        guard !isScanning else { return }
        guard let view = captureView else {
            errorMessage = "Capture view not initialized"
            return
        }

        // Reset state
        scanProgress = 0
        capturedRoom = nil
        detectedFeatures = []
        errorMessage = nil
        processedObjectIds = []
        scanStartTime = Date()
        hasAutoCompleted = false
        coverageResult = nil
        qualityMetrics = nil
        completionStatus = nil
        heroFrame = nil
        imageCollection = nil
        featureDetectionTimestamps = [:]

        // Reset analyzers
        Task {
            await coverageAnalyzer.reset()
            await qualityMonitor.reset()
            await completionAnalyzer.reset()
        }

        // Start hero frame capture
        frameCaptureService.startCapture()

        // Configure and start the session from the view
        let config = RoomCaptureSession.Configuration()
        view.captureSession.run(configuration: config)

        // Set up AR session delegate for frame capture
        view.captureSession.arSession.delegate = self

        isScanning = true

        // Track scan start
        WalkAnalytics.shared.trackRoomScanStarted(roomType: "living_room")
    }

    /// Stop room capture session
    public func stopCapture() {
        guard isScanning else { return }

        // Stop frame capture
        frameCaptureService.stopCapture()

        captureView?.captureSession.stop()
        isScanning = false
    }

    /// Process the captured room and generate FirstWalkRoomData
    public func processRoom() -> FirstWalkRoomData? {
        guard let room = capturedRoom else { return nil }

        let dimensions = extractDimensions(from: room)
        let scanDuration = scanStartTime.map { Date().timeIntervalSince($0) } ?? 0

        return FirstWalkRoomData(
            roomName: "Living Room",
            dimensions: dimensions,
            detectedFeatures: detectedFeatures,
            scanDuration: scanDuration,
            coveragePercentage: scanProgress,
            heroFrameData: heroFrame?.imageData,
            heroFrameScore: heroFrame?.totalScore,
            candidateFrameCount: frameCaptureService.captureCount,
            imageCollection: imageCollection
        )
    }

    /// Select and finalize the hero frame and multi-image collection (call after scan completes)
    public func finalizeHeroFrame() async -> CapturedFrame? {
        // Get all candidate frames before they're cleared
        let candidates = frameCaptureService.candidateFrames

        // Score all frames
        let scoredFrames = await frameCaptureService.scoringEngine.scoreFrames(candidates)

        // Select multi-image collection using the selection engine
        let collection = await multiImageSelectionEngine.selectImages(
            from: scoredFrames,
            detectedFeatures: detectedFeatures,
            featureTimestamps: featureDetectionTimestamps
        )
        self.imageCollection = collection

        // Set the hero frame from the collection (for backward compatibility)
        let heroFrame = collection.heroImage?.frame
        self.heroFrame = heroFrame

        if let frame = heroFrame {
            self.onHeroFrameSelected?(frame)
        }

        // Clear candidate frames to free memory
        frameCaptureService.clearCandidates()

        return heroFrame
    }

    /// Export the captured room as USDZ data
    /// - Returns: USDZ file data, or nil if export fails
    public func exportUSDZ() async -> Data? {
        guard let room = capturedRoom else {
            print("exportUSDZ: No captured room available")
            return nil
        }

        do {
            // Create temporary URL for export
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(UUID().uuidString).usdz")

            // Export using RoomPlan's built-in export
            try room.export(to: tempURL, exportOptions: .model)

            // Read the exported file data
            let data = try Data(contentsOf: tempURL)

            // Clean up temporary file
            try? FileManager.default.removeItem(at: tempURL)

            print("exportUSDZ: Successfully exported \(data.count) bytes")
            return data

        } catch {
            print("exportUSDZ: Failed to export - \(error.localizedDescription)")
            return nil
        }
    }

    /// Get the current quality grade
    public func getCurrentQualityGrade() async -> QualityMonitor.QualityGrade {
        return await qualityMonitor.finalMetrics().grade
    }

    /// Check if the scan can be completed now
    public func canComplete() async -> Bool {
        return await completionAnalyzer.canComplete()
    }

    // MARK: - Private Methods

    private func extractDimensions(from room: CapturedRoom) -> WalkRoomDimensions {
        // Calculate room bounds from walls
        var minX: Float = .greatestFiniteMagnitude
        var maxX: Float = -.greatestFiniteMagnitude
        var minZ: Float = .greatestFiniteMagnitude
        var maxZ: Float = -.greatestFiniteMagnitude
        var maxY: Float = 2.7 // Default ceiling height

        for wall in room.walls {
            let transform = wall.transform
            let position = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
            let halfWidth = wall.dimensions.x / 2
            let halfDepth = wall.dimensions.z / 2

            minX = min(minX, position.x - halfWidth)
            maxX = max(maxX, position.x + halfWidth)
            minZ = min(minZ, position.z - halfDepth)
            maxZ = max(maxZ, position.z + halfDepth)
            maxY = max(maxY, position.y + wall.dimensions.y)
        }

        let width = maxX - minX
        let length = maxZ - minZ
        let height = maxY

        // Clamp to reasonable values
        return WalkRoomDimensions(
            width: max(2.0, min(width, 20.0)),
            length: max(2.0, min(length, 20.0)),
            height: max(2.0, min(height, 5.0))
        )
    }

    private func processDetectedObjects(from room: CapturedRoom) {
        let now = Date()

        // Process windows
        for window in room.windows {
            guard !processedObjectIds.contains(window.identifier) else { continue }
            processedObjectIds.insert(window.identifier)

            let isLarge = window.dimensions.x * window.dimensions.y > 1.5 // > 1.5 sq meters
            // Confidence is an enum: .low, .medium, .high
            let confidenceValue: Float = switch window.confidence {
                case .high: 1.0
                case .medium: 0.8
                case .low: 0.6
                @unknown default: 0.7
            }
            let feature = DetectedFeature(
                category: isLarge ? .largeWindow : .window,
                confidence: confidenceValue
            )

            emitFeatureIfReady(feature, at: now)
        }

        // Process doors
        for door in room.doors {
            guard !processedObjectIds.contains(door.identifier) else { continue }
            processedObjectIds.insert(door.identifier)
            // Doors don't trigger narration per spec
        }

        // Process objects (furniture, etc.)
        for object in room.objects {
            guard !processedObjectIds.contains(object.identifier) else { continue }
            processedObjectIds.insert(object.identifier)

            if let feature = mapObjectToFeature(object) {
                emitFeatureIfReady(feature, at: now)
            }
        }

        // Check ceiling height
        let dimensions = extractDimensions(from: room)
        if dimensions.height > 2.74 && !detectedFeatures.contains(where: { $0.category == .tallCeiling }) {
            let feature = DetectedFeature(category: .tallCeiling, value: dimensions.height)
            emitFeatureIfReady(feature, at: now)
        }

        // Check for open area
        if dimensions.area > 25 && !detectedFeatures.contains(where: { $0.category == .openArea }) {
            let feature = DetectedFeature(category: .openArea, value: dimensions.area)
            emitFeatureIfReady(feature, at: now)
        }

        // Check for multiple windows
        if room.windows.count > 1 && !detectedFeatures.contains(where: {
            $0.category == .window || $0.category == .largeWindow
        }) {
            // Already handled individual windows above
        }
    }

    private func mapObjectToFeature(_ object: CapturedRoom.Object) -> DetectedFeature? {
        switch object.category {
        case .fireplace:
            return DetectedFeature(category: .fireplace)
        case .storage:
            // Check if it might be a bookshelf based on dimensions
            if object.dimensions.y > 1.0 && object.dimensions.x > 0.5 {
                return DetectedFeature(category: .bookshelf)
            }
            return nil
        case .sofa, .chair:
            return DetectedFeature(category: .seatingArea)
        default:
            return nil
        }
    }

    private func emitFeatureIfReady(_ feature: DetectedFeature, at time: Date) {
        // Enforce minimum interval between features
        guard time.timeIntervalSince(lastFeatureTime) >= Constants.minimumFeatureInterval else {
            return
        }

        // Don't emit duplicates
        guard !detectedFeatures.contains(where: { $0.category == feature.category }) else {
            return
        }

        lastFeatureTime = time
        detectedFeatures.append(feature)

        // Record feature detection timestamp for multi-image correlation
        if featureDetectionTimestamps[feature.category] == nil {
            featureDetectionTimestamps[feature.category] = time
        }

        // Track feature detection
        WalkAnalytics.shared.trackFeatureDetected(
            featureCategory: String(describing: feature.category),
            confidence: Double(feature.confidence)
        )

        onFeatureDetected?(feature)
    }
}

// MARK: - RoomCaptureSessionDelegate

extension RoomCaptureService: RoomCaptureSessionDelegate {

    nonisolated public func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        Task { @MainActor in
            // Analyze coverage using CoverageAnalyzer
            let coverage = await self.coverageAnalyzer.analyze(room)
            self.coverageResult = coverage

            // Update progress based on coverage (more accurate than simple heuristic)
            self.scanProgress = coverage.overallCoverage
            self.onProgressUpdate?(coverage.overallCoverage)

            // Evaluate quality
            await self.qualityMonitor.evaluate(room)
            let quality = await self.qualityMonitor.finalMetrics()
            self.qualityMetrics = quality

            // Analyze completion status
            let completion = await self.completionAnalyzer.analyze(
                room: room,
                coverage: coverage,
                quality: quality
            )

            // Only update if status changed
            if self.completionStatus?.recommendation != completion.recommendation {
                self.completionStatus = completion
                self.onCompletionStatusChanged?(completion)
            } else {
                self.completionStatus = completion
            }

            // Process detected objects for narration
            self.processDetectedObjects(from: room)
        }
    }

    nonisolated public func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        Task { @MainActor in
            self.isScanning = false

            // Stop frame capture
            self.frameCaptureService.stopCapture()

            if let error = error {
                self.errorMessage = error.localizedDescription
                self.onError?(error)
                return
            }

            // Process the captured room data using RoomBuilder
            do {
                let roomBuilder = RoomBuilder(options: [.beautifyObjects])
                let finalRoom = try await roomBuilder.capturedRoom(from: data)
                self.capturedRoom = finalRoom
                self.scanProgress = 1.0

                // Final feature processing
                self.processDetectedObjects(from: finalRoom)

                // Score and select the hero frame
                _ = await self.finalizeHeroFrame()

                // Track scan completion
                let scanDuration = self.scanStartTime.map { Date().timeIntervalSince($0) } ?? 0
                let qualityGrade = await self.qualityMonitor.finalMetrics().grade
                WalkAnalytics.shared.trackRoomScanCompleted(
                    roomType: "living_room",
                    scanDuration: scanDuration,
                    objectsDetected: self.detectedFeatures.count,
                    coveragePercentage: Double(self.scanProgress),
                    qualityGrade: String(describing: qualityGrade)
                )

                self.onScanComplete?(finalRoom)
            } catch {
                self.errorMessage = "Failed to process room: \(error.localizedDescription)"
                self.onError?(error)
            }
        }
    }

    nonisolated public func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
        Task { @MainActor in
            // Could use these instructions to guide the user
            // For now, we handle guidance through narration system
        }
    }

    nonisolated public func captureSession(_ session: RoomCaptureSession, didStartWith configuration: RoomCaptureSession.Configuration) {
        Task { @MainActor in
            self.isScanning = true
            self.scanStartTime = Date()
        }
    }
}

// MARK: - ARSessionDelegate (Hero Frame Capture)

extension RoomCaptureService: ARSessionDelegate {

    nonisolated public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in
            // Capture frames at regular intervals during scanning
            guard self.isScanning else { return }

            await self.frameCaptureService.captureFrame(from: frame)
        }
    }
}
