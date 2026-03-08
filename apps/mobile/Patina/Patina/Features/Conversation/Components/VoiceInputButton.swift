//
//  VoiceInputButton.swift
//  Patina
//
//  Voice input button using Speech framework
//

import SwiftUI
import Speech
import AVFoundation

/// Voice input button for speech-to-text
struct VoiceInputButton: View {
    @Binding var isActive: Bool
    let onTranscript: (String) -> Void

    @State private var speechRecognizer = SpeechRecognizer()
    @State private var isAuthorized = false
    @State private var pulseScale: CGFloat = 1.0

    var body: some View {
        Button {
            toggleRecording()
        } label: {
            ZStack {
                // Pulse animation when recording
                if isActive {
                    Circle()
                        .fill(PatinaColors.clayBeige.opacity(0.3))
                        .frame(width: 44, height: 44)
                        .scaleEffect(pulseScale)
                }

                Circle()
                    .fill(isActive ? PatinaColors.mochaBrown : PatinaColors.clayBeige.opacity(0.2))
                    .frame(width: 36, height: 36)

                Image(systemName: isActive ? "waveform" : "mic")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(isActive ? .white : PatinaColors.mochaBrown)
            }
        }
        .disabled(!isAuthorized)
        .opacity(isAuthorized ? 1 : 0.5)
        .onAppear {
            checkAuthorization()
        }
        .onChange(of: isActive) { _, active in
            if active {
                startPulseAnimation()
            } else {
                stopPulseAnimation()
            }
        }
        .onChange(of: speechRecognizer.transcript) { _, transcript in
            if !transcript.isEmpty {
                onTranscript(transcript)
            }
        }
    }

    private func checkAuthorization() {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                isAuthorized = status == .authorized
            }
        }
    }

    private func toggleRecording() {
        HapticManager.shared.impact(.medium)

        if isActive {
            speechRecognizer.stopRecording()
            isActive = false
        } else {
            do {
                try speechRecognizer.startRecording()
                isActive = true
            } catch {
                print("Failed to start recording: \(error)")
            }
        }
    }

    private func startPulseAnimation() {
        withAnimation(
            .easeInOut(duration: 1)
            .repeatForever(autoreverses: true)
        ) {
            pulseScale = 1.3
        }
    }

    private func stopPulseAnimation() {
        withAnimation(.easeOut(duration: 0.3)) {
            pulseScale = 1.0
        }
    }
}

// MARK: - Speech Recognizer

@Observable
class SpeechRecognizer {
    var transcript: String = ""
    var isRecording: Bool = false

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    func startRecording() throws {
        // Cancel any existing task
        recognitionTask?.cancel()
        recognitionTask = nil

        // Configure audio session
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        // Create recognition request
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            throw SpeechError.requestCreationFailed
        }
        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.addsPunctuation = true

        // Create audio engine
        audioEngine = AVAudioEngine()
        guard let audioEngine = audioEngine else {
            throw SpeechError.audioEngineCreationFailed
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }

        // Start recognition
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                self.transcript = result.bestTranscription.formattedString
            }

            if error != nil || result?.isFinal == true {
                self.stopRecording()
            }
        }

        audioEngine.prepare()
        try audioEngine.start()

        isRecording = true
        transcript = ""
    }

    func stopRecording() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()

        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        audioEngine = nil

        isRecording = false

        // Deactivate audio session
        try? AVAudioSession.sharedInstance().setActive(false)
    }
}

// MARK: - Speech Errors

enum SpeechError: Error {
    case requestCreationFailed
    case audioEngineCreationFailed
    case notAuthorized
}

// MARK: - Preview

#Preview {
    HStack {
        VoiceInputButton(isActive: .constant(false)) { _ in }
        VoiceInputButton(isActive: .constant(true)) { _ in }
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
