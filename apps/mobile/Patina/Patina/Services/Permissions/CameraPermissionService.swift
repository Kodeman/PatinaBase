//
//  CameraPermissionService.swift
//  Patina
//
//  Service for managing camera permission requests.
//  Handles AVCaptureDevice authorization for AR/RoomPlan features.
//

import AVFoundation
import Observation
import UIKit

/// Copy shared by the onboarding primer and the system-permission preflight.
/// It mirrors the shipped held-local scan pipeline: RoomPlan geometry and
/// reference photos stay on this iPhone after scanning, then upload only when
/// the person explicitly sends the room through design services.
enum CameraTrustCopy {
    static let purposeTitle = "Use the camera for a guided scan"
    static let purposeBody = "Patina records the room’s shape and a small set of reference photos so you can review the room and find pieces that fit."
    static let localStorage = "Your scan—including room geometry and reference photos—is saved on this iPhone first."
    static let sharing = "Finishing a scan does not upload it. If you later send the room to a designer, the scan artifacts and saved reference photos are uploaded to Patina for that request."
    static let manualAction = "Enter room details instead"
    static let onboardingSummary = "A guided scan records room shape and reference photos on this iPhone. Nothing is uploaded unless you later send the room to a designer. You can enter room details instead."
}

enum CameraPermissionDestination: Equatable {
    case scan
    case deniedExplanation
    case manualRoomEntry
    case awaitChoice
}

enum CameraPermissionPolicy {
    static func destination(
        for permissionResult: CameraPermissionResult,
        choseManualEntry: Bool = false
    ) -> CameraPermissionDestination {
        if choseManualEntry { return .manualRoomEntry }
        switch permissionResult {
        case .granted: return .scan
        case .denied: return .deniedExplanation
        case .notDetermined: return .awaitChoice
        }
    }
}

/// Service for managing camera permissions
@MainActor
@Observable
public final class CameraPermissionService {

    // MARK: - Singleton

    public static let shared = CameraPermissionService()

    // MARK: - Published State

    public private(set) var status: AVAuthorizationStatus
    public private(set) var isRequesting = false

    // MARK: - Computed Properties

    /// Whether camera access is authorized
    public var isAuthorized: Bool {
        status == .authorized
    }

    /// Whether permission is denied (and requires settings)
    public var isDenied: Bool {
        status == .denied || status == .restricted
    }

    /// Whether permission hasn't been requested yet
    public var isNotDetermined: Bool {
        status == .notDetermined
    }

    // MARK: - Initialization

    private init() {
        self.status = AVCaptureDevice.authorizationStatus(for: .video)
    }

    // MARK: - Public Methods

    /// Check and update the current camera permission status
    public func checkStatus() -> CameraPermissionResult {
        status = AVCaptureDevice.authorizationStatus(for: .video)
        return mapToResult(status)
    }

    /// Request camera permission
    /// - Returns: Permission result after request completes
    @discardableResult
    public func requestPermission() async -> CameraPermissionResult {
        // If already determined, return current status
        guard isNotDetermined else {
            return checkStatus()
        }

        isRequesting = true

        let granted = await AVCaptureDevice.requestAccess(for: .video)

        isRequesting = false
        status = AVCaptureDevice.authorizationStatus(for: .video)

        return granted ? .granted : .denied
    }

    /// Open device settings for camera permission
    public func openSettings() {
        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else {
            return
        }

        if UIApplication.shared.canOpenURL(settingsURL) {
            UIApplication.shared.open(settingsURL)
        }
    }

    // MARK: - Private Helpers

    private func mapToResult(_ status: AVAuthorizationStatus) -> CameraPermissionResult {
        switch status {
        case .authorized:
            return .granted
        case .denied, .restricted:
            return .denied
        case .notDetermined:
            return .notDetermined
        @unknown default:
            return .notDetermined
        }
    }
}

// MARK: - SwiftUI Environment

import SwiftUI

extension EnvironmentValues {
    @Entry public var cameraPermissionService: CameraPermissionService = .shared
}
