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

    /// Theme IV: capture starts on movement, so a perfectly still
    /// first-timer would otherwise stare at a dark camera with no
    /// instruction. U35: the cue is visible from the first frame rather
    /// than gated behind a stillness delay, so it reads as an option from
    /// the start instead of a fallback that only shows up once you've
    /// already been standing still and unsure what to do.
    @State private var showManualStartCue: Bool = false

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

            // Theme IV: stillness cue. Floats above the Whisper Bar in both
            // the pre-motion and walk layers so it stays visible regardless
            // of which branch is showing.
            if showManualStartCue {
                manualStartCue
                    .transition(reduceMotion ? .identity : .opacity)
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
            // U35: the manual-start cue shows immediately (no stillness
            // delay) — a first-timer shouldn't have to wait to learn tapping
            // is an option.
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.6)) {
                showManualStartCue = true
            }
        }
        .onChange(of: viewModel.captureService.isScanning) { _, isScanning in
            // Hide the cue as soon as the scan starts (motion or manual).
            if isScanning, showManualStartCue {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                    showManualStartCue = false
                }
            }
        }
        .onDisappear {
            viewModel.teardown()
        }
    }

    /// Whisper-bar-styled cue with an explicit manual start. Matches the
    /// Whisper Bar's visual language (Playfair italic line + mono caption on
    /// a frosted off-white surface) so it reads as part of the same voice.
    private var manualStartCue: some View {
        VStack {
            Spacer()
            Button {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                    showManualStartCue = false
                }
                viewModel.didTapManualStart()
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Begin walking to start — or tap here.")
                        .font(PatinaTypography.patinaVoice)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Start scanning now")
                        .font(PatinaTypography.mono)
                        .tracking(0.6)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 18)
                        .fill(PatinaColors.offWhite.opacity(0.95))
                        .background(
                            .ultraThinMaterial,
                            in: RoundedRectangle(cornerRadius: 18)
                        )
                )
                .contentShape(RoundedRectangle(cornerRadius: 18))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.bottom, 190) // clears the Whisper Bar + shutter button
            .accessibilityLabel("Begin walking to start, or tap to start the scan now.")
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
