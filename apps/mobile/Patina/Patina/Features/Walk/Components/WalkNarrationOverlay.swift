//
//  WalkNarrationOverlay.swift
//  Patina
//
//  Narration display overlay for the Walk experience
//

import SwiftUI

/// Displays Patina's narration during the Walk
struct WalkNarrationOverlay: View {

    let narration: WalkNarration?
    let isThinking: Bool

    var body: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Narration text
            if let narration = narration {
                Text(narration.text)
                    .font(PatinaTypography.patinaVoice)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .shadow(color: .black.opacity(0.5), radius: 8, x: 0, y: 2)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .offset(y: 10)),
                        removal: .opacity
                    ))
            }

            // Thinking indicator
            if isThinking {
                ThinkingDotsView()
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, PatinaSpacing.xl)
        .animation(.easeInOut(duration: 0.5), value: narration?.id)
        .animation(.easeInOut(duration: 0.3), value: isThinking)
    }
}

// MARK: - Thinking Dots

/// Animated thinking dots (like in the design doc)
struct ThinkingDotsView: View {

    @State private var animationPhase: Int = 0

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(.white.opacity(dotOpacity(for: index)))
                    .frame(width: 8, height: 8)
            }
        }
        .onAppear {
            startAnimation()
        }
    }

    private func dotOpacity(for index: Int) -> Double {
        let phase = (animationPhase + index) % 3
        switch phase {
        case 0: return 1.0
        case 1: return 0.6
        default: return 0.3
        }
    }

    private func startAnimation() {
        Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.3)) {
                animationPhase = (animationPhase + 1) % 3
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.black.opacity(0.8)
            .ignoresSafeArea()

        VStack(spacing: 60) {
            WalkNarrationOverlay(
                narration: WalkNarration(text: "I notice the light here... afternoon sun from the south. That changes things."),
                isThinking: false
            )

            WalkNarrationOverlay(
                narration: nil,
                isThinking: true
            )
        }
    }
}
