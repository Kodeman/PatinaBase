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
//  Recognition is a BONUS ON TOP of the recording, never a precondition
//  (§15.4): an unavailable or unauthorized recognizer costs the words, not the
//  note, so the session, the engine and the first segment are opened either
//  way and isTranscribing tells the surface which it got. isAvailable goes
//  false exactly where the audio matters most — a locale that needs the server,
//  on a site with no signal.
//  A segment's filename is published ONLY once a buffer has actually been
//  written to it, so a name never stands for audio that does not exist; a
//  never-written segment is deleted and reported as no segment at all. (A name
//  that IS published and later goes missing is a true loss and Task 9's.)
//  One instance serves many notes, so every per-note field is reset in
//  startLiveTranscription().
//  CROSS-THREAD STATE. Four threads touch this object: the AVAudioEngine
//  render thread (the tap), the serial rotationQueue, the Speech callback
//  thread, and MainActor. Every stored property holding a reference ARC must
//  retain and release therefore lives behind an OSAllocatedUnfairLock —
//  request, task, the open segment, latestTranscript, audioSegments and
//  continuation. @unchecked Sendable silences the compiler, not the race: an
//  unsynchronized load racing a store on any of those is a retain against a
//  buffer another thread is releasing, which surfaces as a sporadic
//  EXC_BAD_ACCESS or a malloc double-free far from the site and gets blamed
//  on Speech. The remaining unsynchronized fields (Bool, Date?, UUID) carry no
//  refcount, so the worst they can do is a spurious rotation.

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
        /// Why a segment took nothing, recorded so closeCurrentSegment can say so.
        /// Both are set on the render thread, so both are as cheap as possible: a
        /// counter, and the FIRST error retained without formatting it. Turning it
        /// into a string happens off-thread, at close.
        var buffersSeen = 0
        var writeError: Error?
        init(name: String, file: AVAudioFile) {
            self.name = name
            self.file = file
        }
    }

    /// What a segment turned out to be, once closed. A value type, so nothing
    /// escapes the lock by reference.
    private struct ClosedSegment {
        let name: String
        let frames: AVAudioFramePosition
        let buffers: Int
        let failure: String?
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

    /// The note's words AND the identity of the request allowed to write them,
    /// under one lock because admitting a callback and folding its text must be
    /// one step: a check that is not atomic with the write it guards admits the
    /// very callback it was meant to reject.
    /// Written on the SPEECH CALLBACK thread and read on rotationQueue
    /// (rotate() carries it across the recognizer swap) and on MainActor
    /// (finish(), emitFinish()). No timing coincidence is needed: rotate()
    /// reads while the old task is still delivering partials every
    /// ~100-300 ms, so every 50 s rotation raced a String's COW buffer
    /// reference before this lock.
    private struct TranscriptState {
        /// Words FINALISED by requests that have rotated away. Every request's
        /// text is joined onto this, never onto another request's live partial.
        var carried = ""
        /// carried + the live request's partial — what the note reads as now.
        var latest = ""
        /// Which request may write. Minted per note and re-minted at every
        /// rotation, so a callback arriving after its own request was retired
        /// no longer matches and is dropped instead of overwriting the live
        /// request's words with a join against a carry two rotations old.
        var generation: UInt64 = 0
    }
    private let transcriptBox = OSAllocatedUnfairLock<TranscriptState>(
        uncheckedState: TranscriptState())
    private var latestTranscript: String {
        transcriptBox.withLockUnchecked { $0.latest }
    }
    private var startedAt: Date?
    /// The moment recording actually stopped — set ONCE per note, by whichever
    /// door reaches it first: the cap in rotate(), or finish() itself. Reading
    /// Date() again at finish() time (instead of this) is exactly the Task 15
    /// finding: a note released after the cap sat waiting on the sheet, and
    /// finish() reported the wait as if it were audio.
    private var stoppedAt: Date?
    private let mediaDirectory: URL?
    private let analytics: any CaptureAnalytics
    /// Threaded at all three construction sites so the unified finish emission
    /// (emitFinish(reason:)) and voice.start can both read it.
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
    /// READ on rotationQueue (the count that decides the cap, and the next
    /// segment's index) while MainActor APPENDS in closeCurrentSegment() —
    /// reachable from the interruption observer's .began branch, and from the
    /// finish() that meets a just-posted rotate() at ~50 s. Through the
    /// computed property below, append(_:) is a get-modify-set rather than one
    /// atomic mutation; that is sound here because EVERY append is on the main
    /// actor, so only the reads are cross-thread and making each individual
    /// access atomic is exactly what removes the ARC race.
    private let segmentsBox = OSAllocatedUnfairLock<[String]>(uncheckedState: [])
    private var audioSegments: [String] {
        get { segmentsBox.withLockUnchecked { $0 } }
        set { segmentsBox.withLock { $0 = newValue } }
    }
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
    /// Whether the CURRENT note is being transcribed. Set once per note in
    /// startLiveTranscription() and read by the surfaces through
    /// isTranscribing — main actor at both ends, so no lock.
    private var transcribing = false
    /// The cap ended this note rather than the designer. Reported on
    /// VoiceNoteResult because the cap finishes the stream NORMALLY and is
    /// otherwise indistinguishable from a clean stop.
    private var endedAtCap = false
    private var interruptionObserver: NSObjectProtocol?
    private var configChangeObserver: NSObjectProtocol?
    /// Held so the interruption-resume path can reinstall THE SAME tap, which
    /// needs the live stream's continuation and has no local one in scope.
    /// READ on the render thread (installTap) and written on MainActor.
    /// AsyncThrowingStream.Continuation wraps a class reference, and
    /// AVAudioEngine.stop() + removeTap(onBus:) do not contractually guarantee
    /// that an in-flight tap callback has returned before finish() nils this.
    private let continuationBox =
        OSAllocatedUnfairLock<AsyncThrowingStream<TranscriptChunk, Error>.Continuation?>(
            uncheckedState: nil)
    private var continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation? {
        get { continuationBox.withLockUnchecked { $0 } }
        set { continuationBox.withLock { $0 = newValue } }
    }
    /// The tap runs on the render thread and may do exactly two things. Every
    /// recognizer swap is POSTED here instead of performed inline.
    private let rotationQueue = DispatchQueue(label: "cloud.patina.field.voice.rotation")
    private var rotationInFlight = false
    /// The format installTap was last given. A configuration change whose format
    /// matches it is not a route change we need to act on — see the observer.
    private var tapFormat: AVAudioFormat?
    /// Guards SYNCHRONOUS re-entry of reopenEngineAndSegment() only. It does NOT
    /// bound the fan-out it looks like it bounds: AVAudioEngine posts
    /// AVAudioEngineConfigurationChange from an internal thread and the observer
    /// is registered with queue: .main, so the notification our own stop()/start()
    /// provokes drains on a LATER runloop turn, by which time `defer` has already
    /// cleared this. The format comparison in the observer is what actually
    /// prevents the cycle; this is a cheap backstop for a path that, as written,
    /// cannot re-enter synchronously.
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

    /// Speech authorization is ASKED FOR but does not gate the note: §15.4's
    /// rung is that a denied or restricted recognizer still records. The
    /// microphone is the only permission a voice note actually requires, and
    /// returning false on a speech denial is what used to send the sheet
    /// straight to a typed editor with nothing recording behind it.
    public func requestAuthorization() async -> Bool {
        _ = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status == .authorized)
            }
        }
        return await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            AVAudioApplication.requestRecordPermission { granted in
                cont.resume(returning: granted)
            }
        }
    }

    /// authorizationStatus() covers denied AND restricted; isAvailable covers a
    /// recognizer whose locale needs a server the phone cannot reach.
    private var recognitionIsAvailable: Bool {
        SFSpeechRecognizer.authorizationStatus() == .authorized
            && recognizer?.isAvailable == true
    }

    @MainActor public var isTranscribing: Bool { transcribing }

    @MainActor
    public func startLiveTranscription() throws -> AsyncThrowingStream<TranscriptChunk, Error> {
        let available = recognitionIsAvailable
        analytics.event("voice.start", ["surface": surface,
                                        "note_setting": "solo",
                                        "transcribing": String(available)])
        let generation = beginTranscriptGeneration()
        startedAt = Date()
        stoppedAt = nil
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
        endedAtCap = false
        tapFormat = nil
        transcribing = available

        // §15.4. The recognizer guard used to throw HERE — before the session,
        // before the engine, before openSegment — so an unavailable recognizer
        // recorded nothing at all, on the one door where the audio matters
        // most. The audio is the record (R114.1): the session comes first and
        // recognition is attached only if it can actually run.
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = available ? SFSpeechAudioBufferRecognitionRequest() : nil
        request?.shouldReportPartialResults = true
        self.request = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        onDeviceRecognition = available && (recognizer?.supportsOnDeviceRecognition ?? false)
        request?.requiresOnDeviceRecognition = onDeviceRecognition
        noteIsActive = true
        openSegment(format: format)
        observeAudioSessionAndEngine()

        return AsyncThrowingStream { continuation in
            self.continuation = continuation
            if let recognizer, let request {
                self.task = self.startRecognition(recognizer: recognizer, request: request,
                                                  generation: generation, continuation: continuation)
            }
            // No else: nothing is yielded on the ladder rung. A chunk here
            // would BE the transcript — the sheets assign chunk.text straight
            // to it — so the honest line is a surface state (isTranscribing),
            // never text that could be attached as her words.

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
        // finish() must be safe to call SPECULATIVELY: Discard now always
        // awaits it (Task 15), and VoiceNoteSheet's own error catch does too.
        // A note the cap already ended, or one that was never started, has
        // nothing left to stop — and must not re-emit voice.finish under a
        // second, falsely-labelled reason, deactivate the shared audio
        // session a second time (the reason deinit below guards it, R114 —
        // ARKit/RoomPlan run in this app too), or touch a tap that may never
        // have been installed.
        let wasActive = noteIsActive
        noteIsActive = false
        guard wasActive else {
            return VoiceNoteResult(
                transcript: latestTranscript,
                audioFilename: audioFilename,
                audioSegments: audioSegments,
                onDevice: onDeviceRecognition,
                durationSeconds: recordedDuration,
                endedAtCap: endedAtCap
            )
        }
        // Fixes the over-report: a note the cap already ended has an EARLIER
        // stoppedAt from rotate(), so this leaves it alone. Only a note that
        // is stopping HERE, for the first time, gets `now`.
        if stoppedAt == nil { stoppedAt = Date() }
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

        let duration = recordedDuration
        emitFinish(reason: "manual")
        return VoiceNoteResult(
            transcript: latestTranscript,
            audioFilename: audioFilename,
            audioSegments: audioSegments,
            onDevice: onDeviceRecognition,
            durationSeconds: duration,
            endedAtCap: endedAtCap
        )
    }

    /// Single source for the note's length: what VoiceNoteResult reports and what
    /// emitFinish() reports, so the two can never disagree. Falls back to Date()
    /// only if called before either stop path has run (should not happen).
    private var recordedDuration: TimeInterval {
        guard let startedAt else { return 0 }
        return (stoppedAt ?? Date()).timeIntervalSince(startedAt)
    }

    /// P-1 (conductor ruling): the ONE place voice.finish fires. finish() and
    /// rotate()'s cap branch both call this, so a query for voice.finish never
    /// sees two disjoint property shapes.
    private func emitFinish(reason: String) {
        analytics.event("voice.finish", [
            "duration_s": String(Int(recordedDuration)),
            "segments": String(audioSegments.count),
            "transcript_chars": String(latestTranscript.count),
            // The RESOLVED value stored in startLiveTranscription(), not the
            // recognizer's capability re-read here — see the field's doc comment.
            "on_device": String(onDeviceRecognition),
            "reason": reason
        ])
    }

    /// The recognition task for a note's FIRST request. Lifted out of
    /// startLiveTranscription() so the ladder branch above stays legible. It
    /// gets the SAME callback every rotated request gets, so rotation N+1
    /// behaves exactly like rotation 1 and no single request can end the note.
    private func startRecognition(
        recognizer: SFSpeechRecognizer,
        request: SFSpeechAudioBufferRecognitionRequest,
        generation: UInt64,
        continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(
            with: request,
            resultHandler: recognitionHandler(generation: generation, continuation: continuation))
    }

    /// The callback EVERY request gets — the note's first and every rotation's.
    ///
    /// A result's `isFinal` finalises THAT REQUEST ONLY: its words move into
    /// the carry so the next request joins onto words rather than onto a live
    /// partial. It must NEVER finish the note's stream. rotate() ends each
    /// request with endAudio(), which is precisely what makes Speech deliver a
    /// final result — so the `if result.isFinal { continuation.finish() }` this
    /// replaces ended the whole note at the FIRST ~50 s rotation: a 3-minute
    /// note stopped transcribing after the first minute and a capped note could
    /// never be reached. The stream is finished by finish(), endAtCap() and
    /// endAbandonedNote() alone.
    ///
    /// `generation` is the identity of the request this closure was built for.
    /// A rotated-away request can still deliver, and its join is against a carry
    /// that has since moved on; admitting it would clobber the live request's
    /// words. foldResult() drops it, and an error from it is not this note's.
    private func recognitionHandler(
        generation: UInt64,
        continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation
    ) -> (SFSpeechRecognitionResult?, Error?) -> Void {
        { [weak self] result, error in
            guard let self else { return }
            if let result,
               let text = self.foldResult(result.bestTranscription.formattedString,
                                          isFinal: result.isFinal,
                                          generation: generation) {
                // isFinal is the REQUEST's, never the note's: a consumer reading
                // a rotation as the end of the note is the bug one layer up.
                continuation.yield(TranscriptChunk(text: text, isFinal: false))
            }
            guard let error, self.isLiveGeneration(generation) else { return }
            continuation.finish(throwing: error)
            // The OTHER door to an abandoned note (recognition erroring out, as
            // opposed to the engine-start failure). Tears the note down itself
            // and emits its own reason:"error" voice.finish.
            // VoiceNoteSheet.begin()'s catch also calls voice.finish()
            // afterward — safe, because finish() guards on noteIsActive and
            // finds nothing left to do by then.
            DispatchQueue.main.async { [weak self] in self?.endAbandonedNote() }
        }
    }

    /// Fold ONE request's result into the note's words and return what to
    /// publish — nil when the callback belongs to a request already retired.
    /// Speech delivers nothing further for a request once it has given that
    /// request's final result, which is what makes `carried = joined` here and
    /// `carried = latest` at the rotation the same value rather than a doubling.
    private func foldResult(_ text: String, isFinal: Bool, generation: UInt64) -> String? {
        transcriptBox.withLockUnchecked { state in
            guard state.generation == generation else { return nil }
            let joined = [state.carried, text].filter { !$0.isEmpty }.joined(separator: " ")
            state.latest = joined
            if isFinal { state.carried = joined }
            return joined
        }
    }

    private func isLiveGeneration(_ generation: UInt64) -> Bool {
        transcriptBox.withLockUnchecked { $0.generation == generation }
    }

    /// Reset the note's words and mint the identity its FIRST request carries.
    /// Never a reset to zero: the previous note's last generation must not
    /// match this note's, or a callback still in flight from it would be
    /// admitted into the new note's transcript.
    private func beginTranscriptGeneration() -> UInt64 {
        transcriptBox.withLockUnchecked { state in
            state.carried = ""
            state.latest = ""
            state.generation &+= 1
            return state.generation
        }
    }

    /// Close the live request's words into the carry and mint the next
    /// request's identity in ONE atomic step, so a partial landing between the
    /// read and the mint can neither be carried twice nor lost.
    private func carryForwardAndAdvance() -> UInt64 {
        transcriptBox.withLockUnchecked { state in
            state.carried = state.latest
            state.generation &+= 1
            return state.generation
        }
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
                guard let segment else { return }
                segment.buffersSeen += 1
                guard buffer.format.channelCount == segment.file.processingFormat.channelCount,
                      buffer.format.sampleRate == segment.file.processingFormat.sampleRate
                else { return }
                do {
                    try segment.file.write(from: buffer)
                    // Only a write that RETURNED counts. This is what makes the
                    // filename real; nothing else publishes it.
                    segment.framesWritten += AVAudioFramePosition(buffer.frameLength)
                } catch {
                    // Keep the first one only: retaining an Error is cheap, and a
                    // failing write usually fails for every buffer after it.
                    if segment.writeError == nil { segment.writeError = error }
                }
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
        // localizedDescription is formatted HERE, inside the lock but on the
        // caller's thread (never the render thread), so nothing escapes that the
        // tuple cannot carry.
        let closed: ClosedSegment? = openSegmentBox.withLock { segment in
            guard let current = segment else { return nil }
            segment = nil
            return ClosedSegment(name: current.name,
                                 frames: current.framesWritten,
                                 buffers: current.buffersSeen,
                                 failure: current.writeError?.localizedDescription)
        }
        guard let closed else { return }
        guard closed.frames > 0 else {
            // Say WHY there is no audio. Without this a write that throws on
            // device deletes every segment of every note and reports exactly what
            // the pre-Task-8 bug reported — nothing — and the device pass would
            // have only the absence of files to read.
            var properties = ["reason": closed.failure == nil ? "empty" : "write",
                              "buffers": String(closed.buffers)]
            if let failure = closed.failure { properties["detail"] = String(failure.prefix(120)) }
            analytics.event("voice.audio_write_failed", properties)
            if let mediaDirectory {
                try? FileManager.default.removeItem(
                    at: mediaDirectory.appendingPathComponent(closed.name))
            }
            return
        }
        audioSegments.append(closed.name)
        if audioFilename == nil { audioFilename = closed.name }
    }

    /// Tear down a note on an ERROR door — the engine failing to start, or
    /// recognition erroring out — and emit its own voice.finish under
    /// reason:"error", distinguishable from a clean user stop. Without this the
    /// mic stays live, the file keeps growing, other apps stay ducked, and both
    /// observers stay armed to reopen segments behind a manual-entry sheet.
    /// Idempotent: guarded on noteIsActive, so a consumer's own later finish()
    /// call (VoiceNoteSheet's catch calls it too) finds nothing left to do and
    /// does not double-emit under reason:"manual".
    private func endAbandonedNote() {
        guard noteIsActive else { return }
        noteIsActive = false
        if stoppedAt == nil { stoppedAt = Date() }
        removeObservers()
        stopEngineAndCloseSegment()
        // On the engine-start door the task was created and never fed: without
        // this it stays in flight holding the XPC session until SFSpeechRecognizer
        // times out. cancel() rather than finish() because nobody wants its result.
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        emitFinish(reason: "error")
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
            // Captured HERE, at the cap, not left for a later finish() to read
            // Date() against — that gap is the over-report finish() used to have.
            stoppedAt = Date()
            segmentStartedAt = nil
            // Carried on VoiceNoteResult so both surfaces can say the note hit
            // the cap. The cap finishes the stream NORMALLY, so without this
            // flag a capped note is indistinguishable from a clean stop and
            // §15.4's "never a silent stop" cannot be honoured.
            endedAtCap = true
            // NOTHING is published to the consumer from here. The stream is
            // finished inside endAtCap(), AFTER the final segment is closed and
            // its name appended — see that method. The UI half of ending a note
            // belongs to the sheets; the mic, the file and the stream are ours.
            DispatchQueue.main.async { [weak self, capped = noteID] in
                self?.endAtCap(capped, continuation: continuation)
            }
            return
        }

        // Order, not luck. The old recognition task is live and delivering
        // partials at this instant, so a carry taken BEFORE endAudio() reports
        // a transcript the old request then advances past — those words never
        // reach the joined value below and are lost from the note. endAudio()
        // first stops the old request taking audio; carryForwardAndAdvance()
        // then takes the carry and retires the old request's identity in one
        // atomic step, so it can neither observe a torn String nor race the
        // callback thread's store — and the final result that endAudio() itself
        // provokes arrives against a generation that no longer matches, folds
        // nowhere, and cannot rewrite the carry it was already counted into.
        // NOTE the stream is NOT finished here or in any callback: the note
        // outlives its requests, and only finish()/endAtCap()/endAbandonedNote()
        // may end it.
        request?.endAudio()
        task?.finish()
        let next = SFSpeechAudioBufferRecognitionRequest()
        next.shouldReportPartialResults = true
        next.requiresOnDeviceRecognition = onDeviceRecognition
        request = next
        segmentStartedAt = Date()
        analytics.event("voice.segment_rotated", ["index": String(audioSegments.count)])
        let generation = carryForwardAndAdvance()
        task = recognizer.recognitionTask(
            with: next,
            resultHandler: recognitionHandler(generation: generation, continuation: continuation))
    }

    /// The capped note's audio gets the SAME teardown a normal finish() gives
    /// it: engine stopped, tap removed, segment closed and flushed, name
    /// published if it took audio. request/task are ended and cleared here so
    /// the finish() a consumer may still call cannot end them twice.
    /// ORDER IS LOAD-BEARING, and it was not before: the consumer reacts to the
    /// finished stream by calling finish(), which sees the noteIsActive rotate()
    /// already cleared, takes its early return, and hands back audioSegments AS
    /// THEY STAND AT THAT INSTANT. Finishing the stream first therefore lets
    /// finish() win the main-queue race against this hop and return a result
    /// that never names the last segment — up to 50 s of audio referenced by
    /// nothing, never uploaded, and unreachable by the retention sweep, which
    /// only ever considers receipted files. So: close, publish, THEN finish.
    private func endAtCap(_ cappedNoteID: UUID,
                          continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation) {
        // A NEW note may have started in the hop, and deactivating its session
        // would kill a recording that just began — so the audio teardown and
        // the single voice.finish are this note's only while it is still this
        // note. (Neither surface can actually get there now that the stream is
        // finished below rather than in rotate(): F2 re-arms only in stopVoice,
        // and N4's gesture latch holds until the finger lifts.)
        if cappedNoteID == noteID {
            stopEngineAndCloseSegment()
            request?.endAudio()
            task?.finish()
            request = nil
            task = nil
            removeObservers()
            try? AVAudioSession.sharedInstance().setActive(false,
                                                           options: .notifyOthersOnDeactivation)
            // Read after the close, so `segments` counts the segment just
            // published. This is the one and only voice.finish reason:"cap" —
            // rotate() no longer emits, and the finish() a consumer may still
            // call guards itself out on noteIsActive.
            emitFinish(reason: "cap")
        }
        // The stream belongs to the capped note whatever else has started: a
        // consumer left awaiting it would sit forever on a dead mic.
        continuation.yield(TranscriptChunk(text: latestTranscript, isFinal: true))
        continuation.finish()
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
}
