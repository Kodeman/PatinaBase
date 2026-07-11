//
//  AppDelegate.swift
//  Patina
//
//  UIKit application delegate. Bridges two iOS-only callbacks into the
//  SwiftUI app:
//   1. `application(_:handleEventsForBackgroundURLSession:completionHandler:)`
//      → `BackgroundScanUploader` so paused scan uploads can finish.
//   2. `UNUserNotificationCenterDelegate` hooks for APNs deep-link
//      routing — taps on push notifications resolve to an `AppRoute`
//      via `NotificationRouter` and are pushed through
//      `DeepLinkHandler.shared.navigate(to:)`. The originating
//      `notification_log.id` is marked opened via
//      `NotificationsAPIClient.markOpened`.
//

import UIKit
import UserNotifications

/// Minimal UIApplicationDelegate. Wired into `PatinaApp` via
/// `@UIApplicationDelegateAdaptor` so iOS can deliver background URL
/// session events and remote-notification taps.
final class PatinaAppDelegate: NSObject, UIApplicationDelegate {

    // MARK: - Launch

    /// Install the notification-center delegate so `userNotificationCenter`
    /// callbacks below fire for both foreground and background taps.
    /// Cold-launch taps (where the app was terminated when the user
    /// tapped) arrive through `launchOptions[.remoteNotification]` — we
    /// resolve those here and hand them to `DeepLinkHandler`, which
    /// queues the route until the coordinator is ready.
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self

        if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            handleNotificationPayload(userInfo, source: "cold_launch")
        }
        return true
    }

    // MARK: - Background URL Session

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

    // MARK: - Notification Routing

    /// Resolve a notification payload to an `AppRoute` and mark the
    /// originating `notification_log` row opened. Falls back to the
    /// in-app notifications feed when the entity is unknown so the
    /// tap never silently no-ops.
    private func handleNotificationPayload(
        _ userInfo: [AnyHashable: Any],
        source: String
    ) {
        let (route, notificationLogId) = NotificationRouter.resolve(apnsUserInfo: userInfo)
        let resolved = route ?? .notifications

        #if DEBUG
        PatinaLog.nav.debug("[APNs] tap (\(source)) → \(resolved.displayName) (logId=\(notificationLogId ?? "nil"))")
        #endif

        Task { @MainActor in
            DeepLinkHandler.shared.navigate(to: resolved)
        }

        if let notificationLogId {
            Task {
                do {
                    try await NotificationsAPIClient.shared.markOpened(id: notificationLogId)
                } catch {
                    #if DEBUG
                    PatinaLog.nav.error("[APNs] markOpened failed for \(notificationLogId): \(error.localizedDescription)")
                    #endif
                }
            }
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension PatinaAppDelegate: UNUserNotificationCenterDelegate {

    /// Tap handler for both foreground and background notifications.
    /// Fires when the user taps the notification banner / lock-screen
    /// entry.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        handleNotificationPayload(userInfo, source: "tap")
        // C.1 / R29: a tapped push usually means new studio activity —
        // re-poll the Studio-rail badge counts + design-request status.
        Task { @MainActor in
            BadgeCountService.shared.refreshSoon()
            DesignRequestStatusService.shared.refreshSoon()
        }
        completionHandler()
    }

    /// Presentation policy for notifications that arrive while the app
    /// is in the foreground. Show the banner + play sound so the user
    /// can still tap it — without this, foreground notifications are
    /// silently swallowed and our tap handler never gets to run.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // C.1 / R29: a foreground push is the other half of the badge
        // polling floor — refresh the Studio-rail counts + design-request
        // status on receipt.
        Task { @MainActor in
            BadgeCountService.shared.refreshSoon()
            DesignRequestStatusService.shared.refreshSoon()
        }
        completionHandler([.banner, .list, .sound, .badge])
    }
}
