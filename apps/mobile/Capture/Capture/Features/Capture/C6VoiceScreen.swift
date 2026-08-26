//  C6VoiceScreen.swift
//  Capture
//
//  C6 · VOICE — the fifth CameraMode (spec §7.4). A full-bleed mode of the
//  viewfinder, not a sheet, so it inherits the visit chip, the offline banner
//  and the mode selector. FC-R9: foreground only.

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class C6VoiceModel {
    private let store: CaptureStore
    private let sync: any CaptureSyncService
    private let analytics: any CaptureAnalytics
    private let voice: any VoiceNoteService
    private let featureFlags: CaptureFeatureFlags
    private let owner: CaptureOwnerIdentity?
    private let visit: CaptureVisitState

    private(set) var state: FieldVoiceModeState = .idle
    private(set) var transcript = ""
    /// Completed rotations so far — the segment arm of the cap. Never rendered:
    /// §7.4 deletes "seg 3" from the chrome; this feeds the machine.
    private(set) var segmentCount = 0
    private var started: Date?
    private var task: Task<Void, Never>?
    private var ticker: Task<Void, Never>?

    init(container: AppContainer, visit: CaptureVisitState) {
        store = container.store
        sync = container.sync
        analytics = container.analytics
        // `analytics` and `surface` are NOT defaults to accept: the recorder
        // defaults them to MockCaptureAnalytics/"n4", which would drop C6's
        // telemetry on the floor and mislabel anything that escaped. Every
        // other call site passes both (ViewfinderModel "c3",
        // SiteScanContextCapture "f2"); C6 is "c6".
        voice = SpeechVoiceNoteService(mediaDirectory: container.store.mediaDirectory(),
                                       analytics: container.analytics,
                                       surface: "c6")
        featureFlags = container.featureFlags
        owner = container.session.ownerIdentity
        self.visit = visit
    }

    var isRecording: Bool {
        switch state {
        case .recording, .transcriptUnavailable: return true
        default: return false
        }
    }

    var noteSetting: FieldNoteSetting {
        guard let context = visit.context, let kind = context.kind else { return .solo }
        return CaptureVisitDraft(kind: kind, kit: context.kit).defaultNoteSetting
    }

    func toggle(affirmed: Bool) {
        if isRecording {
            stop()
        } else if !FieldAffirmationPolicy.recordingIsBlocked(noteSetting: noteSetting,
                                                             affirmed: affirmed) {
            start()
        }
    }

    func start() {
        guard featureFlags.isEnabled("field-companion-voice") else { return }
        started = Date()
        segmentCount = 0
        transcript = ""
        do {
            // FC-R11: the recorder emits the ONE `voice.start`, and this is what
            // stops that row asserting "solo" over a conversation note — the
            // consent rule's only audit trail. The protocol default is a no-op,
            // so omitting it compiles clean and silently mislabels every note.
            voice.setNoteSetting(noteSetting)
            let stream = try voice.startLiveTranscription()
            state = .recording(elapsed: 0)
            task = Task { [weak self] in
                do {
                    for try await chunk in stream {
                        guard !Task.isCancelled else { return }
                        self?.transcript = chunk.text
                    }
                } catch {}
            }
        } catch {
            // §15.4: the recogniser refusing NEVER stops the recording.
            state = .transcriptUnavailable(elapsed: 0)
        }
        startTicker()
    }

    private func startTicker() {
        ticker = Task { [weak self] in
            while let self, !Task.isCancelled, self.isRecording {
                try? await Task.sleep(for: .seconds(1))
                guard let started = self.started else { return }
                let elapsed = Date().timeIntervalSince(started)
                // A REAL count. Passing a literal 0 here made the segment arm of
                // VoiceRecordingPolicy.shouldEnd unreachable, so the 24-segment
                // cap could never fire and its unit test covered a branch the
                // shipped path could not take.
                self.segmentCount = FieldVoiceModeMachine.segments(forElapsed: elapsed)
                self.state = FieldVoiceModeMachine.next(self.state, elapsed: elapsed,
                                                        segments: self.segmentCount)
                if self.state == .capped { self.stop() }
            }
        }
    }

    func stop() {
        task?.cancel(); ticker?.cancel()
        let partial = transcript
        let wasCapped = state == .capped
        if !wasCapped { state = .idle }
        Task { @MainActor [weak self] in
            guard let self, let owner = self.owner else { return }
            let result = await self.voice.finish()
            let text = result.transcript.isEmpty ? partial : result.transcript
            let hasAudio = result.audioFilename != nil || !result.audioSegments.isEmpty
            guard !text.isEmpty || hasAudio else {
                self.analytics.event("voice.empty_transcript", ["had_audio": "false"])
                return
            }
            if text.isEmpty {
                self.analytics.event("voice.empty_transcript", ["had_audio": "true"])
            }
            await self.commit(result, text: text, owner: owner)
        }
    }

    /// The note itself. `voice.finish` is NOT emitted here — `SpeechVoiceNoteService`
    /// already fired it from `emitFinish(reason:)`, which P-1 rules is the one
    /// place it may fire so a query never sees two disjoint property shapes.
    private func commit(_ result: VoiceNoteResult, text: String,
                        owner: CaptureOwnerIdentity) async {
        let service = ContextCaptureService(store: store, owner: owner)
        let created = service.enqueueVoice(
            transcript: text,
            audioFilename: result.audioFilename,
            durationSeconds: result.durationSeconds,
            provenance: ContextCaptureProvenance(
                scanSessionId: nil,
                projectId: visit.context?.routing.projectID,
                // FC-R5 holds: this is the SCAN lane's `public.rooms` id, which
                // rides in provenance because it is incompatible with
                // `field_captures.project_room_id`. The CAPTURE lane's room
                // reaches the column below, via `routing.stamped(onto:)`.
                projectRoomId: visit.context?.scanRoomID,
                cameraPoseRowMajor: nil,
                capturedAt: ISO8601DateFormatter().string(from: Date())))
        if let context = visit.context {
            created.venue = context.routing.stamped(onto: created.venue ?? VenueStamp())
            created.inherit(context)
        }
        created.noteSetting = noteSetting
        created.voiceAudioSegmentsRaw = result.audioSegments.isEmpty
            ? nil : result.audioSegments
        created.voiceTranscriptSourceRaw = result.transcript.isEmpty
            ? "device_partial" : "device"
        created.captureKindRaw = "note"
        try? store.save()
        await sync.enqueue(created.id)
    }

    /// FC-R9: no background audio. Lock or backgrounding pauses honestly.
    func interrupt() {
        guard isRecording else { return }
        analytics.event("voice.interrupted", ["reason": "backgrounded"])
        stop()
        state = .interrupted
    }
}

struct C6VoiceScreen: View {
    let container: AppContainer
    let coordinator: CaptureCoordinator
    let chip: FieldVisitChip
    let visit: CaptureVisitState

    @State private var model: C6VoiceModel?
    /// ONE source of truth for the affirmation: the chip's binding and the
    /// value handed to `toggle(affirmed:)` are the same fact. Two `@State`s
    /// here would leave a conversation note permanently unable to record.
    @State private var affirmed = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(spacing: 18) {
            Spacer(minLength: 8)
            if let model {
                transcriptCard(model)
                Text(line(for: model.state))
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.paper2)
                    .multilineTextAlignment(.center)
                if let elapsed = elapsed(for: model.state) {
                    Text(elapsed)
                        .font(CaptureType.monoBody)
                        .foregroundStyle(CaptureColor.paper)
                }
                // FC-R11 (Ruling 4): the SAME chip C3 renders, with the same
                // gate beneath it. One component, one rule, one test.
                if !model.isRecording {
                    FieldAffirmationChip(noteSetting: model.noteSetting, affirmed: $affirmed)
                }
                toggleControl(model)
            }
            Spacer(minLength: 8)
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task {
            container.analytics.screen(CaptureScreenID.c6Voice.rawValue)
            if model == nil { model = C6VoiceModel(container: container, visit: visit) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { model?.interrupt() }
        }
        .accessibilityIdentifier(CaptureScreenID.c6Voice.rawValue)
    }

    @ViewBuilder private func transcriptCard(_ model: C6VoiceModel) -> some View {
        if !model.transcript.isEmpty {
            Text(model.transcript)
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.paper)
                .lineLimit(6)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(.black.opacity(0.38), in: RoundedRectangle(cornerRadius: 16))
        }
    }

    /// Shutter-sized and shutter-placed. It stays rendered and enabled in
    /// `.transcriptUnavailable` — that state's copy names no gesture, so this
    /// control is the whole affordance for ending a twenty-minute recording.
    private func toggleControl(_ model: C6VoiceModel) -> some View {
        Button { model.toggle(affirmed: affirmed) } label: {
            ZStack {
                Circle()
                    .fill(model.isRecording ? CaptureColor.terracotta : CaptureColor.paper)
                    .frame(width: 78, height: 78)
                Image(systemName: model.isRecording ? "stop.fill" : "mic.fill")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(model.isRecording ? CaptureColor.paper : CaptureColor.ink)
            }
        }
        .buttonStyle(.plain)
        .disabled(FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: model.noteSetting, affirmed: affirmed) && !model.isRecording)
        .accessibilityLabel(model.isRecording ? "Stop" : "Tap to start")
        .accessibilityIdentifier("voice.toggle")
    }

    /// `FieldVoiceModeCopy.line(for: .idle)` discards the visit label by
    /// construction, and naming where the note will land BEFORE she speaks is
    /// that line's entire purpose — so the idle arm calls `idleLine` directly.
    private func line(for state: FieldVoiceModeState) -> String {
        state == .idle ? FieldVoiceModeCopy.idleLine(visitLabel: visitLabel)
                       : FieldVoiceModeCopy.line(for: state)
    }

    /// The chip already carries the visit's own name; a kindless context is not
    /// a visit (FC-R2), and its chip reads "Not placed" — which must never be
    /// spoken as a destination.
    private var visitLabel: String? {
        visit.context?.kind == nil ? nil : chip.primary
    }

    private func elapsed(for state: FieldVoiceModeState) -> String? {
        switch state {
        case .recording(let seconds), .transcriptUnavailable(let seconds):
            return FieldVoiceModeCopy.elapsed(seconds)
        default:
            return nil
        }
    }
}
