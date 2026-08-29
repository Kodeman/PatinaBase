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
//  Authorization: the reminder asks on its own terms. It does NOT present
//  SP-08's push primer — that screen promises "a decision, a proposal, or an
//  invoice" and its button registers for REMOTE notifications, neither of
//  which describes what a person tapping "Remind me the day before it's due"
//  is about to get. It asks for `[.alert]` only, registers nothing remote, and
//  leaves Q7's once-per-install gate alone so the money-moment primer still
//  gets its ask (steward §7).
//
//  The queue is the only record. Nothing here keeps a second copy of what is
//  scheduled: `refresh` reads the system's pending requests and reconciles the
//  one for this invoice against what the invoice says now — cancelling it when
//  the invoice stopped being payable, replacing it when the sentence or the
//  moment has moved underneath it.
//

import Foundation
import UserNotifications

/// The seam over `UNUserNotificationCenter`.
@MainActor
protocol LocalNotificationScheduling {
    func pending() async -> [UNNotificationRequest]
    func schedule(_ request: UNNotificationRequest) async -> Bool
    func cancel(identifiers: [String])
    func authorizationStatus() async -> UNAuthorizationStatus
    /// `[.alert]` only — no sound, no badge, and no remote registration.
    func requestAlertAuthorization() async -> Bool
}

/// The live centre. The only part of this file a test does not run.
@MainActor
struct SystemNotificationScheduler: LocalNotificationScheduling {

    private var center: UNUserNotificationCenter { .current() }

    func pending() async -> [UNNotificationRequest] {
        await center.pendingNotificationRequests()
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

    func requestAlertAuthorization() async -> Bool {
        do {
            return try await center.requestAuthorization(options: [.alert])
        } catch {
            PatinaLog.ui.error("[Reminder] authorization failed: \(error.localizedDescription)")
            return false
        }
    }
}

@MainActor
@Observable
final class InvoiceReminderService {

    /// Set once the reminder is on the system's queue; nil when it is not.
    private(set) var fireDate: Date?
    /// True while the reminder's own primer should be on screen.
    var isPresentingPrimer = false
    /// Said once, and only when notifications really are off — a person who
    /// has not been asked yet is undecided, not denied.
    private(set) var isDenied = false
    private(set) var isBusy = false

    private let scheduler: any LocalNotificationScheduling

    init(scheduler: (any LocalNotificationScheduling)? = nil) {
        self.scheduler = scheduler ?? SystemNotificationScheduler()
    }

    /// Read the system's own queue and reconcile it with what the invoice says
    /// now. Called whenever the screen sees a different invoice — including the
    /// moment it stops being payable.
    ///
    /// - Parameter offer: nil when the invoice can no longer honestly be
    ///   reminded about. A pending request is then **cancelled**: an invoice
    ///   paid, voided or settled elsewhere must not produce a Lock Screen line
    ///   quoting a balance that no longer exists.
    func refresh(invoiceId: String, offer: InvoiceReminder.Offer?) async {
        if isDenied, await scheduler.authorizationStatus() != .denied {
            isDenied = false
        }

        let identifier = InvoiceReminder.identifier(invoiceId: invoiceId)
        let existing = await scheduler.pending().first { $0.identifier == identifier }

        guard let offer else {
            if existing != nil { scheduler.cancel(identifiers: [identifier]) }
            fireDate = nil
            return
        }
        guard let existing else {
            fireDate = nil
            return
        }

        // What is queued is the truth about when it will fire and what it will
        // say; the offer is only what it WOULD say if set now. A partial
        // payment or a moved due date makes the queued one wrong, so it is
        // replaced rather than left quoting a figure that has changed.
        let scheduled = Self.scheduledDate(of: existing)
        let stale = existing.content.body != offer.body
            || scheduled.map { abs($0.timeIntervalSince(offer.fireDate)) >= 60 } ?? true
        if stale {
            await schedule(offer)
        } else {
            fireDate = scheduled
        }
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
            // Not decided. The primer says exactly what this will send, and
            // nothing else — then the system asks.
            isPresentingPrimer = true
        }
    }

    /// The primer's own button: ask for alerts, and on a grant schedule the
    /// reminder that was asked for. A refusal at the system alert IS a
    /// decision, so the one quiet line is earned by then.
    func allowFromPrimer(_ offer: InvoiceReminder.Offer) async {
        isPresentingPrimer = false
        if await scheduler.requestAlertAuthorization() {
            await schedule(offer)
        } else {
            isDenied = true
        }
    }

    /// "Not now", or the sheet swiped away. Nothing was decided, so nothing is
    /// claimed and the act stays where it was.
    func dismissPrimer() {
        isPresentingPrimer = false
    }

    /// The way out. Removes the one request and forgets it.
    func remove(invoiceId: String) {
        scheduler.cancel(identifiers: [InvoiceReminder.identifier(invoiceId: invoiceId)])
        fireDate = nil
    }

    /// Cancels the reminders of invoices that can no longer be reminded about —
    /// paid, voided, or past their day-before. Scoped to the invoices in hand,
    /// so an invoice this list has not loaded is never touched.
    ///
    /// The detail screen cancels the one it is looking at; this is the path for
    /// an invoice settled somewhere other than in this app, which the detail
    /// screen would only learn about if the person opened it again.
    static func cancelStaleReminders(
        among invoices: [RemoteInvoice],
        now: Date = Date(),
        scheduler: (any LocalNotificationScheduling)? = nil
    ) async {
        let scheduler = scheduler ?? SystemNotificationScheduler()
        let unreminded = invoices
            .filter { InvoiceReminder.offer(for: $0, now: now) == nil }
            .map { InvoiceReminder.identifier(invoiceId: $0.id) }
        guard !unreminded.isEmpty else { return }

        let pending = Set(await scheduler.pending().map(\.identifier))
        let stale = unreminded.filter(pending.contains)
        guard !stale.isEmpty else { return }
        scheduler.cancel(identifiers: stale)
    }

    private func schedule(_ offer: InvoiceReminder.Offer) async {
        isDenied = false
        let content = UNMutableNotificationContent()
        content.body = offer.body
        content.userInfo = InvoiceReminder.userInfo(invoiceId: offer.invoiceId)
        // No sound, no badge: the enumerated shape of this notification is one
        // line on a Lock Screen and nothing else, and `[.alert]` is all the
        // authorization it asked for.

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

    /// When the queued request will actually fire — the row's one factual
    /// claim, taken from the trigger rather than recomputed from a due date
    /// that may have moved since.
    private static func scheduledDate(of request: UNNotificationRequest) -> Date? {
        (request.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate()
    }
}
