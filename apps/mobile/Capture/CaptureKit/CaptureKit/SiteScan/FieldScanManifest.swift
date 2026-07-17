//  FieldScanManifest.swift
//  CaptureKit
//
//  The `manifest.json` for a Field capture bundle (Field Capture P1 · item 8), per
//  capture-bundle-spec-v1.md §3. A strict SUPERSET of the client v3 `ScanManifest`
//  (`apps/mobile/Patina/.../Walk/Models/ScanManifest.swift`): every inherited key
//  keeps its v3 name; the instrument layer (session, anchors, scorecard,
//  poseGraphSummary, unverified, checksumAlgorithm, bundleSpecVersion) is new.
//
//  Pure Codable — assembled by `FieldManifestAssembler` at finish() and validated by
//  `scripts/validate_capture_bundle.py`. `scan_schema_version = 3` is the DB marker;
//  `bundleSpecVersion = 1` distinguishes a Field instrument bundle in the manifest.

import Foundation

public struct FieldScanManifest: Codable, Equatable, Sendable {

    // ── Inherited v3 + instrument top level (§3.1) ──
    public var schemaVersion: Int          // 3 (on-disk v3 format)
    public var bundleSpecVersion: Int      // 1 (Field instrument marker)
    public var scanId: String
    public var roomName: String
    public var createdAt: String           // ISO8601
    public var completedAt: String         // ISO8601
    public var unverified: Bool            // anchors.count < 3 (AnchorGate)
    public var checksumAlgorithm: String   // "sha256"

    public var device: Device
    public var capture: Capture
    public var session: Session            // new (§3.2)
    public var anchors: [AnchorRecord]     // new (§3.3) — folds anchors.json
    public var scorecard: Scorecard        // new (§3.4)
    public var poseGraphSummary: PoseGraphSummary  // new (§3.5)
    public var captureEnvironment: CaptureEnvironment
    public var annotations: Annotations
    public var artifacts: [ManifestArtifact]  // §3.6 — sha256 required per artifact
    public var photos: [FieldPhotoEntry]

    public struct Device: Codable, Equatable, Sendable {
        public var model: String
        public var osVersion: String
        public var hasLidar: Bool
        public var roomPlanVersion: String
        public init(model: String, osVersion: String, hasLidar: Bool, roomPlanVersion: String) {
            self.model = model; self.osVersion = osVersion
            self.hasLidar = hasLidar; self.roomPlanVersion = roomPlanVersion
        }
    }

    public struct Capture: Codable, Equatable, Sendable {
        public var highFidelityDepthEnabled: Bool
        public var autoPhotoInterval: TimeInterval
        public var multiRoomBuilderId: String?
        public init(highFidelityDepthEnabled: Bool, autoPhotoInterval: TimeInterval,
                    multiRoomBuilderId: String? = nil) {
            self.highFidelityDepthEnabled = highFidelityDepthEnabled
            self.autoPhotoInterval = autoPhotoInterval
            self.multiRoomBuilderId = multiRoomBuilderId
        }
    }

    public struct Session: Codable, Equatable, Sendable {
        public var sessionId: String
        public var appVersion: String
        public var appBuild: String
        public var startedAt: String
        public var endedAt: String
        public var captureDurationSeconds: Int
        public var arWorldTrackingConfig: String   // "shared-roomcapture"
        public var thermalPeak: String
        public init(sessionId: String, appVersion: String, appBuild: String,
                    startedAt: String, endedAt: String, captureDurationSeconds: Int,
                    arWorldTrackingConfig: String, thermalPeak: String) {
            self.sessionId = sessionId; self.appVersion = appVersion; self.appBuild = appBuild
            self.startedAt = startedAt; self.endedAt = endedAt
            self.captureDurationSeconds = captureDurationSeconds
            self.arWorldTrackingConfig = arWorldTrackingConfig; self.thermalPeak = thermalPeak
        }
    }

    public struct PoseGraphSummary: Codable, Equatable, Sendable {
        public var keyframeCount: Int
        public var nodeCount: Int
        public var edgeCount: Int
        public var loopClosures: Int
        public var meanTranslationDriftPct: Double
        public var blurRejectedCount: Int
        // Field additions (item-4 counters, spec-delta logged): raw failures + drops.
        public var rawBlurFailures: Int
        public var encodeDropped: Int
        public init(keyframeCount: Int, nodeCount: Int, edgeCount: Int, loopClosures: Int,
                    meanTranslationDriftPct: Double, blurRejectedCount: Int,
                    rawBlurFailures: Int, encodeDropped: Int) {
            self.keyframeCount = keyframeCount; self.nodeCount = nodeCount
            self.edgeCount = edgeCount; self.loopClosures = loopClosures
            self.meanTranslationDriftPct = meanTranslationDriftPct
            self.blurRejectedCount = blurRejectedCount
            self.rawBlurFailures = rawBlurFailures; self.encodeDropped = encodeDropped
        }
    }

    public struct CaptureEnvironment: Codable, Equatable, Sendable {
        public var lightEstimate: Double?
        public var thermalState: String?
        public var batteryLevel: Double?
        public var motionQuality: String?
        public var sceneDepthFrameCount: Int?
        public var coverageHeatmapPresent: Bool
        public init(lightEstimate: Double? = nil, thermalState: String? = nil,
                    batteryLevel: Double? = nil, motionQuality: String? = nil,
                    sceneDepthFrameCount: Int? = nil, coverageHeatmapPresent: Bool = false) {
            self.lightEstimate = lightEstimate; self.thermalState = thermalState
            self.batteryLevel = batteryLevel; self.motionQuality = motionQuality
            self.sceneDepthFrameCount = sceneDepthFrameCount
            self.coverageHeatmapPresent = coverageHeatmapPresent
        }
    }

    public struct Annotations: Codable, Equatable, Sendable {
        public var roomNotes: String
        public var userProvidedRoomName: String?
        public var reviewCompletedAt: String?
        public init(roomNotes: String = "", userProvidedRoomName: String? = nil,
                    reviewCompletedAt: String? = nil) {
            self.roomNotes = roomNotes
            self.userProvidedRoomName = userProvidedRoomName
            self.reviewCompletedAt = reviewCompletedAt
        }
    }
}

/// One artifact row (§3.6). `sha256` is REQUIRED in a v1 bundle (spec B-5); the
/// assembler always sets it.
public struct ManifestArtifact: Codable, Equatable, Sendable {
    public var kind: String
    public var relativePath: String
    public var sizeBytes: Int
    public var sha256: String
    public var mimeType: String
    public init(kind: String, relativePath: String, sizeBytes: Int, sha256: String, mimeType: String) {
        self.kind = kind; self.relativePath = relativePath
        self.sizeBytes = sizeBytes; self.sha256 = sha256; self.mimeType = mimeType
    }
}
