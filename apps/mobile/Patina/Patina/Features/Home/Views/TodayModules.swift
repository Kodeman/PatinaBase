//
//  TodayModules.swift
//  Patina
//
//  Option B's compact Today modules.
//

import SwiftUI

struct TodayNextMoveCard: View {
    let move: TodayNextMove
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(PatinaColors.clay.opacity(0.14))
                    Image(systemName: move.symbol)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
                .frame(width: 54, height: 54)
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    MonoLabel(text: "Next Move", size: PatinaTypography.monoSmall)
                    Text(move.title)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(move.detail)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 4)

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .accessibilityHidden(true)
            }
            .padding(16)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(move.title). \(move.detail)")
        .accessibilityHint("Opens today's recommended next step.")
        .accessibilityIdentifier("DailyRoomView.TodayNextMove")
    }
}

struct TodayActiveRoomCard: View {
    let room: RoomModel
    let recentSavedItem: SavedItem?
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                TodayRoomArtwork(room: room)

                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        MonoLabel(text: "Active Room", size: PatinaTypography.monoSmall)
                        Text(room.name)
                            .font(PatinaTypography.h4)
                            .foregroundStyle(PatinaColors.Text.primary)
                        Text(contextLine)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        if let recentSavedItem {
                            Text("Latest save: \(recentSavedItem.productName)")
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.muted)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(PatinaColors.Text.muted)
                        .padding(.top, 22)
                        .accessibilityHidden(true)
                }
                .padding(16)
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(room.name). \(contextLine)")
        .accessibilityHint("Opens this room.")
        .accessibilityIdentifier("DailyRoomView.ActiveRoom")
    }

    private var contextLine: String {
        var parts: [String] = []
        if let formattedArea = room.formattedArea {
            parts.append(formattedArea)
        }
        if !room.orientationLabel.isEmpty {
            parts.append(room.orientationLabel)
        }
        let count = room.items.count
        parts.append("\(count) \(count == 1 ? "piece" : "pieces") saved")
        return parts.joined(separator: " · ")
    }
}

private struct TodayRoomArtwork: View {
    let room: RoomModel

    var body: some View {
        Group {
            if let data = room.heroFrameData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if let rawURL = room.imageUrls?["hero"],
                      let url = URL(string: rawURL),
                      url.scheme != nil {
                PatinaAsyncImage(url: url, contentMode: .fill)
            } else {
                roomGradient
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 150)
        .clipped()
        .overlay(alignment: .bottomLeading) {
            if room.hasBeenScanned {
                Text("ROOM SCAN")
                    .font(PatinaTypography.monoTiny)
                    .tracking(0.6)
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(PatinaColors.charcoal.opacity(0.6))
                    .clipShape(Capsule())
                    .padding(10)
            }
        }
        .accessibilityHidden(true)
    }

    private var roomGradient: LinearGradient {
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": return PatinaGradients.warm
        case "bedroom": return PatinaGradients.dusk
        case "office": return PatinaGradients.sageGradient
        case "dining", "dining_room": return PatinaGradients.earth
        case "kitchen": return PatinaGradients.rattan
        default: return PatinaGradients.linen
        }
    }
}
