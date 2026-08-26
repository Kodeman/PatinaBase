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
    private let session: any SessionProviding
    private let sessionContext: CaptureSessionContextStore

    private(set) var state: FieldVoiceModeState = .idle
    private(set) var transcript = ""
    /// Completed rotations so far — the segment arm of the cap. Never rendered:
    /// §7.4 deletes "seg 3" from the chrome; this feeds the machine.
    private(set) var segmentCount = 0
    private var started: Date?
    private var task: Task<Void, Never>?
    private var ticker: Task<Void, Never>?

    init(container: AppContainer) {
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
        session = container.session
        sessionContext = .shared
    }

    /// The visit as it is RIGHT NOW. C6 is a MODE of `ViewfinderScreen`, and V0
    /// is a `.sheet` presented OVER that screen, so C1 never leaves the
    /// hierarchy and this model — built once in `.task` — outlives every visit
    /// she starts from the chip. A `visit` frozen in `init` is what made the
    /// screen lie: the line under the transcript reads the VIEW's fresh visit
    /// ("It lands on Ashford Residence") while `commit()` read the model's
    /// stale one and filed the note with no project, no venue stamp and no
    /// `inherit` — Invariant V failing on the one surface where the screen's
    /// two halves disagree. `noteSetting` read it too, so a walk-through
    /// answered `.solo`, the affirmation chip rendered nothing, and FC-R11's
    /// consent step was skipped outright.
    private var liveVisit: CaptureVisitState {
        sessionContext.visitState(identity: CaptureSessionIdentity(
            userID: session.userID, workspaceID: session.workspaceID))
    }

    /// The visit this TAKE belongs to, pinned by `start()` and used by nothing
    /// else. The chip stays rendered and tappable in VOICE mode WHILE
    /// recording, so re-reading the store in `commit()` would let a visit she
    /// changed — or ended — mid-recording restamp words that were spoken
    /// somewhere else, and would leave `created.noteSetting` describing a
    /// different visit than `created.inherit(context)`. One take, one visit.
    private var takeVisit: CaptureVisitState = .none
    /// FC-R11's consent is given ONCE, before `start()`, and the recorder is
    /// told the setting AT `start()`. Held so the row `commit()` writes and the
    /// row `voice.start` already wrote cannot disagree.
    private var takeNoteSetting: FieldNoteSetting = .solo

    /// The recorder is gated on a flag that evaluates null on every device
    /// build today, so this is the difference between a control that declines
    /// and one that silently does nothing. C3 hides its mic and N4 falls to a
    /// typed note; C6 IS the screen, so it says so.
    var isAvailable: Bool { featureFlags.isEnabled("field-companion-voice") }

    var isRecording: Bool {
        switch state {
        case .recording, .transcriptUnavailable: return true
        default: return false
        }
    }

    /// Live, because its readers are live: the affirmation chip renders it on
    /// every pass and `toggle(affirmed:)` gates on it at the tap.
    var noteSetting: FieldNoteSetting { Self.noteSetting(for: liveVisit) }

    private static func noteSetting(for visit: CaptureVisitState) -> FieldNoteSetting {
        guard let context = visit.context, let kind = context.kind else { return .solo }
        return CaptureVisitDraft(kind: kind, kit: context.kit).defaultNoteSetting
    }

    func toggle(affirmed: Bool) async {
        if isRecording {
            await stop()
        } else if !FieldAffirmationPolicy.recordingIsBlocked(noteSetting: noteSetting,
                                                             affirmed: affirmed) {
            start()
        }
    }

    /// `!isRecording` is the re-entrancy guard `ViewfinderModel.beginCardNote`
    /// already carries: a second `start()` would strand the first recorder's
    /// stream task and file handle with nothing left holding them.
    func start() {
        guard isAvailable, !isRecording else { return }
        started = Date()
        segmentCount = 0
        transcript = ""
        // Pinned here, before the `do`, because the recorder is told its note
        // setting inside it. An `.onChange` on the view could not have landed
        // yet if she starts a visit at the chip and records immediately, so
        // pushing the visit INTO the model was never enough on its own —
        // FC-R11's audit row is written on this turn.
        takeVisit = liveVisit
        takeNoteSetting = Self.noteSetting(for: takeVisit)
        do {
            // FC-R11: the recorder emits the ONE `voice.start`, and this is what
            // stops that row asserting "solo" over a conversation note — the
            // consent rule's only audit trail. The protocol default is a no-op,
            // so omitting it compiles clean and silently mislabels every note.
            voice.setNoteSetting(takeNoteSetting)
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
        ticker?.cancel()
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
                if self.state == .capped {
                    // Detach the handle FIRST. `stop()` cancels `ticker`, and
                    // this IS that task — cancelling it mid-await would abandon
                    // the commit and lose the note the cap just ended.
                    self.ticker = nil
                    await self.stop()
                    return
                }
            }
        }
    }

    /// Awaitable because `finish()` is what actually stops the microphone.
    /// Spawning it left the state saying "Paused" for a main-actor turn while
    /// the tap was still writing audio, so no caller could honestly claim the
    /// engine was down before it said so.
    func stop() async {
        task?.cancel(); ticker?.cancel()
        let partial = transcript
        let wasCapped = state == .capped
        if !wasCapped { state = .idle }
        // FC-R9: `finish()` is what tears the engine and the audio session
        // down, so it is awaited BEFORE any early return. The owner guard
        // used to sit in front of it, which left a signed-out or mock
        // session recording after she tapped Stop — the same hole
        // `ViewfinderModel.endCardNote()` documents having closed for C3.
        let result = await voice.finish()
        let text = result.transcript.isEmpty ? partial : result.transcript
        let hasAudio = result.audioFilename != nil || !result.audioSegments.isEmpty
        guard !text.isEmpty || hasAudio else {
            analytics.event("voice.empty_transcript", ["had_audio": "false"])
            return
        }
        if text.isEmpty {
            analytics.event("voice.empty_transcript", ["had_audio": "true"])
        }
        guard let owner else { return }
        await commit(result, text: text, owner: owner)
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
                projectId: takeVisit.context?.routing.projectID,
                // FC-R5 holds: this is the SCAN lane's `public.rooms` id, which
                // rides in provenance because it is incompatible with
                // `field_captures.project_room_id`. The CAPTURE lane's room
                // reaches the column below, via `routing.stamped(onto:)`.
                projectRoomId: takeVisit.context?.scanRoomID,
                cameraPoseRowMajor: nil,
                capturedAt: ISO8601DateFormatter().string(from: Date())))
        if let context = takeVisit.context {
            created.venue = context.routing.stamped(onto: created.venue ?? VenueStamp())
            created.inherit(context)
        }
        created.noteSetting = takeNoteSetting
        created.voiceAudioSegmentsRaw = result.audioSegments.isEmpty
            ? nil : result.audioSegments
        created.voiceTranscriptSourceRaw = result.transcript.isEmpty
            ? "device_partial" : "device"
        created.captureKindRaw = "note"
        try? store.save()
        await sync.enqueue(created.id)
    }

    /// FC-R9: no background audio. Lock or backgrounding pauses honestly.
    func interrupt() async {
        guard isRecording else { return }
        analytics.event("voice.interrupted", ["reason": "backgrounded"])
        await stop()
        state = .interrupted
    }

    /// The view is being destroyed mid-recording — the mode selector or a
    /// left/right swipe, both live while recording. Nothing else calls
    /// `finish()` on that path (`SpeechVoiceNoteService.deinit` closes the
    /// engine but never commits), so a twenty-minute note used to vanish on one
    /// accidental swipe. She did not pause, she left: this commits WITHOUT
    /// `.interrupted`, whose "Paused" copy no surviving surface would render.
    func leave() async {
        guard isRecording else { return }
        analytics.event("voice.interrupted", ["reason": "left_mode"])
        await stop()
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
                Text(line(for: model))
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.paper2)
                    .multilineTextAlignment(.center)
                if model.isAvailable, let elapsed = elapsed(for: model.state) {
                    Text(elapsed)
                        .font(CaptureType.monoBody)
                        .foregroundStyle(CaptureColor.paper)
                }
                // FC-R11 (Ruling 4): the SAME chip C3 renders, with the same
                // gate beneath it. One component, one rule, one test. There is
                // nothing to consent to when the recorder cannot record.
                if model.isAvailable, !model.isRecording {
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
            if model == nil { model = C6VoiceModel(container: container) }
        }
        // `.background` and NOT `!= .active`: `.inactive` means frontmost but
        // not receiving events, which Control Center, the app switcher and a
        // screenshot all produce — each used to stop the take and commit a
        // fragment, so one twenty-minute walk-through became several notes. A
        // genuine backgrounding passes through `.inactive` to `.background`, so
        // FC-R9 loses nothing.
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { Task { await model?.interrupt() } }
        }
        // FC-R11: the chip stays tapped FOR THAT NOTE. Without this reset the
        // second conversation note of the session — and the twentieth — started
        // with the chip already ticked and no consent step at all, while
        // `setNoteSetting` told the audit trail she had taken one.
        .onChange(of: model?.isRecording ?? false) { _, recording in
            if !recording { affirmed = false }
        }
        // The mode selector and the left/right swipe both stay live WHILE
        // recording, and either destroys this view. Binding the model strongly
        // before the Task is what keeps it — and its recorder — alive long
        // enough to commit instead of deallocating the note.
        .onDisappear {
            guard let model else { return }
            Task { await model.leave() }
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
        Button { Task { await model.toggle(affirmed: affirmed) } } label: {
            ZStack {
                Circle()
                    .fill(model.isRecording ? CaptureColor.terracotta : CaptureColor.paper)
                    .frame(width: 78, height: 78)
                Image(systemName: model.isRecording ? "stop.fill" : "mic.fill")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(model.isRecording ? CaptureColor.paper : CaptureColor.ink)
            }
            // Dimmed rather than removed: it keeps VOICE's one control where
            // the shutter sits, and a declined control reads as "not yet"
            // where an empty screen reads as broken.
            .opacity(model.isAvailable ? 1 : 0.4)
        }
        .buttonStyle(.plain)
        .disabled(!model.isAvailable || (FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: model.noteSetting, affirmed: affirmed) && !model.isRecording))
        .accessibilityLabel(voiceControlLabel(model))
        .accessibilityIdentifier("voice.toggle")
    }

    private func voiceControlLabel(_ model: C6VoiceModel) -> String {
        guard model.isAvailable else { return FieldVoiceModeCopy.unavailable }
        return model.isRecording ? "Stop" : "Tap to start"
    }

    /// `FieldVoiceModeCopy.line(for: .idle)` discards the visit label by
    /// construction, and naming where the note will land BEFORE she speaks is
    /// that line's entire purpose — so the idle arm calls `idleLine` directly.
    /// An unavailable recorder overrides every state line: promising a landing
    /// place for a note that cannot start is the lie this closes.
    private func line(for model: C6VoiceModel) -> String {
        guard model.isAvailable else { return FieldVoiceModeCopy.unavailable }
        return model.state == .idle
            ? FieldVoiceModeCopy.idleLine(visitLabel: visitLabel)
            : FieldVoiceModeCopy.line(for: model.state)
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
