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

    /// A token's resolved sRGB value in one appearance.
    struct Channels {
        let red: CGFloat
        let green: CGFloat
        let blue: CGFloat
        let alpha: CGFloat

        func differs(from other: Channels, by tolerance: CGFloat = 0.001) -> Bool {
            abs(red - other.red) > tolerance
                || abs(green - other.green) > tolerance
                || abs(blue - other.blue) > tolerance
        }
    }

    /// The two appearances every token assertion runs in.
    static let appearances: [UIUserInterfaceStyle] = [.light, .dark]

    static func name(_ style: UIUserInterfaceStyle) -> String {
        style == .dark ? "dark" : "light"
    }

    /// The token's actual sRGB components in one appearance.
    static func components(
        _ color: Color,
        _ style: UIUserInterfaceStyle
    ) -> Channels {
        let resolved = UIColor(color).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: style)
        )
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return Channels(red: red, green: green, blue: blue, alpha: alpha)
    }

    /// WCAG relative luminance.
    static func luminance(_ color: Color, _ style: UIUserInterfaceStyle) -> Double {
        let channels = components(color, style)
        func linear(_ value: CGFloat) -> Double {
            let value = Double(max(0, min(1, value)))
            return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(channels.red)
            + 0.7152 * linear(channels.green)
            + 0.0722 * linear(channels.blue)
    }

    /// WCAG contrast ratio between two tokens resolved in the same appearance.
    static func ratio(
        _ ink: Color,
        on ground: Color,
        _ style: UIUserInterfaceStyle
    ) -> Double {
        let inkLuminance = luminance(ink, style)
        let groundLuminance = luminance(ground, style)
        return (max(inkLuminance, groundLuminance) + 0.05)
            / (min(inkLuminance, groundLuminance) + 0.05)
    }

    /// Ratio for a token drawn at partial opacity over a known ground — the
    /// shape `C-02` is made of (`Text.inverse.opacity(0.72)` over the panel).
    static func ratio(
        _ ink: Color,
        opacity: Double,
        on ground: Color,
        _ style: UIUserInterfaceStyle
    ) -> Double {
        let foreground = components(ink, style)
        let background = components(ground, style)
        func blend(_ over: CGFloat, _ under: CGFloat) -> Double {
            Double(over) * opacity + Double(under) * (1 - opacity)
        }
        let composited = Color(
            .sRGB,
            red: blend(foreground.red, background.red),
            green: blend(foreground.green, background.green),
            blue: blend(foreground.blue, background.blue),
            opacity: 1
        )
        return ratio(composited, on: ground, style)
    }

    /// True when the token resolves to a different value in the two
    /// appearances — the definition of "adaptive" every dark-mode finding in
    /// this lane turns on.
    static func isAdaptive(_ color: Color) -> Bool {
        components(color, .light).differs(from: components(color, .dark))
    }

    /// Rounded to two places, for failure messages that can be pasted into a
    /// finding without re-deriving them.
    static func rounded(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
}
