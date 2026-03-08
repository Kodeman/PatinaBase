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
        color: Color(hex: "655B52").opacity(0.06),
        radius: 4,
        x: 0,
        y: 2
    )

    public static let md = Shadow(
        color: Color(hex: "655B52").opacity(0.08),
        radius: 8,
        x: 0,
        y: 4
    )

    public static let lg = Shadow(
        color: Color(hex: "655B52").opacity(0.12),
        radius: 16,
        x: 0,
        y: 8
    )

    public static let xl = Shadow(
        color: Color(hex: "655B52").opacity(0.16),
        radius: 24,
        x: 0,
        y: 12
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
