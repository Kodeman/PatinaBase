//
//  LivingSceneView.swift
//  Patina
//
//  Animated background scene that shifts with time of day
//

import SwiftUI

/// Animated living scene background for the threshold
public struct LivingSceneView: View {
    let timeOfDay: TimeOfDay

    @State private var animationOffset: CGFloat = 0
    @State private var imageLoaded = false

    // Unsplash image - warm interior living room scene
    private let backgroundImageURL = "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&q=80"

    public init(timeOfDay: TimeOfDay) {
        self.timeOfDay = timeOfDay
    }

    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background gradient (fallback and overlay)
                LinearGradient(
                    colors: timeOfDay.gradientColors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                // Unsplash background image
                AsyncImage(url: URL(string: backgroundImageURL)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .clipped()
                            .opacity(imageLoaded ? 1 : 0)
                            .onAppear {
                                withAnimation(.easeIn(duration: 1.0)) {
                                    imageLoaded = true
                                }
                            }
                    case .failure:
                        EmptyView()
                    case .empty:
                        EmptyView()
                    @unknown default:
                        EmptyView()
                    }
                }
                .ignoresSafeArea()

                // Time-of-day color overlay
                LinearGradient(
                    colors: timeOfDay.gradientColors.map { $0.opacity(0.6) },
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                .blendMode(.multiply)

                // Subtle animated grain/texture overlay
                grainOverlay
                    .opacity(0.03)

                // Soft light rays (for dawn/dusk)
                if timeOfDay == .dawn || timeOfDay == .evening {
                    lightRays(in: geometry)
                }

                // Stars (for night)
                if timeOfDay == .night {
                    starsOverlay(in: geometry)
                }

                // Subtle vignette
                vignette
            }
        }
        .animation(.easeInOut(duration: 2.0), value: timeOfDay)
        .onAppear {
            startAnimation()
        }
    }

    // MARK: - Components

    private var grainOverlay: some View {
        GeometryReader { geometry in
            Canvas { context, size in
                for _ in 0..<1000 {
                    let x = CGFloat.random(in: 0..<size.width)
                    let y = CGFloat.random(in: 0..<size.height)
                    let opacity = Double.random(in: 0.1...0.3)

                    context.fill(
                        Path(ellipseIn: CGRect(x: x, y: y, width: 1, height: 1)),
                        with: .color(.white.opacity(opacity))
                    )
                }
            }
        }
    }

    private func lightRays(in geometry: GeometryProxy) -> some View {
        ZStack {
            ForEach(0..<5, id: \.self) { index in
                let angle = Double(index) * 15 - 30

                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.15),
                                Color.white.opacity(0)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 80, height: geometry.size.height * 1.5)
                    .rotationEffect(.degrees(angle))
                    .offset(
                        x: CGFloat(index - 2) * 60 + animationOffset * 10,
                        y: -geometry.size.height * 0.2
                    )
                    .blur(radius: 30)
            }
        }
        .opacity(timeOfDay == .dawn ? 0.6 : 0.4)
    }

    private func starsOverlay(in geometry: GeometryProxy) -> some View {
        Canvas { context, size in
            for _ in 0..<50 {
                let x = CGFloat.random(in: 0..<size.width)
                let y = CGFloat.random(in: 0..<size.height * 0.6)
                let starSize = CGFloat.random(in: 1...3)
                let opacity = Double.random(in: 0.3...0.8)

                context.fill(
                    Path(ellipseIn: CGRect(x: x, y: y, width: starSize, height: starSize)),
                    with: .color(.white.opacity(opacity))
                )
            }
        }
        .opacity(0.7)
    }

    private var vignette: some View {
        RadialGradient(
            colors: [
                Color.clear,
                Color.black.opacity(0.3)
            ],
            center: .center,
            startRadius: 100,
            endRadius: 500
        )
        .ignoresSafeArea()
    }

    // MARK: - Animation

    private func startAnimation() {
        withAnimation(
            .easeInOut(duration: 8)
            .repeatForever(autoreverses: true)
        ) {
            animationOffset = 1
        }
    }
}

// MARK: - Preview

#Preview("Dawn") {
    LivingSceneView(timeOfDay: .dawn)
}

#Preview("Day") {
    LivingSceneView(timeOfDay: .day)
}

#Preview("Dusk") {
    LivingSceneView(timeOfDay: .evening)
}

#Preview("Night") {
    LivingSceneView(timeOfDay: .night)
}
