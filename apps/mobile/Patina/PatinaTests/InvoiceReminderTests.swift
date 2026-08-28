//
//  InvoiceReminderTests.swift
//  PatinaTests
//
//  The app's only local notification (B §4). The rules that decide whether it
//  is offered, when it fires, what it says, and that there is never more than
//  one per invoice.
//
//  `UNUserNotificationCenter` is never touched: the live centre would surface
//  a real system dialog and hang the run, so `LocalNotificationScheduling` is
//  stubbed and every rule is exercised against the stub.
//

import Foundation
import Testing
import UserNotifications
@testable import Patina

@MainActor
struct InvoiceReminderTests {

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

        func pendingIdentifiers() async -> Set<String> {
            Set(requests.map(\.identifier))
        }

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
    }

    private func service(
        _ scheduler: StubScheduler,
        hasAsked: Bool = false,
        arms: Bool = true
    ) -> InvoiceReminderService {
        InvoiceReminderService(
            scheduler: scheduler,
            armPrompt: { arms },
            hasAsked: { hasAsked }
        )
    }

    // MARK: - When it is offered at all

    @Test("a payable invoice with a due date still ahead is offered the reminder")
    func aFutureDueDateIsOffered() throws {
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )
        #expect(offer.invoiceId == "inv-1")
    }

    @Test("a paid invoice is never offered a reminder")
    func aPaidInvoiceIsNotOffered() throws {
        let paid = try invoice(status: "paid", dueDate: day(offset: 4), paidCents: 425_000)
        #expect(InvoiceReminder.offer(for: paid, now: now) == nil)
    }

    @Test("a voided invoice is never offered a reminder")
    func aVoidInvoiceIsNotOffered() throws {
        #expect(InvoiceReminder.offer(for: try invoice(status: "void", dueDate: day(offset: 4)),
                                      now: now) == nil)
    }

    @Test("an invoice with no due date is never offered a reminder")
    func noDueDateIsNotOffered() throws {
        #expect(InvoiceReminder.offer(for: try invoice(dueDate: nil), now: now) == nil)
    }

    @Test("a due date already past is never offered a reminder")
    func aPastDueDateIsNotOffered() throws {
        #expect(InvoiceReminder.offer(for: try invoice(dueDate: day(offset: -2)), now: now) == nil)
        #expect(InvoiceReminder.offer(for: try invoice(dueDate: day(offset: 0)), now: now) == nil)
    }

    /// The honest edge: due tomorrow, read after the reminder hour has passed.
    /// There is no day-before left, so the act is withheld rather than offered
    /// and then silently swallowed by the system.
    @Test("due tomorrow, past the reminder hour, is withheld rather than faked")
    func aMomentAlreadyGoneIsWithheld() throws {
        let afternoon = Calendar.current.date(byAdding: .hour, value: 8, to: now) ?? now
        #expect(
            InvoiceReminder.offer(for: try invoice(dueDate: day(offset: 1)), now: afternoon) == nil
        )
    }

    @Test("the reminder fires at nine the morning before")
    func theMomentIsNineTheMorningBefore() throws {
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )
        let parts = Calendar.current.dateComponents([.hour, .minute], from: offer.fireDate)
        #expect(parts.hour == 9)
        #expect(parts.minute == 0)

        let due = try #require(ISO8601DateParsing.dateOrDay(from: day(offset: 4)))
        let daysBetween = Calendar.current.dateComponents(
            [.day],
            from: Calendar.current.startOfDay(for: offer.fireDate),
            to: Calendar.current.startOfDay(for: due)
        ).day
        #expect(daysBetween == 1)
    }

    // MARK: - Copy

    @Test("the sentence is exactly what it will say — no urgency, no count")
    func theSentenceIsExact() {
        let body = InvoiceReminder.body(balanceCents: 425_000, currencyCode: "USD")
        #expect(body == "Your invoice is due tomorrow — $4,250.00. Nothing else.")

        for word in ["Don't", "urgent", "Urgent", "!", "now", "overdue", "Act"] {
            #expect(!body.contains(word), "the reminder must carry no urgency: \(word)")
        }
    }

    @Test("the promise printed under the act quotes the sentence verbatim")
    func thePromiseQuotesTheSentence() {
        let body = InvoiceReminder.body(balanceCents: 425_000, currencyCode: "USD")
        #expect(InvoiceReminder.promise(balanceCents: 425_000, currencyCode: "USD").contains(body))
    }

    @Test("the copy carries the balance, not the total")
    func theCopyCarriesTheBalance() throws {
        let partly = try invoice(
            status: "partially_paid", dueDate: day(offset: 4),
            totalCents: 425_000, paidCents: 125_000
        )
        let offer = try #require(InvoiceReminder.offer(for: partly, now: now))
        #expect(offer.body == "Your invoice is due tomorrow — $3,000.00. Nothing else.")
    }

    @Test("the row says the date it is set for, and offers a way out")
    func theSetRowSaysTheDate() {
        let date = Date(timeIntervalSince1970: 1_787_000_000)
        #expect(InvoiceReminder.setLine(fireDate: date)
                == "Reminder set for \(DateDisplay.short(date)).")
        #expect(InvoiceReminder.removeLabel == "Remove")
        #expect(InvoiceReminder.actLabel == "Remind me the day before it's due")
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

        await subject.refresh(offer: offer)
        #expect(subject.fireDate == nil)

        await subject.set(offer)
        await subject.refresh(offer: offer)
        #expect(subject.fireDate == offer.fireDate)

        scheduler.cancel(identifiers: ["patina.invoice.reminder.inv-1"])
        await subject.refresh(offer: offer)
        #expect(subject.fireDate == nil)
    }

    // MARK: - Authorization

    @Test("an undecided install is shown the primer once, not the system alert")
    func anUndecidedInstallSeesThePrimer() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)

        #expect(subject.isPresentingPrimer)
        #expect(scheduler.requests.isEmpty)
        #expect(!subject.isDenied)
    }

    @Test("granting through the primer schedules the reminder that was asked for")
    func grantingThroughThePrimerSchedules() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)
        scheduler.status = .authorized
        await subject.primerDecided(offer)

        #expect(!subject.isPresentingPrimer)
        #expect(scheduler.requests.count == 1)
        #expect(subject.fireDate == offer.fireDate)
    }

    @Test("refusing through the primer says so once and schedules nothing")
    func refusingThroughThePrimerSaysSoOnce() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        let subject = service(scheduler)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)
        scheduler.status = .denied
        await subject.primerDecided(offer)

        #expect(subject.isDenied)
        #expect(scheduler.requests.isEmpty)
    }

    /// Q7: the install is asked once. An install already asked never sees the
    /// primer again — it gets one line and no nag.
    @Test("an install already asked is never asked again")
    func anInstallAlreadyAskedIsNotAskedAgain() async throws {
        let scheduler = StubScheduler()
        scheduler.status = .notDetermined
        let subject = service(scheduler, hasAsked: true)
        let offer = try #require(
            InvoiceReminder.offer(for: invoice(dueDate: day(offset: 4)), now: now)
        )

        await subject.set(offer)

        #expect(!subject.isPresentingPrimer)
        #expect(subject.isDenied)
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
        #expect(scheduler.requests.isEmpty)
        #expect(InvoiceReminder.deniedLine
                == "Notifications are off for Patina. You can turn them on in Settings.")
    }
}
