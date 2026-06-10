//
//  AddToRoomSheet.swift
//  Patina
//

import SwiftUI

struct AddToRoomSheet: View {
    let product: Product
    let rooms: [RoomSummary]
    let onSelect: (RoomSummary) -> Void
    let onNewRoom: () -> Void

    @State private var selectedID: RoomSummary.ID?

    var body: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(PatinaColors.Text.muted.opacity(0.25))
                .frame(width: 36, height: 4)
                .padding(.top, 18)
                .padding(.bottom, 14)

            VStack(alignment: .leading, spacing: 3) {
                Text("Add to Room")
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text("Choose Destination")
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding(.bottom, 14)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)

            VStack(spacing: 7) {
                ForEach(rooms) { room in
                    row(for: room)
                }
            }
            .padding(.horizontal, 24)

            Button {
                onNewRoom()
            } label: {
                Text("+ New Room")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.interactive)
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
            .padding(.bottom, 36)
        }
        .frame(maxWidth: .infinity)
        .background(PatinaColors.Background.primary)
        .presentationDetents([.medium])
    }

    private func row(for room: RoomSummary) -> some View {
        let isSelected = room.id == selectedID
        return Button {
            selectedID = room.id
            onSelect(room)
        } label: {
            HStack(spacing: 11) {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(room.thumbGradient)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(room.name)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(isSelected ? PatinaColors.Text.inverse : PatinaColors.Text.primary)
                    Text("\(room.itemCount) items · \(room.squareFeet) sq ft")
                        .font(PatinaTypography.monoSmall)
                        .tracking(0.3)
                        .textCase(.uppercase)
                        .foregroundStyle(isSelected ? PatinaColors.Text.interactive : PatinaColors.Text.muted)
                }
                Spacer()
                Text("+")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(isSelected ? PatinaColors.Text.inverse : PatinaColors.Text.interactive)
            }
            .padding(11)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? PatinaColors.Interactive.active : PatinaColors.Background.secondary)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    AddToRoomSheet(
        product: Product.previewProducts[0],
        rooms: RoomSummary.mockAll,
        onSelect: { _ in },
        onNewRoom: { }
    )
}
