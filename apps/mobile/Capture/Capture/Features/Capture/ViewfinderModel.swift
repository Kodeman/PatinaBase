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
    let camera: any CameraService
    private let location: any LocationService
    private let analytics: any CaptureAnalytics
    private let coordinator: CaptureCoordinator
    private let sync: any CaptureSyncService
    private let session: any SessionProviding
    private let companion: FieldCompanionController
    private let sessionContext: CaptureSessionContextStore
    private let smartGuess: any SmartGuessService
    private let voice: any VoiceNoteService
    private let featureFlags: CaptureFeatureFlags
    private var visitID: UUID?
    /// R119: the Companion strip ends a visit INLINE, with no sheet, so the
    /// `.onChange(of: coordinator.sheet)` hook never fires and the chip goes on
    /// naming a visit that is over. The store says when a visit begins or ends.
    /// `nonisolated(unsafe)`: written once in `init` on the main actor and read
    /// only in `deinit`, which runs after the last reference is gone.
    private nonisolated(unsafe) var visitObserver: NSObjectProtocol?

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

    // ── Camera permission (device only; mirrored from AVFoundationCameraService) ──
    private(set) var cameraAuthorization: CameraAuthorization = .notDetermined

    // ── Venue (S1 stamp, auto) ──
    private var venueStamp: VenueStamp?
    /// True once the location lookup has come BACK — success or nothing found.
    /// `venueStamp != nil` cannot stand in for it: a lookup that finds no
    /// placemark would otherwise leave the chip reading "Locating venue…" for
    /// the rest of the session.
    private var venueSettled = false

    // ── The visit (Invariant V) ──
    var visitChip: FieldVisitChip = FieldVisitChipBuilder.chip(for: .none, isLocating: true)
    private(set) var visitState: CaptureVisitState = .none

    /// The visit door closed. Refresh the chip, then let the capture still in
    /// her hand keep the C3 line's promise: an unplaced draft adopts the visit
    /// she just started at the door, so the card she returns to names where the
    /// capture landed instead of still asking her to place it. FC-R6 is
    /// untouched — an already-saved capture waits on Today.
    func visitDoorClosed(now: Date = Date()) {
        refreshVisit(now: now)
        guard let draft = cardSpecimen,
              FieldInHandPlacement.adopt(visitState, into: draft) else { return }
        try? store.save()
    }

    func refreshVisit(now: Date = Date()) {
        visitState = sessionContext.visitState(
            identity: CaptureSessionIdentity(userID: session.userID,
                                             workspaceID: session.workspaceID),
            now: now)
        visitChip = FieldVisitChipBuilder.chip(for: visitState,
                                               isLocating: !venueSettled && !visitState.isVisit)
    }

    // ── Session tray (V1) ──
    var sessionCount: Int = 0

    // ── Capture state ──
    var capturing: Bool = false
    var isHolding: Bool = false          // C4 multi-shot in progress
    var holdCount: Int = 0
    var cardSpecimen: Specimen?          // C3 card subject (nil = no card)
    var lastError: String?

    var quickSaveTitle: String {
        switch cardSpecimen?.destination {
        case .library: return "Save to library"
        case .inbox: return "Send to inbox"
        default: return "Choose destination"
        }
    }

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
        self.sync = container.sync
        self.session = container.session
        self.companion = container.companion
        self.smartGuess = container.smartGuess
        self.featureFlags = container.featureFlags
        self.voice = SpeechVoiceNoteService(mediaDirectory: container.store.mediaDirectory(),
                                            analytics: container.analytics,
                                            surface: "c3")
        self.sessionContext = .shared
        observeVisitChanges()
    }

    deinit {
        if let visitObserver { NotificationCenter.default.removeObserver(visitObserver) }
    }

    private func observeVisitChanges() {
        visitObserver = NotificationCenter.default.addObserver(
            forName: CaptureSessionContextStore.visitDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.refreshVisit() }
        }
    }

    // MARK: Lifecycle

    func start() async {
        analytics.screen(CaptureScreenID.c1Viewfinder.rawValue)
        visitID = currentSessionContext().visitID
        refreshVisit()
        refreshSessionCount()
        mode = camera.currentMode
        isLowLight = camera.isLowLight
        await camera.start()
        guard !Task.isCancelled else {
            // `stop()` may have run while camera authorization was awaiting.
            // Do not install a new frame observer after the view has disappeared.
            camera.stop()
            return
        }
        if let av = camera as? AVFoundationCameraService {
            cameraAuthorization = av.authorization
        }
        frameTask?.cancel()
        frameTask = Task { [weak self] in await self?.observeFrames() }
        await stampVenue()
    }

    func stop() {
        endCardNote()                        // FC-R9: never a live mic behind a gone screen
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
        venueStamp = await location.currentVenue()
        venueSettled = true
        refreshVisit()
    }

    private func refreshSessionCount() {
        switch localListScope {
        case .globalFixtures:
            sessionCount = store.session(visitID: visitID).count
        case .owner(let owner):
            sessionCount = store.session(visitID: visitID, owner: owner).count
        case .unavailable:
            sessionCount = 0
        }
    }

    // MARK: Mode (tap / swipe)

    func select(_ newMode: CameraMode) async {
        guard newMode != mode else { return }
        mode = newMode
        CaptureHaptics.selection()
        try? await camera.configure(mode: newMode)
        analytics.event("capture.mode", ["mode": newMode.rawValue])
    }

    func cycleMode(_ direction: Int) async {
        let all = CameraMode.viewfinderSelectable
        let index = all.firstIndex(of: mode) ?? 0
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

    // MARK: Offline banner + reconnect drain (C1)

    private var activeOwner: CaptureOwnerIdentity? {
        CaptureOwnerIdentity(userID: session.userID, workspaceID: session.workspaceID)
    }

    /// The banner's copy is "No signal · saving on device" with queuedCount
    /// presented as QUEUED, so it must be the outbox depth — the same source
    /// LocalCaptureSyncService feeds to CaptureSyncAttributes.queued — not
    /// sessionCount, which counts specimens in the current visit (:47, :133-137).
    /// A designer with 12 already-synced captures and nothing queued must not
    /// be told "12 queued".
    ///
    /// Mirrors LocalCaptureSyncService.scopedOutbox: the unscoped, device-wide
    /// outbox is a safe fallback only in mock/local mode. With real sync active,
    /// an unresolved owner (e.g. mid session-hydration) fails CLOSED — never
    /// surface another owner's queued captures on a shared phone.
    var outboxDepth: Int {
        guard let owner = activeOwner else {
            return AppConfiguration.runsRealServices ? 0 : store.outbox().count
        }
        return store.outbox(owner: owner).count
    }

    /// Regained connectivity never auto-drained before this; a day's captures
    /// could sit in the outbox until she happened to open the tray.
    func drainOnReconnect() async {
        analytics.event("sync.reconnect_drain")
        await sync.drain()
    }

    // MARK: Work (W1 — designer/pro dashboard)

    func openWork() {
        analytics.event("work.open", ["from": "viewfinder"])
        // Release AV/AR resources before the realm transition; onDisappear
        // repeats stop() defensively for every other Work entry path.
        stop()
        coordinator.switchRealm(.work)
    }

    // MARK: Shutter press → single tap vs. multi-shot hold

    func pressChanged() {
        guard !pressActive, cardSpecimen == nil, !capturing else { return }
        pressActive = true
        guard mode == .photo else { return }
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

        guard let draft = makeDraft() else { return }
        await captureFrame(into: draft, primary: true)
        guard let currentDraft = currentSpecimen(id: draft.id) else { return }
        guard !currentDraft.photos.isEmpty else { discard(currentDraft); return }

        applySmartGuess(to: currentDraft)
        try? store.save()
        refreshSessionCount()
        analytics.event("capture", ["mode": mode.rawValue])
        switch SpecimenCapturePolicy.nextStep(for: mode) {
        case .quickConfirm:
            cardSpecimen = currentDraft
        case .tagOCR:
            coordinator.present(.ocr(currentDraft.id))
        case .codeScan:
            coordinator.present(.code(currentDraft.id))
        case .measure:
            coordinator.present(.measure(currentDraft.id))
        }
    }

    // MARK: Multi-shot (C4) → C5 sheet on release

    private func beginMultiShot() async {
        guard !isHolding, cardSpecimen == nil else { return }
        guard let draft = makeDraft() else { return }

        isHolding = true
        holdCount = 0
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
        guard let id = multiShotID else { return }
        multiShotID = nil
        guard let draft = currentSpecimen(id: id) else { return }
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
        endCardNote()
        CaptureHaptics.success()
        let id = specimen.id
        cardSpecimen = nil
        if specimen.destination == .undecided {
            let resolved = FieldDestinationPolicy.destination(for: visitState)
            if resolved == .undecided {
                // No visit: S3 still owns the choice.
                specimen.status = .ready
                try? store.save()
                coordinator.present(.destination(id))
                return
            }
            specimen.destination = resolved
            try? store.save()
        }
        Task { @MainActor in
            do {
                // The program's headline metric, read BEFORE the route: placement
                // and sync are different axes (FC-R6), so whether this capture
                // landed on a project does not wait on the server to answer.
                analytics.event(specimen.isUnplaced ? "capture.unplaced" : "capture.placed", [
                    "basis": visitState.isVisit ? "visit" : "manual",
                    "has_room": (specimen.venue?.room?.isEmpty == false) ? "true" : "false"
                ])
                try await sync.route(id, to: specimen.destination)
                coordinator.present(specimen.destination == .library
                    ? .savedTerminal(id)
                    : .inboxTerminal(id))
            } catch {
                // The local record still exists; S3 exposes the recoverable choice.
                coordinator.present(.destination(id))
            }
        }
    }

    func addDetailFromCard() {
        guard let specimen = cardSpecimen else { return }
        endCardNote()
        let id = specimen.id
        cardSpecimen = nil
        coordinator.present(.specimenSheet(id))         // C5 full sheet
    }

    func dismissCard() {
        endCardNote()
        cardSpecimen = nil
        CaptureHaptics.selection()
    }

    /// The C3 card's one tap to the only project picker in the app. S1 is
    /// reachable from three places today and none of them is the capture path,
    /// so a capture taken from the shutter could never inherit a project.
    func placeFromCard() {
        guard let id = cardSpecimen?.id else { return }
        analytics.event("capture.place_tapped", ["surface": "c3"])
        UserDefaults.standard.set("card", forKey: "capture.routingSource")
        coordinator.present(.assignVenue(id))
    }

    // MARK: C3 inline mic (spec §7.5, wave 3)

    private(set) var isRecordingCardNote = false
    private(set) var cardTranscript = ""
    private var cardVoiceTask: Task<Void, Never>?

    var micIsAvailable: Bool { featureFlags.isEnabled("field-companion-voice") }

    func beginCardNote(affirmed: Bool) {
        guard micIsAvailable, !isRecordingCardNote, let specimen = cardSpecimen else { return }
        // FC-R11 (Ruling 4): a conversation note does not start until she taps.
        guard !FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: specimen.noteSetting, affirmed: affirmed) else { return }
        do {
            // The recorder emits the ONE voice.start (it already carries
            // surface "c3"); this is what stops that row asserting "solo" over
            // a conversation note — FC-R11's only audit trail.
            voice.setNoteSetting(specimen.noteSetting ?? .solo)
            let stream = try voice.startLiveTranscription()
            isRecordingCardNote = true
            cardTranscript = ""
            cardVoiceTask = Task { [weak self] in
                do {
                    for try await chunk in stream {
                        guard !Task.isCancelled else { return }
                        self?.cardTranscript = chunk.text
                    }
                } catch {
                    // A stream that dies on its own leaves the mic glyph and
                    // "Recording — release to keep it" describing a note that
                    // has already ended. Recording chrome must never overstate
                    // what is happening (FC-R11). `endCardNote` is reached only
                    // from here — a cancel from `endCardNote` itself clears the
                    // flag first, so this cannot re-enter.
                    guard let self, self.isRecordingCardNote else { return }
                    self.endCardNote()
                    self.lastError = "The note stopped early. What you said up to then is saved."
                }
            }
        } catch {
            lastError = "The microphone didn't open. Your photo is safe."
        }
    }

    func endCardNote() {
        guard isRecordingCardNote else { return }
        cardVoiceTask?.cancel()
        isRecordingCardNote = false
        let partial = cardTranscript
        // FC-R9: `finish()` tears the audio session down, so it is awaited even
        // when the card has already gone — resolving the subject BEFORE the
        // await is what keeps a released hold from leaving the mic live.
        let subject = cardSpecimen
        Task { @MainActor [weak self] in
            guard let self else { return }
            let result = await self.voice.finish()
            guard let specimen = subject else { return }
            let transcript = result.transcript.isEmpty ? partial : result.transcript
            let hasAudio = result.audioFilename != nil || !result.audioSegments.isEmpty
            guard !transcript.isEmpty || hasAudio else {
                self.analytics.event("voice.empty_transcript", ["had_audio": "false"])
                self.lastError = "Nothing came through — try again when it's quieter."
                return
            }
            if transcript.isEmpty {
                self.analytics.event("voice.empty_transcript", ["had_audio": "true"])
            }
            specimen.voiceTranscript = transcript.isEmpty ? nil : transcript
            specimen.voicePartialTranscript = partial.isEmpty ? nil : partial
            specimen.voiceAudioFilename = result.audioFilename
            specimen.voiceDurationSeconds = result.durationSeconds
            specimen.voiceTranscriptSourceRaw = result.transcript.isEmpty
                ? "device_partial" : "device"
            specimen.voiceAudioSegmentsRaw = result.audioSegments.isEmpty
                ? nil : result.audioSegments
            specimen.touch()
            try? self.store.save()
            // No voice.finish here: `SpeechVoiceNoteService.emitFinish` is the
            // one place it fires (Wave 1's P-1 ruling) and now carries the
            // surface itself. A second row here double-counted every note.
        }
    }

    // MARK: Plumbing

    private func makeDraft() -> Specimen? {
        guard localListScope != .unavailable else {
            reportOwnerUnavailable()
            return nil
        }

        let context = currentSessionContext()
        visitID = context.visitID
        guard let draft = CaptureOwnerProjectionPolicy.newDraft(
            store: store,
            sessionID: context.visitID,
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID
        ) else {
            reportOwnerUnavailable()
            return nil
        }

        draft.venue = context.routing.stamped(onto: venueStamp ?? VenueStamp())
        draft.category = .unknown
        draft.destination = context.routing.destination
        draft.inherit(context)
        return draft
    }

    private func currentSpecimen(id: UUID) -> Specimen? {
        CaptureOwnerProjectionPolicy.specimen(
            id: id,
            store: store,
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    private func reportOwnerUnavailable() {
        let message = "Choose a workspace before capturing."
        lastError = message
        companion.send(.communicate(.init(
            title: "Choose a workspace",
            detail: "Patina needs an active studio before it can save this capture."
        )))
    }

    private func currentSessionContext() -> CaptureSessionContext {
        sessionContext.current(identity: CaptureSessionIdentity(
            userID: session.userID,
            workspaceID: session.workspaceID))
    }

    private var localListScope: CaptureLocalListScope {
        CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    private func captureFrame(into draft: Specimen, primary: Bool) async {
        do {
            if torchOn { camera.setTorch(.on) }
            let frame = try await camera.capture()
            guard !Task.isCancelled, currentSpecimen(id: draft.id) != nil else { return }

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

    /// Read the frame we just took and record what it says — the real reader,
    /// not a placeholder. The read is deferred off the synchronous shutter call
    /// so the shutter does not block on it, and the fields land when it
    /// completes; `setValue` still refuses to let a guess clobber anything a tag,
    /// a scan, a measure or the designer set.
    private func applySmartGuess(to draft: Specimen) {
        guard let photo = draft.primaryPhoto else { return }
        let mediaURL = store.mediaURL(for: photo.filename)
        let width = photo.width
        let height = photo.height
        let draftID = draft.id
        Task { [weak self] in
            guard let self else { return }
            guard let data = try? Data(contentsOf: mediaURL), !data.isEmpty else { return }
            let image = CaptureImage(data: data, width: width, height: height)
            let guess = await self.smartGuess.guess(image: image, ocr: [], codes: [])
            let recordable = guess.fieldsWorthRecording
            guard !recordable.isEmpty,
                  let current = self.currentSpecimen(id: draftID),
                  // She can route this record while the read is still running.
                  // Once it has left the device it must not be rewritten.
                  current.transferState.phase == .local else { return }
            current.recordSmartGuess(recordable)
            try? self.store.save()
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
