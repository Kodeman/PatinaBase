//
//  WalkProgressView.swift
//  Patina
//
//  Organic "water fill" progress indicator for room scanning.
//  Shows progress without percentages - feels alive and natural.
//

import SwiftUI

/// Organic water-fill progress indicator
/// No percentages shown - progress feels natural and alive
struct WalkProgressView: View {

    // MARK: - Properties

    /// Current coverage percentage (0.0 - 1.0)
    let coveragePercentage: Float

    /// Current progress phase for companion narration
    let displayPhase: CoverageAnalyzer.ProgressPhase

    // MARK: - State

    @State private var animatedFill: CGFloat = 0
    @State private var waveOffset: CGFloat = 0
    @State private var pulseScale: CGFloat = 1.0

    // MARK: - Constants

    private enum Constants {
        static let size: CGFloat = 52
        static let innerSize: CGFloat = 46
        static let strokeWidth: CGFloat = 3
        static let waveHeight: CGFloat = 2
        static let waveCount: Int = 3
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            // Outer ring (background)
            Circle()
                .stroke(
                    PatinaColors.clayBeige.opacity(0.2),
                    lineWidth: Constants.strokeWidth
                )
                .frame(width: Constants.size, height: Constants.size)

            // Water fill with wave effect
            WaterFillShape(fillLevel: animatedFill, waveOffset: waveOffset)
                .fill(fillGradient)
                .frame(width: Constants.innerSize, height: Constants.innerSize)
                .clipShape(Circle())

            // Completion glow
            if displayPhase == .complete {
                completionGlow
            }
        }
        .scaleEffect(pulseScale)
        .onChange(of: coveragePercentage) { _, newValue in
            // Smoothstep for organic feel
            let smoothed = smoothstep(CGFloat(newValue))
            withAnimation(.easeInOut(duration: 0.5)) {
                animatedFill = smoothed
            }
        }
        .onAppear {
            // Start wave animation
            startWaveAnimation()

            // Set initial fill
            animatedFill = smoothstep(CGFloat(coveragePercentage))
        }
        .onChange(of: displayPhase) { oldPhase, newPhase in
            // Pulse on phase change
            if oldPhase != newPhase {
                triggerPulse()
            }
        }
    }

    // MARK: - Subviews

    private var fillGradient: LinearGradient {
        LinearGradient(
            colors: [
                PatinaColors.clayBeige.opacity(0.3),
                PatinaColors.clayBeige.opacity(0.6)
            ],
            startPoint: .bottom,
            endPoint: .top
        )
    }

    private var completionGlow: some View {
        Circle()
            .stroke(PatinaColors.clayBeige, lineWidth: 2)
            .frame(width: Constants.size, height: Constants.size)
            .blur(radius: 4)
            .opacity(0.8)
    }

    // MARK: - Animations

    private func startWaveAnimation() {
        withAnimation(.linear(duration: 2).repeatForever(autoreverses: false)) {
            waveOffset = 2 * .pi
        }
    }

    private func triggerPulse() {
        // Subtle pulse on milestone
        withAnimation(.easeOut(duration: 0.15)) {
            pulseScale = 1.1
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.easeIn(duration: 0.2)) {
                pulseScale = 1.0
            }
        }
    }

    // MARK: - Math

    /// Smoothstep function for organic easing: 3x² - 2x³
    private func smoothstep(_ x: CGFloat) -> CGFloat {
        let clamped = max(0, min(1, x))
        return 3 * pow(clamped, 2) - 2 * pow(clamped, 3)
    }
}

// MARK: - Water Fill Shape

/// Custom shape that creates a water-like fill with wave effect
struct WaterFillShape: Shape {

    var fillLevel: CGFloat
    var waveOffset: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(fillLevel, waveOffset) }
        set {
            fillLevel = newValue.first
            waveOffset = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()

        let waterHeight = rect.height * fillLevel
        let yOffset = rect.height - waterHeight

        // Start at bottom left
        path.move(to: CGPoint(x: 0, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: yOffset))

        // Create wavy top edge
        let waveCount = 3
        let waveWidth = rect.width / CGFloat(waveCount)
        let waveHeight: CGFloat = 2

        for i in 0..<waveCount {
            let startX = CGFloat(i) * waveWidth
            let midX = startX + waveWidth / 2
            let endX = startX + waveWidth

            // Phase shift for animation
            let phaseShift = sin(waveOffset + CGFloat(i) * 0.5) * waveHeight

            path.addQuadCurve(
                to: CGPoint(x: endX, y: yOffset),
                control: CGPoint(x: midX, y: yOffset - phaseShift)
            )
        }

        // Complete the shape
        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.closeSubpath()

        return path
    }
}

// MARK: - Compact Progress Indicator

/// Smaller progress indicator for inline use
struct WalkProgressIndicatorCompact: View {
    let progress: Float

    var body: some View {
        Circle()
            .trim(from: 0, to: CGFloat(progress))
            .stroke(
                PatinaColors.clayBeige,
                style: StrokeStyle(lineWidth: 2, lineCap: .round)
            )
            .frame(width: 24, height: 24)
            .rotationEffect(.degrees(-90))
            .animation(.easeInOut(duration: 0.3), value: progress)
    }
}

// MARK: - Previews

#Preview("Progress Phases") {
    VStack(spacing: 40) {
        ForEach([0.1, 0.3, 0.5, 0.75, 0.95] as [Float], id: \.self) { progress in
            VStack {
                WalkProgressView(
                    coveragePercentage: progress,
                    displayPhase: CoverageAnalyzer.ProgressPhase.from(coverage: progress)
                )

                Text("\(Int(progress * 100))%")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
    .padding()
    .background(Color.black.opacity(0.9))
}

#Preview("Animated Progress") {
    WalkProgressPreview()
}

private struct WalkProgressPreview: View {
    @State private var progress: Float = 0

    var body: some View {
        VStack {
            WalkProgressView(
                coveragePercentage: progress,
                displayPhase: CoverageAnalyzer.ProgressPhase.from(coverage: progress)
            )

            Button("Animate") {
                withAnimation {
                    progress = progress < 0.9 ? progress + 0.2 : 0
                }
            }
            .padding(.top, 40)
        }
        .padding()
        .background(Color.black.opacity(0.9))
    }
}

// MARK: - ProgressPhase Extension

extension CoverageAnalyzer.ProgressPhase {
    static func from(coverage: Float) -> CoverageAnalyzer.ProgressPhase {
        switch coverage {
        case 0..<0.15: return .beginning
        case 0.15..<0.40: return .exploring
        case 0.40..<0.70: return .developing
        case 0.70..<0.90: return .refining
        default: return .complete
        }
    }
}
