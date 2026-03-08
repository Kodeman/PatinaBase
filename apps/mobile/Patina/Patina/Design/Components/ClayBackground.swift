//
//  ClayBackground.swift
//  Patina
//
//  Reusable clay-textured background for the Companion system
//  Uses Patina Clay color (#A3927C) with subtle noise texture
//

import SwiftUI

/// Clay-textured background for Companion button and panel
public struct ClayBackground: View {
    var cornerRadius: CGFloat
    var textureIntensity: Double
    var color: Color

    public init(cornerRadius: CGFloat = 32, textureIntensity: Double = 0.3, color: Color = PatinaColors.clayBeige) {
        self.cornerRadius = cornerRadius
        self.textureIntensity = textureIntensity
        self.color = color
    }

    public var body: some View {
        ZStack {
            // Base color
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(color)

            // Subtle texture overlay
            ClayTextureOverlay(intensity: textureIntensity)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}

/// Circle variant for the floating button
public struct ClayCircleBackground: View {
    var size: CGFloat
    var textureIntensity: Double
    var color: Color

    public init(size: CGFloat = 64, textureIntensity: Double = 0.3, color: Color = PatinaColors.warmWhite) {
        self.size = size
        self.textureIntensity = textureIntensity
        self.color = color
    }

    public var body: some View {
        ZStack {
            Circle()
                .fill(color)

            ClayTextureOverlay(intensity: textureIntensity)
                .clipShape(Circle())
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Clay Texture Overlay

/// Subtle noise texture for clay surfaces
struct ClayTextureOverlay: View {
    let intensity: Double

    var body: some View {
        GeometryReader { geometry in
            Canvas { context, size in
                // Create subtle noise pattern
                let dotCount = Int(size.width * size.height * 0.0015 * intensity)
                for _ in 0..<dotCount {
                    let x = CGFloat.random(in: 0...size.width)
                    let y = CGFloat.random(in: 0...size.height)
                    let alpha = Double.random(in: 0.03...0.10) * intensity

                    // Mix of lighter and darker spots for texture
                    let isDark = Bool.random()
                    let color = isDark
                        ? PatinaColors.mochaBrown.opacity(alpha)
                        : Color.white.opacity(alpha * 0.5)

                    context.fill(
                        Path(ellipseIn: CGRect(x: x, y: y, width: 1.5, height: 1.5)),
                        with: .color(color)
                    )
                }
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Paper Texture Overlay

/// Subtle paper/parchment texture with grain and fiber patterns
struct PaperTextureOverlay: View {
    let intensity: Double

    var body: some View {
        GeometryReader { geometry in
            Canvas { context, size in
                // Paper grain - tiny random dots
                let grainCount = Int(size.width * size.height * 0.002 * intensity)
                for _ in 0..<grainCount {
                    let x = CGFloat.random(in: 0...size.width)
                    let y = CGFloat.random(in: 0...size.height)
                    let alpha = Double.random(in: 0.02...0.06) * intensity

                    // Warm beige tint for paper feel
                    let color = PatinaColors.clayBeige.opacity(alpha)

                    context.fill(
                        Path(ellipseIn: CGRect(x: x, y: y, width: 1, height: 1)),
                        with: .color(color)
                    )
                }

                // Paper fibers - occasional thin lines
                let fiberCount = Int(size.width * 0.05 * intensity)
                for _ in 0..<fiberCount {
                    let x = CGFloat.random(in: 0...size.width)
                    let y = CGFloat.random(in: 0...size.height)
                    let length = CGFloat.random(in: 8...20)
                    let angle = CGFloat.random(in: -0.3...0.3) // Mostly horizontal
                    let alpha = Double.random(in: 0.03...0.08) * intensity

                    var path = Path()
                    path.move(to: CGPoint(x: x, y: y))
                    path.addLine(to: CGPoint(
                        x: x + length * cos(angle),
                        y: y + length * sin(angle)
                    ))

                    context.stroke(
                        path,
                        with: .color(PatinaColors.mochaBrown.opacity(alpha)),
                        lineWidth: 0.5
                    )
                }
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Paper Background

/// Warm white background with paper texture for Companion panel
public struct PaperBackground: View {
    var cornerRadius: CGFloat
    var textureIntensity: Double

    public init(cornerRadius: CGFloat = 24, textureIntensity: Double = 0.4) {
        self.cornerRadius = cornerRadius
        self.textureIntensity = textureIntensity
    }

    public var body: some View {
        ZStack {
            // Base warm white color
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(PatinaColors.warmWhite)

            // Paper texture overlay
            PaperTextureOverlay(intensity: textureIntensity)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}

// MARK: - Preview

#Preview("Clay Background") {
    VStack(spacing: 40) {
        // Circle button
        ClayCircleBackground(size: 64)
            .shadow(color: PatinaColors.mochaBrown.opacity(0.15), radius: 8, y: 4)

        // Rounded panel
        ClayBackground(cornerRadius: 24)
            .frame(width: 300, height: 200)
            .shadow(color: PatinaColors.mochaBrown.opacity(0.15), radius: 12, y: 6)
    }
    .padding(40)
    .background(PatinaColors.Background.primary)
}
