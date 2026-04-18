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
            .background(PatinaColors.softCream)
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
                    .font(.custom("PlayfairDisplay-Regular", size: 20))
                    .foregroundColor(PatinaColors.offWhite)
                Text(room.galleryMetaLine)
                    .font(.custom("DMMono-Regular", size: 8))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.clay)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 12)

            if newPickCount > 0 {
                badge(label: "\(newPickCount) new picks", color: PatinaColors.clay)
                    .padding(.top, 10)
                    .padding(.trailing, 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else if room.items.isEmpty {
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
            .font(.custom("DMMono-Regular", size: 7))
            .tracking(0.4)
            .textCase(.uppercase)
            .foregroundColor(PatinaColors.offWhite)
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(Capsule().fill(color))
    }

    // MARK: - Stats

    private var stats: some View {
        HStack(spacing: 0) {
            stat(value: "\(room.items.count)", label: "Items")
            divider
            stat(value: budgetString, label: "Budget")
            divider
            stat(value: matchString, label: "Avg Match")
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
    }

    private var divider: some View {
        Rectangle()
            .fill(PatinaColors.pearl)
            .frame(width: 1, height: 24)
    }

    private func stat(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.custom("PlayfairDisplay-Medium", size: 16))
                .foregroundColor(PatinaColors.charcoal)
            Text(label)
                .font(.custom("DMMono-Regular", size: 7))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundColor(PatinaColors.agedOak)
        }
        .frame(maxWidth: .infinity)
    }

    private var budgetString: String {
        let dollars = room.totalInvestmentCents / 100
        if dollars == 0 { return "—" }
        if dollars >= 1000 {
            return "$\(String(format: "%.1f", Double(dollars) / 1000))K"
        }
        return "$\(dollars)"
    }

    private var matchString: String {
        guard let avg = room.averageMatchScore else { return "—" }
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
