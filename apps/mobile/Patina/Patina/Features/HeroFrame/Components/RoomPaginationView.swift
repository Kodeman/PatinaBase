//
//  RoomPaginationView.swift
//  Patina
//
//  Horizontal pagination dots for multi-room navigation
//

import SwiftUI

/// Displays pagination dots for multi-room carousel
struct RoomPaginationView: View {

    let currentIndex: Int
    let totalCount: Int

    // Dot dimensions
    private let dotSize: CGFloat = 6
    private let activeDotWidth: CGFloat = 20
    private let dotSpacing: CGFloat = 8

    var body: some View {
        // Only show if more than one room
        if totalCount > 1 {
            HStack(spacing: dotSpacing) {
                ForEach(0..<totalCount, id: \.self) { index in
                    Capsule()
                        .fill(index == currentIndex ? Color.white.opacity(0.9) : Color.white.opacity(0.3))
                        .frame(
                            width: index == currentIndex ? activeDotWidth : dotSize,
                            height: dotSize
                        )
                        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: currentIndex)
                }
            }
        }
    }
}

// MARK: - Preview

struct RoomPaginationView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ZStack {
                Color(hex: "3F3B37")
                RoomPaginationView(currentIndex: 0, totalCount: 3)
            }
            .previewDisplayName("3 Rooms - First Selected")

            ZStack {
                Color(hex: "3F3B37")
                RoomPaginationView(currentIndex: 1, totalCount: 3)
            }
            .previewDisplayName("3 Rooms - Middle Selected")

            ZStack {
                Color(hex: "3F3B37")
                RoomPaginationView(currentIndex: 0, totalCount: 1)
            }
            .previewDisplayName("Single Room")
        }
    }
}
