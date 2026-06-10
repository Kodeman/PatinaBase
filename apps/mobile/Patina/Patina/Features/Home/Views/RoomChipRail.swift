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
        // ScrollViewReader so selecting a chip (tap or programmatic, e.g.
        // RoomSelectionStore restoring a just-scanned room) scrolls it into
        // view instead of leaving the active room off-screen (Theme V).
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: PatinaSpacing.sm) {
                    ForEach(rooms) { room in
                        chip(for: room)
                            .id(room.id)
                    }
                }
                .padding(.horizontal, PatinaSpacing.mdLarge)
            }
            .onChange(of: selectedID) { _, newValue in
                guard let newValue else { return }
                withAnimation(.easeOut(duration: 0.25)) {
                    proxy.scrollTo(newValue, anchor: .center)
                }
            }
        }
        .padding(.top, PatinaSpacing.md)
    }

    @ViewBuilder
    private func chip(for room: RoomSummary) -> some View {
        let isActive = room.id == selectedID
        Button {
            onSelect(room)
        } label: {
            HStack(spacing: PatinaSpacing.sm) {
                ZStack(alignment: .topTrailing) {
                    Circle()
                        .fill(room.thumbGradient)
                        .frame(width: 26, height: 26)
                    if room.justScanned {
                        Circle()
                            .fill(PatinaColors.clay)
                            .frame(width: 8, height: 8)
                            .overlay(Circle().stroke(PatinaColors.Background.primary, lineWidth: 1.5))
                            .offset(x: 1, y: -1)
                    }
                }
                Text(room.name)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(isActive ? PatinaColors.Text.inverse : PatinaColors.Text.primary)
                Text("\(room.itemCount)")
                    .font(PatinaTypography.monoSmall)
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.vertical, 1)
                    .padding(.horizontal, PatinaSpacing.xs)
                    .background(
                        RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous)
                            .fill(PatinaColors.clay)
                    )
                    .padding(.leading, PatinaSpacing.xxxs)
            }
            .padding(.leading, PatinaSpacing.xs)
            .padding(.trailing, PatinaSpacing.xsm)
            .padding(.vertical, PatinaSpacing.xs)
            // Theme V: unambiguous selected state — the active chip is a
            // filled charcoal capsule, inactive chips read as outlines on
            // the off-white home surface.
            .background(
                Capsule()
                    .fill(isActive ? PatinaColors.Interactive.active : PatinaColors.Background.primary)
            )
            .overlay(
                Capsule()
                    .stroke(isActive ? PatinaColors.Interactive.active : PatinaColors.Text.muted.opacity(0.25), lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}

#Preview {
    RoomChipRail(rooms: RoomSummary.mockAll, selectedID: RoomSummary.mockAll.first?.id) { _ in }
        .background(PatinaColors.Background.primary)
}
