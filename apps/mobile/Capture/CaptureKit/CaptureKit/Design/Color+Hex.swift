//  Color+Hex.swift
//  CaptureKit

import SwiftUI

public extension Color {
    /// 0xRRGGBB initializer for the field-instrument palette.
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
