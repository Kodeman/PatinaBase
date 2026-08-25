//  SpeechVoiceNoteService.swift
//  Capture
//
//  N4 — live, on-device voice transcription via SFSpeechRecognizer + AVAudioEngine.
//  Speech/AVFoundation compile on the iphonesimulator SDK; mic capture is flaky
//  there, so any thrown error (incl. simulator) flips the N4 sheet to its manual
//  transcript-entry fallback. The audio IS the record and the transcript is a
//  reading of it (R114.1): the .m4a is written from the same engine tap that
//  feeds recognition, the recognition request rotates at
//  VoiceRecordingPolicy.segmentRotationSeconds while the file stays
//  continuous, and an interruption opens segment N+1. A failed AVAudioFile
//  open OR write is non-fatal — the note ships transcript-only rather than
//  blocking. One instance serves many notes, so every per-note field is reset
//  in startLiveTranscription().

import Foundation
import AVFoundation
import Speech
import CaptureKit
import CaptureKitMocks

public final class SpeechVoiceNoteService: VoiceNoteService, @unchecked Sendable {
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    private var latestTranscript = ""
    private var startedAt: Date?
    private let mediaDirectory: URL?
    private let analytics: any CaptureAnalytics
    /// Threaded at all three construction sites now so Task 17's unified finish
    /// emission has it; nothing in this file reads it yet.
    private let surface: String
    /// Minted PER NOTE in startLiveTranscription(), never at init: this service
    /// is constructed once per SCREEN (SiteScanContextCapture.swift,
    /// SiteScanHostScreen.swift) and toggleVoice() starts arbitrarily many
    /// notes on it. A let-at-init noteID made note 2 inherit note 1's audio.
    private var noteID = UUID()
    private var audioFile: AVAudioFile?
    private var audioFilename: String?          // segment 0, for every legacy reader
    private var audioSegments: [String] = []
    private var segmentStartedAt: Date?
    private var noteStartedAt: Date?
    private var interrupted = false
    private var onDeviceRecognition = false
    private var interruptionObserver: NSObjectProtocol?
    /// Held so the interruption-resume path can reinstall THE SAME tap, which
    /// needs the live stream's continuation and has no local one in scope.
    private var continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation?
    /// The tap runs on the render thread and may do exactly two things. Every
    /// recognizer swap is POSTED here instead of performed inline.
    private let rotationQueue = DispatchQueue(label: "cloud.patina.field.voice.rotation")
    private var rotationInFlight = false

    /// `mediaDirectory` is the App Group media dir (CaptureStore.mediaDirectory()).
    /// Pass nil to skip writing an audio file (transcript-only).
    public init(mediaDirectory: URL? = nil,
                analytics: any CaptureAnalytics = MockCaptureAnalytics(),
                surface: String = "n4") {
        self.mediaDirectory = mediaDirectory
        self.analytics = analytics
        self.surface = surface
    }

    deinit {
        if let interruptionObserver {
            // The observer is the TOKEN, never `self` — see finish().
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
    }

    public func requestAuthorization() async -> Bool {
        let speechOK = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status == .authorized)
            }
        }
        guard speechOK else { return false }
        return await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            AVAudioApplication.requestRecordPermission { granted in
                cont.resume(returning: granted)
            }
        }
    }

    @MainActor
    public func startLiveTranscription() throws -> AsyncThrowingStream<TranscriptChunk, Error> {
        latestTranscript = ""
        startedAt = Date()
        // Every per-note field, because one instance records many notes.
        noteID = UUID()
        audioFile = nil
        audioFilename = nil
        audioSegments = []
        segmentStartedAt = nil
        noteStartedAt = Date()
        interrupted = false
        rotationInFlight = false

        guard let recognizer, recognizer.isAvailable else {
            throw VoiceNoteError.recognizerUnavailable
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        self.request = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        onDeviceRecognition = recognizer.supportsOnDeviceRecognition
        request.requiresOnDeviceRecognition = onDeviceRecognition
        openSegment(format: format)
        observeInterruptions()

        return AsyncThrowingStream { continuation in
            self.continuation = continuation
            self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                if let result {
                    let text = result.bestTranscription.formattedString
                    self?.latestTranscript = text
                    continuation.yield(TranscriptChunk(text: text, isFinal: result.isFinal))
                    if result.isFinal { continuation.finish() }
                }
                if let error {
                    continuation.finish(throwing: error)
                }
            }

            self.installTap(on: inputNode, format: format)

            do {
                self.audioEngine.prepare()
                try self.audioEngine.start()
            } catch {
                inputNode.removeTap(onBus: 0)
                continuation.finish(throwing: error)
            }
        }
    }

    @MainActor
    public func finish() async -> VoiceNoteResult {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        let duration = startedAt.map { Date().timeIntervalSince($0) } ?? 0
        audioFile = nil
        continuation = nil
        if let interruptionObserver {
            // addObserver(forName:object:queue:using:) returns an opaque TOKEN.
            // The observer is not `self`, so removeObserver(self, name:…) removes
            // nothing and every recording leaks another block onto a service that
            // lives as long as the screen.
            NotificationCenter.default.removeObserver(interruptionObserver)
            self.interruptionObserver = nil
        }
        return VoiceNoteResult(
            transcript: latestTranscript,
            audioFilename: audioFilename,
            audioSegments: audioSegments,
            onDevice: onDeviceRecognition,
            durationSeconds: duration
        )
    }

    /// The ONE tap in the class. The start path and the interruption-resume
    /// path install this, so the two cannot drift apart.
    private func installTap(on input: AVAudioInputNode, format: AVAudioFormat) {
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            // RENDER THREAD. Two jobs only: feed recognition, write bytes.
            self.request?.append(buffer)
            if let file = self.audioFile,
               buffer.format.channelCount == file.processingFormat.channelCount,
               buffer.format.sampleRate == file.processingFormat.sampleRate {
                try? file.write(from: buffer)
            }
            // Everything else is POSTED off the render thread.
            guard let recognizer = self.recognizer,
                  let continuation = self.continuation else { return }
            self.requestRotationIfNeeded(recognizer: recognizer, continuation: continuation)
        }
    }

    /// A failed open is deliberately non-fatal: recognition continues and the
    /// note ships transcript-only. Never block a capture (R108.5).
    /// The channel count comes from the TAP's format — hardcoding 1 against a
    /// two-channel USB or Bluetooth input is the write-crash in installTap.
    private func openSegment(format: AVAudioFormat) {
        guard let mediaDirectory else { return }
        let name = VoiceRecordingPolicy.segmentFilename(noteID: noteID,
                                                        index: audioSegments.count)
        let url = mediaDirectory.appendingPathComponent(name)
        do {
            audioFile = try AVAudioFile(forWriting: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: format.channelCount,
                AVEncoderBitRateKey: 32_000
            ])
            audioSegments.append(name)
            if audioFilename == nil { audioFilename = name }
            segmentStartedAt = Date()
        } catch {
            audioFile = nil
            analytics.event("voice.audio_write_failed", ["reason": "open"])
        }
    }

    /// Called FROM the render thread; does no work there. Hops to a serial
    /// queue for the recognizer swap, which mutates request/task and performs
    /// an XPC round-trip. @unchecked Sendable silences the compiler, not the
    /// race; the symptom of doing this inline is audio glitching and torn
    /// state at every rotation boundary.
    private func requestRotationIfNeeded(
        recognizer: SFSpeechRecognizer,
        continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation
    ) {
        guard !rotationInFlight,
              let startedAt = segmentStartedAt,
              VoiceRecordingPolicy.shouldRotate(
                elapsedInSegment: Date().timeIntervalSince(startedAt)) else { return }
        rotationInFlight = true
        rotationQueue.async { [weak self] in
            self?.rotate(recognizer: recognizer, continuation: continuation)
        }
    }

    /// Rotate the RECOGNIZER, never the file. SFSpeechRecognizer caps at ~60 s
    /// per request; the .m4a for this segment stays one continuous file.
    /// ENFORCES the cap — a policy that is unit-tested and never invoked
    /// reports green over behaviour that cannot happen.
    private func rotate(recognizer: SFSpeechRecognizer,
                        continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation) {
        defer { rotationInFlight = false }

        let elapsed = noteStartedAt.map { Date().timeIntervalSince($0) } ?? 0
        if VoiceRecordingPolicy.shouldEnd(totalElapsed: elapsed,
                                          segmentCount: audioSegments.count) {
            continuation.yield(TranscriptChunk(
                text: latestTranscript, isFinal: true))
            continuation.finish()
            analytics.event("voice.finish", ["reason": "cap"])
            return
        }

        let carried = latestTranscript
        request?.endAudio()
        task?.finish()
        let next = SFSpeechAudioBufferRecognitionRequest()
        next.shouldReportPartialResults = true
        next.requiresOnDeviceRecognition = onDeviceRecognition
        request = next
        segmentStartedAt = Date()
        analytics.event("voice.segment_rotated", ["index": String(audioSegments.count)])
        task = recognizer.recognitionTask(with: next) { [weak self] result, _ in
            guard let self, let result else { return }
            let joined = [carried, result.bestTranscription.formattedString]
                .filter { !$0.isEmpty }.joined(separator: " ")
            self.latestTranscript = joined
            continuation.yield(TranscriptChunk(text: joined, isFinal: false))
        }
    }

    /// Nothing in the app observed audio interruptions before this.
    /// `.began`: iOS has ALREADY stopped the engine and torn down the session.
    /// `.ended` with .shouldResume: reactivate the session, restart the engine,
    /// reinstall the tap, THEN open segment N+1. A `guard audioEngine.isRunning`
    /// at `.ended` can never be true and would make the resume path dead code.
    private func observeInterruptions() {
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let self,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            switch type {
            case .began:
                self.audioFile = nil
                self.segmentStartedAt = nil
                self.interrupted = true
                self.analytics.event("voice.interrupted", ["reason": "began"])
            case .ended:
                let optionsRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                guard AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
                    .contains(.shouldResume) else { return }
                do {
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
                    try session.setActive(true, options: .notifyOthersOnDeactivation)
                    let input = self.audioEngine.inputNode
                    let format = input.outputFormat(forBus: 0)
                    input.removeTap(onBus: 0)
                    self.installTap(on: input, format: format)
                    self.audioEngine.prepare()
                    try self.audioEngine.start()
                    self.openSegment(format: format)
                    self.interrupted = false
                } catch {
                    self.analytics.event("voice.audio_write_failed", ["reason": "resume"])
                }
            @unknown default:
                break
            }
        }
    }

    public enum VoiceNoteError: Error { case recognizerUnavailable }
}
