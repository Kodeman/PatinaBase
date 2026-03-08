//
//  WalkProgressIndicator.swift
//  Patina
//
//  Progress indicator for Walk room scanning
//

import SwiftUI

/// Visual progress indicator for the Walk experience
struct WalkProgressIndicator: View {

    let current: Int
    let total: Int
    let roomName: String

    var body: some View {
        VStack(spacing: PatinaSpacing.sm) {
            // Room name
            Text(roomName)
                .font(PatinaTypography.caption)
                .foregroundStyle(.white.opacity(0.7))
                .textCase(.uppercase)
                .tracking(1.5)

            // Progress dots
            HStack(spacing: 8) {
                ForEach(0..<total, id: \.self) { index in
                    Circle()
                        .fill(index < current ? PatinaColors.clayBeige : .white.opacity(0.3))
                        .frame(width: 8, height: 8)
                        .scaleEffect(index == current - 1 ? 1.2 : 1.0)
                        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: current)
                }
            }

            // Progress text
            Text("\(current) of \(total) areas")
                .font(PatinaTypography.caption)
                .foregroundStyle(.white.opacity(0.5))
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.vertical, PatinaSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial.opacity(0.5))
        )
    }
}

// MARK: - Minimal Variant

/// A minimal progress bar variant
struct WalkProgressBar: View {

    let progress: Double

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Track
                Capsule()
                    .fill(.white.opacity(0.2))

                // Fill
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [PatinaColors.clayBeige, PatinaColors.mochaBrown],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: geometry.size.width * progress)
                    .animation(.spring(response: 0.5, dampingFraction: 0.8), value: progress)
            }
        }
        .frame(height: 4)
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.black.opacity(0.8)
            .ignoresSafeArea()

        VStack(spacing: 40) {
            WalkProgressIndicator(
                current: 2,
                total: 5,
                roomName: "Living Room"
            )

            WalkProgressIndicator(
                current: 4,
                total: 5,
                roomName: "Living Room"
            )

            WalkProgressBar(progress: 0.4)
                .padding(.horizontal, 40)

            WalkProgressBar(progress: 0.8)
                .padding(.horizontal, 40)
        }
    }
}
