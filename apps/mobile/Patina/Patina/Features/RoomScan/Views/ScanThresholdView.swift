//
//  ScanThresholdView.swift
//  Patina
//
//  Screen 01: The Threshold. Camera fade-in. The scan begins on movement.
//  Per PRD §4.1.
//

import SwiftUI

struct ScanThresholdView: View {

    @State private var viewModel: ScanViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var cameraOpacity: Double = 0
    @State private var showOverlay: Bool = false

    let onScanComplete: (RoomScanSession, ScanCompletionReason) -> Void

    init(
        viewModel: ScanViewModel,
        onScanComplete: @escaping (RoomScanSession, ScanCompletionReason) -> Void
    ) {
        self._viewModel = State(initialValue: viewModel)
        self.onScanComplete = onScanComplete
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if viewModel.scanProgress > 0 || showOverlay {
                // Once motion is detected and the scan starts, the full Scan view
                // takes over. The Threshold is just the opening curtain.
                ScanWalkView(viewModel: viewModel)
                    .opacity(cameraOpacity)
                    .transition(.opacity)
            } else {
                // Pre-motion state: live camera fading in under the Whisper Bar
                thresholdCamera
                    .opacity(cameraOpacity)

                VStack {
                    Spacer()
                    WhisperBarView(
                        state: WhisperState.forProgress(0),
                        reduceMotion: reduceMotion
                    )
                }
            }
        }
        .ignoresSafeArea()
        .onAppear {
            viewModel.onCompleted = { session, reason in
                onScanComplete(session, reason)
            }
            viewModel.prepare()
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.8)) {
                cameraOpacity = 1.0
            }
            // Reveal the overlay after the initial fade so the Whisper Bar
            // gets a moment of stillness before the scan begins. Structured
            // concurrency replaces DispatchQueue.main.asyncAfter (PT-3-3).
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                showOverlay = true
            }
        }
        .onDisappear {
            viewModel.teardown()
        }
    }

    private var thresholdCamera: some View {
        ZStack {
            RoomCaptureViewRepresentable(captureService: viewModel.captureService)
                .ignoresSafeArea()
            // 5% Clay Beige tint per PRD §4.1
            PatinaColors.clay
                .opacity(0.05)
                .ignoresSafeArea()
                .allowsHitTesting(false)
        }
    }
}
