//
//  HouseRecordCard.swift
//  Patina
//
//  The Record, drawn. One card, two eyebrows — NEEDS YOU and MOVED — 56 pt
//  rows carrying the date the thing happened and its state on the right.
//
//  Honesty (C5) is enforced here as much as in the builder:
//   • a row with `isStandingCondition` draws WITHOUT a date and WITHOUT the
//     "· new" tick — the window does not vouch for its date, and printing one
//     under "SINCE YOU WERE LAST HERE · THU, AUG 20" would contradict the
//     card's own header (r1-notes §9.1);
//   • `· new` comes from `isNew` and nothing else. `State.new` is never
//     emitted (r1-notes §9.2) and is drawn as no state at all;
//   • `error` red is reserved for money that is actually late. An approval
//     that has passed its date says so in body ink and nothing else — P-04 /
//     R8: red status is a VISION refusal, and painting a homeowner's own
//     unanswered question red is the app editorialising on the studio's
//     behalf. Everything else on the right is muted mono;
//   • the empty halves draw only where they are true answers — from engaged
//     upward. At guest and discovering the caller does not mount the card at
//     all (`HomeComposition.recordDraws`).
//
// P-04 and P-12 pushed this past the 500-line floor. The file is the
// Record's presentation contract end to end — the row model, the dates,
// the card and the row — and the honesty rules above are read against all
// four together; splitting it to satisfy a line count would scatter them.
// Same disable, and the same reason, as `HouseRecord.swift` beside it.
// swiftlint:disable file_length

import SwiftUI

// MARK: - Row presentation

/// What the right-hand side of one row prints, and what VoiceOver says about
/// it. Extracted from the view so every honesty rule above is testable without
/// rendering anything.
struct HouseRecordRowPresentation: Equatable {
    /// Mono, muted. Nil for a standing condition, which claims no date.
    let leadText: String?
    /// Mono, `error`. The only red on the card, and money only.
    let lateText: String?
    /// P-04 / R8. An approval past its date, said in body ink: it is still
    /// open, and the row's own title already names who asked and about what.
    /// Never red, and never the word this program retired.
    let stillOpenText: String?
    let showsNewTick: Bool
    let accessibilityLabel: String

    /// The one word the state prints. Ruled copy — pinned rather than spelled
    /// out at each of its three sites.
    static let stillOpen = "Still open"

    static func make(
        row: HouseRecordRow,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> HouseRecordRowPresentation {
        // A standing condition is a fact with no date the app can stand
        // behind. Its copy carries the whole meaning.
        guard !row.isStandingCondition else {
            return HouseRecordRowPresentation(
                leadText: nil, lateText: nil, stillOpenText: nil, showsNewTick: false,
                accessibilityLabel: spoken(row: row, state: nil, isNew: false)
            )
        }

        let tick = row.isNew
        switch row.state {
        case .overdue:
            // R8's sentence, assembled across the row it belongs to: the title
            // beside this already opens with the designer's given name and the
            // question ("Leah asked about Rug color."), so the rail carries the
            // rest of it and VoiceOver hears the whole line at once.
            let asked = "asked \(HouseRecordDates.short(row.date, calendar: calendar))"
            return HouseRecordRowPresentation(
                leadText: asked, lateText: nil, stillOpenText: Self.stillOpen,
                showsNewTick: tick,
                accessibilityLabel: spoken(
                    row: row, state: "\(Self.stillOpen), \(asked)", isNew: tick
                )
            )

        case .due(let due):
            let by = "by \(HouseRecordDates.short(due, calendar: calendar))"
            return HouseRecordRowPresentation(
                leadText: by, lateText: nil, stillOpenText: nil, showsNewTick: tick,
                accessibilityLabel: spoken(row: row, state: "Due \(by)", isNew: tick)
            )

        case .amount(let cents, let due):
            let money = PatinaCurrency.format(cents: cents)
            let text = due.map {
                "\(money) · due \(HouseRecordDates.short($0, calendar: calendar))"
            } ?? money
            let late = due.map {
                calendar.startOfDay(for: $0) < calendar.startOfDay(for: now)
            } ?? false
            return HouseRecordRowPresentation(
                leadText: late ? nil : text,
                lateText: late ? text : nil,
                stillOpenText: nil,
                showsNewTick: tick,
                // "past its date" rather than the retired word: this is spoken
                // copy, and it is the same phrase the web bucket now carries.
                accessibilityLabel: spoken(
                    row: row, state: late ? "\(text), past its date" : text, isNew: tick
                )
            )

        case .none, .new:
            // `.new` is never emitted; drawing it as a state would put a
            // second, unearned newness signal beside the tick.
            let date = HouseRecordDates.short(row.date, calendar: calendar)
            return HouseRecordRowPresentation(
                leadText: date, lateText: nil, stillOpenText: nil, showsNewTick: tick,
                accessibilityLabel: spoken(row: row, state: date, isNew: tick)
            )
        }
    }

    private static func spoken(row: HouseRecordRow, state: String?, isNew: Bool) -> String {
        var parts = [row.title]
        if let detail = row.detail, !detail.isEmpty { parts.append(detail) }
        if let state { parts.append(state) }
        if isNew { parts.append("New since your last visit") }
        // Each part is its own spoken sentence; the copy already ends most of
        // them with a full stop, so joining on ". " would double it.
        return parts
            .map { $0.hasSuffix(".") ? $0 : $0 + "." }
            .joined(separator: " ")
    }
}

// MARK: - Dates and the card's own header

enum HouseRecordDates {

    /// Fixed-format dates need a fixed locale, or "Aug 22" becomes "22 août"
    /// on a French device while the copy around it stays English — and the
    /// tests that assert the ruled strings pass or fail by device setting.
    /// The calendar's own time zone decides which day a timestamp falls on.
    private static func formatter(_ format: String, _ calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = format
        return formatter
    }

    /// "Aug 22". The one date format the card prints.
    static func short(_ date: Date, calendar: Calendar = .current) -> String {
        formatter("MMM d", calendar).string(from: date)
    }

    /// "Thu, Aug 20".
    static func weekdayAndDay(_ date: Date, calendar: Calendar = .current) -> String {
        formatter("EEE, MMM d", calendar).string(from: date)
    }

    /// "Thursday" — the weekday the MOVED empty names.
    static func weekday(_ date: Date, calendar: Calendar = .current) -> String {
        formatter("EEEE", calendar).string(from: date)
    }

    /// "12th".
    static func ordinalDay(_ date: Date, calendar: Calendar = .current) -> String {
        let day = calendar.component(.day, from: date)
        let formatter = NumberFormatter()
        formatter.numberStyle = .ordinal
        return formatter.string(from: NSNumber(value: day)) ?? "\(day)"
    }

    /// The card's header line, uppercased by the view.
    ///
    /// Nil on a first run or a reinstall: there is no gap to name, so the
    /// header is the greeting alone (B §1). Beyond a week the line names the
    /// day of the month instead of the weekday, and beyond a month it names
    /// the month too — "on the 13th" three months later implies this one. No
    /// branch counts days at the person.
    static func headerLine(lastSeenAt: Date?, now: Date, calendar: Calendar = .current) -> String? {
        guard let lastSeenAt else { return nil }
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: lastSeenAt),
            to: calendar.startOfDay(for: now)
        ).day ?? 0
        if days > longGapDays {
            return "You were last here on \(short(lastSeenAt, calendar: calendar))"
        }
        if days > 7 {
            return "You were last here on the \(ordinalDay(lastSeenAt, calendar: calendar))"
        }
        return "Since you were last here · \(weekdayAndDay(lastSeenAt, calendar: calendar))"
    }

    /// Past this the ordinal alone is ambiguous — it reads as this month.
    static let longGapDays = 30

    /// "Nothing moved since Thursday." — and, with no visit on file, the line
    /// that names no day it cannot vouch for.
    static func movedEmpty(lastSeenAt: Date?, calendar: Calendar = .current) -> String {
        guard let lastSeenAt else { return "Nothing moved yet." }
        return "Nothing moved since \(weekday(lastSeenAt, calendar: calendar))."
    }

    static let needsYouEmpty = "Nothing needs you right now."
}

// MARK: - Staleness (R-03)

/// When the Record on screen is not what the house holds, Today says so — in a
/// word, never a dot and never a badge (VISION §6, the same constraint
/// `StudioHubViewModel.stalenessLine` carries).
///
/// R-03's third half went to L1-B after merge and nothing ever produced a line:
/// `grep stalenessLine` resolved only to the Studio. So Today drew a record
/// composed before the network died with no signal of any kind, and the reader
/// had no way to tell a quiet house from an unreachable one.
enum RecordStaleness {

    /// - Parameters:
    ///   - refreshFailed: `BadgeCountService.lastRefreshFailed` — every one of
    ///     the fetches the Record is built from came back empty-handed.
    ///   - record: what is on screen. An empty record is not stale, it is the
    ///     error state, and the card's own empty lines carry it.
    static func line(
        refreshFailed: Bool,
        record: HouseRecord?,
        now: Date = Date()
    ) -> String? {
        guard refreshFailed, let record else { return nil }
        guard !record.needsYou.isEmpty || !record.moved.isEmpty else { return nil }
        return "Last updated \(formatter.localizedString(for: record.window.end, relativeTo: now))."
    }

    private static let formatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter
    }()
}

// MARK: - The card

struct HouseRecordCard: View {

    enum Half: String {
        case needsYou
        case moved
    }

    let record: HouseRecord
    /// True from engaged upward. Only there is an empty half a true answer;
    /// below it the caller does not mount the card at all.
    let drawsEmpties: Bool
    /// R-03: `RecordStaleness.line(...)`, or nil when the last refresh answered.
    var stalenessLine: String?
    var now: Date = Date()
    var onRow: (HouseRecordRow) -> Void = { _ in }
    var onSeeAll: (Half) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let header = HouseRecordDates.headerLine(lastSeenAt: record.lastSeenAt, now: now) {
                Text(header)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding(.bottom, PatinaSpacing.sm)
                    .accessibilityAddTraits(.isHeader)
            }

            if let stalenessLine {
                Text(stalenessLine)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, PatinaSpacing.sm)
                    .accessibilityIdentifier("DailyRoomView.RecordStaleness")
            }

            half(
                .needsYou,
                eyebrow: "NEEDS YOU",
                rows: record.needsYou,
                empty: HouseRecordDates.needsYouEmpty,
                isFirst: true
            )

            half(
                .moved,
                eyebrow: "MOVED",
                rows: record.moved,
                empty: HouseRecordDates.movedEmpty(lastSeenAt: record.lastSeenAt),
                isFirst: record.needsYou.isEmpty && !drawsEmpties
            )
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.top, 10)
        .padding(.bottom, PatinaSpacing.xsm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        .accessibilityIdentifier("DailyRoomView.HouseRecord")
        .onAppear {
            var properties: [String: Any] = [
                "needs_count": record.needsYou.count,
                "moved_count": record.moved.count
            ]
            // The one property that answers whether the return surface is
            // working. Absent rather than zero where there is no visit on
            // file: a first run has no gap to measure.
            if let days = daysSinceLastSeen {
                properties["days_since_last_seen"] = days
            }
            PostHogService.shared.capture("today_record_shown", properties: properties)
        }
    }

    private var daysSinceLastSeen: Int? {
        guard let lastSeenAt = record.lastSeenAt else { return nil }
        let calendar = Calendar.current
        return calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: lastSeenAt),
            to: calendar.startOfDay(for: now)
        ).day
    }

    /// P-12: each overflowing half draws its OWN `See all →`, under its own
    /// rows. One footer per card led with whichever half had more, so a card
    /// with four MOVED rows and four NEEDS YOU rows made an open obligation
    /// reachable only through a link labelled for the news half. The visible
    /// word is the same on both; VoiceOver is told which half it opens.
    @ViewBuilder
    private func seeAll(_ half: Half) -> some View {
        Button {
            onSeeAll(half)
        } label: {
            Text("See all →")
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.Text.interactive)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(half == .needsYou ? "See all that needs you" : "See all that moved")
        .accessibilityIdentifier(
            half == .needsYou
                ? "DailyRoomView.RecordSeeAllNeedsYou"
                : "DailyRoomView.RecordSeeAllMoved"
        )
    }

    @ViewBuilder
    private func half(
        _ half: Half,
        eyebrow: String,
        rows: [HouseRecordRow],
        empty: String,
        isFirst: Bool
    ) -> some View {
        // Each half asks about its OWN overflow. Read here rather than passed
        // in so a call site cannot hand one half the other's answer — which is
        // the defect P-12 is about, in miniature.
        let hasMore = half == .needsYou ? record.hasMoreNeedsYou : record.hasMoreMoved
        if !rows.isEmpty || drawsEmpties {
            VStack(alignment: .leading, spacing: 0) {
                if !isFirst {
                    Rectangle()
                        .fill(PatinaColors.Border.hairline)
                        .frame(height: 1)
                        .padding(.top, PatinaSpacing.sm)
                        .accessibilityHidden(true)
                }
                Text(eyebrow)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.5)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .padding(.top, PatinaSpacing.sm)
                    .padding(.bottom, 2)

                if rows.isEmpty {
                    Text(empty)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minHeight: 44, alignment: .leading)
                        .onAppear {
                            PostHogService.shared.capture("today_record_empty_shown", properties: [
                                "half": half.rawValue
                            ])
                        }
                } else {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 {
                            Rectangle()
                                .fill(PatinaColors.Border.hairline)
                                .frame(height: 1)
                                .accessibilityHidden(true)
                        }
                        HouseRecordRowView(row: row, now: now) { onRow(row) }
                    }
                }

                if hasMore {
                    Rectangle()
                        .fill(PatinaColors.Border.hairline)
                        .frame(height: 1)
                        .accessibilityHidden(true)
                    seeAll(half)
                }
            }
        }
    }
}

// MARK: - One row

struct HouseRecordRowView: View {
    let row: HouseRecordRow
    var now: Date = Date()
    var onTap: () -> Void = {}

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var presentation: HouseRecordRowPresentation {
        HouseRecordRowPresentation.make(row: row, now: now)
    }

    var body: some View {
        // C-20, the half a token could not reach. This was one `Button` with
        // `.disabled(row.route == nil)`, and SwiftUI halves a disabled plain
        // button's ink: `Text.primary` at 0.5 over the card is 4.27:1 — the
        // finding's own rendered number — and the meta line 3.01:1, with light
        // mode worse than dark at 2.96:1 and 1.86:1. Raising the ramp moved the
        // meta by a third of a point and could not move the body at all,
        // because the dim is a modifier. A row with nowhere to go is not a
        // broken control; it is a sentence, and it is rendered as one.
        Group {
            if row.route == nil {
                rowContent
            } else {
                Button(action: onTap) { rowContent }
                    .buttonStyle(.plain)
            }
        }
        // C-20: a row with no route was a *disabled* Button, and SwiftUI dims a
        // disabled label to about half alpha — 12.42:1 became 4.27:1 on the
        // app's home screen in dark mode, which no token value can fix.
        // `.allowsHitTesting` withholds the tap without withholding the
        // contrast; the trait line below still keeps VoiceOver from announcing
        // it as a button.
        .allowsHitTesting(row.route != nil)
        // P-12: an obligation carries a margin rule and a piece of news does
        // not. That is the whole differentiator — no second colour, no heavier
        // type, no count, no badge. Every row is inset by the same gutter so
        // the titles still line up across the two halves; only the rule itself
        // appears or does not.
        .padding(.leading, Self.marginRuleGutter)
        .overlay(alignment: .leading) {
            if row.kind.isObligation {
                Rectangle()
                    .fill(PatinaColors.clay)
                    .frame(width: Self.marginRuleWidth)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(presentation.accessibilityLabel)
        .accessibilityAddTraits(row.route == nil ? [] : .isButton)
    }

    /// Two points, per the sheet.
    static let marginRuleWidth: CGFloat = 2
    /// The gutter the rule sits in, kept on every row so a NEEDS YOU title and
    /// a MOVED title start at the same x.
    static let marginRuleGutter = PatinaSpacing.sm

    private var rowContent: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    title
                    state
                }
            } else {
                HStack(alignment: .center, spacing: PatinaSpacing.lg) {
                    title
                    Spacer(minLength: PatinaSpacing.sm)
                    state
                }
            }
        }
        .frame(minHeight: 56)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var title: some View {
        Text(row.title)
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.primary)
            .fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(.leading)
    }

    @ViewBuilder
    private var state: some View {
        let shown = presentation
        HStack(spacing: 4) {
            if let lead = shown.leadText {
                Text(lead)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            if let late = shown.lateText {
                if shown.leadText != nil {
                    Text("·")
                        .font(PatinaTypography.monoLabel)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Text(late)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.error)
            }
            if let stillOpen = shown.stillOpenText {
                if shown.leadText != nil {
                    Text("·")
                        .font(PatinaTypography.monoLabel)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                // Body ink at the rail's own size — the state is stated, not
                // flagged (P-04).
                Text(stillOpen)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.primary)
            }
            if shown.showsNewTick {
                Text("· new")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.clay)
            }
        }
        .accessibilityHidden(true)
    }
}
