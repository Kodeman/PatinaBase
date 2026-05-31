//
//  WalkView.swift
//  Patina
//
//  AR room scanning walk experience
//
//  PT-6-4: the welcome / walking / completed content are extracted into
//  dedicated View types (WalkWelcomeContent, WalkWalkingContent,
//  WalkCompletedContent). This view is the façade that owns the capture-service
//  lifecycle, the question state machine, and the mock-scan completion handler.
//
//  PT-4-6: the deprecated v1 remote-sync path (`syncRoomScan`) has been removed.
//  The live `.walk` route runs through `QuietConversationFlowHost`, which owns
//  the real upload pipeline via `RoomUploadService`. WalkView/WalkViewModel/
//  MockRoomScanView are retained because WalkView still composes them.
//

import SwiftUI
import RoomPlan

/// The Walk - AR room scanning with narrative overlay
/// A meditative journey through your space
struct WalkView: View {
    @State private var viewModel = WalkViewModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.firstLaunchCoordinator) private var firstLaunchCoordinator
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator

    // RoomPlan integration
    @State private var captureService = RoomCaptureService()
    @State private var narrationService = WalkNarrationService()
    @State private var styleService = StyleSignalService()

    // Question system
    @State private var currentQuestion: WalkQuestion?
    @State private var questionAnswers: [QuestionAnswer] = []
    @State private var questionsAsked = 0

    // Motion tracking for questions
    @State private var lastMotionTime: Date = Date()
    @State private var isStationary = false

    // Status state
    @State private var statusError: String?
    @State private var lastScanData: FirstWalkRoomData?
    @State private var lastStyleSignals: FirstWalkStyleSignals?

    var body: some View {
        ZStack {
            // Background - only show gradient when NOT in walking state
            // During walking, the RoomCaptureView provides the camera feed
            if viewModel.state != .walking && viewModel.state != .paused {
                backgroundGradient
            } else {
                Color.black.ignoresSafeArea()
            }

            // Content based on state
            switch viewModel.state {
            case .notStarted:
                WalkWelcomeContent(onBegin: { viewModel.startWalk() })

            case .starting:
                startingContent

            case .walking, .paused:
                walkingContent

            case .completed:
                WalkCompletedContent(
                    hasScan: lastScanData != nil,
                    statusError: statusError,
                    onSeeEmergence: {
                        // Would navigate to Emergence
                        dismiss()
                    },
                    onWalkAgain: {
                        viewModel.reset()
                        lastScanData = nil
                        lastStyleSignals = nil
                        statusError = nil
                    }
                )
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color.black,
                PatinaColors.charcoal.opacity(0.9),
                PatinaColors.charcoal
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Starting Content

    private var startingContent: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Spacer()

            // Pulsing companion mark
            StrataMarkView(
                color: PatinaColors.clay,
                scale: 1.5,
                breathing: true
            )

            Text("Preparing to observe...")
                .font(PatinaTypography.patinaVoice)
                .foregroundStyle(PatinaColors.offWhite.opacity(0.8))

            Spacer()
        }
    }

    // MARK: - Walking Content

    private var walkingContent: some View {
        WalkWalkingContent(
            captureService: captureService,
            narrationService: narrationService,
            viewModel: viewModel,
            currentQuestion: currentQuestion,
            isPaused: viewModel.state == .paused,
            onAnswer: { answer in handleQuestionAnswer(answer) },
            onDismissQuestion: { handleQuestionIgnored() },
            onClose: {
                viewModel.reset()
                dismiss()
            },
            onPauseToggle: {
                if viewModel.state == .paused {
                    viewModel.resumeWalk()
                } else {
                    viewModel.pauseWalk()
                }
            }
        )
        .onAppear {
            setupCaptureService()
        }
        .onDisappear {
            captureService.stopCapture()
        }
        .onReceive(NotificationCenter.default.publisher(for: .mockScanCompleted)) { notification in
            // Handle mock scan completion from simulator
            if let roomData = notification.userInfo?["roomData"] as? FirstWalkRoomData {
                handleMockScanCompletion(roomData: roomData)
            }
        }
    }

    // MARK: - Capture Service Setup

    private func setupCaptureService() {
        // Start capture IMMEDIATELY to show camera feed
        // Don't wait for narration - camera should be visible right away
        if RoomCaptureService.isSupported {
            captureService.startCapture()
        }

        Task {
            // Request camera permission first (should already be granted from first launch)
            let permissionResult = await CameraPermissionService.shared.requestPermission()
            guard permissionResult == .granted else {
                // Permission denied - show error or redirect to settings
                statusError = "Camera permission is required for room scanning"
                captureService.stopCapture()
                return
            }

            // Play opening narration while camera is already running
            await narrationService.playOpeningNarration()
        }

        // Handle feature detection
        captureService.onFeatureDetected = { feature in
            narrationService.handleFeatureDetected(feature)
            checkForQuestion(trigger: .featureDetected(feature.category))
        }

        // Handle progress updates
        captureService.onProgressUpdate = { progress in
            viewModel.progress = Double(progress)
            firstLaunchCoordinator?.updateWalkProgress(progress)
            // Drive Companion Journey Mode — CompanionOverlay switches to
            // the journey branch whenever walkProgress is non-nil during
            // a .walk / .walkSession route.
            coordinator.companionContext.walkProgress = Float(progress)
        }

        // Handle completion status changes (ready to finish scanning)
        captureService.onCompletionStatusChanged = { status in
            // Show guidance when scan is ready to complete
            if status.recommendation == .complete {
                narrationService.showGuidance(.almostComplete)
            }
        }

        // Handle scan completion
        captureService.onScanComplete = { room in
            narrationService.showCompletion()
            styleService.computeFromCapturedRoom(room)
            styleService.applyAnswers(questionAnswers)
            styleService.applyObservations(narrationService.observationHistory)

            // Process and save room data
            if let roomData = captureService.processRoom() {
                let finalSignals = styleService.finalizeSignals()

                // Store for the completed-state indicator.
                lastScanData = roomData
                lastStyleSignals = finalSignals

                // Notify first launch coordinator
                firstLaunchCoordinator?.completeWalk(
                    roomData: roomData,
                    styleSignals: finalSignals
                )
            }

            viewModel.completeWalk()
        }
    }

    // MARK: - Mock Scan Completion (Simulator)

    private func handleMockScanCompletion(roomData: FirstWalkRoomData) {
        narrationService.showCompletion()

        // Compute style signals from mock data
        var styleSignals = FirstWalkStyleSignals()
        styleSignals.naturalLight = 0.75
        styleSignals.openness = 0.82
        styleSignals.warmth = 0.65
        styleSignals.texture = 0.45
        styleSignals.timeOfDay = .mornings
        styleSignals.lightPreference = .direct
        styleSignals.roomFeeling = "spacious and airy"
        styleSignals.scanPace = .medium

        // Store for the completed-state indicator.
        lastScanData = roomData
        lastStyleSignals = styleSignals

        // Notify first launch coordinator
        firstLaunchCoordinator?.completeWalk(
            roomData: roomData,
            styleSignals: styleSignals
        )

        viewModel.completeWalk()
    }

    // MARK: - Question Handling

    private func checkForQuestion(trigger: QuestionTrigger) {
        guard questionsAsked < 3 else { return }
        guard isStationary else { return }
        guard currentQuestion == nil else { return }

        // Find matching question
        let availableQuestions = WalkQuestion.firstWalkQuestions.filter { question in
            !questionAnswers.contains { $0.questionId == question.id }
        }

        if let matchingQuestion = availableQuestions.first(where: { $0.triggerCondition == trigger }) {
            withAnimation {
                currentQuestion = matchingQuestion
                questionsAsked += 1
            }
        }
    }

    private func handleQuestionAnswer(_ answer: String) {
        guard let question = currentQuestion else { return }

        let questionAnswer = QuestionAnswer(questionId: question.id, value: answer)
        questionAnswers.append(questionAnswer)
        firstLaunchCoordinator?.recordQuestionAnswered()

        withAnimation {
            currentQuestion = nil
        }
    }

    private func handleQuestionIgnored() {
        firstLaunchCoordinator?.recordQuestionIgnored()
        withAnimation {
            currentQuestion = nil
        }
    }
}

// MARK: - Preview

#Preview {
    WalkView()
}

#Preview("Walking State") {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack(spacing: 40) {
            WalkNarrationOverlay(
                narration: WalkNarration(text: "I notice the light here... afternoon sun from the south."),
                isThinking: false
            )

            WalkProgressView(
                coveragePercentage: 0.45,
                displayPhase: .developing
            )
        }
    }
}
