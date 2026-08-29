//
//  InvoiceReminderServiceTests.swift
//  PatinaTests
//
//  The scheduler: one request per invoice, replaced rather than duplicated,
//  cancelled when the invoice can no longer honestly be reminded about, and an
//  authorization ask that is the reminder's own rather than SP-08's push
//  primer.
//
//  `UNUserNotificationCenter` is never touched: the live centre would surface a
//  real system dialog and hang the run, so `LocalNotificationScheduling` is
//  stubbed and every rule is exercised against the stub.
//

import Foundation
import Testing
import UserNotifications
@testable import Patina

@MainActor
struct InvoiceReminderServiceTests {

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
    // MARK: - Scheduling

    @Test("setting the reminder puts one request on the queue with the exact body")
    func settingSchedulesOneRequest() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)

        #expect(scheduler.requests.count == 1)
        let request = try #require(scheduler.requests.first)
        #expect(request.identifier == "patina.invoice.reminder.inv-1")
        #expect(request.content.body == "Your invoice is due tomorrow — $4,250.00. Nothing else.")
        #expect(request.content.title.isEmpty)
        #expect(request.content.badge == nil)
        #expect(subject.fireDate == offer.fireDate)
    }

    /// One per invoice — a second tap replaces, never duplicates.
    @Test("setting twice leaves exactly one reminder")
    func settingTwiceIsIdempotent() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)
        await subject.set(offer)

        #expect(scheduler.requests.count == 1)
    }

    @Test("two invoices keep two separate reminders")
    func twoInvoicesKeepTwoReminders() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let first = try #require(
            InvoiceReminder.offer(for: invoice(id: "inv-1", dueDate: day(offset: 4)), now: now)
        )
        let second = try #require(
            InvoiceReminder.offer(for: invoice(id: "inv-2", dueDate: day(offset: 5)), now: now)
        )

        await subject.set(first)
        await subject.set(second)

        #expect(scheduler.requests.count == 2)
        #expect(Set(scheduler.requests.map(\.identifier)) == [
            "patina.invoice.reminder.inv-1",
            "patina.invoice.reminder.inv-2"
        ])
    }

    @Test("the tap routes to the invoice through the router that already exists")
    func theTapRoutesToTheInvoice() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)

        let userInfo = try #require(scheduler.requests.first?.content.userInfo)
        let (route, _) = NotificationRouter.resolve(apnsUserInfo: userInfo)
        #expect(route == .invoiceDetail(invoiceId: "inv-1"))
    }

    @Test("removing it takes the request off the queue and clears the row")
    func removingCancels() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)
        subject.remove(invoiceId: offer.invoiceId)

        #expect(scheduler.requests.isEmpty)
        #expect(scheduler.cancelled == ["patina.invoice.reminder.inv-1"])
        #expect(subject.fireDate == nil)
    }

    /// The system's queue is the only record. A reminder cleared in Settings,
    /// or one that has already fired, must not leave the row claiming it is
    /// still set.
    @Test("the row reads the system's queue rather than a second copy")
    func refreshReadsTheSystemQueue() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.refresh(invoiceId: offer.invoiceId, offer: offer)
        #expect(subject.fireDate == nil)

        await subject.set(offer)
        await subject.refresh(invoiceId: offer.invoiceId, offer: offer)
        let read = try #require(subject.fireDate)
        #expect(abs(read.timeIntervalSince(offer.fireDate)) < 60)

        scheduler.cancel(identifiers: ["patina.invoice.reminder.inv-1"])
        await subject.refresh(invoiceId: offer.invoiceId, offer: offer)
        #expect(subject.fireDate == nil)
    }

    // MARK: - The reminder does not outlive the debt

    /// The defect this test exists for: `offer(for:)` returns nil the moment
    /// the invoice stops being payable, so the affordance disappears — and
    /// before this, nothing cancelled the request. The notification then fired
    /// at 09:00 saying "Your invoice is due tomorrow — $4,250.00" about an
    /// invoice already settled, with no way to remove it from inside the app.
    @Test("paying the invoice takes the reminder off the queue")
    func payingCancelsThePendingReminder() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let unpaid = try invoice(dueDate: day(offset: 4))
        let offer = try #require(InvoiceReminder.offer(for: unpaid, now: now))

        await subject.set(offer)
        #expect(scheduler.requests.count == 1)

        // The screen re-reads the invoice, which is now paid: no offer.
        let paid = try invoice(status: "paid", dueDate: day(offset: 4), paidCents: 425_000)
        #expect(InvoiceReminder.offer(for: paid, now: now) == nil)
        await subject.refresh(invoiceId: paid.id, offer: nil)

        #expect(scheduler.requests.isEmpty)
        #expect(scheduler.cancelled == ["patina.invoice.reminder.inv-1"])
        #expect(subject.fireDate == nil)
    }

    /// The same defect's second face: the sentence is built when the reminder
    /// is set, so a part payment afterwards leaves it quoting a balance that no
    /// longer exists. What is queued is reconciled against what the invoice
    /// says now.
    @Test("a part payment rewrites the queued sentence rather than leaving it wrong")
    func aPartPaymentReplacesTheQueuedSentence() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )
        await subject.set(offer)
        #expect(scheduler.requests.first?.content.body.contains("$4,250.00") == true)

        let partly = try invoice(
            status: "partially_paid", dueDate: day(offset: 4),
            totalCents: 425_000, paidCents: 125_000
        )
        let reduced = try #require(InvoiceReminder.offer(for: partly, now: now))
        await subject.refresh(invoiceId: partly.id, offer: reduced)

        #expect(scheduler.requests.count == 1, "still one per invoice")
        #expect(scheduler.requests.first?.content.body
                == "Your invoice is due tomorrow — $3,000.00. Nothing else.")
    }

    /// The list is where an invoice settled somewhere other than this app is
    /// first seen. Scoped to the invoices in hand: an invoice this page has not
    /// loaded is never touched.
    @Test("the invoice list clears reminders for invoices that are no longer payable")
    func theListSweepsReminderOfSettledInvoices() async throws {
        let scheduler = StubScheduler()
        let subject = service(scheduler)
        let first = try #require(
            InvoiceReminder.offer(for: invoice(id: "inv-1", dueDate: day(offset: 4)), now: now)
        )
        let second = try #require(
            InvoiceReminder.offer(for: invoice(id: "inv-2", dueDate: day(offset: 5)), now: now)
        )
        await subject.set(first)
        await subject.set(second)

        await InvoiceReminderService.cancelStaleReminders(
            among: [
                try invoice(id: "inv-1", status: "paid", dueDate: day(offset: 4),
                            paidCents: 425_000),
                try invoice(id: "inv-2", dueDate: day(offset: 5))
            ],
            now: now,
            scheduler: scheduler
        )

        #expect(scheduler.requests.map(\.identifier) == ["patina.invoice.reminder.inv-2"])
    }
}
