//
//  MoveOrCopyItemSheet.swift
//  Patina
//
//  Bottom sheet that moves or copies a SavedItem between rooms.
//

import SwiftUI
import SwiftData

struct MoveOrCopyItemSheet: View {
    enum Mode: Hashable { case move, copy }

    let itemId: UUID

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var items: [SavedItem]
    @Query(sort: \RoomModel.createdAt, order: .reverse) private var rooms: [RoomModel]

    @State private var mode: Mode = .move

    init(itemId: UUID) {
        self.itemId = itemId
        _items = Query(filter: #Predicate<SavedItem> { $0.id == itemId })
    }

    private var item: SavedItem? { items.first }

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(PatinaColors.pearl)
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            if let item {
                productHeader(item)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 14)

                modePicker
                    .padding(.horizontal, 24)
                    .padding(.bottom, 10)

                Text("Select destination room")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 6)

                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(rooms) { room in
                            roomRow(room, currentRoom: item.room)
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 24)
            } else {
                Text("Item not found")
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding()
            }
        }
        .background(PatinaColors.Background.primary)
    }

    private func productHeader(_ item: SavedItem) -> some View {
        HStack(spacing: 10) {
            item.placeholderGradient
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.productName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(PatinaColors.Text.primary)
                Text("\(item.makerName) · \(item.fullFormattedPrice)")
                    .font(.custom("DMMono-Regular", size: 8))
                    .tracking(0.3)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
    }

    private var modePicker: some View {
        HStack(spacing: 6) {
            modeButton("Move", .move)
            modeButton("Copy", .copy)
        }
    }

    private func modeButton(_ title: String, _ value: Mode) -> some View {
        let selected = mode == value
        return Button { mode = value } label: {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(selected ? .white : PatinaColors.Text.secondary)
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(selected ? PatinaColors.clay : PatinaColors.Background.secondary)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(selected ? PatinaColors.clay : PatinaColors.pearl, lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
    }

    private func roomRow(_ room: RoomModel, currentRoom: RoomModel?) -> some View {
        let isCurrent = room.id == currentRoom?.id
        return Button {
            performAction(targetRoomId: room.id)
        } label: {
            HStack(spacing: 10) {
                roomThumb(for: room)
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(room.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer()
                if isCurrent {
                    Text("Current")
                        .font(.custom("DMMono-Regular", size: 7))
                        .tracking(0.3)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                } else {
                    Text("→")
                        .font(.system(size: 14))
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
            )
            .opacity(isCurrent ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(isCurrent)
    }

    private func roomThumb(for room: RoomModel) -> some View {
        let g: LinearGradient
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": g = PatinaGradients.warm
        case "bedroom":                               g = PatinaGradients.dusk
        case "office":                                g = PatinaGradients.sageGradient
        case "dining", "dining_room":                 g = PatinaGradients.earth
        case "kitchen":                               g = PatinaGradients.rattan
        default:                                      g = PatinaGradients.linen
        }
        return Rectangle().fill(g)
    }

    private func performAction(targetRoomId: UUID) {
        guard let item else { return }
        let store = RoomStore(context: modelContext)
        switch mode {
        case .move: store.moveItem(item, toRoomId: targetRoomId)
        case .copy: _ = store.copyItem(item, toRoomId: targetRoomId)
        }
        dismiss()
    }
}
