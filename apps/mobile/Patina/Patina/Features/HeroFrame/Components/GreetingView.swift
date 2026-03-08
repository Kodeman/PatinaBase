//
//  GreetingView.swift
//  Patina
//
//  Time-aware greeting with room name for Hero Frame
//

import SwiftUI

/// Displays the time-based greeting and room name
struct GreetingView: View {

    let timeOfDay: TimeOfDay
    let roomName: String

    var body: some View {
        VStack(spacing: 6) {
            // Time-based greeting
            Text(timeOfDay.greeting)
                .font(.custom("Playfair Display", size: 26))
                .italic()
                .foregroundStyle(timeOfDay.textColor)
                .shadow(color: .black.opacity(0.35), radius: 24, x: 0, y: 2)

            // Room name
            Text(roomName.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(1.5)
                .foregroundStyle(Color.white.opacity(0.65))
                .shadow(color: .black.opacity(0.3), radius: 12, x: 0, y: 1)
        }
    }
}

// MARK: - Preview

#Preview("Afternoon") {
    ZStack {
        Color(hex: "3F3B37")
        GreetingView(
            timeOfDay: .afternoon,
            roomName: "Living Room"
        )
    }
}

#Preview("Night") {
    ZStack {
        Color(hex: "1A1816")
        GreetingView(
            timeOfDay: .night,
            roomName: "Bedroom"
        )
    }
}
