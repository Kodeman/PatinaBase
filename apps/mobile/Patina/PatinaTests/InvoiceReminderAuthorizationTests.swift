//
//  InvoiceReminderAuthorizationTests.swift
//  PatinaTests
//
//  The reminder's own permission ask, and the enumerated shape of the one
//  notification it schedules.
//
//  Steward §7: the reminder must not be routed through SP-08's push primer —
//  that screen's promise is about what a designer sends, its button registers
//  for remote notifications, and it spends Q7's once-per-install ask.
//

import Foundation
import Testing
import UserNotifications
@testable import Patina

@MainActor
struct InvoiceReminderAuthorizationTests {

    // MARK: - Fixtures

    /// Decoded rather than built: `RemoteInvoice` has 24 stored properties and
    /// a wire shape that must keep matching PostgREST.
    private func invoice(
        id: String = "inv-1",
        status: String = "sent",
        dueDate: String?,
        totalCents: Int = 425_000,
        paidCents: Int = 0
    ) throws -> RemoteInvoice {
        var payload: [String: Any] = [
            "id": id,
            "invoice_number": "INV-2026-0142",
            "status": status,
            "total_cents": totalCents,
            "amount_paid_cents": paidCents,
            "currency": "USD"
        ]
        if let dueDate { payload["due_date"] = dueDate }
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(RemoteInvoice.self, from: data)
    }

    /// 2026-08-28, 08:00 local — before the 09:00 reminder hour, so a due date
    /// two days out still has a day-before ahead of it.
    private var now: Date {
        var components = DateComponents()
        components.year = 2026
        components.month = 8
        components.day = 28
        components.hour = 8
        return Calendar.current.date(from: components) ?? Date(timeIntervalSince1970: 1_787_000_000)
    }

    private func day(offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset, to: now) ?? now
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private final class StubScheduler: LocalNotificationScheduling {
        var status: UNAuthorizationStatus = .authorized
        var accepts = true
        private(set) var requests: [UNNotificationRequest] = []
        private(set) var cancelled: [String] = []

        var grantsAuthorization = true
        private(set) var authorizationRequests = 0

        func pending() async -> [UNNotificationRequest] { requests }

        func schedule(_ request: UNNotificationRequest) async -> Bool {
            guard accepts else { return false }
            // The system replaces a pending request carrying the same
            // identifier; the stub does the same or it would not be a stub.
            requests.removeAll { $0.identifier == request.identifier }
            requests.append(request)
            return true
        }

        func cancel(identifiers: [String]) {
            cancelled.append(contentsOf: identifiers)
            requests.removeAll { identifiers.contains($0.identifier) }
        }

        func authorizationStatus() async -> UNAuthorizationStatus { status }

        /// `[.alert]` only, and no remote registration: the stub records that
        /// the ask happened and answers it.
        func requestAlertAuthorization() async -> Bool {
            authorizationRequests += 1
            status = grantsAuthorization ? .authorized : .denied
            return grantsAuthorization
        }
    }

    private func service(_ scheduler: StubScheduler) -> InvoiceReminderService {
        InvoiceReminderService(scheduler: scheduler)
    }
    // MARK: - Authorization

    /// F4: it must NOT be SP-08's push primer. That screen promises "a
    /// decision, a proposal, or an invoice", its button registers for REMOTE
    /// notifications, and it spends Q7's once-per-install ask — none of which
    /// describes what a person tapping "Remind me the day before it's due" is
    /// about to get.
    @Test("an undecided install is shown the reminder's own primer, not the system alert")
    func anUndecidedInstallSeesTheRemindersOwnPrimer() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)

        #expect(subject.isPresentingPrimer)
        #expect(scheduler.requests.isEmpty)
        #expect(scheduler.authorizationRequests == 0, "nothing is asked before the copy is read")
        #expect(!subject.isDenied, "undecided is not off")
    }

    /// The primer's copy is the sentence it will send, and nothing else.
    @Test("the primer says exactly what the notification will say")
    func thePrimerQuotesTheNotification() throws {
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )
        #expect(offer.promise.contains(offer.body))
        #expect(InvoiceReminder.primerTitle == "The day before it's due")
        #expect(InvoiceReminder.primerAllowLabel == "Turn on the reminder")
        // It does not repeat SP-08's promise about what a designer sends.
        #expect(!offer.promise.contains("your designer"))
        #expect(!InvoiceReminder.primerDetail.contains("your designer"))
        #expect(InvoiceReminder.primerDetail.contains("no badge"))
    }

    @Test("granting through the primer asks for alerts only and schedules the reminder")
    func grantingThroughThePrimerSchedules() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)
        await subject.allowFromPrimer(offer)

        #expect(!subject.isPresentingPrimer)
        #expect(scheduler.authorizationRequests == 1)
        #expect(scheduler.requests.count == 1)
        #expect(subject.fireDate == offer.fireDate)
    }

    @Test("refusing the system alert says so once and schedules nothing")
    func refusingTheSystemAlertSaysSoOnce() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        scheduler.grantsAuthorization = false
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)
        await subject.allowFromPrimer(offer)

        #expect(subject.isDenied)
        #expect(scheduler.requests.isEmpty)
    }

    /// "Not now" decides nothing, so it claims nothing: the act stays where it
    /// was and no line says notifications are off.
    @Test("dismissing the primer leaves the act where it was")
    func dismissingThePrimerClaimsNothing() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)
        subject.dismissPrimer()

        #expect(!subject.isPresentingPrimer)
        #expect(!subject.isDenied)
        #expect(scheduler.authorizationRequests == 0)
        #expect(scheduler.requests.isEmpty)
    }

    @Test("a denied install schedules nothing and never prompts")
    func aDeniedInstallNeverPrompts() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .denied
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)

        #expect(subject.isDenied)
        #expect(!subject.isPresentingPrimer)
        #expect(scheduler.authorizationRequests == 0)
        #expect(scheduler.requests.isEmpty)
        #expect(InvoiceReminder.deniedLine
                == "Notifications are off for Patina. You can turn them on in Settings.")
    }

    /// Granted in Settings, then back to the invoice: the line has to go. The
    /// app keeps no second copy of the permission either.
    @Test("a permission granted in Settings clears the line on the next look")
    func grantingInSettingsClearsTheLine() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .denied
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )
        await subject.set(offer)
        #expect(subject.isDenied)

        scheduler.status = .authorized
        await subject.refresh(invoiceId: offer.invoiceId, offer: offer)

        #expect(!subject.isDenied)
    }

    // MARK: - The shape of the notification

    /// The enumerated shape (`x2-tasks.md` §2, steward §7): one line, no title
    /// of our own, no badge, no repeat, no sound. `[.alert]` is all the
    /// authorization it asked for, so a sound would be asking for one thing and
    /// setting another.
    @Test("the notification carries no badge, no sound and no repeat")
    func theNotificationIsOneLineAndNothingElse() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)

        let request = try #require(scheduler.requests.first)
        #expect(request.content.badge == nil)
        #expect(request.content.sound == nil)
        #expect(request.content.title.isEmpty)
        let trigger = try #require(request.trigger as? UNCalendarNotificationTrigger)
        #expect(!trigger.repeats)
    }
}
