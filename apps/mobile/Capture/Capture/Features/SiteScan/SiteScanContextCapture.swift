//  SiteScanContextCapture.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 7 — context capture
//
//  The F2 mid-scan context-capture affordance (detail photo + voice note) and its
//  model, shared by the Pro path (photo + pose from the shared session) and the
//  non-Pro path (photo from the regular camera, no pose). Each capture rides the
//  EXISTING outbox → Capture Inbox via `ContextCaptureService` with the spatial
//  address in provenance.
//
//  ⚠️ All user-facing strings are ESCALATE-class PLACEHOLDERS (flagged in the report).

import SwiftUI
import AVFoundation
import CaptureKit

@MainActor
@Observable
final class SiteScanContextModel {

    private let store: CaptureStore
    private let sync: any CaptureSyncService
    private let ownerScopeProvider: () -> CaptureLocalListScope
    private let frameProvider: () async -> ContextFrameSnapshot?
    private let scanSessionIdProvider: () -> String?
    private let projectID: String?
    private let projectRoomID: String?
    private let voice: any VoiceNoteService
    private let analytics: any CaptureAnalytics

    var toast: String?
    var isRecordingVoice = false
    private var partialTranscript = ""
    private var voiceTask: Task<Void, Never>?
    private var recordingScope: CaptureLocalListScope?

    /// Fail-closed (Field Companion W1): the voice-note affordance is absent
    /// unless the seam answers `true`.
    var voiceCaptureEnabled: Bool {
        analytics.isFeatureEnabled("field-companion-voice")
    }

    init(
        store: CaptureStore,
        sync: any CaptureSyncService,
        ownerScope: @escaping () -> CaptureLocalListScope,
        projectID: String?,
        projectRoomID: String?,
        voice: any VoiceNoteService,
        analytics: any CaptureAnalytics,
        scanSessionIdProvider: @escaping () -> String?,
        frameProvider: @escaping () async -> ContextFrameSnapshot?
    ) {
        self.store = store
        self.sync = sync
        self.ownerScopeProvider = ownerScope
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.voice = voice
        self.analytics = analytics
        self.scanSessionIdProvider = scanSessionIdProvider
        self.frameProvider = frameProvider
    }

    private func provenance(pose: [Double]?) -> ContextCaptureProvenance {
        ContextCaptureProvenance(
            scanSessionId: scanSessionIdProvider(),
            projectId: projectID,
            projectRoomId: projectRoomID,
            cameraPoseRowMajor: pose,
            capturedAt: ISO8601DateFormatter().string(from: Date()))
    }

    func capturePhoto() async {
        let creationScope = ownerScopeProvider()
        guard service(for: creationScope) != nil else {
            reportOwnerUnavailable()
            return
        }
        guard let snapshot = await frameProvider() else {
            toast = "Couldn't capture — try again"
            return
        }
        guard !Task.isCancelled,
              ownerScopeProvider() == creationScope,
              let service = service(for: creationScope) else { return }

        let created = service.enqueuePhoto(
            imageData: snapshot.imageData,
            width: snapshot.width,
            height: snapshot.height,
            filenameExtension: snapshot.filenameExtension,
            provenance: provenance(pose: snapshot.poseRowMajor))
        await sync.enqueue(created.id)
        guard !Task.isCancelled, ownerScopeProvider() == creationScope else { return }
        toast = "Photo saved to this room."
    }

    func toggleVoice() {
        guard voiceCaptureEnabled else { return }
        if isRecordingVoice { stopVoice() } else { startVoice() }
    }

    private func startVoice() {
        let scope = ownerScopeProvider()
        guard service(for: scope) != nil else {
            reportOwnerUnavailable()
            return
        }
        do {
            let stream = try voice.startLiveTranscription()
            recordingScope = scope
            isRecordingVoice = true
            partialTranscript = ""
            voiceTask = Task { [weak self] in
                do {
                    for try await chunk in stream {
                        guard !Task.isCancelled else { return }
                        self?.partialTranscript = chunk.text
                    }
                } catch {}
            }
        } catch {
            toast = "Microphone unavailable"
        }
    }

    private func stopVoice() {
        voiceTask?.cancel()
        isRecordingVoice = false
        let creationScope = recordingScope
        recordingScope = nil
        Task { [weak self] in
            guard let self, let creationScope else { return }
            let result = await self.voice.finish()
            guard !Task.isCancelled,
                  self.ownerScopeProvider() == creationScope,
                  let service = self.service(for: creationScope) else { return }
            let transcript = result.transcript.isEmpty ? self.partialTranscript : result.transcript
            // The audio is the record. A note that transcribes to nothing on a noisy
            // site used to be discarded with "Nothing recorded" — she spoke and
            // nothing was kept. Keep anything we actually captured, and say plainly
            // when the words did not come through.
            //
            // `transcript` is the LOCAL above, which already falls back to
            // partialTranscript — key the copy off the same local the guard uses, or
            // the two disagree about what "has text" means.
            let hasAudio = !result.audioSegments.isEmpty
            guard !transcript.isEmpty || hasAudio else {
                self.toast = "Nothing was recorded — try holding the mic a moment longer."
                return
            }
            // Held in a local and assigned ONCE at the end: the shipped code set the
            // success toast unconditionally two lines later, so an honest failure
            // message set earlier never rendered at all.
            let message = transcript.isEmpty
                ? "We couldn't make out the words — the audio is here."
                : "Note saved to this room."
            let created = service.enqueueVoice(
                transcript: transcript,
                audioFilename: result.audioFilename,
                audioSegments: result.audioSegments,
                transcriptSource: transcript.isEmpty ? "device_partial" : "device",
                durationSeconds: result.durationSeconds,
                provenance: self.provenance(pose: nil))
            await self.sync.enqueue(created.id)
            guard !Task.isCancelled,
                  self.ownerScopeProvider() == creationScope else { return }
            self.toast = message
        }
    }

    private func service(for scope: CaptureLocalListScope) -> ContextCaptureService? {
        switch scope {
        case .globalFixtures:
            return ContextCaptureService(store: store)
        case .owner(let owner):
            return ContextCaptureService(store: store, owner: owner)
        case .unavailable:
            return nil
        }
    }

    private func reportOwnerUnavailable() {
        toast = "Choose a workspace before adding context"
    }
}

/// Compact photo + voice controls (F2 overlay / non-Pro context screen).
struct SiteScanContextControls: View {
    let model: SiteScanContextModel

    var body: some View {
        VStack(spacing: 8) {
            if let toast = model.toast {
                Text(toast)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.paper)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
            }
            HStack(spacing: 14) {
                pill("camera.fill", "Photo") { Task { await model.capturePhoto() } }
                if model.voiceCaptureEnabled {
                    pill(model.isRecordingVoice ? "stop.circle.fill" : "mic.fill",
                         model.isRecordingVoice ? "Stop" : "Note") { model.toggleVoice() }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func pill(_ icon: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: icon)
                .font(CaptureType.footnote)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
                .foregroundStyle(CaptureColor.paper)
        }
        .accessibilityLabel(label)
    }
}

// MARK: - Non-Pro context-only screen (R108.2 — never labeled a scan)

/// The non-LiDAR entry: reference photos + voice notes for a room, captured with the
/// regular camera (no ARKit pose), landing in the Capture Inbox. NEVER a scan.
struct SiteScanContextScreen: View {
    let container: AppContainer
    let projectID: String?
    let projectRoomID: String?
    let onDone: () -> Void

    @State private var model: SiteScanContextModel?

    var body: some View {
        ZStack {
            cameraPreview.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                Spacer()
                if let model {
                    SiteScanContextControls(model: model).padding(.bottom, 12)
                }
                SiteScanPrimaryButton(title: "Done", systemImage: "checkmark", action: onDone)
                    .padding(.horizontal, 18).padding(.bottom, 14)
            }
        }
        .statusBarHidden(true)
        .environment(\.colorScheme, .light)
        .accessibilityIdentifier("screen.F1.context")
        .task {
            container.analytics.screen("screen.F1.context")
            await container.camera.start()
            if model == nil {
                model = SiteScanContextModel(
                    store: container.store,
                    sync: container.sync,
                    ownerScope: {
                        CaptureOwnerProjectionPolicy.resolve(
                            runsRealServices: AppConfiguration.runsRealServices,
                            userID: container.session.userID,
                            workspaceID: container.session.workspaceID)
                    },
                    projectID: projectID, projectRoomID: projectRoomID,
                    voice: SpeechVoiceNoteService(mediaDirectory: container.store.mediaDirectory(),
                                                  analytics: container.analytics,
                                                  surface: "f2"),
                    analytics: container.analytics,
                    scanSessionIdProvider: { nil },      // no scan session on a non-Pro device
                    frameProvider: { [container] in
                        guard let frame = try? await container.camera.capture() else { return nil }
                        return ContextFrameSnapshot(imageData: frame.data, width: frame.width,
                                                    height: frame.height, poseRowMajor: nil,
                                                    filenameExtension: "heic")
                    })
            }
        }
    }

    /// Real camera preview on device (down-cast, the lawful in-repo pattern); a
    /// scan backdrop on mock/sim where there's no AVFoundation session.
    @ViewBuilder private var cameraPreview: some View {
        if let camera = container.camera as? AVFoundationCameraService {
            CameraPreviewView(session: camera.previewSession)
        } else {
            SiteScanBackdrop()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("This iPhone can't measure a room.")               // ESCALATE placeholder
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.paper3)
            Text("Photos & notes for this room.")    // ESCALATE placeholder
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.paper)
            Text("These reach the studio as soon as you have signal — they're notes, not a scan.")  // ESCALATE
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.paper2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 18).padding(.top, 8)
    }
}
