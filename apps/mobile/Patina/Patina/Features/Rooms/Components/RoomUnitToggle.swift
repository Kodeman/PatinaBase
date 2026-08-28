//
//  RoomUnitToggle.swift
//  Patina
//
//  SP-19's segmented ft/m control, on the room's own screens.
//
//  The shape is `ScanFallbackEntryView.unitToggle`'s, which W1b built to
//  replace two bare 12 × 13 pt / 6 × 13 pt text buttons whose only feedback
//  was a colour change. That view belongs to another lane's file set, so the
//  control is stated once here rather than reached across for.
//
//  The unit is NEVER persisted. It used to be written to device defaults and
//  restored on appear, so a session that once tapped "m" silently opened in
//  metres months later and an 18 × 14 room became 59' × 46' (F40). Every
//  visit starts in feet, visibly — and a room measured through this control
//  is the only room the fit line will draw for.
//

import SwiftUI

enum RoomUnit: String, CaseIterable, Identifiable {
    case feet = "ft"
    case metres = "m"

    var id: String { rawValue }

    var label: String { self == .feet ? "Feet" : "Metres" }

    /// The model stores metres; the screen offers both.
    func metres(from value: Double) -> Double {
        self == .feet ? value / 3.28084 : value
    }

    /// The inverse, for showing a stored room back to the person.
    func value(fromMetres metres: Double) -> Double {
        self == .feet ? metres * 3.28084 : metres
    }
}

struct RoomUnitToggle: View {
    @Binding var unit: RoomUnit

    var body: some View {
        Picker("Units", selection: $unit) {
            ForEach(RoomUnit.allCases) { option in
                Text(option.rawValue).tag(option)
            }
        }
        .pickerStyle(.segmented)
        .frame(width: 104)
        .accessibilityLabel("Units")
        .accessibilityValue(unit.label)
        .accessibilityIdentifier("RoomUnitToggle")
    }
}
