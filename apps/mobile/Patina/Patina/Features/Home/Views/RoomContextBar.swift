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
        .padding(.top, PatinaSpacing.sm)
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .padding(.bottom, 6)
    }

    private func contextText(for room: RoomSummary) -> some View {
        let strong = Color(PatinaColors.Text.primary)
        let muted = Color(PatinaColors.Text.muted)
        return (
            Text("\(room.squareFeet) sq ft").foregroundStyle(strong).fontWeight(.medium)
            + Text(" · ").foregroundStyle(muted)
            + Text(room.orientation).foregroundStyle(strong).fontWeight(.medium)
            + Text(" · ").foregroundStyle(muted)
            + Text("\(room.windowCount) window\(room.windowCount == 1 ? "" : "s")").foregroundStyle(strong).fontWeight(.medium)
        )
        .font(PatinaTypography.captionSmall)
    }

    private func filterPill(_ filter: DailyRoomViewModel.CategoryFilter) -> some View {
        let isActive = filter.id == activeFilterID
        return Button {
            onSelectFilter(filter)
        } label: {
            Text(filter.label)
                .font(PatinaTypography.captionSmall)
                .foregroundStyle(isActive ? PatinaColors.Text.inverse : PatinaColors.Text.secondary)
                .padding(.vertical, 3)
                .padding(.horizontal, PatinaSpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                        .fill(isActive ? PatinaColors.Interactive.active : PatinaColors.Background.secondary)
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
    .background(PatinaColors.Background.primary)
}
