//
//  WalkWalkingContent.swift
//  Patina
//
//  Active-scanning content for the Walk experience (PT-6-4). Hosts the AR
//  camera (or mock) feed, the top bar, narration overlay, water-fill progress,
//  companion mark, and the contextual question overlay.
//  Behavior-preserving extraction from WalkView.walkingContent / topBar /
//  narrationOverlay. The capture-service lifecycle (start/stop, callbacks,
//  question handling) stays in WalkView; this view is the visual composition.
//

import SwiftUI

/// The Walk's live-scanning screen.
struct WalkWalkingContent: View {

    let captureService: RoomCaptureService
    let narrationService: WalkNarrationService
    let viewModel: WalkViewModel

    /// The currently-presented contextual question, if any.
    let currentQuestion: WalkQuestion?

    /// Whether the walk is paused (drives the play/pause icon + label).
    let isPaused: Bool

    let onAnswer: (String) -> Void
    let onDismissQuestion: () -> Void
    let onClose: () -> Void
    let onPauseToggle: () -> Void

    var body: some View {
        ZStack {
            // AR Camera View (or mock scanning if RoomPlan not available or in UI test mode)
            if RoomCaptureService.isSupported && !PatinaApp.useMockAR {
                RoomCaptureViewRepresentable(captureService: captureService)
                    .ignoresSafeArea()
            } else {
                // Mock scanning view for simulator/UI testing
                MockRoomScanView(
                    captureService: captureService,
                    narrationService: narrationService
                )
                .ignoresSafeArea()
            }

            // UI Overlay
            VStack(spacing: 0) {
                // Top bar
                topBar
                    .padding(.horizontal, PatinaSpacing.lg)
                    .padding(.top, PatinaSpacing.lg)

                Spacer()

                // Narration overlay (from narration service)
                if let narration = narrationService.currentNarration {
                    narrationOverlay(narration)
                        .padding(.bottom, PatinaSpacing.xxxl)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                } else if viewModel.currentNarration != nil {
                    // Fallback to viewModel narration
                    WalkNarrationOverlay(
                        narration: viewModel.currentNarration,
                        isThinking: viewModel.isThinking
                    )
                    .padding(.bottom, PatinaSpacing.xxxl)
                }

                // Organic water-fill progress indicator
                WalkProgressView(
                    coveragePercentage: captureService.coverageResult?.overallCoverage ?? captureService.scanProgress,
                    displayPhase: captureService.coverageResult?.displayPhase ?? .beginning
                )
                .padding(.bottom, PatinaSpacing.xl)

                // Bottom companion mark
                StrataMarkView(
                    color: PatinaColors.clay.opacity(0.8),
                    scale: 0.6,
                    breathing: true
                )
                .padding(.bottom, PatinaSpacing.xl)
            }

            // Question overlay (when applicable)
            WalkQuestionOverlay(
                question: currentQuestion,
                onAnswer: onAnswer,
                onDismiss: onDismissQuestion
            )
        }
    }

    // MARK: - Narration Overlay

    private func narrationOverlay(_ text: String) -> some View {
        VStack(spacing: PatinaSpacing.sm) {
            Text(text)
                .font(PatinaTypography.patinaVoice)
                .foregroundStyle(PatinaColors.offWhite)
                .multilineTextAlignment(.center)
                .padding(.horizontal, PatinaSpacing.xl)
                .padding(.vertical, PatinaSpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .fill(Color.black.opacity(0.6))
                )
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            // Close button
            Button {
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(PatinaSpacing.sm)
                    .background(Circle().fill(Color.white.opacity(0.15)))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Close")
            .accessibilityHint("Ends the walk and returns to the previous screen.")

            Spacer()

            // Pause/Resume button
            Button {
                onPauseToggle()
            } label: {
                Image(systemName: isPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(PatinaSpacing.sm)
                    .background(Circle().fill(Color.white.opacity(0.15)))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(isPaused ? "Resume walk" : "Pause walk")
        }
    }
}
