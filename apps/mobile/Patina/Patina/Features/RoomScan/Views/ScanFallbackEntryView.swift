//
//  ScanFallbackEntryView.swift
//  Patina
//
//  Screen 18: Non-LiDAR fallback. Manual room entry for devices without LiDAR.
//  On submit, routes straight into Q1 of the Style Conversation with the
//  same identical flow as the LiDAR path.
//
//  Per PRD §4.10.
//
//  Named `ScanFallbackEntryView` to avoid collision with the existing
//  Features/Rooms/Views/ManualRoomEntryView.swift (which is used for room
//  creation from the Rooms tab and does NOT continue into the Conversation).
//

import SwiftUI

struct ScanFallbackEntryView: View {

    let userId: String
    let onContinue: (RoomScanSession) -> Void

    @State private var selectedType: String = "living"
    @State private var length: String = "18"
    @State private var width: String = "14"
    @State private var windowCount: Int = 2
    @State private var doorCount: Int = 1
    @State private var unit: Unit = .feet

    enum Unit: String { case feet = "ft", meters = "m" }

    private let unitKey = "patina.scan.manual_entry.unit"

    @Namespace private var whisperNamespace

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ConversationHeaderView(
                    whisperTop: "Tell us about your space",
                    question: "What kind of room?",
                    whisperGeometryNamespace: whisperNamespace
                )
                .padding(.bottom, 24)

                roomTypeGrid
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)

                sectionLabel("Room Dimensions")

                dimensionsRow
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)

                sectionLabel("Windows & Doors")

                featureCounts
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)

                StyleContinueButton(
                    title: "Continue to Style Discovery",
                    isEnabled: isValid,
                    action: submit
                )
                .padding(.horizontal, 24)
                .padding(.bottom, 42)
            }
        }
        .background(PatinaColors.offWhite.ignoresSafeArea())
        .onAppear {
            if let saved = UserDefaults.standard.string(forKey: unitKey),
               let parsed = Unit(rawValue: saved) {
                unit = parsed
            }
            ScanAnalytics.shared.track(.manualEntryStarted)
        }
    }

    // MARK: - Room type grid

    private let roomTypes: [(String, String, String)] = [
        ("living", "Living", "🛋"),
        ("bedroom", "Bedroom", "🛏"),
        ("dining", "Dining", "🍽"),
        ("office", "Office", "💻"),
        ("kitchen", "Kitchen", "🍳"),
        ("other", "Other", "✨")
    ]

    private var roomTypeGrid: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(roomTypes, id: \.0) { id, label, emoji in
                Button(action: { selectedType = id }) {
                    VStack(spacing: 6) {
                        Text(emoji).font(.system(size: 20))
                        Text(label)
                            .font(PatinaTypography.caption)
                    }
                    .foregroundStyle(selectedType == id ? PatinaColors.offWhite : PatinaColors.charcoal)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(selectedType == id ? PatinaColors.charcoal : PatinaColors.softCream)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                selectedType == id ? PatinaColors.charcoal : PatinaColors.pearl,
                                lineWidth: 1.5
                            )
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Section label

    private func sectionLabel(_ text: String) -> some View {
        HStack {
            Text(text)
                .font(PatinaTypography.mono)
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.interactive)
            Spacer()
            if text == "Room Dimensions" {
                unitToggle
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
    }

    private var unitToggle: some View {
        HStack(spacing: 4) {
            Button(action: {
                unit = .feet
                UserDefaults.standard.set(unit.rawValue, forKey: unitKey)
            }) {
                Text("ft")
                    .font(PatinaTypography.mono)
                    .foregroundStyle(unit == .feet ? PatinaColors.charcoal : PatinaColors.agedOak)
            }
            .buttonStyle(.plain)
            Text("/")
                .font(PatinaTypography.mono)
                .foregroundStyle(PatinaColors.agedOak)
            Button(action: {
                unit = .meters
                UserDefaults.standard.set(unit.rawValue, forKey: unitKey)
            }) {
                Text("m")
                    .font(PatinaTypography.mono)
                    .foregroundStyle(unit == .meters ? PatinaColors.charcoal : PatinaColors.agedOak)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Dimension inputs

    private var dimensionsRow: some View {
        HStack(spacing: 12) {
            dimensionField(title: "Length", text: $length)
            dimensionField(title: "Width", text: $width)
        }
    }

    private func dimensionField(title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("", text: text)
                .keyboardType(.decimalPad)
                .font(.custom("Inter-Regular", size: 15, relativeTo: .subheadline))
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(PatinaColors.softCream)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            Float(text.wrappedValue) != nil ? PatinaColors.clay : PatinaColors.pearl,
                            lineWidth: 1.5
                        )
                )
            Text(title.uppercased())
                .font(PatinaTypography.monoSmall)
                .tracking(0.4)
                .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Feature counts

    private var featureCounts: some View {
        HStack(spacing: 12) {
            stepper(title: "Windows", value: $windowCount)
            stepper(title: "Doors", value: $doorCount)
        }
    }

    private func stepper(title: String, value: Binding<Int>) -> some View {
        HStack {
            Text(title)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.charcoal)
            Spacer()
            Button(action: { if value.wrappedValue > 0 { value.wrappedValue -= 1 } }) {
                Image(systemName: "minus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(PatinaColors.charcoal)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(PatinaColors.softCream))
            }
            .buttonStyle(.plain)
            Text("\(value.wrappedValue)")
                .font(.custom("DMMono-Regular", size: 14, relativeTo: .subheadline))
                .foregroundStyle(PatinaColors.charcoal)
                .frame(minWidth: 20)
            Button(action: { value.wrappedValue += 1 }) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(PatinaColors.charcoal)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(PatinaColors.softCream))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(PatinaColors.softCream)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(PatinaColors.pearl, lineWidth: 1.5)
        )
    }

    // MARK: - Validation + submit

    private var isValid: Bool {
        guard let l = Float(length), let w = Float(width), l > 0, w > 0 else { return false }
        return true
    }

    private func submit() {
        guard let l = Float(length), let w = Float(width) else { return }
        let (lengthMeters, widthMeters) = unit == .feet
            ? (l / 3.28084, w / 3.28084)
            : (l, w)
        let area = lengthMeters * widthMeters

        var session = RoomScanSession(
            userId: userId,
            scanMethod: .manual,
            hasLidar: false
        )
        session.dimensions = ScanRoomDimensions(
            length: lengthMeters,
            width: widthMeters,
            height: nil,
            area: area
        )
        session.features = ScanRoomFeatures(
            windowCount: windowCount,
            doorCount: doorCount,
            hasFireplace: false,
            roomType: selectedType
        )
        session.scanProgress = 1.0
        session.scanQuality = 0.7 // manual entry is "fair"
        session.completedAt = Date()

        ScanAnalytics.shared.track(.manualEntryCompleted(roomType: selectedType))
        onContinue(session)
    }
}
