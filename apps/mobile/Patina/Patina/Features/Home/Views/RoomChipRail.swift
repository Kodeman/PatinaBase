//
//  RoomChipRail.swift
//  Patina
//

import SwiftUI

struct RoomChipRail: View {
    let rooms: [RoomSummary]
    let selectedID: RoomSummary.ID?
    let onSelect: (RoomSummary) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(rooms) { room in
                    chip(for: room)
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.top, 16)
    }

    @ViewBuilder
    private func chip(for room: RoomSummary) -> some View {
        let isActive = room.id == selectedID
        Button {
            onSelect(room)
        } label: {
            HStack(spacing: 7) {
                ZStack(alignment: .topTrailing) {
                    Circle()
                        .fill(room.thumbGradient)
                        .frame(width: 26, height: 26)
                    if room.justScanned {
                        Circle()
                            .fill(PatinaColors.clay)
                            .frame(width: 8, height: 8)
                            .overlay(Circle().stroke(PatinaColors.offWhite, lineWidth: 1.5))
                            .offset(x: 1, y: -1)
                    }
                }
                Text(room.name)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(isActive ? PatinaColors.offWhite : PatinaColors.charcoal)
                Text("\(room.itemCount)")
                    .font(.custom("DMMono-Regular", size: 7))
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.vertical, 1)
                    .padding(.horizontal, 5)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(PatinaColors.clay)
                    )
                    .padding(.leading, 2)
            }
            .padding(.leading, 5)
            .padding(.trailing, 12)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(isActive ? PatinaColors.charcoal : PatinaColors.softCream)
            )
            .overlay(
                Capsule()
                    .stroke(isActive ? PatinaColors.charcoal : PatinaColors.pearl, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    RoomChipRail(rooms: RoomSummary.mockAll, selectedID: RoomSummary.mockAll.first?.id) { _ in }
        .background(PatinaColors.offWhite)
}
