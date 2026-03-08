//
//  PulseAnimation.swift
//  Patina
//
//  Pulse animation for companion notifications
//

import SwiftUI

/// Pulsing ring animation for attention
public struct PulseAnimation: View {
    let color: Color
    let isActive: Bool

    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 0.8

    public init(color: Color = PatinaColors.clayBeige, isActive: Bool = true) {
        self.color = color
        self.isActive = isActive
    }

    public var body: some View {
        Circle()
            .stroke(color, lineWidth: 2)
            .scaleEffect(scale)
            .opacity(opacity)
            .onAppear {
                guard isActive else { return }
                startAnimation()
            }
            .onChange(of: isActive) { _, active in
                if active {
                    startAnimation()
                } else {
                    stopAnimation()
                }
            }
    }

    private func startAnimation() {
        withAnimation(
            .easeOut(duration: 1.5)
            .repeatForever(autoreverses: false)
        ) {
            scale = 2.0
            opacity = 0
        }
    }

    private func stopAnimation() {
        withAnimation(.easeOut(duration: 0.3)) {
            scale = 1.0
            opacity = 0
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        PatinaColors.Background.primary
            .ignoresSafeArea()

        VStack(spacing: 40) {
            ZStack {
                PulseAnimation(isActive: true)
                    .frame(width: 40, height: 40)

                Circle()
                    .fill(PatinaColors.clayBeige)
                    .frame(width: 40, height: 40)
            }

            ZStack {
                PulseAnimation(color: PatinaColors.mochaBrown, isActive: true)
                    .frame(width: 60, height: 60)

                StrataMarkView(color: PatinaColors.mochaBrown)
            }
        }
    }
}
