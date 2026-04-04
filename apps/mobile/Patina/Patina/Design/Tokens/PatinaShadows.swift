//
//  PatinaShadows.swift
//  Patina
//
//  Patina Design System - Shadows
//

import SwiftUI

/// Patina Design System - Shadows
public enum PatinaShadows {

    public static let sm = Shadow(
        color: Color(hex: "5C4A3C").opacity(0.06),
        radius: 4,
        x: 0,
        y: 2
    )

    public static let md = Shadow(
        color: Color(hex: "5C4A3C").opacity(0.08),
        radius: 8,
        x: 0,
        y: 4
    )

    public static let lg = Shadow(
        color: Color(hex: "5C4A3C").opacity(0.12),
        radius: 16,
        x: 0,
        y: 8
    )

    public static let xl = Shadow(
        color: Color(hex: "5C4A3C").opacity(0.16),
        radius: 32,
        x: 0,
        y: 16
    )

    /// The Companion's signature shadow
    public static let companion = Shadow(
        color: Color(hex: "5C4A3C").opacity(0.20),
        radius: 12,
        x: 0,
        y: 4
    )

    public struct Shadow {
        let color: Color
        let radius: CGFloat
        let x: CGFloat
        let y: CGFloat
    }
}

// MARK: - View Extension for Shadows

extension View {
    public func patinaShadow(_ shadow: PatinaShadows.Shadow) -> some View {
        self.shadow(
            color: shadow.color,
            radius: shadow.radius,
            x: shadow.x,
            y: shadow.y
        )
    }
}
