//
//  AppDelegate.swift
//  Patina
//
//  UIKit application delegate used exclusively to bridge
//  `application(_:handleEventsForBackgroundURLSession:completionHandler:)`
//  into `BackgroundScanUploader`. SwiftUI handles everything else.
//

import UIKit

/// Minimal UIApplicationDelegate. Wired into `PatinaApp` via
/// `@UIApplicationDelegateAdaptor` so iOS will deliver background URL
/// session events after we are woken to finish pending scan uploads.
final class PatinaAppDelegate: NSObject, UIApplicationDelegate {

    /// Called when the system resumes the app to deliver events for a
    /// background URL session. We cache the completion handler on
    /// `BackgroundScanUploader.shared` so it can be invoked from
    /// `urlSessionDidFinishEvents(forBackgroundURLSession:)` once every
    /// pending task has drained.
    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        if identifier == BackgroundScanUploader.sessionIdentifier {
            Task { @MainActor in
                BackgroundScanUploader.shared.backgroundCompletionHandler = completionHandler
            }
        } else {
            completionHandler()
        }
    }
}
