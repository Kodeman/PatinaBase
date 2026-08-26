//  VoiceNoteSheet.swift
//  Capture
//
//  N4 · Voice note — live transcribe. Tap to start, tap to stop (matching
//  every other long-form voice surface — §7.4), and the note transcribes on
//  device in real time ("oak base, the warmer bouclé — rep is Dana"). "Attach
//  note" saves transcript + audio to the specimen (source .voice); "Discard"
//  drops the take AND deletes its audio segments from the media directory —
//  including any segments a PRIOR attach() already persisted to this specimen,
//  since this sheet is re-openable on one that already carries audio (FC-R19).
//  If the recogniser is unavailable (no mic permission, or the simulator), the
//  sheet falls to a typed-note entry — the raw audio is always kept alongside
//  the text when there is one. §15.4: when the RECOGNIZER is what is
//  unavailable the note still records, the transcript pane carries the honest
//  line instead of a promise of words, and the take falls to the typed editor
//  when it ends. A note the cap ended says so rather than stopping silently.

import SwiftUI
import UIKit
import CaptureKit

struct VoiceNoteSheet: View {
    let specimenID: UUID
    let store: CaptureStore
    let session: any SessionProviding
    let voice: any VoiceNoteService
    let analytics: any CaptureAnalytics
    let flags: CaptureFeatureFlags
    let coordinator: CaptureCoordinator?

    @State private var authorized: Bool?
    @State private var manualFallback = false
    @State private var isRecording = false
    @State private var transcript = ""
    @State private var startedAt: Date?
    @State private var result: VoiceNoteResult?
    @State private var streamTask: Task<Void, Never>?
    /// end() clears isRecording synchronously but assigns `result` from a Task,
    /// so without this the primary re-enables in the gap and attach() labels a
    /// genuine recording as hand-typed with no filename.
    @State private var isFinishing = false
    @State private var player = VoiceSegmentPlayer()
    /// §15.4: the note is recording but nothing will transcribe it. Distinct
    /// from manualFallback, which also covers "no microphone at all".
    @State private var transcriptionUnavailable = false
    /// The cap ended the take. Never a silent stop.
    @State private var capNotice = false

    var body: some View {
        RecognitionSheetLayout {
            RecognitionHeader(eyebrow: "Voice note", title: "Note & rep capture",
                              onClose: { coordinator?.dismissSheet() })

            if manualFallback {
                manualEntry
            } else {
                liveRecorder
            }
            Spacer(minLength: 0)
        }
        .accessibilityIdentifier(CaptureScreenID.n4Voice.rawValue)
        .onDisappear {
            player.stop()
        }
        .task {
            analytics.screen("N4.voice")
            guard flags.isEnabled("field-companion-voice") else {
                manualFallback = true
                return
            }
            if authorized == nil {
                let ok = await voice.requestAuthorization()
                authorized = ok
                if !ok { manualFallback = true }
            }
        }
    }

    // MARK: - Live recorder

    private var liveRecorder: some View {
        VStack(spacing: 18) {
            recordingStatus
            waveform
            transcriptCard
            // The unavailable-recognizer rung already reads in the transcript
            // pane; saying we could not make out the words on top of it would
            // claim an attempt that never happened.
            if hasAudio && transcript.isEmpty && !transcriptionUnavailable {
                ladderLine("We couldn't make out the words — the audio is here.")
            }
            if capNotice { ladderLine(VoiceNoteCopy.capReached) }
            if hasAudio { playbackControl }
            micButton
            RecognitionActionBar(
                secondaryTitle: "Discard",
                primaryTitle: transcript.isEmpty && hasAudio
                    ? "Keep the recording"
                    : "Attach note",
                primaryEnabled: (!transcript.isEmpty || hasAudio) && !isRecording && !isFinishing,
                secondaryRole: .destructive,
                onSecondary: { discard() },
                onPrimary: { attach() }
            )
        }
    }

    private var hasAudio: Bool { !(result?.audioSegments.isEmpty ?? true) }

    /// One rung of §15.4's ladder, styled once so the four sites cannot drift.
    private func ladderLine(_ text: String) -> some View {
        Text(text)
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// §15.4 — what the transcript pane says when nothing is transcribing it.
    /// "Your words appear here as you speak…" would be a promise the recorder
    /// cannot keep on that rung.
    private var transcriptPlaceholder: String {
        transcriptionUnavailable
            ? VoiceNoteCopy.recognitionUnavailable
            : "Your words appear here as you speak…"
    }

    private var playbackControl: some View {
        Button {
            if player.isPlaying {
                player.stop()
            } else {
                player.play((result?.audioSegments ?? []).map { store.mediaURL(for: $0) })
            }
        } label: {
            Label(player.isPlaying ? "Stop" : "Play it back",
                  systemImage: player.isPlaying ? "stop.fill" : "play.fill")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.verdigris)
        }
        .buttonStyle(.plain)
    }

    private var recordingStatus: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(isRecording ? CaptureColor.error : CaptureColor.inkSoft.opacity(0.4))
                .frame(width: 10, height: 10)
            if isRecording, let startedAt {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text("RECORDING · \(elapsed(from: startedAt, now: context.date))")
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.error)
                }
            } else {
                Text(transcript.isEmpty ? "TAP TO TALK" : "TAKE READY")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer()
        }
    }

    private var waveform: some View {
        HStack(spacing: 3) {
            ForEach(0..<32, id: \.self) { i in
                Capsule()
                    .fill(isRecording ? CaptureColor.goldenHour : CaptureColor.line2)
                    .frame(width: 3, height: barHeight(i))
            }
        }
        .frame(height: 44)
        .animation(.easeInOut(duration: 0.25), value: isRecording)
    }

    private var transcriptCard: some View {
        RecognitionCard {
            Text(transcript.isEmpty ? transcriptPlaceholder : "“\(transcript)”")
                .font(CaptureType.body)
                .foregroundStyle(transcript.isEmpty ? CaptureColor.inkSoft : CaptureColor.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(minHeight: 60, alignment: .topLeading)
        }
    }

    /// Tap to start, tap to stop (§7.4, matching C6 and F2). The cap can end a
    /// take on its own — end() clears isRecording synchronously but leaves
    /// isFinishing set until voice.finish() resolves `result` — so the button
    /// stays disabled through that window: without it, a tap landing there
    /// would read isRecording as false and call begin() a second time against
    /// the SAME draft, wiping the prior take's result before it lands. A
    /// Button doesn't have the DragGesture.onChanged problem the old
    /// gestureHeld latch guarded against (repeated firing across one held
    /// touch) — a tap resolves once, synchronously flips isRecording, and a
    /// fast second tap simply sees the new value and takes the other branch.
    private var micButton: some View {
        Button {
            toggleVoice()
        } label: {
            VStack(spacing: 8) {
                Image(systemName: FieldVoiceModeCopy.toggleGlyph(isRecording: isRecording))
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.paper3)
                    .frame(width: 76, height: 76)
                    .background(Circle().fill(isRecording ? CaptureColor.error : CaptureColor.verdigris))
                    .scaleEffect(isRecording ? 1.08 : 1)
                // The hold gesture needed no caption - the finger already knew
                // what it was doing. A tap needs the word said, and recording
                // needs it said LARGE: this is the only stop control on screen.
                Text(FieldVoiceModeCopy.toggleLabel(isRecording: isRecording))
                    .font(isRecording ? CaptureType.title : CaptureType.footnote)
                    .foregroundStyle(isRecording ? CaptureColor.error : CaptureColor.inkSoft)
            }
        }
        .buttonStyle(.plain)
        .disabled(isFinishing)
        .animation(.spring(duration: 0.2), value: isRecording)
        .accessibilityLabel(FieldVoiceModeCopy.toggleLabel(isRecording: isRecording))
        .accessibilityAddTraits(.startsMediaSession)
    }

    // MARK: - Manual fallback

    private var manualEntry: some View {
        VStack(alignment: .leading, spacing: 14) {
            RecognitionCard {
                Text("Type the note")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                // Two doors lead here and only one of them is "no microphone":
                // the recognition-error path (begin()'s catch) arrives with a
                // real recording already in hand, and the single old line
                // called that take a missing capability.
                Text(manualEntryLine)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                TextEditor(text: $transcript)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                    .frame(minHeight: 120)
                    .scrollContentBackground(.hidden)
            }
            // The live recorder's honesty ladder, on the path that actually
            // needs it: audio with no words is a note worth keeping, and
            // without the three lines below an audio-only take on the
            // recognition-error route could not be attached at all.
            if hasAudio && typedTranscript.isEmpty && !transcriptionUnavailable {
                ladderLine("We couldn't make out the words — the audio is here.")
            }
            if capNotice { ladderLine(VoiceNoteCopy.capReached) }
            if hasAudio { playbackControl }
            RecognitionActionBar(
                secondaryTitle: "Discard",
                primaryTitle: typedTranscript.isEmpty && hasAudio
                    ? "Keep the recording"
                    : "Attach note",
                primaryEnabled: (!typedTranscript.isEmpty || hasAudio) && !isFinishing,
                secondaryRole: .destructive,
                onSecondary: { discard() },
                onPrimary: { attach() }
            )
        }
    }

    private var typedTranscript: String {
        transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// THREE doors lead to this editor and they mean different things: the
    /// recognizer was unavailable while the note recorded anyway (§15.4), the
    /// recognition-error path which arrives holding a real recording, and an
    /// actual absence of voice capture.
    private var manualEntryLine: String {
        if transcriptionUnavailable { return VoiceNoteCopy.recognitionUnavailable }
        return hasAudio
            ? "The words didn't come through. Type them here — the recording stays with the note."
            : "Voice capture isn't available here. Type the context and rep details."
    }

    // MARK: - Recording lifecycle

    /// The mic button's single action. Disabled (see micButton) for the whole
    /// isFinishing window, so this never fires while a prior take's
    /// voice.finish() is still resolving.
    private func toggleVoice() {
        if isRecording { end() } else { begin() }
    }

    private func begin() {
        guard authorized != false else {
            manualFallback = true
            return
        }
        // Without these, the instant take 2 starts the sheet prints the ladder
        // line and offers Play over a live recording - take 1's segments are
        // still in `result` - and Play would seize the session the recorder
        // holds as .record.
        result = nil
        player.stop()
        // Cleared BEFORE the start, so a throw on this take cannot leave the
        // previous take's ladder rung showing on the manual sheet.
        transcriptionUnavailable = false
        capNotice = false
        do {
            let stream = try voice.startLiveTranscription()
            // The note IS recording; only the words are not coming. Asked after
            // the start, because that is when the recorder resolves it.
            transcriptionUnavailable = !voice.isTranscribing
            isRecording = true
            startedAt = Date()
            transcript = ""
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            streamTask = Task { @MainActor in
                do {
                    for try await chunk in stream { transcript = chunk.text }
                    // The recording cap ends the note by finishing the stream
                    // NORMALLY, so the catch below never runs and the sheet
                    // would keep reading RECORDING over a dead mic. On the
                    // release path end() has already cleared isRecording and
                    // this second call guards itself out.
                    end()
                } catch {
                    manualFallback = true
                    isRecording = false
                    isFinishing = true
                    // The recorder tore its own note down: endAbandonedNote()
                    // cleared noteIsActive and has ALREADY emitted voice.finish
                    // reason:"error". The segments it published still need a
                    // referrer, or a real recording sits in the media dir
                    // unreferenced and the note ships labelled as typed - so
                    // finish() is still called, and takes its `guard wasActive`
                    // early return: no second emission, no second deactivation
                    // of the shared session, and the accumulated segment names
                    // come back regardless.
                    Task {
                        result = await voice.finish()
                        isFinishing = false
                    }
                }
            }
        } catch {
            manualFallback = true
            isRecording = false
        }
    }

    private func end() {
        guard isRecording else { return }
        isRecording = false
        isFinishing = true
        streamTask?.cancel()
        Task {
            let r = await voice.finish()
            result = r
            if !r.transcript.isEmpty { transcript = r.transcript }
            capNotice = r.endedAtCap
            // §15.4: nothing transcribed this take, so the take is done and the
            // typed editor is where she finishes it — with the recording
            // attached, playable, and preserved by VoiceAttachPolicy.
            if transcriptionUnavailable { manualFallback = true }
            isFinishing = false
        }
    }

    private func discard() {
        player.stop()
        streamTask?.cancel()
        Task {
            // finish() is what returns the segment list, and it is safe to
            // call SPECULATIVELY: its `guard wasActive` early return means a
            // note the cap already ended, or one that never started, is not
            // torn down twice, does not re-emit voice.finish under a second
            // falsely-labelled reason, and does not deactivate the shared
            // session again - while still handing back audioSegments, which is
            // reset only by the next startLiveTranscription().
            // Discard therefore always ASKS instead of reading `result`,
            // which is nil for the whole window between end() and its Task
            // resuming - and cancel() above gives that Task the main actor
            // first, so the still-recording branch could never see it either.
            let abandoned = await voice.finish()
            for name in abandoned.audioSegments {
                try? FileManager.default.removeItem(at: store.mediaURL(for: name))
            }
            await MainActor.run {
                // FC-R19: `abandoned` above is only THIS session's take. This
                // sheet is re-openable on a specimen that already carries
                // audio from an EARLIER attach() (see attach()'s comment
                // below) — with the flag off it opens straight into the typed
                // editor with no take in hand at all. Without this, discarding
                // a re-opened note left that prior session's segments (and its
                // voiceAudioFilename) on the phone forever: nothing else ever
                // deletes them.
                if let specimen = currentSpecimen() {
                    for filename in (specimen.voiceAudioSegmentsRaw ?? [])
                        + [specimen.voiceAudioFilename].compactMap({ $0 }) {
                        try? FileManager.default.removeItem(at: store.mediaURL(for: filename))
                    }
                    specimen.voiceAudioFilename = nil
                    specimen.voiceAudioSegmentsRaw = nil
                    try? store.save()
                }
                coordinator?.dismissSheet()
            }
        }
    }

    private func attach() {
        guard let specimen = currentSpecimen() else { return }
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        specimen.voiceTranscript = text
        // This sheet is re-openable on a specimen that ALREADY carries audio —
        // with the flag off it opens straight into the typed editor — and the
        // take in hand is then nil. Writing it through unconditionally, as this
        // did, nulled voiceAudioSegmentsRaw over a recording whose bytes are in
        // Storage and whose remote-path stamps are only reachable BY those
        // names: the next commit then wrote voice_audio_path = NULL and
        // voice_audio_segments = '[]' over intact server audio. The rule lives
        // in CaptureKit, tested: replace only on a take that published a
        // segment; otherwise preserve every existing stamp and path.
        let merged = VoiceAttachPolicy.merge(
            existing: VoiceAttachment(audioFilename: specimen.voiceAudioFilename,
                                      audioSegments: specimen.voiceAudioSegmentsRaw,
                                      transcriptSource: specimen.voiceTranscriptSourceRaw,
                                      durationSeconds: specimen.voiceDurationSeconds),
            new: result)
        specimen.voiceAudioFilename = merged.audioFilename
        specimen.voiceAudioSegmentsRaw = merged.audioSegments
        specimen.voiceTranscriptSourceRaw = merged.transcriptSource
        specimen.voiceDurationSeconds = merged.durationSeconds
        // The honesty repair's own metric: a real recording committing with no
        // words. A take with an empty transcript is only a recording at all
        // when it published a segment — read the count rather than assume it.
        if let result, result.transcript.isEmpty, !result.audioSegments.isEmpty {
            analytics.event("voice.empty_transcript", ["had_audio": "true"])
        }
        specimen.captureKindRaw = "note"
        specimen.setValue(text, for: .note, source: .voice)
        try? store.save()
        analytics.event("N4.attach", ["chars": String(text.count)])
        coordinator?.present(.specimenSheet(specimenID))
    }

    private func currentSpecimen() -> Specimen? {
        CaptureOwnerProjectionPolicy.specimen(
            id: specimenID,
            store: store,
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    // MARK: - Helpers

    private func elapsed(from start: Date, now: Date) -> String {
        let s = max(0, Int(now.timeIntervalSince(start)))
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    private func barHeight(_ index: Int) -> CGFloat {
        guard isRecording else { return 6 }
        let seed = abs((index * 37 + (startedAt.map { Int($0.timeIntervalSince1970) } ?? 0)) % 36)
        return CGFloat(8 + seed)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("N4 · Voice") {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let specimen = store.newDraft()
    return VoiceNoteSheet(
        specimenID: specimen.id,
        store: store,
        session: MockSessionProviding(),
        voice: MockVoiceNoteService(),
        analytics: MockCaptureAnalytics(),
        flags: .allOff,
        coordinator: CaptureCoordinator()
    )
}
#endif
