//
//  AppDelegate.swift
//  Patina
//
//  UIKit application delegate. Bridges three iOS-only callbacks into the
//  SwiftUI app:
//   1. `application(_:handleEventsForBackgroundURLSession:completionHandler:)`
//      → `BackgroundScanUploader` so paused scan uploads can finish.
//   2. `UNUserNotificationCenterDelegate` hooks for APNs deep-link
//      routing — taps on push notifications resolve to an `AppRoute`
//      via `NotificationRouter` and are pushed through
//      `DeepLinkHandler.shared.navigate(to:)`. The originating
//      `notification_log.id` is marked opened via
//      `NotificationsAPIClient.markOpened`.
//   3. `P-22`: the three lock-screen categories are registered here, at
//      launch, so a banner draws Patina's own two acts (Open, Ask a
//      question) and never an Approve or a Sign. A tapped act routes
//      through the same `DeepLinkHandler.navigate` seam as a plain tap,
//      which holds the route until the app can show it (P-08).
//   4. APNs registration callbacks → `PushTokenService`, which uploads
//      the hex-encoded device token to `device_push_tokens`. Registration
//      itself (`requestAuthorization` / `registerForRemoteNotifications`)
//      is triggered elsewhere (post-first-submission, foreground
//      re-register) — this delegate only handles the system's response.
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
        // `P-22`: before any banner can arrive. The OS keeps the set for the
        // life of the install; a letter that lands before this has run draws
        // without its acts rather than with the wrong ones.
        NotificationCategories.register()

        if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            handleNotificationPayload(userInfo, source: "cold_launch")
        }
        return true
    }

    // MARK: - APNs Registration

    /// APNs granted a device token — hex-encode + upload it via
    /// `PushTokenService`. This fires only after an explicit
    /// `registerForRemoteNotifications()` call (post-first-submission or a
    /// foreground re-register for an already-authorized user); it is never
    /// triggered at cold launch on its own.
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            await PushTokenService.shared.uploadToken(deviceToken)
        }
    }

    /// Registration failed (simulator without push capability, no network,
    /// user denied, etc). Log quietly — this is routine on Simulator and
    /// must never surface as a user-facing error.
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        #if DEBUG
        PatinaLog.ui.debug("[Push] registerForRemoteNotifications failed: \(error.localizedDescription)")
        #endif
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
        source: String,
        actionIdentifier: String = UNNotificationDefaultActionIdentifier
    ) {
        // A dismissal cleared the letter; it did not read it. Nothing opens,
        // and nothing is marked opened — telling the studio she has seen a
        // document she swiped away would be the invention C5 forbids.
        guard NotificationCategories.isOpening(actionIdentifier: actionIdentifier) else { return }

        let (_, notificationLogId) = NotificationRouter.resolve(apnsUserInfo: userInfo)
        // `P-22`: the act decides the destination — "Ask a question" opens the
        // conversation, everything else opens the thing itself. The fall-back
        // is unchanged: a tap never silently no-ops.
        let resolved = NotificationCategories.route(
            forActionIdentifier: actionIdentifier, apnsUserInfo: userInfo
        ) ?? .notifications

        #if DEBUG
        PatinaLog.nav.debug("[APNs] tap (\(source)) → \(resolved.displayName) (logId=\(notificationLogId ?? "nil"))")
        #endif

        Task { @MainActor in
            // `DecisionPushHandler` recognises the three type-aware decision
            // pushes (`decision_required` / `_overdue` / `_resolved`) and was a
            // stub with no caller; this is the wiring its own header asks for.
            // It navigates through the same `DeepLinkHandler` seam and marks
            // the row opened itself, so a payload it claims is finished here —
            // otherwise the row would be PATCHed twice for one tap. Every
            // other letter, 00534's `*_attention` rows included, falls through
            // to the generic route above. "Ask a question" never takes this
            // door: its destination is the conversation, not the decision.
            if actionIdentifier != PatinaNotificationAction.askQuestion.rawValue,
               DecisionPushHandler.handle(apnsUserInfo: userInfo) {
                return
            }
            DeepLinkHandler.shared.navigate(to: resolved)
            Self.markOpened(notificationLogId)
        }
    }

    /// One PATCH, from whichever door the tap came through.
    private static func markOpened(_ notificationLogId: String?) {
        guard let notificationLogId else { return }
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
        handleNotificationPayload(
            userInfo, source: "tap", actionIdentifier: response.actionIdentifier
        )
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
