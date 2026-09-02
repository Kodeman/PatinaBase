//
//  HouseWidgetViews.swift
//  PatinaWidget
//
//  M6b on the Home Screen, M6a on the Lock Screen.
//
//  What is drawn here, and what is not, is the ruling (Q8, C5, B §4):
//  what MOVED, with its own date — never what is owed, never a count, never a
//  badge, never a "new" tick. A stale payload says when it was refreshed rather
//  than passing for a fresh one. There is no member on `HouseWidgetPayload` to draw
//  a count from, so this file could not leak one if it tried.
//

import PatinaDesignKit
import SwiftUI
import WidgetKit

struct HouseWidgetEntryView: View {

    @Environment(\.widgetFamily) private var family

    let entry: HouseWidgetEntry

    init(entry: HouseWidgetEntry) {
        self.entry = entry
        PatinaFonts.registerAll()
    }

    private var snapshot: HouseWidgetPayload? {
        guard let snapshot = entry.snapshot, !snapshot.isPlaceholder else { return nil }
        return snapshot
    }

    var body: some View {
        switch family {
        case .accessoryRectangular:
            RectangularAccessoryView(snapshot: snapshot, now: entry.date)
                .widgetURL(PatinaWidgetLinks.link(for: snapshot?.drawableRows.first))
                .containerBackground(.clear, for: .widget)
        case .accessoryCircular:
            CircularAccessoryView()
                .widgetURL(PatinaWidgetLinks.today)
                .containerBackground(.clear, for: .widget)
        case .systemMedium:
            // D5. The medium family is the only Home Screen size that can host
            // per-row `Link`s at all, which is what makes a list of rows an
            // honest list of doors rather than one target wearing two labels.
            MediumHomeView(snapshot: snapshot, now: entry.date)
                .widgetURL(PatinaWidgetLinks.today)
                .containerBackground(PatinaColors.Background.secondary, for: .widget)
        default:
            // GAP7B-04: `systemSmall` has ONE `widgetURL` and it wins every
            // pixel, so a card that drew two rows and pointed at neither taught
            // the tester that the second row was broken. One row, and the card
            // is that row's door.
            SmallHomeView(snapshot: snapshot, now: entry.date)
                .widgetURL(PatinaWidgetLinks.link(for: snapshot?.drawableRows.first))
                .containerBackground(PatinaColors.Background.secondary, for: .widget)
        }
    }
}

// MARK: - Home Screen, small (M6b)

private struct SmallHomeView: View {

    let snapshot: HouseWidgetPayload?
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
            HouseWidgetHeader(snapshot: snapshot)
            Spacer(minLength: 0)
            content
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// The one row the card's own door points at.
    private var firstRow: HouseWidgetPayloadRow? {
        snapshot?.drawableRows.first
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot {
            if let firstRow {
                MovedRowView(row: firstRow)
            } else {
                Text(snapshot.emptyLine())
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .lineLimit(3)
            }
            footer(for: snapshot)
        } else {
            Text(HouseWidgetCopy.noData)
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineLimit(3)
        }
    }

    /// The staleness note outranks the house line: C5 says a stale snapshot
    /// says when it was refreshed, and one line is all the small widget has.
    @ViewBuilder
    private func footer(for snapshot: HouseWidgetPayload) -> some View {
        if let line = snapshot.refreshedLine(now: now) ?? snapshot.houseLine {
            Text(line)
                .font(PatinaTypography.monoSmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineLimit(1)
        }
    }
}

// MARK: - Home Screen, medium (D5)

/// The same rows the small card holds one of, each inside its own `Link`.
/// Nothing new is drawn: no count, no tally, no status colour — the medium
/// family is room for the second row's door, not a second kind of content.
private struct MediumHomeView: View {

    let snapshot: HouseWidgetPayload?
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
            HouseWidgetHeader(snapshot: snapshot)
            content
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot {
            if snapshot.drawableRows.isEmpty {
                Text(snapshot.emptyLine())
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .lineLimit(3)
            } else {
                VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                    ForEach(snapshot.drawableRows, id: \.title) { row in
                        Link(destination: PatinaWidgetLinks.link(for: row)) {
                            MovedRowView(row: row)
                        }
                    }
                }
            }
            footer(for: snapshot)
        } else {
            Text(HouseWidgetCopy.noData)
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineLimit(3)
        }
    }

    @ViewBuilder
    private func footer(for snapshot: HouseWidgetPayload) -> some View {
        if let line = snapshot.refreshedLine(now: now) ?? snapshot.houseLine {
            Text(line)
                .font(PatinaTypography.monoSmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineLimit(1)
        }
    }
}

// MARK: - Shared parts

private struct HouseWidgetHeader: View {

    let snapshot: HouseWidgetPayload?

    var body: some View {
        HStack(spacing: PatinaSpacing.xs) {
            StrataMarkView(color: PatinaColors.Strata.line2, scale: 0.5, accessibility: .decorative)
            Text(snapshot?.eyebrow() ?? "Patina")
                .font(PatinaTypography.monoLabel)
                .tracking(1)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
            Spacer(minLength: 0)
        }
    }
}

private struct MovedRowView: View {

    let row: HouseWidgetPayloadRow

    var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
            // GAP7B-03: "A new story fro…", "Meadow Linen…". A sentence cut
            // mid-word is not a shorter sentence, it is a different one. Two
            // lines, then a little shrink, then — and only then — an ellipsis.
            Text(row.title)
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.Text.primary)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Text(HouseWidgetCopy.date(row.date))
                .font(PatinaTypography.monoSmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Lock Screen (M6a)

private struct RectangularAccessoryView: View {

    let snapshot: HouseWidgetPayload?
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
            Text("Patina")
                .font(PatinaTypography.monoSmall)
                .tracking(1)
                .textCase(.uppercase)
                .widgetAccentable()
            Text(line)
                .font(PatinaTypography.uiSmall)
                .lineLimit(refreshedLine == nil ? 2 : 1)
            if let refreshedLine {
                Text(refreshedLine)
                    .font(PatinaTypography.monoSmall)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel([line, refreshedLine].compactMap { $0 }.joined(separator: ". "))
    }

    private var line: String {
        guard let snapshot else { return HouseWidgetCopy.noDataShort }
        guard let row = snapshot.drawableRows.first else { return snapshot.emptyLine() }
        return "\(row.title) \(HouseWidgetCopy.date(row.date))"
    }

    /// The Lock Screen makes the same disclosure the Home Screen does.
    private var refreshedLine: String? {
        snapshot?.refreshedLine(now: now)
    }
}

private struct CircularAccessoryView: View {

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            StrataMarkView(color: .primary, scale: 0.9, useSpecColors: false, accessibility: .decorative)
        }
        .accessibilityElement()
        .accessibilityLabel("Patina")
    }
}
