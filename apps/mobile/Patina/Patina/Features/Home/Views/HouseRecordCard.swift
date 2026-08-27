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
//   • `error` red is reserved for money that is actually late, plus the one
//     word `overdue`. Everything else on the right is muted mono;
//   • the empty halves draw only where they are true answers — from engaged
//     upward. At guest and discovering the caller does not mount the card at
//     all (`HomeComposition.recordDraws`).
//

import SwiftUI

// MARK: - Row presentation

/// What the right-hand side of one row prints, and what VoiceOver says about
/// it. Extracted from the view so every honesty rule above is testable without
/// rendering anything.
struct HouseRecordRowPresentation: Equatable {
    /// Mono, muted. Nil for a standing condition, which claims no date.
    let leadText: String?
    /// Mono, `error`. The only red on the card.
    let lateText: String?
    let showsNewTick: Bool
    let accessibilityLabel: String

    static func make(
        row: HouseRecordRow,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> HouseRecordRowPresentation {
        // A standing condition is a fact with no date the app can stand
        // behind. Its copy carries the whole meaning.
        guard !row.isStandingCondition else {
            return HouseRecordRowPresentation(
                leadText: nil, lateText: nil, showsNewTick: false,
                accessibilityLabel: spoken(row: row, state: nil, isNew: false)
            )
        }

        let tick = row.isNew
        switch row.state {
        case .overdue:
            let asked = "asked \(HouseRecordDates.short(row.date))"
            return HouseRecordRowPresentation(
                leadText: asked, lateText: "overdue", showsNewTick: tick,
                accessibilityLabel: spoken(row: row, state: "\(asked), overdue", isNew: tick)
            )

        case .due(let due):
            let by = "by \(HouseRecordDates.short(due))"
            return HouseRecordRowPresentation(
                leadText: by, lateText: nil, showsNewTick: tick,
                accessibilityLabel: spoken(row: row, state: "Due \(by)", isNew: tick)
            )

        case .amount(let cents, let due):
            let money = PatinaCurrency.format(cents: cents)
            let text = due.map { "\(money) · due \(HouseRecordDates.short($0))" } ?? money
            let late = due.map {
                calendar.startOfDay(for: $0) < calendar.startOfDay(for: now)
            } ?? false
            return HouseRecordRowPresentation(
                leadText: late ? nil : text,
                lateText: late ? text : nil,
                showsNewTick: tick,
                accessibilityLabel: spoken(
                    row: row, state: late ? "\(text), overdue" : text, isNew: tick
                )
            )

        case .none, .new:
            // `.new` is never emitted; drawing it as a state would put a
            // second, unearned newness signal beside the tick.
            let date = HouseRecordDates.short(row.date)
            return HouseRecordRowPresentation(
                leadText: date, lateText: nil, showsNewTick: tick,
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

    /// "Aug 22". The one date format the card prints.
    static func short(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }

    /// "Thu, Aug 20".
    static func weekdayAndDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: date)
    }

    /// "Thursday" — the weekday the MOVED empty names.
    static func weekday(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: date)
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
    /// day of the month instead of the weekday — the record runs longer, and
    /// still counts no days at the person.
    static func headerLine(lastSeenAt: Date?, now: Date, calendar: Calendar = .current) -> String? {
        guard let lastSeenAt else { return nil }
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: lastSeenAt),
            to: calendar.startOfDay(for: now)
        ).day ?? 0
        if days > 7 {
            return "You were last here on the \(ordinalDay(lastSeenAt, calendar: calendar))"
        }
        return "Since you were last here · \(weekdayAndDay(lastSeenAt))"
    }

    /// "Nothing moved since Thursday." — and, with no visit on file, the line
    /// that names no day it cannot vouch for.
    static func movedEmpty(lastSeenAt: Date?) -> String {
        guard let lastSeenAt else { return "Nothing moved yet." }
        return "Nothing moved since \(weekday(lastSeenAt))."
    }

    static let needsYouEmpty = "Nothing needs you right now."
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

            half(
                .needsYou,
                eyebrow: "NEEDS YOU",
                rows: record.needsYou,
                hasMore: record.hasMoreNeedsYou,
                empty: HouseRecordDates.needsYouEmpty,
                isFirst: true
            )

            half(
                .moved,
                eyebrow: "MOVED",
                rows: record.moved,
                hasMore: record.hasMoreMoved,
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
            PostHogService.shared.capture("today_record_shown", properties: [
                "needs_count": record.needsYou.count,
                "moved_count": record.moved.count
            ])
        }
    }

    @ViewBuilder
    private func half(
        _ half: Half,
        eyebrow: String,
        rows: [HouseRecordRow],
        hasMore: Bool,
        empty: String,
        isFirst: Bool
    ) -> some View {
        if !rows.isEmpty || drawsEmpties {
            VStack(alignment: .leading, spacing: 0) {
                if !isFirst {
                    Rectangle()
                        .fill(PatinaColors.pearl)
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
                                .fill(PatinaColors.pearl)
                                .frame(height: 1)
                                .accessibilityHidden(true)
                        }
                        HouseRecordRowView(row: row, now: now) { onRow(row) }
                    }
                    if hasMore {
                        Button {
                            onSeeAll(half)
                        } label: {
                            Text("See all →")
                                .font(PatinaTypography.uiAction)
                                .foregroundStyle(PatinaColors.Text.interactive)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, PatinaSpacing.sm)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("See all")
                    }
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
        Button(action: onTap) {
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
        .buttonStyle(.plain)
        .disabled(row.route == nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(presentation.accessibilityLabel)
        .accessibilityAddTraits(row.route == nil ? [] : .isButton)
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
                    .foregroundStyle(PatinaColors.error)
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
