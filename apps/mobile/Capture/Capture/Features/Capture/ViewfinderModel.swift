//  ViewfinderModel.swift
//  Capture
//
//  The state + logic behind C1/C2/C4 and the C3 card. Everything routes through
//  the CaptureKit seams: `camera` for frames + level telemetry, `store` for the
//  draft outbox, `location` for the venue stamp, `coordinator` for navigation.
//  The view stays declarative; this object owns the capture lifecycle.

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class ViewfinderModel {
    // ── Seams ──
    private let store: CaptureStore
    private let camera: any CameraService
    private let location: any LocationService
    private let analytics: any CaptureAnalytics
    private let coordinator: CaptureCoordinator

    // ── Mode + framing (C1/C2) ──
    var mode: CameraMode = .photo
    var roll: Double = 0
    var pitch: Double = 0
    var isLevel: Bool = true
    var luma: Double = 0.6
    var gridOn: Bool = true

    // ── Light (R1) ──
    var isLowLight: Bool = false
    var torchOn: Bool = false

    // ── Venue (S1 stamp, auto) ──
    var venueLabel: String?
    private var venueStamp: VenueStamp?

    // ── Session tray (V1) ──
    var sessionCount: Int = 0

    // ── Capture state ──
    var capturing: Bool = false
    var isHolding: Bool = false          // C4 multi-shot in progress
    var holdCount: Int = 0
    var cardSpecimen: Specimen?          // C3 card subject (nil = no card)
    var lastError: String?

    private let lowLightThreshold = 0.18
    private var frameTask: Task<Void, Never>?
    private var burstTask: Task<Void, Never>?
    private var holdTriggerTask: Task<Void, Never>?
    private var pressActive = false
    private var multiShotID: UUID?

    init(container: AppContainer, coordinator: CaptureCoordinator) {
        self.store = container.store
        self.camera = container.camera
        self.location = container.location
        self.analytics = container.analytics
        self.coordinator = coordinator
    }

    // MARK: Lifecycle

    func start() async {
        analytics.screen(CaptureScreenID.c1Viewfinder.rawValue)
        refreshSessionCount()
        mode = camera.currentMode
        isLowLight = camera.isLowLight
        await camera.start()
        frameTask?.cancel()
        frameTask = Task { [weak self] in await self?.observeFrames() }
        await stampVenue()
    }

    func stop() {
        frameTask?.cancel(); frameTask = nil
        burstTask?.cancel(); burstTask = nil
        holdTriggerTask?.cancel(); holdTriggerTask = nil
        camera.stop()
    }

    private func observeFrames() async {
        for await state in camera.frameState {
            roll = state.roll
            pitch = state.pitch
            if state.isLevel && !isLevel { CaptureHaptics.selection() }   // soft tick on level lock
            isLevel = state.isLevel
            luma = state.luma
            isLowLight = camera.isLowLight || state.luma < lowLightThreshold
        }
    }

    private func stampVenue() async {
        guard let venue = await location.currentVenue() else { return }
        venueStamp = venue
        venueLabel = venue.placemarkName ?? venue.room ?? "Stamped here"
    }

    private func refreshSessionCount() { sessionCount = store.session().count }

    // MARK: Mode (tap / swipe)

    func select(_ newMode: CameraMode) async {
        guard newMode != mode else { return }
        mode = newMode
        CaptureHaptics.selection()
        try? await camera.configure(mode: newMode)
        analytics.event("capture.mode", ["mode": newMode.rawValue])
    }

    func cycleMode(_ direction: Int) async {
        let all = CameraMode.allCases
        guard let index = all.firstIndex(of: mode) else { return }
        let next = all[(index + direction + all.count) % all.count]
        await select(next)
    }

    // MARK: Toggles

    func toggleTorch() {
        torchOn.toggle()
        camera.setTorch(torchOn ? .on : .off)
        CaptureHaptics.selection()
    }

    func toggleGrid() {
        gridOn.toggle()
        CaptureHaptics.selection()
    }

    // MARK: Session tray (swipe up → V1)

    func openSessionTray() {
        coordinator.navigate(to: .session)
    }

    // MARK: Work (W1 — designer/pro dashboard)

    func openWork() {
        analytics.event("work.open", ["from": "viewfinder"])
        coordinator.navigate(to: .work)
    }

    // MARK: Shutter press → single tap vs. multi-shot hold

    func pressChanged() {
        guard !pressActive, cardSpecimen == nil, !capturing else { return }
        pressActive = true
        holdTriggerTask?.cancel()
        holdTriggerTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(350))
            guard let self, !Task.isCancelled, self.pressActive else { return }
            await self.beginMultiShot()
        }
    }

    func pressEnded() {
        guard pressActive else { return }
        pressActive = false
        holdTriggerTask?.cancel(); holdTriggerTask = nil
        if isHolding {
            Task { await endMultiShot() }
        } else {
            Task { await captureSingle() }
        }
    }

    // MARK: Single frame → C3 card

    private func captureSingle() async {
        guard cardSpecimen == nil, !capturing, !isHolding else { return }
        capturing = true
        defer { capturing = false }
        CaptureHaptics.impact(.light)

        let draft = makeDraft()
        await captureFrame(into: draft, primary: true)
        guard !draft.photos.isEmpty else { discard(draft); return }

        applySmartGuess(to: draft)
        try? store.save()
        refreshSessionCount()
        analytics.event("capture", ["mode": mode.rawValue])
        cardSpecimen = draft
    }

    // MARK: Multi-shot (C4) → C5 sheet on release

    private func beginMultiShot() async {
        guard !isHolding, cardSpecimen == nil else { return }
        isHolding = true
        holdCount = 0
        let draft = makeDraft()
        multiShotID = draft.id
        CaptureHaptics.impact(.medium)
        burstTask = Task { [weak self] in
            while let self, !Task.isCancelled, self.isHolding {
                await self.captureFrame(into: draft, primary: self.holdCount == 0)
                self.holdCount = draft.photos.count
                CaptureHaptics.impact(.light)
                try? await Task.sleep(for: .milliseconds(450))
            }
        }
    }

    private func endMultiShot() async {
        isHolding = false
        burstTask?.cancel(); burstTask = nil
        CaptureHaptics.impact(.medium)
        guard let id = multiShotID, let draft = store.specimen(id: id) else { return }
        multiShotID = nil
        guard !draft.photos.isEmpty else { discard(draft); return }

        flagNearDuplicates(in: draft)
        applySmartGuess(to: draft)
        try? store.save()
        refreshSessionCount()
        analytics.event("capture.multishot", ["frames": String(draft.photos.count)])
        coordinator.present(.specimenSheet(id))
    }

    // MARK: C3 card actions

    func saveFromCard() {
        guard let specimen = cardSpecimen else { return }
        specimen.status = .ready
        try? store.save()
        CaptureHaptics.success()
        let id = specimen.id
        cardSpecimen = nil
        coordinator.present(.destination(id))          // S3 route & save
    }

    func addDetailFromCard() {
        guard let specimen = cardSpecimen else { return }
        let id = specimen.id
        cardSpecimen = nil
        coordinator.present(.specimenSheet(id))         // C5 full sheet
    }

    func dismissCard() {
        cardSpecimen = nil
        CaptureHaptics.selection()
    }

    // MARK: Plumbing

    private func makeDraft() -> Specimen {
        let draft = store.newDraft()
        draft.venue = venueStamp
        draft.category = .unknown
        return draft
    }

    private func captureFrame(into draft: Specimen, primary: Bool) async {
        do {
            if torchOn { camera.setTorch(.on) }
            let frame = try await camera.capture()
            let filename = "\(UUID().uuidString).heic"
            try? store.writeMedia(frame.data, filename: filename)
            let photo = CapturePhoto(
                filename: filename,
                width: frame.width,
                height: frame.height,
                isPrimary: primary,
                order: draft.photos.count,
                captureModeRaw: frame.mode.rawValue
            )
            photo.specimen = draft
            draft.photos.append(photo)
            if frame.isLowLight { isLowLight = true }
            lastError = nil
        } catch {
            lastError = "Couldn't capture — try again"
        }
    }

    private func discard(_ draft: Specimen) {
        store.delete(draft)
        try? store.save()
    }

    /// The viewfinder's v0.1 smart guess (N5). The real vision model lives
    /// app-side; here we seed category + material as clearly-badged guesses that
    /// never clobber a confirmed value (setValue enforces N5).
    private func applySmartGuess(to draft: Specimen) {
        if draft.provenance(for: .category) == nil || draft.category == .unknown {
            draft.setValue(SpecimenCategory.seating.rawValue, for: .category, source: .smartGuess)
            draft.setConfidence(0.72, for: .category)
        }
        if draft.provenance(for: .material) == nil {
            draft.setValue("Oak / bouclé", for: .material, source: .smartGuess)
            draft.setConfidence(0.6, for: .material)
        }
    }

    /// Auto-flag near-identical frames so the multi-shot set stays clean (F-02
    /// edge). Heuristic stand-in: same pixel dimensions as a kept frame.
    private func flagNearDuplicates(in draft: Specimen) {
        var seen = Set<String>()
        for photo in draft.photos.sorted(by: { $0.order < $1.order }) {
            let key = "\(photo.width)x\(photo.height)"
            if photo.isPrimary { seen.insert(key); continue }
            if seen.contains(key) { photo.isDuplicate = true } else { seen.insert(key) }
        }
    }
}
