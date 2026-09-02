//
//  PatinaContrast.swift
//  PatinaTests
//
//  The instrument the token suites measure with.
//
//  A Patina semantic token is a `Color` built over a trait-aware `UIColor`
//  provider, so its value is a function of the appearance it is resolved in —
//  which is exactly the property the dark-mode findings are about. Reading the
//  hex literal out of the source would measure the wrong thing (and would go
//  green the day a literal moved). This resolves the real token against a real
//  `UITraitCollection` and computes WCAG 2.x relative luminance from the
//  resolved sRGB components.
//

import Foundation
import SwiftUI
import UIKit

enum PatinaContrast {

    /// The two appearances every token assertion runs in.
    static let appearances: [UIUserInterfaceStyle] = [.light, .dark]

    static func name(_ style: UIUserInterfaceStyle) -> String {
        style == .dark ? "dark" : "light"
    }

    /// The token's actual sRGB components in one appearance.
    static func components(
        _ color: Color,
        _ style: UIUserInterfaceStyle
    ) -> (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) {
        let resolved = UIColor(color).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: style)
        )
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }

    /// WCAG relative luminance.
    static func luminance(_ color: Color, _ style: UIUserInterfaceStyle) -> Double {
        let c = components(color, style)
        func channel(_ v: CGFloat) -> Double {
            let v = Double(max(0, min(1, v)))
            return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
    }

    /// WCAG contrast ratio between two tokens resolved in the same appearance.
    static func ratio(
        _ a: Color,
        on b: Color,
        _ style: UIUserInterfaceStyle
    ) -> Double {
        let la = luminance(a, style)
        let lb = luminance(b, style)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /// Ratio for a token drawn at partial opacity over a known ground — the
    /// shape `C-02` is made of (`Text.inverse.opacity(0.72)` over the panel).
    static func ratio(
        _ a: Color,
        opacity: Double,
        on b: Color,
        _ style: UIUserInterfaceStyle
    ) -> Double {
        let fg = components(a, style)
        let bg = components(b, style)
        let composited = Color(
            .sRGB,
            red: Double(fg.r) * opacity + Double(bg.r) * (1 - opacity),
            green: Double(fg.g) * opacity + Double(bg.g) * (1 - opacity),
            blue: Double(fg.b) * opacity + Double(bg.b) * (1 - opacity),
            opacity: 1
        )
        return ratio(composited, on: b, style)
    }

    /// True when the token resolves to a different value in the two
    /// appearances — the definition of "adaptive" every dark-mode finding in
    /// this lane turns on.
    static func isAdaptive(_ color: Color) -> Bool {
        let light = components(color, .light)
        let dark = components(color, .dark)
        return abs(light.r - dark.r) > 0.001
            || abs(light.g - dark.g) > 0.001
            || abs(light.b - dark.b) > 0.001
    }

    /// Rounded to two places, for failure messages that can be pasted into a
    /// finding without re-deriving them.
    static func rounded(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
}
