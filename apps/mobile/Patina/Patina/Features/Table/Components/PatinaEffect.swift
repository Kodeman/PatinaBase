//
//  PatinaEffect.swift
//  Patina
//
//  Visual patina aging effect system
//

import SwiftUI

// MARK: - Patina Level

/// Represents different levels of patina aging
public enum PatinaLevel: Int, CaseIterable {
    case fresh = 0      // Just added
    case new = 1        // 1-3 days
    case developing = 2 // 4-7 days
    case aged = 3       // 8-14 days
    case vintage = 4    // 15-29 days
    case antique = 5    // 30+ days

    /// Initialize from days since saved
    public init(days: Int) {
        switch days {
        case 0:
            self = .fresh
        case 1...3:
            self = .new
        case 4...7:
            self = .developing
        case 8...14:
            self = .aged
        case 15...29:
            self = .vintage
        default:
            self = .antique
        }
    }

    /// Initialize from patina value (0-1)
    public init(value: Double) {
        let days = Int(value * 30)
        self.init(days: days)
    }

    /// Display name for the patina level
    public var displayName: String {
        switch self {
        case .fresh: return "Fresh"
        case .new: return "New"
        case .developing: return "Developing"
        case .aged: return "Aged"
        case .vintage: return "Vintage"
        case .antique: return "Antique"
        }
    }

    /// Color tint for this patina level
    public var tintColor: Color {
        switch self {
        case .fresh:
            return .clear
        case .new:
            return Color.brown.opacity(0.05)
        case .developing:
            return Color.brown.opacity(0.1)
        case .aged:
            return Color(red: 0.6, green: 0.5, blue: 0.4).opacity(0.15)
        case .vintage:
            return Color(red: 0.5, green: 0.45, blue: 0.35).opacity(0.2)
        case .antique:
            return Color(red: 0.45, green: 0.4, blue: 0.3).opacity(0.25)
        }
    }

    /// Border/frame color
    public var borderColor: Color {
        switch self {
        case .fresh:
            return PatinaColors.charcoal.opacity(0.1)
        case .new:
            return PatinaColors.charcoal.opacity(0.15)
        case .developing:
            return PatinaColors.clayBeige.opacity(0.4)
        case .aged:
            return PatinaColors.clayBeige.opacity(0.6)
        case .vintage:
            return PatinaColors.mochaBrown.opacity(0.5)
        case .antique:
            return PatinaColors.mochaBrown.opacity(0.7)
        }
    }

    /// Shadow intensity
    public var shadowOpacity: Double {
        switch self {
        case .fresh: return 0.1
        case .new: return 0.12
        case .developing: return 0.15
        case .aged: return 0.18
        case .vintage: return 0.2
        case .antique: return 0.25
        }
    }

    /// Corner rounding (ages items get softer corners)
    public var cornerRadius: CGFloat {
        switch self {
        case .fresh: return 8
        case .new: return 10
        case .developing: return 12
        case .aged: return 14
        case .vintage: return 16
        case .antique: return 18
        }
    }
}

// MARK: - Patina Effect Modifier

/// View modifier that applies patina aging effect
public struct PatinaEffectModifier: ViewModifier {

    let level: PatinaLevel
    let animated: Bool

    @State private var isAnimating = false

    public init(level: PatinaLevel, animated: Bool = true) {
        self.level = level
        self.animated = animated
    }

    public func body(content: Content) -> some View {
        content
            .overlay {
                // Patina tint overlay
                RoundedRectangle(cornerRadius: level.cornerRadius)
                    .fill(level.tintColor)
                    .allowsHitTesting(false)
            }
            .overlay {
                // Vintage texture for aged items
                if level.rawValue >= PatinaLevel.aged.rawValue {
                    PatinaTextureOverlay(intensity: Double(level.rawValue) / 5.0)
                        .clipShape(RoundedRectangle(cornerRadius: level.cornerRadius))
                        .allowsHitTesting(false)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: level.cornerRadius))
            .overlay {
                // Border that develops over time
                RoundedRectangle(cornerRadius: level.cornerRadius)
                    .strokeBorder(level.borderColor, lineWidth: borderWidth)
            }
            .shadow(
                color: .black.opacity(level.shadowOpacity),
                radius: shadowRadius,
                x: 0,
                y: shadowOffset
            )
            .scaleEffect(isAnimating ? 1.02 : 1.0)
            .onAppear {
                if animated && level == .antique {
                    withAnimation(
                        .easeInOut(duration: 3)
                        .repeatForever(autoreverses: true)
                    ) {
                        isAnimating = true
                    }
                }
            }
    }

    private var borderWidth: CGFloat {
        switch level {
        case .fresh, .new: return 1
        case .developing, .aged: return 1.5
        case .vintage, .antique: return 2
        }
    }

    private var shadowRadius: CGFloat {
        CGFloat(4 + level.rawValue * 2)
    }

    private var shadowOffset: CGFloat {
        CGFloat(2 + level.rawValue)
    }
}

// MARK: - Patina Texture Overlay

/// Subtle texture overlay for aged items
struct PatinaTextureOverlay: View {
    let intensity: Double

    var body: some View {
        GeometryReader { geometry in
            Canvas { context, size in
                // Create subtle noise pattern
                for _ in 0..<Int(size.width * size.height * 0.001 * intensity) {
                    let x = CGFloat.random(in: 0...size.width)
                    let y = CGFloat.random(in: 0...size.height)
                    let alpha = Double.random(in: 0.02...0.08) * intensity

                    context.fill(
                        Path(ellipseIn: CGRect(x: x, y: y, width: 2, height: 2)),
                        with: .color(.brown.opacity(alpha))
                    )
                }
            }
        }
    }
}

// MARK: - Patina Badge

/// A small badge showing the patina level
public struct PatinaBadge: View {
    let level: PatinaLevel

    public init(level: PatinaLevel) {
        self.level = level
    }

    public var body: some View {
        HStack(spacing: PatinaSpacing.xxxs) {
            Image(systemName: iconName)
                .font(.system(size: 10))

            Text(level.displayName)
                .font(PatinaTypography.caption)
        }
        .padding(.horizontal, PatinaSpacing.xs)
        .padding(.vertical, PatinaSpacing.xxxs)
        .background(backgroundColor)
        .foregroundStyle(foregroundColor)
        .clipShape(Capsule())
    }

    private var iconName: String {
        switch level {
        case .fresh: return "sparkle"
        case .new: return "leaf"
        case .developing: return "leaf.fill"
        case .aged: return "clock"
        case .vintage: return "clock.fill"
        case .antique: return "crown"
        }
    }

    private var backgroundColor: Color {
        switch level {
        case .fresh:
            return PatinaColors.offWhite
        case .new, .developing:
            return PatinaColors.clayBeige.opacity(0.3)
        case .aged, .vintage:
            return PatinaColors.clayBeige.opacity(0.5)
        case .antique:
            return PatinaColors.mochaBrown.opacity(0.3)
        }
    }

    private var foregroundColor: Color {
        switch level {
        case .fresh, .new, .developing:
            return PatinaColors.charcoal
        case .aged, .vintage, .antique:
            return PatinaColors.mochaBrown
        }
    }
}

// MARK: - View Extension

extension View {
    /// Apply patina aging effect based on level
    public func patinaEffect(level: PatinaLevel, animated: Bool = true) -> some View {
        modifier(PatinaEffectModifier(level: level, animated: animated))
    }

    /// Apply patina aging effect based on days
    public func patinaEffect(days: Int, animated: Bool = true) -> some View {
        modifier(PatinaEffectModifier(level: PatinaLevel(days: days), animated: animated))
    }

    /// Apply patina aging effect based on value (0-1)
    public func patinaEffect(value: Double, animated: Bool = true) -> some View {
        modifier(PatinaEffectModifier(level: PatinaLevel(value: value), animated: animated))
    }
}
