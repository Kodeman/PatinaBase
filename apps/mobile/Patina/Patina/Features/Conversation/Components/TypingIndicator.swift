//
//  TypingIndicator.swift
//  Patina
//
//  Animated typing indicator when Patina is thinking
//

import SwiftUI

/// Animated dots showing Patina is composing a response
struct TypingIndicator: View {
    @State private var animationPhase: Int = 0

    private let dotCount = 3
    private let dotSize: CGFloat = 8
    private let animationDuration: Double = 0.4

    var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            // Patina indicator
            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                // Bubble with dots
                HStack(spacing: 6) {
                    ForEach(0..<dotCount, id: \.self) { index in
                        Circle()
                            .fill(PatinaColors.clayBeige)
                            .frame(width: dotSize, height: dotSize)
                            .scaleEffect(animationPhase == index ? 1.3 : 1.0)
                            .opacity(animationPhase == index ? 1.0 : 0.5)
                    }
                }
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm + 4)
                .background(PatinaColors.offWhite)
                .clipShape(MessageBubbleShape(isFromUser: false))
                .shadow(color: PatinaColors.mochaBrown.opacity(0.08), radius: 4, y: 2)

                // Label
                Text("Patina is thinking...")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.Text.muted)
                    .italic()
                    .padding(.leading, PatinaSpacing.xs)
            }

            Spacer()
        }
        .padding(.horizontal, PatinaSpacing.md)
        .onAppear {
            startAnimation()
        }
    }

    private func startAnimation() {
        Timer.scheduledTimer(withTimeInterval: animationDuration, repeats: true) { _ in
            withAnimation(.easeInOut(duration: animationDuration)) {
                animationPhase = (animationPhase + 1) % dotCount
            }
        }
    }
}

// MARK: - Alternative Wave Style

/// Wave-style typing indicator with smoother animation
struct TypingIndicatorWave: View {
    @State private var isAnimating = false

    private let dotCount = 3
    private let dotSize: CGFloat = 8

    var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                HStack(spacing: 6) {
                    ForEach(0..<dotCount, id: \.self) { index in
                        Circle()
                            .fill(PatinaColors.clayBeige)
                            .frame(width: dotSize, height: dotSize)
                            .offset(y: isAnimating ? -4 : 4)
                            .animation(
                                .easeInOut(duration: 0.5)
                                .repeatForever(autoreverses: true)
                                .delay(Double(index) * 0.15),
                                value: isAnimating
                            )
                    }
                }
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm + 4)
                .background(PatinaColors.offWhite)
                .clipShape(MessageBubbleShape(isFromUser: false))
                .shadow(color: PatinaColors.mochaBrown.opacity(0.08), radius: 4, y: 2)

                Text("Patina is thinking...")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.Text.muted)
                    .italic()
                    .padding(.leading, PatinaSpacing.xs)
            }

            Spacer()
        }
        .padding(.horizontal, PatinaSpacing.md)
        .onAppear {
            isAnimating = true
        }
    }
}

// MARK: - Breathing Style

/// Subtle breathing animation for a calmer feel
struct TypingIndicatorBreathing: View {
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 0.6

    var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { _ in
                        Circle()
                            .fill(PatinaColors.clayBeige)
                            .frame(width: 8, height: 8)
                    }
                }
                .scaleEffect(scale)
                .opacity(opacity)
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm + 4)
                .background(PatinaColors.offWhite)
                .clipShape(MessageBubbleShape(isFromUser: false))
                .shadow(color: PatinaColors.mochaBrown.opacity(0.08), radius: 4, y: 2)

                Text("Patina is thinking...")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.Text.muted)
                    .italic()
                    .padding(.leading, PatinaSpacing.xs)
            }

            Spacer()
        }
        .padding(.horizontal, PatinaSpacing.md)
        .onAppear {
            withAnimation(
                .easeInOut(duration: 1.5)
                .repeatForever(autoreverses: true)
            ) {
                scale = 1.1
                opacity = 1.0
            }
        }
    }
}

// MARK: - Preview

#Preview("Standard") {
    VStack {
        TypingIndicator()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(PatinaColors.Background.primary)
}

#Preview("Wave") {
    VStack {
        TypingIndicatorWave()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(PatinaColors.Background.primary)
}

#Preview("Breathing") {
    VStack {
        TypingIndicatorBreathing()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(PatinaColors.Background.primary)
}
