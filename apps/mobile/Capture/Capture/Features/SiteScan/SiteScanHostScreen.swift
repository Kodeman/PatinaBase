//  SiteScanHostScreen.swift
//  Capture · Wave F (Pro site-scan)
//
//  The `.siteScan(projectID:projectRoomID:)` route host. ONE route, THREE internal
//  steps — F2 scan → F3 review → F4 upload — each rendered as its own step root
//  carrying its own screen a11y id (mirroring how the G receiving sheet steps
//  G2→G3). The frozen deep-link harness drives all of f2/f3/f4 to this one route,
//  so it opens on F2; F3/F4 are reached by finishing/continuing (and by the
//  per-file previews).
//
//  F2 hosts the live RoomPlan view on device by down-casting the frozen
//  `any FieldScanSession` to this flow's concrete `RoomPlanScanSession` (the frozen
//  protocol deliberately stays UIKit/RoomPlan-free, so the view host lives here).
//  On the simulator / mock the cast fails and F2 shows the scanning backdrop while
//  MockScanSession's scripted coverage ramp drives the meter.

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class SiteScanHostModel {
    // Not Equatable — FieldScanResult isn't, and the host only ever switches on
    // the current step, never compares two.
    enum Step {
        case scanning
        case anchoring          // item 6 — typed anchor entry (session still alive)
        case review(FieldScanResult)
        case upload(FieldScanResult)
    }

    var step: Step = .scanning
    var coverage: Double = 0
    var status: String = "Preparing scan…"
    var scanError: String?
    /// Live coach detail (item 5) — per-surface checklist + warnings. Nil until the
    /// first `.coverageUpdate` (device real mode, or the mock's scripted ramp).
    var coverageSnapshot: CoverageSnapshot?
    var session: (any FieldScanSession)?
    /// Editable scan name — seeded from F1's handoff, tweaked in F3, sent in F4.
    var name: String

    /// The room's larger plan dimension (metres) for the anchor coach's long/short
    /// heuristic (M4 · item 4) — best-effort from the live RoomPlan room; nil on the
    /// mock/sim, where the coach falls back to the absolute short-span floor.
    var roomLargerPlanDimensionMeters: Double? {
        #if canImport(RoomPlan)
        if let roomSession = session as? RoomPlanScanSession, let d = roomSession.dimensionsMeters {
            return max(d.x, d.z)
        }
        #endif
        return nil
    }

    private let siteScan: any SiteScanService
    private var eventTask: Task<Void, Never>?

    // Item-7 context capture (mid-scan photo + voice → Capture Inbox).
    private let store: CaptureStore
    private let projectID: String?
    private let projectRoomID: String?
    private let voiceService: any VoiceNoteService

    @ObservationIgnored lazy var contextModel = SiteScanContextModel(
        store: store, projectID: projectID, projectRoomID: projectRoomID, voice: voiceService,
        scanSessionIdProvider: { [weak self] in (self?.session as? ContextCapturing)?.scanSessionId },
        frameProvider: { [weak self] in (self?.session as? ContextCapturing)?.captureContextFrame() })

    init(siteScan: any SiteScanService, name: String, store: CaptureStore,
         projectID: String?, projectRoomID: String?, voice: any VoiceNoteService) {
        self.siteScan = siteScan
        self.name = name
        self.store = store
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.voiceService = voice
    }

    func startScan() async {
        scanError = nil
        coverage = 0
        status = "Preparing scan…"
        do {
            let scan = try await siteScan.startSession()
            session = scan
            consume(scan)
        } catch {
            scanError = (error as? LocalizedError)?.errorDescription ?? "Couldn't start the scan."
        }
    }

    /// Drain the session's coverage/status stream into observable state.
    private func consume(_ scan: any FieldScanSession) {
        eventTask?.cancel()
        eventTask = Task { [weak self] in
            for await event in scan.events {
                guard let self else { return }
                switch event {
                case .coverage(let value): self.coverage = value
                case .status(let line): self.status = line
                case .coverageUpdate(let snapshot): self.coverageSnapshot = snapshot
                }
            }
        }
    }

    /// End scanning and move to the typed-anchor step WITHOUT tearing the session
    /// down (item 6) — raycasting anchors needs the live shared session. The anchor
    /// step then calls `finishScan()` to build the room + persist anchors.
    func beginAnchoring() {
        eventTask?.cancel()          // stop draining coverage updates; keep the session
        (session as? AnchorCapturing)?.beginAnchoringPhase()   // A4: quiesce depth + posed
        step = .anchoring
    }

    func finishScan() async {
        do {
            guard let result = try await session?.finish() else { return }
            eventTask?.cancel()
            step = .review(result)
        } catch SiteScanError.cancelled {
            // Raced with a cancel/teardown — no error to surface.
        } catch {
            scanError = (error as? LocalizedError)?.errorDescription ?? "Couldn't finish the scan."
        }
    }

    func cancelScan() {
        eventTask?.cancel()
        session?.cancel()
    }

    func retake() {
        step = .scanning
        Task { await startScan() }
    }

    func proceedToUpload(_ result: FieldScanResult) {
        step = .upload(result)
    }
}

struct SiteScanHostScreen: View {
    let container: AppContainer
    let coordinator: CaptureCoordinator
    let projectID: String?
    let projectRoomID: String?
    private let handoffProjectName: String?

    @State private var model: SiteScanHostModel

    init(container: AppContainer, coordinator: CaptureCoordinator,
         projectID: String?, projectRoomID: String?, handoff: SiteScanHandoff) {
        self.container = container
        self.coordinator = coordinator
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.handoffProjectName = handoff.projectName
        let name = handoff.name.isEmpty ? SiteScanSetupModel.defaultName() : handoff.name
        _model = State(wrappedValue: SiteScanHostModel(
            siteScan: container.siteScan, name: name, store: container.store,
            projectID: projectID, projectRoomID: projectRoomID,
            voice: SpeechVoiceNoteService(mediaDirectory: container.store.mediaDirectory())))
    }

    var body: some View {
        content
            .task {
                container.analytics.screen(CaptureScreenID.f2SiteScan.rawValue)
                if model.session == nil { await model.startScan() }
            }
            .navigationBarBackButtonHidden(true)
            .onDisappear { model.cancelScan() }
    }

    @ViewBuilder private var content: some View {
        switch model.step {
        case .scanning:
            SiteScanScanStep(model: model,
                             analytics: container.analytics,
                             onCancel: {
                                 model.cancelScan()
                                 coordinator.goBack()
                             })
        case .anchoring:
            SiteScanAnchorStep(model: model,
                               analytics: container.analytics,
                               onDone: { Task { await model.finishScan() } })
        case .review(let result):
            SiteScanReviewStep(
                result: result, model: model, analytics: container.analytics,
                onRetake: { model.retake() },
                onContinue: { model.proceedToUpload(result) })
        case .upload(let result):
            SiteScanUploadStep(
                result: result, name: model.name,
                projectID: projectID, projectRoomID: projectRoomID,
                projectName: uploadProjectName, container: container,
                onDone: { coordinator.popToRoot() })
        }
    }

    /// Project label F1 handed off for the F4 destination summary (nil on a direct
    /// deep-link into `.siteScan` — the upload step then resolves it lazily).
    private var uploadProjectName: String? { handoffProjectName }
}

// MARK: - F2 · Scan step

struct SiteScanScanStep: View {
    let model: SiteScanHostModel
    let analytics: any CaptureAnalytics
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            scanSurface.ignoresSafeArea()
            VStack(spacing: 0) {
                SiteScanCoverageMeter(coverage: model.coverage, status: model.status)
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                if let snapshot = model.coverageSnapshot {
                    SiteScanCoachOverlay(snapshot: snapshot)
                        .padding(.horizontal, 18)
                        .padding(.top, 10)
                }
                Spacer()
                SiteScanContextControls(model: model.contextModel)   // item 7 — photo/voice → Inbox
                    .padding(.bottom, 8)
                if let scanError = model.scanError { errorBanner(scanError) }
                controls
            }
        }
        .statusBarHidden(true)
        // AR scan chrome stays deliberately dark — pin light so the dynamic
        // tokens keep their designed values under system dark mode.
        .environment(\.colorScheme, .light)
        .accessibilityIdentifier(CaptureScreenID.f2SiteScan.rawValue)
    }

    @ViewBuilder private var scanSurface: some View {
        #if canImport(RoomPlan)
        if let roomSession = model.session as? RoomPlanScanSession {
            RoomCaptureViewContainer(session: roomSession)
        } else {
            SiteScanBackdrop()
        }
        #else
        SiteScanBackdrop()
        #endif
    }

    private var controls: some View {
        HStack(spacing: 12) {
            SiteScanSecondaryButton(title: "Cancel", systemImage: "xmark", tint: CaptureColor.error) {
                analytics.event("siteScan.cancel")
                onCancel()
            }
            SiteScanPrimaryButton(title: "Finish", systemImage: "checkmark") {
                analytics.event("siteScan.finish")
                model.beginAnchoring()          // → typed anchor entry (item 6)
            }
            .disabled(model.scanError != nil)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .background(.ultraThinMaterial)
    }

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.paper3)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CaptureColor.error, in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 18)
            .padding(.bottom, 8)
    }
}

#if DEBUG
#Preview("F2 · Scan") {
    let container = AppContainer()
    return NavigationStack {
        SiteScanHostScreen(container: container, coordinator: CaptureCoordinator(),
                           projectID: "proj-9f2a41", projectRoomID: nil,
                           handoff: SiteScanHandoff())
    }
}
#endif
