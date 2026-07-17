//  FieldPhotoEntry.swift
//  CaptureKit
//
//  One posed-photo record in the `photos_metadata.json` sidecar the Field
//  site-scan writes next to `photos/` inside its export bundle. PURE Codable so
//  the app-target writer (`FieldPosedPhotoService` / `RoomPlanScanSession`) and
//  the app-target reader (`SupabaseSiteScanService` uploader) share ONE shape,
//  and the on-disk contract is unit-testable through CaptureKit.
//
//  Filenames here are bundle-local (inside `photos/`); the uploader turns them
//  into `room-scans` storage URLs at upload time. `capturedAt` is an ISO8601
//  string so the sidecar is encoder-strategy-independent and round-trips 1:1.

import Foundation

public struct FieldPhotoEntry: Codable, Sendable, Equatable {

    /// JPEG filename inside `photos/` (e.g. "auto_001.50.jpg").
    public let filename: String
    /// 256px JPEG thumbnail filename inside `photos/`, or nil if the thumbnail
    /// failed to encode/write — a thumbnail failure NEVER drops the photo.
    public let thumbnailFilename: String?
    /// Row-major flattened 4x4 `ARCamera.transform` (length 16; translation at
    /// indices 3, 7, 11).
    public let cameraTransform: [Double]
    public let cameraIntrinsics: Intrinsics
    /// [pitch, yaw, roll] in radians.
    public let eulerAngles: [Double]
    /// `ARLightEstimate.ambientIntensity` if available (nil otherwise).
    public let lightEstimateLumens: Double?
    /// Seconds since scan start.
    public let timestampSeconds: Double
    /// ISO8601 wall-clock at capture.
    public let capturedAt: String
    public let width: Int
    public let height: Int
    public let fileSizeBytes: Int

    /// `{ fx, fy, cx, cy, width, height }` — `ARCamera.intrinsics` + the frame's
    /// image resolution. Mirrors the `room_scan_images.camera_intrinsics` JSONB.
    public struct Intrinsics: Codable, Sendable, Equatable {
        public let fx: Double
        public let fy: Double
        public let cx: Double
        public let cy: Double
        public let width: Int
        public let height: Int

        public init(fx: Double, fy: Double, cx: Double, cy: Double, width: Int, height: Int) {
            self.fx = fx
            self.fy = fy
            self.cx = cx
            self.cy = cy
            self.width = width
            self.height = height
        }
    }

    public init(
        filename: String,
        thumbnailFilename: String?,
        cameraTransform: [Double],
        cameraIntrinsics: Intrinsics,
        eulerAngles: [Double],
        lightEstimateLumens: Double?,
        timestampSeconds: Double,
        capturedAt: String,
        width: Int,
        height: Int,
        fileSizeBytes: Int
    ) {
        self.filename = filename
        self.thumbnailFilename = thumbnailFilename
        self.cameraTransform = cameraTransform
        self.cameraIntrinsics = cameraIntrinsics
        self.eulerAngles = eulerAngles
        self.lightEstimateLumens = lightEstimateLumens
        self.timestampSeconds = timestampSeconds
        self.capturedAt = capturedAt
        self.width = width
        self.height = height
        self.fileSizeBytes = fileSizeBytes
    }
}
