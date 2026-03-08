//
//  ThresholdView.swift
//  Patina
//
//  The Threshold - Entry experience with time-shifting light
//  No carousel, no explanation - just presence and invitation
//

import SwiftUI

/// The Threshold - Entry experience with time-shifting light
public struct ThresholdView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel: ThresholdViewModel
    @State private var appearTime: Date = Date()

    /// Optional callback for first-launch flow
    public var onComplete: ((TimeInterval) -> Void)?

    public init(onComplete: ((TimeInterval) -> Void)? = nil) {
        _viewModel = State(initialValue: ThresholdViewModel())
        self.onComplete = onComplete
    }

    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Living scene background
                LivingSceneView(timeOfDay: viewModel.timeOfDay)
                    .ignoresSafeArea()

                // Content overlay
                VStack(spacing: 0) {
                    Spacer()

                    // Time indicator
                    Text(viewModel.timeOfDay.greeting)
                        .font(PatinaTypography.caption)
                        .foregroundColor(viewModel.timeOfDay.textColor.opacity(0.5))
                        .textCase(.uppercase)
                        .tracking(2)

                    Spacer().frame(height: PatinaSpacing.lg)

                    // Main message
                    Text("Every room\ntells a story.")
                        .font(PatinaTypography.h1)
                        .foregroundColor(viewModel.timeOfDay.textColor)
                        .multilineTextAlignment(.center)
                        .lineSpacing(8)
                        .accessibilityIdentifier("threshold.mainText")

                    Spacer().frame(height: PatinaSpacing.xxxl)

                    // Hold to enter
                    holdToEnterControl

                    Spacer().frame(height: 80)
                }
                .padding(.horizontal, PatinaSpacing.xl)
            }
        }
        .onAppear {
            appearTime = Date()
            viewModel = ThresholdViewModel(coordinator: coordinator)
            viewModel.startTimeProgression()
        }
        .onDisappear {
            viewModel.stopTimeProgression()
        }
    }

    // MARK: - Tap to Enter Control

    private var holdToEnterControl: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Strata mark - tap to continue
            ZStack {
                // Background ring
                Circle()
                    .stroke(
                        viewModel.timeOfDay.textColor.opacity(0.2),
                        lineWidth: 2
                    )
                    .frame(width: 64, height: 64)

                // Strata mark inside
                StrataMarkView(
                    color: viewModel.timeOfDay.textColor,
                    scale: 0.5,
                    breathing: true
                )
                .opacity(0.8)
            }
            .accessibilityIdentifier("threshold.enterButton")
            .onTapGesture {
                let duration = Date().timeIntervalSince(appearTime)
                if let callback = onComplete {
                    // First-launch flow callback
                    callback(duration)
                } else {
                    // Legacy flow
                    viewModel.completeThreshold()
                }
            }

            // Instruction text
            Text("Tap to enter")
                .font(PatinaTypography.bodySmall)
                .foregroundColor(viewModel.timeOfDay.textColor.opacity(0.6))
        }
    }
}

// MARK: - Preview

#Preview {
    ThresholdView()
}
