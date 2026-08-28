//
//  RoomHeroCard.swift
//  Patina
//
//  M2 block 3 — the room the person made, at full width, with its real
//  numbers and its own dated state line (B §2, B §3).
//
//  At discovering the house is one room, and a 240 pt card in a rail that
//  scrolls nowhere is a list of one. So the discovering house is this card:
//  the room's name, its dimensions, what is gathering in it, and the last real
//  thing that happened there, dated.
//
//  Honesty (C5): every line is a real value or it is not drawn. The budget the
//  mock prints ("budget $9,000") has NO source on a local room — `RoomModel`
//  carries no budget field, and inventing one, or borrowing a project room's,
//  would be the app making a figure up. It is left out and raised rather than
//  filled in (see `r2-fix-log.md`, MJ-B).
//

import SwiftUI

/// What the card says, resolved from the model so every rule is testable
/// without rendering anything.
struct RoomHero: Equatable {

    let roomId: UUID
    let name: String
    /// "SCANNED" or "TYPED, NOT SCANNED" — how the room got here.
    let provenance: String
    /// "18 × 14 ft · 252 sq ft", or nil where the room has no dimensions.
    let dimensions: String?
    /// "3 saved pieces", or nil where nothing is saved to it.
    let pieces: String?
    /// "You added the Brass Arc Floor Lamp on Tuesday" — the last real, dated
    /// thing that happened in this room. Nil where nothing has.
    let stateLine: String?

    static func make(
        room: RoomModel,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> RoomHero {
        RoomHero(
            roomId: room.id,
            name: room.name,
            provenance: room.hasBeenScanned ? "SCANNED" : "TYPED, NOT SCANNED",
            dimensions: dimensions(for: room),
            pieces: pieces(for: room),
            stateLine: stateLine(for: room, now: now, calendar: calendar)
        )
    }

    /// The room's own figures. `width` / `length` are metres on the model and
    /// feet on the screen, and the area is the model's own conversion.
    static func dimensions(for room: RoomModel) -> String? {
        var parts: [String] = []
        if let width = room.width, let length = room.length, width > 0, length > 0 {
            parts.append(String(
                format: "%.0f × %.0f ft", width * 3.28084, length * 3.28084
            ))
        }
        if let area = room.formattedArea { parts.append(area) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    static func pieces(for room: RoomModel) -> String? {
        let count = room.items.count
        guard count > 0 else { return nil }
        return "\(count) saved \(count == 1 ? "piece" : "pieces")"
    }

    /// The most recent save, by its own date. Within the week it reads as a
    /// weekday, the way a person would say it; past that it names the day,
    /// because "on Tuesday" three weeks later is a different Tuesday.
    static func stateLine(
        for room: RoomModel,
        now: Date,
        calendar: Calendar
    ) -> String? {
        guard let latest = room.items.max(by: { $0.addedAt < $1.addedAt }) else { return nil }
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: latest.addedAt),
            to: calendar.startOfDay(for: now)
        ).day ?? 0
        let when = days <= 7
            ? "on \(HouseRecordDates.weekday(latest.addedAt, calendar: calendar))"
            : "on \(HouseRecordDates.short(latest.addedAt, calendar: calendar))"
        return "You added the \(latest.productName) \(when)"
    }
}

// MARK: - The card

struct RoomHeroCard: View {
    let hero: RoomHero
    var onOpen: () -> Void = {}
    var onAddRoom: (StartWithARoomAct) -> Void = { _ in }

    @State private var isChoosingAct = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MonoLabel(text: "YOUR HOUSE")

            Text(hero.provenance)
                .font(PatinaTypography.monoLabel)
                .tracking(0.5)
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.top, PatinaSpacing.sm)

            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: 0) {
                    Rectangle()
                        .fill(PatinaColors.Background.primary)
                        .frame(height: 48)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(hero.name)
                            .font(PatinaTypography.h4)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        if let dimensions = hero.dimensions {
                            Text(dimensions)
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let pieces = hero.pieces {
                            Text(pieces)
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let stateLine = hero.stateLine {
                            Text(stateLine)
                                .font(PatinaTypography.bodySmallMedium)
                                .foregroundStyle(PatinaColors.Text.primary)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, PatinaSpacing.xxs)
                        }
                    }
                    .padding(.horizontal, PatinaSpacing.md)
                    .padding(.vertical, PatinaSpacing.sm)
                }
                .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, PatinaSpacing.sm)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                [hero.name, hero.dimensions, hero.pieces, hero.stateLine]
                    .compactMap { $0 }
                    .joined(separator: ". ")
            )
            .accessibilityHint("Opens this room.")

            Button { isChoosingAct = true } label: {
                Text("+ Add a room")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add a room")
            .accessibilityIdentifier("DailyRoomView.AddRoom")
            .confirmationDialog("Add a room", isPresented: $isChoosingAct) {
                ForEach(StartWithARoomAct.ordered) { act in
                    Button(act.title) { onAddRoom(act) }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .accessibilityIdentifier("DailyRoomView.RoomHero")
    }
}

// MARK: - M2 block 5 — the Saved summary row

/// "Saved · 3 saved · Brass Arc Floor Lamp, Tuesday" — one door to the pieces
/// the person has gathered, drawn where they have gathered any.
struct SavedSummary: Equatable {

    let count: Int
    /// "3 saved · Brass Arc Floor Lamp, Tuesday", or the count alone where the
    /// most recent save carries no date the app can stand behind.
    let meta: String

    static func make(
        items: [TableItemModel],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> SavedSummary? {
        guard !items.isEmpty else { return nil }
        var parts = ["\(items.count) saved"]
        if let latest = items.max(by: { $0.savedAt < $1.savedAt }) {
            let days = calendar.dateComponents(
                [.day],
                from: calendar.startOfDay(for: latest.savedAt),
                to: calendar.startOfDay(for: now)
            ).day ?? 0
            let when = days <= 7
                ? HouseRecordDates.weekday(latest.savedAt, calendar: calendar)
                : HouseRecordDates.short(latest.savedAt, calendar: calendar)
            parts.append("\(latest.name), \(when)")
        }
        return SavedSummary(count: items.count, meta: parts.joined(separator: " · "))
    }
}

struct SavedSummaryRow: View {
    let summary: SavedSummary
    var onOpen: () -> Void = {}

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: PatinaSpacing.sm) {
                Text("Saved")
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer(minLength: PatinaSpacing.sm)
                Text(summary.meta)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .multilineTextAlignment(.trailing)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(PatinaColors.Text.muted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, PatinaSpacing.md)
            .frame(minHeight: 56)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Saved. \(summary.meta)")
        .accessibilityHint("Opens your saved pieces.")
        .accessibilityIdentifier("DailyRoomView.SavedSummary")
    }
}
