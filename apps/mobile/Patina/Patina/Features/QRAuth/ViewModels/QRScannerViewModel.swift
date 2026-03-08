//
//  QRScannerViewModel.swift
//  Patina
//
//  ViewModel for QR code scanner screen.
//  Manages camera permissions and scanning state.
//

import Foundation
import AVFoundation
import UIKit
import Combine

/// ViewModel for QR scanner screen
@Observable
@MainActor
public final class QRScannerViewModel {

    // MARK: - State

    /// Whether the scanner is currently active
    public var isScanning = false

    /// Whether camera permission is granted
    public var hasCameraPermission = false

    /// Whether permission has been requested
    public var hasRequestedPermission = false

    /// Whether to show the approval sheet
    public var showApproval = false

    /// Whether the scanner should dismiss (after successful approval)
    public var shouldDismiss = false

    /// Error message to display
    public var errorMessage: String?

    /// Whether an error is being shown
    public var showError = false

    // MARK: - Dependencies

    private let qrAuthService = QRAuthService.shared
    private let cameraService = CameraPermissionService.shared

    // MARK: - Initialization

    public init() {
        checkCameraPermission()
    }

    // MARK: - Camera Permission

    /// Check current camera permission status
    public func checkCameraPermission() {
        let result = cameraService.checkStatus()
        hasCameraPermission = result == .granted
        hasRequestedPermission = result != .notDetermined
    }

    /// Request camera permission
    public func requestCameraPermission() async {
        let result = await cameraService.requestPermission()
        hasCameraPermission = result == .granted
        hasRequestedPermission = true

        if hasCameraPermission {
            startScanning()
        }
    }

    /// Open device settings for camera permission
    public func openSettings() {
        cameraService.openSettings()
    }

    // MARK: - Scanning

    /// Start scanning for QR codes
    public func startScanning() {
        guard hasCameraPermission else { return }
        isScanning = true
        qrAuthService.startScanning()
        errorMessage = nil
        showError = false
    }

    /// Stop scanning
    public func stopScanning() {
        isScanning = false
    }

    /// Handle a scanned QR code
    /// - Parameter code: The scanned QR code string
    public func handleScannedCode(_ code: String) {
        // Prevent duplicate processing
        guard isScanning else { return }

        stopScanning()
        HapticManager.shared.notification(.success)

        let result = qrAuthService.handleScannedCode(code)

        switch result {
        case .success:
            showApproval = true

        case .failure(let error):
            errorMessage = error.errorDescription
            showError = true

            // Allow retry after showing error
            Task {
                try? await Task.sleep(for: .seconds(3))
                if showError {
                    startScanning()
                }
            }
        }
    }

    /// Dismiss error and resume scanning
    public func dismissError() {
        showError = false
        errorMessage = nil
        startScanning()
    }

    /// Handle approval completion
    public func onApprovalDismissed() {
        // Check if approval was successful before resetting
        let wasApproved = qrAuthService.state == .approved
        showApproval = false
        qrAuthService.reset()
        if wasApproved {
            shouldDismiss = true
        }
    }
}
