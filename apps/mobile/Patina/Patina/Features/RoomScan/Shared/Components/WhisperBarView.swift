//
//  WhisperBarView.swift
//  Patina
//
//  The Quiet Conversation's signature UI element — a single-line italic
//  guide bar that sits anchored to the bottom of the scan view.
//
//  Replaces progress ribbons, coaching overlays, percentage indicators,
//  and state labels with one warm sentence in Playfair Display italic.
//
//  Per PRD §1.4 and §4.1.
//

import SwiftUI

struct WhisperBarView: View {

    let state: WhisperState

    /// When true, swaps the shell morph for a short crossfade.
    var reduceMotion: Bool = false

    @State private var presentation: CompanionPresentationState = .collapsed(
        hint: "Measuring the room"
    )
    @State private var hasPresentedCompanion = false

    private var progressPresentation: CompanionPresentationState {
        let step = min(max(Int(state.progress * 4) + 1, 1), 4)
        return .progress(
            CompanionProgressPresentation(
                fraction: Double(state.progress),
                title: state.text,
                detail: state.subtext,
                step: step,
                totalSteps: 4
            )
        )
    }

    var body: some View {
        CompanionHearthView(presentation: presentation)
            .safeAreaPadding(.bottom, 28)
            .onAppear {
                presentCompanionIfNeeded()
            }
            .onChange(of: state) { _, _ in
                updateCompanionProgress()
            }
            .onDisappear {
                guard hasPresentedCompanion else { return }
                CompanionAnalytics.shared.trackPresentationDismissed(
                    screen: "room_scan",
                    from: .progress
                )
            }
    }

    private func presentCompanionIfNeeded() {
        guard !hasPresentedCompanion else {
            updateCompanionProgress()
            return
        }

        hasPresentedCompanion = true
        CompanionAnalytics.shared.trackPresentationExposed(
            state: .collapsed,
            surface: "room_scan"
        )

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(80))
            updateCompanionProgress()
        }
    }

    private func updateCompanionProgress() {
        withAnimation(
            reduceMotion
                ? .easeOut(duration: CompanionConstants.reducedMotionCrossfadeDuration)
                : .spring(
                    response: CompanionConstants.springResponse,
                    dampingFraction: CompanionConstants.springDamping
                )
        ) {
            presentation = progressPresentation
        }

        CompanionAnalytics.shared.trackPresentationExposed(
            state: .progress,
            surface: "room_scan"
        )
    }
}

// MARK: - Preview

#Preview("Whisper Bar - All Bands") {
    VStack(spacing: 0) {
        Spacer()
        WhisperBarView(state: WhisperState.forProgress(0))
        WhisperBarView(state: WhisperState.forProgress(0.2))
        WhisperBarView(state: WhisperState.forProgress(0.5))
        WhisperBarView(state: WhisperState.forProgress(0.75))
        WhisperBarView(state: WhisperState.forProgress(0.92))
        WhisperBarView(state: WhisperState.forProgress(1.0))
    }
    .background(Color.black)
}
