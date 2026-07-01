//  ViewfinderScreen.swift
//  Capture
//
//  C1 — the app's home. A live camera (a dark "scene" gradient when there are no
//  frames, e.g. the simulator's MockCameraService) under five thumb-reach
//  regions: the auto-stamped venue chip, the C2 framing guides, the mode
//  selector, the shutter, and the session-tray handle. Low light (R1) surfaces a
//  torch + hint + Night chip without ever blocking the shutter. The shutter tap
//  freezes the frame into a C3 card; a hold rolls a C4 multi-shot into one
//  specimen and opens the C5 sheet on release.

import SwiftUI
import CaptureKit
import CaptureKitMocks   // #Preview only — MockCameraService for the low-light state

struct ViewfinderScreen: View {
    @State private var model: ViewfinderModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(container: AppContainer, coordinator: CaptureCoordinator) {
        _model = State(wrappedValue: ViewfinderModel(container: container, coordinator: coordinator))
    }

    var body: some View {
        ZStack {
            // Live feed (gradient fallback) + framing chrome
            ViewfinderSceneBackdrop(luma: model.luma)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .gesture(navigationGesture)

            ViewfinderFramingGuides(
                roll: model.roll, isLevel: model.isLevel,
                showGrid: model.gridOn, reduceMotion: reduceMotion
            )
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                topBar
                Spacer()
                bottomControls
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 14)

            if model.isHolding {
                ViewfinderMultiShotOverlay(count: model.holdCount)
            }

            if let specimen = model.cardSpecimen {
                CaptureCardOverlay(
                    specimen: specimen,
                    onSave: model.saveFromCard,
                    onAddDetail: model.addDetailFromCard,
                    onDismiss: model.dismissCard
                )
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                .zIndex(2)
            }
        }
        .background(CaptureColor.ink.ignoresSafeArea())
        .animation(cardAnimation, value: model.cardSpecimen?.id)
        .animation(cardAnimation, value: model.isHolding)
        .task { await model.start() }
        .onDisappear { model.stop() }
        .statusBarHidden(true)
        .accessibilityIdentifier(CaptureScreenID.c1Viewfinder.rawValue)
    }

    private var cardAnimation: Animation? { reduceMotion ? nil : .snappy }

    // MARK: Top bar — venue (left) + night/torch status (right)

    private var topBar: some View {
        HStack(alignment: .top) {
            ViewfinderVenueChip(label: model.venueLabel)
            Spacer()
            VStack(alignment: .trailing, spacing: 8) {
                if model.isLowLight { ViewfinderNightChip() }
                ViewfinderTorchPill(on: model.torchOn, action: model.toggleTorch)
            }
        }
    }

    // MARK: Bottom controls

    private var bottomControls: some View {
        VStack(spacing: 16) {
            if model.isLowLight {
                ViewfinderLowLightHint(action: model.toggleTorch)
            }
            ViewfinderLevelReadout(isLevel: model.isLevel)
            ViewfinderModeSelector(mode: model.mode) { newMode in
                Task { await model.select(newMode) }
            }
            ZStack {
                HStack(alignment: .center) {
                    ViewfinderControlCluster(
                        torchOn: model.torchOn, gridOn: model.gridOn,
                        onTorch: model.toggleTorch, onGrid: model.toggleGrid
                    )
                    Spacer()
                    ViewfinderSessionHandle(count: model.sessionCount, action: model.openSessionTray)
                }
                ViewfinderShutter(
                    isHolding: model.isHolding, count: model.holdCount, capturing: model.capturing
                )
                .gesture(shutterPress)
            }
            Text("Tap to capture · hold for multi-shot")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.paper.opacity(0.55))
        }
    }

    // MARK: Gestures

    /// Single press = one frame (C3); a held press becomes a multi-shot (C4).
    private var shutterPress: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in model.pressChanged() }
            .onEnded { _ in model.pressEnded() }
    }

    /// Swipe up → session tray (V1); swipe left/right → cycle capture mode.
    private var navigationGesture: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                let dx = value.translation.width, dy = value.translation.height
                if abs(dy) > abs(dx) {
                    if dy < -40 { model.openSessionTray() }
                } else if dx < -40 {
                    Task { await model.cycleMode(1) }
                } else if dx > 40 {
                    Task { await model.cycleMode(-1) }
                }
            }
    }
}

#Preview("Viewfinder") {
    ViewfinderScreen(container: AppContainer(), coordinator: CaptureCoordinator())
}

#Preview("Viewfinder · low light") {
    let container = AppContainer()
    // Force the R1 low-light affordances for the preview.
    (container.camera as? MockCameraService)?.isLowLight = true
    return ViewfinderScreen(container: container, coordinator: CaptureCoordinator())
}
