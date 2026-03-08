//
//  HeroPlaceholderView.swift
//  Patina
//
//  Placeholder view for rooms without a hero frame
//

import SwiftUI

/// Displays a placeholder gradient for rooms that haven't been scanned
/// or don't have a hero frame captured
struct HeroPlaceholderView: View {

    let roomName: String
    let timeOfDay: TimeOfDay
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            GeometryReader { geometry in
                ZStack {
                    // Time-aware gradient background
                    LinearGradient(
                        colors: timeOfDay.gradientColors,
                        startPoint: .top,
                        endPoint: .bottom
                    )

                    // Time overlay
                    timeOfDay.overlayGradient

                    // Content
                    VStack(spacing: 16) {
                        // Camera icon
                        Image(systemName: "camera.viewfinder")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(timeOfDay.textColor.opacity(0.6))

                        // Prompt text
                        VStack(spacing: 6) {
                            Text("Capture \(roomName)")
                                .font(.custom("Playfair Display", size: 20))
                                .italic()
                                .foregroundStyle(timeOfDay.textColor)

                            Text("Tap to scan this room")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(timeOfDay.textColor.opacity(0.6))
                        }
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
            }
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: TimeOfDay.transitionDuration), value: timeOfDay)
    }
}

// MARK: - Preview

#Preview("Afternoon") {
    HeroPlaceholderView(
        roomName: "Living Room",
        timeOfDay: .afternoon
    ) {}
    .ignoresSafeArea()
}

#Preview("Night") {
    HeroPlaceholderView(
        roomName: "Bedroom",
        timeOfDay: .night
    ) {}
    .ignoresSafeArea()
}
