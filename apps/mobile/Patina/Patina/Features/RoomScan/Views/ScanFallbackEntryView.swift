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

    enum Unit: String, CaseIterable, Identifiable {
        case feet = "ft", meters = "m"
        var id: String { rawValue }
        var label: String { self == .feet ? "Feet" : "Metres" }
    }

    /// SP-19: the unit is NOT persisted. It used to be written to
    /// device defaults and restored on appear, so a session that once tapped
    /// "m" silently opened in metres months later and an 18×14 room became
    /// 59'×46' (F40). Every visit starts in feet, visibly.
    static func metres(from value: Float, unit: Unit) -> Float {
        unit == .feet ? value / 3.28084 : value
    }

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
        .background(PatinaColors.Background.primary.ignoresSafeArea())
        .onAppear {
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
                    .foregroundStyle(selectedType == id ? PatinaColors.Text.inverse : PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(selectedType == id ? PatinaColors.Interactive.active : PatinaColors.Background.secondary)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                selectedType == id ? PatinaColors.Interactive.active : PatinaColors.Border.strong,
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

    /// SP-19: was two bare `Text` buttons measuring 12×13 and 6×13 whose only
    /// activation feedback was a muted→primary colour change. A segmented
    /// control shows its own state and carries a real target.
    private var unitToggle: some View {
        Picker("Units", selection: $unit) {
            ForEach(Unit.allCases) { option in
                Text(option.rawValue).tag(option)
            }
        }
        .pickerStyle(.segmented)
        .frame(width: 104)
        .accessibilityLabel("Units")
        .accessibilityValue(unit.label)
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
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(PatinaColors.Background.secondary)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            Float(text.wrappedValue) != nil ? PatinaColors.clay : PatinaColors.Border.strong,
                            lineWidth: 1.5
                        )
                )
            // SP-19: the field said nothing about its unit, so the toggle was
            // the only place the answer lived.
            Text("\(title.uppercased()) (\(unit.rawValue))")
                .font(PatinaTypography.monoSmall)
                .tracking(0.4)
                .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Feature counts

    private var featureCounts: some View {
        // Wave 1 E.1: full-width rows, not side-by-side columns. At half
        // the screen width the row's title got squeezed by the −/count/+
        // cluster and wrapped mid-word ("Win dow s"). Stacking gives each
        // stepper the full line — a layout fix, not a font shrink.
        VStack(spacing: 12) {
            stepper(title: "Windows", value: $windowCount)
            stepper(title: "Doors", value: $doorCount)
        }
    }

    private func stepper(title: String, value: Binding<Int>) -> some View {
        HStack {
            Text(title)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.primary)
                // Belt-and-braces: even under extreme Dynamic Type the title
                // truncates as a word instead of breaking mid-word.
                .lineLimit(1)
                .layoutPriority(1)
            Spacer()
            Button(action: { if value.wrappedValue > 0 { value.wrappedValue -= 1 } }) {
                Image(systemName: "minus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(PatinaColors.Background.secondary))
                    // SP-19: the circle stays 32; the thumb gets 44.
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove one \(title.lowercased())")
            Text("\(value.wrappedValue)")
                .font(.custom("DMMono-Regular", size: 14, relativeTo: .subheadline))
                .foregroundStyle(PatinaColors.Text.primary)
                .frame(minWidth: 20)
            Button(action: { value.wrappedValue += 1 }) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(PatinaColors.Background.secondary))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add one \(title.lowercased())")
        }
        .padding(.horizontal, 16)
        // 44pt targets need the room; 48 clipped them.
        .frame(height: 56)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(PatinaColors.Background.secondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(PatinaColors.Border.strong, lineWidth: 1.5)
        )
    }

    // MARK: - Validation + submit

    private var isValid: Bool {
        guard let l = Float(length), let w = Float(width), l > 0, w > 0 else { return false }
        return true
    }

    private func submit() {
        guard let l = Float(length), let w = Float(width) else { return }
        let lengthMeters = Self.metres(from: l, unit: unit)
        let widthMeters = Self.metres(from: w, unit: unit)
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
