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
    /// SP-19: the unit is state, never a stored preference — every visit opens
    /// in feet, visibly (see `RoomUnitToggle`).
    @State private var unit: RoomUnit = .feet
    @State private var lengthText: String = ""
    @State private var widthText: String = ""
    @State private var showDeleteConfirm = false
    /// U27: debounces the autosave triggered by `.onChange(of: name)` so a
    /// rename isn't written on every keystroke; cancelled + re-armed on each
    /// change, and flushed unconditionally on `.onDisappear`.
    @State private var renameSaveTask: Task<Void, Never>?

    init(roomId: UUID) {
        self.roomId = roomId
        _rooms = Query(filter: #Predicate<RoomModel> { $0.id == roomId })
    }

    private var room: RoomModel? { rooms.first }

    /// The face both typed fields wear — the room's name and each dimension.
    /// One declaration so the two cannot drift apart.
    private static let fieldFont = Font.custom("PlayfairDisplay-Regular", size: 16, relativeTo: .body)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                nameField
                typeField
                if let room { dimensionsField(room) }
                if let room { scanCard(room) }
                shareButton
                deleteButton
                Spacer().frame(height: 60)
            }
            .padding(20)
        }
        .background(PatinaColors.Background.primary.ignoresSafeArea())
        // U18: standard pushed-screen chrome — resolves the prior conflict
        // where ContentView styled this destination as a system bar while
        // this view separately hid it. The header below carries the title.
        .patinaScreen(title: nil)
        .onAppear {
            if let room {
                name = room.name
                roomType = room.roomType
                if let length = room.length {
                    lengthText = Self.entry(fromMetres: length, unit: unit)
                }
                if let width = room.width {
                    widthText = Self.entry(fromMetres: width, unit: unit)
                }
            }
        }
        // U27: a rename must never silently drop. onSubmit covers the
        // keyboard-return path; this covers navigating away (back chevron,
        // swipe-to-dismiss, deep link) without submitting.
        .onDisappear {
            renameSaveTask?.cancel()
            saveIfChanged()
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
            Text("Room Settings")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.top, 56)
            Text(room?.name ?? "")
                .font(PatinaTypography.monoSmall)
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
        }
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Room Name")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
            TextField("Room name", text: $name)
                .font(Self.fieldFont)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(PatinaColors.Background.secondary)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(PatinaColors.Border.strong, lineWidth: 1.5)
                )
                .onSubmit { saveIfChanged() }
                .onChange(of: name) { _, _ in
                    scheduleDebouncedSave()
                }
        }
    }

    private var typeField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Room Type")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
            RoomTypePillRow(selected: $roomType)
                .onChange(of: roomType) { _, new in
                    if let room {
                        RoomStore(context: modelContext).updateType(room, to: new)
                    }
                }
        }
    }

    // MARK: - Edit dimensions (M4 block 6)

    /// The numbers the person typed, correctable — the one piece of project
    /// data a client may edit, because they typed it themselves (B §10).
    /// The unit is on a segmented control that shows its own state, and the
    /// write goes through `updateTypedDimensions`, which does NOT flip
    /// `hasBeenScanned`: a corrected room is still a typed room (F51).
    private func dimensionsField(_ room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Dimensions")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.secondary)
                Spacer()
                RoomUnitToggle(unit: $unit)
            }
            HStack(spacing: 10) {
                dimensionEntry(title: "Length", text: $lengthText)
                dimensionEntry(title: "Width", text: $widthText)
            }
            Button {
                saveDimensions(room)
            } label: {
                Text("Save dimensions")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(Capsule().fill(PatinaColors.Background.primary))
                    .overlay(Capsule().stroke(PatinaColors.Border.strong, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .disabled(!hasUsableDimensions)
            .accessibilityIdentifier("RoomSettingsView.SaveDimensions")
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
        .onChange(of: unit) { old, new in
            // Re-express what is on screen rather than reinterpreting it: the
            // number the person is looking at keeps meaning the same length.
            lengthText = Self.restate(lengthText, from: old, to: new)
            widthText = Self.restate(widthText, from: old, to: new)
        }
    }

    private func dimensionEntry(title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .font(Self.fieldFont)
                .foregroundStyle(PatinaColors.Text.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(PatinaColors.Background.primary)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(PatinaColors.Border.strong, lineWidth: 1.5)
                )
                .accessibilityLabel("\(title) in \(unit.label.lowercased())")
            Text("\(title.uppercased()) (\(unit.rawValue))")
                .font(PatinaTypography.monoLabel)
                .tracking(0.4)
                .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(maxWidth: .infinity)
    }

    private var hasUsableDimensions: Bool {
        guard let length = Double(lengthText), let width = Double(widthText) else { return false }
        return length > 0 && width > 0
    }

    private func saveDimensions(_ room: RoomModel) {
        guard let length = Double(lengthText), let width = Double(widthText),
              length > 0, width > 0 else { return }
        RoomStore(context: modelContext).updateTypedDimensions(
            room,
            widthMeters: unit.metres(from: width),
            lengthMeters: unit.metres(from: length),
            heightMeters: nil
        )
        PostHogService.shared.capture("room_dimensions_edited", properties: [
            "unit": unit.rawValue
        ])
    }

    private func scanCard(_ room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Scan Data")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer()
                Text(scanDate(room))
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.3)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Text(scanSummary(room))
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
            Button {
                saveIfChanged()
                coordinator.navigate(to: .scanFlow(reason: .rescan))
            } label: {
                Text("Re-Scan This Room")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .background(
                        Capsule().fill(PatinaColors.Background.primary)
                    )
                    .overlay(
                        Capsule().stroke(PatinaColors.Border.strong, lineWidth: 1.5)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
    }

    private var shareButton: some View {
        Button {
            saveIfChanged()
            coordinator.presentDesignServices(roomId: roomId)
        } label: {
            HStack(spacing: 6) {
                Text("↗")
                Text("Get design help with this room")
            }
            .font(PatinaTypography.uiSmall)
            .foregroundStyle(PatinaColors.offWhite)
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(PatinaColors.clayInk)
            )
        }
        .buttonStyle(.plain)
    }

    private var deleteButton: some View {
        Button {
            showDeleteConfirm = true
        } label: {
            Text("Delete This Room")
                .font(PatinaTypography.uiSmall)
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

    /// U27: re-armed on every keystroke so a rename lands a beat after
    /// typing stops, without writing on every character.
    private func scheduleDebouncedSave() {
        renameSaveTask?.cancel()
        renameSaveTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            saveIfChanged()
        }
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

// MARK: - What the fields read back

/// Pure, and outside the view body so the screen's own type stays inside the
/// house limit. Both are called from the view and from `RoomBudgetTests`.
extension RoomSettingsView {

    static func restate(_ text: String, from old: RoomUnit, to new: RoomUnit) -> String {
        guard old != new, let value = Double(text) else { return text }
        let metres = old.metres(from: value)
        return Self.entry(fromMetres: metres, unit: new)
    }

    /// Round to a tenth before asking whether the number is whole: 18 ft
    /// stored as metres comes back 17.999999999999996, and the field must
    /// offer the person the number they typed, not the float.
    static func entry(fromMetres metres: Double, unit: RoomUnit) -> String {
        let value = (unit.value(fromMetres: metres) * 10).rounded() / 10
        return value.rounded() == value
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}
