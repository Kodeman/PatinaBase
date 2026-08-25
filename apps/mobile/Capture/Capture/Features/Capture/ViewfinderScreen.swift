//  ViewfinderScreen.swift
//  Capture
//
//  C1 — the app's home. A live camera (a dark "scene" gradient when there are no
//  frames, e.g. the simulator's MockCameraService) under five thumb-reach
//  regions: the visit chip, the C2 framing guides, the mode
//  selector, the shutter, and the session-tray handle. Low light (R1) surfaces a
//  torch + hint + Night chip without ever blocking the shutter. The shutter tap
//  freezes the frame into a C3 card; a hold rolls a C4 multi-shot into one
//  specimen and opens the C5 sheet on release.

import SwiftUI
import UIKit
import CaptureKit
import CaptureKitMocks   // #Preview only — MockCameraService for the low-light state

struct ViewfinderScreen: View {
    @State private var model: ViewfinderModel
    @State private var reachability = FieldReachability()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let coordinator: CaptureCoordinator

    init(container: AppContainer, coordinator: CaptureCoordinator) {
        _model = State(wrappedValue: ViewfinderModel(container: container, coordinator: coordinator))
        self.coordinator = coordinator
    }

    var body: some View {
        ZStack {
            // Live feed (real camera on device; gradient fallback otherwise) + framing chrome
            liveFeed
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
                if !reachability.isOnline {
                    OfflineQueueBanner(queuedCount: model.outboxDepth)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
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
                    saveTitle: model.quickSaveTitle,
                    onSave: model.saveFromCard,
                    onAddDetail: model.addDetailFromCard,
                    onDismiss: model.dismissCard,
                    placementLine: FieldPlacementLine.text(for: specimen),
                    placementIsUnplaced: FieldPlacementLine.isUnplaced(specimen),
                    onPlacement: { coordinator.present(.visit) }
                )
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                .zIndex(2)
            }
        }
        .background(CaptureColor.ink.ignoresSafeArea())
        // Camera chrome is deliberately dark (same rule as Patina's capture
        // surfaces): pin light so the dynamic tokens keep their designed
        // values instead of inverting under system dark mode.
        .environment(\.colorScheme, .light)
        .animation(cardAnimation, value: model.cardSpecimen?.id)
        .animation(cardAnimation, value: model.isHolding)
        .task {
            await model.start()
            reachability.start {
                Task { @MainActor in
                    await model.drainOnReconnect()
                }
            }
        }
        // V0 is a `.sheet` presented OVER C1 (RootView), so this screen never
        // disappears while the door is open: `.task` does not re-run and the
        // model would keep rendering the answer she gave BEFORE she answered it.
        // The sheet closing is the signal. Reading the store on change rather
        // than observing it is deliberate — CaptureSessionContextStore is a
        // plain class over UserDefaults with nothing to observe, and making it
        // observable would mean editing a closed contract.
        .onChange(of: coordinator.sheet) { _, sheet in
            if sheet == nil { model.visitDoorClosed() }
        }
        .onDisappear { model.stop() }
        .statusBarHidden(true)
        .accessibilityIdentifier(CaptureScreenID.c1Viewfinder.rawValue)
    }

    private var cardAnimation: Animation? { reduceMotion ? nil : .snappy }

    // MARK: Live feed

    /// The real device camera downcasts to `AVFoundationCameraService` (the lawful
    /// in-repo pattern, cf. `session as? RoomPlanScanSession`): show its preview
    /// when authorized, a Settings prompt when denied. Mock/sim keeps the exact
    /// gradient it always drew.
    @ViewBuilder private var liveFeed: some View {
        if let camera = model.camera as? AVFoundationCameraService {
            switch model.cameraAuthorization {
            case .authorized:
                CameraPreviewView(session: camera.previewSession)
            case .denied:
                ZStack {
                    ViewfinderSceneBackdrop(luma: model.luma)
                    CameraAccessDeniedNotice()
                }
            case .notDetermined:
                ViewfinderSceneBackdrop(luma: model.luma)
            }
        } else {
            ViewfinderSceneBackdrop(luma: model.luma)
        }
    }

    // MARK: Top bar — the visit (left) + night/torch status (right)

    private var topBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                ViewfinderWorkButton(action: model.openWork)
                ViewfinderVisitChip(chip: model.visitChip) {
                    coordinator.present(.visit)
                }
            }
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

// MARK: - Denied state (R3 tone)

/// Shown over the gradient when camera access is off. Tone matches R3's decline
/// copy: rust glyph, a one-line reason, and a route to Settings.
private struct CameraAccessDeniedNotice: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "camera.slash")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.error)

            Text("Camera access is off for Patina Field")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.paper)
                .multilineTextAlignment(.center)

            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
            .font(CaptureType.bodyEmph)
            .foregroundStyle(CaptureColor.ink)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(CaptureColor.paper, in: Capsule())
        }
        .padding(24)
        .frame(maxWidth: 300)
        .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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
