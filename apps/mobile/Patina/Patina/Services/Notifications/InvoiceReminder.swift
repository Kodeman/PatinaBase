//
//  InvoiceReminder.swift
//  Patina
//
//  The one local notification this app should schedule.
//
//  B §4, verbatim: "One local notification, opt-in, from the invoice screen:
//  'Remind me the day before.' The app can schedule none today (F127); this is
//  the only one it should." 2x-panel-u1 §6 lists it as the single honest use
//  of the surface: "a due-date reminder the user opts into on the invoice
//  itself".
//
//  Everything that decides WHETHER and WHEN lives here, pure, so the rules are
//  testable without `UNUserNotificationCenter` — which would surface a real
//  system dialog in a test run.
//
//  Honesty (C5):
//   • It is offered only where a real due date exists and the moment is still
//     ahead. A reminder that would fire in the past is not offered, rather than
//     scheduled and silently swallowed.
//   • It says exactly what it will say, before it is set — the sentence below
//     is printed under the act, in quotes, and is the same string the
//     notification carries.
//   • One per invoice. No repeat, no escalation, no badge, no urgency word.
//

import Foundation

enum InvoiceReminder {

    /// The act, as the screen prints it.
    static let actLabel = "Remind me the day before it's due"

    /// The morning of the day before. Day precision everywhere else on the
    /// money rail; a due date is a Postgres `date` and carries no time of its
    /// own, so the app picks one hour and states it rather than guessing at
    /// midnight.
    static let hourOfDay = 9

    /// One request per invoice. A second tap replaces this identifier; it
    /// never adds a second reminder.
    static func identifier(invoiceId: String) -> String {
        "patina.invoice.reminder.\(invoiceId)"
    }

    static func invoiceId(fromIdentifier identifier: String) -> String? {
        let prefix = "patina.invoice.reminder."
        guard identifier.hasPrefix(prefix) else { return nil }
        return String(identifier.dropFirst(prefix.count))
    }

    /// The exact sentence the notification carries. No title of our own — the
    /// system draws `PATINA` above it, which is the Lock Screen shape M6a
    /// draws. No urgency word, and the closing promise is the app's, not a
    /// prod: this is the only one it will send.
    static func body(balanceCents: Int, currencyCode: String) -> String {
        let amount = PatinaCurrency.format(cents: balanceCents, currencyCode: currencyCode)
        return "Your invoice is due tomorrow — \(amount). Nothing else."
    }

    /// What the row says once it is set, and the control beside it.
    static func setLine(fireDate: Date) -> String {
        "Reminder set for \(DateDisplay.short(fireDate))."
    }

    static let removeLabel = "Remove"

    /// The promise printed under the act, so nobody opts into a sentence they
    /// have not read.
    static func promise(balanceCents: Int, currencyCode: String) -> String {
        "We'll send one notification: \u{201C}\(body(balanceCents: balanceCents, currencyCode: currencyCode))\u{201D}"
    }

    /// Said once when authorization is off, and never repeated.
    static let deniedLine = "Notifications are off for Patina. You can turn them on in Settings."

    // MARK: - The ask
    //
    // Its own screen, not SP-08's push primer. That primer promises "a
    // decision, a proposal, or an invoice" and its button registers for remote
    // notifications — neither describes what this is about to do, and using it
    // here would also burn Q7's one ask before the money moment it was ruled
    // for (steward §7). So: the sentence this will send, what it will not do,
    // and the two ways out.

    static let primerTitle = "The day before it's due"

    /// Everything this reminder is, past the sentence itself. No badge, no
    /// repeat, and it is not the notifications Patina sends about your project.
    static let primerDetail = """
    That is the whole of it — no badge, no repeat, nothing else. Remove it from this invoice \
    whenever you like.
    """

    static let primerAllowLabel = "Turn on the reminder"
    static let primerDismissLabel = "Not now"

    // MARK: - When

    /// 09:00 on the day before the due date, or nil when that moment has
    /// already passed.
    static func fireDate(dueDate: Date, now: Date, calendar: Calendar = .current) -> Date? {
        let dueDay = calendar.startOfDay(for: dueDate)
        guard let dayBefore = calendar.date(byAdding: .day, value: -1, to: dueDay),
              let moment = calendar.date(
                  bySettingHour: hourOfDay, minute: 0, second: 0, of: dayBefore
              ) else { return nil }
        return moment > now ? moment : nil
    }

    /// Everything the screen needs to offer the act, or nil when it must not
    /// be offered at all.
    struct Offer: Equatable {
        let invoiceId: String
        let fireDate: Date
        let body: String
        let promise: String
    }

    /// Offered only for a payable invoice whose due date is still ahead AND
    /// whose reminder moment is still ahead. Both, because "due tomorrow" read
    /// at four in the afternoon has no honest day-before left.
    static func offer(for invoice: RemoteInvoice, now: Date = Date(),
                      calendar: Calendar = .current) -> Offer? {
        guard invoice.isPayable else { return nil }
        guard let raw = invoice.due_date,
              let due = ISO8601DateParsing.dateOrDay(from: raw) else { return nil }
        guard calendar.startOfDay(for: due) > calendar.startOfDay(for: now) else { return nil }
        guard let fire = fireDate(dueDate: due, now: now, calendar: calendar) else { return nil }
        return Offer(
            invoiceId: invoice.id,
            fireDate: fire,
            body: body(balanceCents: invoice.balanceCents, currencyCode: invoice.currencyCode),
            promise: promise(
                balanceCents: invoice.balanceCents, currencyCode: invoice.currencyCode
            )
        )
    }

    /// The payload a tap carries. `PatinaAppDelegate` already resolves it
    /// through `NotificationRouter.route(forEntityType:entityId:)` to
    /// `.invoiceDetail` — the reminder needs no new routing.
    static func userInfo(invoiceId: String) -> [String: String] {
        ["entity_type": "invoice", "entity_id": invoiceId]
    }
}
