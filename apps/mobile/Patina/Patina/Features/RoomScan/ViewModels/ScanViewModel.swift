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
import Observation
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
    /// True once movement (or the manual-start cue) has kicked off capture.
    /// Public read-only so the Threshold view can decide whether to surface
    /// the "Begin walking to start, or tap here" cue (Theme IV).
    public private(set) var hasStartedFromMotion: Bool = false

    /// Timer-based auto-complete: progress must stay ≥0.95 for this long.
    private var readyToCompleteSince: Date?

    /// Tracks which progress milestones (25/50/75) have already been reported.
    private var reportedMilestones: Set<Int> = []

    /// True while the `withObservationTracking` re-arm loop bridging
    /// `captureService`'s @Observable state into this view model is live.
    /// Set false in `teardown()` to stop re-arming after the final fire.
    @ObservationIgnored private var isObservingCaptureService = false

    /// Last-seen snapshots used by the observation bridge to dispatch only
    /// the handler(s) whose underlying property actually changed.
    @ObservationIgnored private var lastObservedProgress: Float = 0
    @ObservationIgnored private var lastObservedCoachingHint: CoverageAnalyzer.CoachingHint?
    @ObservationIgnored private var lastObservedSessionFailureIsSet = false

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
        // Stop the @Observable bridge from re-arming after its next fire.
        isObservingCaptureService = false

        if !isComplete {
            analytics.track(.scanAbandoned(progress: scanProgress))
        }

        captureService.stopCapture()
        analytics.context = nil
    }

    // MARK: - Meaningful-data threshold (R12)

    /// Coverage below which a scan is considered effectively empty unless
    /// RoomPlan has locked onto real structure. 0.15 matches the
    /// CoverageAnalyzer's own `.beginning` → `.exploring` phase boundary —
    /// under it the analyzer itself still says "Let's begin".
    public static let meaningfulScanProgressThreshold: Float = 0.15

    /// Whether the scan has captured enough real data for "Finish With What
    /// We Have" to produce a reviewable bundle. Below this the pause menu
    /// disables the finish row ("Walk a little more first") so an
    /// effectively-empty scan can never silently "finish" — the old behavior
    /// classified it as an abandonment and dropped the user back home with
    /// zero acknowledgment (device review R12).
    public var hasMeaningfulScanData: Bool {
        // No bundle on disk → nothing the review step could load.
        guard captureService.currentScanId != nil else { return false }
        if scanProgress >= Self.meaningfulScanProgressThreshold { return true }
        // Low coverage can still be worth keeping if RoomPlan has resolved
        // actual surfaces/walls (small rooms hit structure before coverage).
        if let coverage = captureService.coverageResult, coverage.detectedSurfaces > 0 {
            return true
        }
        if let room = captureService.capturedRoom, !room.walls.isEmpty {
            return true
        }
        return false
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
        //
        // R12: this branch should be unreachable from the pause menu — the
        // finish row is disabled below `hasMeaningfulScanData` — but the
        // guard stays as a backstop so a zero-data finish can never push an
        // empty bundle into review/upload.
        if captureService.currentScanId == nil || scanProgress <= 0.001 {
            analytics.track(.scanAbandoned(progress: scanProgress))
            captureService.stopCapture()
            completeScan(reason: .userAbandon)
            return
        }
        analytics.track(.scanPartialAccepted(progress: scanProgress))
        completeScan(reason: .userFinish)
    }

    /// "Leave Scan" from the pause menu (R13). The user has already passed a
    /// "Discard this scan?" confirmation in PauseMenuView. Stops capture and
    /// completes with `.userAbandon`, which the flow host routes straight
    /// home without presenting review or creating any room.
    public func didTapLeaveScan() {
        showPauseMenu = false
        isPaused = false
        analytics.track(.scanAbandoned(progress: scanProgress))
        captureService.stopCapture()
        completeScan(reason: .userAbandon)
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

    /// Bridge `captureService`'s `@Observable` state into this view model.
    ///
    /// `RoomCaptureService` migrated from `ObservableObject`/`@Published` to
    /// `@Observable`, so there is no longer a Combine `$property` publisher to
    /// `.sink` on. Instead we re-arm a `withObservationTracking` observation:
    /// the `apply` closure reads the three properties we care about (which
    /// registers them with the Observation runtime), and `onChange` fires once
    /// when ANY of them mutates. We then snapshot the current values, dispatch
    /// the handler(s) whose value actually changed, and re-arm — exactly
    /// reproducing the per-property Combine behaviour.
    ///
    /// Both classes are `@MainActor`, so `onChange` (delivered on the actor
    /// that mutated the property) runs on the main actor; we hop through a
    /// `Task { @MainActor in }` for strict-concurrency cleanliness because
    /// `onChange` itself is a non-isolated closure.
    private func observeCaptureService() {
        isObservingCaptureService = true
        // Seed the snapshots so the first re-arm doesn't spuriously dispatch.
        lastObservedProgress = captureService.scanProgress
        lastObservedCoachingHint = captureService.coachingHint
        lastObservedSessionFailureIsSet = captureService.sessionFailure != nil
        armCaptureServiceObservation()
    }

    private func armCaptureServiceObservation() {
        guard isObservingCaptureService else { return }
        withObservationTracking {
            // Touch each tracked property so Observation registers them.
            _ = captureService.scanProgress
            _ = captureService.coachingHint
            _ = captureService.sessionFailure
        } onChange: { [weak self] in
            // onChange is a nonisolated closure; hop back onto the main actor
            // (where both @Observable classes live) to read + dispatch.
            Task { @MainActor [weak self] in
                guard let self, self.isObservingCaptureService else { return }
                self.dispatchCaptureServiceChanges()
                // Re-arm for the next mutation.
                self.armCaptureServiceObservation()
            }
        }
    }

    /// Compare the latest `captureService` values against the last snapshot and
    /// invoke the matching handler for each property that changed.
    private func dispatchCaptureServiceChanges() {
        let progress = captureService.scanProgress
        if progress != lastObservedProgress {
            lastObservedProgress = progress
            handleProgress(progress)
        }

        let hint = captureService.coachingHint
        if hint != lastObservedCoachingHint {
            lastObservedCoachingHint = hint
            coachingHint = hint
        }

        let failure = captureService.sessionFailure
        let failureIsSet = failure != nil
        if failureIsSet != lastObservedSessionFailureIsSet {
            lastObservedSessionFailureIsSet = failureIsSet
            handleSessionFailure(failure)
        }
    }

    /// Surface terminal session failures (RSError drift detection, ARKit
    /// world-tracking failure, etc.) as a `sessionLost` tracking state so the
    /// Walk UI can offer a Try Again / Cancel affordance instead of letting the
    /// user stare at a frozen camera.
    private func handleSessionFailure(_ error: (any Error)?) {
        if let error {
            sessionFailureMessage = error.localizedDescription
            trackingState = .sessionLost
            analytics.track(.scanAbandoned(progress: scanProgress))
        } else if trackingState == .sessionLost {
            sessionFailureMessage = nil
            trackingState = .normal
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

        // Stop the capture session so RoomPlan's didEndWith delegate fires,
        // which is what triggers freezeBundleArtifacts (the producer that
        // writes usdz/captured_room/world_map/mesh into the bundle). Without
        // this, the .auto-complete path raced the review screen ahead of the
        // freeze and the upload read an empty manifest (2026-05-13 race
        // diagnosis — see upload-diagnostics.log scan AF5527F5: read_manifest
        // at 09:00:45 with 0 artifacts vs freeze.end at 09:00:47 with 7).
        // didTapFinishPartial / didChooseFinishIdle already called stopCapture
        // before completeScan; the .auto path was the only one missing it.
        captureService.stopCapture()

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

    /// Theme IV: explicit manual start for users who stand still at the
    /// threshold. Capture normally begins on motion (PRD §4.1); the
    /// Threshold view surfaces a "tap to start" cue after ~5s of stillness
    /// and routes here.
    public func didTapManualStart() {
        guard !captureService.isScanning else { return }
        hasStartedFromMotion = true
        lastMotionAt = Date() // don't trip the 30s idle state immediately
        startCaptureIfNeeded()
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
