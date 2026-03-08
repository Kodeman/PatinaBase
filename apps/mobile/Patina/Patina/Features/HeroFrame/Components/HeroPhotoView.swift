//
//  HeroPhotoView.swift
//  Patina
//
//  Full-bleed hero frame photo with time-based overlay
//

import SwiftUI

/// Displays the hero frame photo with time-of-day color grading
struct HeroPhotoView: View {

    let imageData: Data?
    let timeOfDay: TimeOfDay

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Photo or placeholder
                if let data = imageData, let uiImage = UIImage(data: data) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .clipped()
                } else {
                    // Fallback gradient when no image
                    LinearGradient(
                        colors: timeOfDay.gradientColors,
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }

                // Time-based overlay
                timeOfDay.overlayGradient
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .animation(.easeInOut(duration: TimeOfDay.transitionDuration), value: timeOfDay)
    }
}

// MARK: - Preview

#Preview("With Image - Afternoon") {
    HeroPhotoView(
        imageData: nil,
        timeOfDay: .afternoon
    )
    .ignoresSafeArea()
}

#Preview("With Image - Evening") {
    HeroPhotoView(
        imageData: nil,
        timeOfDay: .evening
    )
    .ignoresSafeArea()
}

#Preview("With Image - Night") {
    HeroPhotoView(
        imageData: nil,
        timeOfDay: .night
    )
    .ignoresSafeArea()
}
