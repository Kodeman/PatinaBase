//
//  RoomFitLine.swift
//  Patina
//
//  "Your Living Room's longest wall is 18 ft. This table is 7 ft."
//  (B §5 item 4, M3 block 8.)
//
//  Two numbers and a full stop. The line never says the piece fits, never says
//  it does not, and never carries a verdict of any kind — the reader does the
//  arithmetic, because the app is not in a position to know what else is in
//  the room (C5).
//
//  It draws for a room whose dimensions were typed against SP-19's segmented
//  unit control, and for no other room. Before that control landed, the ft/m
//  toggle silently persisted its unit and two of three walks left with a
//  2,713 sq ft living room (F40) — and a wrong fit line on a made-to-order
//  table is worse than none. Every room that existed before the control
//  carries `measuredWithUnitControl == false` by default, so those rooms are
//  silent until their owner re-types the numbers.
//

import SwiftUI

struct RoomFitLine: Equatable {

    let text: String

    static func make(room: RoomModel, product: Product) -> RoomFitLine? {
        guard room.measuredWithUnitControl else { return nil }
        guard let wall = longestWallFeet(of: room) else { return nil }
        guard let piece = longestHorizontalFeet(of: product.dimensions) else { return nil }
        return RoomFitLine(
            text: "Your \(room.name)'s longest wall is \(feet(wall)). "
                + "This \(noun(for: product.category)) is \(feet(piece))."
        )
    }

    /// The longer of the two floor axes, in feet. The model stores metres.
    static func longestWallFeet(of room: RoomModel) -> Double? {
        let axes = [room.width, room.length].compactMap { $0 }.filter { $0 > 0 }
        guard let longest = axes.max() else { return nil }
        return longest * 3.28084
    }

    /// The piece's longest footprint axis, in feet. Height is not a wall
    /// measurement and is not considered.
    static func longestHorizontalFeet(of dimensions: ProductDimensions?) -> Double? {
        guard let dimensions else { return nil }
        let axes = [dimensions.width, dimensions.depth].compactMap { $0 }.filter { $0 > 0 }
        guard let longest = axes.max() else { return nil }
        guard let inFeet = feetPerUnit(dimensions.unit) else { return nil }
        return longest * inFeet
    }

    /// `products.dimensions.unit` as the row spells it. Inches are the default
    /// the schema has always assumed; a unit the app cannot convert produces
    /// no line rather than a wrong one.
    static func feetPerUnit(_ unit: String?) -> Double? {
        switch unit?.lowercased() {
        case "in", "inch", "inches", nil: return 1.0 / 12.0
        case "ft", "foot", "feet":        return 1
        case "cm", "centimeter", "centimetre", "centimeters", "centimetres": return 0.0328084
        case "m", "meter", "metre", "meters", "metres": return 3.28084
        case "mm", "millimeter", "millimetre", "millimeters", "millimetres": return 0.00328084
        default: return nil
        }
    }

    /// `18 ft` — whole feet where the number is whole, one decimal otherwise.
    static func feet(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        return rounded == rounded.rounded()
            ? "\(Int(rounded)) ft"
            : String(format: "%.1f ft", rounded)
    }

    /// The category's own word where it has one a person would use, and
    /// "piece" everywhere else. The app does not invent a noun for a row.
    static func noun(for category: ProductCategory) -> String {
        category == .tables ? "table" : "piece"
    }
}

struct RoomFitLineView: View {
    let line: RoomFitLine

    var body: some View {
        Text(line.text)
            .font(PatinaTypography.caption)
            .foregroundStyle(PatinaColors.Text.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("RoomFitLine")
    }
}
