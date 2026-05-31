//
//  ManualRoomEntryView.swift
//  Patina
//
//  Manual room entry form for non-LiDAR devices.
//

import SwiftUI
import SwiftData

struct ManualRoomEntryView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator

    @State private var roomType: String = "living"
    @State private var name: String = ""
    @State private var lengthFeet: String = "18"
    @State private var widthFeet: String = "14"
    @State private var ceilingHeightRaw: String = "standard" // 8 / 9 / 10 / vaulted
    @State private var windowCountRaw: String = "2"
    @State private var orientationRaw: String = "south"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                group(title: "Room Type") {
                    RoomTypePillRow(selected: $roomType)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                group(title: "Room Name") {
                    TextField("e.g. Living Room", text: $name)
                        .font(.custom("PlayfairDisplay-Regular", size: 16))
                        .foregroundStyle(PatinaColors.charcoal)
                        .padding(.horizontal, 14)
                        .frame(height: 46)
                        .background(fieldBackground)
                }
                group(title: "Dimensions (feet)") {
                    HStack(spacing: 8) {
                        dimensionField(value: $lengthFeet, label: "Length")
                        Text("×")
                            .foregroundStyle(PatinaColors.pearl)
                            .padding(.bottom, 14)
                        dimensionField(value: $widthFeet, label: "Width")
                    }
                }
                group(title: "Ceiling Height") {
                    Picker("Ceiling Height", selection: $ceilingHeightRaw) {
                        Text("Standard (8 ft)").tag("standard")
                        Text("9 ft").tag("nine")
                        Text("10 ft").tag("ten")
                        Text("Vaulted").tag("vaulted")
                    }
                    .pickerStyle(.menu)
                    .tint(PatinaColors.charcoal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .frame(height: 46)
                    .background(fieldBackground)
                }
                group(title: "Windows") {
                    HStack(spacing: 8) {
                        TextField("0", text: $windowCountRaw)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .font(.custom("PlayfairDisplay-Regular", size: 16))
                            .foregroundStyle(PatinaColors.charcoal)
                            .frame(width: 60, height: 46)
                            .background(fieldBackground)
                        Picker("Orientation", selection: $orientationRaw) {
                            Text("North-facing").tag("north")
                            Text("South-facing").tag("south")
                            Text("East-facing").tag("east")
                            Text("West-facing").tag("west")
                        }
                        .pickerStyle(.menu)
                        .tint(PatinaColors.charcoal)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .frame(height: 46)
                        .background(fieldBackground)
                    }
                }

                Button(action: save) {
                    Text("Save Room")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(PatinaColors.offWhite)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Capsule().fill(PatinaColors.charcoal))
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
            .padding(20)
        }
        .background(PatinaColors.offWhite.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: - Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                BackChevronButton(style: .light) { coordinator.goBack() }
                Spacer()
            }
            .padding(.top, 20)
            Text("Room details")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.top, 12)
            Text("Help us understand your space")
                .font(PatinaTypography.monoSmall)
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.agedOak)
        }
    }

    private func group<Content: View>(title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(PatinaColors.mocha)
            content()
        }
    }

    private func dimensionField(value: Binding<String>, label: String) -> some View {
        VStack(spacing: 3) {
            TextField(label, text: value)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .font(.custom("PlayfairDisplay-Regular", size: 16))
                .foregroundStyle(PatinaColors.charcoal)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(fieldBackground)
            Text(label)
                .font(.custom("DMMono-Regular", size: 7))
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.agedOak)
        }
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(PatinaColors.softCream)
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(PatinaColors.pearl, lineWidth: 1.5)
            )
    }

    // MARK: - Save

    private func save() {
        let store = RoomStore(context: modelContext)
        let coord = RoomCreationCoordinator(store: store)
        let finalName = name.isEmpty ? defaultName(for: roomType) : name

        Task { @MainActor in
            do {
                _ = try await coord.createManualRoom(
                    name: finalName,
                    roomType: roomType,
                    widthFeet: Double(widthFeet),
                    lengthFeet: Double(lengthFeet),
                    ceilingHeightFeet: ceilingHeightFeetValue,
                    orientationRaw: orientationRaw,
                    windowCount: Int(windowCountRaw) ?? 0,
                    doorCount: 1
                )
            } catch {
                // Fallback: local-only create so the user isn't blocked offline.
                _ = store.createRoom(
                    name: finalName,
                    roomType: roomType,
                    widthFeet: Double(widthFeet),
                    lengthFeet: Double(lengthFeet),
                    ceilingHeightFeet: ceilingHeightFeetValue,
                    orientationRaw: orientationRaw,
                    windowCount: Int(windowCountRaw) ?? 0,
                    doorCount: 1,
                    manualEntry: true
                )
                #if DEBUG
                PatinaLog.scan.error("[ManualRoomEntry] remote sync failed, created locally only: \(error)")
                #endif
            }
            coordinator.goBack()
        }
    }

    private func defaultName(for type: String) -> String {
        switch type {
        case "living":  return "Living Room"
        case "bedroom": return "Bedroom"
        case "office":  return "Office"
        case "dining":  return "Dining Room"
        case "kitchen": return "Kitchen"
        default:        return "Room"
        }
    }

    private var ceilingHeightFeetValue: Double? {
        switch ceilingHeightRaw {
        case "standard": return 8
        case "nine":     return 9
        case "ten":      return 10
        case "vaulted":  return 12
        default:         return nil
        }
    }
}
