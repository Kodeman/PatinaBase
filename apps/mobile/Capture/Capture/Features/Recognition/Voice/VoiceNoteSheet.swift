//  VoiceNoteSheet.swift
//  Capture
//
//  N4 · Voice note — live transcribe. Hold to talk and the note transcribes on
//  device in real time ("oak base, the warmer bouclé — rep is Dana"). "Attach
//  note" saves transcript + audio to the specimen (source .voice); "Discard"
//  drops the take. If the recogniser is unavailable (no mic permission, or the
//  simulator), the sheet falls to a typed-note entry — the raw audio is always
//  kept alongside the text when there is one.

import SwiftUI
import UIKit
import CaptureKit

struct VoiceNoteSheet: View {
    let specimenID: UUID
    let store: CaptureStore
    let session: any SessionProviding
    let voice: any VoiceNoteService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator?

    @State private var authorized: Bool?
    @State private var manualFallback = false
    @State private var isRecording = false
    @State private var transcript = ""
    @State private var startedAt: Date?
    @State private var result: VoiceNoteResult?
    @State private var streamTask: Task<Void, Never>?

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
        .task {
            analytics.screen("N4.voice")
            guard analytics.isFeatureEnabled("field-companion-voice") else {
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
            micButton
            RecognitionActionBar(
                secondaryTitle: "Discard",
                primaryTitle: "Attach note",
                primaryEnabled: !transcript.isEmpty && !isRecording,
                secondaryRole: .destructive,
                onSecondary: { discard() },
                onPrimary: { attach() }
            )
        }
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
                Text(transcript.isEmpty ? "HOLD TO TALK" : "TAKE READY")
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
            Text(transcript.isEmpty ? "Your words appear here as you speak…" : "“\(transcript)”")
                .font(CaptureType.body)
                .foregroundStyle(transcript.isEmpty ? CaptureColor.inkSoft : CaptureColor.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(minHeight: 60, alignment: .topLeading)
        }
    }

    private var micButton: some View {
        Image(systemName: isRecording ? "waveform" : "mic.fill")
            .font(CaptureType.title)
            .foregroundStyle(CaptureColor.paper3)
            .frame(width: 76, height: 76)
            .background(Circle().fill(isRecording ? CaptureColor.error : CaptureColor.verdigris))
            .scaleEffect(isRecording ? 1.08 : 1)
            .animation(.spring(duration: 0.2), value: isRecording)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in if !isRecording { begin() } }
                    .onEnded { _ in end() }
            )
            .accessibilityLabel("Hold to talk")
            .accessibilityAddTraits(.startsMediaSession)
    }

    // MARK: - Manual fallback

    private var manualEntry: some View {
        VStack(alignment: .leading, spacing: 14) {
            RecognitionCard {
                Text("Type the note")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Text("Voice capture isn't available here. Type the context and rep details.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                TextEditor(text: $transcript)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                    .frame(minHeight: 120)
                    .scrollContentBackground(.hidden)
            }
            RecognitionActionBar(
                secondaryTitle: "Discard",
                primaryTitle: "Attach note",
                primaryEnabled: !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                secondaryRole: .destructive,
                onSecondary: { discard() },
                onPrimary: { attach() }
            )
        }
    }

    // MARK: - Recording lifecycle

    private func begin() {
        guard authorized != false else { manualFallback = true; return }
        do {
            let stream = try voice.startLiveTranscription()
            isRecording = true
            startedAt = Date()
            transcript = ""
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            streamTask = Task { @MainActor in
                do {
                    for try await chunk in stream { transcript = chunk.text }
                } catch {
                    manualFallback = true
                    isRecording = false
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
        streamTask?.cancel()
        Task {
            let r = await voice.finish()
            result = r
            if !r.transcript.isEmpty { transcript = r.transcript }
        }
    }

    private func discard() {
        streamTask?.cancel()
        if isRecording { Task { _ = await voice.finish() } }
        coordinator?.dismissSheet()
    }

    private func attach() {
        guard let specimen = currentSpecimen() else { return }
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        specimen.voiceTranscript = text
        specimen.voiceAudioFilename = result?.audioFilename
        specimen.voiceAudioSegmentsRaw = result?.audioSegments
        // attach() is shared with the manual-entry fallback: with no recorder
        // result the text was typed, and 'designer' is the schema's word for it
        // (00530). Labelling it device_partial would claim speech and imply audio.
        specimen.voiceTranscriptSourceRaw = result.map {
            $0.transcript.isEmpty ? "device_partial" : "device"
        } ?? "designer"
        specimen.captureKindRaw = "note"
        specimen.voiceDurationSeconds = result?.durationSeconds
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
        coordinator: CaptureCoordinator()
    )
}
#endif
