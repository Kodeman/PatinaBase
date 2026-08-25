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
//  continuous, and an interruption or a route change opens segment N+1. If the
//  file cannot be opened the note still records and transcribes to the end —
//  rotation runs off the segment clock, not off the file — and ships
//  transcript-only.
//  A segment's filename is published ONLY once a buffer has actually been
//  written to it, so a name never stands for audio that does not exist; a
//  never-written segment is deleted and reported as no segment at all. (A name
//  that IS published and later goes missing is a true loss and Task 9's.)
//  One instance serves many notes, so every per-note field is reset in
//  startLiveTranscription().

import Foundation
import AVFoundation
import Speech
import os
import CaptureKit
import CaptureKitMocks

public final class SpeechVoiceNoteService: VoiceNoteService, @unchecked Sendable {
    /// The open segment, its name, and the frames actually written to it. Held
    /// as one unit under one lock because the render thread and the close paths
    /// must agree on all three at once: publishing the name is conditional on
    /// the count, and the count is only ever advanced by a write that returned.
    private final class OpenSegment {
        let name: String
        let file: AVAudioFile
        var framesWritten: AVAudioFramePosition = 0
        init(name: String, file: AVAudioFile) {
            self.name = name
            self.file = file
        }
    }

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()

    /// `request` is READ on the render thread (installTap) and REPLACED on
    /// rotationQueue at every 50 s rotation. A non-atomic class-reference store
    /// racing a load can over-release, so both go through an unfair lock: the
    /// tap takes one uncontended lock per buffer (nanoseconds) and holds a
    /// strong reference for the rest of the callback.
    private let requestBox = OSAllocatedUnfairLock<SFSpeechAudioBufferRecognitionRequest?>(
        uncheckedState: nil)
    private var request: SFSpeechAudioBufferRecognitionRequest? {
        get { requestBox.withLockUnchecked { $0 } }
        set { requestBox.withLock { $0 = newValue } }
    }
    private let taskBox = OSAllocatedUnfairLock<SFSpeechRecognitionTask?>(uncheckedState: nil)
    private var task: SFSpeechRecognitionTask? {
        get { taskBox.withLockUnchecked { $0 } }
        set { taskBox.withLock { $0 = newValue } }
    }
    /// The write and the frame count happen under this lock together, so a close
    /// on another thread either sees a completed write or waits for it — and can
    /// never observe a file mid-write or a count that disagrees with the bytes.
    private let openSegmentBox = OSAllocatedUnfairLock<OpenSegment?>(uncheckedState: nil)

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
    /// Segment 0, for every legacy reader. Set when the first segment that took
    /// audio closes — never at open.
    private var audioFilename: String?
    /// Names of segments that took audio, in the order they closed.
    private var audioSegments: [String] = []
    private var segmentStartedAt: Date?
    private var noteStartedAt: Date?
    /// False whenever no note is recording. Guards the interruption-resume and
    /// configuration-change paths: without it, a note whose engine failed to
    /// start leaves an armed observer that would later reactivate the session
    /// and open a segment while the user sits on the manual-entry sheet — a hot
    /// mic with nothing on screen saying so. Also the rotation latch: a Bool is
    /// a single byte, so the render thread cannot read it torn.
    private var noteIsActive = false
    private var onDeviceRecognition = false
    private var interruptionObserver: NSObjectProtocol?
    private var configChangeObserver: NSObjectProtocol?
    /// Held so the interruption-resume path can reinstall THE SAME tap, which
    /// needs the live stream's continuation and has no local one in scope.
    private var continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation?
    /// The tap runs on the render thread and may do exactly two things. Every
    /// recognizer swap is POSTED here instead of performed inline.
    private let rotationQueue = DispatchQueue(label: "cloud.patina.field.voice.rotation")
    private var rotationInFlight = false
    /// The format installTap was last given. A configuration change whose format
    /// matches it is not a route change we need to act on — see the observer.
    private var tapFormat: AVAudioFormat?
    /// reopenEngineAndSegment() stops, reinstalls and restarts the engine, and
    /// those mutations post AVAudioEngineConfigurationChange themselves. There is
    /// no rotationInFlight analogue for it, and an unbounded fan-out would open a
    /// segment per pass until VoiceRecordingPolicy's 24-segment cap ended a note
    /// with plenty of time left.
    private var reopenInFlight = false

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
        // Same teardown finish() does, but ONLY for a note that was still live.
        // One of these is constructed per screen and most are never recorded on;
        // deactivating the shared session on every dismissal would reach across
        // features (ARKit/RoomPlan run in this app too).
        removeObservers()
        let wasRecording = noteIsActive
        noteIsActive = false
        guard wasRecording else { return }
        stopEngineAndCloseSegment()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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
        openSegmentBox.withLock { $0 = nil }
        audioFilename = nil
        audioSegments = []
        segmentStartedAt = nil
        noteStartedAt = Date()
        continuation = nil
        noteIsActive = false
        rotationInFlight = false
        reopenInFlight = false
        tapFormat = nil

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
        noteIsActive = true
        openSegment(format: format)
        observeAudioSessionAndEngine()

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
                    // The OTHER door to an abandoned note: VoiceNoteSheet.begin()'s
                    // catch flips to manual entry without calling finish(), and its
                    // end()/discard() are both gated on isRecording, so no later
                    // user action can reach finish() either.
                    let service = self
                    DispatchQueue.main.async { service?.endAbandonedNote() }
                }
            }

            self.installTap(on: inputNode, format: format)

            do {
                self.audioEngine.prepare()
                try self.audioEngine.start()
            } catch {
                self.endAbandonedNote()
                continuation.finish(throwing: error)
            }
        }
    }

    @MainActor
    public func finish() async -> VoiceNoteResult {
        noteIsActive = false
        // Closes and flushes the open segment, and publishes its name only if it
        // took audio — so the result below can never name a file with none.
        stopEngineAndCloseSegment()
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        continuation = nil
        removeObservers()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        let duration = startedAt.map { Date().timeIntervalSince($0) } ?? 0
        return VoiceNoteResult(
            transcript: latestTranscript,
            audioFilename: audioFilename,
            audioSegments: audioSegments,
            onDevice: onDeviceRecognition,
            durationSeconds: duration
        )
    }

    /// The ONE tap in the class. The start path, the interruption-resume path
    /// and the configuration-change path install this, so they cannot drift.
    private func installTap(on input: AVAudioInputNode, format: AVAudioFormat) {
        tapFormat = format
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            // RENDER THREAD. Two jobs only: feed recognition, write bytes.
            self.request?.append(buffer)
            self.openSegmentBox.withLock { segment in
                // The format guard is not defensive decoration:
                // AVAudioFile.write(from:) asserts the channel counts match and
                // raises NSInvalidArgumentException, which is not a Swift Error —
                // try? does not catch it and the process traps. A route change
                // (AirPods in or out) is enough to trigger it.
                guard let segment,
                      buffer.format.channelCount == segment.file.processingFormat.channelCount,
                      buffer.format.sampleRate == segment.file.processingFormat.sampleRate
                else { return }
                do {
                    try segment.file.write(from: buffer)
                    // Only a write that RETURNED counts. This is what makes the
                    // filename real; nothing else publishes it.
                    segment.framesWritten += AVAudioFramePosition(buffer.frameLength)
                } catch {}
            }
            // Everything else is POSTED off the render thread.
            guard let recognizer = self.recognizer,
                  let continuation = self.continuation else { return }
            self.requestRotationIfNeeded(recognizer: recognizer, continuation: continuation)
        }
    }

    /// A failed open costs the audio and NOTHING else: the segment clock starts
    /// regardless, so rotation still fires and the transcript runs to the cap
    /// instead of truncating at SFSpeechRecognizer's ~60 s. Never block a
    /// capture (R108.5).
    /// The name is NOT published here — see closeCurrentSegment().
    /// The channel count comes from the TAP's format — hardcoding 1 against a
    /// two-channel USB or Bluetooth input is the write-crash in installTap.
    private func openSegment(format: AVAudioFormat) {
        // Before the mediaDirectory guard: rotation must not depend on the file.
        segmentStartedAt = Date()
        guard let mediaDirectory else { return }
        let name = VoiceRecordingPolicy.segmentFilename(noteID: noteID,
                                                        index: audioSegments.count)
        let url = mediaDirectory.appendingPathComponent(name)
        do {
            let file = try AVAudioFile(forWriting: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: format.channelCount,
                AVEncoderBitRateKey: 32_000
            ])
            openSegmentBox.withLock { $0 = OpenSegment(name: name, file: file) }
        } catch {
            openSegmentBox.withLock { $0 = nil }
            analytics.event("voice.audio_write_failed", ["reason": "open"])
        }
    }

    /// Closes the open segment and decides whether it ever existed as a record.
    /// A name is published ONLY when a write returned, because a name for audio
    /// that was never written is worse than no name: CaptureStore lists it as
    /// required-local, finds it zero-length, and raises a
    /// CaptureMediaAvailabilityError — which is not a LocalSyncError, so the note
    /// is rejected rather than deferred and drops out of the drain entirely. One
    /// phantom name would permanently orphan a real note.
    /// Callers must stop the engine or remove the tap first.
    private func closeCurrentSegment() {
        // Taking the segment out of the box drops the last reference to the
        // AVAudioFile inside the lock, so the .m4a container is finalised and
        // flushed to disk before this returns.
        let closed: (name: String, frames: AVAudioFramePosition)? =
            openSegmentBox.withLock { segment in
                guard let current = segment else { return nil }
                segment = nil
                return (current.name, current.framesWritten)
            }
        guard let closed else { return }
        guard closed.frames > 0 else {
            if let mediaDirectory {
                try? FileManager.default.removeItem(
                    at: mediaDirectory.appendingPathComponent(closed.name))
            }
            return
        }
        audioSegments.append(closed.name)
        if audioFilename == nil { audioFilename = closed.name }
    }

    /// Tear down a note no consumer will call finish() on. Two doors reach it —
    /// the engine failing to start, and recognition erroring out — and both leave
    /// the sheet on manual entry with finish() unreachable. Without this the mic
    /// stays live, the file keeps growing, other apps stay ducked, and both
    /// observers stay armed to reopen segments behind a manual-entry sheet.
    /// Idempotent: a later finish() finds nothing left to do.
    private func endAbandonedNote() {
        guard noteIsActive else { return }
        noteIsActive = false
        removeObservers()
        stopEngineAndCloseSegment()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func stopEngineAndCloseSegment() {
        if audioEngine.isRunning { audioEngine.stop() }
        // OUTSIDE the isRunning check, and a no-op when no tap is installed:
        // after an interruption .began iOS has already stopped the engine, so a
        // guarded removeTap leaves the tap in place and the NEXT note's
        // installTap raises `nullptr == Tap()` instead of replacing it.
        audioEngine.inputNode.removeTap(onBus: 0)
        closeCurrentSegment()
    }

    private func removeObservers() {
        // addObserver(forName:object:queue:using:) returns an opaque TOKEN.
        // The observer is not `self`, so removeObserver(self, name:…) removes
        // nothing and every recording leaks another block onto a service that
        // lives as long as the screen.
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
            self.interruptionObserver = nil
        }
        if let configChangeObserver {
            NotificationCenter.default.removeObserver(configChangeObserver)
            self.configChangeObserver = nil
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
        guard noteIsActive,
              !rotationInFlight,
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
    /// ENDS the note at the cap — stops the mic, closes the file and stops
    /// rotating — because a policy that is unit-tested and never enforced
    /// reports green over behaviour that cannot happen.
    private func rotate(recognizer: SFSpeechRecognizer,
                        continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation) {
        defer { rotationInFlight = false }

        let elapsed = noteStartedAt.map { Date().timeIntervalSince($0) } ?? 0
        if VoiceRecordingPolicy.shouldEnd(totalElapsed: elapsed,
                                          segmentCount: audioSegments.count) {
            // FIRST, and before the latch is released by `defer`: the next tap
            // buffer is ~21 ms away and would otherwise still see shouldRotate,
            // post rotate() again, take this branch again — forever, emitting
            // voice.finish each time while the file grew past the cap.
            noteIsActive = false
            segmentStartedAt = nil
            continuation.yield(TranscriptChunk(
                text: latestTranscript, isFinal: true))
            continuation.finish()
            analytics.event("voice.finish", ["reason": "cap"])
            // The UI half of ending a note belongs to the sheets; the mic is ours.
            DispatchQueue.main.async { [weak self, capped = noteID] in self?.endAtCap(capped) }
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

    /// The capped note's audio gets the SAME teardown a normal finish() gives
    /// it: engine stopped, tap removed, segment closed and flushed, name
    /// published if it took audio. request/task are ended and cleared here so
    /// the finish() a consumer may still call cannot end them twice.
    private func endAtCap(_ cappedNoteID: UUID) {
        // The consumer's finish() and this hop race for the same runloop turn,
        // and either order is safe — but a NEW note may also have started in it,
        // and deactivating its session would kill a recording that just began.
        guard cappedNoteID == noteID else { return }
        stopEngineAndCloseSegment()
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        removeObservers()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Nothing in the app observed audio interruptions before this.
    /// `.began`: iOS has ALREADY stopped the engine and torn down the session.
    /// `.ended` with .shouldResume: reactivate the session, restart the engine,
    /// reinstall the tap, THEN open segment N+1. A `guard audioEngine.isRunning`
    /// at `.ended` can never be true and would make the resume path dead code.
    /// AVAudioEngineConfigurationChange is the OTHER half: plugging AirPods in
    /// or out raises no interruption at all, and Apple's contract is that the
    /// tap is then invalid. Without this the engine keeps running, every buffer
    /// fails installTap's format guard, and the rest of the note is a 40-second
    /// file under a 4-minute transcript.
    private func observeAudioSessionAndEngine() {
        removeObservers()
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
                self.stopEngineAndCloseSegment()
                self.segmentStartedAt = nil
                self.analytics.event("voice.interrupted", ["reason": "began"])
            case .ended:
                let optionsRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                guard self.noteIsActive,
                      AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
                        .contains(.shouldResume) else { return }
                self.reopenEngineAndSegment(reason: "resume")
            @unknown default:
                break
            }
        }
        configChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: audioEngine,
            queue: .main
        ) { [weak self] _ in
            // isRunning is checked HERE, unlike at .ended: a config change during
            // an interruption must not restart the mic under the phone call.
            guard let self, self.noteIsActive, self.audioEngine.isRunning else { return }
            // Our own stop/reinstall/start posts this notification too. Reopening
            // on a format that did not move would open a segment for nothing and
            // feed a self-sustaining cycle; channel count and sample rate are
            // exactly what decides whether the installed tap's buffers are still
            // writable, so they are what "the route moved" means here.
            let current = self.audioEngine.inputNode.outputFormat(forBus: 0)
            guard let installed = self.tapFormat,
                  installed.channelCount != current.channelCount
                    || installed.sampleRate != current.sampleRate else { return }
            self.reopenEngineAndSegment(reason: "route")
        }
    }

    /// Remove the stale tap, re-read the input format, reinstall, restart, and
    /// open segment N+1 at the format the route actually delivers now.
    private func reopenEngineAndSegment(reason: String) {
        guard !reopenInFlight else { return }
        reopenInFlight = true
        defer { reopenInFlight = false }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let input = audioEngine.inputNode
            if audioEngine.isRunning { audioEngine.stop() }
            input.removeTap(onBus: 0)
            closeCurrentSegment()
            let format = input.outputFormat(forBus: 0)
            installTap(on: input, format: format)
            audioEngine.prepare()
            try audioEngine.start()
            openSegment(format: format)
        } catch {
            analytics.event("voice.audio_write_failed", ["reason": reason])
        }
    }

    public enum VoiceNoteError: Error { case recognizerUnavailable }
}
