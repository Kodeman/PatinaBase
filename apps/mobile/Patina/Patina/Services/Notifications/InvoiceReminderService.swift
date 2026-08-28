//
//  InvoiceReminderService.swift
//  Patina
//
//  Schedules, replaces and cancels the one local reminder
//  (`InvoiceReminder`), keyed by invoice id.
//
//  `UNUserNotificationCenter` sits behind `LocalNotificationScheduling` for one
//  reason: touching the live centre in a test run surfaces a real system
//  dialog and hangs it. Every rule below is therefore exercised against a stub,
//  and the live wrapper is the only untested line.
//
//  Authorization (Q7, SP-08): the reminder does not own the permission and
//  does not invent its own ask. When authorization has not been decided it
//  presents `PushPrimerView` — SP-08's sentence, verbatim — and arms
//  `PushTokenService`'s once-per-install gate as it presents, so the install
//  is asked once and never again. Denied is stated once, in one line, and the
//  act never asks a second time.
//

import Foundation
import UserNotifications

/// The seam over `UNUserNotificationCenter`.
@MainActor
protocol LocalNotificationScheduling {
    func pendingIdentifiers() async -> Set<String>
    func schedule(_ request: UNNotificationRequest) async -> Bool
    func cancel(identifiers: [String])
    func authorizationStatus() async -> UNAuthorizationStatus
}

/// The live centre. The only part of this file a test does not run.
@MainActor
struct SystemNotificationScheduler: LocalNotificationScheduling {

    private var center: UNUserNotificationCenter { .current() }

    func pendingIdentifiers() async -> Set<String> {
        Set(await center.pendingNotificationRequests().map(\.identifier))
    }

    func schedule(_ request: UNNotificationRequest) async -> Bool {
        do {
            try await center.add(request)
            return true
        } catch {
            PatinaLog.ui.error("[Reminder] schedule failed: \(error.localizedDescription)")
            return false
        }
    }

    func cancel(identifiers: [String]) {
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }
}

@MainActor
@Observable
final class InvoiceReminderService {

    /// Set once the reminder is on the system's queue; nil when it is not.
    private(set) var fireDate: Date?
    /// True while the primer sheet should be on screen. Set at most once per
    /// install — the gate is `PushTokenService`'s, not a second one.
    var isPresentingPrimer = false
    /// Said once, then left alone.
    private(set) var isDenied = false
    private(set) var isBusy = false

    private let scheduler: any LocalNotificationScheduling
    /// Injected so the once-per-install gate can be exercised without the
    /// singleton's UserDefaults. Defaults are resolved in the body, not as
    /// default argument expressions — those are evaluated nonisolated, and
    /// every one of these touches a `@MainActor` singleton.
    private let armPrompt: @MainActor () -> Bool
    private let hasAsked: @MainActor () -> Bool

    init(
        scheduler: (any LocalNotificationScheduling)? = nil,
        armPrompt: (@MainActor () -> Bool)? = nil,
        hasAsked: (@MainActor () -> Bool)? = nil
    ) {
        self.scheduler = scheduler ?? SystemNotificationScheduler()
        self.armPrompt = armPrompt ?? { PushTokenService.shared.armAuthorizationPromptGate() }
        self.hasAsked = hasAsked ?? { PushTokenService.shared.hasAskedForAuthorization }
    }

    /// Read the system's own queue, so the row tells the truth after a
    /// relaunch, after a reminder has fired, and after the person cleared it
    /// in Settings — the app keeps no second copy of that fact.
    func refresh(offer: InvoiceReminder.Offer?) async {
        guard let offer else {
            fireDate = nil
            return
        }
        let pending = await scheduler.pendingIdentifiers()
        let identifier = InvoiceReminder.identifier(invoiceId: offer.invoiceId)
        fireDate = pending.contains(identifier) ? offer.fireDate : nil
    }

    /// The act. Idempotent by identifier: a second tap replaces the request
    /// rather than adding one.
    func set(_ offer: InvoiceReminder.Offer) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        switch await scheduler.authorizationStatus() {
        case .authorized, .provisional, .ephemeral:
            await schedule(offer)
        case .denied:
            isDenied = true
        default:
            // Not decided. One ask per install, explained first.
            if hasAsked() {
                isDenied = true
            } else if armPrompt() {
                isPresentingPrimer = true
            } else {
                isDenied = true
            }
        }
    }

    /// `PushPrimerView` has closed. Whatever the person chose, this is the end
    /// of the asking: on a grant the reminder they asked for is scheduled, on
    /// a refusal one line says so and nothing asks again.
    func primerDecided(_ offer: InvoiceReminder.Offer) async {
        isPresentingPrimer = false
        switch await scheduler.authorizationStatus() {
        case .authorized, .provisional, .ephemeral:
            await schedule(offer)
        default:
            isDenied = true
        }
    }

    /// The way out. Removes the one request and forgets it.
    func remove(invoiceId: String) {
        scheduler.cancel(identifiers: [InvoiceReminder.identifier(invoiceId: invoiceId)])
        fireDate = nil
    }

    private func schedule(_ offer: InvoiceReminder.Offer) async {
        isDenied = false
        let content = UNMutableNotificationContent()
        content.body = offer.body
        content.userInfo = InvoiceReminder.userInfo(invoiceId: offer.invoiceId)
        content.sound = .default

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute], from: offer.fireDate
        )
        let request = UNNotificationRequest(
            identifier: InvoiceReminder.identifier(invoiceId: offer.invoiceId),
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        )
        // `add` replaces a request with the same identifier, which is the whole
        // of "one per invoice".
        fireDate = await scheduler.schedule(request) ? offer.fireDate : nil
    }
}
