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
                .fill(PatinaColors.pearl)
                .frame(width: 36, height: 4)
                .padding(.top, 18)
                .padding(.bottom, 14)

            VStack(alignment: .leading, spacing: 3) {
                Text("Add to Room")
                    .font(.custom("PlayfairDisplay-Regular", size: 17))
                    .foregroundColor(PatinaColors.charcoal)
                Text("Choose Destination")
                    .font(.custom("DMMono-Regular", size: 8))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.agedOak)
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
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(PatinaColors.clay)
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
            .padding(.bottom, 36)
        }
        .frame(maxWidth: .infinity)
        .background(PatinaColors.offWhite)
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
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(isSelected ? PatinaColors.offWhite : PatinaColors.charcoal)
                    Text("\(room.itemCount) items · \(room.squareFeet) sq ft")
                        .font(.custom("DMMono-Regular", size: 7))
                        .tracking(0.3)
                        .textCase(.uppercase)
                        .foregroundColor(isSelected ? PatinaColors.clay : PatinaColors.agedOak)
                }
                Spacer()
                Text("+")
                    .font(.system(size: 15))
                    .foregroundColor(isSelected ? PatinaColors.offWhite : PatinaColors.clay)
            }
            .padding(11)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? PatinaColors.charcoal : PatinaColors.softCream)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    AddToRoomSheet(
        product: Product.mockProducts[0],
        rooms: RoomSummary.mockAll,
        onSelect: { _ in },
        onNewRoom: { }
    )
}
