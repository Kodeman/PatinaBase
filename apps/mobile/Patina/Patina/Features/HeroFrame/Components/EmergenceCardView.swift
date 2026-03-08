//
//  EmergenceCardView.swift
//  Patina
//
//  Floating emergence notification card for Hero Frame
//

import SwiftUI

/// Displays an emergence notification card with pulsing indicator
struct EmergenceCardView: View {

    let message: String
    let useGlassStyle: Bool
    let onTap: () -> Void

    @State private var isPulsing = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                // Pulsing indicator
                Circle()
                    .fill(PatinaColors.clayBeige)
                    .frame(width: 12, height: 12)
                    .scaleEffect(isPulsing ? 1.25 : 1.0)
                    .opacity(isPulsing ? 0.5 : 1.0)
                    .animation(
                        .easeInOut(duration: 2.0).repeatForever(autoreverses: true),
                        value: isPulsing
                    )

                // Message text
                Text(message)
                    .font(.system(size: 13))
                    .italic()
                    .foregroundStyle(
                        useGlassStyle
                            ? Color.white.opacity(0.9)
                            : PatinaColors.charcoal
                    )
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Spacer()

                // Arrow
                Image(systemName: "arrow.right")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(
                        useGlassStyle
                            ? Color.white.opacity(0.6)
                            : PatinaColors.clayBeige
                    )
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background {
                if useGlassStyle {
                    RoundedRectangle(cornerRadius: 18)
                        .fill(.ultraThinMaterial)
                        .overlay {
                            RoundedRectangle(cornerRadius: 18)
                                .fill(Color.white.opacity(0.18))
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(Color.white.opacity(0.15), lineWidth: 1)
                        }
                } else {
                    RoundedRectangle(cornerRadius: 18)
                        .fill(Color.white.opacity(0.94))
                        .shadow(color: .black.opacity(0.18), radius: 40, x: 0, y: 10)
                }
            }
        }
        .buttonStyle(.plain)
        .onAppear {
            isPulsing = true
        }
    }
}

// MARK: - Preview

#Preview("Light Style") {
    ZStack {
        Color(hex: "A3927C")
        EmergenceCardView(
            message: "Something surfaced for this room",
            useGlassStyle: false
        ) {}
        .padding(.horizontal, 16)
    }
}

#Preview("Glass Style") {
    ZStack {
        Color(hex: "3F3B37")
        EmergenceCardView(
            message: "Something surfaced for this room",
            useGlassStyle: true
        ) {}
        .padding(.horizontal, 16)
    }
}
