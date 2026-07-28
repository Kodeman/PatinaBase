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
    /// Opens the selected room's project view. Drives both the tappable
    /// context text and the explicit "Open room →" control. Nil renders the
    /// text plainly with no control (e.g. the preview).
    var onOpenRoom: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
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

            // U13: sq-ft / orientation metadata is a description, not a verb.
            // The named control is the affordance; the metadata line stays
            // tappable as an accelerator.
            if let onOpenRoom, let room {
                Button(action: onOpenRoom) {
                    Text("Open room →")
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(minHeight: 32, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open \(room.name)")
                .accessibilityHint("Opens this room.")
            }
        }
        .padding(.top, PatinaSpacing.sm)
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private func contextText(for room: RoomSummary) -> some View {
        let strong = Color(PatinaColors.Text.primary)
        let muted = Color(PatinaColors.Text.muted)
        let text = (
            Text("\(room.squareFeet) sq ft").foregroundStyle(strong).fontWeight(.medium)
            + Text(" · ").foregroundStyle(muted)
            + Text(room.orientation).foregroundStyle(strong).fontWeight(.medium)
            + Text(" · ").foregroundStyle(muted)
            + Text("\(room.windowCount) window\(room.windowCount == 1 ? "" : "s")").foregroundStyle(strong).fontWeight(.medium)
        )
        .font(PatinaTypography.captionSmall)

        if let onOpenRoom {
            Button(action: onOpenRoom) {
                HStack(spacing: 4) {
                    text
                    Image(systemName: "chevron.right")
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open \(room.name)")
            .accessibilityHint("Opens this room.")
        } else {
            text
        }
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
