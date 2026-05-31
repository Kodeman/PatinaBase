//
//  RoomContextBar.swift
//  Patina
//

import SwiftUI

struct RoomContextBar: View {
    let room: RoomSummary?
    let filters: [DailyRoomViewModel.CategoryFilter]
    let activeFilterID: String
    let onSelectFilter: (DailyRoomViewModel.CategoryFilter) -> Void

    var body: some View {
        HStack(alignment: .center) {
            if let room {
                contextText(for: room)
            } else {
                Spacer()
            }
            Spacer(minLength: 8)
            HStack(spacing: 4) {
                ForEach(filters) { filter in
                    filterPill(filter)
                }
            }
        }
        .padding(.top, 10)
        .padding(.horizontal, 20)
        .padding(.bottom, 6)
    }

    private func contextText(for room: RoomSummary) -> some View {
        let strong = Color(PatinaColors.charcoal)
        let muted = Color(PatinaColors.agedOak)
        return (
            Text("\(room.squareFeet) sq ft").foregroundStyle(strong).fontWeight(.medium)
            + Text(" · ").foregroundStyle(muted)
            + Text(room.orientation).foregroundStyle(strong).fontWeight(.medium)
            + Text(" · ").foregroundStyle(muted)
            + Text("\(room.windowCount) window\(room.windowCount == 1 ? "" : "s")").foregroundStyle(strong).fontWeight(.medium)
        )
        .font(.system(size: 10))
    }

    private func filterPill(_ filter: DailyRoomViewModel.CategoryFilter) -> some View {
        let isActive = filter.id == activeFilterID
        return Button {
            onSelectFilter(filter)
        } label: {
            Text(filter.label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(isActive ? PatinaColors.offWhite : PatinaColors.mocha)
                .padding(.vertical, 3)
                .padding(.horizontal, 9)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(isActive ? PatinaColors.charcoal : PatinaColors.softCream)
                )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    RoomContextBar(
        room: .mockLiving,
        filters: DailyRoomViewModel.defaultFilters,
        activeFilterID: "all"
    ) { _ in }
    .background(PatinaColors.offWhite)
}
