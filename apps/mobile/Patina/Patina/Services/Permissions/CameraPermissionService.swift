//
//  CameraPermissionService.swift
//  Patina
//
//  Service for managing camera permission requests.
//  Handles AVCaptureDevice authorization for AR/RoomPlan features.
//

import AVFoundation
import Combine
import UIKit

/// Service for managing camera permissions
@MainActor
public final class CameraPermissionService: ObservableObject {

    // MARK: - Singleton

    public static let shared = CameraPermissionService()

    // MARK: - Published State

    @Published public private(set) var status: AVAuthorizationStatus
    @Published public private(set) var isRequesting = false

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

private struct CameraPermissionServiceKey: EnvironmentKey {
    static let defaultValue = CameraPermissionService.shared
}

extension EnvironmentValues {
    public var cameraPermissionService: CameraPermissionService {
        get { self[CameraPermissionServiceKey.self] }
        set { self[CameraPermissionServiceKey.self] = newValue }
    }
}
