//
//  StatsBadgeView.swift
//  Patina
//
//  Saved item count badge for Hero Frame
//

import SwiftUI

/// Displays the saved item count for the current room
struct StatsBadgeView: View {

    let count: Int
    let useGlassStyle: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                // Count value
                Text("\(count)")
                    .font(.custom("Playfair Display", size: 20))
                    .foregroundStyle(useGlassStyle ? Color.white : PatinaColors.charcoal)

                // Label
                Text("saved")
                    .font(.system(size: 8, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(0.5)
                    .foregroundStyle(
                        useGlassStyle
                            ? Color.white.opacity(0.6)
                            : PatinaColors.mochaBrown
                    )
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background {
                if useGlassStyle {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(.ultraThinMaterial)
                        .overlay {
                            RoundedRectangle(cornerRadius: 14)
                                .fill(Color.white.opacity(0.15))
                        }
                } else {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.white.opacity(0.92))
                        .shadow(color: .black.opacity(0.12), radius: 24, x: 0, y: 6)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

struct StatsBadgeView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ZStack {
                Color(hex: "A3927C")
                StatsBadgeView(count: 6, useGlassStyle: false) {}
            }
            .previewDisplayName("Light Style")

            ZStack {
                Color(hex: "3F3B37")
                StatsBadgeView(count: 12, useGlassStyle: true) {}
            }
            .previewDisplayName("Glass Style")
        }
    }
}
