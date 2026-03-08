//
//  WalkView.swift
//  Patina
//
//  AR room scanning walk experience
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

    // RoomPlan integration
    @StateObject private var captureService = RoomCaptureService()
    @StateObject private var narrationService = WalkNarrationService()
    @StateObject private var styleService = StyleSignalService()
    @StateObject private var syncService = RoomScanSyncService.shared

    // Question system
    @State private var currentQuestion: WalkQuestion?
    @State private var questionAnswers: [QuestionAnswer] = []
    @State private var questionsAsked = 0

    // Motion tracking for questions
    @State private var lastMotionTime: Date = Date()
    @State private var isStationary = false

    // Sync state
    @State private var isSyncing = false
    @State private var syncError: String?
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
                welcomeContent

            case .starting:
                startingContent

            case .walking, .paused:
                walkingContent

            case .completed:
                completedContent
            }
        }
        .navigationBarHidden(true)
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

    // MARK: - Welcome Content

    @State private var swipeHintOffset: CGFloat = 0

    private var welcomeContent: some View {
        VStack(spacing: 0) {
            // Top spacer
            Spacer()

            // Main content
            VStack(spacing: PatinaSpacing.xl) {
                // Breathing companion mark
                StrataMarkView(
                    color: PatinaColors.clayBeige,
                    scale: 1.2,
                    breathing: true
                )

                VStack(spacing: PatinaSpacing.md) {
                    Text("The Walk")
                        .font(PatinaTypography.h1)
                        .foregroundColor(PatinaColors.offWhite)

                    Text("Let's explore your space together.\nI'll observe the light, the shapes, the possibilities.")
                        .font(PatinaTypography.body)
                        .foregroundColor(PatinaColors.offWhite.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                        .padding(.horizontal, PatinaSpacing.xl)
                }
            }

            Spacer()

            // Bottom section - Swipe up to begin
            VStack(spacing: PatinaSpacing.lg) {
                // Swipe up indicator
                VStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "chevron.up")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundColor(PatinaColors.clayBeige)
                        .offset(y: swipeHintOffset)
                        .animation(
                            .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                            value: swipeHintOffset
                        )
                        .onAppear {
                            swipeHintOffset = -8
                        }

                    Text("Swipe up to begin")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.offWhite.opacity(0.7))
                }
                .padding(.bottom, PatinaSpacing.xl)
            }
            .gesture(
                DragGesture(minimumDistance: 50)
                    .onEnded { value in
                        // Swipe up detected (negative height = upward)
                        if value.translation.height < -50 {
                            viewModel.startWalk()
                        }
                    }
            )
        }
        .padding(.horizontal, PatinaSpacing.lg)
    }

    // MARK: - Starting Content

    private var startingContent: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Spacer()

            // Pulsing companion mark
            StrataMarkView(
                color: PatinaColors.clayBeige,
                scale: 1.5,
                breathing: true
            )

            Text("Preparing to observe...")
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.offWhite.opacity(0.8))

            Spacer()
        }
    }

    // MARK: - Walking Content

    private var walkingContent: some View {
        ZStack {
            // AR Camera View (or mock scanning if RoomPlan not available or in UI test mode)
            if RoomCaptureService.isSupported && !PatinaApp.useMockAR {
                RoomCaptureViewRepresentable(captureService: captureService)
                    .ignoresSafeArea()
            } else {
                // Mock scanning view for simulator/UI testing
                MockRoomScanView(
                    captureService: captureService,
                    narrationService: narrationService
                )
                .ignoresSafeArea()
            }

            // UI Overlay
            VStack(spacing: 0) {
                // Top bar
                topBar
                    .padding(.horizontal, PatinaSpacing.lg)
                    .padding(.top, PatinaSpacing.lg)

                Spacer()

                // Narration overlay (from narration service)
                if let narration = narrationService.currentNarration {
                    narrationOverlay(narration)
                        .padding(.bottom, PatinaSpacing.xxxl)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                } else if viewModel.currentNarration != nil {
                    // Fallback to viewModel narration
                    WalkNarrationOverlay(
                        narration: viewModel.currentNarration,
                        isThinking: viewModel.isThinking
                    )
                    .padding(.bottom, PatinaSpacing.xxxl)
                }

                // Organic water-fill progress indicator
                WalkProgressView(
                    coveragePercentage: captureService.coverageResult?.overallCoverage ?? captureService.scanProgress,
                    displayPhase: captureService.coverageResult?.displayPhase ?? .beginning
                )
                .padding(.bottom, PatinaSpacing.xl)

                // Bottom companion mark
                StrataMarkView(
                    color: PatinaColors.clayBeige.opacity(0.8),
                    scale: 0.6,
                    breathing: true
                )
                .padding(.bottom, PatinaSpacing.xl)
            }

            // Question overlay (when applicable)
            WalkQuestionOverlay(
                question: currentQuestion,
                onAnswer: { answer in
                    handleQuestionAnswer(answer)
                },
                onDismiss: {
                    handleQuestionIgnored()
                }
            )
        }
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

    // MARK: - Narration Overlay

    private func narrationOverlay(_ text: String) -> some View {
        VStack(spacing: PatinaSpacing.sm) {
            Text(text)
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.offWhite)
                .multilineTextAlignment(.center)
                .padding(.horizontal, PatinaSpacing.xl)
                .padding(.vertical, PatinaSpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .fill(Color.black.opacity(0.6))
                )
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
                syncError = "Camera permission is required for room scanning"
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

                // Store for sync
                lastScanData = roomData
                lastStyleSignals = finalSignals

                // Notify first launch coordinator
                firstLaunchCoordinator?.completeWalk(
                    roomData: roomData,
                    styleSignals: finalSignals
                )

                // Sync to Supabase in background
                Task {
                    await syncRoomScan(roomData: roomData, styleSignals: finalSignals)
                }
            }

            viewModel.completeWalk()
        }
    }

    // MARK: - Sync to Supabase

    private func syncRoomScan(roomData: FirstWalkRoomData, styleSignals: FirstWalkStyleSignals) async {
        isSyncing = true
        syncError = nil

        // Export USDZ model if available
        let usdzData = await captureService.exportUSDZ()

        do {
            // Try immediate upload first
            let remoteScanId = try await RoomScanSyncService.shared.uploadRoomScan(
                roomData: roomData,
                styleSignals: styleSignals,
                thumbnail: nil,
                projectId: nil
            )

            isSyncing = false
            print("Room scan synced successfully with ID: \(remoteScanId)")
        } catch {
            isSyncing = false
            syncError = error.localizedDescription
            print("Failed to sync room scan: \(error)")

            // Queue persistently for later retry (survives app restart)
            do {
                try await RoomScanSyncService.shared.queueUploadPersistent(
                    roomData: roomData,
                    styleSignals: styleSignals,
                    usdzData: usdzData,
                    thumbnailData: nil
                )
                print("Queued room scan for later sync")
            } catch {
                print("Failed to queue room scan: \(error)")
            }
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

        // Store for sync
        lastScanData = roomData
        lastStyleSignals = styleSignals

        // Notify first launch coordinator
        firstLaunchCoordinator?.completeWalk(
            roomData: roomData,
            styleSignals: styleSignals
        )

        // Sync to Supabase in background
        Task {
            await syncRoomScan(roomData: roomData, styleSignals: styleSignals)
        }

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

    // MARK: - Wall Detection Overlay

    private var wallDetectionOverlay: some View {
        ZStack {
            // Dashed rectangle representing wall detection
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(
                    style: StrokeStyle(
                        lineWidth: 2,
                        dash: [8, 8]
                    )
                )
                .foregroundColor(PatinaColors.clayBeige.opacity(0.4))
                .frame(height: 200)

            // Corner markers
            VStack {
                HStack {
                    cornerMarker(rotation: 0)
                    Spacer()
                    cornerMarker(rotation: 90)
                }
                Spacer()
                HStack {
                    cornerMarker(rotation: -90)
                    Spacer()
                    cornerMarker(rotation: 180)
                }
            }
            .padding(PatinaSpacing.md)
            .frame(height: 200)

            // Scanning hint
            VStack(spacing: PatinaSpacing.sm) {
                Image(systemName: "viewfinder")
                    .font(.system(size: 24))
                    .foregroundColor(PatinaColors.clayBeige.opacity(0.6))

                Text("Point at a wall")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.offWhite.opacity(0.5))
            }
        }
    }

    private func cornerMarker(rotation: Double) -> some View {
        Image(systemName: "viewfinder.trianglebadge.exclamationmark")
            .font(.system(size: 16))
            .foregroundColor(PatinaColors.clayBeige.opacity(0.6))
            .rotationEffect(.degrees(rotation))
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            // Close button
            Button {
                viewModel.reset()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white)
                    .padding(PatinaSpacing.sm)
                    .background(Circle().fill(Color.white.opacity(0.15)))
            }

            Spacer()

            // Pause/Resume button
            Button {
                if viewModel.state == .paused {
                    viewModel.resumeWalk()
                } else {
                    viewModel.pauseWalk()
                }
            } label: {
                Image(systemName: viewModel.state == .paused ? "play.fill" : "pause.fill")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                    .padding(PatinaSpacing.sm)
                    .background(Circle().fill(Color.white.opacity(0.15)))
            }
        }
    }

    // MARK: - Completed Content

    private var completedContent: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Spacer()

            // Success animation
            StrataMarkView(
                color: PatinaColors.clayBeige,
                scale: 1.5,
                breathing: true
            )

            VStack(spacing: PatinaSpacing.md) {
                Text("Walk Complete")
                    .font(PatinaTypography.h2)
                    .foregroundColor(PatinaColors.offWhite)

                Text("I've observed your space.\nSomething may emerge from what I've seen.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.offWhite.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)

                // Sync status indicator
                syncStatusView
            }

            Spacer()

            // Actions
            VStack(spacing: PatinaSpacing.md) {
                PatinaButton("See What Emerged", style: .primary) {
                    // Would navigate to Emergence
                    dismiss()
                }

                Button {
                    viewModel.reset()
                    lastScanData = nil
                    lastStyleSignals = nil
                    syncError = nil
                } label: {
                    Text("Walk Again")
                        .font(PatinaTypography.body)
                        .foregroundColor(PatinaColors.offWhite.opacity(0.6))
                }
            }
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.xxxl)
        }
    }

    // MARK: - Sync Status View

    @ViewBuilder
    private var syncStatusView: some View {
        HStack(spacing: PatinaSpacing.sm) {
            if isSyncing {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: PatinaColors.clayBeige))
                    .scaleEffect(0.8)
                Text("Saving to cloud...")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.offWhite.opacity(0.6))
            } else if let error = syncError {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundColor(.orange)
                    .font(.system(size: 14))
                Text("Saved locally")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.offWhite.opacity(0.6))

                Button {
                    // Retry sync
                    if let data = lastScanData, let signals = lastStyleSignals {
                        Task {
                            await syncRoomScan(roomData: data, styleSignals: signals)
                        }
                    }
                } label: {
                    Text("Retry")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.clayBeige)
                }
            } else if lastScanData != nil {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                    .font(.system(size: 14))
                Text("Saved to cloud")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.offWhite.opacity(0.6))
            }
        }
        .padding(.top, PatinaSpacing.sm)
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
