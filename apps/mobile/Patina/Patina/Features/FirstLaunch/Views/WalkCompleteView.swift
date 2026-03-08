//
//  WalkCompleteView.swift
//  Patina
//
//  Scene 5 of the first-launch flow: Walk completion summary.
//  Displays style insights derived from the room scan.
//

import SwiftUI

/// Walk completion view showing style insights
struct WalkCompleteView: View {

    // MARK: - Properties

    let styleSignals: FirstWalkStyleSignals
    let roomName: String
    let onShowMe: () -> Void

    // MARK: - Animation State

    @State private var headerVisible = false
    @State private var insightsVisible: [Bool] = []
    @State private var transitionVisible = false
    @State private var buttonVisible = false

    // MARK: - Computed Properties

    private var insights: [String] {
        styleSignals.insightPhrases
    }

    var body: some View {
        ZStack {
            // Abstract background visualization
            backgroundVisualization

            // Content
            VStack(spacing: 0) {
                Spacer()

                // Strata mark
                StrataMarkView(color: PatinaColors.clayBeige, scale: 1.0, breathing: true)
                    .frame(height: 40)
                    .padding(.bottom, PatinaSpacing.xl)
                    .opacity(headerVisible ? 1 : 0)

                // Header message
                Text("I'm beginning to understand\nthis space — and you.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, PatinaSpacing.xl)
                    .padding(.bottom, PatinaSpacing.xxl)
                    .opacity(headerVisible ? 1 : 0)
                    .offset(y: headerVisible ? 0 : 20)

                // Style insights
                insightsSection
                    .padding(.bottom, PatinaSpacing.xxl)

                // Transition message
                Text("Something's already surfacing\nthat might belong here.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, PatinaSpacing.xl)
                    .padding(.bottom, PatinaSpacing.xl)
                    .opacity(transitionVisible ? 1 : 0)
                    .offset(y: transitionVisible ? 0 : 20)

                // Show me button
                Button(action: {
                    HapticManager.shared.impact(.medium)
                    onShowMe()
                }) {
                    Text("Show me")
                        .font(PatinaTypography.bodyMedium)
                        .foregroundColor(PatinaColors.offWhite)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, PatinaSpacing.md)
                        .background(PatinaColors.clayBeige)
                        .cornerRadius(PatinaRadius.lg)
                }
                .accessibilityIdentifier("walkComplete.showMeButton")
                .buttonStyle(ScaleButtonStyle())
                .padding(.horizontal, PatinaSpacing.xl)
                .padding(.bottom, PatinaSpacing.xxxl)
                .opacity(buttonVisible ? 1 : 0)
                .offset(y: buttonVisible ? 0 : 20)
            }
        }
        .onAppear {
            initializeState()
            animateEntrance()
        }
    }

    // MARK: - Background Visualization

    private var backgroundVisualization: some View {
        ZStack {
            // Base gradient
            LinearGradient(
                colors: [
                    PatinaColors.charcoal,
                    PatinaColors.mochaBrown.opacity(0.8),
                    PatinaColors.Background.primary
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            // Abstract room shapes
            GeometryReader { geometry in
                ZStack {
                    // Warm glow representing the room
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [
                                    PatinaColors.clayBeige.opacity(0.2),
                                    PatinaColors.clayBeige.opacity(0.05),
                                    .clear
                                ],
                                center: .center,
                                startRadius: 50,
                                endRadius: geometry.size.width * 0.6
                            )
                        )
                        .frame(width: geometry.size.width, height: geometry.size.width)
                        .position(x: geometry.size.width / 2, y: geometry.size.height * 0.3)

                    // Subtle window light representation
                    if styleSignals.naturalLight > 0.5 {
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    colors: [
                                        PatinaColors.offWhite.opacity(0.1),
                                        .clear
                                    ],
                                    startPoint: .topTrailing,
                                    endPoint: .bottomLeading
                                )
                            )
                            .frame(width: 100, height: 200)
                            .position(x: geometry.size.width * 0.8, y: geometry.size.height * 0.25)
                            .blur(radius: 30)
                    }
                }
            }
        }
    }

    // MARK: - Insights Section

    private var insightsSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
            ForEach(Array(insights.enumerated()), id: \.offset) { index, insight in
                insightRow(insight, index: index)
            }
        }
        .padding(.horizontal, PatinaSpacing.xxxl)
        .accessibilityIdentifier("walkComplete.insights")
    }

    private func insightRow(_ insight: String, index: Int) -> some View {
        HStack(spacing: PatinaSpacing.sm) {
            Circle()
                .fill(PatinaColors.clayBeige)
                .frame(width: 6, height: 6)

            Text(insight)
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.primary)
        }
        .opacity(index < insightsVisible.count && insightsVisible[index] ? 1 : 0)
        .offset(x: index < insightsVisible.count && insightsVisible[index] ? 0 : -20)
    }

    // MARK: - Animation

    private func initializeState() {
        insightsVisible = Array(repeating: false, count: insights.count)
    }

    private func animateEntrance() {
        // Header
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.2)) {
            headerVisible = true
        }

        // Insights (staggered)
        for index in insights.indices {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.6 + Double(index) * 0.2)) {
                if index < insightsVisible.count {
                    insightsVisible[index] = true
                }
            }
        }

        // Transition message
        let transitionDelay = 0.6 + Double(insights.count) * 0.2 + 0.3
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(transitionDelay)) {
            transitionVisible = true
        }

        // Button
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(transitionDelay + 0.3)) {
            buttonVisible = true
        }
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Walk Complete") {
    var signals = FirstWalkStyleSignals()
    signals.naturalLight = 0.8
    signals.openness = 0.7
    signals.warmth = 0.6

    return WalkCompleteView(
        styleSignals: signals,
        roomName: "Living Room",
        onShowMe: { print("Show me") }
    )
}
