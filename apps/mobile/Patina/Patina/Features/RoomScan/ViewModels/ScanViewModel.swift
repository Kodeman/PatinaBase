//
//  ScanViewModel.swift
//  Patina
//
//  Observable model for the Quiet Conversation scan (Movement 1: The Walk).
//
//  Responsibilities:
//    - Own the RoomCaptureService and observe its progress
//    - Drive WhisperState transitions with haptic cues
//    - Detect edge cases (low light, fast movement, feature loss, idle)
//    - Auto-complete when progress ≥ 0.95 held for 2s
//    - Emit analytics events per PRD §8
//
//  Per PRD §4.2 and §4.3.
//

import Foundation
import SwiftUI
import Combine
import RoomPlan
import ARKit
import CoreMotion

/// Tracking states beyond "normal scanning" that drive the Whisper Bar overrides.
public enum ScanTrackingState: Equatable {
    case normal
    case lowLight
    case fastMovement
    case featureLoss
    case idle
    case roomTooLarge
    /// Terminal session failure (RSError drift detection, AR world-tracking
    /// failure). Recoverable only by tearing down the session and starting
    /// fresh — surfaced via a blocking modal in ScanWalkView.
    case sessionLost
}

/// Final reason the scan ended — used by the coordinator.
public enum ScanCompletionReason: Equatable {
    case auto        // reached ≥95% held for 2s
    case userFinish  // user tapped "Finish with what we have"
    case userAbandon // user tapped "Start Over"
}

@MainActor
@Observable
public final class ScanViewModel {

    // MARK: - Published state

    public private(set) var scanProgress: Float = 0
    public private(set) var scanQuality: Float = 0
    public private(set) var whisperState: WhisperState = .forProgress(0)
    public private(set) var trackingState: ScanTrackingState = .normal
    public private(set) var isComplete: Bool = false
    public private(set) var isPaused: Bool = false
    public var showPauseMenu: Bool = false

    /// Mirror of `captureService.coachingHint` — exposed so the Walk UI can
    /// render directional guidance toward under-covered areas of the room.
    public private(set) var coachingHint: CoverageAnalyzer.CoachingHint?

    /// Session in progress. Finalized when the scan completes.
    public private(set) var session: RoomScanSession

    /// The RoomPlan capture service — we create our own instance so the UI can
    /// embed the view. In tests you can pass a pre-built service.
    public let captureService: RoomCaptureService

    // MARK: - Callbacks

    /// Called when the scan reaches its end state. The coordinator subscribes.
    public var onCompleted: ((RoomScanSession, ScanCompletionReason) -> Void)?

    // MARK: - Internals

    private let haptics = ScanHaptics.shared
    private let analytics = ScanAnalytics.shared

    private var motionManager: CMMotionManager?
    private var lastMotionAt: Date = .distantPast
    private var hasStartedFromMotion: Bool = false

    /// Timer-based auto-complete: progress must stay ≥0.95 for this long.
    private var readyToCompleteSince: Date?

    /// Tracks which progress milestones (25/50/75) have already been reported.
    private var reportedMilestones: Set<Int> = []

    private var progressObservation: AnyCancellable?
    private var coachingHintObservation: AnyCancellable?
    private var sessionFailureObservation: AnyCancellable?

    /// Non-nil while the user is staring at a session-lost overlay; bound to
    /// `captureService.sessionFailure`. The underlying error's
    /// `localizedDescription` is shown for diagnostics in DEBUG builds; the
    /// user-facing copy stays generic ("Lost tracking — try again?").
    public private(set) var sessionFailureMessage: String?

    // MARK: - Init

    public init(
        userId: String,
        hasLidar: Bool,
        captureService: RoomCaptureService? = nil
    ) {
        self.captureService = captureService ?? RoomCaptureService()
        self.session = RoomScanSession(
            userId: userId,
            scanMethod: hasLidar ? .lidar : .manual,
            hasLidar: hasLidar
        )

        self.analytics.context = ScanAnalytics.Context(
            sessionId: session.sessionId.uuidString,
            userId: userId,
            hasLidar: hasLidar
        )
    }

    // MARK: - Lifecycle

    /// Called from the view's `.onAppear`. Sets up observation but does NOT
    /// start the RoomPlan session — per PRD §4.1, movement is the trigger.
    public func prepare() {
        haptics.resetSession()
        reportedMilestones.removeAll()
        readyToCompleteSince = nil
        isComplete = false
        hasStartedFromMotion = false

        analytics.track(.thresholdEntered(previousRoomType: nil))

        observeCaptureService()
        startMotionDetection()
    }

    /// Called when the view disappears (or coordinator resets).
    public func teardown() {
        stopMotionDetection()
        progressObservation?.cancel()
        progressObservation = nil
        coachingHintObservation?.cancel()
        coachingHintObservation = nil

        if !isComplete {
            analytics.track(.scanAbandoned(progress: scanProgress))
        }

        captureService.stopCapture()
        analytics.context = nil
    }

    // MARK: - Actions from the view

    public func didTapPause() {
        showPauseMenu = true
        isPaused = true
        analytics.track(.scanPaused(progress: scanProgress))
    }

    public func didDismissPauseMenu() {
        showPauseMenu = false
        isPaused = false
        analytics.track(.scanResumed)
    }

    public func didTapResume() {
        showPauseMenu = false
        isPaused = false
        analytics.track(.scanResumed)
    }

    public func didTapFinishPartial() {
        showPauseMenu = false
        // If the user pressed Finish before a scan actually started (no
        // captureService.currentScanId, nothing on disk to review), treat it
        // as an abandonment instead of a zero-data finish. Otherwise the
        // review step would try to load a manifest that was never written.
        if captureService.currentScanId == nil || scanProgress <= 0.001 {
            analytics.track(.scanAbandoned(progress: scanProgress))
            captureService.stopCapture()
            completeScan(reason: .userAbandon)
            return
        }
        analytics.track(.scanPartialAccepted(progress: scanProgress))
        completeScan(reason: .userFinish)
    }

    public func didTapStartOver() {
        showPauseMenu = false
        analytics.track(.scanAbandoned(progress: scanProgress))
        // Reset everything
        scanProgress = 0
        scanQuality = 0
        whisperState = .forProgress(0)
        trackingState = .normal
        isComplete = false
        isPaused = false
        hasStartedFromMotion = false
        readyToCompleteSince = nil
        reportedMilestones.removeAll()
        haptics.resetSession()
        captureService.stopCapture()
    }

    /// Handle the 30s-idle "Finish with this" option.
    public func didChooseFinishIdle() {
        if captureService.currentScanId == nil || scanProgress <= 0.001 {
            analytics.track(.scanAbandoned(progress: scanProgress))
            captureService.stopCapture()
            completeScan(reason: .userAbandon)
            return
        }
        analytics.track(.scanPartialAccepted(progress: scanProgress))
        completeScan(reason: .userFinish)
    }

    /// Handle the 30s-idle "Keep going" option.
    public func didChooseKeepGoing() {
        trackingState = .normal
        whisperState = .forProgress(scanProgress)
    }

    /// "Try again" on the session-lost overlay — wipe the failed session and
    /// start a fresh one with a new scanId.
    public func didTapRetryAfterSessionLost() {
        analytics.track(.scanStarted)
        scanProgress = 0
        scanQuality = 0
        whisperState = .forProgress(0)
        isComplete = false
        isPaused = false
        hasStartedFromMotion = false
        readyToCompleteSince = nil
        reportedMilestones.removeAll()
        haptics.resetSession()
        sessionFailureMessage = nil
        trackingState = .normal
        captureService.retryAfterFailure()
    }

    /// "Cancel" on the session-lost overlay — abandon the scan and route home.
    public func didTapCancelAfterSessionLost() {
        analytics.track(.scanAbandoned(progress: scanProgress))
        captureService.stopCapture()
        sessionFailureMessage = nil
        completeScan(reason: .userAbandon)
    }

    // MARK: - Observation

    private func observeCaptureService() {
        // The service is an ObservableObject that publishes scanProgress.
        // We bridge to the Observable view model via an explicit sink.
        progressObservation = captureService.$scanProgress
            .receive(on: RunLoop.main)
            .sink { [weak self] progress in
                self?.handleProgress(progress)
            }

        // Bridge the coverage coaching hint for the UI layer.
        coachingHintObservation = captureService.$coachingHint
            .receive(on: RunLoop.main)
            .sink { [weak self] hint in
                self?.coachingHint = hint
            }

        // Surface terminal session failures (RSError drift detection, ARKit
        // world-tracking failure, etc.) as a `sessionLost` tracking state so
        // the Walk UI can offer a Try Again / Cancel affordance instead of
        // letting the user stare at a frozen camera.
        sessionFailureObservation = captureService.$sessionFailure
            .receive(on: RunLoop.main)
            .sink { [weak self] error in
                guard let self else { return }
                if let error {
                    self.sessionFailureMessage = error.localizedDescription
                    self.trackingState = .sessionLost
                    self.analytics.track(
                        .scanAbandoned(progress: self.scanProgress)
                    )
                } else if self.trackingState == .sessionLost {
                    self.sessionFailureMessage = nil
                    self.trackingState = .normal
                }
            }
    }

    private func handleProgress(_ progress: Float) {
        scanProgress = progress
        session.scanProgress = progress

        // Update quality from the service when available
        if let metrics = captureService.qualityMetrics {
            let grade = metrics.grade
            scanQuality = Self.qualityFloat(for: grade)
            session.scanQuality = scanQuality
        }

        // Derive new whisper state — only update when the band changes to
        // avoid redundant redraws.
        let next = WhisperState.forProgress(progress)
        if trackingState == .normal, next.band != whisperState.band {
            whisperState = next
            haptics.fireIfNewBand(next)
        }

        // Milestone analytics at 25/50/75 (fire once each)
        reportMilestoneIfNeeded(progress)

        // Auto-complete check
        checkAutoComplete()
    }

    private static func qualityFloat(for grade: QualityMonitor.QualityGrade) -> Float {
        switch grade {
        case .excellent:  return 1.0
        case .good:       return 0.8
        case .acceptable: return 0.6
        case .poor:       return 0.4
        }
    }

    private func reportMilestoneIfNeeded(_ progress: Float) {
        let milestone: Int
        switch progress {
        case 0.25..<0.5:  milestone = 25
        case 0.5..<0.75:  milestone = 50
        case 0.75..<0.95: milestone = 75
        default: return
        }
        guard !reportedMilestones.contains(milestone) else { return }
        reportedMilestones.insert(milestone)
        analytics.track(.scanProgressMilestone(milestone: milestone))
    }

    private func checkAutoComplete() {
        // Composite gate: pure coverage progress alone is no longer enough.
        // The capture service's CompletionAnalyzer combines coverage + walls
        // + confidence + lighting + motion into a single recommendation, and
        // we only auto-complete once that recommendation says we can.
        let compositeReady =
            captureService.completionStatus?.recommendation.canComplete == true
        guard scanProgress >= 0.95, compositeReady, !isComplete else {
            readyToCompleteSince = nil
            return
        }
        if let since = readyToCompleteSince {
            if Date().timeIntervalSince(since) >= 2.0 {
                completeScan(reason: .auto)
            }
        } else {
            readyToCompleteSince = Date()
        }
    }

    private func completeScan(reason: ScanCompletionReason) {
        guard !isComplete else { return }
        isComplete = true

        // Finalize session data from the capture service
        session.completedAt = Date()
        session.scanProgress = max(scanProgress, 0.95)
        session.features.roomType = inferredRoomType()

        if let room = captureService.capturedRoom {
            session.dimensions = Self.extractDimensions(from: room)
            session.features.windowCount = room.windows.count
            session.features.doorCount = room.doors.count
            session.features.hasFireplace = room.objects.contains { $0.category == .fireplace }
            session.detectedObjects = room.objects.map { obj in
                ScanDetectedObject(
                    category: String(describing: obj.category),
                    position: SIMD3<Float>(
                        obj.transform.columns.3.x,
                        obj.transform.columns.3.y,
                        obj.transform.columns.3.z
                    ),
                    dimensions: obj.dimensions,
                    confidence: Self.confidenceFloat(obj.confidence)
                )
            }
        }

        haptics.scanComplete()
        whisperState = .forProgress(1.0)

        let duration = Date().timeIntervalSince(session.startedAt)
        analytics.track(.scanCompleted(durationSeconds: duration, quality: scanQuality))

        // Notify the coordinator
        let final = session
        onCompleted?(final, reason)
    }

    private func inferredRoomType() -> String {
        // Placeholder — RoomPlan doesn't directly expose room type.
        // The Q5 contextual card stack will fall back to "living_room"
        // if no better signal is available.
        session.features.roomType.isEmpty ? "living_room" : session.features.roomType
    }

    private static func confidenceFloat(_ c: CapturedRoom.Confidence) -> Float {
        switch c {
        case .high:   return 1.0
        case .medium: return 0.8
        case .low:    return 0.6
        @unknown default: return 0.7
        }
    }

    private static func extractDimensions(from room: CapturedRoom) -> ScanRoomDimensions {
        var minX: Float = .greatestFiniteMagnitude
        var maxX: Float = -.greatestFiniteMagnitude
        var minZ: Float = .greatestFiniteMagnitude
        var maxZ: Float = -.greatestFiniteMagnitude
        var maxY: Float = 2.7

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

        let width = max(2.0, min(maxX - minX, 20.0))
        let length = max(2.0, min(maxZ - minZ, 20.0))
        let height = max(2.0, min(maxY, 5.0))
        return ScanRoomDimensions(
            length: length,
            width: width,
            height: height,
            area: width * length
        )
    }

    // MARK: - Motion-triggered start (PRD §4.1)

    private func startMotionDetection() {
        let manager = CMMotionManager()
        manager.accelerometerUpdateInterval = 0.1
        guard manager.isAccelerometerAvailable else {
            // Fall back to auto-start if accelerometer isn't available
            startCaptureIfNeeded()
            return
        }

        manager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let self, let data else { return }
            let acc = data.acceleration
            let magnitude = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z)
            // Threshold: > 1.15 g means active movement (baseline 1.0 g under gravity)
            if magnitude > 1.15 {
                self.lastMotionAt = Date()
                if !self.hasStartedFromMotion {
                    self.hasStartedFromMotion = true
                    self.startCaptureIfNeeded()
                }
            }
            self.checkIdleState()
        }
        self.motionManager = manager
    }

    private func stopMotionDetection() {
        motionManager?.stopAccelerometerUpdates()
        motionManager = nil
    }

    private func startCaptureIfNeeded() {
        guard !captureService.isScanning else { return }
        captureService.startCapture()
        analytics.track(.scanStarted)
    }

    private func checkIdleState() {
        guard hasStartedFromMotion, !isComplete, trackingState == .normal else { return }
        let idleFor = Date().timeIntervalSince(lastMotionAt)
        if idleFor > 30 {
            trackingState = .idle
            whisperState = .idle
            analytics.track(.edgeIdle)
        }
    }
}
