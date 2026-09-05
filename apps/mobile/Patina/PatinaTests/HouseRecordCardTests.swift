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

    /// P-04 / R8. The word "overdue" and the red it was painted in are both
    /// gone: an approval past its date says it is still open, in body ink, and
    /// the red slot (`lateText`) is left for money.
    @Test("an approval past its date says it is still open, and nothing is red")
    func pastItsDateDecision() {
        let shown = HouseRecordRowPresentation.make(
            row: Self.row(kind: .decisionAsked, date: Self.day(8, 22), state: .overdue),
            now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(shown.leadText == "asked Aug 22")
        #expect(shown.stillOpenText == "Still open")
        #expect(shown.lateText == nil)
        #expect(shown.showsNewTick == false)
        #expect(!shown.accessibilityLabel.lowercased().contains("overdue"))
    }

    /// The retired word must not survive anywhere in the two files that draw
    /// the Record — not as a string, not in a spoken label.
    @Test("no surface of the Record prints the word this program retired")
    func theRetiredWordIsGone() throws {
        for path in [
            "Patina/Features/Home/Views/HouseRecordCard.swift",
            "Patina/Features/Home/Models/HouseRecord.swift"
        ] {
            let code = SourceScan.code(in: try SourcePin.read(path))
            #expect(!code.lowercased().contains("\"overdue"),
                    "\(path) still ships the word as copy")
        }
        // The state case keeps its name — it is a state, not a sentence.
        let model = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Models/HouseRecord.swift")
        )
        #expect(model.contains("case overdue"))
    }

    /// The red that is left is money's, and only money's.
    @Test("the error ramp is drawn for the late-money slot and nothing else")
    func redIsMoneyOnly() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        )
        #expect(code.components(separatedBy: "PatinaColors.Text.error").count - 1 == 1)
        let block = try #require(code.range(of: "if let late = shown.lateText {"))
        let money = String(code[block.lowerBound...].prefix(600))
        #expect(money.contains("PatinaColors.Text.error"),
                "the one red is no longer inside the late-money branch")
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

    /// R8's sentence, assembled across the row: the title supplies the
    /// designer's given name and the question, the rail supplies the rest.
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
                "Leah asked about Rug color - Natural vs Sand. Aspen Loft Refresh. Still open, asked Aug 22.")
    }

    /// Late money keeps its red, and loses the retired word with everything
    /// else: what VoiceOver hears is the phrase the web bucket now carries.
    @Test("late money is spoken as past its date")
    func lateMoneyIsSpokenWithoutTheRetiredWord() {
        let shown = HouseRecordRowPresentation.make(
            row: Self.row(
                kind: .invoiceDue, date: Self.day(8, 20),
                state: .amount(cents: 425_000, due: Self.day(9, 1)),
                title: "Your invoice is due."
            ),
            now: Self.day(9, 2), calendar: Self.calendar
        )
        #expect(shown.accessibilityLabel ==
                "Your invoice is due. $4,250.00 · due Sep 1, past its date.")
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

    /// P-12 inverts the old rule. One footer per card led with whichever half
    /// had more, so an obligation could be reachable only through a link
    /// labelled for the news half. Each half now draws its own, inside itself,
    /// gated on its own `hasMore`.
    @Test("See all is drawn per overflowing half, not once per card")
    func theFooterIsPerHalf() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        // One link, one place that composes it, called from inside `half(...)`.
        #expect(source.components(separatedBy: "Text(\"See all →\")").count - 1 == 1)
        #expect(!source.contains("private var seeAllFooter"))
        #expect(source.contains("private func seeAll(_ half: Half)"))

        let half = try #require(source.range(of: "private func half("))
        let body = String(source[half.lowerBound...])
        let end = try #require(body.range(of: "// MARK: - One row"))
        let halfBody = String(body[..<end.lowerBound])
        #expect(halfBody.contains("if hasMore {"))
        #expect(halfBody.contains("seeAll(half)"))

        // Each half is asked about its OWN overflow, never the card's.
        let code = SourceScan.code(in: source)
        #expect(code.contains("hasMore: record.hasMoreNeedsYou"))
        #expect(code.contains("hasMore: record.hasMoreMoved"))
        #expect(!code.contains("record.hasMoreNeedsYou ? .needsYou : .moved"))
        #expect(!code.contains("record.hasMoreNeedsYou || record.hasMoreMoved"))
    }

    /// P-12's other half: the obligation rows carry a two-point clay rule and
    /// the news rows do not — and that is the only difference between them.
    @Test("an obligation carries a margin rule and a piece of news does not")
    func obligationsCarryTheMarginRule() throws {
        for kind in [HouseRecordRow.Kind.decisionAsked, .proposalSent, .invoiceDue] {
            #expect(kind.isObligation, "\(kind) is a NEEDS YOU kind")
        }
        for kind in [
            HouseRecordRow.Kind.messageReceived, .orderMoved, .savedPieceRepriced,
            .savedPieceWithdrawn, .story, .matchedDesigner
        ] {
            #expect(!kind.isObligation, "\(kind) is a MOVED kind")
        }

        #expect(HouseRecordRowView.marginRuleWidth == 2)

        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        )
        #expect(code.contains("if row.kind.isObligation {"))
        #expect(code.contains(".fill(PatinaColors.clay)"))
        #expect(code.contains(".frame(width: Self.marginRuleWidth)"))
        // The gutter is unconditional, so the rule is the only thing that
        // changes between the halves — not the type, not the indent.
        #expect(code.contains(".padding(.leading, Self.marginRuleGutter)"))
        #expect(!code.contains("row.kind.isObligation ? "))
    }

    /// The three-row cap is sound and P-12 does not touch it — only the
    /// overflow link it produces.
    @Test("the three-row cap survives the per-half link")
    func theThreeRowCapIsUnchanged() {
        #expect(HouseRecordBuilder.maxRowsPerEyebrow == 3)
    }

    @Test("the record’s own event carries the gap it is reporting on")
    func theShownEventCarriesTheGap() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        #expect(source.contains("\"days_since_last_seen\""))
        #expect(source.contains("\"needs_count\""))
        #expect(source.contains("\"moved_count\""))
    }

    // MARK: - R-03 · Today says when its rows are from

    private static func record(moved: [HouseRecordRow], builtAt: Date) -> HouseRecord {
        HouseRecord(
            needsYou: [], moved: moved,
            window: DateInterval(start: builtAt.addingTimeInterval(-7 * 24 * 3600), end: builtAt),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    /// `R-03`'s third half. The Studio says when its numbers are from and Today
    /// said nothing at all — the walk read a wiped record with no "last
    /// updated" of any kind, and `grep stalenessLine` resolved only to the
    /// Studio. A word, never a dot and never a badge.
    @Test("a record drawn after a failed refresh says when it was last updated")
    func aStaleRecordSaysSoInWords() throws {
        let built = Self.day(9, 3)
        let line = RecordStaleness.line(
            refreshFailed: true,
            record: Self.record(moved: [Self.row(kind: .story, date: built, state: .none)],
                                builtAt: built),
            now: built.addingTimeInterval(3600)
        )
        let text = try #require(line)
        #expect(text.localizedCaseInsensitiveContains("last updated"))
        #expect(text.hasSuffix("."))
    }

    @Test("a refresh that answered says nothing extra")
    func aFreshRecordHasNoStalenessLine() {
        let built = Self.day(9, 3)
        #expect(RecordStaleness.line(
            refreshFailed: false,
            record: Self.record(moved: [Self.row(kind: .story, date: built, state: .none)],
                                builtAt: built),
            now: built
        ) == nil)
    }

    /// Nothing on the card is nothing to be stale about — that is the empty
    /// state, and its own two sentences carry it.
    @Test("an empty record has no staleness line")
    func anEmptyRecordHasNoStalenessLine() {
        let built = Self.day(9, 3)
        #expect(RecordStaleness.line(
            refreshFailed: true,
            record: Self.record(moved: [], builtAt: built),
            now: built
        ) == nil)
    }

    /// And the card draws it, above the halves, where the header is.
    @Test("the card renders the staleness line and Today supplies it")
    func theCardRendersTheStalenessLine() throws {
        let card = try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        #expect(card.contains("DailyRoomView.RecordStaleness"))
        let today = try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        #expect(today.contains("stalenessLine: RecordStaleness.line("))
        #expect(today.contains("refreshFailed: badges.lastRefreshFailed"))
    }
}
