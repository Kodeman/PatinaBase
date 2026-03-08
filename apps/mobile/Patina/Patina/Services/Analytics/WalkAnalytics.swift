//
//  WalkAnalytics.swift
//  Patina
//
//  Analytics events for the Walk (room scanning) feature
//  Per engagement tracking plan: mobile-specific events
//

import Foundation

/// Analytics service specifically for Walk feature events
@MainActor
public final class WalkAnalytics {

    // MARK: - Singleton

    public static let shared = WalkAnalytics()

    // MARK: - Dependencies

    private let posthog = PostHogService.shared

    // MARK: - Initialization

    private init() {}

    // MARK: - Room Scan Events

    /// Track when a room scan is started
    public func trackRoomScanStarted(roomType: String) {
        posthog.capture("room_scan_started", properties: [
            "room_type": roomType,
            "device_model": deviceModel
        ])
    }

    /// Track when a room scan completes successfully
    public func trackRoomScanCompleted(
        roomType: String,
        scanDuration: TimeInterval,
        objectsDetected: Int,
        coveragePercentage: Double,
        qualityGrade: String
    ) {
        posthog.capture("room_scan_completed", properties: [
            "room_type": roomType,
            "scan_duration_seconds": scanDuration,
            "objects_detected": objectsDetected,
            "coverage_percentage": coveragePercentage,
            "quality_grade": qualityGrade,
            "device_model": deviceModel
        ])
    }

    /// Track when a room scan is abandoned before completion
    public func trackRoomScanAbandoned(scanDuration: TimeInterval, progress: Double) {
        posthog.capture("room_scan_abandoned", properties: [
            "scan_duration_seconds": scanDuration,
            "progress": progress
        ])
    }

    /// Track when a room feature is detected during scanning
    public func trackFeatureDetected(featureCategory: String, confidence: Double) {
        posthog.capture("feature_detected", properties: [
            "feature_category": featureCategory,
            "confidence": confidence
        ])
    }

    /// Track AR view interactions with a product
    public func trackARView(
        productId: String,
        viewDuration: TimeInterval,
        interactionType: String
    ) {
        posthog.capture("ar_view", properties: [
            "product_id": productId,
            "view_duration_seconds": viewDuration,
            "interaction_type": interactionType
        ])
    }

    // MARK: - Helpers

    private var deviceModel: String {
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
    }
}
