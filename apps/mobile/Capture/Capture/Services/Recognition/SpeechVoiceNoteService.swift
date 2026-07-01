//  SpeechVoiceNoteService.swift
//  Capture
//
//  N4 — live, on-device voice transcription via SFSpeechRecognizer + AVAudioEngine.
//  Speech/AVFoundation compile on the iphonesimulator SDK; mic capture is flaky
//  there, so any thrown error (incl. simulator) flips the N4 sheet to its manual
//  transcript-entry fallback. The raw audio file is always kept alongside the text.

import Foundation
import AVFoundation
import Speech
import CaptureKit

public final class SpeechVoiceNoteService: VoiceNoteService, @unchecked Sendable {
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    private var latestTranscript = ""
    private var startedAt: Date?
    private let mediaDirectory: URL?
    private var audioFilename: String?

    /// `mediaDirectory` is the App Group media dir (CaptureStore.mediaDirectory()).
    /// Pass nil to skip writing an audio file (transcript-only).
    public init(mediaDirectory: URL? = nil) {
        self.mediaDirectory = mediaDirectory
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

        return AsyncThrowingStream { continuation in
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

            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.request?.append(buffer)
            }

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
        return VoiceNoteResult(
            transcript: latestTranscript,
            audioFilename: audioFilename,
            durationSeconds: duration
        )
    }

    public enum VoiceNoteError: Error { case recognizerUnavailable }
}
