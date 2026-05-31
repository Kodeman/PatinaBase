//
//  ScanWalkView.swift
//  Patina
//
//  Screens 02–06: The Walk. Unbroken room scan with evolving Whisper Bar.
//  Per PRD §4.2.
//

import SwiftUI
import AVFoundation

struct ScanWalkView: View {

    @Bindable var viewModel: ScanViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var lastAnnouncedText: String = ""

    var body: some View {
        ZStack(alignment: .bottom) {
            // 1. RoomPlan camera (bottom layer)
            RoomCaptureViewRepresentable(captureService: viewModel.captureService)
                .ignoresSafeArea()

            // 2. AR geometry overlay — decorative corner dots + wall hints
            ARGeometryOverlayView(reduceMotion: reduceMotion)
                .ignoresSafeArea()

            // 3. Top HUD + controls
            VStack {
                HStack(alignment: .top) {
                    ScanHUDView(
                        progress: viewModel.scanProgress,
                        isFastMovementWarning: viewModel.trackingState == .fastMovement,
                        reduceMotion: reduceMotion
                    )
                    .padding(.leading, 20)
                    .padding(.top, 60)

                    Spacer()

                    ScanControlsView(
                        onPause: viewModel.didTapPause,
                        onHelp: {
                            // Brief coaching reshow; for v1 this is a no-op
                        }
                    )
                    .padding(.trailing, 20)
                    .padding(.top, 60)
                }
                Spacer()
            }

            // 4. Edge-case toast (above Whisper Bar)
            if let toastKind = toastKind {
                VStack {
                    Spacer()
                    EdgeToastView(
                        kind: toastKind,
                        actionLabel: toastKind == .lowLight ? "Toggle flashlight" : nil,
                        onAction: toastKind == .lowLight ? { toggleTorch() } : nil
                    )
                    .padding(.horizontal, 20)
                    .padding(.bottom, 120)
                }
            }

            // 5. Whisper Bar (bottom)
            WhisperBarView(
                state: viewModel.whisperState,
                reduceMotion: reduceMotion
            )

            // 5b. Shutter button — captures a full-resolution posed photo
            // from the next ARFrame. Positioned above the Whisper Bar so it
            // doesn't fight the primary narrative affordance.
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    ShutterButton {
                        viewModel.captureService.captureUserPhoto()
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    }
                    .padding(.trailing, 24)
                    .padding(.bottom, 110)
                }
            }
            .allowsHitTesting(!viewModel.showPauseMenu && viewModel.trackingState != .idle)

            // 6. Idle overlay (30s no motion)
            if viewModel.trackingState == .idle {
                idleOptions
            }

            // 7. Session-lost modal — RoomPlan/ARKit failed in a non-recoverable
            // way (drift detection, world-tracking failure). Blocks the rest
            // of the UI until the user picks a path forward.
            if viewModel.trackingState == .sessionLost {
                sessionLostOverlay
                    .transition(.opacity)
            }
        }
        .ignoresSafeArea()
        .overlay {
            if viewModel.showPauseMenu {
                PauseMenuView(
                    onResume: viewModel.didTapResume,
                    onFinish: viewModel.didTapFinishPartial,
                    onStartOver: viewModel.didTapStartOver,
                    onDismiss: viewModel.didDismissPauseMenu
                )
                .transition(.opacity)
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: viewModel.showPauseMenu)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: viewModel.trackingState)
        .onChange(of: viewModel.whisperState.text) { _, newText in
            // Announce whisper text changes to VoiceOver
            guard newText != lastAnnouncedText else { return }
            lastAnnouncedText = newText
            UIAccessibility.post(notification: .announcement, argument: newText)
        }
    }

    private var toastKind: EdgeToastView.Kind? {
        switch viewModel.trackingState {
        case .lowLight:     return .lowLight
        case .fastMovement: return .fastMovement
        case .featureLoss:  return .featureLoss
        default: return nil
        }
    }

    private var sessionLostOverlay: some View {
        ZStack {
            PatinaColors.charcoal.opacity(0.92)
                .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "viewfinder.trianglebadge.exclamationmark")
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.85))

                VStack(spacing: 12) {
                    Text("Lost the room")
                        .font(.custom("PlayfairDisplay-Italic", size: 26, relativeTo: .title2))
                        .foregroundStyle(PatinaColors.offWhite)

                    Text("Tracking dropped — usually from a sudden move or a featureless wall. Let's try once more from where you stand.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.offWhite.opacity(0.75))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Spacer()

                VStack(spacing: 12) {
                    Button(action: viewModel.didTapRetryAfterSessionLost) {
                        Text("Try again")
                            .font(PatinaTypography.uiAction)
                            .foregroundStyle(PatinaColors.charcoal)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(RoundedRectangle(cornerRadius: 26).fill(PatinaColors.offWhite))
                    }
                    .buttonStyle(.plain)

                    Button(action: viewModel.didTapCancelAfterSessionLost) {
                        Text("Cancel scan")
                            .font(PatinaTypography.uiAction)
                            .foregroundStyle(PatinaColors.offWhite)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(
                                RoundedRectangle(cornerRadius: 26)
                                    .stroke(PatinaColors.offWhite.opacity(0.6), lineWidth: 1.5)
                            )
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Lost tracking. Try again or cancel the scan.")
    }

    private var idleOptions: some View {
        VStack(spacing: 12) {
            Spacer()
            VStack(spacing: 12) {
                Button(action: viewModel.didChooseFinishIdle) {
                    Text("Finish with this")
                        .font(PatinaTypography.uiAction)
                        .foregroundStyle(PatinaColors.offWhite)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(RoundedRectangle(cornerRadius: 26).fill(PatinaColors.charcoal))
                }
                .buttonStyle(.plain)

                Button(action: viewModel.didChooseKeepGoing) {
                    Text("Keep going")
                        .font(PatinaTypography.uiAction)
                        .foregroundStyle(PatinaColors.charcoal)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(
                            RoundedRectangle(cornerRadius: 26)
                                .stroke(PatinaColors.charcoal, lineWidth: 1.5)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 180)
        }
    }

    private func toggleTorch() {
        guard let device = AVCaptureDevice.default(for: .video),
              device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            device.torchMode = device.torchMode == .on ? .off : .on
            device.unlockForConfiguration()
        } catch {
            // Silently fail — scan flow must not break
        }
    }
}

// MARK: - ShutterButton

/// Circular shutter affordance with concentric ring + inner disc + press
/// scale animation. Purposely plain so it visually reads as a "take a photo"
/// control rather than a "record" or "stop" control.
private struct ShutterButton: View {

    let action: () -> Void

    @State private var isPressed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .stroke(PatinaColors.offWhite.opacity(0.9), lineWidth: 3)
                    .frame(width: 68, height: 68)
                Circle()
                    .fill(PatinaColors.offWhite)
                    .frame(width: 54, height: 54)
                    .scaleEffect(isPressed ? 0.85 : 1.0)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.12), value: isPressed)
            }
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
        .accessibilityLabel("Capture photo")
        .accessibilityHint("Saves the current view so your designer can see this detail.")
    }
}
