//
//  RoomGalleryCard.swift
//  Patina
//
//  Gallery card used in YourSpacesView — matches the Room System spec:
//  hero image + new-picks badge + bottom-gradient label + stats row.
//

import SwiftUI

struct RoomGalleryCard: View {
    let room: RoomModel
    /// How many recommendations are unseen for this room.
    var newPickCount: Int = 0
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                hero
                stats
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Hero

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            roomGradient
                .frame(height: 180)
                .clipped()

            // Bottom gradient for legibility
            LinearGradient(
                colors: [PatinaColors.charcoal.opacity(0.70), .clear],
                startPoint: .bottom,
                endPoint: .top
            )
            .frame(height: 108)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)

            VStack(alignment: .leading, spacing: 2) {
                Text(room.name)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.offWhite)
                Text(room.galleryMetaLine)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 12)

            if newPickCount > 0 {
                badge(label: "\(newPickCount) new picks", color: PatinaColors.clay)
                    .padding(.top, 10)
                    .padding(.trailing, 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else if room.items.isEmpty && room.hasBeenScanned {
                // A room the person typed was never scanned; the badge said it
                // was, on the same card whose meta line said "Manual entry".
                badge(label: "Just scanned", color: PatinaColors.dustyBlue)
                    .padding(.top, 10)
                    .padding(.trailing, 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
        .frame(height: 180)
        .clipped()
    }

    private func badge(label: String, color: Color) -> some View {
        Text(label)
            .font(PatinaTypography.monoLabel)
            .tracking(0.4)
            .textCase(.uppercase)
            .foregroundStyle(PatinaColors.offWhite)
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(Capsule().fill(color))
    }

    // MARK: - Stats

    private var stats: some View {
        HStack(spacing: 0) {
            let cells = Self.statCells(for: room)
            ForEach(Array(cells.enumerated()), id: \.element.id) { index, cell in
                if index > 0 { divider }
                stat(value: cell.value, label: cell.label)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
    }

    struct Stat: Identifiable, Equatable {
        let value: String
        let label: String
        var id: String { label }
    }

    /// A room with no budget draws no `Budget` cell at all — B M4's states row
    /// is "no budget → the ghost act, never a `—`", and this card has no room
    /// for an act, so it prints nothing rather than a dash under a word it has
    /// no number for (C5).
    static func statCells(for room: RoomModel) -> [Stat] {
        var cells = [Stat(value: "\(room.items.count)", label: "Items")]
        if let budget = budgetString(for: room) {
            cells.append(Stat(value: budget, label: "Budget"))
        }
        if let match = matchString(for: room) {
            cells.append(Stat(value: match, label: "Match"))
        }
        return cells
    }

    private var divider: some View {
        Rectangle()
            .fill(PatinaColors.Border.hairline)
            .frame(width: 1, height: 24)
    }

    private func stat(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(label)
                .font(PatinaTypography.monoLabel)
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .frame(maxWidth: .infinity)
    }

    /// The budget the person set, under the word `Budget`. It used to be the
    /// sum of the room's saved pieces — a different number entirely, printed
    /// under a label that did not describe it (C5). W4 gives the room a real
    /// `budgetCents`, so the cell reads that, or the cell does not draw.
    static func budgetString(for room: RoomModel) -> String? {
        guard let cents = room.budgetCents else { return nil }
        let dollars = cents / 100
        if dollars >= 1000 {
            return "$\(String(format: "%.1f", Double(dollars) / 1000))K"
        }
        return "$\(dollars)"
    }

    /// A score Patina has not computed gets no cell. The `—` under the word
    /// `MATCH` named a number that does not exist anywhere — not a figure the
    /// person declined to give, which is what SP-18's dash idiom is for
    /// (h1-notes.md §6.2, ruled in integration.md §6.5).
    static func matchString(for room: RoomModel) -> String? {
        guard let avg = room.averageMatchScore else { return nil }
        return "\(avg)%"
    }

    // MARK: - Hero gradient

    /// Pick a gradient based on the room's type / orientation so each room
    /// card has a distinct but on-brand look until real hero images arrive.
    private var roomGradient: LinearGradient {
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": return PatinaGradients.warm
        case "bedroom":                               return PatinaGradients.dusk
        case "office":                                return PatinaGradients.sageGradient
        case "dining", "dining_room":                 return PatinaGradients.earth
        case "kitchen":                               return PatinaGradients.rattan
        default:                                      return PatinaGradients.linen
        }
    }
}
