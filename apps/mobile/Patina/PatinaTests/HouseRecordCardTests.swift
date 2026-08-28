//
//  HouseRecordCardTests.swift
//  PatinaTests
//
//  What the Record's rows actually print, and what they refuse to print.
//  Every rule here is an honesty rule (C5) or a copy rule from `b-M1.sheet`.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct HouseRecordCardTests {

    private static let calendar = Calendar(identifier: .gregorian)

    /// 2026-08-26, the mock's day.
    private static func day(_ month: Int, _ day: Int, year: Int = 2026) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 9
        return calendar.date(from: components)!
    }

    private static func row(
        kind: HouseRecordRow.Kind,
        date: Date,
        state: HouseRecordRow.State,
        isNew: Bool = false,
        standing: Bool = false,
        title: String = "Something happened.",
        detail: String? = nil
    ) -> HouseRecordRow {
        HouseRecordRow(
            id: "row", kind: kind, title: title, detail: detail, date: date,
            state: state, isNew: isNew, isStandingCondition: standing, route: nil
        )
    }

    // MARK: - The right-hand side

    @Test("an overdue decision prints the date it was asked and one red word")
    func overdueDecision() {
        let shown = HouseRecordRowPresentation.make(
            row: Self.row(kind: .decisionAsked, date: Self.day(8, 22), state: .overdue),
            now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(shown.leadText == "asked Aug 22")
        #expect(shown.lateText == "overdue")
        #expect(shown.showsNewTick == false)
    }

    @Test("a proposal prints the date it is wanted by, and nothing red")
    func proposalByDate() {
        let shown = HouseRecordRowPresentation.make(
            row: Self.row(
                kind: .proposalSent, date: Self.day(8, 22), state: .due(Self.day(9, 8))
            ),
            now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(shown.leadText == "by Sep 8")
        #expect(shown.lateText == nil)
    }

    @Test("an invoice prints its figure and its due date, red only once it is late")
    func invoiceMoney() {
        let invoice = Self.row(
            kind: .invoiceDue, date: Self.day(8, 20),
            state: .amount(cents: 425_000, due: Self.day(9, 1))
        )
        let onTime = HouseRecordRowPresentation.make(
            row: invoice, now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(onTime.leadText == "$4,250.00 · due Sep 1")
        #expect(onTime.lateText == nil)

        let late = HouseRecordRowPresentation.make(
            row: invoice, now: Self.day(9, 2), calendar: Self.calendar
        )
        #expect(late.leadText == nil)
        #expect(late.lateText == "$4,250.00 · due Sep 1")
    }

    @Test("a MOVED row carries its date, and the tick only when it is new")
    func movedRowTick() {
        let moved = Self.row(kind: .orderMoved, date: Self.day(8, 25), state: .none, isNew: true)
        let shown = HouseRecordRowPresentation.make(
            row: moved, now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(shown.leadText == "Aug 25")
        #expect(shown.showsNewTick)
    }

    // MARK: - Honesty

    @Test("a standing condition draws without a date and without a tick")
    func standingConditionDrawsNoDate() {
        // r1-notes §9.1: `isNew` is already forced false on these, so a tick
        // could only ever come from this layer. It does not.
        let standing = Self.row(
            kind: .savedPieceRepriced, date: Self.day(8, 24), state: .none,
            isNew: true, standing: true,
            title: "The Brass Arc Floor Lamp you saved is $100 less than when you saved it."
        )
        let shown = HouseRecordRowPresentation.make(
            row: standing, now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(shown.leadText == nil)
        #expect(shown.lateText == nil)
        #expect(shown.showsNewTick == false)
        #expect(!shown.accessibilityLabel.contains("Aug 24"))
        #expect(!shown.accessibilityLabel.contains("New since"))
    }

    @Test("State.new draws as no state at all — the tick is the only newness signal")
    func stateNewIsNotASecondSignal() {
        let shown = HouseRecordRowPresentation.make(
            row: Self.row(kind: .story, date: Self.day(8, 25), state: .new),
            now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(shown.leadText == "Aug 25")
        #expect(shown.lateText == nil)
        #expect(shown.showsNewTick == false)
    }

    @Test("every row says its state to VoiceOver")
    func voiceOverNamesTheState() {
        let shown = HouseRecordRowPresentation.make(
            row: Self.row(
                kind: .decisionAsked, date: Self.day(8, 22), state: .overdue,
                title: "Leah asked about Rug color - Natural vs Sand.",
                detail: "Aspen Loft Refresh"
            ),
            now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(shown.accessibilityLabel ==
                "Leah asked about Rug color - Natural vs Sand. Aspen Loft Refresh. asked Aug 22, overdue.")
    }

    // MARK: - The header and the empties

    @Test("the header names the last visit, and says nothing on a first run")
    func headerLine() {
        #expect(HouseRecordDates.headerLine(
            lastSeenAt: nil, now: Self.day(8, 26), calendar: Self.calendar
        ) == nil)

        #expect(HouseRecordDates.headerLine(
            lastSeenAt: Self.day(8, 20), now: Self.day(8, 26), calendar: Self.calendar
        ) == "Since you were last here · Thu, Aug 20")
    }

    @Test("two weeks away names the day of the month, and counts no days")
    func twoWeeksHeader() {
        let header = HouseRecordDates.headerLine(
            lastSeenAt: Self.day(8, 12), now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(header == "You were last here on the 12th")
        #expect(!(header ?? "").contains("14"))
    }

    @Test("the two empties are the ruled sentences")
    func theEmpties() {
        #expect(HouseRecordDates.needsYouEmpty == "Nothing needs you right now.")
        #expect(HouseRecordDates.movedEmpty(lastSeenAt: Self.day(8, 20))
                == "Nothing moved since Thursday.")
        // No visit on file means no weekday to name.
        #expect(HouseRecordDates.movedEmpty(lastSeenAt: nil) == "Nothing moved yet.")
    }

    @Test("past a month the header names the month too, so the day is not this one")
    func aLongGapNamesTheMonth() {
        // "You were last here on the 13th" three months later reads as THIS
        // month's 13th.
        #expect(HouseRecordDates.headerLine(
            lastSeenAt: Self.day(5, 13), now: Self.day(8, 26), calendar: Self.calendar
        ) == "You were last here on May 13")
        // The ordinal form still holds inside the month.
        #expect(HouseRecordDates.headerLine(
            lastSeenAt: Self.day(7, 30), now: Self.day(8, 26), calendar: Self.calendar
        ) == "You were last here on the 30th")
    }

    @Test("the ruled date strings do not depend on the device locale")
    func datesAreFixedFormat() {
        // A fixed `dateFormat` with the device locale gives "26 août" on a
        // French phone, mid-English sentence. The formatter is pinned.
        #expect(HouseRecordDates.short(Self.day(8, 22), calendar: Self.calendar) == "Aug 22")
        #expect(HouseRecordDates.weekday(Self.day(8, 20), calendar: Self.calendar) == "Thursday")
        #expect(HouseRecordDates.weekdayAndDay(Self.day(8, 20), calendar: Self.calendar)
                == "Thu, Aug 20")
    }

    @Test("See all is one footer under both halves, not one per half")
    func theFooterIsSingle() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        // Exactly one place draws it, and it is not inside `half(...)`.
        #expect(source.components(separatedBy: "Text(\"See all →\")").count - 1 == 1)
        #expect(source.contains("private var seeAllFooter"))
        let half = try #require(source.range(of: "private func half("))
        let body = String(source[half.lowerBound...])
        let end = try #require(body.range(of: "// MARK: - One row"))
        #expect(!String(body[..<end.lowerBound]).contains("See all"))
    }

    @Test("the record's own event carries the gap it is reporting on")
    func theShownEventCarriesTheGap() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        #expect(source.contains("\"days_since_last_seen\""))
        #expect(source.contains("\"needs_count\""))
        #expect(source.contains("\"moved_count\""))
    }
}
