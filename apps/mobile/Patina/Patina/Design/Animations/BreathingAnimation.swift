//
//  BreathingAnimation.swift
//  Patina
//
//  Breathing animation modifier for subtle life-like motion
//

import SwiftUI

/// Breathing animation modifier
public struct BreathingModifier: ViewModifier {
    let minScale: CGFloat
    let maxScale: CGFloat
    let duration: Double
    let isActive: Bool

    @State private var scale: CGFloat = 1.0

    public init(
        minScale: CGFloat = 1.0,
        maxScale: CGFloat = 1.05,
        duration: Double = 2.0,
        isActive: Bool = true
    ) {
        self.minScale = minScale
        self.maxScale = maxScale
        self.duration = duration
        self.isActive = isActive
    }

    public func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .onAppear {
                guard isActive else { return }
                startBreathing()
            }
            .onChange(of: isActive) { _, active in
                if active {
                    startBreathing()
                } else {
                    stopBreathing()
                }
            }
    }

    private func startBreathing() {
        scale = minScale
        withAnimation(
            .easeInOut(duration: duration)
            .repeatForever(autoreverses: true)
        ) {
            scale = maxScale
        }
    }

    private func stopBreathing() {
        withAnimation(.easeOut(duration: 0.3)) {
            scale = 1.0
        }
    }
}

// MARK: - View Extension

extension View {
    /// Add breathing animation
    public func breathing(
        minScale: CGFloat = 1.0,
        maxScale: CGFloat = 1.05,
        duration: Double = 2.0,
        isActive: Bool = true
    ) -> some View {
        modifier(BreathingModifier(
            minScale: minScale,
            maxScale: maxScale,
            duration: duration,
            isActive: isActive
        ))
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        Circle()
            .fill(PatinaColors.clayBeige)
            .frame(width: 60, height: 60)
            .breathing()

        StrataMarkView(color: PatinaColors.mochaBrown, scale: 1.5)
            .breathing(maxScale: 1.08, duration: 2.5)
    }
    .padding(40)
    .background(PatinaColors.Background.primary)
}
