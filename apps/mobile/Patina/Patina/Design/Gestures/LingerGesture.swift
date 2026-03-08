//
//  LingerGesture.swift
//  Patina
//
//  Progressive reveal gesture - reveals more information the longer you linger
//

import SwiftUI

// MARK: - Linger Modifier

/// A gesture that progressively reveals content the longer you stay
/// Design principle: "Linger - Reveal more over time"
public struct LingerModifier: ViewModifier {

    /// Stages of revelation (0-3 typically)
    let stages: Int

    /// Duration to reveal each stage in seconds
    let stageDuration: TimeInterval

    /// Called when a new stage is revealed
    let onReveal: (Int) -> Void

    /// Called when lingering completes all stages
    let onComplete: () -> Void

    /// Called when touch is released
    let onRelease: () -> Void

    @State private var isLingering = false
    @State private var currentStage = 0
    @State private var lingerTask: Task<Void, Never>?

    public init(
        stages: Int = 3,
        stageDuration: TimeInterval = 1.5,
        onReveal: @escaping (Int) -> Void = { _ in },
        onComplete: @escaping () -> Void = {},
        onRelease: @escaping () -> Void = {}
    ) {
        self.stages = stages
        self.stageDuration = stageDuration
        self.onReveal = onReveal
        self.onComplete = onComplete
        self.onRelease = onRelease
    }

    public func body(content: Content) -> some View {
        content
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !isLingering else { return }
                        isLingering = true
                        startLingering()
                    }
                    .onEnded { _ in
                        stopLingering()
                    }
            )
    }

    private func startLingering() {
        currentStage = 0
        lingerTask = Task { @MainActor in
            for stage in 1...stages {
                guard !Task.isCancelled else { return }

                try? await Task.sleep(nanoseconds: UInt64(stageDuration * 1_000_000_000))

                guard !Task.isCancelled else { return }

                currentStage = stage
                HapticManager.shared.companionPulse()
                onReveal(stage)

                if stage == stages {
                    onComplete()
                }
            }
        }
    }

    private func stopLingering() {
        lingerTask?.cancel()
        lingerTask = nil
        isLingering = false
        onRelease()
    }
}

// MARK: - View Extension

extension View {

    /// Add linger-to-reveal behavior that progressively shows more content
    /// - Parameters:
    ///   - stages: Number of revelation stages (default: 3)
    ///   - stageDuration: Time in seconds between each stage
    ///   - onReveal: Called when each stage is revealed
    ///   - onComplete: Called when all stages are revealed
    ///   - onRelease: Called when touch is released
    public func lingerable(
        stages: Int = 3,
        stageDuration: TimeInterval = 1.5,
        onReveal: @escaping (Int) -> Void = { _ in },
        onComplete: @escaping () -> Void = {},
        onRelease: @escaping () -> Void = {}
    ) -> some View {
        modifier(LingerModifier(
            stages: stages,
            stageDuration: stageDuration,
            onReveal: onReveal,
            onComplete: onComplete,
            onRelease: onRelease
        ))
    }
}

// MARK: - Linger Reveal View

/// A view that reveals content progressively based on linger stage
public struct LingerRevealView<Content: View>: View {

    let stage: Int
    let content: (Int) -> Content

    public init(
        stage: Int,
        @ViewBuilder content: @escaping (Int) -> Content
    ) {
        self.stage = stage
        self.content = content
    }

    public var body: some View {
        content(stage)
            .animation(.easeInOut(duration: 0.5), value: stage)
    }
}

// MARK: - Preview

#Preview {
    LingerDemoView()
}

struct LingerDemoView: View {

    @State private var revealStage = 0
    @State private var isComplete = false

    var body: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            VStack(spacing: PatinaSpacing.xl) {
                Text("Linger Gesture Demo")
                    .font(PatinaTypography.h2)

                // Lingerable card
                VStack(spacing: PatinaSpacing.md) {
                    // Base content (always visible)
                    HStack {
                        Image(systemName: "chair.lounge")
                            .font(.system(size: 32))
                            .foregroundColor(PatinaColors.mochaBrown)

                        VStack(alignment: .leading) {
                            Text("Edo Lounge Chair")
                                .font(PatinaTypography.h3)
                            Text("Thos. Moser")
                                .font(PatinaTypography.caption)
                                .foregroundColor(PatinaColors.Text.secondary)
                        }
                    }

                    // Stage 1: Price reveals
                    if revealStage >= 1 {
                        Text("$4,850")
                            .font(PatinaTypography.body)
                            .foregroundColor(PatinaColors.Text.primary)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // Stage 2: Materials reveal
                    if revealStage >= 2 {
                        HStack(spacing: PatinaSpacing.sm) {
                            ForEach(["Cherry", "Natural oil"], id: \.self) { material in
                                Text(material)
                                    .font(PatinaTypography.caption)
                                    .padding(.horizontal, PatinaSpacing.sm)
                                    .padding(.vertical, PatinaSpacing.xs)
                                    .background(PatinaColors.Background.tertiary)
                                    .cornerRadius(PatinaRadius.sm)
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // Stage 3: Full provenance reveals
                    if revealStage >= 3 {
                        Text("Hand-shaped in Auburn, Maine from sustainably harvested cherry. Each piece develops unique character over decades of use.")
                            .font(PatinaTypography.bodySmall)
                            .foregroundColor(PatinaColors.Text.secondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(2)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(PatinaSpacing.lg)
                .frame(maxWidth: .infinity)
                .background(PatinaColors.Background.secondary)
                .cornerRadius(PatinaRadius.lg)
                .lingerable(
                    stages: 3,
                    stageDuration: 1.0,
                    onReveal: { stage in
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                            revealStage = stage
                        }
                    },
                    onComplete: {
                        isComplete = true
                    },
                    onRelease: {
                        withAnimation(.easeOut(duration: 0.3)) {
                            revealStage = 0
                            isComplete = false
                        }
                    }
                )
                .padding(.horizontal, PatinaSpacing.lg)

                // Instructions
                Text(isComplete ? "Fully revealed" : "Hold to reveal more...")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.Text.muted)

                // Stage indicators
                HStack(spacing: PatinaSpacing.sm) {
                    ForEach(0..<3, id: \.self) { index in
                        Circle()
                            .fill(index < revealStage ? PatinaColors.mochaBrown : PatinaColors.clayBeige.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                }
            }
        }
    }
}
