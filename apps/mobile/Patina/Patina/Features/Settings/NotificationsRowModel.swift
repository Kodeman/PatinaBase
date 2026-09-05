//
//  NotificationsRowModel.swift
//  Patina
//
//  P-07 · what the Settings notifications row is allowed to say.
//
//  The row used to bind the app's own preference alone, so a homeowner who
//  had never been asked could flip it on, watch it stay on, and never receive
//  anything: the setter wrote `user_settings.push_notifications` and
//  `notification_preferences.channels_push` and never touched iOS
//  authorization. `W1-C-08` fixed half of it — a denied authorization turns
//  the row into a Settings door — and this is the other half.
//
//  Three states, from `UNUserNotificationCenter` and nothing else:
//   • undecided  — the system alert has never been shown. Turning the toggle
//                  ON is the person opening the door themselves, so it may
//                  ask, once, spending the same install-wide gate the primer
//                  spends.
//   • authorized — the toggle carries the preference, as before.
//   • denied     — the row is a link to iOS Settings; no switch is drawn,
//                  because a switch reading ON over a refusal is a lie.
//
//  There is no other automatic ask anywhere: `reregisterIfAuthorized()` is a
//  no-op prompt for a person who already granted, and this path only asks
//  from a tap.
//

import Foundation
import UserNotifications

/// What the row draws, once iOS has answered.
enum NotificationsRowState: Equatable {
    case undecided
    case authorized
    case denied
}

@MainActor
@Observable
final class NotificationsRowModel {

    typealias StatusProvider = @Sendable () async -> UNAuthorizationStatus
    typealias AuthorizationRequest = @MainActor () async -> PushTokenService.AuthorizationOutcome

    /// `nil` until the read lands, so the row never asserts either answer
    /// before it has one.
    private(set) var state: NotificationsRowState?

    private let readStatus: StatusProvider
    private let requestAuthorization: AuthorizationRequest
    private let armPromptGate: @MainActor () -> Bool

    init(
        readStatus: @escaping StatusProvider = {
            await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        },
        requestAuthorization: @escaping AuthorizationRequest = {
            await PushTokenService.shared.requestAuthorizationAndRegister()
        },
        armPromptGate: @escaping @MainActor () -> Bool = {
            PushTokenService.shared.armAuthorizationPromptGate()
        }
    ) {
        self.readStatus = readStatus
        self.requestAuthorization = requestAuthorization
        self.armPromptGate = armPromptGate
    }

    /// Read the status. Called on appear, and again after an ask.
    func refresh() async {
        state = Self.state(for: await readStatus())
    }

    /// Pure, so the mapping is testable without touching
    /// `UNUserNotificationCenter` — which in a test run would surface a real
    /// system dialog and hang.
    static func state(for status: UNAuthorizationStatus) -> NotificationsRowState {
        switch PushTokenService.outcome(for: status) {
        case .alreadyAuthorized: return .authorized
        case .denied: return .denied
        case .ask, .granted, .failed: return .undecided
        }
    }

    /// The toggle moved.
    ///
    /// Turning it ON asks iOS first and writes the preference only if
    /// something was granted — otherwise the switch would settle ON over a
    /// refusal, which is the defect. Only a status already read as
    /// `.authorized` skips the ask: `nil` is "not read yet", and treating an
    /// unread status as granted is how the preference got written without
    /// anyone being asked. Turning it OFF is always the preference write.
    func setEnabled(_ enabled: Bool, settings: SettingsService) async {
        guard enabled, state != .authorized else {
            settings.setNotificationsEnabled(enabled)
            return
        }

        // The one-shot is install-wide, not primer-wide: an ask spent here is
        // the ask, and `PushPrimerTrigger.shouldPresent` will not offer a
        // second one.
        _ = armPromptGate()

        switch await requestAuthorization() {
        case .granted, .alreadyAuthorized:
            state = .authorized
            settings.setNotificationsEnabled(true)
        case .denied:
            state = .denied
        case .ask, .failed:
            // Nothing was decided — the system failed to ask. The row stays as
            // it is and the person can tap again.
            break
        }
    }
}
