//
//  RoomSettingsView.swift
//  Patina
//
//  Room settings: rename, type, scan data + re-scan, share, delete.
//

import SwiftUI
import SwiftData

struct RoomSettingsView: View {
    let roomId: UUID

    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dismiss) private var dismiss
    @Query private var rooms: [RoomModel]

    @State private var name: String = ""
    @State private var roomType: String = "other"
    @State private var showDeleteConfirm = false

    init(roomId: UUID) {
        self.roomId = roomId
        _rooms = Query(filter: #Predicate<RoomModel> { $0.id == roomId })
    }

    private var room: RoomModel? { rooms.first }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                nameField
                typeField
                if let room { scanCard(room) }
                shareButton
                deleteButton
                Spacer().frame(height: 60)
            }
            .padding(20)
        }
        .background(PatinaColors.offWhite.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            if let room {
                name = room.name
                roomType = room.roomType
            }
        }
        .alert("Delete this room?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive, action: deleteRoom)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Items in this room will also be removed.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                BackChevronButton(style: .light) { coordinator.goBack() }
                Spacer()
            }
            .padding(.top, 20)
            Text("Room Settings")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.top, 12)
            Text(room?.name ?? "")
                .font(PatinaTypography.monoSmall)
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.agedOak)
        }
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Room Name")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(PatinaColors.mocha)
            TextField("Room name", text: $name)
                .font(.custom("PlayfairDisplay-Regular", size: 16, relativeTo: .body))
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(PatinaColors.softCream)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(PatinaColors.pearl, lineWidth: 1.5)
                )
                .onSubmit { saveIfChanged() }
        }
    }

    private var typeField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Room Type")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(PatinaColors.mocha)
            RoomTypePillRow(selected: $roomType)
                .onChange(of: roomType) { _, new in
                    if let room {
                        RoomStore(context: modelContext).updateType(room, to: new)
                    }
                }
        }
    }

    private func scanCard(_ room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Scan Data")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(PatinaColors.charcoal)
                Spacer()
                Text(scanDate(room))
                    .font(.custom("DMMono-Regular", size: 8, relativeTo: .caption2))
                    .tracking(0.3)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.agedOak)
            }
            Text(scanSummary(room))
                .font(.system(size: 11))
                .foregroundStyle(PatinaColors.agedOak)
            Button {
                saveIfChanged()
                coordinator.navigate(to: .rescan(roomId: room.id))
            } label: {
                Text("Re-Scan This Room")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(PatinaColors.charcoal)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .background(
                        Capsule().fill(PatinaColors.offWhite)
                    )
                    .overlay(
                        Capsule().stroke(PatinaColors.pearl, lineWidth: 1.5)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.softCream)
        )
    }

    private var shareButton: some View {
        Button {
            saveIfChanged()
            coordinator.navigate(to: .designServicesRequest(roomId: roomId))
        } label: {
            HStack(spacing: 6) {
                Text("↗")
                Text("Share with Designer")
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(PatinaColors.offWhite)
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(PatinaColors.clay)
            )
        }
        .buttonStyle(.plain)
    }

    private var deleteButton: some View {
        Button {
            showDeleteConfirm = true
        } label: {
            Text("Delete This Room")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(PatinaColors.terracotta)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private func saveIfChanged() {
        guard let room else { return }
        let store = RoomStore(context: modelContext)
        if name != room.name && !name.isEmpty { store.rename(room, to: name) }
    }

    private func deleteRoom() {
        guard let room else { return }
        RoomStore(context: modelContext).delete(room)
        coordinator.goBack()
    }

    private func scanDate(_ room: RoomModel) -> String {
        Self.scanDateFormatter.string(from: room.updatedAt)
    }

    /// Shared formatter — avoids a `DateFormatter` allocation on every render of `scanCard`.
    private static let scanDateFormatter: DateFormatter = {
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d, yyyy"
        return fmt
    }()

    private func scanSummary(_ room: RoomModel) -> String {
        var parts: [String] = []
        if let sf = room.squareFeet { parts.append(String(format: "%.0f sq ft", sf)) }
        if !room.lastScanConfidenceRaw.isEmpty {
            parts.append("\(room.lastScanConfidenceRaw.capitalized) confidence")
        }
        if room.windowCount > 0 { parts.append("\(room.windowCount) windows detected") }
        return parts.joined(separator: " · ")
    }
}
